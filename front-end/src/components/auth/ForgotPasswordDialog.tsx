"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema, type ForgotPasswordFormData } from "@/schemas/auth.schema";

type ForgotPasswordDialogProps = {
  trigger: React.ReactNode;
  defaultEmail?: string;
  onSubmitted?: (email: string) => void;
};

export default function ForgotPasswordDialog({
  trigger,
  defaultEmail = "",
  onSubmitted,
}: ForgotPasswordDialogProps) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: defaultEmail,
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({ email: defaultEmail });
    }
  }, [defaultEmail, form, open]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      toast.success("Password reset link sent. Check your email.");
      onSubmitted?.(values.email);
      setOpen(false);
    } catch (error) {
      console.error("Failed to send reset link", error);
      toast.error("Failed to send reset link. Please try again.");
    }
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Reset password</AlertDialogTitle>
          <AlertDialogDescription>
            We&apos;ll email you a secure link to reset your password.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Form {...form}>
          <form id="forgot-password-form" onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="you@example.com" autoComplete="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Send reset link
              </Button>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
