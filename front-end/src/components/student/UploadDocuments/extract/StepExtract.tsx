"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Database, Loader2, RefreshCw, Sparkles, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchWithClerkAuth } from "@/lib/api";
import { createJob, getActiveJobs, getJob, type JobResponse } from "@/lib/jobs";
import { computeFieldValue } from "@/lib/schema-utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import JobProgress from "@/components/student/UploadDocuments/JobProgress";
import ExtractionCard from "@/components/student/UploadDocuments/extract/ExtractionCard";
import { toExtractionItem } from "@/types/extraction";
import type { ExtractionItem, ExtractionItemResponse } from "@/types/extraction";

const EXTRACTIONS_ENDPOINT = "/api/me/documents/extractions?status=classified,processing,flagged";

interface StepExtractProps {
  allVerified?: boolean;
  onExtractionChange?: (complete: boolean) => void;
  getToken: () => Promise<string | null>;
}

export default function StepExtract({
  allVerified,
  onExtractionChange,
  getToken,
}: StepExtractProps) {
  const [items, setItems] = useState<ExtractionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [trackedJob, setTrackedJob] = useState<JobResponse | null>(null);

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const MAX_CONSECUTIVE_FAILURES = 5;
  const MAX_POLL_ATTEMPTS = 150;
  const failedPollCountRef = useRef(0);
  const pollAttemptCountRef = useRef(0);

  const hasActiveJob = trackedJob !== null;

  const processingItems = items.filter((i) => i.status === "processing");
  const failedItems = items.filter((i) => i.status === "flagged");
  const doneItems = items.filter(
    (i) => i.status !== "processing" && i.status !== "flagged",
  );

  // ── Mount: fetch extractions + check for existing active job (page reload) ─
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getTokenRef.current();
      if (!token || cancelled) return;

      const [extRes, jobsData] = await Promise.all([
        fetchWithClerkAuth(EXTRACTIONS_ENDPOINT, token),
        getActiveJobs(token),
      ]);
      if (cancelled) return;

      if (extRes.ok) {
        const data = (await extRes.json()) as ExtractionItemResponse[];
        setItems(data.map(toExtractionItem));
      }
      setLoading(false);

      const existing = jobsData.jobs.find(
        (j) => j.operation === "extract" &&
          (j.status === "queued" || j.status === "running"),
      );
      if (existing) setTrackedJob(existing);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Poll tracked job ────────────────────────────────────────────
  useEffect(() => {
    const jobId = trackedJob?.id;
    if (!jobId) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async (): Promise<boolean> => {
      const token = await getTokenRef.current();
      if (!token || cancelled) return false;

      const latest = await getJob(token, jobId);
      if (cancelled) return false;

      if (!latest) {
        failedPollCountRef.current++;
        if (failedPollCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
          setTrackedJob(null);
          toast.error("Lost connection while waiting for results. Please try again.");
          return false;
        }
        return true;
      }

      failedPollCountRef.current = 0;
      pollAttemptCountRef.current++;

      if (pollAttemptCountRef.current >= MAX_POLL_ATTEMPTS) {
        setTrackedJob(null);
        toast.error("Request is taking too long. Please try again.");
        return false;
      }

      if (latest.status === "finished" || latest.status === "cancelled") {
        setTrackedJob(null);
        const t2 = await getTokenRef.current();
        if (!t2) return false;
        const extRes = await fetchWithClerkAuth(EXTRACTIONS_ENDPOINT, t2);
        if (extRes.ok) {
          const data = (await extRes.json()) as ExtractionItemResponse[];
          const freshItems = data.map(toExtractionItem);
          setItems((prev) =>
            prev.map((localItem) => {
              const fresh = freshItems.find((f) => f.id === localItem.id);
              if (!fresh) return localItem;
              const mergedFields = localItem.fields.map((lf) => {
                const sf = fresh.fields.find((f) => f.id === lf.id);
                if (!sf) return lf;
                const keepLocal = lf.value && lf.value !== "";
                return keepLocal ? lf : sf;
              });
              const anyNeedsReview = mergedFields.some((f) => f.needsReview);
              return { ...localItem, fields: mergedFields, needsReview: anyNeedsReview };
            })
          );
        }
        return false;
      }

      // Still queued/running — update state for progress bar
      setTrackedJob(latest);
      return true;
    };

    (async () => {
      if (await poll()) intervalId = setInterval(poll, 2000);
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [trackedJob?.id]);

  // ── Completion check ────────────────────────────────────────
  useEffect(() => {
    if (loading || hasActiveJob) return;
    const visible = [...doneItems, ...failedItems];
    if (visible.length === 0) {
      onExtractionChange?.(true);
      return;
    }
    onExtractionChange?.(visible.every((i) => !i.needsReview));
  }, [doneItems, failedItems, loading, hasActiveJob, onExtractionChange]);

  // ── Extract All handler ─────────────────────────────────────
  const handleExtractAll = useCallback(async () => {
    const token = await getTokenRef.current();
    if (!token) return;

    try {
      const job = await createJob(token, "extract", []);
      setTrackedJob(job);
    } catch (err: unknown) {
      const error = err as { status?: number; detail?: string };
      if (error.status === 409) {
        const jobsData = await getActiveJobs(token);
        const existing = jobsData.jobs.find((j) => j.operation === "extract");
        if (existing) setTrackedJob(existing);
      }
    }
  }, []);

  // ── Retry handler ───────────────────────────────────────────
  const handleRetry = useCallback(async (submissionId: string) => {
    const token = await getTokenRef.current();
    if (!token) return;
    setRetrying((prev) => new Set(prev).add(submissionId));
    try {
      const job = await createJob(token, "extract", [submissionId]);
      setTrackedJob(job);
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(submissionId);
        return next;
      });
    } catch {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(submissionId);
        return next;
      });
    }
  }, []);

  // ── Auto-save handler ───────────────────────────────────────
  const handleAutoSave = useCallback(async (itemId: string, fieldKey: string, value: string) => {
    try {
      const token = await getTokenRef.current();
      if (!token) return;

      const res = await fetchWithClerkAuth(
        `/api/me/documents/${itemId}/extraction`,
        token,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field_id: fieldKey, value }),
        },
      );

      if (!res.ok) return;

      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== itemId) return item;

          // Update the edited field
          let updatedFields = item.fields.map((field) => {
            if (field.id !== fieldKey) return field;
            return { ...field, value, needsReview: false, confidence: 1.0 };
          });

          // Build a data map from the updated fields for recompute
          const dataMap: Record<string, unknown> = {};
          for (const f of updatedFields) {
            dataMap[f.id] = { value: f.value };
          }

          // Recompute computed fields that depend on the edited field
          const recomputed: { fieldId: string; newValue: string }[] = [];
          updatedFields = updatedFields.map((f) => {
            if (!f.is_computed || !f.computation) return f;
            if (!f.computation.dependencies.includes(fieldKey)) return f;
            const newValue = computeFieldValue(
              { id: f.id, key: f.key, type: f.type, description: f.label, required: false, is_computed: true, computation: f.computation },
              dataMap,
            );
            if (newValue !== null && newValue !== f.value) {
              recomputed.push({ fieldId: f.id, newValue });
              return { ...f, value: newValue, needsReview: false, confidence: 1.0 };
            }
            return f;
          });

          // Background-save recomputed values to backend
          for (const { fieldId: fid, newValue: nv } of recomputed) {
            fetchWithClerkAuth(`/api/me/documents/${itemId}/extraction`, token, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ field_id: fid, value: nv }),
            }).catch(() => {});
          }

          const anyNeedsReview = updatedFields.some((f) => f.needsReview);
          return { ...item, fields: updatedFields, needsReview: anyNeedsReview };
        })
      );
    } catch {
      // silent
    }
  }, []);

  if (allVerified) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-emerald-500" />
        <h3 className="mt-4 text-lg font-semibold text-emerald-800">
          All Required Documents Verified
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-emerald-600">
          All required documents have been verified. Data extraction is complete.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-semibold tracking-tight text-slate-900">
            Review Extracted Data
          </h2>
          <p className="mt-1 max-w-2xl text-base text-slate-500">
            Review the information extracted from your documents by AI. Correct any errors before continuing.
          </p>
        </div>

        {/* Extract All button — only show when no active job and there are documents to extract */}
        {!loading && items.length > 0 && !hasActiveJob && (
          <button
            type="button"
            disabled={hasActiveJob}
            onClick={handleExtractAll}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap shrink-0",
              !hasActiveJob
                ? "bg-primary text-white hover:bg-primary/90 shadow-md"
                : "bg-slate-100 text-slate-400 cursor-not-allowed",
            )}
          >
            <Sparkles className="h-4 w-4" />
            Extract All
          </button>
        )}
      </div>

      {/* Job Progress */}
      {trackedJob?.status === "running" && (
        <JobProgress
          operation={trackedJob.operation}
          progress={trackedJob.progress}
          total={trackedJob.total}
          status={trackedJob.status}
          result={trackedJob.result}
          errorMessage={trackedJob.error_message}
        />
      )}

      {/* Loading state */}
      {loading && doneItems.length === 0 && processingItems.length === 0 && !hasActiveJob && (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <Loader2 className="h-12 w-12 animate-spin" />
          <p className="text-sm font-medium">Loading extraction data...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && !hasActiveJob && (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <Database className="h-12 w-12" />
          <p className="text-sm font-medium">No extracted data available.</p>
          <p className="text-xs text-slate-500">
            Classify your documents first, then click "Extract All" to begin extraction.
          </p>
        </div>
      )}

      {/* Processing items */}
      {processingItems.length > 0 && (
        <div className="space-y-5">
          {processingItems.map((item) => (
            <div
              key={item.id}
              className="relative rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">
                    {item.fileName}
                  </p>
                  <p className="text-xs text-blue-700">
                    {item.documentTypeName} &mdash; Extracting data...
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Failed items */}
      {failedItems.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-red-700">
            Extraction Failed
          </h3>
          {failedItems.map((item) => {
            const isRetrying = retrying.has(item.id);
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-red-200 bg-red-50 p-5"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-900">
                      {item.fileName}
                    </p>
                    <p className="mt-0.5 text-xs text-red-700">
                      Extraction failed for this document. You can retry or
                      re-upload the document.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-1.5 border-red-300 bg-white text-red-700 hover:bg-red-100"
                      disabled={isRetrying}
                      onClick={() => handleRetry(item.id)}
                    >
                      {isRetrying ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      {isRetrying ? "Retrying..." : "Retry Extraction"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Done items */}
      {doneItems.length > 0 && (
        <div className="space-y-5">
          {doneItems.map((item) => (
            <ExtractionCard
              key={item.id}
              item={item}
              onAutoSave={handleAutoSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
