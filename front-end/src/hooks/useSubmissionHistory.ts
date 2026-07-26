"use client";

import { useState, useEffect, useCallback } from "react";
import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type { SubmissionHistoryEntry } from "@/types/submission-history";

export function useSubmissionHistory(
  submissionId: string | null | undefined,
  endpoint: "student" | "adviser" = "student",
) {
  const getTokenRef = useStableToken();
  const [entries, setEntries] = useState<SubmissionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      const path =
        endpoint === "adviser"
          ? `/api/adviser/submissions/${submissionId}/history`
          : `/api/me/documents/${submissionId}/history`;
      const res = await fetchWithClerkAuth(path, token);
      if (res.ok) {
        const data: SubmissionHistoryEntry[] = await res.json();
        setEntries(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [submissionId, endpoint, getTokenRef]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { entries, loading, refetch: fetch };
}
