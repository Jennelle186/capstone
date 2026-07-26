"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { Camera, Loader2, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

import NameForm from "./NameForm";
import ProfileHeader from "./ProfileHeader";
import ReadOnlyFields from "./ReadOnlyFields";
import SecurityCard from "./SecurityCard";
import type { ProfileSettingsConfig, ReadOnlyField } from "./types";

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

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export default function ProfileSettings({
  role,
  fetchProfile,
  updateProfile,
  readOnlyFields,
  showAvatarUpload = false,
  title,
  description,
  extraSections,
  footer,
}: ProfileSettingsConfig) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const { user, isLoaded: isUserLoaded } = useUser();

  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      const data = await fetchProfile(token);
      setProfileData(data);
      setFirstName((data.first_name as string) ?? "");
      setMiddleName((data.middle_name as string) ?? "");
      setLastName((data.last_name as string) ?? "");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load profile.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [fetchProfile]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !isUserLoaded) return;
    void load();
  }, [isLoaded, isSignedIn, isUserLoaded, load]);

  const hasChanges = useMemo(() => {
    if (!profileData) return false;
    return (
      avatarFile !== null ||
      normalizeName(firstName) !== normalizeName(profileData.first_name as string) ||
      normalizeName(middleName) !== normalizeName(profileData.middle_name as string) ||
      normalizeName(lastName) !== normalizeName(profileData.last_name as string)
    );
  }, [firstName, middleName, lastName, profileData, avatarFile]);

  const displayName = useMemo(() => {
    const parts = [firstName, middleName, lastName].map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    return role === "adviser" ? "Adviser" : "Student";
  }, [firstName, middleName, lastName, role]);

  const initials = useMemo(() => {
    return `${firstName?.charAt(0) ?? ""}${lastName?.charAt(0) ?? ""}`.toUpperCase() || "?";
  }, [firstName, lastName]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const token = await getTokenRef.current();
      if (!token) throw new Error("Missing authentication token.");

      if (avatarFile && user && showAvatarUpload) {
        await user.setProfileImage({ file: avatarFile });
        setAvatarFile(null);
        setAvatarPreview(null);
      }

      const result = await updateProfile(token, {
        first_name: firstName.trim(),
        middle_name: middleName.trim() || null,
        last_name: lastName.trim(),
      });

      setProfileData({
        first_name: result.first_name ?? firstName.trim(),
        middle_name: result.middle_name ?? middleName.trim(),
        last_name: result.last_name ?? lastName.trim(),
      });

      if (user) {
        await user.reload();
      }

      toast.success("Profile updated.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update profile.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const resolvedReadOnlyFields = useMemo(
    () => (typeof readOnlyFields === "function" && profileData ? readOnlyFields(profileData) : readOnlyFields as readonly ReadOnlyField[]),
    [readOnlyFields, profileData],
  );

  if (!isLoaded || !isSignedIn || !isUserLoaded || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const avatarDisplayUrl = avatarPreview ?? user?.imageUrl;

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      {title && (
        <motion.div variants={fadeInUp}>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </motion.div>
      )}

      <motion.div variants={fadeInUp}>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Profile Information
            </CardTitle>
            <CardDescription>
              {showAvatarUpload
                ? "Update your photo and personal details."
                : "Update your personal details."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ProfileHeader
              displayName={displayName}
              role={role}
            />

            {showAvatarUpload && (
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <div className="relative group">
                  <Avatar className="h-24 w-24 rounded-full border-4 border-muted">
                    <AvatarImage src={avatarDisplayUrl} alt="Avatar" />
                    <AvatarFallback className="text-2xl font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary text-white shadow-lg hover:scale-105 transition-transform">
                    <Camera className="h-3.5 w-3.5" />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      className="hidden"
                      onChange={handleAvatarSelect}
                    />
                  </label>
                </div>
                <span className="text-xs text-muted-foreground">
                  JPG or PNG. Max 5MB
                </span>
              </div>
            )}

            <NameForm
              firstName={firstName}
              middleName={middleName}
              lastName={lastName}
              onChange={(field, value) => {
                if (field === "firstName") setFirstName(value);
                else if (field === "middleName") setMiddleName(value);
                else setLastName(value);
              }}
              hasChanges={hasChanges}
              isSaving={saving}
              onSave={handleSave}
            />

            {resolvedReadOnlyFields.length > 0 && (
              <ReadOnlyFields fields={resolvedReadOnlyFields} />
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeInUp}>
        <SecurityCard />
      </motion.div>

      {extraSections && (
        <motion.div variants={fadeInUp}>
          {extraSections}
        </motion.div>
      )}

      {footer && (
        <motion.div variants={fadeInUp}>
          {footer}
        </motion.div>
      )}
    </motion.section>
  );
}
