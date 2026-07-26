"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "react-router";
import { toast } from "sonner";
import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type {
  ExtractionField,
  ExtractionSection,
} from "@/components/common/document-detail/DocumentDetailModal";
import type {
  AdviserStudent,
  AdviserStudentSubmission,
} from "@/types/adviser-students";
import type {
  ReviewStatus,
  ReviewDeskStats,
  ExtractionItemRaw,
} from "../types";

interface ReviewDeskState {
  submissions?: AdviserStudentSubmission[];
}

export function useDocumentReviewDesk() {
  const { studentId, submissionId } = useParams();
  const location = useLocation();
  const state = location.state as ReviewDeskState | null;
  const getTokenRef = useStableToken();

  const [student, setStudent] = useState<AdviserStudent | null>(null);
  const [submissionsList, setSubmissionsList] = useState<AdviserStudentSubmission[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [scale, setScale] = useState(1.0);
  const [rotated, setRotated] = useState(0);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [extractionEdits, setExtractionEdits] = useState<
    Record<string, Record<string, string>>
  >({});
  const [extractionData, setExtractionData] = useState<
    Record<string, ExtractionSection[]>
  >({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [flagReasons, setFlagReasons] = useState<Record<string, string>>({});
  const [classificationResults, setClassificationResults] = useState<
    Record<string, Record<string, unknown> | null>
  >({});
  const [submittedFlags, setSubmittedFlags] = useState<Record<string, boolean>>({});

  const mapExtractions = useCallback((raw: ExtractionItemRaw | null) => {
    if (!raw || !raw.fields) return [];
    const grouped = new Map<string, ExtractionField[]>();
    for (const f of raw.fields) {
      const title = f.section_title ?? "Extracted Fields";
      if (!grouped.has(title)) grouped.set(title, []);
      grouped.get(title)!.push({
        label: f.description || f.key,
        value: f.value || "",
        verified: !f.needs_review,
        confidence: `${Math.round(f.confidence * 100)}%`,
        warning: f.needs_review || f.confidence < 0.7,
        _raw: {
          id: f.id,
          key: f.key,
          type: f.type,
          required: f.required,
          ui_component: f.ui_component,
          options: f.options,
          confidence: f.confidence,
          is_computed: (f as { is_computed?: boolean }).is_computed ?? false,
        },
      });
    }
    return Array.from(grouped.entries()).map(([title, fields]) => ({ title, fields }));
  }, []);

  // Cross-student mode: use submissions from route state
  const stateSubmissions = state?.submissions;
  const isCrossStudentMode = !!stateSubmissions && stateSubmissions.length > 0;

  useEffect(() => {
    // Cross-student mode: submissions passed via route state
    if (isCrossStudentMode) {
      let mounted = true;

      const load = async () => {
        setSubmissionsList(stateSubmissions);

        let idx = 0;
        if (submissionId) {
          const found = stateSubmissions.findIndex((sub) => sub.id === submissionId);
          if (found !== -1) idx = found;
        }
        setCurrentIndex(idx);

        // Eagerly fetch extractions for all submissions
        const extractionPromises = stateSubmissions.map(async (sub) => {
          try {
            const t = await getTokenRef.current();
            if (!t) return null;
            const eres = await fetchWithClerkAuth(
              `/api/adviser/submissions/${sub.id}/extractions`,
              t,
            );
            if (!eres.ok) return { id: sub.id, sections: [], classification: null };
            const raw: ExtractionItemRaw | null = await eres.json();
            return {
              id: sub.id,
              sections: mapExtractions(raw),
              classification: raw?.classification_result ?? null,
            };
          } catch {
            return { id: sub.id, sections: [], classification: null };
          }
        });

        const results = await Promise.all(extractionPromises);
        if (!mounted) return;

        const dataMap: Record<string, ExtractionSection[]> = {};
        const classMap: Record<string, Record<string, unknown> | null> = {};
        for (const r of results) {
          if (r) {
            dataMap[r.id] = r.sections;
            classMap[r.id] = r.classification;
          }
        }
        setExtractionData(dataMap);
        setClassificationResults(classMap);

        if (results[idx]?.sections.length) {
          setActiveSectionId(results[idx]?.sections[0]?.title ?? "");
        }

        if (mounted) setLoading(false);
      };

      void load();
      return () => { mounted = false; };
    }

    // Per-student mode: fetch from API
    if (!studentId) return;
    let mounted = true;

    const load = async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) return;

        const res = await fetchWithClerkAuth(
          `/api/adviser/students/${studentId}`,
          token,
        );
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        if (!mounted) return;

        const s: AdviserStudent = {
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
          created_at: data.created_at ?? "",
        };
        const subs = (data.submissions ?? []) as AdviserStudentSubmission[];

        setStudent(s);
        setSubmissionsList(subs);

        let idx = 0;
        if (submissionId) {
          const found = subs.findIndex((sub) => sub.id === submissionId);
          if (found !== -1) idx = found;
        }
        setCurrentIndex(idx);

        if (subs.length > 0) {
          const extractionPromises = subs.map(async (sub) => {
            try {
              const t = await getTokenRef.current();
              if (!t) return null;
              const eres = await fetchWithClerkAuth(
                `/api/adviser/submissions/${sub.id}/extractions`,
                t,
              );
              if (!eres.ok) return { id: sub.id, sections: [], classification: null };
              const raw: ExtractionItemRaw | null = await eres.json();
              return {
                id: sub.id,
                sections: mapExtractions(raw),
                classification: raw?.classification_result ?? null,
              };
            } catch {
              return { id: sub.id, sections: [], classification: null };
            }
          });

          const results = await Promise.all(extractionPromises);
          if (!mounted) return;

          const dataMap: Record<string, ExtractionSection[]> = {};
          const classMap: Record<string, Record<string, unknown> | null> = {};
          for (const r of results) {
            if (r) {
              dataMap[r.id] = r.sections;
              classMap[r.id] = r.classification;
            }
          }
          setExtractionData(dataMap);
          setClassificationResults(classMap);

          if (results[0]?.sections.length) {
            setActiveSectionId(results[0].sections[0].title);
          }
        }
      } catch (err) {
        console.error("Failed to load student detail:", err);
        toast.error("Failed to load review data");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => { mounted = false; };
  }, [studentId, submissionId, stateSubmissions, getTokenRef, mapExtractions]);

  const currentSubmission =
    currentIndex >= 0 ? submissionsList[currentIndex] ?? null : null;

  // ── Refresh student data from API (per-student mode only) ─────────
  const refreshStudentData = useCallback(async () => {
    if (!studentId) return;
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      const res = await fetchWithClerkAuth(
        `/api/adviser/students/${studentId}`,
        token,
      );
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();

      const s: AdviserStudent = {
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
        created_at: data.created_at ?? "",
      };
      const subs = (data.submissions ?? []) as AdviserStudentSubmission[];

      setStudent(s);
      setSubmissionsList(subs);

      // Preserve current index if the submission still exists; otherwise stay at 0
      setCurrentIndex((prevIdx) => {
        if (prevIdx >= 0 && prevIdx < subs.length && subs[prevIdx]) {
          return prevIdx;
        }
        return 0;
      });

      if (subs.length > 0) {
        const extractionPromises = subs.map(async (sub) => {
          try {
            const t = await getTokenRef.current();
            if (!t) return null;
            const eres = await fetchWithClerkAuth(
              `/api/adviser/submissions/${sub.id}/extractions`,
              t,
            );
            if (!eres.ok) return { id: sub.id, sections: [], classification: null };
            const raw: ExtractionItemRaw | null = await eres.json();
            return {
              id: sub.id,
              sections: mapExtractions(raw),
              classification: raw?.classification_result ?? null,
            };
          } catch {
            return { id: sub.id, sections: [], classification: null };
          }
        });

        const results = await Promise.all(extractionPromises);
        const dataMap: Record<string, ExtractionSection[]> = {};
        const classMap: Record<string, Record<string, unknown> | null> = {};
        for (const r of results) {
          if (r) {
            dataMap[r.id] = r.sections;
            classMap[r.id] = r.classification;
          }
        }
        setExtractionData(dataMap);
        setClassificationResults(classMap);
      }
    } catch (err) {
      console.error("Failed to refresh student data:", err);
      toast.error("Failed to refresh review data");
    }
  }, [studentId, getTokenRef, mapExtractions]);

  // Derive student info from current submission when in cross-student mode
  const currentStudentFromSubmission = currentSubmission
    ? {
        id: currentSubmission.student_id,
        name: currentSubmission.student_name ?? "Unknown",
        student_number: currentSubmission.student_number ?? null,
      }
    : null;

  const displayStudent = student ?? currentStudentFromSubmission;

  const fetchPreviewUrl = useCallback(
    async (subId: string) => {
      const token = await getTokenRef.current();
      if (!token) return;
      try {
        const res = await fetchWithClerkAuth(
          `/api/adviser/submissions/${subId}/download-url`,
          token,
        );
        if (!res.ok) { setPreviewUrl(null); return; }
        const d = await res.json();
        setPreviewUrl(d.url as string);
      } catch {
        setPreviewUrl(null);
      }
    },
    [getTokenRef],
  );

  useEffect(() => {
    if (!currentSubmission) return;
    void fetchPreviewUrl(currentSubmission.id);
  }, [currentSubmission?.id, fetchPreviewUrl]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setActiveSectionId("");
      setScale(1.0);
      setRotated(0);
    } else {
      toast.info("You are at the beginning of the queue");
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < submissionsList.length - 1) {
      setCurrentIndex((i) => i + 1);
      setActiveSectionId("");
      setScale(1.0);
      setRotated(0);
    } else {
      toast.info("You've reached the end of the queue");
    }
  }, [currentIndex, submissionsList.length]);

  const handleFieldChange = useCallback(
    (key: string, value: string) => {
      if (!currentSubmission) return;
      setExtractionEdits((prev) => {
        const currentEdits = prev[currentSubmission.id] ?? {};
        return {
          ...prev,
          [currentSubmission.id]: { ...currentEdits, [key]: value },
        };
      });
    },
    [currentSubmission],
  );

  const handleFlagReasonChange = useCallback(
    (submissionId: string, reason: string) => {
      setFlagReasons((prev) => ({ ...prev, [submissionId]: reason }));
    },
    [],
  );

  const getFieldValue = useCallback(
    (key: string): string => {
      if (!currentSubmission) return "";
      const edits = extractionEdits[currentSubmission.id];
      if (edits?.[key] !== undefined) return edits[key];
      const ef = currentSubmission.extraction_fields as Record<string, unknown>;
      return String(ef?.[key] ?? "");
    },
    [currentSubmission, extractionEdits],
  );

  const handleUpdateStatus = useCallback(
    async (status: ReviewStatus) => {
      if (!currentSubmission) return;
      try {
        setActioning(true);

        if (status === "verified") {
          const token = await getTokenRef.current();
          if (!token) return;
          const res = await fetchWithClerkAuth(
            `/api/adviser/submissions/${currentSubmission.id}/verify`,
            token,
            { method: "PATCH" },
          );
          if (!res.ok) {
            toast.error("Failed to verify document on server", { position: "top-right" });
            return;
          }
          // Sync with backend to ensure UI reflects the true state (single-student mode only)
          if (!isCrossStudentMode) {
            await refreshStudentData();
          }
        }

        setSubmissionsList((prev) => {
          const next = [...prev];
          next[currentIndex] = { ...next[currentIndex], status };
          return next;
        });
        if (status === "flagged") {
          setFlagReasons((prev) => {
            if (prev[currentSubmission.id]) return prev;
            return { ...prev, [currentSubmission.id]: "" };
          });
        }
        if (status === "verified") {
          toast.success(
            `${currentSubmission.document_type} verified successfully`,
            { position: "top-right" },
          );
          if (autoAdvance && currentIndex < submissionsList.length - 1) {
            setTimeout(() => {
              setCurrentIndex((i) => i + 1);
              setScale(1.0);
              setRotated(0);
            }, 500);
          }
        }
      } catch {
        toast.error("Failed to update status", { position: "top-right" });
      } finally {
        setActioning(false);
      }
    },
    [currentSubmission, currentIndex, submissionsList.length, autoAdvance, getTokenRef, refreshStudentData, isCrossStudentMode],
  );

  const handleSubmitFlag = useCallback(async () => {
    if (!currentSubmission) return;
    const reason = flagReasons[currentSubmission.id];
    if (!reason || !reason.trim()) {
      toast.error("Please provide a reason for flagging", { position: "top-right" });
      return;
    }
    try {
      setActioning(true);
      const token = await getTokenRef.current();
      if (!token) return;
      const res = await fetchWithClerkAuth(
        `/api/adviser/submissions/${currentSubmission.id}/flag`,
        token,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      if (!res.ok) {
        toast.error("Failed to flag document on server", { position: "top-right" });
        return;
      }
      setSubmittedFlags((prev) => ({ ...prev, [currentSubmission.id]: true }));
      toast.success(
        `${currentSubmission.document_type} flagged: ${reason.trim()}`,
        { position: "top-right" },
      );
      // Sync with backend to ensure UI reflects the true state (single-student mode only)
      if (!isCrossStudentMode) {
        await refreshStudentData();
      }
    } catch {
      toast.error("Failed to flag document", { position: "top-right" });
    } finally {
      setActioning(false);
    }
  }, [currentSubmission, flagReasons, getTokenRef, refreshStudentData, isCrossStudentMode]);

  const handleSaveField = useCallback(
    async (fieldId: string, value: string) => {
      if (!currentSubmission) return;
      try {
        const token = await getTokenRef.current();
        if (!token) return;

        const res = await fetchWithClerkAuth(
          `/api/adviser/submissions/${currentSubmission.id}/extractions`,
          token,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field_id: fieldId, value }),
          },
        );

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.error("Save field failed:", errBody);
          toast.error("Failed to save field", { position: "top-right" });
          return;
        }

        setExtractionEdits((prev) => {
          const currentEdits = prev[currentSubmission.id];
          if (!currentEdits) return prev;
          const rest = { ...currentEdits };
          delete rest[fieldId];
          return { ...prev, [currentSubmission.id]: rest };
        });

        setExtractionData((prev) => {
          const sections = prev[currentSubmission.id];
          if (!sections) return prev;
          const updatedSections = sections.map((sec) => ({
            ...sec,
            fields: sec.fields.map((f) => {
              if (f._raw?.id === fieldId) {
                return { ...f, value, verified: true, warning: false, _raw: f._raw ? { ...f._raw, confidence: 1.0 } : undefined };
              }
              return f;
            }),
          }));
          return { ...prev, [currentSubmission.id]: updatedSections };
        });

        toast.success("Field saved", { position: "top-right" });
      } catch {
        toast.error("Failed to save field", { position: "top-right" });
      }
    },
    [currentSubmission, getTokenRef],
  );

  const getReviewQueueStatistics = useCallback((): ReviewDeskStats => {
    const total = submissionsList.length;
    const verified = submissionsList.filter((s) => s.status === "verified").length;
    const flagged = submissionsList.filter((s) => s.status === "flagged").length;
    const pending = submissionsList.filter(
      (s) => s.status === "submitted" || s.status === "in-review",
    ).length;
    return { total, verified, flagged, pending };
  }, [submissionsList]);

  const stats = getReviewQueueStatistics();

  const currentExtractions =
    currentSubmission && extractionData[currentSubmission.id]
      ? extractionData[currentSubmission.id]
      : [];

  return {
    student: displayStudent,
    currentSubmission,
    submissionsList,
    currentIndex,
    setCurrentIndex,
    loading,
    actioning,
    sidebarOpen,
    setSidebarOpen,
    autoAdvance,
    setAutoAdvance,
    scale,
    setScale,
    rotated,
    setRotated,
    activeSectionId,
    setActiveSectionId,
    previewUrl,
    currentExtractions,
    classificationResults,
    stats,
    handlePrev,
    handleNext,
    flagReasons,
    submittedFlags,
    handleFieldChange,
    handleFlagReasonChange,
    getFieldValue,
    handleUpdateStatus,
    handleSubmitFlag,
    handleSaveField,
  };
}
