import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import AuthLayout from "@/layouts/AuthLayout";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Forgot your password?"
      description="Enter your email and we'll send you a link to reset your password."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
