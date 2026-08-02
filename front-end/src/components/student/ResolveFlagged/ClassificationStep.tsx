"use client";

import { useEffect, useState, useRef } from "react";
import { Loader2, CircleCheck, FileSearch } from "lucide-react";
import { createJob, getJob, type JobResponse } from "@/lib/jobs";
import { fetchWithClerkAuth } from "@/lib/api";
import type { SubmissionDetail } from "@/types/submission";

interface ClassificationStepProps {
  newSubmissionId: string;
  flaggedDoc: SubmissionDetail;
  getToken: () => Promise<string | null>;
  onComplete: () => void;
  onError: (msg: string) => void;
}

type StepState = "classifying" | "checking" | "match" | "mismatch" | "error";

export default function ClassificationStep({
  newSubmissionId,
  flaggedDoc,
  getToken,
  onComplete,
  onError,
}: ClassificationStepProps) {
  const [state, setState] = useState<StepState>("classifying");
  const [progress, setProgress] = useState(0);
  const [matchConfidence, setMatchConfidence] = useState<number | null>(null);
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  const MAX_CONSECUTIVE_FAILURES = 5;
  const MAX_POLL_ATTEMPTS = 150;
  const failedPollCountRef = useRef(0);
  const pollAttemptCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const checkTypeMatch = async (token: string) => {
      setState("checking");
      try {
        const docsRes = await fetchWithClerkAuth("/api/me/documents", token);
        if (!docsRes.ok) {
          setState("error");
          onError("Failed to verify classification result.");
          return;
        }
        const docs = (await docsRes.json()) as SubmissionDetail[];
        const newSub = docs.find((d) => d.id === newSubmissionId);

        if (!newSub || !newSub.document_type_id) {
          setState("error");
          onError("Classification did not produce a result. Please try again.");
          return;
        }

        const predictedTypeId = newSub.document_type_id;
        const requiredTypeId = flaggedDoc.document_type_id;
        const confidence = (newSub.classification_result?.confidence as number) ?? 0;

        if (!requiredTypeId) {
          setMatchConfidence(Math.round(confidence * 100));
          setState("match");
          onComplete();
          return;
        }

        if (predictedTypeId === requiredTypeId) {
          setMatchConfidence(Math.round(confidence * 100));
          setState("match");
          try {
            await fetchWithClerkAuth(
              `/api/me/documents/${newSubmissionId}/confirm`,
              token,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ document_type_id: requiredTypeId }),
              },
            );
          } catch {
            // confirm may fail if already confirmed — proceed anyway
          }
          onComplete();
        } else {
          setState("mismatch");
          onError(
            `The uploaded file was classified as "${newSub.document_type_name ?? "Unknown type"}", which does not match the required type "${flaggedDoc.document_type_name ?? "Unknown"}". Please upload a different file.`,
          );
        }
      } catch {
        setState("error");
        onError("Failed to verify classification result.");
      }
    };

    const run = async () => {
      const token = await getTokenRef.current();
      if (!token || cancelled) return;

      let job: JobResponse;
      try {
        job = await createJob(token, "classify", [newSubmissionId]);
      } catch (err: unknown) {
        const error = err as { status?: number; detail?: string };
        if (!cancelled) {
          setState("error");
          onError(error.status === 409
            ? "A classification is already in progress. Please wait and try again."
            : (error.detail ?? "Failed to start classification."));
        }
        return;
      }

      const poll = async (): Promise<boolean> => {
        const t = await getTokenRef.current();
        if (!t || cancelled) return false;

        const latest = await getJob(t, job.id);
        if (cancelled) return false;

        if (!latest) {
          failedPollCountRef.current++;
          if (failedPollCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
            setState("error");
            onError("Lost connection while classifying. Please try again.");
            return false;
          }
          return true;
        }

        failedPollCountRef.current = 0;
        pollAttemptCountRef.current++;

        if (pollAttemptCountRef.current >= MAX_POLL_ATTEMPTS) {
          setState("error");
          onError("Classification is taking too long. Please try again.");
          return false;
        }

        setProgress(latest.total > 0 ? Math.round((latest.progress / latest.total) * 100) : 50);

        if (latest.status === "finished") {
          if (!cancelled) {
            setProgress(100);
            await checkTypeMatch(t);
          }
          return false;
        }

        if (latest.status === "cancelled") {
          if (!cancelled) {
            setState("error");
            onError("Classification was cancelled.");
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
    };

    run();
    return () => { cancelled = true; };
  }, [newSubmissionId, flaggedDoc.id, flaggedDoc.document_type_id, flaggedDoc.document_type_name, onComplete, onError]);

  if (state === "mismatch" || state === "error") {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">
        Verifying Document
      </h2>

      {state === "classifying" && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
          <div className="flex items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-blue-900">
                Classifying your document...
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                AI is analyzing the file to determine the document type.
              </p>
            </div>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500"
              style={{ width: `${Math.max(10, progress)}%` }}
            />
          </div>
        </div>
      )}

      {state === "checking" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-center gap-4">
            <FileSearch className="h-8 w-8 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Checking document type...
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Verifying the file matches the required document type.
              </p>
            </div>
          </div>
        </div>
      )}

      {state === "match" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="flex items-center gap-4">
            <CircleCheck className="h-8 w-8 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">
                Document type confirmed!
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Matched as {flaggedDoc.document_type_name}
                {matchConfidence !== null && ` (${matchConfidence}% confidence)`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
