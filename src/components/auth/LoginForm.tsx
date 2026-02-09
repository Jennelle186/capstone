import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "sonner"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from '../ui/field';
import { loginSchema, type LoginFormData } from '@/schemas/auth.schema';
import { Link } from 'react-router';

export default function LoginForm() {
    //zod form
    const form = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    })

    async function onSubmit(data: LoginFormData) {
        try {
            console.log("Form submitted:", data);
            // TODO: Make API call here
            // const response = await loginUser(data);
            toast.success("Login successful!", { position: "bottom-right" });
            // TODO: Handle redirect or navigation
        } catch (error) {
            console.error("Form submission error:", error);
            toast.error("Login failed. Please try again.", { position: "bottom-right" });
        }
    }


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
                                <Input
                                    {...field}
                                    id="form-login-password"
                                    type="password"
                                    placeholder="Enter your password"
                                />
                                {fieldState.invalid && (
                                    <FieldError errors={[fieldState.error]} />
                                )}
                            </Field>
                        )}
                    />
                    <Field>
                        <Button type="submit" form="login-form">
                            Submit
                        </Button>
                    </Field>
                    <FieldSeparator>Or Continue With</FieldSeparator>
                    <Field>
                        <Button variant="outline" type="button" className="border-gray-300 hover:bg-gray-50">
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
                            Login with Gmail
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