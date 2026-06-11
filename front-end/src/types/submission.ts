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
