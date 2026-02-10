"use client";

import { KeyRound, Mail, Save } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import ChangeEmailDialog from "@/components/auth/ChangeEmailDialog";
import ForgotPasswordDialog from "@/components/auth/ForgotPasswordDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";

// Local-only demo data for layout; replace with API data when available.
const initialProfile = {
  firstName: "Tessa",
  middleName: "E.",
  lastName: "Herondale",
  email: "tessa@example.com",
  phone: "+63 912 345 6789",
  studentId: "2025-00124",
  program: "BS Computer Science",
  yearLevel: "3rd Year",
  adviser: "Prof. Maria Santos",
  schoolYear: "2025-2026",
  address: "Iligan City, Philippines",
  bio: "Focused on document compliance and onboarding milestones.",
};

type ProfileFormValues = typeof initialProfile;

type ProfileSectionProps = {
  form: ReturnType<typeof useForm<ProfileFormValues>>;
};

function PersonalInformationSection({ form }: ProfileSectionProps) {
  return (
    <Card className="rounded-2xl border border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Personal Information</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>First name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="middleName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Middle name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="studentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Student ID</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mobile number</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}

function AcademicDetailsSection({ form }: ProfileSectionProps) {
  return (
    <Card className="rounded-2xl border border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Academic Details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="program"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Program</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="yearLevel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Year level</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select year level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1st Year">1st Year</SelectItem>
                    <SelectItem value="2nd Year">2nd Year</SelectItem>
                    <SelectItem value="3rd Year">3rd Year</SelectItem>
                    <SelectItem value="4th Year">4th Year</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="adviser"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Academic adviser</FormLabel>
              <FormControl>
                <Input {...field} disabled />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="schoolYear"
          render={({ field }) => (
            <FormItem>
              <FormLabel>School year</FormLabel>
              <FormControl>
                <Input {...field} disabled />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Current address</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Short bio</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}

export default function ProfileSettings() {
  const form = useForm<ProfileFormValues>({
    defaultValues: initialProfile,
  });
  const email = useWatch({ control: form.control, name: "email" });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      // TODO: Replace with API call when backend endpoint is available.
      console.log("Profile settings submitted", values);
      toast.success("Profile settings saved successfully.");
    } catch (error) {
      // Surface a friendly error toast while preserving the actual error in the console.
      console.error("Failed to save profile settings", error);
      toast.error("Failed to save profile settings. Please try again.");
    }
  });

  return (
    <section className="space-y-6">
      {/* Page title and quick action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
          <p className="text-sm text-muted-foreground">
            Keep your student details accurate for verification and onboarding.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Side tab actions */}
        <Card className="h-fit rounded-2xl border border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Account Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ForgotPasswordDialog
              defaultEmail={email}
              trigger={
                <Button variant="outline" className="w-full justify-start gap-2">
                  <KeyRound className="h-4 w-4" />
                  Forgot password
                </Button>
              }
            />
            <ChangeEmailDialog
              currentEmail={email}
              trigger={
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Mail className="h-4 w-4" />
                  Change email
                </Button>
              }
            />
          </CardContent>
        </Card>

        <Form {...form}>
          <form id="profile-settings-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Personal information form */}
            <PersonalInformationSection form={form} />

            {/* Academic details and contact info */}
            <AcademicDetailsSection form={form} />

            {/* Submit button lives inside the form for proper semantics */}
            <div className="flex justify-end">
              <Button type="submit" className="gap-2">
                <Save className="h-4 w-4" />
                Save changes
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </section>
  );
}
