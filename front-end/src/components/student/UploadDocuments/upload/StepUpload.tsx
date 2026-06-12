"use client";

import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import {
  CloudUpload,
  FileText,
  Trash2,
  CheckCircle,
  Loader2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchWithClerkAuth } from "@/lib/api";
import type { RequiredDocument } from "@/types/student";
import type { DocumentUploadResponse, SubmissionDetail } from "@/types/submission";
import DocumentPreviewDialog, { type PreviewItem } from "./DocumentPreviewDialog";
import UploadSidebar from "./UploadSidebar";

const MAX_FILE_SIZE = 315 * 1024 * 1024;

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
  getToken: () => Promise<string | null>;
  onUploadComplete?: (result: DocumentUploadResponse) => void;
  existingSubmissions?: SubmissionDetail[];
}

function isImageFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext ?? "");
}

export default function StepUpload({ requiredDocuments, getToken, onUploadComplete, existingSubmissions }: StepUploadProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [uploadedIds, setUploadedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
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

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (item?.pdfUrl) URL.revokeObjectURL(item.pdfUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const uploadOne = useCallback(async (item: FileItem, token: string) => {
    const formData = new FormData();
    formData.append("file", item.file);
    const res = await fetchWithClerkAuth("/api/me/documents/upload", token, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
    }
    const result: DocumentUploadResponse = await res.json();
    console.log("Upload success:", result);
    setUploadedIds((prev) => new Set(prev).add(item.id));
    onUploadComplete?.(result);
  }, [onUploadComplete]);

  const handleUpload = useCallback(async (item: FileItem) => {
    const token = await getToken();
    if (!token) return;
    setUploadingIds((prev) => new Set(prev).add(item.id));
    try {
      await uploadOne(item, token);
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, [getToken, uploadOne]);

  const handleUploadAll = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const pending = files.filter((f) => !uploadedIds.has(f.id));
    const pendingIds = new Set(pending.map((f) => f.id));
    setUploadingIds((prev) => {
      const next = new Set(prev);
      for (const id of pendingIds) next.add(id);
      return next;
    });
    for (const item of pending) {
      try {
        await uploadOne(item, token);
      } catch (err) {
        console.error(`Upload error for ${item.file.name}:`, err);
      } finally {
        setUploadingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    }
  }, [getToken, uploadedIds, files, uploadOne]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer?.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const previewItems = useMemo<PreviewItem[]>(() => {
    const items: PreviewItem[] = [];
    for (const f of files) {
      if (isPreviewable(f.file)) {
        items.push({
          type: "new",
          id: f.id,
          file: f.file,
          previewUrl: f.previewUrl,
          pdfUrl: f.pdfUrl,
        });
      }
    }
    for (const sub of existingSubmissions ?? []) {
      if (sub.status === "uploaded" || sub.status === "flagged") {
        items.push({ type: "existing", submission: sub });
      }
    }
    return items;
  }, [files, existingSubmissions]);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left: Drop zone + file list */}
      <div className="col-span-12 lg:col-span-8 space-y-4">
        {/* Previously Uploaded */}
        {existingSubmissions && existingSubmissions.filter(
          (s) => s.status === "uploaded" || s.status === "flagged"
        ).length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Clock className="size-4" />
              Previously Uploaded
            </h4>
            <div className="space-y-1.5">
              {existingSubmissions
                .filter((s) => s.status === "uploaded" || s.status === "flagged")
                .map((sub) => (
                <div key={sub.id} className="flex items-center gap-3 py-2 px-3 bg-slate-50 rounded-xl">
                  <FileText className="size-5 text-slate-400" />
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {sub.original_filename}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-500">
                        {sub.file_size ? `${(Number(sub.file_size) / 1024 / 1024).toFixed(1)} MB` : "\u2014"}
                      </span>
                      <Badge
                        variant={sub.status === "flagged" ? "destructive" : "outline"}
                        className={sub.status === "uploaded" ? "border-emerald-200 text-emerald-700 bg-emerald-50" : ""}
                      >
                        {sub.status === "flagged" ? "Flagged" : "Uploaded"}
                      </Badge>
                    </div>
                  </div>
                  {sub.status === "flagged" ? (
                    <AlertTriangle className="size-5 text-amber-500" />
                  ) : (
                    <CheckCircle className="size-5 text-emerald-500" />
                  )}
                  <button
                    onClick={() => {
                      const idx = previewItems.findIndex(
                        (p) => p.type === "existing" && p.submission.id === sub.id
                      );
                      if (idx >= 0) setPreviewIndex(idx);
                    }}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <FileText className="size-4 text-slate-500" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.tif,.heic,.heif"
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
                Files ({files.length})
                {uploadedIds.size > 0 && ` \u2022 ${uploadedIds.size}/${files.length} uploaded`}
              </h4>
              <div className="flex items-center gap-3">
                {uploadedIds.size < files.length && uploadingIds.size === 0 && (
                  <button
                    onClick={handleUploadAll}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Upload All
                  </button>
                )}
                <button
                  onClick={() => {
                    files.forEach((f) => {
                      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                      if (f.pdfUrl) URL.revokeObjectURL(f.pdfUrl);
                    });
                    setFiles([]);
                    setUploadedIds(new Set());
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline"
                >
                  Clear All
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {files.map((item) => {
                const isUploading = uploadingIds.has(item.id);
                const isUploaded = uploadedIds.has(item.id);

                return (
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
                      {formatFileSize(item.file.size)}
                      {isUploaded ? " \u2022 Uploaded to S3" : isUploading ? " \u2022 Uploading..." : " \u2022 Ready to upload"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isUploaded ? (
                      <CheckCircle className="size-5 text-emerald-500" />
                    ) : isUploading ? (
                      <Loader2 className="size-5 text-primary animate-spin" />
                    ) : (
                      <Button
                        size="sm"
                        className="rounded-xl gap-1.5 bg-primary text-white hover:bg-primary/90 shadow-sm"
                        onClick={() => handleUpload(item)}
                      >
                        <CloudUpload className="size-4" />
                        Upload
                      </Button>
                    )}
                    <button
                      onClick={() => {
                        const idx = previewItems.findIndex(
                          (p) => p.type === "new" && p.id === item.id
                        );
                        if (idx >= 0) setPreviewIndex(idx);
                      }}
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <FileText className="size-4 text-slate-500" />
                    </button>
                    {!isUploaded && (
                    <button
                      onClick={() => removeFile(item.id)}
                      className="p-2 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <UploadSidebar requiredDocuments={requiredDocuments} />

      {/* Preview Dialog */}
      <DocumentPreviewDialog
        open={previewIndex !== null}
        onOpenChange={(open) => !open && setPreviewIndex(null)}
        items={previewItems}
        index={previewIndex ?? 0}
        onIndexChange={setPreviewIndex}
      />
    </div>
  );
}
