"""Tracked classification evaluator (plan, Section 4) — run manually.

Classifies each file listed in ``test/labels.json`` through the live Vertex AI
pipeline (no GCS upload; ``classify_page_bytes``) using the ACTIVE document
types in the database, then reports accuracy, micro/macro/weighted F1, a
confusion matrix, and the financial-record slot accuracy (CERT_INDIGEN | ITR).

Ground truth comes ONLY from ``test/labels.json``; ``document_type: "NONE"``
asserts the classifier must NOT force a match (non-misclassification).

Usage (captures LLM telemetry for the report too)::

    python -m analysis.run_classification_eval 2> backend/llm_calls.log

Writing a new eval_report.json which the report CLI consumes via
``--classification backend/eval_report.json``.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import DocumentType, DocumentTypeStatus
from app.services.gcp_pipeline import classify_page_bytes

from .classifiers import score_classification

NONE_CLASS = "NONE"


def _normalise(code: str | None) -> str:
    return (code or "").strip().upper()


async def _load_document_types() -> list[DocumentType]:
    async with AsyncSessionLocal() as session:
        rows = list(
            (
                await session.execute(
                    select(DocumentType).where(DocumentType.status == DocumentTypeStatus.ACTIVE)
                )
            ).scalars().all()
        )
    return rows


def _load_labels(labels_path: Path) -> tuple[list[dict], list[str]]:
    data = json.loads(labels_path.read_text(encoding="utf-8"))
    group = list(data.get("financial_record_group") or [])
    return list(data.get("samples", [])), group


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--labels", default="test/labels.json")
    parser.add_argument("--test-dir", default="test")
    parser.add_argument("--out", default="backend/eval_report.json")
    args = parser.parse_args(argv)

    labels_path = Path(args.labels)
    test_dir = Path(args.test_dir)
    document_types = asyncio.run(_load_document_types())
    codes = [dt.code for dt in document_types]
    samples, financial_group = _load_labels(labels_path)
    print(f"Active doc types: {', '.join(codes)}")
    print(f"Ground truth: {labels_path} ({len(samples)} samples)")

    classes = codes + [NONE_CLASS]
    actual: list[str] = []
    predicted: list[str] = []
    results: list[dict] = []

    for sample in samples:
        filename = str(sample.get("file"))
        path = test_dir / filename
        if not path.exists():
            print(f"WARN: missing file {path}", file=sys.stderr)
            continue
        expected = _normalise(sample.get("document_type")) or NONE_CLASS
        data = path.read_bytes()
        start = time.perf_counter()
        try:
            match = classify_page_bytes(data, "application/pdf", document_types)
            pred_code = _normalise(match.type_code) if match else None
            confidence = match.confidence if match else None
            error = None
        except Exception as exc:  # noqa: BLE001
            pred_code = None
            confidence = None
            error = str(exc)
        if pred_code not in codes:
            pred_code = NONE_CLASS
        latency = round(time.perf_counter() - start, 3)

        # Slot lenience: either member of the financial group counts as correct.
        comparison_pred = pred_code
        if expected in financial_group and pred_code in financial_group:
            comparison_pred = expected

        actual.append(expected)
        predicted.append(comparison_pred)
        results.append(
            {
                "file": filename,
                "expected": expected,
                "predicted": pred_code,
                "confidence": confidence,
                "latency_seconds": latency,
                "error": error,
            }
        )
        print(
            f"  {filename}\n"
            f"    expected={expected}  predicted={pred_code}  "
            f"confidence={confidence if confidence is not None else 'ERR'}  latency={latency}s"
        )

    metrics = score_classification(actual, predicted, classes)

    fin_rows = [r for r in results if r["expected"] in financial_group]
    if fin_rows:
        fin_correct = sum(1 for r in fin_rows if r["predicted"] in financial_group)
        metrics["financial_record_slot_accuracy"] = round(
            fin_correct / len(fin_rows), 4
        )
        metrics["financial_record_slot_correct"] = fin_correct
        metrics["financial_record_group"] = financial_group
    else:
        metrics["financial_record_slot_accuracy"] = None

    metrics["results"] = results
    metrics["ground_truth_file"] = str(labels_path)

    out = Path(args.out)
    out.write_text(json.dumps(metrics, indent=2, ensure_ascii=False))
    print("\nPer-class metrics:")
    for c, m in (metrics["per_class"] or {}).items():
        print(
            f"  {c:<16} support={m['support']:<4} P={m['precision']:<6} "
            f"R={m['recall']:<6} F1={m['f1']}"
        )
    print(
        f"\nAccuracy={metrics['accuracy']}  Micro F1={metrics['micro_f1']}  "
        f"Macro F1={metrics['macro_f1']}  Weighted F1={metrics['weighted_f1']}  "
        f"n={metrics['total']}"
    )
    if metrics.get("financial_record_slot_accuracy") is not None:
        print(
            f"Financial-record slot accuracy={metrics['financial_record_slot_accuracy']} "
            f"({metrics.get('financial_record_slot_correct')}/{len(fin_rows)})"
        )
    print(f"Report written to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())