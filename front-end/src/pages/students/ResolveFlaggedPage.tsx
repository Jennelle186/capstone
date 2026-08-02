"use client";

import * as React from "react";
import { useParams, useNavigate } from "react-router";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, Loader2, AlertTriangle, RefreshCw, Lock } from "lucide-react";
import { toast } from "sonner";
import { fetchWithClerkAuth } from "@/lib/api";
import FlaggedBanner from "@/components/student/ResolveFlagged/FlaggedBanner";
import UploadStep from "@/components/student/ResolveFlagged/UploadStep";
import ClassificationStep from "@/components/student/ResolveFlagged/ClassificationStep";
import ExtractionStep from "@/components/student/ResolveFlagged/ExtractionStep";
import SuccessScreen from "@/components/student/ResolveFlagged/SuccessScreen";
import type { SubmissionDetail, ConfirmUploadResponse } from "@/types/submission";

type Step = "upload" | "classify" | "extract" | "success";

export default function ResolveFlaggedPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = React.useRef(getToken);
  React.useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  const [step, setStep] = React.useState<Step>("upload");
  const [flaggedDoc, setFlaggedDoc] = React.useState<SubmissionDetail | null>(null);
  const [newSubmissionId, setNewSubmissionId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [docTypeVerified, setDocTypeVerified] = React.useState(false);

  // ── Load flagged submission on mount ────────────────────────────
  React.useEffect(() => {
    if (!isLoaded || !isSignedIn || !documentId) return;
    let cancelled = false;

    const load = async () => {
      const token = await getTokenRef.current();
      if (!token) return;

      const docsRes = await fetchWithClerkAuth("/api/me/documents", token);
      if (docsRes.ok && !cancelled) {
        const docs = (await docsRes.json()) as SubmissionDetail[];
        const found = docs.find((d) => d.id === documentId);
        if (found) {
          setFlaggedDoc(found);
          const typeAlreadyVerified = found.document_type_id
            ? docs.some(
                (d) =>
                  d.document_type_id === found.document_type_id &&
                  d.status === "verified",
              )
            : false;
          setDocTypeVerified(typeAlreadyVerified);
        }
      }
      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [documentId, isLoaded, isSignedIn]);

  // ── Step transitions ────────────────────────────────────────────
  const handleUploadComplete = React.useCallback((result: ConfirmUploadResponse) => {
    setNewSubmissionId(result.id);
    setStep("classify");
    setError(null);
  }, []);

  const handleClassifyComplete = React.useCallback(() => {
    setStep("extract");
  }, []);

  const handleExtractComplete = React.useCallback(async () => {
    if (!newSubmissionId) return;
    const token = await getTokenRef.current();
    if (!token) return;

    try {
      const res = await fetchWithClerkAuth("/api/me/documents/submit-batch", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_ids: [newSubmissionId] }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail ?? "Submission failed.");
      }

      setStep("success");
      toast.success("Document submitted for adviser review.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed.";
      setError(msg);
    }
  }, [newSubmissionId]);

  const handleRetry = React.useCallback(async () => {
    if (newSubmissionId) {
      const token = await getTokenRef.current();
      if (token) {
        try {
          const delRes = await fetchWithClerkAuth(
            `/api/me/documents/${newSubmissionId}`,
            token,
            { method: "DELETE" },
          );
          if (!delRes.ok) {
            console.warn("Failed to delete submission during retry", newSubmissionId);
          }
        } catch {
          // best-effort cleanup — proceed to re-upload
        }
      }
    }
    setNewSubmissionId(null);
    setError(null);
    setStep("upload");
  }, [newSubmissionId]);

  // ── Loading / Not-found states ──────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (docTypeVerified) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <Lock className="h-12 w-12 text-emerald-500" />
          <h2 className="text-lg font-bold text-slate-900">
            Already Verified
          </h2>
          <p className="text-sm text-slate-500">
            This document type has already been verified by your adviser. No
            re-upload is needed.
          </p>
          <button
            type="button"
            onClick={() => navigate("/student/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!flaggedDoc) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500" />
          <h2 className="text-lg font-bold text-slate-900">Document Not Found</h2>
          <p className="text-sm text-slate-500">
            This document could not be found. It may have already been resolved or removed.
          </p>
          <button
            type="button"
            onClick={() => navigate("/student/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Back link */}
      <button
        type="button"
        onClick={() => navigate("/student/dashboard")}
        className="mb-6 flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Dashboard
      </button>

      {/* Flagged banner — visible once past upload */}
      {step !== "upload" && <div className="mb-6"><FlaggedBanner submission={flaggedDoc} /></div>}

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-900">Error</p>
              <p className="mt-0.5 text-xs text-red-700">{error}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              <RefreshCw className="h-3 w-3" />
              Try Again
            </button>
            <button
              type="button"
              onClick={() => navigate("/student/dashboard")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step content — hide when error is showing so user sees the error banner instead */}
      {!error && (
        <>
          {step === "upload" && (
            <UploadStep
              flaggedDoc={flaggedDoc}
              getToken={getToken}
              onUploadComplete={handleUploadComplete}
            />
          )}

          {step === "classify" && newSubmissionId && (
            <ClassificationStep
              newSubmissionId={newSubmissionId}
              flaggedDoc={flaggedDoc}
              getToken={getToken}
              onComplete={handleClassifyComplete}
              onError={(msg) => {
                setError(msg);
              }}
            />
          )}

          {step === "extract" && newSubmissionId && (
            <ExtractionStep
              submissionId={newSubmissionId}
              getToken={getToken}
              onComplete={handleExtractComplete}
              onError={setError}
            />
          )}

          {step === "success" && (
            <SuccessScreen
              documentTypeName={flaggedDoc.document_type_name ?? "Document"}
              onDashboard={() => navigate("/student/dashboard")}
            />
          )}
        </>
      )}
    </div>
  );
}
