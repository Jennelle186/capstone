"use client";

import * as React from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ChevronDown, ChevronRight, FolderCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import SubmissionCard from "@/components/student/UploadDocuments/submit/SubmissionCard";
import SubmissionSummary from "@/components/student/UploadDocuments/submit/SubmissionSummary";
import ConditionalSubmitModal from "@/components/student/UploadDocuments/submit/ConditionalSubmitModal";
import ConfirmDialog from "@/components/student/UploadDocuments/submit/ConfirmDialog";
import ReviewDocumentDetailModal from "@/components/student/ReviewDocumentDetailModal";
import { fetchWithClerkAuth } from "@/lib/api";
import type { SubmissionCardStatus, SubmissionDetail } from "@/types/submission";
import type { ExtractionItemResponse } from "@/types/extraction";
import type { SlotStatusResponse } from "@/types/requirement";
import { getSlotDisplayName } from "@/types/requirement";

interface StepSubmitProps {
  requiredSlots: SlotStatusResponse[];
  submissions: SubmissionDetail[];
  getToken: () => Promise<string | null>;
  onSubmitted?: () => void;
  isSchoolYearClosed?: boolean;
}

export default function StepSubmit({ requiredSlots, submissions, getToken, onSubmitted, isSchoolYearClosed = false }: StepSubmitProps) {
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [showConditional, setShowConditional] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [pendingDocuments, setPendingDocuments] = React.useState(false);
  const [readOnly, setReadOnly] = React.useState(false);
  const [activeDocIndex, setActiveDocIndex] = React.useState(0);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [extractionAccuracy, setExtractionAccuracy] = React.useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [verifiedExpanded, setVerifiedExpanded] = React.useState(false);
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

  const pendingSubmissions = submissions.filter(
    (s) => s.status !== "verified" && s.document_type_id != null,
  );
  const verifiedSubmissions = submissions.filter(
    (s) => s.status === "verified" && s.document_type_id != null,
  );

  const items = pendingSubmissions
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

  const incompleteSlots = requiredSlots.filter((s) => !s.is_complete);
  const hasIncompleteSlots = incompleteSlots.length > 0;

  const handleSubmitClick = () => {
    if (hasIncompleteSlots) {
      setShowConditional(true);
    } else {
      setShowConfirm(true);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const token = await getTokenRef.current();
      if (!token) { setIsSubmitting(false); return; }
      const ids = items.map((i) => i.id);
      const res = await fetchWithClerkAuth("/api/me/documents/submit-batch", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_ids: ids }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setSubmitError(err?.detail ?? "Submission failed. Please try again.");
        setIsSubmitting(false);
        return;
      }
      const result = await res.json() as {
        status: string;
        submitted_count: number;
        skipped_count?: number;
        skipped?: Array<{ submission_id: string; document_type_name: string | null; reason: string }>;
        application_status: string | null;
        incomplete_slots?: Array<{ id: string; name: string; min_required: number }>;
      };
      if (result.skipped_count && result.skipped_count > 0 && result.skipped) {
        const names = result.skipped
          .map((s) => s.document_type_name)
          .filter(Boolean);
        if (names.length > 0) {
          const label = names.slice(0, 3).join(", ");
          const remaining = names.length > 3 ? ` (+${names.length - 3} more)` : "";
          toast.warning(`${result.skipped_count} file(s) skipped — already verified: ${label}${remaining}`, {
            duration: 6000,
          });
        } else {
          toast.warning(`${result.skipped_count} file(s) skipped because they match already-verified documents.`, {
            duration: 6000,
          });
        }
      }
      if (result.application_status === "PENDING_DOCUMENTS") {
        setPendingDocuments(true);
        toast.warning("Documents submitted with missing requirements — marked as Pending Documents.", {
          duration: 6000,
        });
      } else {
        toast.success(`${result.submitted_count} document(s) submitted for adviser review.`, {
          duration: 5000,
        });
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
    if (pendingDocuments) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <FolderCheck className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Submitted — Pending Documents
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-slate-500">
            Your enrollment file has been submitted, but{" "}
            <strong>{incompleteSlots.length} requirement{incompleteSlots.length !== 1 ? "s" : ""}</strong>{" "}
            {incompleteSlots.length !== 1 ? "are" : "is"} still missing. Your adviser
            will review what you have submitted but cannot fully approve your
            application until the following are provided:
          </p>
          <div className="w-full max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-4 text-left">
            <ul className="space-y-1">
              {incompleteSlots.map((slot) => (
                <li key={slot.id} className="flex items-start gap-2 text-sm text-amber-800">
                  <span className="mt-0.5 shrink-0 text-amber-500">&bull;</span>
                  <span>
                    {getSlotDisplayName(slot)}
                    {slot.min_required > 1 && (
                      <span className="ml-1 text-xs text-amber-600">
                        ({slot.matched_count}/{slot.min_required})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
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
      {isSchoolYearClosed && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
          The school year is closed. Your documents are archived and read-only. Submissions are no longer allowed.
        </div>
      )}
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
                {verifiedSubmissions.length > 0 && (
                  <span className="ml-2 text-xs text-emerald-600 font-medium">
                    ({verifiedSubmissions.length} verified)
                  </span>
                )}
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
          {verifiedSubmissions.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden">
              <button
                type="button"
                onClick={() => setVerifiedExpanded((v) => !v)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-emerald-800 hover:bg-emerald-100/50 transition-colors"
              >
                {verifiedExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Lock className="h-4 w-4" />
                {verifiedSubmissions.length} Document{verifiedSubmissions.length !== 1 ? "s" : ""} Already Verified
              </button>
              {verifiedExpanded && (
                <div className="divide-y divide-emerald-200 border-t border-emerald-200">
                  {verifiedSubmissions.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <Lock className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="flex-1 truncate font-medium text-emerald-900">
                        {s.document_type_name ?? s.original_filename}
                      </span>
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Verified
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
            onSubmit={() => handleSubmitClick()}
            isSubmitting={isSubmitting}
            hideActions={readOnly || isSchoolYearClosed}
            lockedReason={isSchoolYearClosed ? "school-year-closed" : "submitted"}
          />
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={handleSubmit}
      />

      <ConditionalSubmitModal
        open={showConditional}
        onOpenChange={setShowConditional}
        onConfirm={() => {
          setShowConditional(false);
          handleSubmit();
        }}
        incompleteSlots={incompleteSlots}
        isSubmitting={isSubmitting}
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
