import { useAuth } from "@clerk/clerk-react";
import { Navigate, Outlet } from "react-router";

export default function RequireGuest() {
  const { isLoaded, userId } = useAuth();

  // Wait until Clerk resolves the current session state.
  if (!isLoaded) {
    return null;
  }

  // Signed-in users should not access guest auth pages.
  if (userId) {
    return <Navigate to="/student/dashboard" replace />;
  }

  return <Outlet />;
}
