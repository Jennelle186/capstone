"""Field-level extraction metrics & confidence calibration (plan, Section 4).

Ground truth comes from ``test/labels.json`` (``expected_fields`` per file);
results come from the live extraction pipeline. A field whose ground-truth
value is absent/blank is excluded from scoring and flagged with
``ground_truth_available: false`` so reports never present fabricated numbers.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence

MIN_CONFIDENCE = 0.0
MAX_CONFIDENCE = 1.0


def _is_missing(value: object) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def normalise(value: object) -> str:
    """Case-fold + strip + collapse internal whitespace (normalised match mode)."""
    return " ".join(str(value).strip().casefold().split())


def exact_match(
    predicted: object,
    expected: object,
    normalise_values: bool = False,
) -> bool:
    """Strict string equality by default; ``normalise_values=True`` compares
    case-folded, whitespace-collapsed values."""
    if predicted is None and expected is None:
        return True
    if predicted is None or expected is None:
        return False
    if normalise_values:
        return normalise(predicted) == normalise(expected)
    return str(predicted) == str(expected)


def field_em_table(results: Sequence[Mapping]) -> dict:
    """Aggregate per-field + overall Exact-Match across extraction results.

    ``results``: list of dicts with keys ``file``, ``field``, ``expected``,
    ``predicted``, ``confidence``.
    Returns per-field metrics and an ``overall`` block; fields without usable
    ground truth are counted separately (``no_ground_truth``).
    """
    per_field: dict[str, dict] = {}
    for row in results:
        field = row.get("field") or "?"
        entry = per_field.setdefault(
            field, {"count": 0, "scored": 0, "exact_em": 0, "normalised_em": 0, "no_ground_truth": 0}
        )
        expected = row.get("expected")
        if _is_missing(expected):
            entry["no_ground_truth"] += 1
            entry["count"] += 1
            continue
        entry["count"] += 1
        entry["scored"] += 1
        if exact_match(row.get("predicted"), expected, normalise_values=False):
            entry["exact_em"] += 1
        if exact_match(row.get("predicted"), expected, normalise_values=True):
            entry["normalised_em"] += 1

    overall = {"count": 0, "scored": 0, "exact_em": 0, "normalised_em": 0, "no_ground_truth": 0}
    for entry in per_field.values():
        for key in overall:
            overall[key] += entry[key]

    def _summarise(entry: Mapping[str, int]) -> dict:
        return {
            "count": entry["count"],
            "scored": entry["scored"],
            "exact_em": round(entry["exact_em"] / entry["scored"], 4) if entry["scored"] else None,
            "normalised_em": round(entry["normalised_em"] / entry["scored"], 4)
            if entry["scored"]
            else None,
            "ground_truth_available": entry["scored"] > 0,
            "no_ground_truth": entry["no_ground_truth"],
        }

    return {
        "per_field": {f: _summarise(e) for f, e in per_field.items()},
        "overall": _summarise(overall),
    }


def ece(
    confidences: Sequence[float],
    correct: Sequence[bool],
    bins: int = 10,
) -> float | None:
    """Expected Calibration Error over ``bins`` confidence bins. ``None`` if no data.

    ``correct[i]`` marks whether the ``i``-th prediction matched ground truth.
    Target from the plan: ECE <= 0.10.
    """
    pairs = [
        (float(c), bool(o))
        for c, o in zip(confidences, correct)
        if c is not None and MIN_CONFIDENCE <= float(c) <= MAX_CONFIDENCE
    ]
    if not pairs or bins <= 0:
        return None
    n = len(pairs)
    error = 0.0
    for b in range(bins):
        lo = b / bins
        hi = (b + 1) / bins
        members = [p for p in pairs if lo <= p[0] < hi or (b == bins - 1 and p[0] == hi)]
        if not members:
            continue
        accuracy = sum(1 for _, ok in members if ok) / len(members)
        confidence = sum(c for c, _ in members) / len(members)
        error += len(members) / n * abs(accuracy - confidence)
    return round(error, 6)


def low_confidence_routing(
    confidences: Sequence[float],
    needs_review: Sequence[bool],
    threshold: float = 0.6,
) -> dict | None:
    """Recall/precision of the "route to human review" decision for low-confidence.

    ``needs_review`` is the ground-truth label (from document-quality metadata).
    Returns ``None`` when no ground truth is provided or no confidences exist.
    ``recall`` = flagged & needs-review / needs-review; ``precision`` =
    flagged & needs-review / flagged.
    """
    labelled = [
        (float(c), bool(n))
        for c, n in zip(confidences, needs_review)
        if c is not None and n is not None
    ]
    if len(labelled) != len(confidences) or not labelled:
        return None
    flagged = sum(1 for c, _ in labelled if c < threshold)
    need = sum(1 for _, n in labelled if n)
    flagged_and_need = sum(1 for c, n in labelled if c < threshold and n)
    return {
        "count": len(labelled),
        "count_flagged": flagged,
        "count_needs_review": need,
        "recall": round(flagged_and_need / need, 4) if need else None,
        "precision": round(flagged_and_need / flagged, 4) if flagged else None,
    }