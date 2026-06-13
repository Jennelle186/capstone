"use client";

import { useCallback, useMemo, useState } from "react";
import { fetchWithClerkAuth } from "@/lib/api";
import type { RequiredDocument } from "@/types/student";
import type { ConfirmUploadResponse, InitiateUploadResponse, SubmissionDetail } from "@/types/submission";
import DocumentPreviewDialog, { type PreviewItem } from "./DocumentPreviewDialog";
import DropZone from "./DropZone";
import PreviouslyUploadedSection from "./PreviouslyUploadedSection";
import NewFileList from "./NewFileList";
import UploadSidebar from "./UploadSidebar";
import { isImageFile, isPreviewable } from "./utils";
import type { FileItem } from "./types";

// Maximum file size in bytes (315 MB)
const MAX_FILE_SIZE = 315 * 1024 * 1024;

interface StepUploadProps {
  requiredDocuments?: RequiredDocument[];
  // Clerk auth token provider for authenticated API calls
  getToken: () => Promise<string | null>;
  // Called after each file is uploaded successfully
  onUploadComplete?: (result: ConfirmUploadResponse) => void;
  // Called after a previously uploaded submission is deleted from the server
  onDeleteSubmission?: (id: string) => void;
  // Existing submissions fetched on mount for the resume feature
  existingSubmissions?: SubmissionDetail[];
}

// This is the upload workflow: drop zone, new file list, previously uploaded section, preview dialog, and sidebar.
export default function StepUpload({
  requiredDocuments,
  getToken,
  onUploadComplete,
  onDeleteSubmission,
  existingSubmissions,
}: StepUploadProps) {
  // Tracks files the user has selected but not yet uploaded
  const [files, setFiles] = useState<FileItem[]>([]);
  // Index into the combined previewItems array, or null when the dialog is closed
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  // Set of file IDs that are currently being uploaded
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  // Set of file IDs that have completed upload
  const [uploadedIds, setUploadedIds] = useState<Set<string>>(new Set());
  // Map of file ID to the last error message for failed uploads
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Adds incoming files to the local selection, filtering out any that exceed the size limit
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

  // Removes a file from the local selection and revokes its object URLs to free memory
  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (item?.pdfUrl) URL.revokeObjectURL(item.pdfUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // Requests a presigned POST URL from the backend for the given file.
  const initiateUpload = useCallback(
    async (item: FileItem, token: string): Promise<InitiateUploadResponse> => {
      const res = await fetchWithClerkAuth("/api/me/documents/initiate", token, {
        method: "POST",
        body: JSON.stringify({
          name: item.file.name,
          type: item.file.type || "application/octet-stream",
          size: item.file.size,
        }),
      });
      if (!res.ok) {
        throw new Error(`Initiate failed: ${res.status} ${res.statusText}`);
      }
      return res.json() as Promise<InitiateUploadResponse>;
    },
    [],
  );

  // Uploads the file directly to S3 using the presigned POST URL and fields.
  const uploadToS3 = useCallback(
    async (item: FileItem, presigned: InitiateUploadResponse): Promise<void> => {
      const formData = new FormData();
      // Append the policy fields first (key, policy, signature, etc.).
      Object.entries(presigned.fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
      // Append the file last under the expected field name.
      formData.append("file", item.file);

      const s3Res = await fetch(presigned.url, {
        method: "POST",
        body: formData,
        // Do not set Authorization or Content-Type headers — S3 uses the
        // presigned form fields for auth and the browser sets multipart boundaries.
      });

      if (!s3Res.ok) {
        const body = await s3Res.text();
        throw new Error(`S3 upload failed: ${s3Res.status} ${s3Res.statusText} — ${body}`);
      }
    },
    [],
  );

  // Tells the backend the file is in S3 so it can mark the submission UPLOADED.
  const confirmUpload = useCallback(
    async (submissionId: string, token: string): Promise<ConfirmUploadResponse> => {
      const res = await fetchWithClerkAuth("/api/me/documents/confirm", token, {
        method: "POST",
        body: JSON.stringify({ submission_id: submissionId }),
      });
      if (!res.ok) {
        throw new Error(`Confirm failed: ${res.status} ${res.statusText}`);
      }
      return res.json() as Promise<ConfirmUploadResponse>;
    },
    [],
  );

  // Uploads a single file end-to-end: initiate → S3 → confirm.
  const uploadOne = useCallback(
    async (item: FileItem) => {
      // Fetch a fresh Clerk token for every file so long batches do not expire it.
      const token = await getToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const presigned = await initiateUpload(item, token);
      await uploadToS3(item, presigned);
      const confirmed = await confirmUpload(presigned.submission_id, token);

      setUploadedIds((prev) => new Set(prev).add(item.id));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      onUploadComplete?.(confirmed);
    },
    [getToken, initiateUpload, uploadToS3, confirmUpload, onUploadComplete],
  );

  // Wraps uploadOne with uploading state management.
  const handleUpload = useCallback(
    async (item: FileItem) => {
      setUploadingIds((prev) => new Set(prev).add(item.id));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      try {
        await uploadOne(item);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setErrors((prev) => ({ ...prev, [item.id]: message }));
        console.error("Upload error:", err);
      } finally {
        setUploadingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [uploadOne],
  );

  // Uploads all pending files sequentially so each gets a fresh auth token and
  // failures can be attributed to a single file without aborting the batch.
  const handleUploadAll = useCallback(async () => {
    const pending = files.filter((f) => !uploadedIds.has(f.id));
    const pendingIds = new Set(pending.map((f) => f.id));
    setUploadingIds((prev) => {
      const next = new Set(prev);
      for (const id of pendingIds) next.add(id);
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      for (const id of pendingIds) delete next[id];
      return next;
    });

    for (const item of pending) {
      try {
        await uploadOne(item);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setErrors((prev) => ({ ...prev, [item.id]: message }));
        console.error(`Upload error for ${item.file.name}:`, err);
      } finally {
        setUploadingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    }
  }, [uploadOne, uploadedIds, files]);

  // Handles the delete of a previously uploaded submission via the backend DELETE endpoint
  const handleDeleteSubmission = useCallback(async (submissionId: string) => {
    const token = await getToken();
    if (!token) return;
    const res = await fetchWithClerkAuth(`/api/me/documents/${submissionId}`, token, {
      method: "DELETE",
    });
    if (!res.ok) {
      console.error("Delete failed:", res.status, res.statusText);
      return;
    }
    onDeleteSubmission?.(submissionId);
  }, [getToken, onDeleteSubmission]);

  // Clears all locally selected files and revokes their object URLs
  const clearAllFiles = useCallback(() => {
    files.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      if (f.pdfUrl) URL.revokeObjectURL(f.pdfUrl);
    });
    setFiles([]);
    setUploadedIds(new Set());
  }, [files]);

  // Combines new files and existing submissions into a flat array for preview carousel navigation
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
      if (sub.status === "uploaded" || sub.status === "flagged" || sub.status === "pending") {
        items.push({ type: "existing", submission: sub });
      }
    }
    return items;
  }, [files, existingSubmissions]);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left column: upload controls and file lists */}
      <div className="col-span-12 lg:col-span-8 space-y-4">
        <PreviouslyUploadedSection
          submissions={existingSubmissions ?? []}
          previewItems={previewItems}
          onPreview={setPreviewIndex}
          onDeleteSubmission={handleDeleteSubmission}
          getToken={getToken}
        />
        <DropZone onFilesAdded={addFiles} />
        <NewFileList
          files={files}
          uploadingIds={uploadingIds}
          uploadedIds={uploadedIds}
          errors={errors}
          previewItems={previewItems}
          onUpload={handleUpload}
          onUploadAll={handleUploadAll}
          onPreview={setPreviewIndex}
          onRemove={removeFile}
          onClearAll={clearAllFiles}
        />
      </div>
      {/* Right sidebar: required documents and tips */}
      <UploadSidebar requiredDocuments={requiredDocuments} />
      {/* Full-screen preview dialog with carousel navigation */}
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
