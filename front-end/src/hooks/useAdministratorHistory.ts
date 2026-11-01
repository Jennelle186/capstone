import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type { AdminHistoryPerson } from "@/types/adminHistory";

/** Loads the administrator timeline once when mounted. Mount it only when the History tab is open. */
export function useAdministratorHistory() {
  const getTokenRef = useStableToken();
  const [people, setPeople] = useState<AdminHistoryPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) throw new Error("Missing admin authentication token.");
        const response = await fetchWithClerkAuth("/api/admin/admins/history", token);
        if (!response.ok) {
          let message = `Request failed with status ${response.status}.`;
          try {
            const payload = (await response.json()) as Record<string, unknown>;
            message = (payload.detail as string) ?? message;
          } catch {
            // Ignore non-JSON payloads.
          }
          throw new Error(message);
        }
        const data = (await response.json()) as AdminHistoryPerson[];
        if (!cancelled) setPeople(data);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load administrator history.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getTokenRef]);

  return { people, isLoading };
}
