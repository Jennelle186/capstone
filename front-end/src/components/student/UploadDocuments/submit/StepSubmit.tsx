"use client";

import * as React from "react";
import { FolderCheck } from "lucide-react";
import SubmissionCard from "@/components/student/UploadDocuments/submit/SubmissionCard";
import SubmissionSummary from "@/components/student/UploadDocuments/submit/SubmissionSummary";
import ConfirmDialog from "@/components/student/UploadDocuments/submit/ConfirmDialog";
import ReviewDocumentDetailModal from "@/components/student/ReviewDocumentDetailModal";
import type { SubmissionDetail } from "@/types/submission";

interface StepSubmitProps {
  submissions: SubmissionDetail[];
  getToken: () => Promise<string | null>;
}

export default function StepSubmit({ submissions, getToken }: StepSubmitProps) {
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [activeDocIndex, setActiveDocIndex] = React.useState(0);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const items = submissions
    .filter((s) => s.document_type_id != null)
    .map((s) => ({
      id: s.id,
      fileName: s.original_filename,
      documentType: s.document_type_name ?? "Unclassified",
      fileSize: Number(s.file_size ?? 0),
      status: (s.status === "flagged" ? "needs-review" : "ready") as "needs-review" | "ready",
      confidence: (s.classification_result?.confidence as number) ?? undefined,
      issues: (s.classification_result?.flag as string) ?? undefined,
    }));

  const handleSubmit = () => {
    setSubmitted(true);
  };

  const handleViewDetails = (itemId: string) => {
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx !== -1) {
      setActiveDocIndex(idx);
      setIsModalOpen(true);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <FolderCheck className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold text-slate-900">
          Documents Submitted!
        </h2>
        <p className="max-w-md text-sm text-slate-500">
          Your documents have been submitted for processing. You will be
          notified once the registrar has reviewed them.
        </p>
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
              Review Documents
            </h2>
            <span className="text-sm text-slate-500">
              {items.length} Document{items.length !== 1 ? "s" : ""} Pending
              Submission
            </span>
          </div>
          <div className="space-y-3">
            {items.map((item) => (
              <SubmissionCard key={item.id} item={item} onViewDetails={() => handleViewDetails(item.id)} />
            ))}
          </div>
        </div>

        {/* Right: Summary */}
        <div className="lg:col-span-4 lg:sticky lg:top-24">
          <SubmissionSummary
            items={items}
            onSaveLater={() => {
               
              console.log("Saved for later");
            }}
            onSubmit={() => setShowConfirm(true)}
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
