"use client";

import * as React from "react";
import { FileText, ImageIcon, Scissors, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ClassificationItem } from "@/types/classification";
import type { RequiredDocument } from "@/types/student";

interface ClassificationCardProps {
  item: ClassificationItem;
  documentTypes: RequiredDocument[];
  onOverride: (fileId: string, documentTypeId: string) => void;
  onSplit: (fileId: string) => void;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function isImageFile(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext ?? "");
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
        Pending
      </span>
    );
  }

  if (confidence >= 80) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
        <CheckCircle className="h-3 w-3" />
        High
      </span>
    );
  }

  if (confidence >= 50) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
        <AlertTriangle className="h-3 w-3" />
        Medium
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-red-700">
      <AlertTriangle className="h-3 w-3" />
      Low
    </span>
  );
}

export default function ClassificationCard({
  item,
  documentTypes,
  onOverride,
  onSplit,
}: ClassificationCardProps) {
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const isImage = isImageFile(item.fileName);

  const statusBadge =
    item.status === "overridden" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-blue-700">
        <CheckCircle className="h-3 w-3" />
        Confirmed
      </span>
    ) : null;

  return (
    <>
      <div
        className={cn(
          "group flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-md",
          item.needsReview
            ? "border-amber-300 hover:border-amber-400"
            : "border-slate-200 hover:border-slate-300",
        )}
      >
        {/* Row 1: icon, filename, badge — clickable for preview */}
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="flex w-full items-start gap-3 text-left"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
            {isImage ? (
              <ImageIcon className="h-5 w-5 text-primary" />
            ) : (
              <FileText className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-slate-900">
                {item.fileName}
              </p>
              {statusBadge ?? <ConfidenceBadge confidence={item.confidence} />}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatFileSize(item.fileSize)}
              {item.documentTypeName
                ? ` • Suggested: ${item.documentTypeName}`
                : ""}
            </p>
          </div>
        </button>

      {/* Row 2: override dropdown + split button */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Assigned Type
          </label>
          <Select
            value={item.documentTypeId ?? undefined}
            onValueChange={(val) => onOverride(item.id, val)}
          >
            <SelectTrigger
              className={cn(
                "w-full",
                item.needsReview && "border-amber-300 ring-1 ring-amber-200",
              )}
            >
              <SelectValue placeholder="Select document type..." />
            </SelectTrigger>
            <SelectContent>
              {documentTypes.map((dt) => (
                <SelectItem key={dt.id} value={dt.id}>
                  {dt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {item.isCompiledPdf && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 whitespace-nowrap opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            onClick={() => onSplit(item.id)}
          >
            <Scissors className="h-3.5 w-3.5" />
            Split this file
          </Button>
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
              {item.previewUrl && isImage ? (
                <img
                  src={item.previewUrl}
                  alt={item.fileName}
                  className="max-h-full max-w-full rounded-xl object-contain"
                />
              ) : item.previewUrl ? (
                <iframe
                  title={item.fileName}
                  src={item.previewUrl}
                  className="h-full w-full rounded-xl border border-slate-200 bg-white"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <FileText className="h-10 w-10" />
                  <span className="text-sm">No preview available.</span>
                </div>
              )}
            </div>
            <div className="border-t bg-white px-6 py-4 flex justify-end">
              <Button
                className="bg-primary text-white hover:bg-primary/90 rounded-xl"
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
