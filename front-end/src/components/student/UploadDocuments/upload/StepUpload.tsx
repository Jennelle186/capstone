"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";
import { fetchWithClerkAuth } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { RequiredDocument } from "@/types/student";
import { allSlotsVerified, type SlotStatusResponse } from "@/types/requirement";
import type { ConfirmUploadResponse, InitiateUploadResponse, SubmissionDetail } from "@/types/submission";
import DocumentPreviewDialog, { type PreviewItem } from "./DocumentPreviewDialog";
import DropZone from "./DropZone";
import PreviouslyUploadedSection from "./PreviouslyUploadedSection";
import NewFileList from "./NewFileList";
import ManualUploadSlots from "./ManualUploadSlots";
import { cn } from "@/lib/utils";
import UploadSidebar from "./UploadSidebar";
import { currentFileFor, errorDetailText, isImageFile, isPreviewable, previousFilesFor, verifiedDocumentTypeIds, withCompiledSegments } from "./utils";
import type { FileItem } from "./types";

// Maximum file size in bytes (315 MB)
const MAX_FILE_SIZE = 315 * 1024 * 1024;

type UploadMode = "choose" | "ai";

// Options for a single upload. documentTypeId is the document the student picked for the file.
// deferNotify: skip the onUploadComplete call, so the caller can refresh once after its own changes.
type UploadOptions = { documentTypeId?: string; classifyManually?: boolean; deferNotify?: boolean };

const UPLOAD_MODE_OPTIONS: { value: UploadMode; title: string; description: string }[] = [
  {
    value: "choose",
    title: "I'll choose the document for each file",
    description: "Upload one file for each required document. Nothing is split or guessed by AI.",
  },
  {
    value: "ai",
    title: "Let AI sort my files",
    description: "Upload any files, including one PDF with several documents. AI splits and classifies them in the next step.",
  },
];

// Statuses whose file the backend serves for preview (download-url). PENDING is left out on
// purpose: that file has not reached storage yet, so the backend refuses it.
const PREVIEWABLE_SUBMISSION_STATUSES = new Set([
  "uploaded",
  "flagged",
  "classified",
  "processing",
  "submitted",
  "in-review",
]);

interface StepUploadProps {
  requiredDocuments?: RequiredDocument[];
  requiredSlots?: SlotStatusResponse[];
  getToken: () => Promise<string | null>;
  onUploadComplete?: (result: ConfirmUploadResponse) => void | Promise<void>;
  onDeleteSubmission?: (id: string) => void;
  onDeleted?: () => void;
  existingSubmissions?: SubmissionDetail[];
  replaceSubmissionId?: string | null;
  isSchoolYearClosed?: boolean;
}

export default function StepUpload({
  requiredDocuments = [],
  requiredSlots = [],
  getToken,
  onUploadComplete,
  onDeleteSubmission,
  onDeleted,
  existingSubmissions = [],
  replaceSubmissionId,
  isSchoolYearClosed = false,
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
  // Controls the blocking dialog shown when an upload targets an already-verified type
  const [verifiedConflict, setVerifiedConflict] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });
  // Whether the selected PDF is a compiled multi-document file (Feature 3).
  const [isCompiled, setIsCompiled] = useState(false);
  // "choose": the student labels each file with its required document (no AI split/classify).
  // "ai": the student uploads any files and AI splits and classifies them in the next step.
  // A flagged file being replaced (?replace=) starts on the AI upload, as the resolve flow always did.
  const [uploadMode, setUploadMode] = useState<UploadMode>(replaceSubmissionId ? "ai" : "choose");
  // Document types with a file being uploaded through the "choose" list.
  const [manualUploadingIds, setManualUploadingIds] = useState<Set<string>>(new Set());
  // The file waiting for the student's confirmation before it is deleted.
  const [pendingDelete, setPendingDelete] = useState<SubmissionDetail | null>(null);

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
    async (item: FileItem, token: string, options?: UploadOptions): Promise<InitiateUploadResponse> => {
      const body: Record<string, unknown> = {
        name: item.file.name,
        type: item.file.type || "application/octet-stream",
        size: item.file.size,
        // Splitting only applies to PDFs, and never to a file the student labelled.
        is_compiled: isCompiled && item.file.type === "application/pdf" && !options?.classifyManually,
      };
      if (options?.documentTypeId) {
        body.document_type_id = options.documentTypeId;
      }
      if (options?.classifyManually) {
        body.classify_manually = true;
      }
      if (replaceSubmissionId) {
        body.replace_submission_id = replaceSubmissionId;
      }
      const res = await fetchWithClerkAuth("/api/me/documents/initiate", token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        const detail = errorDetailText(errBody?.detail) ?? `Initiate failed: ${res.status} ${res.statusText}`;
        if (res.status === 409) {
          const err = new Error(`CONFLICT:${detail}`) as Error & {
            errorCode?: string;
            documentTypeId?: string;
          };
          err.errorCode = errBody?.error_code;
          err.documentTypeId = errBody?.document_type_id;
          throw err;
        }
        if (res.status === 400) {
          throw new Error(`BLOCKED:${detail}`);
        }
        throw new Error(detail);
      }
      return res.json() as Promise<InitiateUploadResponse>;
    },
    [replaceSubmissionId, isCompiled],
  );

  // Uploads the file directly to GCS using the presigned signed URL.
  const uploadToGcs = useCallback(
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
        // Show the backend's reason (for example, a document that was verified during the upload).
        const errBody = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(errorDetailText(errBody?.detail) ?? `Confirm failed: ${res.status} ${res.statusText}`);
      }
      return res.json() as Promise<ConfirmUploadResponse>;
    },
    [],
  );

  // Uploads a single file end-to-end: initiate → S3 → confirm.
  // Resolves to the saved submission, or null when the backend refused it with a conflict (already reported to the user).
  const uploadOne = useCallback(
    async (item: FileItem, options?: UploadOptions): Promise<ConfirmUploadResponse | null> => {
      // Fetch a fresh Clerk token for every file so long batches do not expire it.
      const token = await getToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      let presigned: InitiateUploadResponse;
      try {
        presigned = await initiateUpload(item, token, options);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        const errorCode = (err as { errorCode?: string } | null)?.errorCode;
        if (errorCode === "duplicate_verified_document") {
          const message = msg.startsWith("CONFLICT:")
            ? msg.slice("CONFLICT:".length)
            : msg;
          setVerifiedConflict({ open: true, message });
          return null;
        }
        if (msg.startsWith("CONFLICT:")) {
          toast.error(msg.slice("CONFLICT:".length));
          return null;
        }
        if (msg.startsWith("BLOCKED:")) {
          toast.error(msg.slice("BLOCKED:".length));
          throw err;
        }
        throw err;
      }

      await uploadToGcs(item, presigned);
      // Fetch a fresh token after GCS upload; Clerk tokens can expire during
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
      // The upload is saved and listed under "Previously uploaded", so drop the local copy
      // to keep the list below the drop zone short and the Next button in reach.
      // Files chosen from the per-document list never have a local copy.
      if (!options?.documentTypeId) {
        removeFile(item.id);
      }
      if (!options?.deferNotify) {
        // The file is saved at this point. A failed list refresh must not make the upload look failed.
        try {
          await onUploadComplete?.(confirmed);
        } catch (err) {
          console.error("Could not refresh the upload list:", err);
          toast.error("Your file was saved, but the list could not refresh. Reload the page to see it.");
        }
      }
      return confirmed;
    },
    [getToken, initiateUpload, uploadToGcs, confirmUpload, onUploadComplete, removeFile],
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
        setIsCompiled(false);
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
        if (message.startsWith("BLOCKED:")) {
          setUploadingIds((prev) => {
            const next = new Set(prev);
            for (const remaining of pending.slice(pending.indexOf(item) + 1)) {
              next.delete(remaining.id);
            }
            return next;
          });
          break;
        }
      } finally {
        setUploadingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    }
    setIsCompiled(false);
  }, [uploadOne, uploadedIds, files]);

  // Deletes a submission via the backend DELETE endpoint. Resolves to true only when it was removed.
  const handleDeleteSubmission = useCallback(async (submissionId: string): Promise<boolean> => {
    const token = await getToken();
    if (!token) return false;
    const res = await fetchWithClerkAuth(`/api/me/documents/${submissionId}`, token, {
      method: "DELETE",
    });
    if (!res.ok) {
      console.error("Delete failed:", res.status, res.statusText);
      return false;
    }
    onDeleteSubmission?.(submissionId);
    return true;
  }, [getToken, onDeleteSubmission]);

  // Every file the student has, with compiled segments listed as their own rows. The "choose" mode
  // works per document type, and a segment of a split PDF carries a document type of its own.
  const allSubmissions = useMemo(() => withCompiledSegments(existingSubmissions ?? []), [existingSubmissions]);

  // Uploads a file the student assigned to a required document. One file per document:
  // the new file is saved first, and only then is the file it replaces removed. A failed
  // upload therefore never costs the student the file they already had.
  const handleChooseFile = useCallback(
    async (documentTypeId: string, file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error("This file is larger than 315 MB. Choose a smaller file.");
        return;
      }
      setManualUploadingIds((prev) => new Set(prev).add(documentTypeId));
      let saved: ConfirmUploadResponse | null = null;
      try {
        const previous = previousFilesFor(documentTypeId, allSubmissions);
        const item: FileItem = { id: `${documentTypeId}-${Date.now()}`, file };
        saved = await uploadOne(item, { documentTypeId, classifyManually: true, deferNotify: true });
        if (saved && previous.length > 0) {
          // Remove every earlier copy for this document, not only the one on the card, so no
          // stale or flagged file keeps counting toward submission. Each removal is checked on
          // its own, so one network error does not hide the result of the others.
          const results = await Promise.allSettled(previous.map((old) => handleDeleteSubmission(old.id)));
          const failed = results.some((r) => r.status === "rejected" || r.value === false);
          if (failed) {
            toast.error("Your new file was saved, but an older file could not be removed. Delete it from the list below.");
          }
        }
      } catch (err) {
        // uploadOne has already shown the message for a refused upload ("BLOCKED:"), so skip it here.
        const msg = err instanceof Error ? err.message : "";
        if (!msg.startsWith("BLOCKED:")) {
          toast.error(msg || "Upload failed. Please try again.");
        }
      } finally {
        // Refresh once, after the save and any removals, even if a removal failed, so the list
        // matches the server. A refresh started earlier could otherwise bring removed copies back.
        if (saved) {
          try {
            await onUploadComplete?.(saved);
          } catch (err) {
            console.error("Could not refresh the upload list:", err);
          }
        }
        setManualUploadingIds((prev) => {
          const next = new Set(prev);
          next.delete(documentTypeId);
          return next;
        });
      }
    },
    [allSubmissions, handleDeleteSubmission, onUploadComplete, uploadOne],
  );

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
    for (const sub of allSubmissions) {
      // Every file the student can still see on a card or in the list must be previewable,
      // including ones the adviser has already received or that are being processed.
      // A form filled in online has no file, so there is nothing to preview.
      if (PREVIEWABLE_SUBMISSION_STATUSES.has(sub.status) && !sub.filled_online) {
        items.push({ type: "existing", submission: sub });
      }
    }
    return items;
  }, [files, allSubmissions]);

  // Opens the preview for one of the student's files, from its required-document card.
  const handleViewSubmission = useCallback((submissionId: string) => {
    const index = previewItems.findIndex(
      (item) => item.type === "existing" && item.submission.id === submissionId,
    );
    if (index !== -1) {
      setPreviewIndex(index);
    } else {
      toast.error("This file cannot be previewed yet. Try again once it has finished uploading.");
    }
  }, [previewItems]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const submissionId = pendingDelete.id;
    setPendingDelete(null);
    const removed = await handleDeleteSubmission(submissionId);
    if (removed) {
      onDeleted?.();
      toast.success("File removed. You can upload a new one.");
    } else {
      toast.error("The file could not be removed. Please try again.");
    }
  }, [pendingDelete, handleDeleteSubmission, onDeleted]);

  const verifiedTypes = useMemo(() => {
    if (!existingSubmissions || !requiredDocuments) return [];
    const verifiedDocIds = verifiedDocumentTypeIds(allSubmissions);
    return requiredDocuments.filter((doc) => verifiedDocIds.has(doc.id));
  }, [allSubmissions, existingSubmissions, requiredDocuments]);

  // Files that match no required document. In "choose" mode these are the only ones listed,
  // because each required document's card shows its own file.
  const unmatchedSubmissions = useMemo(() => {
    const submissions = allSubmissions;
    const requiredTypeIds = new Set<string>(requiredDocuments.map((d) => d.id));
    for (const slot of requiredSlots) {
      for (const item of slot.items) requiredTypeIds.add(item.document_type_id);
    }
    // The file each required document's card shows.
    const cardFileIds = new Set<string>();
    for (const typeId of requiredTypeIds) {
      const card = currentFileFor(typeId, submissions);
      if (card) cardFileIds.add(card.id);
    }
    return submissions.filter((s) => {
      if (!s.document_type_id || !requiredTypeIds.has(s.document_type_id)) return true;
      // A required type: its card shows one file, and verified rows are not listed. Any other
      // copy (an extra, flagged, or extra compiled segment) is listed so the student can remove it.
      if (s.status === "verified") return false;
      return !cardFileIds.has(s.id);
    });
  }, [allSubmissions, requiredDocuments, requiredSlots]);

  // When every required slot is already satisfied by a VERIFIED submission,
  // there is nothing left to upload — hide the upload controls entirely.
  const allVerified = !replaceSubmissionId && allSlotsVerified(requiredSlots);
  const canUpload = !isSchoolYearClosed && !allVerified;
  const isChooseMode = canUpload && uploadMode === "choose";
  const isAiMode = canUpload && uploadMode === "ai";

  return (
    <div className="grid grid-cols-12 gap-4">
      {isSchoolYearClosed && (
        <div className="col-span-12 rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
          The school year is closed. Your documents are archived and read-only. Uploads and edits are no longer allowed.
        </div>
      )}
      {/* Left column: upload controls and file lists */}
      <div className="col-span-12 lg:col-span-8 space-y-4">
        {allVerified && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-emerald-800">
              <Lock className="h-4 w-4 shrink-0" />
              All documents verified
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              All required documents have been verified by your adviser. No
              further uploads are needed.
            </p>
          </div>
        )}
        {!allVerified && verifiedTypes.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-emerald-800">
              <Lock className="h-4 w-4 shrink-0" />
              Already verified. No re-uploads needed
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
        {/* In "choose" mode this list only shows leftover files that match no required document. */}
        {(!isChooseMode || unmatchedSubmissions.length > 0) && (
          <PreviouslyUploadedSection
            submissions={isChooseMode ? unmatchedSubmissions : (existingSubmissions ?? [])}
            previewItems={previewItems}
            onPreview={setPreviewIndex}
            onDeleteSubmission={handleDeleteSubmission}
            onDeleted={onDeleted}
            getToken={getToken}
            isReadOnly={isSchoolYearClosed}
          />
        )}
        {canUpload && (
          <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-slate-900">
              How do you want to add your documents?
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {UPLOAD_MODE_OPTIONS.map((option) => {
                const selected = uploadMode === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors focus-within:outline-2 focus-within:outline-primary",
                      selected ? "border-primary bg-primary/5" : "border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="upload-mode"
                        value={option.value}
                        checked={selected}
                        onChange={() => setUploadMode(option.value)}
                        className="h-4 w-4 border-slate-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm font-semibold text-slate-900">{option.title}</span>
                    </span>
                    <span className="pl-6 text-xs leading-relaxed text-slate-500">{option.description}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {isChooseMode && (
          <ManualUploadSlots
            slots={requiredSlots}
            legacyDocuments={requiredDocuments}
            existingSubmissions={allSubmissions}
            uploadingTypeIds={manualUploadingIds}
            onChooseFile={handleChooseFile}
            onView={handleViewSubmission}
            onDelete={setPendingDelete}
          />
        )}
        {isAiMode && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <input
              type="checkbox"
              checked={isCompiled}
              onChange={(e) => setIsCompiled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-sm">
              <span className="font-semibold text-slate-800">
                This PDF contains multiple documents
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Check this if you're uploading a single PDF that combines several
                documents (e.g. admission form + birth certificate). We'll split it
                into separate documents automatically.
              </span>
            </span>
          </label>
        )}
        {isAiMode && (
          <DropZone onFilesAdded={addFiles} />
        )}
        {isAiMode && (
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
        )}
      </div>
      {/* Right sidebar: required documents and tips */}
      <UploadSidebar slots={requiredSlots} legacyDocuments={requiredDocuments} />
      {/* Full-screen preview dialog with carousel navigation */}
      <DocumentPreviewDialog
        open={previewIndex !== null}
        onOpenChange={(open) => !open && setPreviewIndex(null)}
        items={previewItems}
        index={previewIndex ?? 0}
        onIndexChange={setPreviewIndex}
        getToken={getToken}
      />
      <AlertDialog
        open={verifiedConflict.open}
        onOpenChange={(open) => !open && setVerifiedConflict((prev) => ({ ...prev, open: false }))}
      >
        <AlertDialogContent className="grid-cols-[minmax(0,1fr)]">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
            </AlertDialogMedia>
            <AlertDialogTitle>Document already verified</AlertDialogTitle>
            <AlertDialogDescription className="break-words">{verifiedConflict.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setVerifiedConflict((prev) => ({ ...prev, open: false }))}
            >
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        {/* A single column that can shrink, so a long file name wraps inside the card
            instead of stretching the card and pushing the buttons off the screen. */}
        <AlertDialogContent className="grid-cols-[minmax(0,1fr)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              {pendingDelete?.original_filename} will be removed. You can upload it again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep file</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
