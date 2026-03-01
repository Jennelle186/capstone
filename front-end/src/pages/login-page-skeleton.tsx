import LoginFormSkeleton from "@/components/auth/login-form-skeleton";
import AuthLayoutSkeleton from "@/layouts/auth-layout-skeleton";

export default function LoginPageSkeleton() {
  return (
    <AuthLayoutSkeleton>
      <LoginFormSkeleton />
    </AuthLayoutSkeleton>
  );
}
