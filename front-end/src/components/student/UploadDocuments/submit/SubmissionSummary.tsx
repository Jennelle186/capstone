"use client";

import { Info, Send, CheckCircle, AlertTriangle } from "lucide-react";
import type { SubmissionItem } from "@/types/submission";

interface SubmissionSummaryProps {
  items: SubmissionItem[];
  onSaveLater: () => void;
  onSubmit: () => void;
  classificationAccuracy: number | null;
  extractionAccuracy: number | null;
}

function formatAccuracy(value: number | null) {
  if (value === null) return "\u2014";
  return `${Math.round(value * 100)}% Average`;
}

export default function SubmissionSummary({
  items,
  onSaveLater,
  onSubmit,
  classificationAccuracy,
  extractionAccuracy,
}: SubmissionSummaryProps) {
  const total = items.length;
  const needsReviewCount = items.filter((i) => i.status === "needs-review").length;
  const readyCount = total - needsReviewCount;
  const needsReviewItem = items.find((i) => i.status === "needs-review");

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="rounded-2xl border border-slate-200 bg-slate-100 p-5">
        <h3 className="mb-4 text-base font-semibold text-slate-900">
          Submission Summary
        </h3>

        <div className="mb-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Total Documents</span>
            <span className="font-bold text-slate-900">{total}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Classification Accuracy</span>
            <span className="font-bold text-primary">{formatAccuracy(classificationAccuracy)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Extraction Accuracy</span>
            <span className="font-bold text-primary">{formatAccuracy(extractionAccuracy)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Target Institution</span>
            <span className="font-bold text-slate-900">College of Computing Studies</span>
          </div>

          <div className="h-px bg-slate-200" />

          {needsReviewItem && (
            <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <p className="text-sm leading-tight text-red-800">
                {needsReviewItem.fileName} requires a manual review before
                final submission.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            disabled={needsReviewCount > 0}
            onClick={onSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-white shadow-sm transition-all hover:-translate-y-px hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            Submit All Documents
            <Send className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onSaveLater}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 transition-all hover:bg-slate-50"
          >
            Save for Later
          </button>
        </div>
      </div>

      {/* Status Mini Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Status
          </span>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span className="text-lg font-bold">{readyCount} Ready</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Alerts
          </span>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-lg font-bold">{needsReviewCount} Alert</span>
          </div>
        </div>
      </div>
    </div>
  );
}
