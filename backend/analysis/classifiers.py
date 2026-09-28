"""Classification metrics (testing plan, Section 4): P/R/F1, F1 variants, accuracy.

Pure functions. ``classes`` must include every expected value; the caller is
responsible for mapping a "no match / error" outcome onto an explicit class
(e.g. ``"NONE"``), mirroring the classification evaluator's behaviour.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence


def _f1(precision: float, recall: float) -> float:
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def confusion_matrix(
    actual: Sequence[str],
    predicted: Sequence[str],
    classes: Sequence[str],
) -> dict[str, dict[str, int]]:
    """Rows = actual, columns = predicted. Unknown predicted values are ignored."""
    classes = list(classes)
    matrix = {a: {p: 0 for p in classes} for a in classes}
    for a, p in zip(actual, predicted):
        if a not in matrix or p not in matrix[a]:
            continue
        matrix[a][p] += 1
    return matrix


def per_class_metrics(
    matrix: Mapping[str, Mapping[str, int]],
    classes: Sequence[str],
) -> dict[str, dict]:
    """Per-class support / precision / recall / F1."""
    out: dict[str, dict] = {}
    for c in classes:
        tp = matrix[c][c]
        fp = sum(matrix[a][c] for a in classes if a != c)
        fn = sum(matrix[c][p] for p in classes if p != c)
        support = sum(matrix[c].values())
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        out[c] = {
            "support": support,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(_f1(precision, recall), 4),
        }
    return out


def micro_f1(matrix: Mapping[str, Mapping[str, int]], classes: Sequence[str]) -> float:
    """Micro F1 = total TP / (total TP + total FP); in a square confusion matrix
    this equals overall accuracy."""
    tp = sum(matrix[c][c] for c in classes)
    fp = sum(matrix[a][c] for a in classes for c in classes if a != c)
    precision = tp / (tp + fp) if tp + fp else 0.0
    return round(_f1(precision, precision), 4)


def macro_f1(per_class: Mapping[str, Mapping[str, float | int]]) -> float:
    """Unweighted mean F1 over classes that have at least one example."""
    supported = [m["f1"] for m in per_class.values() if m["support"] > 0]
    return round(sum(supported) / len(supported), 4) if supported else 0.0


def weighted_f1(per_class: Mapping[str, Mapping[str, float | int]]) -> float:
    total = sum(m["support"] for m in per_class.values())
    if total <= 0:
        return 0.0
    numerator = sum(float(m["f1"]) * int(m["support"]) for m in per_class.values())
    return round(numerator / total, 4)


def accuracy(correct: int, total: int) -> float:
    return round(correct / total, 4) if total else 0.0


def score_classification(
    actual: Sequence[str],
    predicted: Sequence[str],
    classes: Sequence[str],
) -> dict:
    """One-shot evaluator of the classification metrics block. Returns the full
    metric set a report needs, matching the ``eval_report.json`` schema."""
    matrix = confusion_matrix(actual, predicted, classes)
    per_class = per_class_metrics(matrix, classes)
    total = sum(m["support"] for m in per_class.values())
    correct = sum(matrix[c][c] for c in classes)
    return {
        "accuracy": accuracy(correct, total),
        "correct": correct,
        "total": total,
        "micro_f1": micro_f1(matrix, classes),
        "macro_f1": macro_f1(per_class),
        "weighted_f1": weighted_f1(per_class),
        "per_class": per_class,
        "confusion_matrix": {a: dict(row) for a, row in matrix.items()},
    }