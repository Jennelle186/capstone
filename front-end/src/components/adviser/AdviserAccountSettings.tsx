"use client";

import { Building2, Mail } from "lucide-react";

import { fetchWithClerkAuth } from "@/lib/api";
import type { ProfileSettingsConfig } from "@/components/common/profile/types";
import ProfileSettings from "@/components/common/profile/ProfileSettings";

const fetchAdviserProfile: ProfileSettingsConfig["fetchProfile"] = async (token) => {
  const res = await fetchWithClerkAuth("/api/adviser/profile", token);
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const detail =
      payload && typeof payload.detail === "string"
        ? payload.detail
        : "Failed to load adviser account profile.";
    throw new Error(detail);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    email: (data.email as string) ?? null,
    department: (data.department as string) ?? null,
    school_year: (data.school_year as string) ?? null,
    first_name: (data.first_name as string) ?? "",
    middle_name: (data.middle_name as string) ?? "",
    last_name: (data.last_name as string) ?? "",
  };
};

const updateAdviserProfile: ProfileSettingsConfig["updateProfile"] = async (token, body) => {
  const res = await fetchWithClerkAuth("/api/adviser/profile", token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const detail =
      payload && typeof payload.detail === "string"
        ? payload.detail
        : "Failed to update adviser profile.";
    throw new Error(detail);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    first_name: (data.first_name as string) ?? "",
    middle_name: (data.middle_name as string) ?? "",
    last_name: (data.last_name as string) ?? "",
  };
};

export default function AdviserAccountSettings() {
  return (
    <ProfileSettings
      role="adviser"
      fetchProfile={fetchAdviserProfile}
      updateProfile={updateAdviserProfile}
      readOnlyFields={(profile) => [
        {
          id: "adviser-email",
          label: "Email Address",
          value: profile.email as string | null | undefined,
          icon: Mail,
        },
        {
          id: "adviser-department",
          label: "Department",
          value: profile.department as string | null | undefined,
          icon: Building2,
        },
        {
          id: "adviser-school-year",
          label: "School Year",
          value: profile.school_year as string | null | undefined,
        },
      ]}
      showAvatarUpload
      title="Account Settings"
      description="Update your adviser profile details. Security and account controls stay managed by Clerk."
    />
  );
}
