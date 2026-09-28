"""FURPS metrics report generator (plan, Section 8 and Chapter-4 source-of-truth).

Merges whatever result artifacts exist on disk and emits a single Markdown
report (plus a raw-numbers JSON) structured by FURPS category for the thesis.

Usage::

    python -m analysis.report \\
        --classification backend/eval_report.json \\
        --llm backend/llm_calls.log \\
        --labels test/labels.json --extraction backend/test_output/extraction_results.json \\
        --jobs backend/test_output/jobs.json --probes backend/test_output/probes.json \\
        --perf backend/test_output/locust.json \\
        --out docs/test-results/metrics-report.md

Missing inputs render explicit ``no data`` rows (never invented numbers).
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from . import extraction as extraction_metrics
from . import perf as perf_metrics
from .llm import summarise_llm
from .perf import job_summary, read_json_array, read_json_lines, summarise_samples


def _fmt(value: object, digits: int = 4) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def load_json(path_args: list[str]) -> list[tuple[str, object]]:
    results: list[tuple[str, object]] = []
    for raw in path_args:
        path = Path(raw)
        if not path.exists():
            continue
        with open(path, "r", encoding="utf-8") as fh:
            results.append((path.name, json.load(fh)))
    return results


def _collect_extraction(labels_path: Path | None, extraction_paths: list[str]) -> list[dict]:
    """Join extraction results rows with ground truth from labels.json (by file+field)."""
    labels: dict[str, dict[str, str]] = {}
    if labels_path and labels_path.exists():
        with open(labels_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        for sample in data.get("samples", []):
            labels[str(sample.get("file"))] = dict(sample.get("expected_fields") or {})

    rows: list[dict] = []
    for raw in extraction_paths:
        path = Path(raw)
        if not path.exists():
            continue
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        items = data if isinstance(data, list) else data.get("results", [])
        for item in items:
            field = str(item.get("field"))
            expected = item.get("expected")
            file_name = item.get("file")
            if expected is None and file_name in labels and field in labels[file_name]:
                expected = labels[file_name][field]
            rows.append(
                {
                    "file": file_name,
                    "field": field,
                    "expected": expected,
                    "predicted": item.get("predicted"),
                    "confidence": item.get("confidence"),
                }
            )
    return rows


def render_markdown(
    metrics: dict,
    missing: list[str],
    meta: dict,
) -> str:
    out: list[str] = []
    out.append("# FURPS Metrics Report")
    out.append("")
    out.append(
        f"- Generated: {meta.get('timestamp', datetime.now(timezone.utc).isoformat())}"
    )
    out.append(f"- Inputs present: {', '.join(meta.get('present', [])) or 'none'}")
    if missing:
        out.append(f"- Missing inputs (no data rows below): {', '.join(missing)}")
    out.append("")
    out.append("## Data completeness")
    out.append("")
    out.append("| Input | Status |")
    out.append("|---|---|")
    for name in meta["inputs"]:
        out.append(f"| `{name}` | {'present' if name in meta.get('present', []) else 'no data'} |")
    out.append("")

    # ── F(AI): classification ───────────────────────────────────────────────┐
    out.append("## F(AI) — Document classification (ground truth: test/labels.json)")
    out.append("")
    cls = metrics.get("classification")
    if cls is None:
        out.append("_No data — run `python -m analysis.run_classification_eval` first._")
    else:
        out.append("| Metric | Value |")
        out.append("|---|---|")
        out.append(f"| Documents evaluated (n) | {_fmt(cls.get('total'))} |")
        out.append(f"| Accuracy (strict) | {_fmt(cls.get('accuracy'))} ({cls.get('correct')}/{cls.get('total')}) |")
        out.append(f"| Micro F1 | {_fmt(cls.get('micro_f1'))} |")
        out.append(f"| Macro F1 | {_fmt(cls.get('macro_f1'))} |")
        out.append(f"| Weighted F1 | {_fmt(cls.get('weighted_f1'))} |")
        out.append(f"| Financial-record slot accuracy | {_fmt(cls.get('financial_record_slot_accuracy'))} |")
        out.append("")
        out.append("**Per-class**")
        out.append("")
        out.append("| Class | Support | Precision | Recall | F1 |")
        out.append("|---|---|---|---|---|")
        for c, m in (cls.get("per_class") or {}).items():
            out.append(
                f"| {c} | {m.get('support')} | {_fmt(m.get('precision'))} | "
                f"{_fmt(m.get('recall'))} | {_fmt(m.get('f1'))} |"
            )
        out.append("")

    # ── F(AI): extraction ────────────────────────────────────────────────────┐
    out.append("## F(AI) — Field extraction & calibration")
    out.append("")
    ext = metrics.get("extraction")
    if ext is None:
        out.append(
            "_No data — provide `--extraction <results.json>` and `--labels test/labels.json`. "
            "Fields without ground-truth values are excluded (never fabricated)._"
        )
        out.append("")
    else:
        ov = ext.get("overall") or {}
        out.append("| Metric | Value |")
        out.append("|---|---|")
        out.append(f"| Fields evaluated (n) | {_fmt(ov.get('count'))} |")
        out.append(f"| Fields with ground truth | {_fmt(ov.get('scored'))} |")
        out.append(f"| Exact-match EM | {_fmt(ov.get('exact_em'))} |")
        out.append(f"| Normalised EM | {_fmt(ov.get('normalised_em'))} |")
        out.append(f"| Ground truth available | {ov.get('ground_truth_available')} |")
        out.append(f"| Expected Calibration Error (ECE) | {_fmt(ext.get('ece'))} |")
        out.append(f"| Low-confidence routing | {_fmt(ext.get('low_confidence'))} |")
        out.append("")
        out.append("**Per-field EM**")
        out.append("")
        out.append("| Field | n | scored | Exact EM | Norm EM | No GT |")
        out.append("|---|---|---|---|---|---|")
        for f, m in (ext.get("per_field") or {}).items():
            out.append(
                f"| {f} | {m.get('count')} | {m.get('scored')} | {_fmt(m.get('exact_em'))} | "
                f"{_fmt(m.get('normalised_em'))} | {m.get('no_ground_truth')} |"
            )
        out.append("")

    # ── P / F-AI: LLM telemetry ──────────────────────────────────────────────┐
    out.append("## Performance — AI pipeline telemetry (llm_calls.log)")
    out.append("")
    llm = metrics.get("llm")
    if llm is None:
        out.append("_No data — provide `--llm <llm_calls.log>`._")
    else:
        out.append("| Metric | Value |")
        out.append("|---|---|")
        out.append(f"| Attempts | {llm.get('attempts')} |")
        out.append(f"| Successes | {llm.get('successes')} |")
        out.append(f"| Failure rate | {_fmt(llm.get('failure_rate'), 2)}% |")
        out.append(f"| 504 rate | {_fmt(llm.get('failed_504_rate'), 2)}% ({llm.get('failed_504')}) |")
        out.append(f"| 429 rate | {_fmt(llm.get('failed_429_rate'), 2)}% ({llm.get('failed_429')}) |")
        out.append(f"| Avg retry count | {_fmt(llm.get('avg_retry_count'), 3)} |")
        out.append(f"| Est. cost (USD) | {_fmt(llm.get('estimated_cost_usd'), 6)} |")
        out.append(f"| input / output tokens | {llm.get('total_input_tokens')} / {llm.get('total_output_tokens')} |")
        out.append("")
        out.append("**Per-stage latency (s)**")
        out.append("")
        out.append("| Stage | Calls | p50 | p95 | p99 | Mean | SD |")
        out.append("|---|---|---|---|---|---|---|")
        for stage, m in (llm.get("per_stage") or {}).items():
            lat = m.get("latency_s") or {}
            out.append(
                f"| {stage} | {m.get('calls')} | {_fmt(lat.get('p50'), 3)} | "
                f"{_fmt(lat.get('p95'), 3)} | {_fmt(lat.get('p99'), 3)} | "
                f"{_fmt(lat.get('mean'), 3)} | {_fmt(lat.get('std'), 3)} |"
            )
        out.append("")

    # ── Reliability ──────────────────────────────────────────────────────────┐
    out.append("## Reliability — jobs & availability")
    out.append("")
    jobs = metrics.get("jobs")
    if jobs is None:
        out.append("_No data — provide `--jobs <jobs_export.json>` (list of {status})._")
        out.append("")
    else:
        out.append("| Metric | Value |")
        out.append("|---|---|")
        out.append(f"| Jobs (n) | {jobs.get('total')} |")
        out.append(f"| Completion rate | {_fmt(jobs.get('completion_rate'))} |")
        out.append(f"| Failure rate | {_fmt(jobs.get('failure_rate'))} |")
        out.append(f"| By status | {jobs.get('statuses')} |")
        out.append("")
    if metrics.get("availability") is not None:
        out.append(f"**Availability:** {_fmt(metrics['availability'], 2)}%")
        out.append("")

    # ── Performance (generic samples) ────────────────────────────────────────┐
    out.append("## Performance — generic samples (Latency/upload/queue)")
    out.append("")
    perf = metrics.get("perf")
    if perf is None:
        out.append("_No data — provide `--perf <samples.json>` (dict of label → numeric array)._")
        out.append("")
    else:
        out.append("| Label | n | Mean | Median | Min | Max | SD | p50 | p95 | p99 |")
        out.append("|---|---|---|---|---|---|---|---|---|---|")
        for label, d in perf.items():
            pct = d.get("percentiles") or {}
            out.append(
                f"| {label} | {d.get('count')} | {_fmt(d.get('mean'), 3)} | "
                f"{_fmt(d.get('median'), 3)} | {_fmt(d.get('min'), 3)} | {_fmt(d.get('max'), 3)} | "
                f"{_fmt(d.get('std'), 3)} | {_fmt(pct.get('p50'), 3)} | "
                f"{_fmt(pct.get('p95'), 3)} | {_fmt(pct.get('p99'), 3)} |"
            )
        out.append("")

    # ── Usability / Supportability (deferred) ────────────────────────────────┐
    out.append("## Usability")
    out.append("")
    out.append(
        "_Deferred — survey/task instruments require human participants "
        "(plan Section 6). No automated substitute; missing by design._"
    )
    out.append("")
    out.append("## Supportability")
    out.append("")
    out.append(
        "_No runtime metric in this report — captured separately via static gates "
        "(`ruff`, `mypy`, ESLint, `tsc -b`), migration drills, and backup-restore drills._"
    )
    out.append("")
    return "\n".join(out)


def collect_metrics(inputs: dict) -> tuple[dict, list[str]]:
    """Aggregate available result artifacts into a metrics dict + missing list.

    ``inputs`` keys (each optional): classification <path>, labels <path>,
    extraction <list[str]>, llm <path>, jobs <path>, probes <path>,
    perf <list[str]>.
    """
    metrics: dict = {}
    missing: list[str] = []

    cls_path = inputs.get("classification")
    if cls_path and Path(cls_path).exists():
        with open(cls_path, "r", encoding="utf-8") as fh:
            metrics["classification"] = json.load(fh)
    else:
        missing.append("classification")

    extraction_paths = inputs.get("extraction") or []
    if extraction_paths:
        rows = _collect_extraction(inputs.get("labels"), extraction_paths)
        if rows:
            table = extraction_metrics.field_em_table(rows)
            aligned = [
                (
                    r["confidence"],
                    extraction_metrics.exact_match(r.get("predicted"), r.get("expected")),
                )
                for r in rows
                if r.get("confidence") is not None
                and not extraction_metrics._is_missing(r.get("expected"))
            ]
            table["ece"] = (
                extraction_metrics.ece([c for c, _ in aligned], [o for _, o in aligned])
                if aligned
                else None
            )
            metrics["extraction"] = table
        else:
            missing.append("extraction")
    else:
        missing.append("extraction")

    llm_path = inputs.get("llm")
    if llm_path and Path(llm_path).exists():
        events = [e for e in read_json_lines(llm_path) if e.get("event") == "llm_call"]
        metrics["llm"] = summarise_llm(events) if events else {"attempts": 0}
        if not events:
            missing.append("llm")
    else:
        missing.append("llm")

    jobs_path = inputs.get("jobs")
    if jobs_path and Path(jobs_path).exists():
        rows = read_json_array(jobs_path)
        if rows:
            metrics["jobs"] = job_summary(rows)
        else:
            missing.append("jobs")
    else:
        missing.append("jobs")

    probes_path = inputs.get("probes")
    if probes_path and Path(probes_path).exists():
        probes = read_json_array(probes_path)
        if probes:
            ok = sum(1 for p in probes if bool(p))
            metrics["availability"] = perf_metrics.availability(ok, len(probes))
        else:
            missing.append("probes")
    else:
        missing.append("probes")

    perf_paths = inputs.get("perf") or []
    if perf_paths:
        samples: dict[str, dict] = {}
        for raw in perf_paths:
            path = Path(raw)
            if not path.exists():
                continue
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, list):
                samples[path.name] = summarise_samples(data)
            elif isinstance(data, dict):
                for label, arr in data.items():
                    if isinstance(arr, list):
                        samples[f"{path.name}:{label}"] = summarise_samples(arr)
        if samples:
            metrics["perf"] = samples
        else:
            missing.append("perf")
    else:
        missing.append("perf")

    return metrics, sorted(set(missing))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--classification")
    parser.add_argument("--labels", default="test/labels.json")
    parser.add_argument("--extraction", action="append", default=[])
    parser.add_argument("--llm")
    parser.add_argument("--jobs")
    parser.add_argument("--probes")
    parser.add_argument("--perf", action="append", default=[])
    parser.add_argument("--out")
    args = parser.parse_args(argv)

    inputs = {
        "classification": args.classification,
        "labels": Path(args.labels) if args.labels else None,
        "extraction": args.extraction,
        "llm": args.llm,
        "jobs": args.jobs,
        "probes": args.probes,
        "perf": args.perf,
    }

    metrics, missing = collect_metrics(inputs)
    present = [
        name
        for name in ("classification", "extraction", "llm", "jobs", "probes", "perf")
        if name in metrics
    ]

    out_path = Path(args.out) if args.out else Path("docs/test-results/metrics-report.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    meta = {
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "inputs": ["classification", "labels", "extraction", "llm", "jobs", "probes", "perf"],
        "present": present,
    }
    markdown = render_markdown(metrics, missing, meta)
    out_path.write_text(markdown, encoding="utf-8")
    json_path = out_path.with_suffix(".json")
    json_path.write_text(
        json.dumps({"meta": meta, "missing": missing, "metrics": metrics}, indent=2),
        encoding="utf-8",
    )

    stats_summary = {
        k: v for k, v in metrics.get("llm", {}).items() if not isinstance(v, dict)
    } if "llm" in metrics else {}
    print(f"Wrote {out_path}")
    print(f"Wrote {json_path}")
    print(f"Present: {', '.join(present) or 'none'}; Missing: {', '.join(missing) or 'none'}")
    if stats_summary:
        print("LLM summary:", json.dumps(stats_summary, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())