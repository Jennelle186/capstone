"use client";

import { useState, useEffect } from "react";
import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type { AdviserStudent } from "@/types/adviser-students";

export function useAdviserStudents(schoolYearId?: string) {
  const getTokenRef = useStableToken();
  const [students, setStudents] = useState<AdviserStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) return;
        const params = schoolYearId ? `?school_year_id=${schoolYearId}` : "";
        const res = await fetchWithClerkAuth(`/api/adviser/students${params}`, token);
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json() as AdviserStudent[];
        if (mounted) setStudents(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [getTokenRef, schoolYearId]);

  return { students, loading, error };
}
