"use client";

import { AlertTriangle, FileText } from "lucide-react";
import type { SubmissionDetail } from "@/types/submission";

interface FlaggedBannerProps {
  submission: SubmissionDetail;
}

export default function FlaggedBanner({ submission }: FlaggedBannerProps) {
  // The adviser's comment is stored in rejection_reason. (classification_result.flag is an internal
  // system code, not a message for the student, so it is not shown.)
  const adviserComment = submission.rejection_reason?.trim() || null;
  const typeName = submission.document_type_name ?? "the required document";

  return (
    <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Document needed</p>
        <p className="text-sm font-semibold text-amber-900">{typeName}</p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Flagged file: {submission.original_filename}</span>
        </div>
        <div className="mt-2 rounded-lg border border-amber-200 bg-white/70 px-3 py-2">
          <p className="text-xs font-medium text-amber-800">Adviser's comment</p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-amber-900">
            {adviserComment ?? "Your adviser flagged this file but did not leave a comment."}
          </p>
        </div>
        <p className="mt-2 text-xs font-medium text-amber-800">
          Upload a corrected {typeName} file below.
        </p>
      </div>
    </div>
  );
}
