"use client";

import * as React from "react";
import { FileText, ImageIcon, Scissors, AlertTriangle, CheckCircle, Loader2, SearchCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWithClerkAuth } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ClassificationItem, ClassificationStatus } from "@/types/classification";
import type { RequiredDocument } from "@/types/student";
import type { SubmissionDetail } from "@/types/submission";

interface ClassificationCardProps {
  item: ClassificationItem;
  documentTypes: RequiredDocument[];
  onOverride: (fileId: string, documentTypeId: string) => void;
  onSplit: (fileId: string) => void;
  onClassify: (id: string) => void;
  onConfirm: (id: string, updatedItem: ClassificationItem) => void;
  isClassifying: boolean;
  getToken: () => Promise<string | null>;
}

function formatFileSize(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function isImageFile(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext ?? "");
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

function StatusBadge({ status, confidence }: { status: ClassificationStatus; confidence: number | null }) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">
          Pending
        </span>
      );
    case "processing":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-blue-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing
        </span>
      );
    case "overridden":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
          <CheckCircle className="h-3 w-3" />
          Accepted by the user
        </span>
      );
    case "classified":
      if (confidence !== null && confidence >= 80) {
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
            <CheckCircle className="h-3 w-3" />
            High ({confidence}%)
          </span>
        );
      }
      if (confidence !== null && confidence >= 50) {
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            Medium ({confidence}%)
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-red-700">
          <AlertTriangle className="h-3 w-3" />
          Low{confidence !== null ? ` (${confidence}%)` : ""}
        </span>
      );
    case "needs-review":
    case "flagged":
      if (confidence !== null && confidence >= 50) {
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            Medium ({confidence}%)
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-red-700">
          <AlertTriangle className="h-3 w-3" />
          Low{confidence !== null ? ` (${confidence}%)` : ""}
        </span>
      );
    default:
      return null;
  }
}

export default function ClassificationCard({
  item,
  documentTypes,
  onOverride,
  onSplit,
  onClassify,
  onConfirm,
  isClassifying,
  getToken,
}: ClassificationCardProps) {
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [accepting, setAccepting] = React.useState(false);
  const isImage = isImageFile(item.fileName);
  const isPending = item.status === "pending";
  const isProcessing = item.status === "processing" || isClassifying;
  const showAccept = (item.status === "needs-review" || item.status === "flagged") && item.documentTypeId;

  const handlePreview = React.useCallback(async () => {
    if (item.status === "pending") return;
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetchWithClerkAuth(`/api/me/documents/${item.id}/download-url`, token);
      if (res.ok) {
        const data = await res.json();
        setPreviewUrl(data.url);
      }
    } catch {
      setPreviewUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [item.id, item.status, getToken]);

  const handleAccept = React.useCallback(async () => {
    setAccepting(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetchWithClerkAuth(`/api/me/documents/${item.id}/confirm`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const updated = await res.json();
        const updatedItem = submissionToItem(updated as SubmissionDetail);
        onConfirm(item.id, { ...updatedItem, status: "overridden", needsReview: false });
      }
    } catch {
      // silently fail
    } finally {
      setAccepting(false);
    }
  }, [item.id, getToken, onConfirm]);

  const handleOverrideAndConfirm = React.useCallback(
    async (documentTypeId: string) => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetchWithClerkAuth(`/api/me/documents/${item.id}/confirm`, token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_type_id: documentTypeId }),
        });
        if (res.ok) {
          const updated = await res.json();
          const updatedItem = submissionToItem(updated as SubmissionDetail);
          onConfirm(item.id, { ...updatedItem, status: "overridden", needsReview: false });
          onOverride(item.id, documentTypeId);
        }
      } catch {
        // silently fail
      }
    },
    [item.id, getToken, onConfirm, onOverride],
  );

  return (
    <>
      <div
        className={cn(
          "flex flex-col lg:flex-row lg:items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-md",
          item.needsReview
            ? "border-amber-300 hover:border-amber-400"
            : isPending
              ? "border-slate-300 hover:border-slate-400"
              : "border-slate-200 hover:border-slate-300",
        )}
      >
        {/* Left: icon + file info */}
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPending}
          className={cn(
            "flex items-center gap-4 flex-1 min-w-0 text-left",
            isPending && "cursor-default",
          )}
        >
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100">
            {isImage ? (
              <ImageIcon className="h-8 w-8 text-primary" />
            ) : (
              <FileText className="h-8 w-8 text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="truncate max-w-[280px] text-sm font-bold text-slate-900">
                {item.fileName}
              </p>
              <StatusBadge status={item.status} confidence={item.confidence} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
              {item.fileSize ? <span>{formatFileSize(item.fileSize)}</span> : null}
              {item.fileSize && (item.documentTypeName || item.status === "pending" || item.status === "overridden") ? (
                <span className="w-1 h-1 rounded-full bg-slate-300" />
              ) : null}
              {item.status === "pending" ? (
                <span className="italic text-slate-400">Not yet classified</span>
              ) : item.status === "overridden" ? (
                <span className="font-semibold text-emerald-600">
                  Accepted by the user
                </span>
              ) : item.documentTypeName ? (
                <span className="truncate">
                  Predicted:{" "}
                  <span className="font-semibold text-primary">{item.documentTypeName}</span>
                  {item.classificationResult?.source && (
                    <span className="text-slate-400"> · via {item.classificationResult.source}</span>
                  )}
                </span>
              ) : (
                <span className="italic text-red-500">Unknown document type</span>
              )}
            </div>
          </div>
        </button>

        {/* Right: actions */}
        <div className="flex flex-row items-center gap-2 sm:shrink-0">
          {isPending ? (
            <Button
              variant="outline"
              size="sm"
              className="h-10 rounded-xl whitespace-nowrap gap-1.5 border-primary text-primary hover:bg-primary hover:text-white"
              onClick={() => onClassify(item.id)}
              disabled={isProcessing}
            >
              {isClassifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SearchCheck className="h-4 w-4" />
              )}
              {isClassifying ? "Classifying…" : "Classify"}
            </Button>
          ) : item.status === "classified" || item.status === "overridden" ? (
            <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 whitespace-nowrap">
              <CheckCircle className="h-4 w-4" />
              Confirmed
            </div>
          ) : (
            <>
              <Select
                value={item.documentTypeId ?? undefined}
                onValueChange={handleOverrideAndConfirm}
              >
                <SelectTrigger
                  className={cn(
                    "w-full sm:w-[260px] h-10",
                    item.needsReview && "border-amber-300 ring-1 ring-amber-200",
                  )}
                >
                  <SelectValue placeholder="Select document type…" />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map((dt) => (
                    <SelectItem key={dt.id} value={dt.id}>
                      {dt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showAccept && (
                <Button
                  size="sm"
                  className="h-10 rounded-xl whitespace-nowrap gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 shrink-0"
                  onClick={handleAccept}
                  disabled={accepting}
                >
                  {accepting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Accept
                </Button>
              )}
              {item.isCompiledPdf && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 rounded-xl whitespace-nowrap shrink-0"
                  onClick={() => onSplit(item.id)}
                >
                  <Scissors className="h-4 w-4 mr-1" />
                  Split
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[95vw] !max-w-[95vw] h-[95vh] !max-h-[95vh] p-0 gap-0">
          <div className="flex h-full flex-col">
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle className="text-base font-semibold text-slate-900">
                {item.fileName}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
              {previewLoading ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading preview…</span>
                </div>
              ) : previewUrl && isImage ? (
                <img
                  src={previewUrl}
                  alt={item.fileName}
                  className="max-h-full max-w-full rounded-xl object-contain"
                />
              ) : previewUrl ? (
                <iframe
                  title={item.fileName}
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
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}