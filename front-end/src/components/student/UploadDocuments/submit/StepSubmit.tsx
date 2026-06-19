"use client";

import * as React from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, FolderCheck } from "lucide-react";
import SubmissionCard from "@/components/student/UploadDocuments/submit/SubmissionCard";
import SubmissionSummary from "@/components/student/UploadDocuments/submit/SubmissionSummary";
import ConfirmDialog from "@/components/student/UploadDocuments/submit/ConfirmDialog";
import ReviewDocumentDetailModal from "@/components/student/ReviewDocumentDetailModal";
import { fetchWithClerkAuth } from "@/lib/api";
import type { SubmissionCardStatus, SubmissionDetail } from "@/types/submission";
import type { ExtractionItemResponse } from "@/types/extraction";

interface StepSubmitProps {
  submissions: SubmissionDetail[];
  getToken: () => Promise<string | null>;
  onSubmitted?: () => void;
}

export default function StepSubmit({ submissions, getToken, onSubmitted }: StepSubmitProps) {
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [readOnly, setReadOnly] = React.useState(false);
  const [activeDocIndex, setActiveDocIndex] = React.useState(0);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [extractionAccuracy, setExtractionAccuracy] = React.useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const getTokenRef = React.useRef(getToken);

  React.useEffect(() => {
    getTokenRef.current = getToken;
  });

  React.useEffect(() => {
    let cancelled = false;
    const fetchExtractions = async () => {
      const token = await getTokenRef.current();
      if (!token) return;
      const res = await fetchWithClerkAuth("/api/me/documents/extractions", token);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as ExtractionItemResponse[];
      const allFields = data.flatMap((item) => item.fields);
      const evaluableFields = allFields.filter((f) => {
        const isBlank = !f.value || f.value.trim() === "";
        const isOptional = !f.required;
        return !(isBlank && isOptional);
      });
      const avg = evaluableFields.length > 0
        ? evaluableFields.reduce((s, f) => {
            const isBlank = !f.value || f.value.trim() === "";
            if (f.required && isBlank) return s + 1.0;
            return s + (f.confidence ?? 0);
          }, 0) / evaluableFields.length
        : 1.0;
      if (!cancelled) setExtractionAccuracy(avg);
    };
    fetchExtractions();
    return () => { cancelled = true; };
  }, []);

  const items = submissions
    .filter((s) => s.document_type_id != null)
    .map((s) => ({
      id: s.id,
      fileName: s.original_filename,
      documentType: s.document_type_name ?? "Unclassified",
      fileSize: Number(s.file_size ?? 0),
      status: (s.status === "submitted" ? "submitted" : s.status === "flagged" ? "needs-review" : "ready") as SubmissionCardStatus,
      confidence: (s.classification_result?.confidence as number) ?? undefined,
      issues: (s.classification_result?.flag as string) ?? undefined,
    }));

  const classificationAccuracy = items.length > 0
    ? items.reduce((s, i) => s + (i.confidence ?? 0), 0) / items.length
    : null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const token = await getTokenRef.current();
      if (!token) { setIsSubmitting(false); return; }
      const res = await fetchWithClerkAuth("/api/me/documents/submit-batch", token, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setSubmitError(err?.detail ?? "Submission failed. Please try again.");
        setIsSubmitting(false);
        return;
      }
      setSubmitted(true);
      onSubmitted?.();
    } catch {
      setSubmitError("Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewDetails = (itemId: string) => {
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx !== -1) {
      setActiveDocIndex(idx);
      setIsModalOpen(true);
    }
  };

  const handleSaveLater = () => {
    navigate("/student/dashboard");
  };

  const handleBackToConfirmation = () => {
    setReadOnly(false);
  };

  // Celebration screen — shown immediately after successful submit
  if (submitted && !readOnly) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <FolderCheck className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          Documents Submitted Successfully!
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-slate-500">
          Your enrollment records have been securely transmitted and locked for
          adviser review. We will notify you via email as soon as your file is
          processed.
        </p>
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
          <button
            type="button"
            onClick={() => navigate("/student/dashboard")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
          >
            Return to Dashboard
          </button>
          <button
            type="button"
            onClick={() => setReadOnly(true)}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            Review Submitted Documents
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        {/* Left: Document list */}
        <div className="lg:col-span-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              {readOnly ? "Submitted Documents" : "Review Documents"}
            </h2>
            <span className="text-sm text-slate-500">
              {items.length} Document{items.length !== 1 ? "s" : ""}
              {readOnly ? "" : " Pending Submission"}
            </span>
          </div>
          {readOnly && (
            <button
              type="button"
              onClick={handleBackToConfirmation}
              className="mb-3 flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Confirmation
            </button>
          )}
          {submitError && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          )}
          <div className="space-y-3">
            {items.map((item) => (
              <SubmissionCard
                key={item.id}
                item={item}
                statusLabel={item.status === "submitted" ? "SUBMITTED" : readOnly ? "SUBMITTED" : undefined}
                onViewDetails={() => handleViewDetails(item.id)}
              />
            ))}
          </div>
        </div>

        {/* Right: Summary */}
        <div className="lg:col-span-4 lg:sticky lg:top-24">
          <SubmissionSummary
            items={items}
            classificationAccuracy={classificationAccuracy}
            extractionAccuracy={extractionAccuracy}
            onSaveLater={handleSaveLater}
            onSubmit={() => setShowConfirm(true)}
            isSubmitting={isSubmitting}
            hideActions={readOnly}
          />
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={handleSubmit}
      />

      <ReviewDocumentDetailModal
        submissions={items}
        currentIndex={activeDocIndex}
        onIndexChange={setActiveDocIndex}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        getToken={getToken}
      />
    </>
  );
}
