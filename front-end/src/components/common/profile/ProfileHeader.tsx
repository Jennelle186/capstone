"use client";

import { UserAvatar } from "@clerk/clerk-react";
import { Shield } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ProfileHeaderProps {
  displayName: string;
  role: "student" | "adviser";
  subtitle?: string | null;
}

export default function ProfileHeader({ displayName, role, subtitle }: ProfileHeaderProps) {
  return (
    <div>
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
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
          <Badge variant="outline" className="gap-1">
            <Shield className="h-3 w-3" />
            {role === "adviser" ? "Adviser Account" : "Student Account"}
          </Badge>
        </div>
      </div>
      <Separator className="mt-4" />
    </div>
  );
}
