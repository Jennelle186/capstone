import LoginForm from "@/components/auth/LoginForm";
import AuthLayout from "@/layouts/AuthLayout";

export default function LoginPage() {
    return (
        <AuthLayout
            title="Sign in to the CCS Enrollment Document System"
            description="Official access for CCS students, teachers, and advisers at Western Mindanao State University."
        >
            <LoginForm />
        </AuthLayout>
    );
}
