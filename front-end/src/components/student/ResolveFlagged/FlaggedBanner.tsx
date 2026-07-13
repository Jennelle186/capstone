"use client";

import { AlertTriangle, FileText } from "lucide-react";
import type { SubmissionDetail } from "@/types/submission";

interface FlaggedBannerProps {
  submission: SubmissionDetail;
}

export default function FlaggedBanner({ submission }: FlaggedBannerProps) {
  const result = submission.classification_result as Record<string, unknown> | null;
  const flagReason = (result?.flag as string) ?? null;

  return (
    <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900">
          {submission.document_type_name ?? "Unknown Type"}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{submission.original_filename}</span>
        </div>
        {flagReason && (
          <p className="mt-1 text-xs text-amber-600">
            Reason: {flagReason}
          </p>
        )}
        <p className="mt-1.5 text-xs font-medium text-amber-800">
          Upload a corrected version of this document below.
        </p>
      </div>
    </div>
  );
}
