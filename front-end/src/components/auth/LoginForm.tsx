import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "sonner"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from '../ui/field';
import { loginSchema, type LoginFormData } from '@/schemas/auth.schema';
import { Link, useNavigate } from 'react-router';
import { useSignIn } from '@clerk/clerk-react';
import { isClerkAPIResponseError } from '@clerk/shared';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

type PendingSignIn = NonNullable<ReturnType<typeof useSignIn>['signIn']>;

/** The message Clerk gives for a failed request, or the fallback when there isn't one. */
function errorMessageFrom(error: unknown, fallback: string): string {
    if (isClerkAPIResponseError(error)) {
        return error.errors[0]?.longMessage ?? error.errors[0]?.message ?? fallback;
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}

export default function LoginForm() {
    const { isLoaded, signIn, setActive } = useSignIn();
    const navigate = useNavigate();
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Set when Clerk asks for a verification code (a new browser or device). The sign-in
    // stays open until the code is entered, or the admin chooses another account.
    const [pendingSignIn, setPendingSignIn] = useState<PendingSignIn | null>(null);
    const [pendingEmailAddressId, setPendingEmailAddressId] = useState<string | null>(null);
    const [verificationCode, setVerificationCode] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    //zod form
    const form = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    })
    const isSubmitting = form.formState.isSubmitting;
    const isBusy = isSubmitting || isGoogleLoading || isVerifying;

    async function finishSignIn(sessionId: string) {
        if (!setActive) throw new Error("Sign-in is not ready yet. Please try again.");
        await setActive({ session: sessionId });
        toast.success("Login successful!", { position: "bottom-right" });
        // Centralize role-based redirects in one place (teachers should not be sent to student routes).
        navigate("/post-auth");
    }

    /** Asks Clerk to email a verification code, and keeps the sign-in open until it is entered. */
    async function sendVerificationCode(attempt: PendingSignIn, emailAddressId: string) {
        await attempt.prepareSecondFactor({ strategy: "email_code", emailAddressId });
    }

    async function onSubmit(data: LoginFormData) {
        if (pendingSignIn) {
            await onVerifyCode();
            return;
        }
        if (!isLoaded || isGoogleLoading) return;

        try {
            const signInAttempt = await signIn.create({
                identifier: data.email,
            });

            if (signInAttempt.status !== "needs_first_factor") {
                toast.error(
                    "We couldn't start sign-in for this email. Please try again, or use Login with Gmail.",
                    { position: "bottom-right" },
                );
                return;
            }

            const result = await signInAttempt.attemptFirstFactor({
                strategy: "password",
                password: data.password,
            });

            if (result.status === "complete" && result.createdSessionId) {
                await finishSignIn(result.createdSessionId);
                return;
            }

            // Clerk reports a new-device check with the status below; compared as a string so it is handled either way.
            const status: string | null = result.status;
            if (status === "needs_client_trust" || status === "needs_second_factor") {
                // Clerk asks for an emailed code when signing in from a browser it hasn't seen before.
                const emailFactor = result.supportedSecondFactors?.find((factor) => factor.strategy === "email_code");
                const emailAddressId = emailFactor && "emailAddressId" in emailFactor ? emailFactor.emailAddressId : null;
                if (!emailAddressId) {
                    toast.error(
                        "This account needs a verification step this form can't complete. Please contact the administrator.",
                        { position: "bottom-right" },
                    );
                    return;
                }
                await sendVerificationCode(result, emailAddressId);
                setPendingSignIn(result);
                setPendingEmailAddressId(emailAddressId);
                setVerificationCode("");
                toast.success("We need to confirm it's you. You're signing in from a new browser or device, so we sent a 6-digit code to your email. Enter it below to finish signing in.", {
                    position: "bottom-right",
                });
                return;
            }

            toast.error(
                `Sign-in needs another step (${result.status}) that this form can't complete. Please contact the administrator.`,
                { position: "bottom-right" },
            );
        } catch (error) {
            console.error("Form submission error:", error);
            toast.error(errorMessageFrom(error, "Login failed. Please try again."), { position: "bottom-right" });
        }
    }

    async function onVerifyCode() {
        if (!pendingSignIn) return;
        const code = verificationCode.trim();
        if (!/^\d{6}$/.test(code)) {
            toast.error("Enter the 6-digit code from your email.", { position: "bottom-right" });
            return;
        }

        setIsVerifying(true);
        try {
            const result = await pendingSignIn.attemptSecondFactor({ strategy: "email_code", code });
            if (result.status === "complete" && result.createdSessionId) {
                setPendingSignIn(null);
                setPendingEmailAddressId(null);
                await finishSignIn(result.createdSessionId);
            } else {
                toast.error(
                    `The code didn't complete sign-in (${result.status}). Please try again, or contact the administrator.`,
                    { position: "bottom-right" },
                );
            }
        } catch (error) {
            console.error("Verification error:", error);
            toast.error(
                errorMessageFrom(error, "The code is incorrect or has expired. Please try again."),
                { position: "bottom-right" },
            );
        } finally {
            setIsVerifying(false);
        }
    }

    async function onResendCode() {
        if (!pendingSignIn || !pendingEmailAddressId) return;
        setIsVerifying(true);
        try {
            await sendVerificationCode(pendingSignIn, pendingEmailAddressId);
            setVerificationCode("");
            toast.success("We sent a new code to your email.", { position: "bottom-right" });
        } catch (error) {
            console.error("Resend error:", error);
            toast.error(errorMessageFrom(error, "Could not send a new code. Please try again."), {
                position: "bottom-right",
            });
        } finally {
            setIsVerifying(false);
        }
    }

    function onCancelVerification() {
        setPendingSignIn(null);
        setPendingEmailAddressId(null);
        setVerificationCode("");
        // The password belongs to the account being abandoned, so it is cleared before another account is typed in.
        form.setValue("password", "");
    }

    async function onGoogleLogin() {
        if (!isLoaded || isBusy) return;

        setIsGoogleLoading(true);
        try {
            await signIn.authenticateWithRedirect({
                strategy: "oauth_google",
                redirectUrl: "/sso-callback",
                // OAuth completes at a role-aware landing route.
                redirectUrlComplete: "/post-auth",
            });
        } catch (error) {
            console.error("Google login error:", error);
            toast.error("Google login failed. Please try again.", { position: "bottom-right" });
            setIsGoogleLoading(false);
        }
    }

    const inVerification = pendingSignIn !== null;

    return (
        <>
            <form id="login-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FieldGroup>
                    <Controller
                        name="email"
                        control={form.control}
                        render={({ field, fieldState }) => (
                            <Field>
                                <FieldLabel htmlFor="form-login-email">
                                    Email
                                </FieldLabel>
                                <Input
                                    {...field}
                                    id="form-login-email"
                                    type="email"
                                    placeholder="Enter your email address"
                                    autoComplete="on"
                                    disabled={!isLoaded || isBusy || inVerification}
                                />
                                {fieldState.invalid && (
                                    <FieldError errors={[fieldState.error]} />
                                )}
                            </Field>
                        )}
                    />

                    <Controller
                        name="password"
                        control={form.control}
                        render={({ field, fieldState }) => (
                            <Field>
                                <FieldLabel htmlFor="form-login-password">
                                    Password
                                </FieldLabel>
                                <div className="relative">
                                    <Input
                                        {...field}
                                        id="form-login-password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter your password"
                                        autoComplete="current-password"
                                        className="pr-10"
                                        disabled={!isLoaded || isBusy || inVerification}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((value) => !value)}
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                        disabled={!isLoaded || isBusy || inVerification}
                                        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground disabled:opacity-50"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                                    </button>
                                </div>
                                {fieldState.invalid && (
                                    <FieldError errors={[fieldState.error]} />
                                )}
                                <FieldDescription className="text-right">
                                    <Link to="/auth/forgot-password" className="underline underline-offset-4">
                                        Forgot password?
                                    </Link>
                                </FieldDescription>
                            </Field>
                        )}
                    />

                    {inVerification && (
                        <Field>
                            <FieldLabel htmlFor="form-login-code">Verification code</FieldLabel>
                            <Input
                                id="form-login-code"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                placeholder="6-digit code from your email"
                                value={verificationCode}
                                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))}
                                disabled={!isLoaded || isVerifying}
                            />
                            <FieldDescription className="flex justify-between">
                                <button
                                    type="button"
                                    onClick={onResendCode}
                                    disabled={isVerifying}
                                    className="underline underline-offset-4 disabled:opacity-50"
                                >
                                    Resend code
                                </button>
                                <button
                                    type="button"
                                    onClick={onCancelVerification}
                                    disabled={isVerifying}
                                    className="underline underline-offset-4 disabled:opacity-50"
                                >
                                    Use a different account
                                </button>
                            </FieldDescription>
                        </Field>
                    )}

                    <Field>
                        <Button type="submit" form="login-form" disabled={!isLoaded || isBusy}>
                            {inVerification
                                ? (isVerifying ? "Verifying..." : "Verify and sign in")
                                : (isSubmitting ? "Signing in..." : "Submit")}
                        </Button>
                    </Field>
                    <FieldSeparator>Or Continue With</FieldSeparator>
                    <Field>
                        <Button
                            variant="outline"
                            type="button"
                            className="border-gray-300 hover:bg-gray-50"
                            disabled={!isLoaded || isBusy || inVerification}
                            onClick={onGoogleLogin}
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
                            {isGoogleLoading ? "Redirecting..." : "Login with Gmail"}
                        </Button>
                        <FieldDescription className="text-center">
                            Don&apos;t have an account?{" "}
                            <Link to="/auth/signup" className="underline underline-offset-4">
                                Sign up
                            </Link>
                        </FieldDescription>
                    </Field>
                </FieldGroup>
            </form>
        </>
    );
}
