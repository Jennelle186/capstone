"use client";

import { useCallback, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
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
  allVerified?: boolean;
  requiredDocuments?: RequiredDocument[];
  getToken: () => Promise<string | null>;
  onUploadComplete?: (result: ConfirmUploadResponse) => void;
  onDeleteSubmission?: (id: string) => void;
  onDeleted?: () => void;
  existingSubmissions?: SubmissionDetail[];
  replaceSubmissionId?: string | null;
}

// This is the upload workflow: drop zone, new file list, previously uploaded section, preview dialog, and sidebar.
export default function StepUpload({
  allVerified,
  requiredDocuments,
  getToken,
  onUploadComplete,
  onDeleteSubmission,
  onDeleted,
  existingSubmissions,
  replaceSubmissionId,
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
      const body: Record<string, unknown> = {
        name: item.file.name,
        type: item.file.type || "application/octet-stream",
        size: item.file.size,
      };
      if (replaceSubmissionId) {
        body.replace_submission_id = replaceSubmissionId;
      }
      const res = await fetchWithClerkAuth("/api/me/documents/initiate", token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 409) {
          const errBody = await res.json().catch(() => null);
          throw new Error(`CONFLICT:${errBody?.detail ?? "Document already submitted."}`);
        }
        throw new Error(`Initiate failed: ${res.status} ${res.statusText}`);
      }
      return res.json() as Promise<InitiateUploadResponse>;
    },
    [],
  );

  // Uploads the file directly to GCS using the presigned signed URL.
  const uploadToS3 = useCallback(
    async (item: FileItem, presigned: InitiateUploadResponse): Promise<void> => {
      const gcsRes = await fetch(presigned.url, {
        method: "PUT",
        body: item.file,
        headers: { "Content-Type": item.file.type },
      });

      if (!gcsRes.ok) {
        const body = await gcsRes.text();
        throw new Error(`GCS upload failed: ${gcsRes.status} ${gcsRes.statusText} — ${body}`);
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

      let presigned: InitiateUploadResponse;
      try {
        presigned = await initiateUpload(item, token);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.startsWith("CONFLICT:")) {
          toast.error(msg.slice("CONFLICT:".length));
          return;
        }
        throw err;
      }

      await uploadToS3(item, presigned);
      // Fetch a fresh token after S3 upload; Clerk tokens can expire during
      // large file transfers, and confirm_upload validates auth.
      const confirmToken = await getToken();
      if (!confirmToken) {
        throw new Error("Not authenticated");
      }
      const confirmed = await confirmUpload(presigned.submission_id, confirmToken);

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

  const verifiedTypes = useMemo(() => {
    if (!existingSubmissions || !requiredDocuments) return [];
    const verifiedDocIds = new Set(
      existingSubmissions
        .filter((s) => s.status === "verified")
        .map((s) => s.document_type_id)
        .filter(Boolean),
    );
    return requiredDocuments.filter((doc) => verifiedDocIds.has(doc.id));
  }, [existingSubmissions, requiredDocuments]);

  if (allVerified) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-emerald-500" />
        <h3 className="mt-4 text-lg font-semibold text-emerald-800">
          All Required Documents Verified
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-emerald-600">
          Every required document has been reviewed and verified by your
          adviser. No further uploads are needed at this time.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left column: upload controls and file lists */}
      <div className="col-span-12 lg:col-span-8 space-y-4">
        {verifiedTypes.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-emerald-800">
              <Lock className="h-4 w-4 shrink-0" />
              Already verified — no re-uploads needed
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              {verifiedTypes.map((d) => d.name).join(", ")}
              {verifiedTypes.length === 1
                ? " is"
                : " are"}{" "}
              already verified by your adviser. New uploads matching
              {verifiedTypes.length === 1 ? " this type" : " these types"} will be
              skipped at submission.
            </p>
          </div>
        )}
        <PreviouslyUploadedSection
          submissions={existingSubmissions ?? []}
          previewItems={previewItems}
          onPreview={setPreviewIndex}
          onDeleteSubmission={handleDeleteSubmission}
          onDeleted={onDeleted}
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
        getToken={getToken}
      />
    </div>
  );
}
