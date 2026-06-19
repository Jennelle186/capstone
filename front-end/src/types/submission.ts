export type SubmissionCardStatus = "ready" | "needs-review" | "pending" | "submitted";

export interface SubmissionItem {
  id: string;
  fileName: string;
  documentType: string;
  fileSize: number;
  thumbnailUrl?: string;
  status: SubmissionCardStatus;
  confidence?: number;
  issues?: string;
}

export interface InitiateUploadResponse {
  submission_id: string;
  url: string;
  fields: Record<string, string>;
  key: string;
}

export interface ConfirmUploadResponse {
  id: string;
  status: string;
  file_key: string;
  original_filename: string;
  is_compiled: boolean;
}

export interface SubmissionDetail {
  id: string;
  status: string;
  file_key: string;
  original_filename: string;
  file_size: string | null;
  mime_type: string | null;
  is_compiled: boolean;
  document_type_id: string | null;
  document_type_name: string | null;
  classification_result: Record<string, unknown> | null;
  llama_job_id: string | null;
  created_at: string;
}

export interface DownloadUrlResponse {
  // Presigned GET URL that can be used in an iframe or img tag for preview.
  url: string;
  // Number of seconds until the URL expires.
  expires_in: number;
}
