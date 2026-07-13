"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { CircleCheck } from "lucide-react";
import { createJob, getJob } from "@/lib/jobs";
import { fetchWithClerkAuth } from "@/lib/api";
import { toExtractionItem } from "@/types/extraction";
import type { ExtractionItem, ExtractionItemResponse } from "@/types/extraction";
import ExtractionProgress from "./extraction/ExtractionProgress";
import ExtractionReview from "./extraction/ExtractionReview";

interface ExtractionStepProps {
  submissionId: string;
  getToken: () => Promise<string | null>;
  onComplete: () => void;
  onError: (msg: string) => void;
}

type Phase = "checking" | "extracting" | "review" | "skip" | "error";

export default function ExtractionStep({
  submissionId,
  getToken,
  onComplete,
  onError,
}: ExtractionStepProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [progress, setProgress] = useState(0);
  const [items, setItems] = useState<ExtractionItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  const MAX_CONSECUTIVE_FAILURES = 5;
  const MAX_POLL_ATTEMPTS = 150;
  const failedPollCountRef = useRef(0);
  const pollAttemptCountRef = useRef(0);

  const handleAutoSave = useCallback(async (_itemId: string, fieldKey: string, value: string) => {
    const token = await getTokenRef.current();
    if (!token) return;
    try {
      await fetchWithClerkAuth(
        `/api/me/documents/${submissionId}/extraction`,
        token,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field_id: fieldKey, value }),
        },
      );
    } catch {
      // auto-save failures are non-fatal
    }
  }, [submissionId]);

  const handleSubmit = useCallback(() => {
    setSubmitting(true);
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    let cancelled = false;

    const fetchExtractions = async (token: string): Promise<ExtractionItem | null> => {
      const res = await fetchWithClerkAuth(
        "/api/me/documents/extractions",
        token,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as ExtractionItemResponse[];
      const item = data.find((d) => d.submission_id === submissionId);
      return item ? toExtractionItem(item) : null;
    };

    const run = async () => {
      const token = await getTokenRef.current();
      if (!token || cancelled) return;

      try {
        const job = await createJob(token, "extract", [submissionId]);
        setPhase("extracting");

        const poll = async (): Promise<boolean> => {
          const t = await getTokenRef.current();
          if (!t || cancelled) return false;

          const latest = await getJob(t, job.id);
          if (cancelled) return false;

          if (!latest) {
            failedPollCountRef.current++;
            if (failedPollCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
              setPhase("error");
              onError("Lost connection while extracting. Please try again.");
              return false;
            }
            return true;
          }

          failedPollCountRef.current = 0;
          pollAttemptCountRef.current++;

          if (pollAttemptCountRef.current >= MAX_POLL_ATTEMPTS) {
            setPhase("error");
            onError("Extraction is taking too long. Please try again.");
            return false;
          }

          setProgress(
            latest.total > 0
              ? Math.round((latest.progress / latest.total) * 100)
              : 50,
          );

          if (latest.status === "finished") {
            if (!cancelled) {
              setProgress(100);
              const extracted = await fetchExtractions(t);
              if (extracted && extracted.fields.length > 0) {
                setItems([extracted]);
                setPhase("review");
              } else {
                setPhase("skip");
                onComplete();
              }
            }
            return false;
          }

          if (latest.status === "cancelled") {
            if (!cancelled) {
              setPhase("error");
              onError("Extraction was cancelled.");
            }
            return false;
          }

          return true;
        };

        if (!cancelled) {
          if (await poll()) {
            const intervalId = setInterval(async () => {
              if (!(await poll())) clearInterval(intervalId);
            }, 2000);
            return () => { clearInterval(intervalId); };
          }
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const error = err as { status?: number; detail?: string };
        if (error.status === 400 || error.status === 404) {
          setPhase("skip");
          onComplete();
        } else if (error.status === 409) {
          setPhase("skip");
          onComplete();
        } else {
          setPhase("error");
          onError(error.detail ?? "Failed to start extraction.");
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [submissionId, onComplete, onError]);

  if (phase === "error") return null;

  if (phase === "skip") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-center gap-4">
          <CircleCheck className="h-8 w-8 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              No extraction required
            </p>
            <p className="mt-0.5 text-xs text-emerald-700">
              This document type does not require data extraction. Submitting...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <ExtractionReview
        items={items}
        submitting={submitting}
        onAutoSave={handleAutoSave}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <ExtractionProgress state={phase as "checking" | "extracting"} progress={progress} />
  );
}
