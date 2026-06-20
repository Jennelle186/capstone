import type { ComponentType, ReactNode } from "react";

export interface ReadOnlyField {
  id: string;
  label: string;
  value: string | null | undefined;
  icon?: ComponentType<{ className?: string }>;
}

export interface ProfileSettingsConfig {
  role: "student" | "adviser";
  fetchProfile: (token: string) => Promise<{
    first_name: string;
    middle_name: string;
    last_name: string;
    [key: string]: unknown;
  }>;
  updateProfile: (
    token: string,
    data: { first_name: string; middle_name: string | null; last_name: string },
  ) => Promise<{
    first_name?: string;
    middle_name?: string;
    last_name?: string;
  }>;
  readOnlyFields:
    | readonly ReadOnlyField[]
    | ((profile: Record<string, unknown>) => readonly ReadOnlyField[]);
  showAvatarUpload?: boolean;
  title?: string;
  description?: string;
  extraSections?: ReactNode;
  footer?: ReactNode;
}
