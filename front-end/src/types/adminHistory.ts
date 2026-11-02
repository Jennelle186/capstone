export type AdminHistoryEventType = "invited" | "accepted" | "revoked" | "promoted" | "demoted" | "removed";

export type AdminHistoryStatus = "admin" | "invited" | "revoked" | "demoted" | "removed";

export interface AdminHistoryEvent {
  type: AdminHistoryEventType;
  at: string;
  actor_name: string | null;
}

export interface AdminHistoryPerson {
  email: string | null;
  name: string | null;
  status: AdminHistoryStatus;
  events: AdminHistoryEvent[];
}

export const ADMIN_HISTORY_EVENT_LABELS: Record<AdminHistoryEventType, string> = {
  invited: "Invited",
  accepted: "Accepted invitation",
  revoked: "Invitation revoked",
  promoted: "Promoted to administrator",
  demoted: "Returned to adviser role",
  removed: "Administrator access removed",
};

export const ADMIN_HISTORY_STATUS_LABELS: Record<AdminHistoryStatus, string> = {
  admin: "Current administrator",
  invited: "Invitation pending",
  revoked: "Invitation revoked",
  demoted: "Adviser (no longer an administrator)",
  removed: "No longer an administrator",
};
