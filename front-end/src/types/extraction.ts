export interface ExtractedField {
  id: string;
  label: string;
  value: string;
  needsReview: boolean;
}

export type ExtractionConfidence = "high" | "medium" | "low" | "needs-review";

export interface ExtractionItem {
  id: string;
  fileName: string;
  documentTypeName: string;
  confidenceLabel: ExtractionConfidence;
  needsReview: boolean;
  fields: ExtractedField[];
}
