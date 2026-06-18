"use client";

import * as React from "react";
import { SearchCheck, FileSearch, CheckCircle, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  const flag = typeof result?.["flag"] === "string" ? result["flag"] : null;
  const acceptedByUser = result?.["accepted_by_user"] === true;
  const isFlagged = (s.status === "flagged" || (flag !== null && flag !== undefined)) && !acceptedByUser;

  let status: ClassificationStatus;
  if (acceptedByUser) {
    status = "overridden";
  } else if (s.status === "processing") {
    status = "processing";
  } else if (s.status === "uploaded" || s.status === "pending") {
    status = "pending";
  } else if (s.status === "classified" && !isFlagged) {
    status = "classified";
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
    classificationResult: result as ClassificationItem["classificationResult"],
    mimeType: s.mime_type,
  };
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
  const [items, setItems] = React.useState<ClassificationItem[]>(() =>
    submissions.map(submissionToItem),
  );

  React.useEffect(() => {
    setItems(submissions.map(submissionToItem));
  }, [submissions]);

  const classifyAllInProgress = classifyingAll || classifyingIds.size > 0;

  React.useEffect(() => {
    const uploaded = items.filter((i) => i.status === "pending" || i.status === "processing");
    const allDone = items.length > 0 && uploaded.length === 0;
    const allReviewed = allDone && items.every((i) => !i.needsReview);
    onClassificationChange?.(allReviewed);
  }, [items, onClassificationChange]);

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
    const token = await getToken();
    if (!token) return;

    const pending = items.filter((i) => i.status === "pending" || i.status === "needs-review");
    if (pending.length === 0) return;

    setClassifyingAll(true);
    setClassifyingIds((prev) => {
      const next = new Set(prev);
      for (const item of pending) next.add(item.id);
      return next;
    });

    setItems((prev) =>
      prev.map((item) => {
        if (pending.some((p) => p.id === item.id)) {
          return { ...item, status: "processing" as ClassificationStatus, needsReview: false };
        }
        return item;
      }),
    );

    for (const item of pending) {
      try {
        const res = await fetchWithClerkAuth(`/api/me/documents/${item.id}/classify`, token, {
          method: "POST",
        });

        if (res.ok) {
          const updated = await res.json();
          setItems((prev) =>
            prev.map((i) => {
              if (i.id !== item.id) return i;
              return submissionToItem(updated);
            }),
          );
        } else {
          const err = await res.json().catch(() => null);
          console.error(`Classification failed for ${item.id}:`, err);
          setItems((prev) =>
            prev.map((i) => {
              if (i.id !== item.id) return i;
              return { ...i, status: "needs-review" as ClassificationStatus, needsReview: true };
            }),
          );
        }
      } catch (err) {
        console.error(`Classification error for ${item.id}:`, err);
        setItems((prev) =>
          prev.map((i) => {
            if (i.id !== item.id) return i;
            return { ...i, status: "needs-review" as ClassificationStatus, needsReview: true };
          }),
        );
      }

      setClassifyingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }

    if (onSubmissionsUpdate) {
      const token2 = await getToken();
      if (!token2) { setClassifyingAll(false); return; }
      const fresh = await fetchWithClerkAuth("/api/me/documents", token2);
      if (fresh.ok) {
        const data = await fresh.json();
        onSubmissionsUpdate(data);
      }
    }

    setClassifyingAll(false);
  }, [items, getToken, onSubmissionsUpdate]);

  const handleClassifyOne = React.useCallback(
    async (id: string) => {
      const token = await getToken();
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
    [getToken],
  );

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
            status: "overridden" as ClassificationStatus,
            needsReview: false,
          };
        }),
      );
    },
    [requiredDocuments],
  );

  const handleSplit = React.useCallback(() => {
    // Placeholder — split dialog will be built later
  }, []);

  const handleConfirm = React.useCallback(
    (id: string, updatedItem: ClassificationItem) => {
      setItems((prev) =>
        prev.map((item) => (item.id !== id ? item : updatedItem)),
      );
      (async () => {
        const token = await getToken();
        if (!token) return;
        const res = await fetchWithClerkAuth("/api/me/documents", token);
        if (res.ok) {
          const data = await res.json();
          onSubmissionsUpdate?.(data as SubmissionDetail[]);
        }
      })();
    },
    [getToken, onSubmissionsUpdate],
  );

  const hasPending = items.some((i) => i.status === "pending" || i.status === "needs-review");
  const allClassified = items.length > 0 && items.every(
    (i) => i.status === "classified" || i.status === "overridden",
  );
  const hasItems = items.length > 0;

  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const previewItem = previewId ? items.find((i) => i.id === previewId) ?? null : null;

  const handlePreview = React.useCallback(async (id: string) => {
    setPreviewId(id);
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetchWithClerkAuth(`/api/me/documents/${id}/download-url`, token);
      if (res.ok) {
        const data = await res.json();
        setPreviewUrl(data.url);
      }
    } catch {
      setPreviewUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [getToken]);

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
          {hasItems && !allClassified && (
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

        {/* Classifying All Banner */}
        {isClassifyingAll && (
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
        {classifyAllError && !isClassifyingAll && (
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

        {/* Tips Banner (only when not all classified) */}
        {hasItems && !isClassifyingAll && !allClassified && (
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

        {/* Read-only List (all classified) */}
        {allClassified && (
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

        {/* Interactive UI (not all classified yet) */}
        {!allClassified && hasItems && (
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
                    isClassifying={classifyingIds.has(item.id)}
                    getToken={getToken}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewId !== null} onOpenChange={(open) => { if (!open) setPreviewId(null); }}>
        <DialogContent className="w-[95vw] !max-w-[95vw] h-[95vh] !max-h-[95vh] p-0 gap-0">
          <div className="flex h-full flex-col">
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle className="text-base font-semibold text-slate-900">
                {previewItem?.fileName ?? "Preview"}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
              {previewLoading ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading preview…</span>
                </div>
              ) : previewUrl ? (
                <iframe
                  title={previewItem?.fileName ?? "Preview"}
                  src={previewUrl}
                  className="h-full w-full rounded-xl border border-slate-200 bg-white"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <FileText className="h-10 w-10" />
                  <span className="text-sm">No preview available.</span>
                </div>
              )}
            </div>
            <DialogFooter className="border-t bg-white px-6 py-4 flex-row justify-end">
              <Button
                className="bg-primary text-white hover:bg-primary/90 rounded-xl"
                onClick={() => setPreviewId(null)}
              >
                Close
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}