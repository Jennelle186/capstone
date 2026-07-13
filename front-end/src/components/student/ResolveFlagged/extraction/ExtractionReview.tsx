"use client";

import { Database, Loader2, Sparkles } from "lucide-react";
import ExtractionCard from "@/components/student/UploadDocuments/extract/ExtractionCard";
import type { ExtractionItem } from "@/types/extraction";

interface ExtractionReviewProps {
  items: ExtractionItem[];
  submitting: boolean;
  onAutoSave: (itemId: string, fieldKey: string, value: string) => void;
  onSubmit: () => void;
}

export default function ExtractionReview({
  items,
  submitting,
  onAutoSave,
  onSubmit,
}: ExtractionReviewProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
        <Database className="h-12 w-12" />
        <p className="text-sm font-medium">No extracted data available.</p>
        <p className="text-xs text-slate-500">
          This document type does not require data extraction.
        </p>
      </div>
    );
  }

  const hasNeedsReview = items.some((i) => i.needsReview);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Review Extracted Data
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Review the information extracted from your document. Edit any
            fields that need correction before submitting.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {items.map((item) => (
          <ExtractionCard
            key={item.id}
            item={item}
            onAutoSave={onAutoSave}
          />
        ))}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
        <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {submitting ? "Submitting..." : hasNeedsReview ? "Submit Anyway" : "Submit for Review"}
        </button>
      </div>
    </div>
  );
}
