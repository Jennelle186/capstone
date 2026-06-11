"use client";

import * as React from "react";
import { Camera, Loader2, Save } from "lucide-react";
import { useUser, useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fetchWithClerkAuth } from "@/lib/api";
import { toast } from "sonner";

interface PersonalInfoCardProps {
  studentId?: string | null;
}

export default function PersonalInfoCard({ studentId }: PersonalInfoCardProps) {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [firstName, setFirstName] = React.useState("");
  const [middleName, setMiddleName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Hydrate from Clerk + backend.
  React.useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setMiddleName(user.publicMetadata?.middle_name as string ?? "");
    const primaryEmail = user.primaryEmailAddress?.emailAddress ?? "";
    setEmail(primaryEmail);
  }, [user]);

  // Also fetch middle_name from backend (in case Clerk public_metadata is stale).
  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetchWithClerkAuth("/api/me", token);
        if (!res.ok) return;
        const data = (await res.json()) as { middleName?: string | null };
        if (!cancelled && data.middleName) {
          setMiddleName(data.middleName);
        }
      } catch {
        // ignore
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [user, getToken]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("No auth token");

      // Upload avatar if changed.
      if (avatarFile) {
        await user.setProfileImage({ file: avatarFile });
        setAvatarFile(null);
        setAvatarPreview(null);
      }

      // Update names via backend (syncs both Clerk and DB).
      const res = await fetchWithClerkAuth("/api/me", token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          middle_name: middleName || null,
          last_name: lastName,
        }),
      });

      if (!res.ok) throw new Error("API request failed");

      toast.success("Profile updated successfully.");
    } catch {
      toast.error("Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!isLoaded || !user) return null;

  const displayUrl = avatarPreview ?? user.imageUrl;
  const initials = `${firstName?.charAt(0) ?? ""}${lastName?.charAt(0) ?? ""}`.toUpperCase() || "?";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 overflow-hidden">
            <Avatar size="sm" className="h-10 w-10">
              <AvatarImage src={user.imageUrl} alt="Avatar" />
              <AvatarFallback className="text-sm font-bold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Personal Information</h3>
        </div>
      </div>

      <div className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3 shrink-0 lg:w-48">
            <div className="relative group">
              <Avatar size="lg" className="w-32 h-32 rounded-full border-4 border-slate-100">
                <AvatarImage src={displayUrl} alt="Avatar" />
                <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <label className="absolute bottom-1 right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-primary text-white shadow-lg hover:scale-105 transition-transform">
                <Camera className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
              </label>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 text-center">
              JPG or PNG. Max 5MB
            </span>
          </div>

          {/* Form */}
          <div className="flex-1 w-full">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  First Name
                </label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="h-11 rounded-xl border-slate-200 bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Middle Name
                </label>
                <Input
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  className="h-11 rounded-xl border-slate-200 bg-white"
                  placeholder="(optional)"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Last Name
                </label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="h-11 rounded-xl border-slate-200 bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Student ID
                </label>
                <Input
                  value={studentId ?? "—"}
                  disabled
                  className="h-11 rounded-xl border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Email Address
                </label>
                <Input
                  value={email}
                  disabled
                  className="h-11 rounded-xl border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-400">
                  Manage email addresses in{" "}
                  <span className="font-semibold text-primary">Security &amp; Account</span> below.
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-5">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl gap-2 bg-primary text-white hover:bg-primary/90 shadow-md"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
