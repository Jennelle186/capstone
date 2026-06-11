"use client";

import * as React from "react";
import { useAuth } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";
import PersonalInfoCard from "@/components/student/ProfileSettings/PersonalInfoCard";
import SecurityCard from "@/components/student/ProfileSettings/SecurityCard";
import NotificationPreferencesCard from "@/components/student/ProfileSettings/NotificationPreferencesCard";
import DeactivateAccountDialog from "@/components/student/ProfileSettings/DeactivateAccountDialog";
import { fetchWithClerkAuth } from "@/lib/api";

export default function ProfileSettings() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [studentId, setStudentId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    const load = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetchWithClerkAuth("/api/me", token);
        if (!res.ok) return;
        const data = (await res.json()) as { student_number?: string | null };
        if (!cancelled) setStudentId(data.student_number ?? null);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <section className="mb-8">
        <h2 className="text-[28px] font-bold tracking-tight text-slate-900">
          Profile Settings
        </h2>
        <p className="text-base text-slate-500 mt-1">
          Manage your personal information, security, and notification preferences.
        </p>
      </section>

      <div className="space-y-6">
        <PersonalInfoCard studentId={studentId} />
        <SecurityCard />
        <NotificationPreferencesCard />

        {/* Footer */}
        <div className="flex flex-col sm:flex-row justify-between items-center py-6 border-t border-slate-200 gap-4">
          <DeactivateAccountDialog />
          <p className="text-xs text-slate-400">
            Changes to notifications are saved locally.
          </p>
        </div>
      </div>
    </div>
  );
}
