from ..models import SubmissionStatus

CLASSIFICATION_COMPLETE_STATUSES = {
    SubmissionStatus.CLASSIFIED,
    SubmissionStatus.FLAGGED,
}


def is_classification_complete(submissions: list) -> bool:
    """All documents have been processed by AI.

    Flagged counts as "complete" — AI finished running,
    human review may still be needed.
    """
    if not submissions:
        return False
    return all(s.status in CLASSIFICATION_COMPLETE_STATUSES for s in submissions)
