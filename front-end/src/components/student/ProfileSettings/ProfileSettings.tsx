"use client";

import { Mail, User } from "lucide-react";

import { fetchWithClerkAuth } from "@/lib/api";
import type { ProfileSettingsConfig } from "@/components/common/profile/types";
import ProfileSettings from "@/components/common/profile/ProfileSettings";
import NotificationPreferencesCard from "./NotificationPreferencesCard";
import DeactivateAccountDialog from "./DeactivateAccountDialog";

const fetchStudentProfile: ProfileSettingsConfig["fetchProfile"] = async (token) => {
  const res = await fetchWithClerkAuth("/api/me", token);
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(
      payload && typeof payload.detail === "string"
        ? payload.detail
        : "Failed to load profile.",
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    student_number: (data.student_number as string) ?? null,
    email: (data.email as string) ?? null,
    first_name: (data.firstName as string) ?? "",
    middle_name: (data.middleName as string) ?? "",
    last_name: (data.lastName as string) ?? "",
  };
};

const updateStudentProfile: ProfileSettingsConfig["updateProfile"] = async (token, body) => {
  const res = await fetchWithClerkAuth("/api/me", token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(
      payload && typeof payload.detail === "string"
        ? payload.detail
        : "Failed to update profile.",
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    first_name: (data.firstName as string) ?? "",
    middle_name: (data.middleName as string) ?? "",
    last_name: (data.lastName as string) ?? "",
  };
};

export default function StudentProfileSettings() {
  return (
    <ProfileSettings
      role="student"
      fetchProfile={fetchStudentProfile}
      updateProfile={updateStudentProfile}
      readOnlyFields={(profile) => [
        {
          id: "student-id",
          label: "Student ID",
          value: profile.student_number as string | null | undefined,
          icon: User,
        },
        {
          id: "email-address",
          label: "Email Address",
          value: profile.email as string | null | undefined,
          icon: Mail,
        },
      ]}
      showAvatarUpload
      title="Profile Settings"
      description="Manage your personal information, security, and notification preferences."
      extraSections={<NotificationPreferencesCard />}
      footer={
        <div className="flex flex-col sm:flex-row justify-between items-center py-6 border-t border-slate-200 gap-4">
          <DeactivateAccountDialog />
          <p className="text-xs text-slate-400">
            Changes to notifications are saved locally.
          </p>
        </div>
      }
    />
  );
}
