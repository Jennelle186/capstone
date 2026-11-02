import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import { readApiErrorMessage } from "@/lib/apiError";
import type { AdminSetupStatus } from "@/types/tutorial";

/** Loads what the setup checklist needs from the server (read-only). */
export function useAdminSetupStatus() {
  const getTokenRef = useStableToken();
  const [status, setStatus] = useState<AdminSetupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) throw new Error("Missing admin authentication token.");
        const response = await fetchWithClerkAuth("/api/admin/setup-status", token);
        if (!response.ok) throw new Error(await readApiErrorMessage(response));
        const data = (await response.json()) as AdminSetupStatus;
        if (!cancelled) setStatus(data);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Could not load the setup checklist.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getTokenRef]);

  return { status, isLoading };
}
