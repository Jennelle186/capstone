import { useAuth, useUser } from "@clerk/clerk-react";
import { Navigate, Outlet, useLocation } from "react-router";
import AuthLoading from "@/components/auth/AuthLoading";

type AppRole = "student" | "adviser" | "admin";

function normalizeRole(value: unknown): AppRole {
  // Default to lowest privilege if the metadata is missing/malformed.
  if (typeof value !== "string") return "student";
  const role = value.trim().toLowerCase();
  if (role === "teacher") return "adviser";
  if (role === "student" || role === "adviser" || role === "admin") return role;
  return "student";
}

function homeForRole(role: AppRole): string {
  if (role === "adviser") return "/adviser/dashboard";
  if (role === "student") return "/student/dashboard";
  return "/admin/dashboard";
}

export default function RequireGuest() {
  const location = useLocation();
  const { isLoaded, userId, sessionClaims } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();

  // Invitation sign-up links carry a Clerk ticket in the query string.
  // Allow access to guest pages even when another user session exists,
  // so admins can open invite links directly and complete account switching.
  const hasInvitationTicket = new URLSearchParams(location.search).has("__clerk_ticket");

  // Wait until Clerk resolves the current session state.
  if (!isLoaded || !isUserLoaded) {
    return <AuthLoading />;
  }

  // Signed-in users should not access guest auth pages.
  if (userId && !hasInvitationTicket) {
    // Prefer session token claims, fall back to publicMetadata.
    const roleClaim = (sessionClaims as { role?: unknown } | null)?.role;
    const metadataRole = user?.publicMetadata?.role;
    const role = normalizeRole(roleClaim ?? metadataRole);
    return <Navigate to={homeForRole(role)} replace />;
  }

  return <Outlet />;
}
