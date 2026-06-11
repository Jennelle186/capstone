"use client";

import * as React from "react";
import { FolderCheck } from "lucide-react";
import SubmissionCard from "@/components/student/UploadDocuments/submit/SubmissionCard";
import SubmissionSummary from "@/components/student/UploadDocuments/submit/SubmissionSummary";
import ConfirmDialog from "@/components/student/UploadDocuments/submit/ConfirmDialog";
import type { SubmissionItem } from "@/types/submission";

const MOCK_ITEMS: SubmissionItem[] = [
  {
    id: "s-1",
    fileName: "Official_Transcript_2023.pdf",
    documentType: "Academic Record",
    fileSize: 1.2 * 1024 * 1024,
    status: "ready",
  },
  {
    id: "s-2",
    fileName: "Gov_Passport_Scan.jpg",
    documentType: "Personal Identification",
    fileSize: 4.8 * 1024 * 1024,
    status: "needs-review",
    issues: "Passport number requires manual verification",
  },
  {
    id: "s-3",
    fileName: "Financial_Statement_Q3.pdf",
    documentType: "Proof of Funds",
    fileSize: 2.5 * 1024 * 1024,
    status: "ready",
  },
];

export default function StepSubmit() {
  const [items] = React.useState<SubmissionItem[]>(MOCK_ITEMS);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = () => {
    setSubmitted(true);
    // eslint-disable-next-line no-console
    console.log("Documents submitted:", items);
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
              <SubmissionCard key={item.id} item={item} />
            ))}
          </div>
        </div>

        {/* Right: Summary */}
        <div className="lg:col-span-4 lg:sticky lg:top-24">
          <SubmissionSummary
            items={items}
            onSaveLater={() => {
              // eslint-disable-next-line no-console
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
    </>
  );
}
