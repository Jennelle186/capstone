"use client";

import * as React from "react";
import { SearchCheck, FileSearch, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import ClassificationCard from "@/components/student/UploadDocuments/classify/ClassificationCard";
import type { ClassificationItem } from "@/types/classification";
import type { RequiredDocument } from "@/types/student";
import type { DocumentUploadResponse } from "@/types/submission";

type FilterTab = "all" | "needs-review" | "ready";

interface StepClassifyProps {
  requiredDocuments: RequiredDocument[];
  submissions?: DocumentUploadResponse[];
  onClassificationChange?: (complete: boolean) => void;
}

const MOCK_ITEMS: ClassificationItem[] = [
  {
    id: "1",
    fileName: "scanned_doc_001.pdf",
    fileSize: 2.4 * 1024 * 1024,
    documentTypeName: "PSA Birth Certificate",
    documentTypeId: "dt-birth-cert",
    confidence: 35,
    needsReview: true,
    isCompiledPdf: true,
    status: "needs-review",
  },
  {
    id: "2",
    fileName: "IMG_2023_BirthCert.jpg",
    fileSize: 1.1 * 1024 * 1024,
    documentTypeName: "PSA Birth Certificate",
    documentTypeId: "dt-birth-cert",
    confidence: 94,
    needsReview: false,
    isCompiledPdf: false,
    status: "classified",
  },
  {
    id: "3",
    fileName: "transcript_final_v2.pdf",
    fileSize: 3.8 * 1024 * 1024,
    documentTypeName: "Form 137 / Transcript",
    documentTypeId: "dt-form-137",
    confidence: 91,
    needsReview: false,
    isCompiledPdf: false,
    status: "classified",
  },
  {
    id: "4",
    fileName: "form_137_signed.pdf",
    fileSize: 0.9 * 1024 * 1024,
    documentTypeName: "Form 137 / Transcript",
    documentTypeId: "dt-form-137",
    confidence: 68,
    needsReview: true,
    isCompiledPdf: false,
    status: "needs-review",
  },
];

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs-review", label: "Needs Review" },
  { key: "ready", label: "Ready" },
];

export default function StepClassify({ requiredDocuments, onClassificationChange }: StepClassifyProps) {
  const [activeTab, setActiveTab] = React.useState<FilterTab>("all");
  const [items, setItems] = React.useState<ClassificationItem[]>(MOCK_ITEMS);

  React.useEffect(() => {
    const complete = items.length > 0 && items.every((i) => !i.needsReview);
    onClassificationChange?.(complete);
  }, [items, onClassificationChange]);

  const counts = React.useMemo(() => {
    const total = items.length;
    const needsReview = items.filter((i) => i.needsReview).length;
    const ready = items.filter((i) => !i.needsReview).length;
    return { total, needsReview, ready };
  }, [items]);

  const filtered = React.useMemo(() => {
    switch (activeTab) {
      case "needs-review":
        return items.filter((i) => i.needsReview);
      case "ready":
        return items.filter((i) => !i.needsReview);
      default:
        return items;
    }
  }, [items, activeTab]);

  const handleOverride = React.useCallback(
    (fileId: string, documentTypeId: string) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== fileId) return item;
          const dt = requiredDocuments.find((r) => r.id === documentTypeId);
          return {
            ...item,
            documentTypeId,
            documentTypeName: dt?.name ?? null,
            status: "overridden" as const,
            needsReview: false,
          };
        }),
      );
    },
    [requiredDocuments],
  );

  const handleSplit = React.useCallback((fileId: string) => {
    // Placeholder — split dialog will be built later
     
    console.log("Split requested for file:", fileId);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-headline-lg text-[28px] font-semibold tracking-tight text-slate-900">
          Classify Your Documents
        </h2>
        <p className="mt-1 text-base text-slate-500">
          Review each document below and assign the correct document type using
          the dropdown.
        </p>
      </div>

      {/* Tips Banner */}
      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <SearchCheck className="h-5 w-5 flex-shrink-0 text-amber-600" />
        <p className="text-sm">
          Review each document below. Items flagged with{" "}
          <span className="font-bold">Low</span> or{" "}
          <span className="font-bold">Medium</span> confidence need your
          attention.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        {TABS.map((tab) => {
          const count =
            tab.key === "all"
              ? counts.total
              : tab.key === "needs-review"
                ? counts.needsReview
                : counts.ready;

          const isActive = activeTab === tab.key;
          const hasIssues = tab.key === "needs-review" && count > 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
                isActive && !hasIssues && "bg-primary text-white",
                isActive && hasIssues && "bg-red-600 text-white",
                !isActive && "bg-slate-100 text-slate-600 hover:bg-slate-200",
                !isActive && hasIssues && "ring-1 ring-red-300",
              )}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      {/* File Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          {activeTab === "needs-review" ? (
            <>
              <CheckCircle className="h-12 w-12 text-emerald-400" />
              <p className="text-sm font-medium text-emerald-600">
                All documents classified!
              </p>
              <p className="text-xs text-slate-400">
                Everything looks good. You can proceed to the next step.
              </p>
            </>
          ) : (
            <>
              <FileSearch className="h-12 w-12 text-slate-300" />
              <p className="text-sm font-medium text-slate-400">
                No {activeTab === "ready" ? "ready" : ""} documents to show.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <ClassificationCard
              key={item.id}
              item={item}
              documentTypes={requiredDocuments}
              onOverride={handleOverride}
              onSplit={handleSplit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
