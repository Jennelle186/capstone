import LoginForm from "@/components/auth/LoginForm";
import AuthLayout from "@/layouts/AuthLayout";
import { usePublicBranding } from "@/hooks/usePublicBranding";

export default function LoginPage() {
    const { branding } = usePublicBranding();

    return (
        <AuthLayout
            title={`Sign in to the ${branding.institution_name} Enrollment Document System`}
            description={`Official access for ${branding.institution_name} students, teachers, and advisers at Western Mindanao State University.`}
        >
            <LoginForm />
        </AuthLayout>
    );
}
