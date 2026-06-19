"use client";

import * as React from "react";
import { SearchCheck, FileSearch, CheckCircle, Loader2, FileText, ChevronLeft, ChevronRight, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { fetchWithClerkAuth } from "@/lib/api";
import ClassificationCard from "@/components/student/UploadDocuments/classify/ClassificationCard";
import SubmissionChecklist from "@/components/student/UploadDocuments/classify/SubmissionChecklist";
import type { ClassificationItem, ClassificationStatus } from "@/types/classification";
import type { RequiredDocument } from "@/types/student";
import type { SubmissionDetail } from "@/types/submission";

type FilterTab = "all" | "needs-review" | "ready";

interface StepClassifyProps {
  requiredDocuments: RequiredDocument[];
  submissions: SubmissionDetail[];
  onClassificationChange?: (complete: boolean) => void;
  onSubmissionsUpdate?: (submissions: SubmissionDetail[]) => void;
  getToken: () => Promise<string | null>;
  isClassifyingAll?: boolean;
  classifyAllError?: string | null;
}

function submissionToItem(s: SubmissionDetail): ClassificationItem {
  const result = s.classification_result as Record<string, unknown> | null;
  const confidence = typeof result?.["confidence"] === "number" ? Math.round(result["confidence"] * 100) : null;
  const acceptedByUser = result?.["accepted_by_user"] === true;
  const isFlagged = s.status === "flagged" && !acceptedByUser;

  let status: ClassificationStatus;
  if (acceptedByUser) {
    status = "overridden";
  } else if (s.status === "processing") {
    status = "processing";
  } else if (s.status === "uploaded" || s.status === "pending") {
    status = "pending";
  } else if (s.status === "classified" && !isFlagged) {
    status = "classified";
  } else if (s.status === "submitted") {
    status = "submitted";
  } else if (s.status === "flagged" || isFlagged) {
    status = "needs-review";
  } else {
    status = "pending";
  }

  return {
    id: s.id,
    fileName: s.original_filename,
    fileSize: s.file_size ? parseInt(s.file_size, 10) : null,
    documentTypeName: s.document_type_name ?? null,
    documentTypeId: s.document_type_id ?? null,
    confidence,
    needsReview: status === "needs-review",
    isCompiledPdf: s.is_compiled,
    status,
    originalStatus: s.status,
    classificationResult: result as ClassificationItem["classificationResult"],
    mimeType: s.mime_type,
  };
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function confidenceBadgeColor(score: number): string {
  if (score >= 80) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (score >= 50) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs-review", label: "Needs Review" },
  { key: "ready", label: "Ready" },
];

export default function StepClassify({
  requiredDocuments,
  submissions,
  onClassificationChange,
  onSubmissionsUpdate,
  getToken,
  isClassifyingAll = false,
  classifyAllError = null,
}: StepClassifyProps) {
  const [classifyingIds, setClassifyingIds] = React.useState<Set<string>>(new Set());
  const [classifyingAll, setClassifyingAll] = React.useState(false);
  const [conflictError, setConflictError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<ClassificationItem[]>(() =>
    submissions.map(submissionToItem),
  );

  const getTokenRef = React.useRef(getToken);
  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  React.useEffect(() => {
    setItems(submissions.map(submissionToItem));
  }, [submissions]);

  const classifyAllInProgress = classifyingAll || classifyingIds.size > 0;
  const isProcessing = items.some((i) => i.status === "processing");

  React.useEffect(() => {
    const uploaded = items.filter((i) => i.status === "pending" || i.status === "processing");
    const allDone = items.length > 0 && uploaded.length === 0;
    const allReviewed = allDone && items.every((i) => !i.needsReview);
    onClassificationChange?.(allReviewed);
  }, [items, onClassificationChange]);

  // ── Poll backend when any item is still processing ────────────────────
  React.useEffect(() => {
    if (!isProcessing) return;

    const poll = async () => {
      const token = await getTokenRef.current();
      if (!token) return;
      const res = await fetchWithClerkAuth("/api/me/documents", token);
      if (res.ok) {
        const data = (await res.json()) as SubmissionDetail[];
        setItems(data.map(submissionToItem));
        onSubmissionsUpdate?.(data);
      }
    };

    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [isProcessing, onSubmissionsUpdate]);

  const counts = React.useMemo(() => {
    const total = items.length;
    const needsReview = items.filter((i) => i.needsReview).length;
    const ready = items.filter((i) => !i.needsReview && i.status !== "pending" && i.status !== "processing").length;
    return { total, needsReview, ready };
  }, [items]);

  const [activeTab, setActiveTab] = React.useState<FilterTab>("all");

  const filtered = React.useMemo(() => {
    switch (activeTab) {
      case "needs-review":
        return items.filter((i) => i.needsReview);
      case "ready":
        return items.filter((i) => !i.needsReview && i.status !== "pending" && i.status !== "processing");
      default:
        return items;
    }
  }, [items, activeTab]);

  const handleClassifyAll = React.useCallback(async () => {
    const token = await getTokenRef.current();
    if (!token) return;

    const pending = items.filter((i) => i.status === "pending" || i.status === "needs-review");
    if (pending.length === 0) return;

    const pendingIds = new Set(pending.map((p) => p.id));

    setClassifyingAll(true);
    setConflictError(null);
    setClassifyingIds((prev) => {
      const next = new Set(prev);
      for (const id of pendingIds) next.add(id);
      return next;
    });

    setItems((prev) =>
      prev.map((item) => {
        if (pendingIds.has(item.id)) {
          return { ...item, status: "processing" as ClassificationStatus, needsReview: false };
        }
        return item;
      }),
    );

    try {
      const res = await fetchWithClerkAuth("/api/me/documents/classify-all", token, {
        method: "POST",
        body: JSON.stringify({ submission_ids: Array.from(pendingIds) }),
      });

      if (res.ok) {
        const updated: SubmissionDetail[] = await res.json();
        setItems((prev) =>
          prev.map((item) => {
            const match = updated.find((u) => u.id === item.id);
            return match ? submissionToItem(match) : item;
          }),
        );
        onSubmissionsUpdate?.(updated);
      } else {
        const err = await res.json().catch(() => null);
        console.error("Classify all failed:", err);
        if (res.status === 409) {
          setConflictError(err?.detail ?? "A document for this requirement has already been submitted and is locked for advisor review.");
        } else {
          setConflictError(err?.detail ?? "Classification failed for some documents.");
        }
        setItems((prev) =>
          prev.map((item) =>
            pendingIds.has(item.id)
              ? { ...item, status: "needs-review" as ClassificationStatus, needsReview: true }
              : item,
          ),
        );
      }
    } catch (err) {
      console.error("Classify all error:", err);
      setConflictError("Classification request failed. Please try again.");
      setItems((prev) =>
        prev.map((item) =>
          pendingIds.has(item.id)
            ? { ...item, status: "needs-review" as ClassificationStatus, needsReview: true }
            : item,
        ),
      );
    }

    setClassifyingIds(new Set());
    setClassifyingAll(false);
  }, [items, onSubmissionsUpdate]);

  const handleClassifyOne = React.useCallback(
    async (id: string) => {
      const currentItems = itemsRef.current;
      const item = currentItems.find((i) => i.id === id);
      if (!item || item.originalStatus === "submitted") return;

      const token = await getTokenRef.current();
      if (!token) return;

      setClassifyingIds((prev) => new Set(prev).add(id));
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return { ...item, status: "processing" as ClassificationStatus };
        }),
      );

      try {
        const res = await fetchWithClerkAuth(`/api/me/documents/${id}/classify`, token, {
          method: "POST",
        });
        if (res.ok) {
          const updated = await res.json();
          setItems((prev) =>
            prev.map((i) => (i.id !== id ? i : submissionToItem(updated))),
          );
        } else {
          const err = await res.json().catch(() => null);
          toast.error(err?.detail ?? "Classification failed.");
          setItems((prev) =>
            prev.map((i) => {
              if (i.id !== id) return i;
              return { ...i, status: "needs-review" as ClassificationStatus, needsReview: true };
            }),
          );
        }
      } catch {
        setItems((prev) =>
          prev.map((i) => {
            if (i.id !== id) return i;
            return { ...i, status: "needs-review" as ClassificationStatus, needsReview: true };
          }),
        );
      }

      setClassifyingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [],
  );

  const handleOverride = React.useCallback(
    (fileId: string, documentTypeId: string) => {
      const item = items.find((i) => i.id === fileId);
      if (item?.originalStatus === "submitted") return;

      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== fileId) return item;
          const dt = requiredDocuments.find((r) => r.id === documentTypeId);
          return {
            ...item,
            documentTypeId,
            documentTypeName: dt?.name ?? null,
            status: "overridden" as ClassificationStatus,
            needsReview: false,
          };
        }),
      );
    },
    [requiredDocuments, items],
  );

  const handleSplit = React.useCallback(() => {
    // Placeholder — split dialog will be built later
  }, []);

  const handleConfirm = React.useCallback(
    (id: string, updatedItem: ClassificationItem) => {
      const item = items.find((i) => i.id === id);
      if (item?.originalStatus === "submitted") return;

      setItems((prev) =>
        prev.map((item) => (item.id !== id ? item : updatedItem)),
      );
      (async () => {
        const token = await getTokenRef.current();
        if (!token) return;
        const res = await fetchWithClerkAuth("/api/me/documents", token);
        if (res.ok) {
          const data = await res.json();
          onSubmissionsUpdate?.(data as SubmissionDetail[]);
        }
      })();
    },
    [onSubmissionsUpdate, items],
  );

  const handleDelete = React.useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    [],
  );

  const hasPending = items.some((i) => i.status === "pending" || i.status === "needs-review");
  const allClassified = items.length > 0 && items.every(
    (i) => i.status === "classified" || i.status === "overridden" || i.status === "submitted",
  );
  const hasItems = items.length > 0;

  const previewableItems = React.useMemo(
    () => items.filter((i) => i.status !== "pending" && i.status !== "processing"),
    [items],
  );

  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const previewItem = previewIndex !== null ? previewableItems[previewIndex] ?? null : null;

  const handlePreview = React.useCallback((id: string) => {
    const idx = previewableItems.findIndex((i) => i.id === id);
    if (idx !== -1) setPreviewIndex(idx);
  }, [previewableItems]);

  const handlePrev = React.useCallback(() => {
    setPreviewIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
  }, []);

  const handleNext = React.useCallback(() => {
    setPreviewIndex((prev) =>
      prev !== null && prev < previewableItems.length - 1 ? prev + 1 : prev,
    );
  }, [previewableItems.length]);

  React.useEffect(() => {
    if (previewIndex === null) {
      setPreviewUrl(null);
      setPreviewLoading(false);
      return;
    }
    const item = previewableItems[previewIndex];
    if (!item) return;

    let cancelled = false;
    const fetchUrl = async () => {
      setPreviewLoading(true);
      setPreviewUrl(null);
      const token = await getTokenRef.current();
      if (!token || cancelled) return;
      const res = await fetchWithClerkAuth(`/api/me/documents/${item.id}/download-url`, token);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { url: string };
      if (!cancelled) setPreviewUrl(data.url);
      if (!cancelled) setPreviewLoading(false);
    };
    fetchUrl();
    return () => { cancelled = true; };
  }, [previewIndex, previewableItems]);

  const processingItems = items.filter((i) => i.status === "processing");
  const interactiveItems = items.filter((i) => i.status !== "processing");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Required Documents Checklist */}
      <div className="lg:col-span-4 lg:sticky lg:top-6 self-start">
        <SubmissionChecklist requiredDocuments={requiredDocuments} items={items} />
      </div>

      {/* Right: Classification Cards */}
      <div className="lg:col-span-8 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-[28px] font-semibold tracking-tight text-slate-900">
              Classify Your Documents
            </h2>
            {allClassified ? (
              <p className="mt-1 text-base text-slate-500">
                All documents have been classified. You can proceed to the next step.
              </p>
            ) : (
              <p className="mt-1 text-base text-slate-500">
                Review each document and assign the correct document type. Click{" "}
                <span className="font-semibold text-primary">Classify All</span> to run AI classification.
              </p>
            )}
          </div>
          {hasItems && !allClassified && !isProcessing && (
            <button
              type="button"
              disabled={!hasPending || classifyAllInProgress}
              onClick={handleClassifyAll}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap",
                hasPending && !classifyingAll
                  ? "bg-primary text-white hover:bg-primary/90 shadow-md"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed",
              )}
            >
              {classifyingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SearchCheck className="h-4 w-4" />
              )}
              {classifyingAll ? "Classifying…" : "Classify All"}
            </button>
          )}
        </div>

        {/* Classifying / Processing Banner */}
        {(isProcessing || isClassifyingAll) && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <Loader2 className="h-5 w-5 animate-spin flex-shrink-0 text-blue-600" />
            <div>
              <p className="text-sm font-semibold">Classifying your documents…</p>
              <p className="text-xs text-blue-700 mt-0.5">
                This may take a moment for each file.
              </p>
            </div>
          </div>
        )}

        {/* Classify Error Banner */}
        {classifyAllError && !isClassifyingAll && !isProcessing && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
            <FileSearch className="h-5 w-5 flex-shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold">Some documents could not be classified</p>
              <p className="text-xs text-red-700 mt-0.5">{classifyAllError}</p>
              <p className="text-xs text-red-700 mt-0.5">
                You can retry individual documents below.
              </p>
            </div>
          </div>
        )}

        {/* Conflict Error Banner */}
        {conflictError && !isClassifyingAll && !isProcessing && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold">Document already submitted</p>
              <p className="text-xs text-amber-700 mt-0.5">{conflictError}</p>
              <p className="text-xs text-amber-700 mt-0.5">
                This document cannot be reclassified. The new file has been removed.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConflictError(null)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-amber-500 hover:bg-amber-100 transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Tips Banner (only when not all classified and nothing processing) */}
        {hasItems && !isProcessing && !isClassifyingAll && !allClassified && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <SearchCheck className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <p className="text-sm">
              Review each document below. Items flagged with{" "}
              <span className="font-bold">Low</span> or{" "}
              <span className="font-bold">Medium</span> confidence need your
              attention. Use the dropdown to override the AI prediction.
            </p>
          </div>
        )}

        {/* Empty State */}
        {!hasItems && (
          <div className="flex flex-col items-center gap-3 py-16">
            <FileSearch className="h-12 w-12 text-slate-300" />
            <p className="text-sm font-medium text-slate-400">
              No documents uploaded yet. Go back to Step 1 to upload documents.
            </p>
          </div>
        )}

        {/* Processing Items — loading spinners above everything else */}
        {processingItems.length > 0 && (
          <div className="space-y-3">
            {processingItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm"
              >
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-blue-900">
                    {item.fileName}
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Classifying document…
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Read-only List (all classified, nothing processing) */}
        {allClassified && !isProcessing && (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100">
                  <FileText className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {item.fileName}
                  </p>
                  {item.documentTypeName && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      <span className="font-semibold text-primary">{item.documentTypeName}</span>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handlePreview(item.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
                >
                  <FileText className="h-4 w-4" />
                  Preview
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Interactive UI (not all classified yet) — only for non-processing items */}
        {!allClassified && hasItems && interactiveItems.length > 0 && (
          <>
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
                  <p className="text-sm font-medium text-slate-400">
                    No documents to show.
                  </p>
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
                    onClassify={handleClassifyOne}
                    onConfirm={handleConfirm}
                    onDelete={handleDelete}
                    isClassifying={classifyingIds.has(item.id)}
                    getToken={getToken}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Nothing to interact with — all items are processing */}
        {!allClassified && hasItems && interactiveItems.length === 0 && isProcessing && (
          <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium">All documents are being classified…</p>
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewIndex !== null} onOpenChange={(open) => { if (!open) setPreviewIndex(null); }}>
        <DialogContent className="w-[95vw] !max-w-[95vw] h-[95vh] !max-h-[95vh] flex flex-col p-0 overflow-hidden rounded-2xl gap-0 border border-slate-200">

          {/* Custom Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white z-10">
            <h3 className="font-semibold text-slate-900 text-base max-w-[60%] truncate">
              {previewItem?.fileName ?? "Preview"}
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-medium tabular-nums">
                {previewIndex !== null ? `${previewIndex + 1} of ${previewableItems.length}` : ""}
              </span>
              <button
                type="button"
                onClick={() => setPreviewIndex(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Split Pane */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-[2fr_1fr] overflow-hidden bg-slate-50">

            {/* Left: Dark PDF Viewer */}
            <div className="p-4 flex items-center justify-center overflow-hidden h-full bg-slate-800 border-b md:border-b-0">
              {previewLoading ? (
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-xs font-medium">Loading preview…</p>
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full rounded-lg bg-white shadow-sm border border-slate-700"
                  title="Document Preview"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <FileText className="h-10 w-10 text-slate-400" />
                  <span className="text-sm">No preview available.</span>
                </div>
              )}
            </div>

            {/* Right: Classification + Metadata */}
            <div className="bg-white p-6 overflow-y-auto flex flex-col h-full border-l border-slate-100">
              {previewItem && (
                <>
                  {/* Classification */}
                  <div className="mb-6 pb-4 border-b border-slate-100">
                    <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase block mb-2">
                      Document Classification
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-lg font-bold text-slate-900">
                        {previewItem.documentTypeName ?? "Unclassified"}
                      </h4>
                      {previewItem.confidence !== null && (
                        <Badge
                          variant="outline"
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${confidenceBadgeColor(previewItem.confidence)}`}
                        >
                          {previewItem.confidence}% match
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* File Metadata */}
                  <div className="space-y-4">
                    <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase block">
                      File Information
                    </span>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-xs text-slate-500 shrink-0 w-24">File name</span>
                        <span className="text-xs font-medium text-slate-900 text-right break-all">{previewItem.fileName}</span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-xs text-slate-500 shrink-0 w-24">File size</span>
                        <span className="text-xs font-medium text-slate-900">{formatFileSize(previewItem.fileSize)}</span>
                      </div>
                      {previewItem.mimeType && (
                        <div className="flex items-start justify-between gap-4">
                          <span className="text-xs text-slate-500 shrink-0 w-24">Type</span>
                          <span className="text-xs font-medium text-slate-900 text-right">{previewItem.mimeType}</span>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-xs text-slate-500 shrink-0 w-24">Compiled PDF</span>
                        <span className="text-xs font-medium text-slate-900">{previewItem.isCompiledPdf ? "Yes" : "No"}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-center">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={previewIndex === null || previewIndex === 0}
                onClick={handlePrev}
                className="gap-1 text-xs h-9 rounded-xl border-slate-200 hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={previewIndex === null || previewIndex >= previewableItems.length - 1}
                onClick={handleNext}
                className="gap-1 text-xs h-9 rounded-xl border-slate-200 hover:bg-slate-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

        </DialogContent>
      </Dialog>
    </div>
  );
}
