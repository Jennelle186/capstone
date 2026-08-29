"use client";

import { useState, useEffect } from "react";
import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type { AdviserStudent, AdviserSlot, AdviserStudentSubmission } from "@/types/adviser-students";

export function useStudentDetail(id: string | undefined) {
  const getTokenRef = useStableToken();
  const [student, setStudent] = useState<AdviserStudent | null>(null);
  const [submissions, setSubmissions] = useState<AdviserStudentSubmission[]>([]);
  const [slots, setSlots] = useState<AdviserSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    setError(null);
    let mounted = true;
    const load = async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) return;
        const res = await fetchWithClerkAuth(`/api/adviser/students/${id}`, token);
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        if (!mounted) return;
        setStudent({
          id: data.id, name: data.name, initials: data.initials,
          student_number: data.student_number ?? null, email: data.email ?? null,
          image_url: data.image_url ?? null,
          program: data.program ?? "", school_year: data.school_year ?? "",
          classification: data.classification ?? "freshman",
          application_status: data.application_status ?? null,
          documents_submitted: data.documents_submitted ?? 0,
          documents_total: data.documents_total ?? 0,
          completion_pct: data.completion_pct ?? 0,
          gender: data.gender ?? null, cet_score: data.cet_score ?? null,
          gpa: data.gpa ?? null, high_school: data.high_school ?? null,
          provincial_address: data.provincial_address ?? null,
          program_id: data.program_id ?? null,
          program_mismatch_pending: data.program_mismatch_pending ?? false,
          program_mismatch_extracted: data.program_mismatch_extracted ?? null,
          extracted_analytics: data.extracted_analytics ?? {},
          unmapped_data: data.unmapped_data ?? [],
          created_at: data.created_at ?? "",
        });
        setSubmissions((data.submissions as AdviserStudentSubmission[]) ?? []);
        setSlots((data.slots as AdviserSlot[]) ?? []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [getTokenRef, id]);

  return { student, submissions, slots, loading, error };
}
