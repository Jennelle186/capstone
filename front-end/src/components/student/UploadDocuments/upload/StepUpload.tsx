"use client";

import * as React from "react";
import {
  CloudUpload,
  FileText,
  Trash2,
  CheckCircle,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { RequiredDocument } from "@/types/student";

const MAX_FILE_SIZE = 315 * 1024 * 1024; // 315MB (LlamaCloud limit)

type FileItem = {
  id: string;
  file: File;
  previewUrl?: string;
  pdfUrl?: string;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function isPreviewable(file: File) {
  if (file.type.startsWith("image/") || file.type === "application/pdf") return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "pdf" || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext ?? "");
}

interface StepUploadProps {
  requiredDocuments?: RequiredDocument[];
}

function isImageFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext ?? "");
}

export default function StepUpload({ requiredDocuments }: StepUploadProps) {
  const [files, setFiles] = React.useState<FileItem[]>([]);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addFiles = React.useCallback((incoming: FileList | File[]) => {
    const newFiles = Array.from(incoming).filter((f) => f.size <= MAX_FILE_SIZE);
    const items: FileItem[] = newFiles.map((file, i) => ({
      id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}-${i}`,
      file,
      previewUrl: isImageFile(file) ? URL.createObjectURL(file) : undefined,
      pdfUrl: file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
        ? URL.createObjectURL(file)
        : undefined,
    }));
    setFiles((prev) => [...prev, ...items]);
  }, []);

  const removeFile = React.useCallback((id: string) => {
    setFiles((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (item?.pdfUrl) URL.revokeObjectURL(item.pdfUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const previewableItems = React.useMemo(
    () => files.filter((f) => isPreviewable(f.file)),
    [files]
  );

  const activePreview = previewIndex !== null ? previewableItems[previewIndex] : null;

  const handlePrevPreview = () => {
    setPreviewIndex((prev) =>
      prev !== null ? (prev - 1 < 0 ? previewableItems.length - 1 : prev - 1) : null
    );
  };

  const handleNextPreview = () => {
    setPreviewIndex((prev) =>
      prev !== null ? (prev + 1) % previewableItems.length : null
    );
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left: Drop zone + file list */}
      <div className="col-span-12 lg:col-span-8 space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center min-h-[280px] transition-all cursor-pointer",
            isDragOver
              ? "border-primary bg-emerald-50"
              : "border-slate-300 hover:border-primary/50"
          )}
        >
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <CloudUpload className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Drop your documents here</h3>
          <p className="text-sm text-slate-500 mb-4 text-center max-w-sm">
            Support for PDF, PNG, and JPG files up to 315MB. Larger files will take longer to
            process.
          </p>
          <Button
            type="button"
            className="bg-primary text-white hover:bg-primary/90 rounded-xl"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            Select Files from Computer
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                addFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Recently Uploaded ({files.length})
              </h4>
              <button
                onClick={() => {
                  files.forEach((f) => {
                    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                    if (f.pdfUrl) URL.revokeObjectURL(f.pdfUrl);
                  });
                  setFiles([]);
                }}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Clear All
              </button>
            </div>
            <div className="space-y-2">
              {files.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4 group hover:shadow-sm transition-shadow"
                >
                  <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="h-full w-full object-cover rounded-lg"
                      />
                    ) : (
                      <FileText className="h-5 w-5 text-slate-500" />
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {item.file.name}
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {formatFileSize(item.file.size)} &bull; Ready to classify
                    </p>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        const idx = previewableItems.findIndex((p) => p.id === item.id);
                        if (idx >= 0) setPreviewIndex(idx);
                      }}
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <FileText className="h-4 w-4 text-slate-500" />
                    </button>
                    <button
                      onClick={() => removeFile(item.id)}
                      className="p-2 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: Required docs + Tips + Trust */}
      <div className="col-span-12 lg:col-span-4 space-y-4">
        {/* Required Documents */}
        {requiredDocuments && requiredDocuments.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList className="h-5 w-5 text-primary" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">
                Required Documents
              </h4>
            </div>
            <ul className="space-y-2">
              {requiredDocuments.map((doc) => (
                <li key={doc.id} className="flex items-center gap-2 text-sm text-slate-700">
                  {doc.is_required ? (
                    <span className="text-red-500 font-bold text-base leading-none">*</span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                  )}
                  <span>{doc.name}</span>
                  {!doc.is_required && (
                    <span className="text-xs text-slate-400 ml-auto">Optional</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Upload Tips */}
        <div className="bg-emerald-50/50 rounded-2xl p-5 border border-emerald-200">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-5 w-5 text-primary" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">Upload Tips</h4>
          </div>
          <ul className="space-y-3">
            {[
              "Ensure documents are well-lit and all four corners are visible.",
              "High-resolution scans lead to faster verification times.",
              "Avoid glare on laminated surfaces when using photography.",
            ].map((tip) => (
              <li key={tip} className="flex gap-3">
                <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-slate-600">{tip}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Academic Trust */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="relative z-10">
            <h4 className="text-base font-semibold text-slate-900 mb-2">Academic Trust</h4>
            <p className="text-sm text-slate-500 mb-4">
              Our systems utilize bank-grade encryption to ensure your personal data remains secure
              throughout the verification process.
            </p>
            <a
              href="#"
              className="text-xs font-semibold text-primary flex items-center gap-1 hover:gap-2 transition-all"
            >
              View Privacy Policy
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 rotate-12">
            <FileText className="h-28 w-28 text-primary" />
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewIndex !== null} onOpenChange={(open) => !open && setPreviewIndex(null)}>
        <DialogContent className="w-[95vw] !max-w-[95vw] h-[95vh] !max-h-[95vh] p-0 gap-0">
          <div className="flex h-full flex-col">
            {/* Header */}
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle className="text-base font-semibold text-slate-900">
                {activePreview?.file.name ?? "Document Preview"}
              </DialogTitle>
            </DialogHeader>

            {/* Preview area */}
            <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
              {activePreview?.previewUrl ? (
                <img
                  src={activePreview.previewUrl}
                  alt={activePreview.file.name}
                  className="max-h-full max-w-full rounded-xl object-contain"
                />
              ) : activePreview?.pdfUrl ? (
                <iframe
                  title={activePreview.file.name}
                  src={activePreview.pdfUrl}
                  className="h-full w-full rounded-xl border border-slate-200 bg-white"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <FileText className="h-10 w-10" />
                  <span className="text-sm">No preview available.</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t bg-white px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={previewableItems.length <= 1}
                    onClick={handlePrevPreview}
                    className="h-9 w-9 rounded-full"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium text-slate-600 min-w-16 text-center">
                    {previewableItems.length
                      ? `${(previewIndex ?? 0) + 1} / ${previewableItems.length}`
                      : "0 / 0"}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={previewableItems.length <= 1}
                    onClick={handleNextPreview}
                    className="h-9 w-9 rounded-full"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  className="bg-primary text-white hover:bg-primary/90 rounded-xl"
                  onClick={() => setPreviewIndex(null)}
                >
                  Looks good
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
