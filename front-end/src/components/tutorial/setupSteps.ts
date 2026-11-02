import type { AdminSetupStepKey } from "@/types/tutorial";

export interface SetupStepInfo {
  key: AdminSetupStepKey;
  label: string;
  why: string;
  route: string;
}

/** Plain-language copy and destination for each checklist step, in setup order. */
export const SETUP_STEP_INFO: Record<AdminSetupStepKey, SetupStepInfo> = {
  school_year: {
    key: "school_year",
    label: "School year",
    why: "Students and advisers belong to an active school year.",
    route: "/admin/settings/school-year",
  },
  programs: {
    key: "programs",
    label: "Academic programs",
    why: "Programs are the courses that students and advisers belong to.",
    route: "/admin/departments",
  },
  advisers: {
    key: "advisers",
    label: "Advisers",
    why: "Each adviser is assigned to a program for the school year.",
    route: "/admin/advisers",
  },
  document_types: {
    key: "document_types",
    label: "Document types",
    why: "Students upload documents of these types.",
    route: "/admin/document-types",
  },
  schemas: {
    key: "schemas",
    label: "Extraction schemas",
    why: "Schemas tell the system which fields to read from each document.",
    route: "/admin/extraction-schemas",
  },
  requirements: {
    key: "requirements",
    label: "Requirements",
    why: "Choose which documents each school year requires.",
    route: "/admin/requirements",
  },
  branding: {
    key: "branding",
    label: "Branding",
    why: "Sets the institution name that students see.",
    route: "/admin/settings/branding",
  },
  forms: {
    key: "forms",
    label: "Forms",
    why: "Forms let students fill in documents online.",
    route: "/admin/forms",
  },
};
