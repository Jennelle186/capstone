import LoginPageSkeleton from "@/pages/login-page-skeleton";

export default function AuthLoading() {
  // Reusable loading UI while Clerk hydrates auth + user state.
  // We render the login skeleton to avoid a blank screen during protected route checks.
  return <LoginPageSkeleton />;
}

