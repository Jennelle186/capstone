"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [isClassifyingAll, setIsClassifyingAll] = useState(false);
  const [classifyAllError, setClassifyAllError] = useState<string | null>(null);
  const [isExtractingAll, setIsExtractingAll] = useState(false);
  const [extractAllError, setExtractAllError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const newlyUploadedIdsRef = useRef<Set<string>>(new Set());

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
      setSearchParams({ step: String(clamped) }, { replace: true });
    }
  }, [rawStep, maxAccessibleStep, setSearchParams, initialLoading]);

  const goToStep = useCallback(
    async (n: number) => {
      if (step === 1 && n === 2) {
        setIsClassifyingAll(true);
        setClassifyAllError(null);

        setSearchParams({ step: "2" });

        const token = await getToken();
        if (!token) { setIsClassifyingAll(false); return; }

        const targetIds = newlyUploadedIdsRef.current.size > 0
          ? Array.from(newlyUploadedIdsRef.current)
          : existingSubmissions
              .filter((s) => s.status === "uploaded" || s.status === "flagged")
              .map((s) => s.id);

        if (targetIds.length > 0) {
          try {
            const res = await fetchWithClerkAuth("/api/me/documents/classify-all", token, {
              method: "POST",
              body: JSON.stringify({ submission_ids: targetIds }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => null);
              setClassifyAllError(err?.detail ?? "Classification failed for some documents.");
            }
          } catch (err) {
            setClassifyAllError(err instanceof Error ? err.message : "Classification request failed.");
          }

          const token2 = await getToken();
          if (token2) {
            const freshRes = await fetchWithClerkAuth("/api/me/documents", token2);
            if (freshRes.ok) {
              const data = await freshRes.json();
              setExistingSubmissions(data);
            }
          }
        }

        newlyUploadedIdsRef.current = new Set();
        setIsClassifyingAll(false);
        return;
      }

      if (step === 2 && n === 3) {
        const targetSubs = existingSubmissions.filter(
          (s) => s.document_type_id && (s.status === "classified" || s.status === "flagged")
        );
        const targetIds = targetSubs.map((s) => s.id);

        if (targetIds.length === 0) {
          // Only skip to step 4 if there are classified/submitted docs
          // (not an empty batch or unclassified docs).
          const hasProcessedDocs = existingSubmissions.some(
            (s) => s.document_type_id,
          );
          if (hasProcessedDocs) {
            setExtractionComplete(true);
            setSearchParams({ step: "4" }, { replace: true });
          } else {
            setSearchParams({ step: "3" }, { replace: true });
          }
          return;
        }

        // Skip POST if all submissions already have extracted data (page reload).
        const allExtracted = targetSubs.every((s) => getExtractedData(s) != null);
        if (allExtracted) {
          setIsExtractingAll(false);
          setExtractionComplete(true);
          setSearchParams({ step: "4" }, { replace: true });
          return;
        }

        setIsExtractingAll(true);
        setExtractAllError(null);

        setSearchParams({ step: "3" }, { replace: true });

        const token = await getToken();
        if (!token) { setIsExtractingAll(false); return; }

        try {
          const res = await fetchWithClerkAuth("/api/me/documents/extract-all", token, {
            method: "POST",
            body: JSON.stringify({ submission_ids: targetIds }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => null);
            setExtractAllError(err?.detail ?? "Extraction failed for some documents.");
            setIsExtractingAll(false);
            return;
          }
          // On success: check if any docs were actually queued for extraction.
          const resultData = await res.json() as Array<{ status?: string }>;
          const anyProcessing = resultData.some((s) => s.status === "processing");
          if (!anyProcessing) {
            setIsExtractingAll(false);
            setExtractionComplete(true);
            setSearchParams({ step: "4" }, { replace: true });
            return;
          }
          // Otherwise: keep isExtractingAll=true so StepExtract polls.
          // onExtractionReady will set it to false when data arrives.
        } catch (err) {
          setExtractAllError(err instanceof Error ? err.message : "Extraction request failed.");
          setIsExtractingAll(false);
        }
        return;
      }

      setSearchParams({ step: String(Math.min(CLAMP(n), maxAccessibleStep)) });
    },
    [step, maxAccessibleStep, setSearchParams, existingSubmissions, getToken],
  );

  const handleExtractionReady = useCallback(() => {
    setIsExtractingAll(false);
  }, []);

  const nextDisabled =
    (step === 3 && !extractionComplete) ||
    step === 4;

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

  const handleUploadComplete = useCallback((result: ConfirmUploadResponse) => {
    newlyUploadedIdsRef.current = new Set(newlyUploadedIdsRef.current).add(result.id);
  }, []);

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
      {step === 1 && (
        <StepUpload
          requiredDocuments={requiredDocs}
          getToken={getToken}
          onUploadComplete={handleUploadComplete}
          onDeleteSubmission={(id) =>
            setExistingSubmissions((prev) => prev.filter((s) => s.id !== id))
          }
          onDeleted={handleDeleted}
          existingSubmissions={existingSubmissions}
        />
      )}
      {step === 2 && (
        <StepClassify
          requiredDocuments={requiredDocs}
          submissions={existingSubmissions}
          onClassificationChange={setClassificationComplete}
          onSubmissionsUpdate={setExistingSubmissions}
          getToken={getToken}
          isClassifyingAll={isClassifyingAll}
          classifyAllError={classifyAllError}
        />
      )}
      {step === 3 && (
        <StepExtract
          onExtractionChange={setExtractionComplete}
          getToken={getToken}
          isExtractingAll={isExtractingAll}
          extractAllError={extractAllError}
          onExtractionReady={handleExtractionReady}
        />
      )}
      {step === 4 && <StepSubmit submissions={existingSubmissions} getToken={getToken} onSubmitted={refetchSubmissions} />}
    </UploadWizard>
  );
}
