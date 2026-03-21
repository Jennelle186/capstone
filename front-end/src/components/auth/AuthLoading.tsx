import LoadingPage from "@/components/LoadingPage";

export default function AuthLoading() {
  // Global loading page for any route while Clerk hydrates auth + user state.
  return <LoadingPage />;
}
