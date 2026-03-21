"use client";

import { useUser, UserProfile } from "@clerk/clerk-react";
import LoadingPage from "@/components/LoadingPage";


type ProfileSettingsProps = {
  path?: string;
};

export default function ProfileSettings({ path = "/student/profile" }: ProfileSettingsProps) {
  const { isLoaded } = useUser();

  if (!isLoaded) {
    return <LoadingPage />;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account details, security, and preferences via Clerk.
          </p>
        </div>
      </div>

      <div className="flex justify-center">
        <UserProfile
          path={path}
          routing="path"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "shadow-md border border-slate-200 rounded-2xl",
            },
          }}
        />
      </div>
    </section>
  );
}
