"use client";

import {
  CheckCircle,
  AlertTriangle,
  Loader2,
  Clock,
  FileText,
  ClipboardList,
  FileSearch2,
  FileBadge2,
  FileCheck2,
  GraduationCap,
} from "lucide-react";
import type { ComponentType } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ClassificationItem } from "@/types/classification";
import type { RequiredDocument } from "@/types/student";

interface SubmissionChecklistProps {
  requiredDocuments: RequiredDocument[];
  items: ClassificationItem[];
}

type RowStatus =
  | "not-uploaded"
  | "pending"
  | "processing"
  | "classified"
  | "needs-review"
  | "accepted"
  | "submitted"
  | "verified";

interface RowData {
  doc: RequiredDocument;
  status: RowStatus;
  confidence: number | null;
  fileName: string | null;
}

const CODE_ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  ADMISSION_FORM: ClipboardList,
  CET: FileSearch2,
  REPORT_CARD: GraduationCap,
  GOOD_MORAL: FileCheck2,
  BIRTH_CERT: FileBadge2,
  MED_CERT: FileText,
};

function getDocIcon(code: string) {
  return CODE_ICON_MAP[code] ?? FileText;
}

const STATUS_PRIORITY: Record<RowStatus, number> = {
  verified: 6,
  accepted: 5,
  submitted: 5,
  classified: 4,
  "needs-review": 3,
  processing: 2,
  pending: 1,
  "not-uploaded": 0,
};

function deriveRowStatus(item: ClassificationItem): RowStatus {
  if (item.status === "verified") return "verified";
  if (item.originalStatus === "submitted" || item.originalStatus === "in-review") return "submitted";
  if (item.status === "overridden") return "accepted";
  if (item.status === "classified" && !item.needsReview) return "classified";
  if (item.status === "needs-review" || item.status === "flagged") return "needs-review";
  if (item.status === "processing") return "processing";
  if (item.status === "pending") return "pending";
  return "pending";
}

function buildRows(requiredDocuments: RequiredDocument[], items: ClassificationItem[]): RowData[] {
  return requiredDocuments.map((doc) => {
    const matched = items.filter((i) => i.documentTypeId === doc.id);
    if (matched.length === 0) {
      return { doc, status: "not-uploaded", confidence: null, fileName: null };
    }
    const best = matched.sort((a, b) => {
      const pa = STATUS_PRIORITY[deriveRowStatus(a)];
      const pb = STATUS_PRIORITY[deriveRowStatus(b)];
      return pb - pa;
    })[0];
    const status = deriveRowStatus(best);
    return {
      doc,
      status,
      confidence: best.confidence,
      fileName: best.fileName,
    };
  });
}

function StatusIcon({ status, className }: { status: RowStatus; className?: string }) {
  switch (status) {
    case "verified":
      return <CheckCircle className={cn("h-4 w-4 text-emerald-600", className)} />;
    case "accepted":
      return <CheckCircle className={cn("h-4 w-4 text-emerald-600", className)} />;
    case "submitted":
      return <CheckCircle className={cn("h-4 w-4 text-slate-500", className)} />;
    case "classified":
      return <CheckCircle className={cn("h-4 w-4 text-emerald-600", className)} />;
    case "needs-review":
      return <AlertTriangle className={cn("h-4 w-4 text-amber-500", className)} />;
    case "processing":
      return <Loader2 className={cn("h-4 w-4 text-blue-500 animate-spin", className)} />;
    case "pending":
      return <Clock className={cn("h-4 w-4 text-amber-500", className)} />;
    case "not-uploaded":
      return <FileText className={cn("h-4 w-4 text-slate-300", className)} />;
  }
}

function StatusLabel({ status, confidence, fileName }: { status: RowStatus; confidence: number | null; fileName: string | null }) {
  switch (status) {
    case "verified":
      return (
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-emerald-600">Verified by Adviser</span>
          {fileName && <span className="text-[11px] text-slate-400 truncate max-w-[160px]">{fileName}</span>}
        </div>
      );
    case "accepted":
      return (
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-emerald-600">Accepted by the user</span>
          {fileName && <span className="text-[11px] text-slate-400 truncate max-w-[160px]">{fileName}</span>}
        </div>
      );
    case "submitted":
      return (
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-slate-600">Submitted — locked for adviser review</span>
          {fileName && <span className="text-[11px] text-slate-400 truncate max-w-[160px]">{fileName}</span>}
        </div>
      );
    case "classified":
      return (
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-emerald-600">
            Classified{confidence !== null ? ` — ${confidence}%` : ""}
          </span>
          {fileName && <span className="text-[11px] text-slate-400 truncate max-w-[160px]">{fileName}</span>}
        </div>
      );
    case "needs-review":
      return (
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-amber-600">
            Needs review{confidence !== null ? ` — ${confidence}%` : ""}
          </span>
          {fileName && <span className="text-[11px] text-slate-400 truncate max-w-[160px]">{fileName}</span>}
        </div>
      );
    case "processing":
      return <span className="text-xs font-semibold text-blue-600">Processing…</span>;
    case "pending":
      return <span className="text-xs font-semibold text-amber-600">Pending classification</span>;
    case "not-uploaded":
      return <span className="text-xs text-slate-400">Not uploaded</span>;
  }
}

export default function SubmissionChecklist({ requiredDocuments, items }: SubmissionChecklistProps) {
  const rows = buildRows(requiredDocuments, items);
  const acceptedCount = rows.filter((r) => r.status === "verified" || r.status === "accepted" || r.status === "classified" || r.status === "submitted").length;
  const total = rows.length;

  return (
    <Card className="rounded-2xl border border-slate-200 shadow-sm">
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Required Documents</h3>
          <span className="text-xs text-slate-500">{acceptedCount} of {total} accepted</span>
        </div>
      </CardHeader>
      <CardContent className="px-0 py-0">
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
            const DocIcon = getDocIcon(row.doc.code);
            const isDone = row.status === "verified" || row.status === "accepted" || row.status === "classified";
            const isMissing = row.status === "not-uploaded";

            return (
              <li key={row.doc.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={cn(
                    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
                    (isDone || row.status === "verified") && "bg-emerald-50",
                    row.status === "submitted" && "bg-slate-100",
                    row.status === "needs-review" && "bg-amber-50",
                    row.status === "processing" && "bg-blue-50",
                    row.status === "pending" && "bg-amber-50",
                    isMissing && "bg-slate-50",
                  )}
                >
                  <DocIcon
                    className={cn(
                      "h-4 w-4",
                      (isDone || row.status === "verified") && "text-emerald-600",
                      row.status === "submitted" && "text-slate-500",
                      row.status === "needs-review" && "text-amber-600",
                      row.status === "processing" && "text-blue-600",
                      row.status === "pending" && "text-amber-500",
                      isMissing && "text-slate-300",
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium leading-tight",
                      isMissing ? "text-slate-400" : "text-slate-900",
                    )}
                  >
                    {row.doc.name}
                  </p>
                  <StatusLabel status={row.status} confidence={row.confidence} fileName={row.fileName} />
                </div>
                <StatusIcon status={row.status} />
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="border-t px-4 py-3">
        <p
          className={cn(
            "text-sm font-medium",
            acceptedCount === total && total > 0 ? "text-emerald-600" : "text-slate-500",
          )}
        >
          {acceptedCount === total && total > 0
            ? `✓ All ${total} documents accepted`
            : `✓ ${acceptedCount} of ${total} documents accepted`}
        </p>
      </CardFooter>
    </Card>
  );
}
