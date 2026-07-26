"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Download } from "lucide-react";
import { fetchWithClerkAuth } from "@/lib/api";
import type { SubmissionDetail } from "@/types/submission";

interface ExistingSubmissionPreviewProps {
  // The submission record to preview. The file must exist in S3 (UPLOADED or FLAGGED).
  submission: SubmissionDetail;
  // Clerk auth token provider used to call the download-url endpoint.
  getToken: () => Promise<string | null>;
}

// Fetches and renders the actual file content for an existing submission.
// Images and PDFs are shown inline; other types get a download button.
export default function ExistingSubmissionPreview({
  submission,
  getToken,
}: ExistingSubmissionPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track the current request so stale fetches for a previous submission do not overwrite state.
  const activeIdRef = useRef<string>(submission.id);

  useEffect(() => {
    setLoading(true);
    setError(null);
    activeIdRef.current = submission.id;

    const fetchUrl = async () => {
      try {
        const token = await getToken();
        if (!token) {
          throw new Error("Not authenticated");
        }
        const res = await fetchWithClerkAuth(
          `/api/me/documents/${submission.id}/download-url`,
          token,
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Failed to load preview: ${res.status} ${body}`);
        }
        const data = (await res.json()) as { url: string };
        if (activeIdRef.current === submission.id) {
          setUrl(data.url);
          setLoading(false);
        }
      } catch (err) {
        if (activeIdRef.current === submission.id) {
          setError(err instanceof Error ? err.message : "Could not load preview");
          setLoading(false);
        }
      }
    };

    void fetchUrl();
  }, [submission.id, getToken]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-10 animate-spin text-primary" />
          <span className="text-sm">Loading preview...</span>
        </div>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <div className="flex flex-col items-center gap-3 max-w-md px-6 text-center">
          <FileText className="size-10" />
          <span className="text-sm">{error ?? "No preview available."}</span>
        </div>
      </div>
    );
  }

  const mimeType = submission.mime_type ?? "";

  if (mimeType.startsWith("image/")) {
    return (
      <div className="flex items-center justify-center min-h-full w-full">
        <img
          src={url}
          alt={submission.original_filename}
          className="rounded-xl block w-full max-h-[80vh] object-contain"
        />
      </div>
    );
  }

  if (mimeType === "application/pdf") {
    return (
      <iframe
        title={submission.original_filename}
        src={url}
        className="h-[80vh] w-full rounded-xl border border-slate-200 bg-white"
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-slate-500">
      <div className="flex flex-col items-center gap-4 max-w-md px-6 text-center">
        <FileText className="size-10" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-900">
            {submission.original_filename}
          </p>
          <p className="text-xs text-slate-500">
            Preview is not available for this file type.
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Download className="size-4" />
          Download
        </a>
      </div>
    </div>
  );
}
