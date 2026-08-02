"use client";

import { useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import DropZone from "@/components/student/UploadDocuments/upload/DropZone";
import { fetchWithClerkAuth } from "@/lib/api";
import type { SubmissionDetail, ConfirmUploadResponse, InitiateUploadResponse } from "@/types/submission";

interface UploadStepProps {
  flaggedDoc: SubmissionDetail;
  getToken: () => Promise<string | null>;
  onUploadComplete: (result: ConfirmUploadResponse) => void;
}

const MAX_FILE_SIZE = 315 * 1024 * 1024;

export default function UploadStep({ flaggedDoc, getToken, onUploadComplete }: UploadStepProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFilesAdded = (files: FileList | File[]) => {
    const f = files[0];
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      setError("File is too large. Maximum size is 315 MB.");
      return;
    }
    setFile(f);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) { setUploading(false); return; }

      const initRes = await fetchWithClerkAuth("/api/me/documents/initiate", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          replace_submission_id: flaggedDoc.id,
        }),
      });

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => null);
        throw new Error(err?.detail ?? "Failed to initiate upload.");
      }

      const presigned = (await initRes.json()) as InitiateUploadResponse;
      let confirmed = false;

      try {
        const gcsRes = await fetch(presigned.url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!gcsRes.ok) {
          throw new Error("Failed to upload file to storage.");
        }

        const confirmToken = await getToken();
        if (!confirmToken) {
          throw new Error("Not authenticated");
        }

        const confirmRes = await fetchWithClerkAuth("/api/me/documents/confirm", confirmToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submission_id: presigned.submission_id }),
        });

        if (!confirmRes.ok) {
          const err = await confirmRes.json().catch(() => null);
          throw new Error(err?.detail ?? "Failed to confirm upload.");
        }

        confirmed = true;
        const result = (await confirmRes.json()) as ConfirmUploadResponse;
        onUploadComplete(result);
      } finally {
        if (!confirmed) {
          const cleanupToken = await getToken();
          if (cleanupToken) {
            try {
              const delRes = await fetchWithClerkAuth(
                `/api/me/documents/${presigned.submission_id}`,
                cleanupToken,
                { method: "DELETE" },
              );
              if (!delRes.ok) {
                console.warn("Failed to clean up PENDING submission", presigned.submission_id);
              }
            } catch {
              // best-effort — backend GC sweep handles it
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">
        Upload Corrected File
      </h2>

      {file ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">
                {file.name}
              </p>
              <p className="text-xs text-slate-500">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={() => { setFile(null); setError(null); }}
                className="text-xs font-semibold text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ) : (
        <DropZone onFilesAdded={handleFilesAdded} />
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={!file || uploading}
        onClick={handleUpload}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Upload &amp; Verify
          </>
        )}
      </button>
    </div>
  );
}
