export type ClassificationStatus =
  | "pending"
  | "processing"
  | "classified"
  | "needs-review"
  | "overridden"
  | "flagged"
  | "submitted"
  | "verified";

export interface ClassificationResult {
  type?: string | null;
  confidence?: number | null;
  reasoning?: string | null;
  source?: "keyword" | "bedrock" | null;
  flag?: string | null;
  extracted_text_length?: number | null;
}

export interface ClassificationItem {
  id: string;
  fileName: string;
  fileSize: number | null;
  documentTypeName: string | null;
  documentTypeId: string | null;
  confidence: number | null;
  needsReview: boolean;
  isCompiledPdf: boolean;
  status: ClassificationStatus;
  originalStatus?: string;
  previewUrl?: string;
  classificationResult?: ClassificationResult | null;
  mimeType?: string | null;
}