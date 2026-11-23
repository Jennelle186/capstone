// Who flagged a document, and what to tell the student. An adviser's flag carries a comment in
// rejection_reason. A flag set by automatic checking carries only a code in classification_result.flag,
// so the student is told what the check found, not that an adviser flagged it.

const SYSTEM_FLAG_MESSAGES: Record<string, string> = {
  not_a_required_document: "The file could not be matched to a document needed for your school year.",
  low_confidence: "The file could not be confirmed as the document it was uploaded for.",
  slot_conflict: "The file matches a document already on file for another requirement.",
};

const FALLBACK_SYSTEM_MESSAGE = "The file could not be checked automatically. Upload the correct document.";

export interface FlagSource {
  rejection_reason?: string | null;
  classification_result?: Record<string, unknown> | null;
}

export interface FlagDetails {
  fromAdviser: boolean;
  message: string;
}

export function flagDetails(submission: FlagSource): FlagDetails {
  const comment = submission.rejection_reason?.trim();
  if (comment) return { fromAdviser: true, message: comment };

  const code = submission.classification_result?.flag;
  const message = (typeof code === "string" && SYSTEM_FLAG_MESSAGES[code]) || FALLBACK_SYSTEM_MESSAGE;
  return { fromAdviser: false, message };
}
