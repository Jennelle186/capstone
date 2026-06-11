"use client";

import * as React from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "@clerk/clerk-react";
import UploadWizard from "@/components/student/UploadDocuments/UploadWizard";
import StepUpload from "@/components/student/UploadDocuments/upload/StepUpload";
import StepClassify from "@/components/student/UploadDocuments/classify/StepClassify";
import StepExtract from "@/components/student/UploadDocuments/extract/StepExtract";
import StepSubmit from "@/components/student/UploadDocuments/submit/StepSubmit";
import { fetchWithClerkAuth } from "@/lib/api";
import type { RequiredDocument } from "@/types/student";

const CLAMP = (n: number) => Math.max(1, Math.min(4, n));

export default function UploadDocuments() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requiredDocs, setRequiredDocs] = React.useState<RequiredDocument[]>([]);
  const [classificationComplete, setClassificationComplete] = React.useState(false);
  const [extractionComplete, setExtractionComplete] = React.useState(false);

  const maxAccessibleStep = Math.min(
    4,
    extractionComplete ? 4 : classificationComplete ? 3 : 2,
  );

  const rawStep = parseInt(searchParams.get("step") ?? "1", 10) || 1;
  const step = Math.min(CLAMP(rawStep), maxAccessibleStep);

  // Redirect if URL step exceeds maxAccessibleStep
  React.useEffect(() => {
    const clamped = Math.min(rawStep, maxAccessibleStep);
    if (clamped !== rawStep) {
      setSearchParams({ step: String(clamped) }, { replace: true });
    }
  }, [rawStep, maxAccessibleStep, setSearchParams]);

  const goToStep = React.useCallback(
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

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    const load = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetchWithClerkAuth("/api/me/required-documents", token);
        if (!res.ok) return;
        const data = (await res.json()) as { documents: RequiredDocument[] };
        if (!cancelled) setRequiredDocs(data.documents);
      } catch {
        // ignore
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  return (
    <UploadWizard step={step} onStepChange={goToStep} nextDisabled={nextDisabled}>
      {step === 1 && <StepUpload requiredDocuments={requiredDocs} />}
      {step === 2 && <StepClassify requiredDocuments={requiredDocs} onClassificationChange={setClassificationComplete} />}
      {step === 3 && <StepExtract onExtractionChange={setExtractionComplete} />}
      {step === 4 && <StepSubmit />}
    </UploadWizard>
  );
}
