import { AlertTriangle, Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdviserStudentSubmission } from "@/types/adviser-students";
import type { ReviewStatus } from "../types";

interface Props {
  currentSubmission: AdviserStudentSubmission | null;
  actioning: boolean;
  autoAdvance: boolean;
  flagReason: string;
  flagSubmitted: boolean;
  onFlagReasonChange: (submissionId: string, reason: string) => void;
  onUpdateStatus: (status: ReviewStatus) => void;
  onSubmitFlag: () => void;
}

export default function ReviewActionFooter({
  currentSubmission,
  actioning,
  autoAdvance,
  flagReason,
  flagSubmitted,
  onFlagReasonChange,
  onUpdateStatus,
  onSubmitFlag,
}: Props) {
  if (!currentSubmission) return null;

  const status = currentSubmission.status;

  return (
    <div className="p-5 border-t border-slate-200 shrink-0 bg-white flex flex-col gap-3">
      <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 font-medium">
        <span>Evaluate and mark advisee document validation status</span>
        {autoAdvance && (
          <span className="text-primary font-bold">Auto-Jump Active</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Button
          variant="outline"
          size="sm"
          className="h-10 border-rose-200 hover:bg-rose-50 text-rose-600 text-[10px] font-extrabold rounded-lg flex items-center justify-center gap-1 cursor-pointer transition"
          disabled={actioning || status === "flagged" || status === "verified"}
          onClick={() => onUpdateStatus("flagged")}
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
          <span>Flag Error</span>
        </Button>

        <Button
          size="sm"
          className="h-10 bg-primary hover:bg-primary/90 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1 shadow-sm cursor-pointer transition"
          disabled={actioning || status === "verified"}
          onClick={() => onUpdateStatus("verified")}
        >
          <Check className="h-4 w-4 shrink-0" />
          <span>Verify Doc</span>
        </Button>
      </div>

      {status === "flagged" && (
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-rose-600 uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Flag Reason
          </label>
          <textarea
            value={flagReason}
            onChange={(e) => onFlagReasonChange(currentSubmission.id, e.target.value)}
            placeholder="Explain why this document was flagged..."
            rows={3}
            className="w-full text-xs px-3 py-2 bg-white border border-rose-200 rounded-lg text-slate-700 placeholder-slate-400 hover:border-rose-300 focus:border-rose-400 focus:ring-1 focus:ring-rose-400 outline-none transition resize-none"
          />
          {!flagSubmitted && (
            <Button
              size="sm"
              className="w-full h-9 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-extrabold rounded-lg flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition"
              onClick={onSubmitFlag}
            >
              <Send className="h-3.5 w-3.5 shrink-0" />
              <span>Submit Flag</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
