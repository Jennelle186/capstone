"use client";

import { useState, useEffect, useCallback } from "react";
import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type { DashboardStats } from "@/types/adviser-dashboard";
import type { SchoolYear } from "@/types/adviser-students";

interface ArchivedAnalytics {
  school_year: string;
  total_students: number;
  total_submissions: number;
  verification_rate: number;
  avg_processing_days: number | null;
  status_distribution: { status: string; count: number }[];
  monthly_submissions: { month: string; count: number }[];
}

export function useAdviserAnalytics() {
  const getTokenRef = useStableToken();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [archived, setArchived] = useState<ArchivedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchForYear = useCallback(async (yearId: string) => {
    const token = await getTokenRef.current();
    if (!token) return;
    const res = await fetchWithClerkAuth(`/api/adviser/archived?school_year_id=${yearId}`, token);
    if (res.ok) {
      const data = await res.json() as { analytics: ArchivedAnalytics };
      setArchived(data.analytics);
    }
  }, [getTokenRef]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) return;
        const [statsRes, yearsRes] = await Promise.all([
          fetchWithClerkAuth("/api/adviser/analytics", token),
          fetchWithClerkAuth("/api/adviser/school-years", token),
        ]);
        if (!mounted) return;
        if (statsRes.ok) setStats(await statsRes.json() as DashboardStats);
        if (yearsRes.ok) {
          const years = await yearsRes.json() as SchoolYear[];
          if (!mounted) return;
          const active = years.find((y) => y.is_current) || years[0];
          if (active) {
            const aRes = await fetchWithClerkAuth(`/api/adviser/archived?school_year_id=${active.id}`, token);
            if (aRes.ok && mounted) {
              const d = await aRes.json() as { analytics: ArchivedAnalytics };
              setArchived(d.analytics);
            }
          }
        }
      } catch {
        if (mounted) setError("Failed to load analytics data.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [getTokenRef]);

  return { stats, archived, loading, error, fetchForYear };
}
