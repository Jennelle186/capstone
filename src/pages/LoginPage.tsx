import LoginForm from "@/components/auth/LoginForm";
import AuthLayout from "@/layouts/AuthLayout";

export default function LoginPage() {
    return (
        <AuthLayout
            imageUrl=""
            imageAlt=""
        >
            <LoginForm />
        </AuthLayout>
    );
}