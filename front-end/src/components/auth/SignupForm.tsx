import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { useSignUp } from "@clerk/clerk-react";
import { useState } from "react";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "../ui/field";
import { signupSchema, type SignupFormData } from "@/schemas/auth.schema";
import { Link, useNavigate, useSearchParams } from "react-router";

function isClerkAPIResponseError(error: unknown): error is { errors: Array<{ longMessage?: string; message?: string }> } {
  return (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as Record<string, unknown>).errors)
  );
}

export default function SignupForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invitationTicket = searchParams.get("__clerk_ticket");
  const isInvitationFlow = Boolean(invitationTicket);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      passwordConfirm: "",
      agree: false,
    },
  });
  const isSubmitting = form.formState.isSubmitting;
  const isBusy = isSubmitting || isGoogleLoading;

  async function onSubmit(data: SignupFormData) {
    if (!isLoaded || isGoogleLoading) return;

    try {
      // Invitation sign-ups should consume the ticket from Clerk email links.
      const signUpAttempt = isInvitationFlow && invitationTicket
        ? await signUp.create({
            strategy: "ticket",
            ticket: invitationTicket,
            password: data.password,
          })
        : await signUp.create({
            emailAddress: data.email,
            password: data.password,
          });

      if (signUpAttempt.status === "complete" && signUpAttempt.createdSessionId) {
        await setActive({ session: signUpAttempt.createdSessionId });
        toast.success(isInvitationFlow ? "Invitation accepted. Account created!" : "Account created!", { position: "bottom-right" });
        // Centralize role-based redirects in one place.
        navigate("/post-auth");
        return;
      }

      // Ticket-based invitation flows usually complete immediately after password setup.
      if (isInvitationFlow) {
        toast.error("Invitation sign-up requires additional steps. Please try the invitation link again.");
        return;
      }

      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      });

      setPendingVerification(true);
      toast.success("Verification code sent to your email.", {
        position: "bottom-right",
      });
    } catch (error) {
      console.error("Form submission error:", error);
      let errorMessage: string;
      if (isClerkAPIResponseError(error)) {
        errorMessage = error.errors[0]?.longMessage ?? error.errors[0]?.message ?? "Login failed.";
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = "An error occurred during login.";
      }
      toast.error(errorMessage, { position: "bottom-right" });
    }
  }

  async function onGoogleSignup() {
    if (!isLoaded || isBusy) return;

    setIsGoogleLoading(true);
    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        // OAuth completes at a role-aware landing route.
        redirectUrlComplete: "/post-auth",
      });
    } catch (error) {
      console.error("Google signup error:", error);
      toast.error("Google sign up failed. Please try again.", { position: "bottom-right" });
      setIsGoogleLoading(false);
    }
  }

  async function onVerifyEmailCode() {
    if (!isLoaded || isVerifying) return;

    setIsVerifying(true);
    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });

      if (completeSignUp.status !== "complete" || !completeSignUp.createdSessionId) {
        toast.error("Verification failed. Please check the code and try again.", {
          position: "bottom-right",
        });
        return;
      }

      await setActive({ session: completeSignUp.createdSessionId });
      toast.success("Email verified. Welcome!", { position: "bottom-right" });
      // Centralize role-based redirects in one place.
      navigate("/post-auth");
    } catch (error) {
      console.error("Verification error:", error);
      const message = isClerkAPIResponseError(error)
        ? (error.errors[0]?.longMessage ?? error.errors[0]?.message ?? "Verification failed.")
        : "Verification failed. Please try again.";
      toast.error(message, { position: "bottom-right" });
    } finally {
      setIsVerifying(false);
    }
  }

  if (pendingVerification) {
    return (
      <div className="space-y-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="signup-verification-code">Verification Code</FieldLabel>
            <Input
              id="signup-verification-code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="Enter the code sent to your email"
              disabled={!isLoaded || isVerifying}
            />
            <FieldDescription>
              Enter the email verification code from Clerk to complete sign up.
            </FieldDescription>
          </Field>
          <Field>
            <Button type="button" onClick={onVerifyEmailCode} disabled={!isLoaded || isVerifying}>
              {isVerifying ? "Verifying..." : "Verify Email"}
            </Button>
          </Field>
        </FieldGroup>
      </div>
    );
  }

  return (
    <>
      <form id="signup-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FieldGroup>
          {isInvitationFlow && (
            <Field>
              <FieldDescription>
                You are completing an adviser invitation. Set your password to finish account setup.
              </FieldDescription>
            </Field>
          )}

          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="form-signup-email">Email</FieldLabel>
                <Input
                  {...field}
                  id="form-signup-email"
                  type="email"
                  placeholder={isInvitationFlow ? "Use the invited email address" : "Enter your email address"}
                  autoComplete="on"
                  disabled={!isLoaded || isBusy}
                />
                {isInvitationFlow && (
                  <FieldDescription>
                    Invitation ticket is authoritative; this should match the invited email.
                  </FieldDescription>
                )}
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="form-signup-password">Password</FieldLabel>
                <Input
                  {...field}
                  id="form-signup-password"
                  type="password"
                  placeholder="Create a password"
                  disabled={!isLoaded || isBusy}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="passwordConfirm"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="form-signup-password-confirm">
                  Confirm Password
                </FieldLabel>
                <Input
                  {...field}
                  id="form-signup-password-confirm"
                  type="password"
                  placeholder="Re-enter your password"
                  disabled={!isLoaded || isBusy}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="agree"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <div className="flex items-start gap-3">
                  <input
                    id="form-signup-agree"
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    disabled={!isLoaded || isBusy}
                  />
                  <div className="space-y-1 text-sm text-slate-700">
                    <label htmlFor="form-signup-agree" className="font-medium text-slate-900">
                      I agree to the Terms and Conditions and Privacy Policy
                    </label>
                    <p className="text-xs text-slate-600">
                      By signing up, you consent to processing under the Data Privacy Act of 2012
                      (RA 10173).{" "}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4 text-primary"
                      >
                        Read Terms &amp; Privacy
                      </a>
                    </p>
                  </div>
                </div>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Field>
            <Button type="submit" form="signup-form" disabled={!isLoaded || isBusy}>
              {isSubmitting ? "Creating account..." : (isInvitationFlow ? "Accept Invitation" : "Submit")}
            </Button>
          </Field>

          {!isInvitationFlow && (
            <>
              <FieldSeparator>Or Continue With</FieldSeparator>

              <Field>
                <Button
                  variant="outline"
                  type="button"
                  className="border-gray-300 hover:bg-gray-50"
                  disabled={!isLoaded || isBusy}
                  onClick={onGoogleSignup}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5">
                    <path
                      d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"
                      fill="#EA4335"
                    />
                    <path d="M0 5.457V19.366c0 .904.732 1.636 1.636 1.636h3.819V11.73L0 5.457z" fill="#34A853" />
                    <path
                      d="M18.545 21.002h3.819c.904 0 1.636-.732 1.636-1.636V5.457l-5.455 6.273v9.272z"
                      fill="#FBBC04"
                    />
                    <path
                      d="M18.545 11.73V3.493l1.528-1.145C21.69 2.28 24 3.434 24 5.457v.001l-5.455 6.272z"
                      fill="#C5221F"
                    />
                    <path d="M0 5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64v7.09L0 5.457z" fill="#C5221F" />
                  </svg>
                  {isGoogleLoading ? "Redirecting..." : "Sign up with Gmail"}
                </Button>
                <FieldDescription className="text-center">
                  Already have an account?{" "}
                  <Link to="/auth/login" className="underline underline-offset-4">
                    Log in
                  </Link>
                </FieldDescription>
              </Field>
            </>
          )}
        </FieldGroup>
      </form>
    </>
  );
}
