"use client";

import { useState, useEffect, useCallback } from "react";
import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type { RecentSubmission, AdviserSubmissionStatus } from "@/types/adviser-dashboard";

interface AdviserSubmissionRaw {
  id: string;
  student_id: string;
  student_name: string;
  student_number: string | null;
  initials: string;
  document_type_name: string | null;
  status: string;
  created_at: string;
}

const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700", "bg-blue-100 text-blue-700",
  "bg-red-100 text-red-700", "bg-amber-100 text-amber-700",
  "bg-purple-100 text-purple-700", "bg-pink-100 text-pink-700",
  "bg-cyan-100 text-cyan-700", "bg-orange-100 text-orange-700",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function useAdviserSubmissions(departmentId?: string | null, propData?: RecentSubmission[]) {
  const getTokenRef = useStableToken();
  const [data, setData] = useState<RecentSubmission[]>(() => propData ?? []);
  const [loading, setLoading] = useState(() => (propData ? false : true));

  const loadData = useCallback(async () => {
    const token = await getTokenRef.current();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const params = departmentId ? `?department_id=${departmentId}` : "";
      const res = await fetchWithClerkAuth(`/api/adviser/submissions${params}`, token);
      if (!res.ok) {
        setData([]);
        setLoading(false);
        return;
      }
      const items = (await res.json()) as AdviserSubmissionRaw[];
      setData(items.map((item) => ({
        id: item.id,
        initials: item.initials,
        name: item.student_name,
        studentId: item.student_id,
        studentNumber: item.student_number,
        documentType: item.document_type_name ?? "Unclassified",
        submittedAt: item.created_at,
        avatarColor: getAvatarColor(item.student_name),
        status: item.status as AdviserSubmissionStatus,
      })));
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [getTokenRef, departmentId]);

  useEffect(() => {
    if (propData) return;
    void loadData();
  }, [loadData, propData]);

  return { data, loading };
}
