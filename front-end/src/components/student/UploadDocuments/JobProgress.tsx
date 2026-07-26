import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobProgressProps {
  operation: string;
  progress: number;
  total: number;
  status: string;
  result?: string | null;
  errorMessage?: string | null;
}

export default function JobProgress({
  operation,
  progress,
  total,
  status,
  result,
  errorMessage,
}: JobProgressProps) {
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  const label = operation === "classify" ? "Classifying" : "Extracting";

  if (status === "finished") {
    if (result === "success") {
      return (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold">{label} complete</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              {progress} / {total} document{total !== 1 ? "s" : ""} processed
            </p>
          </div>
        </div>
      );
    }

    if (result === "partial_success") {
      return (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold">{label} finished with errors</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {progress} / {total} processed — some documents failed.
            </p>
            {errorMessage && (
              <p className="text-xs text-amber-700 mt-0.5">{errorMessage}</p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
        <div>
          <p className="text-sm font-semibold">{label} failed</p>
          {errorMessage && (
            <p className="text-xs text-red-700 mt-0.5">{errorMessage}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
      <Loader2 className="h-5 w-5 animate-spin flex-shrink-0 text-blue-600" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">
          {label} documents
          {total > 0 && (
            <span className="font-normal text-blue-700">
              {" "}— {progress} / {total}
            </span>
          )}
        </p>
        {total > 0 && (
          <div className="mt-1.5 w-full bg-blue-200 rounded-full h-2">
            <div
              className={cn(
                "h-2 rounded-full transition-all duration-500",
                pct === 100 ? "bg-emerald-500" : "bg-blue-600",
              )}
              style={{ width: `${Math.max(pct, 4)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
