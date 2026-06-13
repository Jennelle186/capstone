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
}: PreviouslyUploadedSectionProps) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [activeRetryId, setActiveRetryId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displaySubmissions = submissions.filter(
    (s) => s.status === "uploaded" || s.status === "flagged" || s.status === "pending"
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
          const err = await initiateRes.text();
          throw new Error(`Retry initiate failed: ${err}`);
        }
        const presigned = (await initiateRes.json()) as {
          url: string;
          fields: Record<string, string>;
        };

        const formData = new FormData();
        Object.entries(presigned.fields).forEach(([k, v]) => formData.append(k, v));
        formData.append("file", file);

        const s3Res = await fetch(presigned.url, {
          method: "POST",
          body: formData,
        });
        if (!s3Res.ok) {
          const body = await s3Res.text();
          throw new Error(`S3 upload failed: ${s3Res.status} — ${body}`);
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

  // Sends a DELETE request to remove the submission from both the database and S3 storage
  const handleDelete = useCallback(async (submissionId: string) => {
    const token = await getToken();
    if (!token) return;
    const res = await fetchWithClerkAuth(`/api/me/documents/${submissionId}`, token, {
      method: "DELETE",
    });
    if (!res.ok) {
      console.error("Delete failed:", res.status, res.statusText);
      return;
    }
    onDeleteSubmission(submissionId);
    onDeleted?.();
  }, [getToken, onDeleteSubmission, onDeleted]);

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
            {sub.status !== "verified" && (
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
