"use client";

import * as React from "react";
import { useUser, useReverification } from "@clerk/clerk-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Mail, Plus, Trash2, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  addEmailSchema,
  verifyEmailSchema,
  type AddEmailFormData,
  type VerifyEmailFormData,
} from "@/schemas/security.schema";

export default function EmailSection() {
  const { user } = useUser();

  const [open, setOpen] = React.useState(false);
  const [pendingEmailId, setPendingEmailId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const addForm = useForm<AddEmailFormData>({
    resolver: zodResolver(addEmailSchema),
    defaultValues: { email: "" },
  });

  const verifyForm = useForm<VerifyEmailFormData>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { code: "" },
  });

  React.useEffect(() => {
    if (!open) {
      setPendingEmailId(null);
      addForm.reset();
      verifyForm.reset();
    }
  }, [open, addForm, verifyForm]);

  const enhancedCreateEmail = useReverification(async (email: string) => {
    const emailRes = await user!.createEmailAddress({ email });
    await emailRes.prepareVerification({ strategy: "email_code" });
    return emailRes.id;
  });

  const enhancedDestroy = useReverification(async (emailId: string) => {
    const emailRes = user!.emailAddresses.find((e) => e.id === emailId);
    if (!emailRes) throw new Error("Email not found");
    await emailRes.destroy();
  });

  const handleAdd = addForm.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const id = await enhancedCreateEmail(values.email);
      setPendingEmailId(id);
      toast.success("Verification code sent.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add email.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  });

  const handleVerify = verifyForm.handleSubmit(async (values) => {
    if (!pendingEmailId) return;
    setSaving(true);
    try {
      const emailRes = user!.emailAddresses.find((e) => e.id === pendingEmailId);
      if (!emailRes) throw new Error("Email not found");
      await emailRes.attemptVerification({ code: values.code });
      toast.success("Email verified.");
      setOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid code.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  });

  const handleRemove = async (emailId: string) => {
    const emailRes = user!.emailAddresses.find((e) => e.id === emailId);
    if (!emailRes) return;
    if (emailRes.id === user!.primaryEmailAddressId) {
      toast.error("Cannot remove your primary email. Set a different primary email first.");
      return;
    }
    if (user!.emailAddresses.length <= 1) {
      toast.error("Cannot remove your last email address.");
      return;
    }
    try {
      await enhancedDestroy(emailId);
      toast.success("Email removed.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove email.";
      toast.error(msg);
    }
  };

  const handleSetPrimary = async (emailId: string) => {
    try {
      await user!.update({ primaryEmailAddressId: emailId });
      toast.success("Primary email updated.");
    } catch {
      toast.error("Failed to set primary email.");
    }
  };

  return (
    <>
      <section>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Email Addresses
          </h4>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Email
          </Button>
        </div>
        <div className="space-y-2">
          {user!.emailAddresses.map((email) => (
            <div
              key={email.id}
              className="flex items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-900 truncate">
                  {email.emailAddress}
                </span>
                {email.id === user!.primaryEmailAddressId && (
                  <Badge
                    variant="default"
                    className="text-[10px] uppercase tracking-wider shrink-0"
                  >
                    Primary
                  </Badge>
                )}
                {email.verification?.status === "verified" ? (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {email.id !== user!.primaryEmailAddressId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[11px] text-primary h-7 px-2"
                    onClick={() => handleSetPrimary(email.id)}
                  >
                    Set primary
                  </Button>
                )}
                {email.id !== user!.primaryEmailAddressId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 h-7 px-2"
                    onClick={() => handleRemove(email.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {user!.emailAddresses.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">No email addresses.</p>
          )}
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>{pendingEmailId ? "Verify Email" : "Add Email Address"}</DialogTitle>
            <DialogDescription>
              {pendingEmailId
                ? "Enter the verification code sent to your email."
                : "Enter a new email address to add to your account."}
            </DialogDescription>
          </DialogHeader>

          {!pendingEmailId ? (
            <Form {...addForm}>
              <form id="add-email-form" onSubmit={handleAdd} className="space-y-4 py-2">
                <FormField
                  control={addForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          className="h-11 rounded-xl"
                          placeholder="you@example.com"
                        />
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
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Email"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          ) : (
            <Form {...verifyForm}>
              <form id="verify-email-form" onSubmit={handleVerify} className="space-y-4 py-2">
                <FormField
                  control={verifyForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verification Code</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className="h-11 rounded-xl"
                          placeholder="Enter 6-digit code"
                        />
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
                    onClick={() => {
                      setOpen(false);
                      setPendingEmailId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="rounded-xl bg-primary text-white"
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
