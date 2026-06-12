export type SubmissionCardStatus = "ready" | "needs-review" | "pending";

export interface SubmissionItem {
  id: string;
  fileName: string;
  documentType: string;
  fileSize: number;
  thumbnailUrl?: string;
  status: SubmissionCardStatus;
  issues?: string;
}

export interface DocumentUploadResponse {
  id: string;
  status: string;
  file_key: string;
  original_filename: string;
  is_compiled: boolean;
}
