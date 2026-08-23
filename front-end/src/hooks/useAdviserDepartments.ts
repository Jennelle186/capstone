"use client";

import { useState, useEffect } from "react";
import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type { AdviserDepartment } from "@/types/adviser";

// Fetches the list of departments assigned to the adviser from
// GET /api/adviser/departments. When ``schoolYearId`` is provided, the list is
// scoped to that school year; otherwise the backend defaults to the active one.
export function useAdviserDepartments(schoolYearId?: string) {
  const getTokenRef = useStableToken();
  const [departments, setDepartments] = useState<AdviserDepartment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const token = await getTokenRef.current();
      if (!token) return;
      const url = schoolYearId
        ? `/api/adviser/departments?school_year_id=${schoolYearId}`
        : "/api/adviser/departments";
      const res = await fetchWithClerkAuth(url, token);
      if (res.ok && mounted) setDepartments(await res.json() as AdviserDepartment[]);
      if (mounted) setLoading(false);
    };
    void load();
    return () => { mounted = false; };
  }, [getTokenRef, schoolYearId]);

  return { departments, loading };
}