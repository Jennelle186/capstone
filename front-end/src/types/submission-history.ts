export interface SubmissionHistoryEntry {
  id: string;
  action: string;
  actor_name: string | null;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  reference_submission_id: string | null;
  created_at: string;
}

export const SYSTEM_ACTIONS = ["PROCESSING", "CLASSIFIED"];

export const ACTION_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  PROCESSING: "Processing",
  CLASSIFIED: "Classified",
  VERIFIED: "Verified",
  FLAGGED: "Flagged",
  REUPLOADED: "Re-uploaded",
  REPLACEMENT_OF: "Resubmitted by Student",
  IN_REVIEW: "In Review",
};

export function formatHistoryTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
