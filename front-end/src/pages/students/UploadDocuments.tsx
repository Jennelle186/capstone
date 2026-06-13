"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [submissions, setSubmissions] = useState<ConfirmUploadResponse[]>([]);
  const [existingSubmissions, setExistingSubmissions] = useState<SubmissionDetail[]>([]);

  const maxAccessibleStep = Math.min(
    4,
    extractionComplete ? 4 : classificationComplete ? 3 : 2,
  );

  const rawStep = parseInt(searchParams.get("step") ?? "1", 10) || 1;
  const step = Math.min(CLAMP(rawStep), maxAccessibleStep);

  // Redirect if URL step exceeds maxAccessibleStep
  useEffect(() => {
    const clamped = Math.min(rawStep, maxAccessibleStep);
    if (clamped !== rawStep) {
      setSearchParams({ step: String(clamped) }, { replace: true });
    }
  }, [rawStep, maxAccessibleStep, setSearchParams]);

  const goToStep = useCallback(
    (n: number) => {
      const clamped = Math.min(CLAMP(n), maxAccessibleStep);
      setSearchParams({ step: String(clamped) });
    },
    [maxAccessibleStep, setSearchParams],
  );

  const nextDisabled =
    (step === 2 && !classificationComplete) ||
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
          if (!cancelled) setExistingSubmissions(data);
        }
      } catch {
        // ignore
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  const handleUploadComplete = useCallback((result: ConfirmUploadResponse) => {
    setSubmissions((prev) => [...prev, result]);
  }, []);

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
          existingSubmissions={existingSubmissions}
        />
      )}
      {step === 2 && <StepClassify requiredDocuments={requiredDocs} submissions={submissions} onClassificationChange={setClassificationComplete} />}
      {step === 3 && <StepExtract onExtractionChange={setExtractionComplete} />}
      {step === 4 && <StepSubmit />}
    </UploadWizard>
  );
}
