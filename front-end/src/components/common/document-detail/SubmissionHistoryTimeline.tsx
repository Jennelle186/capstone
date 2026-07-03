"use client";

import { useState } from "react";
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  Upload,
  RefreshCw,
  FileText,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SubmissionHistoryEntry } from "@/types/submission-history";
import {
  ACTION_LABELS,
  SYSTEM_ACTIONS,
  formatHistoryTime,
} from "@/types/submission-history";

const ACTION_ICONS: Record<string, React.ReactNode> = {
  SUBMITTED: <Upload className="h-4 w-4 text-blue-500" />,
  PROCESSING: <RefreshCw className="h-4 w-4 text-slate-400" />,
  CLASSIFIED: <FileText className="h-4 w-4 text-slate-400" />,
  VERIFIED: <CheckCircle className="h-4 w-4 text-emerald-500" />,
  FLAGGED: <AlertTriangle className="h-4 w-4 text-rose-500" />,
  REUPLOADED: <RefreshCw className="h-4 w-4 text-amber-500" />,
  REPLACEMENT_OF: <RefreshCw className="h-4 w-4 text-indigo-500" />,
  IN_REVIEW: <Eye className="h-4 w-4 text-indigo-500" />,
};

interface SubmissionHistoryTimelineProps {
  entries: SubmissionHistoryEntry[];
  loading?: boolean;
  showSystemEventsDefault?: boolean;
}

export default function SubmissionHistoryTimeline({
  entries,
  loading,
  showSystemEventsDefault = false,
}: SubmissionHistoryTimelineProps) {
  const [showSystem, setShowSystem] = useState(showSystemEventsDefault);

  if (loading) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        Loading history...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        No activity recorded yet
      </div>
    );
  }

  const filtered = showSystem
    ? entries
    : entries.filter((e) => !SYSTEM_ACTIONS.includes(e.action));

  const hasSystemEvents = entries.some((e) => SYSTEM_ACTIONS.includes(e.action));

  return (
    <div className="space-y-1">
      {filtered.map((entry, i) => {
        const isLast = i === filtered.length - 1;
        return (
          <div key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white">
                {ACTION_ICONS[entry.action] ?? (
                  <Clock className="h-4 w-4 text-slate-400" />
                )}
              </div>
              {!isLast && <div className="w-px flex-1 bg-slate-200" />}
            </div>
            <div className={cn("pb-4", isLast && "pb-0")}>
              <p className="text-sm font-medium text-slate-700">
                {ACTION_LABELS[entry.action] ?? entry.action}
              </p>
              {entry.actor_name && (
                <p className="text-xs text-muted-foreground">
                  by {entry.actor_name}
                </p>
              )}
              {entry.reason && (
                <p className="mt-0.5 text-xs text-slate-500 italic">
                  &ldquo;{entry.reason}&rdquo;
                </p>
              )}
              <p className="mt-0.5 text-[10px] text-slate-400">
                {formatHistoryTime(entry.created_at)}
              </p>
            </div>
          </div>
        );
      })}
      {hasSystemEvents && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[10px] text-muted-foreground"
          onClick={() => setShowSystem(!showSystem)}
        >
          {showSystem ? "Hide system events" : "Show system events"}
        </Button>
      )}
    </div>
  );
}
