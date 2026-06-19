"use client";

import { FileText, CheckCircle, AlertTriangle, Image, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubmissionItem } from "@/types/submission";

interface SubmissionCardProps {
  item: SubmissionItem;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const bracket =
    confidence >= 0.8 ? "high" :
    confidence >= 0.5 ? "mid" :
    "low";

  const colors = {
    high: "text-emerald-700 bg-emerald-50 border-emerald-200",
    mid: "text-amber-700 bg-amber-50 border-amber-200",
    low: "text-rose-700 bg-rose-50 border-rose-200",
  };

  const barColors = {
    high: "bg-emerald-500",
    mid: "bg-amber-500",
    low: "bg-rose-500",
  };

  return (
    <div className="mt-1 flex items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none",
          colors[bracket],
        )}
      >
        {pct}% match
      </span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all", barColors[bracket])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DocumentIcon({ item }: { item: SubmissionItem }) {
  const name = item.fileName.toLowerCase();

  if (item.status === "needs-review") {
    return <AlertTriangle className="h-6 w-6 text-red-500" />;
  }

  if (name.includes("financial") || name.includes("fund")) {
    return <Wallet className="h-6 w-6 text-primary" />;
  }

  if (name.includes("passport") || name.includes("id") || name.includes("identification")) {
    return <AlertTriangle className="h-6 w-6 text-primary" />;
  }

  return <FileText className="h-6 w-6 text-primary" />;
}

export default function SubmissionCard({ item }: SubmissionCardProps) {
  const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(item.fileName);
  const needsReview = item.status === "needs-review";

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-all hover:bg-slate-50",
        needsReview ? "border-red-300" : "border-slate-200",
      )}
    >
      {/* Thumbnail / Icon */}
      <div
        className={cn(
          "relative flex h-20 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border",
          needsReview ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-100",
        )}
      >
        {isImage ? (
          <div className="flex h-full w-full items-center justify-center bg-slate-100">
            <Image className="h-6 w-6 text-slate-400" />
          </div>
        ) : (
          <DocumentIcon item={item} />
        )}
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold text-slate-900">
          {item.fileName}
        </h3>
        <p className="text-sm text-slate-500">
          Type: {item.documentType} &bull; {formatFileSize(item.fileSize)}
        </p>
        {item.confidence !== undefined && <ConfidenceIndicator confidence={item.confidence} />}
      </div>

      {/* Status + action */}
      <div className="flex flex-shrink-0 flex-col items-end gap-2">
        {needsReview ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-[10px] font-bold uppercase text-red-700">
            <AlertTriangle className="h-3 w-3" />
            Needs Review
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold uppercase text-emerald-700">
            <CheckCircle className="h-3 w-3" />
            Ready
          </span>
        )}
        <button
          type="button"
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wider hover:underline",
            needsReview ? "text-red-600" : "text-sky-600",
          )}
        >
          {needsReview ? "Fix Issues" : "View Details"}
        </button>
      </div>
    </div>
  );
}
