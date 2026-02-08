import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "sonner"
import { Field, FieldError, FieldGroup, FieldLabel } from '../ui/field';
import { loginSchema, type LoginFormData } from '@/schemas/auth.schema';

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
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold tracking-tight mb-2">
                    Welcome
                </h1>
                <p className="text-muted-foreground">
                    Sign in to your account to upload your enrolment documents and manage your submissions.
                </p>
            </div>

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
                    <Field orientation="horizontal">
                        <Button type="submit" form="login-form">
                            Submit
                        </Button>
                    </Field>
                </FieldGroup>
            </form>




            <div className="mt-6 text-center text-sm">
                <p className="text-muted-foreground">
                    Don't have an account?{' '}
                    <a href="/signup" className="text-indigo-500 hover:underline font-medium">
                        Sign up
                    </a>
                </p>
            </div>
        </>
    );
}