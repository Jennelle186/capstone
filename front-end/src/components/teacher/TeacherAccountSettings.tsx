import { useCallback, useEffect, useMemo, useState } from "react";
import { UserAvatar, UserProfile, useAuth, useUser } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { Building2, CheckCircle2, Mail, Shield, User } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { fetchWithClerkAuth } from "@/lib/api";
import type { AdviserProfileResponse } from "@/types/adviser";

type NameFormState = {
  firstName: string;
  middleName: string;
  lastName: string;
};

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

function normalizeNameForCompare(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function buildDisplayName(form: NameFormState, fallbackEmail: string | null): string {
  const fullName = [form.firstName, form.middleName, form.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  if (fullName) return fullName;
  if (fallbackEmail) return fallbackEmail.split("@", 1)[0] ?? "Adviser";
  return "Adviser";
}

export default function TeacherAccountSettings() {
  const { isLoaded: isUserLoaded, user } = useUser();
  const { getToken } = useAuth();

  const [profile, setProfile] = useState<AdviserProfileResponse | null>(null);
  const [form, setForm] = useState<NameFormState>({
    firstName: "",
    middleName: "",
    lastName: "",
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Missing authentication token.");
      }

      const response = await fetchWithClerkAuth("/api/adviser/profile", token);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const detail =
          payload && typeof payload.detail === "string"
            ? payload.detail
            : "Failed to load adviser account profile.";
        throw new Error(detail);
      }

      const payload = (await response.json()) as AdviserProfileResponse;
      setProfile(payload);
      setForm({
        firstName: payload.first_name ?? "",
        middleName: payload.middle_name ?? "",
        lastName: payload.last_name ?? "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load adviser account profile.";
      toast.error(message);
    } finally {
      setIsLoadingProfile(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!isUserLoaded) return;
    void loadProfile();
  }, [isUserLoaded, loadProfile]);

  const hasProfileChanges = useMemo(() => {
    if (!profile) return false;
    return (
      normalizeNameForCompare(form.firstName) !== normalizeNameForCompare(profile.first_name) ||
      normalizeNameForCompare(form.middleName) !== normalizeNameForCompare(profile.middle_name) ||
      normalizeNameForCompare(form.lastName) !== normalizeNameForCompare(profile.last_name)
    );
  }, [form, profile]);

  const displayName = useMemo(
    () => buildDisplayName(form, profile?.email ?? null),
    [form, profile?.email],
  );
  const handleSaveProfile = async () => {
    if (!profile || isSaving || !hasProfileChanges) return;
    setIsSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Missing authentication token.");

      const response = await fetchWithClerkAuth("/api/adviser/profile", token, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: form.firstName.trim(),
          middle_name: form.middleName.trim() || null,
          last_name: form.lastName.trim(),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const detail =
          payload && typeof payload.detail === "string"
            ? payload.detail
            : "Failed to update adviser profile.";
        throw new Error(detail);
      }

      const payload = (await response.json()) as AdviserProfileResponse;
      setProfile(payload);
      setForm({
        firstName: payload.first_name ?? "",
        middleName: payload.middle_name ?? "",
        lastName: payload.last_name ?? "",
      });

      // Refresh Clerk client user state so other UI (e.g. sidebar/header) reflects new names immediately.
      await user?.reload();
      toast.success("Profile updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update adviser profile.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isUserLoaded || isLoadingProfile) {
    return <p className="text-sm text-muted-foreground">Loading account profile...</p>;
  }

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      <motion.div variants={fadeInUp}>
        <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
        <p className="text-sm text-muted-foreground">
          Update your adviser profile details. Security and account controls stay managed by Clerk.
        </p>
      </motion.div>

      <motion.div variants={fadeInUp}>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Profile Information
            </CardTitle>
            <CardDescription>Name details and your current adviser department assignment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <UserAvatar
                appearance={{
                  elements: {
                    userAvatarBox: "h-20 w-20",
                  },
                }}
              />
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">{displayName}</h2>
                <p className="text-sm text-muted-foreground">
                  {profile?.department ? `${profile.department} Department Adviser` : "Department not assigned"}
                </p>
                <Badge variant="outline" className="gap-1">
                  <Shield className="h-3 w-3" />
                  Adviser Account
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="teacher-first-name">First Name</Label>
                <Input
                  id="teacher-first-name"
                  value={form.firstName}
                  onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher-middle-name">Middle Name</Label>
                <Input
                  id="teacher-middle-name"
                  value={form.middleName}
                  onChange={(event) => setForm((prev) => ({ ...prev, middleName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher-last-name">Last Name</Label>
                <Input
                  id="teacher-last-name"
                  value={form.lastName}
                  onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher-email">Email Address</Label>
                <div className="relative">
                  <Mail className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                  <Input id="teacher-email" className="pl-10" value={profile?.email ?? "No email"} disabled />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher-department">Department</Label>
                <div className="relative">
                  <Building2 className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="teacher-department"
                    className="pl-10"
                    value={profile?.department ?? "Unassigned"}
                    disabled
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher-school-year">School Year</Label>
                <Input
                  id="teacher-school-year"
                  value={profile?.school_year ?? "No active school year"}
                  disabled
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} disabled={!hasProfileChanges || isSaving}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeInUp}>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Account And Security</CardTitle>
            <CardDescription>Managed by Clerk for authentication, passwords, and account protection.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <UserProfile
              path="/adviser/profile"
              routing="path"
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "shadow-md border border-slate-200 rounded-2xl",
                },
              }}
            />
          </CardContent>
        </Card>
      </motion.div>
    </motion.section>
  );
}
