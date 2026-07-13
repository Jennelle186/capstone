"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "@clerk/clerk-react";
import UploadWizard from "@/components/student/UploadDocuments/UploadWizard";
import StepUpload from "@/components/student/UploadDocuments/upload/StepUpload";
import StepClassify from "@/components/student/UploadDocuments/classify/StepClassify";
import StepExtract from "@/components/student/UploadDocuments/extract/StepExtract";
import StepSubmit from "@/components/student/UploadDocuments/submit/StepSubmit";
import { fetchWithClerkAuth } from "@/lib/api";
import type { RequiredDocument } from "@/types/student";
import type { ConfirmUploadResponse, SubmissionDetail } from "@/types/submission";

const CLAMP = (n: number) => Math.max(1, Math.min(4, n));

export default function UploadDocuments() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requiredDocs, setRequiredDocs] = useState<RequiredDocument[]>([]);
  const [classificationComplete, setClassificationComplete] = useState(false);
  const [extractionComplete, setExtractionComplete] = useState(false);
  const [existingSubmissions, setExistingSubmissions] = useState<SubmissionDetail[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sessionUploadIds, setSessionUploadIds] = useState<Set<string>>(new Set());

  const replaceSubmissionId = searchParams.get("replace");

  const allVerified = useMemo(() => {
    if (requiredDocs.length === 0) return false;
    const verifiedTypeIds = new Set(
      existingSubmissions
        .filter((s) => s.status === "verified")
        .map((s) => s.document_type_id)
        .filter(Boolean),
    );
    return requiredDocs.every((doc) => verifiedTypeIds.has(doc.id));
  }, [requiredDocs, existingSubmissions]);

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
        const [reqRes, docsRes] = await Promise.all([
          fetchWithClerkAuth("/api/me/required-documents", token),
          fetchWithClerkAuth("/api/me/documents", token),
        ]);
        if (reqRes.ok) {
          const data = (await reqRes.json()) as { documents: RequiredDocument[] };
          if (!cancelled) setRequiredDocs(data.documents);
        }
        if (docsRes.ok) {
          const data = (await docsRes.json()) as SubmissionDetail[];
          if (!cancelled) {
            setExistingSubmissions(data);
            const hasClassifiedOrFlagged = data.some(
              (s) => s.status === "classified" || s.status === "flagged"
            );
            setClassificationComplete(hasClassifiedOrFlagged);
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
          setExistingSubmissions(data);
        }
      }
      return;
    }
    const token = await getToken();
    if (token) {
      const freshRes = await fetchWithClerkAuth("/api/me/documents", token);
      if (freshRes.ok) {
        const data = (await freshRes.json()) as SubmissionDetail[];
        setExistingSubmissions(data);
      }
    }
  }, [getToken, replaceSubmissionId]);

  const handleDeleted = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await fetchWithClerkAuth("/api/me/documents", token);
    if (res.ok) {
      const data = (await res.json()) as SubmissionDetail[];
      setExistingSubmissions(data);
    }
  }, [getToken]);

  const refetchSubmissions = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await fetchWithClerkAuth("/api/me/documents", token);
    if (res.ok) {
      const data = (await res.json()) as SubmissionDetail[];
      setExistingSubmissions(data);
    }
  }, [getToken]);

  useEffect(() => {
    if (step === 4) refetchSubmissions();
  }, [step, refetchSubmissions]);

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
          allVerified={allVerified}
          requiredDocuments={requiredDocs}
          getToken={getToken}
          onUploadComplete={handleUploadComplete}
          onDeleteSubmission={(id) =>
            setExistingSubmissions((prev) => prev.filter((s) => s.id !== id))
          }
          onDeleted={handleDeleted}
          existingSubmissions={existingSubmissions}
          replaceSubmissionId={replaceSubmissionId}
        />
      )}
      {step === 2 && (
        <StepClassify
          allVerified={allVerified}
          requiredDocuments={requiredDocs}
          submissions={sessionSubmissions}
          onClassificationChange={setClassificationComplete}
          onSubmissionsUpdate={setExistingSubmissions}
          getToken={getToken}
        />
      )}
      {step === 3 && (
        <StepExtract
          allVerified={allVerified}
          onExtractionChange={setExtractionComplete}
          getToken={getToken}
        />
      )}
      {step === 4 && <StepSubmit allVerified={allVerified} submissions={sessionSubmissions} getToken={getToken} onSubmitted={refetchSubmissions} />}
    </UploadWizard>
  );
}
