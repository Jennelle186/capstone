import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";

export interface RetentionSettings {
  /** null means logs are kept forever. */
  retention_days: number | null;
  options: number[];
}

interface PurgeResponse {
  deleted: number;
}

async function readError(response: Response): Promise<string> {
  let message = `Request failed with status ${response.status}.`;
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    message = (payload.detail as string) ?? message;
  } catch {
    // Ignore non-JSON payloads.
  }
  return message;
}

export function useActivityLogRetention(onPurged?: () => void) {
  const getTokenRef = useStableToken();

  const [settings, setSettings] = useState<RetentionSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const requestWithAdminAuth = useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      const token = await getTokenRef.current();
      if (!token) throw new Error("Missing admin authentication token.");
      const response = await fetchWithClerkAuth(path, token, init);
      if (!response.ok) throw new Error(await readError(response));
      return response;
    },
    [getTokenRef],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await requestWithAdminAuth("/api/admin/activity-logs/settings");
        const data = (await response.json()) as RetentionSettings;
        if (!cancelled) setSettings(data);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load retention settings.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestWithAdminAuth]);

  const saveRetention = useCallback(
    async (retentionDays: number | null) => {
      setIsSaving(true);
      try {
        const response = await requestWithAdminAuth("/api/admin/activity-logs/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ retention_days: retentionDays }),
        });
        const data = (await response.json()) as RetentionSettings;
        setSettings(data);
        toast.success(
          data.retention_days === null
            ? "Activity logs will be kept forever."
            : `Activity logs will be kept for ${data.retention_days} days.`,
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save retention setting.");
      } finally {
        setIsSaving(false);
      }
    },
    [requestWithAdminAuth],
  );

  const purgeOlderThan = useCallback(
    async (days: number) => {
      setIsPurging(true);
      try {
        const response = await requestWithAdminAuth("/api/admin/activity-logs/purge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ older_than_days: days }),
        });
        const data = (await response.json()) as PurgeResponse;
        toast.success(
          data.deleted === 1
            ? "Deleted 1 activity log entry."
            : `Deleted ${data.deleted} activity log entries.`,
        );
        onPurged?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete activity logs.");
      } finally {
        setIsPurging(false);
      }
    },
    [requestWithAdminAuth, onPurged],
  );

  return { settings, isLoading, isSaving, isPurging, saveRetention, purgeOlderThan };
}
