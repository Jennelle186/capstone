export type ClassificationStatus = "pending" | "classified" | "needs-review" | "overridden";

export interface ClassificationItem {
  id: string;
  fileName: string;
  fileSize: number;
  documentTypeName: string | null;
  documentTypeId: string | null;
  confidence: number | null;
  needsReview: boolean;
  isCompiledPdf: boolean;
  status: ClassificationStatus;
  previewUrl?: string;
}
