import { useAuth, useUser } from "@clerk/clerk-react";
import { Navigate } from "react-router";
import AuthLoading from "@/components/auth/AuthLoading";

type AppRole = "student" | "teacher" | "admin";

function normalizeRole(value: unknown): AppRole {
  // If the role is missing or not a string, treat them as a student (least access).
  if (typeof value !== "string") return "student";
  const role = value.trim().toLowerCase();
  if (role === "student" || role === "teacher" || role === "admin") return role;
  return "student";
}

function homeForRole(role: AppRole): string {
  // Send each role to their own dashboard after login.
  if (role === "teacher") return "/teacher/dashboard";
  if (role === "student") return "/student/dashboard";
  return "/student/dashboard";
}

export default function PostAuthRedirectPage() {
  const { isLoaded: isAuthLoaded, userId, sessionClaims } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();

  // Wait for Clerk to finish loading before doing anything.
  if (!isAuthLoaded || !isUserLoaded) return <AuthLoading />;

  // If somehow not logged in, send to login page.
  if (!userId) return <Navigate to="/auth/login" replace />;

  // Get the user's role — first from their login token, then from their profile as backup.
  const roleClaim = (sessionClaims as { role?: unknown } | null)?.role;
  const metadataRole = user?.publicMetadata?.role;
  const role = normalizeRole(roleClaim ?? metadataRole);

  // Send them to the right dashboard based on their role.
  return <Navigate to={homeForRole(role)} replace />;
}
