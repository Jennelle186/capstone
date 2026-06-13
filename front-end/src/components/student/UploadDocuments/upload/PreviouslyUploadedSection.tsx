"use client";

import { useCallback } from "react";
import {
  FileText,
  Trash2,
  CheckCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

interface PreviouslyUploadedSectionProps {
  // All existing submissions for the student (filtered internally for display)
  submissions: SubmissionDetail[];
  // Combined preview items (new files + existing submissions) for navigation index lookup
  previewItems: PreviewItem[];
  // Opens the preview dialog at the given index
  onPreview: (index: number) => void;
  // Called after a submission is successfully deleted from the server
  onDeleteSubmission: (id: string) => void;
  // Clerk auth token provider used for the DELETE API call
  getToken: () => Promise<string | null>;
}

// Renders the status-appropriate Badge for a submission (Pending Verification, Flagged, Verified, etc.)
function SubmissionStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "flagged" ? "destructive" :
          status === "uploaded" ? "secondary" :
            status === "pending" ? "outline" :
              status === "verified" ? "outline" :
                "outline"
      }
      className={
        status === "verified" ? "border-emerald-200 text-emerald-700 bg-emerald-50" :
          status === "pending" ? "border-amber-200 text-amber-700 bg-amber-50" :
            ""
      }
    >
      {status === "flagged" ? "Flagged" :
        status === "uploaded" ? "Pending Verification" :
          status === "pending" ? "Pending Upload" :
            status === "verified" ? "Verified" :
              status}
    </Badge>
  );
}

// Section displaying documents the student has previously uploaded.
// Each row shows filename, size, status badge, status icon, preview button, and delete button (for non-verified docs).
// Delete triggers a confirmation dialog then calls the backend DELETE endpoint.
export default function PreviouslyUploadedSection({
  submissions,
  previewItems,
  onPreview,
  onDeleteSubmission,
  getToken,
}: PreviouslyUploadedSectionProps) {
  const displaySubmissions = submissions.filter(
    (s) => s.status === "uploaded" || s.status === "flagged" || s.status === "pending"
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
  }, [getToken, onDeleteSubmission]);

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
      </div>
    </div>
  );
}
