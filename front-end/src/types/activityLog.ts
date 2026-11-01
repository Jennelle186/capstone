export interface ActivityLogItem {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  school_year_id: string | null;
  actor_user_id: string | null;
  actor_clerk_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

export interface ActivityLogListResponse {
  items: ActivityLogItem[];
  total: number;
}

/** Keep in sync with ENTITY_TYPES in backend/app/services/activity_log.py. */
export const ACTIVITY_ENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: "adviser", label: "Advisers" },
  { value: "adviser_invitation", label: "Adviser invitations" },
  { value: "admin", label: "Administrators" },
  { value: "user_role", label: "User roles" },
  { value: "department", label: "Academic programs" },
  { value: "school_year", label: "School years" },
  { value: "document_type", label: "Document types" },
  { value: "requirement", label: "Requirements" },
  { value: "requirement_slot", label: "Requirement slots" },
  { value: "extraction_schema", label: "Extraction schemas" },
  { value: "form", label: "Forms" },
  { value: "branding", label: "Branding" },
  { value: "analytics_dimension", label: "Analytics dimensions" },
  { value: "gcs_cleanup", label: "Storage cleanup" },
  { value: "activity_log", label: "Activity log deletions" },
  { value: "activity_log_settings", label: "Activity log retention" },
];

/** Action verbs the backend records. Keep in sync with the record_activity calls. */
export const ACTIVITY_ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "create", label: "Created" },
  { value: "update", label: "Updated" },
  { value: "delete", label: "Deleted" },
  { value: "activate", label: "Activated" },
  { value: "deactivate", label: "Deactivated" },
  { value: "invite", label: "Invited" },
  { value: "revoke", label: "Revoked" },
  { value: "promote", label: "Promoted" },
  { value: "remove", label: "Removed" },
  { value: "assign", label: "Assigned" },
  { value: "sync", label: "Synced" },
  { value: "purge", label: "Purged" },
  { value: "admin_invite", label: "Admin invited" },
  { value: "admin_promote", label: "Admin promoted" },
  { value: "admin_remove", label: "Admin removed" },
  { value: "close", label: "Closed" },
  { value: "reopen", label: "Reopened" },
  { value: "rollover", label: "Rolled over" },
  { value: "reassign_program", label: "Program reassigned" },
];

export const ACTIVITY_PAGE_SIZE = 25;
