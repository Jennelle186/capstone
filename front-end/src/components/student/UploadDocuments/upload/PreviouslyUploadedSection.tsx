"use client";

import { useCallback, useRef, useState } from "react";
import {
  FileText,
  Trash2,
  CheckCircle,
  Clock,
  AlertTriangle,
  UploadCloud,
  Loader2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { fetchWithClerkAuth } from "@/lib/api";
import type { SubmissionDetail } from "@/types/submission";
import type { PreviewItem } from "./DocumentPreviewDialog";
import SubmissionStatusBadge from "./SubmissionStatusBadge";

interface PreviouslyUploadedSectionProps {
  // All existing submissions for the student (filtered internally for display)
  submissions: SubmissionDetail[];
  // Combined preview items (new files + existing submissions) for navigation index lookup
  previewItems: PreviewItem[];
  // Opens the preview dialog at the given index
  onPreview: (index: number) => void;
  // Called after a submission is successfully deleted from the server
  onDeleteSubmission: (id: string) => void;
  // Called after a successful deletion so the parent can refetch fresh data
  onDeleted?: () => void;
  // Clerk auth token provider used for the DELETE API call
  getToken: () => Promise<string | null>;
  // When true, hides delete buttons (school year closed)
  isReadOnly?: boolean;
}

// Section displaying documents the student has previously uploaded.
// Each row shows filename, size, status badge, status icon, preview button, and delete button (for non-verified docs).
// Delete triggers a confirmation dialog then calls the backend DELETE endpoint.
export default function PreviouslyUploadedSection({
  submissions,
  previewItems,
  onPreview,
  onDeleteSubmission,
  onDeleted,
  getToken,
  isReadOnly = false,
}: PreviouslyUploadedSectionProps) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [activeRetryId, setActiveRetryId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displaySubmissions = submissions.filter(
    (s) => s.status !== "verified" && s.status !== "submitted" && s.status !== "in-review",
  );

  const handleRetry = useCallback(
    async (submissionId: string, file: File) => {
      setRetryingId(submissionId);
      try {
        const token = await getToken();
        if (!token) return;

        const initiateRes = await fetchWithClerkAuth(
          `/api/me/documents/${submissionId}/retry`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              name: file.name,
              type: file.type || "application/octet-stream",
              size: file.size,
            }),
          },
        );
        if (!initiateRes.ok) {
          const errBody = await initiateRes.json().catch(() => null);
          throw new Error(errBody?.detail ?? `Retry initiate failed: ${initiateRes.status} ${initiateRes.statusText}`);
        }
        const presigned = (await initiateRes.json()) as {
          url: string;
          fields: Record<string, string>;
        };

        const gcsRes = await fetch(presigned.url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!gcsRes.ok) {
          const body = await gcsRes.text();
          throw new Error(`GCS upload failed: ${gcsRes.status} — ${body}`);
        }

        const confirmRes = await fetchWithClerkAuth("/api/me/documents/confirm", token, {
          method: "POST",
          body: JSON.stringify({ submission_id: submissionId }),
        });
        if (!confirmRes.ok) {
          throw new Error(`Confirm failed: ${confirmRes.status}`);
        }

        onDeleted?.();
      } catch (err) {
        console.error("Retry error:", err);
      } finally {
        setRetryingId(null);
      }
    },
    [getToken, onDeleted],
  );

  // deletion to the parent handler (StepUpload.handleDeleteSubmission),
  // which performs the actual DELETE API call, then triggers a refetch on success.
  const handleDelete = useCallback(async (submissionId: string) => {
    await onDeleteSubmission(submissionId);
    onDeleted?.();
  }, [onDeleteSubmission, onDeleted]);

  if (displaySubmissions.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
        <Clock className="size-4" />
        Previously Uploaded
      </h4>
      <div className="space-y-1.5">
        {displaySubmissions.map((sub) => (
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
                <SubmissionStatusBadge status={sub.status} />
              </div>
            </div>
            {sub.status === "pending" && (
              <button
                onClick={() => {
                  setActiveRetryId(sub.id);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                  fileInputRef.current?.click();
                }}
                disabled={retryingId === sub.id}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                title="Re-upload"
              >
                {retryingId === sub.id ? (
                  <Loader2 className="size-4 text-primary animate-spin" />
                ) : (
                  <UploadCloud className="size-4 text-amber-500" />
                )}
              </button>
            )}
            {sub.status === "flagged" ? (
              <AlertTriangle className="size-5 text-amber-500" />
            ) : sub.status === "processing" ? (
              <Loader2 className="size-5 text-primary animate-spin" />
            ) : sub.status !== "pending" && (
              <CheckCircle className="size-5 text-emerald-500" />
            )}
            <button
              onClick={() => {
                const idx = previewItems.findIndex(
                  (p) => p.type === "existing" && p.submission.id === sub.id
                );
                if (idx >= 0) onPreview(idx);
              }}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <FileText className="size-4 text-slate-500" />
            </button>
            {!isReadOnly && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="p-2 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors">
                  <Trash2 className="size-4" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Document</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{sub.original_filename}"? This action cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => handleDelete(sub.id)}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            )}
          </div>
        ))}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && activeRetryId) {
              void handleRetry(activeRetryId, file);
              setActiveRetryId(null);
            }
          }}
        />
      </div>
    </div>
  );
}
