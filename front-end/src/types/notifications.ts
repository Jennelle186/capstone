export type NotificationType = "DOCUMENT_VERIFIED" | "DOCUMENT_FLAGGED";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface UnreadCount {
  count: number;
}
