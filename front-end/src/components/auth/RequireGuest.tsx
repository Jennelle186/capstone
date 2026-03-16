import { useAuth, useUser } from "@clerk/clerk-react";
import { Navigate, Outlet } from "react-router";
import AuthLoading from "@/components/auth/AuthLoading";

type AppRole = "student" | "teacher" | "admin";

function normalizeRole(value: unknown): AppRole {
  // Default to lowest privilege if the metadata is missing/malformed.
  if (typeof value !== "string") return "student";
  const role = value.trim().toLowerCase();
  if (role === "student" || role === "teacher" || role === "admin") return role;
  return "student";
}

function homeForRole(role: AppRole): string {
  if (role === "teacher") return "/teacher/dashboard";
  if (role === "student") return "/student/dashboard";
  return "/student/dashboard";
}

export default function RequireGuest() {
  const { isLoaded, userId, sessionClaims } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();

  // Wait until Clerk resolves the current session state.
  if (!isLoaded || !isUserLoaded) {
    return <AuthLoading />;
  }

  // Signed-in users should not access guest auth pages.
  if (userId) {
    // Prefer session token claims, fall back to publicMetadata.
    const roleClaim = (sessionClaims as { role?: unknown } | null)?.role;
    const metadataRole = user?.publicMetadata?.role;
    const role = normalizeRole(roleClaim ?? metadataRole);
    return <Navigate to={homeForRole(role)} replace />;
  }

  return <Outlet />;
}
