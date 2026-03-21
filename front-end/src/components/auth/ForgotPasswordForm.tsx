import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useState } from "react";
import { useSignIn } from "@clerk/clerk-react";
import { isClerkAPIResponseError } from "@clerk/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  type ForgotPasswordFormData,
  type ResetPasswordFormData,
} from "@/schemas/auth.schema";

export default function ForgotPasswordForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();
  const [stage, setStage] = useState<"request" | "reset">("request");   // "request" = show email input to request reset code, "reset" = show code + new password inputs
  const [emailForReset, setEmailForReset] = useState("");

  const requestForm = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const resetForm = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      code: "",
      password: "",
      passwordConfirm: "",
    },
  });

  // Track loading states for both forms to disable inputs and buttons while submitting
  const isRequesting = requestForm.formState.isSubmitting;
  // We consider the reset form to be in a "submitting" state if either the code verification or password reset steps are in progress. 
  // This is because both steps are part of the overall "reset" process, 
  // and we want to disable the form while either step is happening to prevent multiple submissions or changes.
  const isResetting = resetForm.formState.isSubmitting;

  //request to send reset code to email
  const handleRequestSubmit = requestForm.handleSubmit(async (values) => {
    if (!isLoaded) return;

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: values.email,
      });

      setEmailForReset(values.email);
      resetForm.reset();
      setStage("reset");
      toast.success("Verification code sent. Check your email inbox.", {
        position: "bottom-right",
      });
    } catch (error) {
      console.error("Forgot password submission error:", error);
      const message = isClerkAPIResponseError(error)
        ? error.errors[0]?.longMessage ?? error.errors[0]?.message ?? "Failed to send reset code."
        : error instanceof Error
          ? error.message
          : "Failed to send reset code.";
      toast.error(message, { position: "bottom-right" });
    }
  });

  //handle password reset with code and new password
  const handleResetSubmit = resetForm.handleSubmit(async (values) => {
    if (!isLoaded) return;

    // First, attempt to verify the code. If it's valid, the status will be "needs_new_password". If it's invalid or expired, it will be "failed".
    try {
      const verification = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: values.code,
      });

      // If the code is valid, the status will be "needs_new_password". If it's invalid or expired, it will be "failed".
      if (verification.status !== "needs_new_password") {
        toast.error("Invalid or expired code. Please request a new one.", {
          position: "bottom-right",
        });
        return;
      }

      // If the code is valid, we can proceed to reset the password. 
      // This will also attempt to sign the user in with the new password.
      const resetResult = await signIn.resetPassword({
        password: values.password,
        signOutOfOtherSessions: true,
      });


      // If the reset is successful, the status will be "complete" and a new session will be created. 
      // If there are additional steps required (like 2FA), the status will indicate that instead.
      if (resetResult.status === "complete") {
        if (resetResult.createdSessionId) {
          await setActive({ session: resetResult.createdSessionId });
        }
        toast.success("Password reset successful. You're signed in.", {
          position: "bottom-right",
        });
        navigate("/post-auth");
        return;
      }

      // If we reach this point, it means the reset was successful but there are additional steps required (like 2FA).
      toast.error("Password reset requires additional steps. Please try again.", {
        position: "bottom-right",
      });
    } catch (error) {
      // Handle errors from both the code verification and password reset steps
      console.error("Password reset error:", error);
      const message = isClerkAPIResponseError(error)
        ? error.errors[0]?.longMessage ?? error.errors[0]?.message ?? "Password reset failed."
        : error instanceof Error
          ? error.message
          : "Password reset failed.";
      toast.error(message, { position: "bottom-right" });
    }
  });

  return (
    <>
      {stage === "request" && (
        <form
          id="forgot-password-form"
          onSubmit={handleRequestSubmit}
          className="space-y-4"
        >
          <FieldGroup>
            <Controller
              name="email"
              control={requestForm.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="form-forgot-password-email">Email</FieldLabel>
                  <Input
                    {...field}
                    id="form-forgot-password-email"
                    type="email"
                    placeholder="Enter your email address"
                    autoComplete="on"
                    disabled={!isLoaded || isRequesting}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Field>
              <Button
                type="submit"
                form="forgot-password-form"
                disabled={!isLoaded || isRequesting}
              >
                {isRequesting ? "Sending..." : "Send reset code"}
              </Button>
            </Field>
            <Field>
              <FieldDescription className="text-center">
                Remember your password?{" "}
                <Link to="/auth/login" className="underline underline-offset-4">
                  Sign in
                </Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      )}

      {stage === "reset" && (
        <form
          id="reset-password-form"
          onSubmit={handleResetSubmit}
          className="space-y-4"
        >
          <FieldGroup>
            <Field>
              <FieldDescription className="text-sm">
                We sent a verification code to <strong>{emailForReset}</strong>. Enter it below and set a new password.
              </FieldDescription>
            </Field>

            <Controller
              name="code"
              control={resetForm.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="form-reset-password-code">Verification code</FieldLabel>
                  <Input
                    {...field}
                    id="form-reset-password-code"
                    type="text"
                    inputMode="numeric"
                    placeholder="6-digit code"
                    autoComplete="one-time-code"
                    disabled={!isLoaded || isResetting}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="password"
              control={resetForm.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="form-reset-password-new">New password</FieldLabel>
                  <Input
                    {...field}
                    id="form-reset-password-new"
                    type="password"
                    placeholder="Enter a new password"
                    autoComplete="new-password"
                    disabled={!isLoaded || isResetting}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="passwordConfirm"
              control={resetForm.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="form-reset-password-confirm">Confirm password</FieldLabel>
                  <Input
                    {...field}
                    id="form-reset-password-confirm"
                    type="password"
                    placeholder="Re-enter your new password"
                    autoComplete="new-password"
                    disabled={!isLoaded || isResetting}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Field className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStage("request")}
                disabled={isResetting}
                className="w-full sm:w-auto"
              >
                Use a different email
              </Button>
              <Button
                type="submit"
                form="reset-password-form"
                disabled={!isLoaded || isResetting}
                className="w-full sm:w-auto"
              >
                {isResetting ? "Updating password..." : "Reset password"}
              </Button>
            </Field>

            <Field>
              <FieldDescription className="text-center">
                Prefer to sign in?{" "}
                <Link to="/auth/login" className="underline underline-offset-4">
                  Go back to login
                </Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      )}
    </>
  );
}
