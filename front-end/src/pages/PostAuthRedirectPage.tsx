import { useAuth, useUser } from "@clerk/clerk-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router";

import AuthLoading from "@/components/auth/AuthLoading";
import { fetchWithClerkAuth } from "@/lib/api";

type AppRole = "student" | "adviser" | "admin";

// Normalize role values from Clerk claims or metadata to our app's expected roles, with a fallback to "student" for any unrecognized or missing values.
// This ensures that even if the authentication data is incomplete or malformed, we can safely default to the least privileged role.
function normalizeRole(value: unknown): AppRole {
  // Normalize historical "teacher" role naming to "adviser" for route compatibility.
  if (typeof value !== "string") return "student";
  const role = value.trim().toLowerCase();
  if (role === "teacher") return "adviser";
  if (role === "student" || role === "adviser" || role === "admin") return role;
  return "student";
}

// Determine the appropriate home route based on the user's role,
// directing them to their respective dashboard.
function homeForRole(role: AppRole): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "adviser") return "/adviser/dashboard";
  return "/student/dashboard";
}

export default function PostAuthRedirectPage() {
  const { isLoaded: isAuthLoaded, userId, sessionClaims, getToken } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const [resolvedRole, setResolvedRole] = useState<AppRole | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  // First pass role source from Clerk token/profile.
  const roleClaim = (sessionClaims as { role?: unknown } | null)?.role;
  const metadataRole = user?.publicMetadata?.role;
  const fallbackRole = useMemo(() => normalizeRole(roleClaim ?? metadataRole), [roleClaim, metadataRole]);

  useEffect(() => {
    if (!isAuthLoaded || !isUserLoaded) {
      setIsBootstrapping(true);
      return;
    }

    if (!userId) {
      setResolvedRole(null);
      setIsBootstrapping(false);
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      setIsBootstrapping(true);
      try {
        // Trigger backend upsert/finalization so invitation acceptance provisions local tables.
        const token = await getToken();
        if (!token) {
          if (!cancelled) setResolvedRole(fallbackRole);
          return;
        }

        const response = await fetchWithClerkAuth("/api/me", token);
        if (!response.ok) {
          if (!cancelled) setResolvedRole(fallbackRole);
          return;
        }

        const payload = (await response.json()) as { role?: unknown };
        if (!cancelled) {
          setResolvedRole(normalizeRole(payload.role ?? fallbackRole));
        }
      } catch {
        if (!cancelled) setResolvedRole(fallbackRole);
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [fallbackRole, getToken, isAuthLoaded, isUserLoaded, userId]);

  if (!isAuthLoaded || !isUserLoaded) return <AuthLoading />;
  if (!userId) return <Navigate to="/auth/login" replace />;

  if (isBootstrapping) return <AuthLoading />;
  return <Navigate to={homeForRole(resolvedRole ?? fallbackRole)} replace />;
}
