"""
Classification metrics for the plume / no-plume model.

Pure NumPy and dependency-free on purpose: these are the numbers the pitch
reports, so they should be auditable without a training stack installed.

The dataset is deliberately imbalanced (build_dataset.py writes NEG_PER_POS
negatives per plume), so accuracy is close to meaningless here - a model that
answers "no plume" every time scores 75% at the default 3:1 ratio. Precision,
recall and F1 on the plume class are the honest summary.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np


@dataclass
class Scores:
    threshold: float
    precision: float
    recall: float
    f1: float
    tp: int
    fp: int
    fn: int
    tn: int

    @property
    def support(self) -> int:
        """Number of real plumes in the evaluated set."""
        return self.tp + self.fn

    def as_dict(self) -> dict:
        return {**asdict(self), "support": self.support}

    def __str__(self) -> str:
        return (
            f"threshold={self.threshold:.2f}  "
            f"P={self.precision:.3f}  R={self.recall:.3f}  F1={self.f1:.3f}  "
            f"(tp={self.tp} fp={self.fp} fn={self.fn} tn={self.tn})"
        )


def score_at(y_true: np.ndarray, y_prob: np.ndarray, threshold: float) -> Scores:
    """Precision / recall / F1 for the plume class at one decision threshold."""
    y_true = np.asarray(y_true).astype(bool).ravel()
    pred = np.asarray(y_prob).ravel() >= threshold

    tp = int(np.sum(pred & y_true))
    fp = int(np.sum(pred & ~y_true))
    fn = int(np.sum(~pred & y_true))
    tn = int(np.sum(~pred & ~y_true))

    # A model that predicts nothing has undefined precision; report 0 rather
    # than NaN so the numbers stay sortable and JSON-serialisable.
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall)
        else 0.0
    )
    return Scores(threshold, precision, recall, f1, tp, fp, fn, tn)


def best_threshold(
    y_true: np.ndarray, y_prob: np.ndarray, steps: int = 101
) -> Scores:
    """
    The threshold maximising F1.

    Pick this on validation, never on test - choosing it on test is how a
    hackathon model ends up reporting a number it cannot reproduce.
    """
    grid = np.linspace(0.0, 1.0, steps)
    return max((score_at(y_true, y_prob, t) for t in grid), key=lambda s: s.f1)


def average_precision(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    """
    Area under the precision-recall curve, computed the step-wise way
    (sum of precision at each threshold weighted by the gain in recall).

    More informative than ROC-AUC on an imbalanced set like this one.
    """
    y_true = np.asarray(y_true).astype(bool).ravel()
    y_prob = np.asarray(y_prob).ravel()
    if y_true.sum() == 0:
        return 0.0

    order = np.argsort(-y_prob)
    hits = y_true[order]
    tp = np.cumsum(hits)
    precision = tp / np.arange(1, len(hits) + 1)
    # Recall gain is 1/P at each true positive, 0 elsewhere.
    return float(np.sum(precision * hits) / y_true.sum())


def report(y_true: np.ndarray, y_prob: np.ndarray, threshold: float) -> dict:
    """Everything worth printing about one evaluated split."""
    s = score_at(y_true, y_prob, threshold)
    return {
        **s.as_dict(),
        "average_precision": average_precision(y_true, y_prob),
        "n": int(np.asarray(y_true).size),
    }
