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
