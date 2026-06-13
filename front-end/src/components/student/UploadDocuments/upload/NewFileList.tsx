"use client";

import { FileText, Trash2, CheckCircle, Loader2, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "./utils";
import type { FileItem } from "./types";
import type { PreviewItem } from "./DocumentPreviewDialog";

interface NewFileListProps {
  // Files the user has selected for upload
  files: FileItem[];
  // Set of file IDs currently being uploaded
  uploadingIds: Set<string>;
  // Set of file IDs that have finished uploading
  uploadedIds: Set<string>;
  // Map of file ID to last error message
  errors: Record<string, string>;
  // Combined preview items for finding the navigation index
  previewItems: PreviewItem[];
  // Upload a single file by its FileItem
  onUpload: (item: FileItem) => void;
  // Upload all files that have not yet been uploaded
  onUploadAll: () => void;
  // Open the preview dialog at the given index
  onPreview: (index: number) => void;
  // Remove a file from the local selection (does NOT affect the server)
  onRemove: (id: string) => void;
  // Clear all locally selected files
  onClearAll: () => void;
}

// Renders a single file row with thumbnail, name, size, upload status, preview button, and delete button.
function FileRow({
  item,
  isUploading,
  isUploaded,
  error,
  previewItems,
  onUpload,
  onPreview,
  onRemove,
}: {
  item: FileItem;
  isUploading: boolean;
  isUploaded: boolean;
  error?: string;
  previewItems: PreviewItem[];
  onUpload: (item: FileItem) => void;
  onPreview: (index: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4 group hover:shadow-sm transition-shadow">
      {/* Thumbnail or file icon */}
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
          {isUploaded
            ? " \u2022 Uploaded"
            : isUploading
              ? " \u2022 Uploading..."
              : error
                ? " \u2022 Upload failed"
                : " \u2022 Ready to upload"}
        </p>
        {error && (
          <p className="text-[11px] text-rose-600 truncate" title={error}>
            {error}
          </p>
        )}
      </div>
      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {isUploaded ? (
          <CheckCircle className="size-5 text-emerald-500" />
        ) : isUploading ? (
          <Loader2 className="size-5 text-primary animate-spin" />
        ) : (
          <Button
            size="sm"
            className="rounded-xl gap-1.5 bg-primary text-white hover:bg-primary/90 shadow-sm"
            onClick={() => onUpload(item)}
          >
            <CloudUpload className="size-4" />
            {error ? "Retry" : "Upload"}
          </Button>
        )}
        <button
          onClick={() => {
            const idx = previewItems.findIndex(
              (p) => p.type === "new" && p.id === item.id
            );
            if (idx >= 0) onPreview(idx);
          }}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <FileText className="size-4 text-slate-500" />
        </button>
        {!isUploaded && (
          <button
            onClick={() => onRemove(item.id)}
            className="p-2 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// Header bar for the new file list showing file count, upload progress, Upload All, and Clear All actions.
function FileListHeader({
  fileCount,
  uploadedCount,
  hasPending,
  isUploading,
  onUploadAll,
  onClearAll,
}: {
  fileCount: number;
  uploadedCount: number;
  hasPending: boolean;
  isUploading: boolean;
  onUploadAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Files ({fileCount})
        {uploadedCount > 0 && ` \u2022 ${uploadedCount}/${fileCount} uploaded`}
      </h4>
      <div className="flex items-center gap-3">
        {hasPending && !isUploading && (
          <button
            onClick={onUploadAll}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Upload All
          </button>
        )}
        <button
          onClick={onClearAll}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}

// Displays the list of newly selected files with upload controls.
// Shows empty state when there are no files.
export default function NewFileList({
  files,
  uploadingIds,
  uploadedIds,
  errors,
  previewItems,
  onUpload,
  onUploadAll,
  onPreview,
  onRemove,
  onClearAll,
}: NewFileListProps) {
  if (files.length === 0) return null;

  const hasPending = uploadedIds.size < files.length;

  return (
    <div>
      <FileListHeader
        fileCount={files.length}
        uploadedCount={uploadedIds.size}
        hasPending={hasPending}
        isUploading={uploadingIds.size > 0}
        onUploadAll={onUploadAll}
        onClearAll={onClearAll}
      />
      <div className="space-y-2">
        {files.map((item) => (
          <FileRow
            key={item.id}
            item={item}
            isUploading={uploadingIds.has(item.id)}
            isUploaded={uploadedIds.has(item.id)}
            error={errors[item.id]}
            previewItems={previewItems}
            onUpload={onUpload}
            onPreview={onPreview}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
