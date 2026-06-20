"use client";

import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NameFormProps {
  firstName: string;
  middleName: string;
  lastName: string;
  onChange: (field: "firstName" | "middleName" | "lastName", value: string) => void;
  hasChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
}

export default function NameForm({
  firstName,
  middleName,
  lastName,
  onChange,
  hasChanges,
  isSaving,
  onSave,
}: NameFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="profile-first-name">First Name</Label>
          <Input
            id="profile-first-name"
            value={firstName}
            onChange={(e) => onChange("firstName", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-middle-name">Middle Name</Label>
          <Input
            id="profile-middle-name"
            value={middleName}
            onChange={(e) => onChange("middleName", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-last-name">Last Name</Label>
          <Input
            id="profile-last-name"
            value={lastName}
            onChange={(e) => onChange("lastName", e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={!hasChanges || isSaving}>
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
