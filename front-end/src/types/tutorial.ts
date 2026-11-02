/** Per-admin tutorial progress, stored in Clerk unsafeMetadata under `adminTutorial`.
 *  This is a UI flag only. It must never be used for access control. */
export interface AdminTutorialState {
  version: 1;
  mainDone: boolean;
  checklistHidden: boolean;
  welcomeSeen: boolean;
  seen: Record<string, boolean>;
}

export const EMPTY_TUTORIAL_STATE: AdminTutorialState = {
  version: 1,
  mainDone: false,
  checklistHidden: false,
  welcomeSeen: false,
  seen: {},
};

/** Reads the stored value defensively: anything malformed falls back to the empty state. */
export function readTutorialState(raw: unknown): AdminTutorialState {
  if (!raw || typeof raw !== "object") return EMPTY_TUTORIAL_STATE;
  const value = raw as Partial<AdminTutorialState>;
  return {
    version: 1,
    mainDone: value.mainDone === true,
    checklistHidden: value.checklistHidden === true,
    welcomeSeen: value.welcomeSeen === true,
    seen:
      value.seen && typeof value.seen === "object" && !Array.isArray(value.seen)
        ? { ...value.seen }
        : {},
  };
}

/** Applies a partial update without losing the other fields or other `seen` entries. */
export interface TutorialPatch extends Partial<Omit<AdminTutorialState, "version" | "seen">> {
  seen?: Record<string, boolean>;
  /** true replaces the whole `seen` list (used by "Restart tutorial"). */
  resetSeen?: boolean;
}

export function mergeTutorialState(current: AdminTutorialState, patch: TutorialPatch): AdminTutorialState {
  const seen = patch.resetSeen
    ? { ...(patch.seen ?? {}) }
    : { ...current.seen, ...(patch.seen ?? {}) };
  return {
    version: 1,
    mainDone: patch.mainDone ?? current.mainDone,
    checklistHidden: patch.checklistHidden ?? current.checklistHidden,
    welcomeSeen: patch.welcomeSeen ?? current.welcomeSeen,
    seen,
  };
}

/** Sent with the "admin-tour:request-start" event. A page that needs a decision before the
 *  tour starts (for example, to protect an open schema) sets `handled` to true and calls
 *  `proceed()` once the admin has decided. Otherwise the tour starts straight away. */
export interface TourStartRequest {
  moduleKey: string | null;
  handled: boolean;
  proceed: () => void;
}

export type AdminSetupStepKey =
  | "school_year"
  | "programs"
  | "advisers"
  | "document_types"
  | "schemas"
  | "requirements"
  | "branding"
  | "forms";

export interface AdminSetupStep {
  key: AdminSetupStepKey;
  done: boolean;
  count: number;
  required: boolean;
}

export interface AdminSetupStatus {
  active_school_year_name: string | null;
  core_complete: boolean;
  steps: AdminSetupStep[];
}
