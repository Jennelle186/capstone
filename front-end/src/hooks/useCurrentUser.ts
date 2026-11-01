import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

import { fetchWithClerkAuth } from "@/lib/api";

export type AppRole = "student" | "adviser" | "admin";

interface CurrentUserState {
    role: AppRole | null;
    isAdviser: boolean;
}

function toAppRole(value: unknown): AppRole | null {
    if (value === "student" || value === "adviser" || value === "admin") return value;
    return null;
}

/**
 * Fetch the current user's role + adviser status from GET /api/me.
 * Used to conditionally show cross-portal links (admin <-> adviser).
 */
export function useCurrentUser(): CurrentUserState {
    const { getToken } = useAuth();
    const [state, setState] = useState<CurrentUserState>({ role: null, isAdviser: false });

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const token = await getToken();
                if (!token) return;
                const response = await fetchWithClerkAuth("/api/me", token);
                if (!response.ok) return;
                const payload = (await response.json()) as { role?: unknown; is_adviser?: unknown };
                if (cancelled) return;
                setState({
                    role: toAppRole(payload.role),
                    isAdviser: Boolean(payload.is_adviser),
                });
            } catch {
                // Ignore — defaults to no portal links.
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, [getToken]);

    return state;
}
