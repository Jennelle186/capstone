import { useAuth } from "@clerk/clerk-react";
import { Navigate, Outlet } from "react-router";

export default function RequireAuth() {
  const { isLoaded, userId } = useAuth();

  // Wait for Clerk session hydration before deciding route access.
  if (!isLoaded) {
    return null;
  }

  if (!userId) {
    return <Navigate to="/auth/login" replace />;
  }

  return <Outlet />;
}
