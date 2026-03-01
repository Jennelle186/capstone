import SignupForm from "@/components/auth/SignupForm";
import AuthLayout from "@/layouts/AuthLayout";

export default function SignupPage() {
  return (
    <AuthLayout
      title="Create an account"
      description="Enter your email to create a new account."
    >
      <SignupForm />
    </AuthLayout>
  );
}
