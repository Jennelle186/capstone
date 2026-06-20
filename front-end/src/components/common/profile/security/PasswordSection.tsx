"use client";

import * as React from "react";
import { useUser, useReverification } from "@clerk/clerk-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import {
  changePasswordSchema,
  type ChangePasswordFormData,
} from "@/schemas/security.schema";

export default function PasswordSection() {
  const { user } = useUser();
  const hasPassword = user?.passwordEnabled ?? true;

  const [open, setOpen] = React.useState(false);
  const form = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  React.useEffect(() => {
    if (open) form.reset();
  }, [open, form]);

  const enhancedUpdatePassword = useReverification(
    async (newPassword: string) => {
      await user!.updatePassword({
        newPassword,
        signOutOfOtherSessions: true,
      });
    },
  );

  const onSubmit = form.handleSubmit(async (values) => {
    setOpen(false);
    try {
      await enhancedUpdatePassword(values.newPassword);
      toast.success("Password updated.");
      form.reset();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update password.";
      toast.error(msg);
    }
  });

  return (
    <>
      <section className="flex items-center justify-between rounded-xl border border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
            <KeyRound className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Password</p>
            <p className="text-xs text-slate-500">Managed by Clerk</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => setOpen(true)}
        >
          {hasPassword ? "Change Password" : "Set Password"}
        </Button>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>{hasPassword ? "Change Password" : "Set Password"}</DialogTitle>
            <DialogDescription>
              {hasPassword
                ? "Enter your new password below. You may be asked to verify your identity."
                : "Set a password for your account."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form id="change-password-form" onSubmit={onSubmit} className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <PasswordInput {...field} className="h-11 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <PasswordInput {...field} className="h-11 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-primary text-white"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
