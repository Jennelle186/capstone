"use client";

import { useState, useEffect } from "react";
import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type { SchoolYear } from "@/types/adviser-students";

export function useAdviserSchoolYears() {
  const getTokenRef = useStableToken();
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const token = await getTokenRef.current();
      if (!token) return;
      const res = await fetchWithClerkAuth("/api/adviser/school-years", token);
      if (res.ok && mounted) setYears(await res.json() as SchoolYear[]);
      if (mounted) setLoading(false);
    };
    void load();
    return () => { mounted = false; };
  }, [getTokenRef]);

  return { years, loading };
}
