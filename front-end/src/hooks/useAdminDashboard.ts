"use client";

import { useState, useEffect } from "react";
import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";

export interface DepartmentClearance {
  department_id: string;
  department_name: string;
  total_students: number;
  cleared_students: number;
  clearance_rate: number;
  adviser_count: number;
  adviser_names: string[];
}

interface RawDashboardKPI {
  school_year: string;
  total_submissions: number;
  weekly_new_submissions: number;
  pending_queue: number;
  pending_queue_weekly_delta: number;
  department_clearance: DepartmentClearance[];
}

export interface DashboardKPI {
  totalSubmissions: number;
  weeklyNewSubmissions: number;
  pendingQueue: number;
  pendingQueueWeeklyDelta: number;
  departmentClearance: DepartmentClearance[];
  schoolYear: string;
}

export function useAdminDashboard() {
  const getTokenRef = useStableToken();
  const [raw, setRaw] = useState<RawDashboardKPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) return;
        const res = await fetchWithClerkAuth("/api/admin/analytics/dashboard", token);
        if (!mounted) return;
        if (res.ok) {
          const json = await res.json() as RawDashboardKPI;
          setRaw(json);
        } else {
          setError("Failed to load dashboard data.");
        }
      } catch {
        if (mounted) setError("Failed to load dashboard data.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [getTokenRef]);

  const data: DashboardKPI | null = raw
    ? {
        totalSubmissions: raw.total_submissions,
        weeklyNewSubmissions: raw.weekly_new_submissions,
        pendingQueue: raw.pending_queue,
        pendingQueueWeeklyDelta: raw.pending_queue_weekly_delta,
        departmentClearance: raw.department_clearance,
        schoolYear: raw.school_year,
      }
    : null;

  return { data, loading, error };
}
