import SignupFormSkeleton from "@/components/auth/signup-form-skeleton";
import AuthLayoutSkeleton from "@/layouts/auth-layout-skeleton";

export default function SignupPageSkeleton() {
  return (
    <AuthLayoutSkeleton>
      <SignupFormSkeleton />
    </AuthLayoutSkeleton>
  );
}
