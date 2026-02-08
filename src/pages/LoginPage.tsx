import LoginForm from "@/components/auth/LoginForm";
import AuthLayout from "@/layouts/AuthLayout";

export default function LoginPage() {
    return (
        <AuthLayout title="Welcome back" description="Enter your email to sign in to your account.">
            <LoginForm />
        </AuthLayout>
    );
}