"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "@clerk/clerk-react";
import { AlertTriangle } from "lucide-react";
import UploadWizard from "@/components/student/UploadDocuments/UploadWizard";
import StepUpload from "@/components/student/UploadDocuments/upload/StepUpload";
import StepClassify from "@/components/student/UploadDocuments/classify/StepClassify";
import StepExtract from "@/components/student/UploadDocuments/extract/StepExtract";
import StepSubmit from "@/components/student/UploadDocuments/submit/StepSubmit";
import { fetchWithClerkAuth } from "@/lib/api";
import type { RequiredDocument } from "@/types/student";
import type { SlotStatusResponse, RequiredSlotsResponse } from "@/types/requirement";
import type { ConfirmUploadResponse, SubmissionDetail } from "@/types/submission";

const CLAMP = (n: number) => Math.max(1, Math.min(4, n));

export default function UploadDocuments() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requiredDocs, setRequiredDocs] = useState<RequiredDocument[]>([]);
  const [requiredSlots, setRequiredSlots] = useState<SlotStatusResponse[]>([]);
  const [classificationComplete, setClassificationComplete] = useState(false);
  const [extractionComplete, setExtractionComplete] = useState(false);
  const [existingSubmissions, setExistingSubmissions] = useState<SubmissionDetail[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sessionUploadIds, setSessionUploadIds] = useState<Set<string>>(new Set());
  const [schoolYearClosed, setSchoolYearClosed] = useState(false);
  const [schoolYearName, setSchoolYearName] = useState<string | null>(null);

  const replaceSubmissionId = searchParams.get("replace");

  const getExtractedData = (submission: SubmissionDetail) =>
    (submission as unknown as { extracted_data?: unknown; extractedData?: unknown }).extracted_data ??
    (submission as unknown as { extracted_data?: unknown; extractedData?: unknown }).extractedData;

  const hasExtractionData = existingSubmissions.some(
    (s) => s.document_type_id && getExtractedData(s)
  );

  const maxAccessibleStep = Math.min(
    4,
    extractionComplete ? 4 : hasExtractionData ? 4 : classificationComplete ? 3 : 2,
  );

  const rawStep = parseInt(searchParams.get("step") ?? "1", 10) || 1;
  const step = initialLoading ? CLAMP(rawStep) : Math.min(CLAMP(rawStep), maxAccessibleStep);

  // Redirect if URL step exceeds maxAccessibleStep (after initial load only)
  useEffect(() => {
    if (initialLoading) return;
    const clamped = Math.min(rawStep, maxAccessibleStep);
    if (clamped !== rawStep) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("step", String(clamped));
        return next;
      }, { replace: true });
    }
  }, [rawStep, maxAccessibleStep, setSearchParams, initialLoading]);

  const goToStep = useCallback(
    async (n: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("step", String(Math.min(CLAMP(n), maxAccessibleStep)));
        return next;
      });
    },
    [maxAccessibleStep, setSearchParams],
  );

  const nextDisabled =
    (step === 3 && !extractionComplete) ||
    step === 4;

  const sessionSubmissions = useMemo(() => {
    if (!replaceSubmissionId) return existingSubmissions;
    if (sessionUploadIds.size === 0) return [];
    return existingSubmissions.filter((s) => sessionUploadIds.has(s.id));
  }, [existingSubmissions, replaceSubmissionId, sessionUploadIds]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    const load = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const [reqRes, reqdRes, docsRes] = await Promise.all([
          fetchWithClerkAuth("/api/me/required-slots", token),
          fetchWithClerkAuth("/api/me/required-documents", token),
          fetchWithClerkAuth("/api/me/documents", token),
        ]);
        if (reqRes.ok) {
          const data = (await reqRes.json()) as RequiredSlotsResponse;
          if (!cancelled) {
            setRequiredSlots(data.slots);
            const flatDocs: RequiredDocument[] = [];
            const seen = new Set<string>();
            for (const slot of data.slots) {
              for (const item of slot.items) {
                if (seen.has(item.document_type_id)) continue;
                seen.add(item.document_type_id);
                flatDocs.push({
                  id: item.document_type_id,
                  name: item.document_type_name,
                  code: item.document_type_code,
                  description: "",
                  is_required: true,
                });
              }
            }
            setRequiredDocs(flatDocs);
          }
        }
        if (reqdRes.ok) {
          const reqd = (await reqdRes.json()) as { school_year_status: string | null; school_year_name: string | null };
          if (!cancelled) {
            setSchoolYearName(reqd.school_year_name);
            if (reqd.school_year_status === "closed") {
              setSchoolYearClosed(true);
            }
          }
        }
        if (docsRes.ok) {
          const data = (await docsRes.json()) as SubmissionDetail[];
          if (!cancelled) {
            const activeSubmissions = data.filter((s) => s.status !== "flagged");
            setExistingSubmissions(activeSubmissions);
            setClassificationComplete(activeSubmissions.some((s) => s.status === "classified"));
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  const refetchSlots = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const reqRes = await fetchWithClerkAuth("/api/me/required-slots", token);
    if (reqRes.ok) {
      const data = (await reqRes.json()) as RequiredSlotsResponse;
      setRequiredSlots(data.slots);
      const flatDocs: RequiredDocument[] = [];
      const seen = new Set<string>();
      for (const slot of data.slots) {
        for (const item of slot.items) {
          if (seen.has(item.document_type_id)) continue;
          seen.add(item.document_type_id);
          flatDocs.push({
            id: item.document_type_id,
            name: item.document_type_name,
            code: item.document_type_code,
            description: "",
            is_required: true,
          });
        }
      }
      setRequiredDocs(flatDocs);
    }
  }, [getToken]);

  const handleSubmissionsUpdate = useCallback((data: SubmissionDetail[]) => {
    setExistingSubmissions(data);
    refetchSlots();
  }, [refetchSlots]);

  const handleUploadComplete = useCallback(async (result: ConfirmUploadResponse) => {
    setSessionUploadIds((prev) => new Set(prev).add(result.id));
    if (replaceSubmissionId) {
      const token = await getToken();
      if (token) {
        try {
          await fetchWithClerkAuth(`/api/me/documents/${result.id}/classify`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
        } catch {
          // fallback: goToStep will retry
        }
        const freshRes = await fetchWithClerkAuth("/api/me/documents", token);
        if (freshRes.ok) {
          const data = (await freshRes.json()) as SubmissionDetail[];
          setExistingSubmissions(data.filter((s) => s.status !== "flagged"));
        }
        refetchSlots();
      }
      return;
    }
    const token = await getToken();
    if (token) {
      const freshRes = await fetchWithClerkAuth("/api/me/documents", token);
      if (freshRes.ok) {
        const data = (await freshRes.json()) as SubmissionDetail[];
        setExistingSubmissions(data.filter((s) => s.status !== "flagged"));
      }
      refetchSlots();
    }
  }, [getToken, replaceSubmissionId, refetchSlots]);

  const handleDeleted = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await fetchWithClerkAuth("/api/me/documents", token);
    if (res.ok) {
      const data = (await res.json()) as SubmissionDetail[];
      setExistingSubmissions(data.filter((s) => s.status !== "flagged"));
    }
    refetchSlots();
  }, [getToken, refetchSlots]);

  const refetchSubmissions = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await fetchWithClerkAuth("/api/me/documents", token);
    if (res.ok) {
      const data = (await res.json()) as SubmissionDetail[];
      setExistingSubmissions(data.filter((s) => s.status !== "flagged"));
    }
  }, [getToken]);

  const handleSubmitted = useCallback(async () => {
    await refetchSubmissions();
    await refetchSlots();
  }, [refetchSubmissions, refetchSlots]);

  useEffect(() => {
    if (step === 4) refetchSubmissions();
  }, [step, refetchSubmissions]);

  if (schoolYearClosed) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="text-sm font-medium text-red-800">
            The {schoolYearName ?? "current"} school year is closed. Your documents are archived and read-only.
          </div>
        </div>
      </main>
    );
  }

  return (
    <UploadWizard step={step} onStepChange={goToStep} nextDisabled={nextDisabled}>
      {replaceSubmissionId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          You are re-uploading this document to replace a previously flagged version.
          Complete the upload wizard to submit the corrected file.
        </div>
      )}
      {step === 1 && (
        <StepUpload
          requiredDocuments={requiredDocs}
          requiredSlots={requiredSlots}
          getToken={getToken}
          onUploadComplete={handleUploadComplete}
          onDeleteSubmission={(id) =>
            setExistingSubmissions((prev) => prev.filter((s) => s.id !== id))
          }
          onDeleted={handleDeleted}
          existingSubmissions={existingSubmissions}
          replaceSubmissionId={replaceSubmissionId}
          isSchoolYearClosed={schoolYearClosed}
        />
      )}
      {step === 2 && (
        <StepClassify
          requiredDocuments={requiredDocs}
          requiredSlots={requiredSlots}
          submissions={sessionSubmissions}
          onClassificationChange={setClassificationComplete}
          onSubmissionsUpdate={handleSubmissionsUpdate}
          getToken={getToken}
        />
      )}
        {step === 3 && (
        <StepExtract
          onExtractionChange={setExtractionComplete}
          getToken={getToken}
          isSchoolYearClosed={schoolYearClosed}
        />
      )}
      {step === 4 && <StepSubmit requiredSlots={requiredSlots} submissions={sessionSubmissions} getToken={getToken} onSubmitted={handleSubmitted} isSchoolYearClosed={schoolYearClosed} />}
    </UploadWizard>
  );
}
