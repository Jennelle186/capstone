import { useAuth, useUser } from "@clerk/clerk-react";
import { Navigate, Outlet, useLocation } from "react-router";
import AuthLoading from "@/components/auth/AuthLoading";

type AppRole = "student" | "teacher" | "admin";

function normalizeRole(value: unknown): AppRole {
  // If the role is missing, not a string, or unrecognized, we fall back to "student"
  // (least access) to avoid accidentally giving someone more access than they should have.
  if (typeof value !== "string") return "student";
  const role = value.trim().toLowerCase();
  if (role === "student" || role === "teacher" || role === "admin") return role;
  return "student";
}

function homeForRole(role: AppRole): string {
  // Each role has its own dashboard. This keeps routes consistent with front-end/src/routes.tsx.
  // If an admin route is added later (e.g. "/admin/dashboard"), add it here too.
  if (role === "teacher") return "/teacher/dashboard";
  if (role === "student") return "/student/dashboard";
  return "/teacher/dashboard";
}

function RequireRole({ allow }: { allow: AppRole[] }) {
  const location = useLocation();
  const { isLoaded: isAuthLoaded, userId, sessionClaims } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();

  // Don't render anything until Clerk has fully loaded the session and user data.
  // Without this, role checks could run too early with incomplete data.
  if (!isAuthLoaded || !isUserLoaded) return <AuthLoading />;

  // If there's no logged-in user, redirect to the login page.
  // This also handles expired or invalid sessions.
  if (!userId) return <Navigate to="/auth/login" replace />;

  // We check the role from two places:
  // 1. sessionClaims — the role baked into the login token (faster, more reliable).
  // 2. publicMetadata — a fallback from the user's Clerk profile if claims aren't set yet.
  // The session claim is set up in Clerk Dashboard as: { "role": "{{user.public_metadata.role}}" }
  const roleClaim = (sessionClaims as { role?: unknown } | null)?.role;
  const metadataRole = user?.publicMetadata?.role;

  // Resolve the final role. Session claim takes priority over metadata.
  // NOTE: This only controls what the user sees in the UI (showing/hiding pages).
  const role = normalizeRole(roleClaim ?? metadataRole);

  // If the user's role isn't in the allowed list for this route,
  // redirect them to their own dashboard instead of showing an error.
  if (!allow.includes(role)) {
    return <Navigate to={homeForRole(role)} state={{ from: location }} replace />;
  }

  // Role is allowed — render the protected page.

  return <Outlet />;
}

// These are convenience wrappers used directly in the route config.
// Example in routes.tsx: { Component: RequireStudent, children: [...] }
export function RequireStudent() {
  return <RequireRole allow={["student"]} />;
}

export function RequireTeacher() {
  return <RequireRole allow={["teacher"]} />;
}

export default RequireRole;
