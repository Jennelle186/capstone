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
import { changeEmailSchema, type ChangeEmailFormData } from "@/schemas/auth.schema";

type ChangeEmailDialogProps = {
  trigger: React.ReactNode;
  currentEmail?: string;
  onSubmitted?: (data: ChangeEmailFormData) => void;
};

export default function ChangeEmailDialog({
  trigger,
  currentEmail = "",
  onSubmitted,
}: ChangeEmailDialogProps) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<ChangeEmailFormData>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: {
      currentEmail,
      newEmail: "",
      confirmEmail: "",
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        currentEmail,
        newEmail: "",
        confirmEmail: "",
      });
    }
  }, [currentEmail, form, open]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      toast.success("Email update request submitted.");
      onSubmitted?.(values);
      setOpen(false);
    } catch (error) {
      console.error("Failed to change email", error);
      toast.error("Failed to change email. Please try again.");
    }
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Change email</AlertDialogTitle>
          <AlertDialogDescription>
            Update the email address associated with your student account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Form {...form}>
          <form id="change-email-form" onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="currentEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" autoComplete="email" readOnly />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="new@email.com" autoComplete="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="new@email.com" autoComplete="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Request change
              </Button>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
