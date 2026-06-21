export type ReviewStatus = "submitted" | "in-review" | "verified" | "flagged";

export interface ReviewDeskStats {
  total: number;
  verified: number;
  flagged: number;
  pending: number;
}

export interface ExtractionFieldRaw {
  id: string;
  key: string;
  type: string;
  description: string;
  required: boolean;
  value: string;
  confidence: number;
  needs_review: boolean;
  ui_component: string | null;
  options: { value: string; label: string }[] | null;
  section_title: string | null;
}

export interface ExtractionItemRaw {
  submission_id: string;
  classification_result: Record<string, unknown> | null;
  fields: ExtractionFieldRaw[];
}
