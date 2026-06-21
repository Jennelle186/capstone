import { motion, AnimatePresence } from "framer-motion";
import type { AdviserStudentSubmission } from "@/types/adviser-students";
interface Props {
  open: boolean;
  submissionsList: AdviserStudentSubmission[];
  currentIndex: number;
  classificationResults: Record<string, Record<string, unknown> | null>;
  onSelect: (index: number) => void;
}

const statusBadge: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  verified: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  flagged: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
  "in-review": {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  submitted: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
};

function getClassificationConfidence(
  subId: string,
  classificationResults: Record<string, Record<string, unknown> | null>,
): number | null {
  const cr = classificationResults[subId];
  if (!cr || typeof cr !== "object") return null;
  const conf = cr.confidence;
  if (typeof conf === "number") return Math.round(conf * 100);
  return null;
}

function getExtractionAccuracy(sub: AdviserStudentSubmission): number | null {
  const ef = sub.extraction_fields;
  if (!ef || typeof ef !== "object") return null;
  const values: number[] = [];
  for (const val of Object.values(ef)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const entry = val as Record<string, unknown>;
      if (typeof entry.confidence === "number") {
        values.push(entry.confidence * 100);
      }
    }
  }
  if (values.length === 0) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(avg);
}

function scoreBadgeClasses(score: number) {
  if (score >= 80) return "bg-emerald-50 text-emerald-700";
  if (score >= 50) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

export default function SubmissionSidebar({
  open,
  submissionsList,
  currentIndex,
  classificationResults,
  onSelect,
}: Props) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 260, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 border-r border-slate-200 bg-white h-full flex flex-col overflow-hidden"
        >
          <div className="p-4 border-b border-slate-200">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
              Draft Batch Reviews
            </p>
            <p className="text-[10px] text-slate-400 mt-1 leading-normal font-medium">
              Click to audit any document in this block.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {submissionsList.map((sub, idx) => {
              const isActive = idx === currentIndex;
              const sb = statusBadge[sub.status] ?? statusBadge.submitted;
              const classification = getClassificationConfidence(sub.id, classificationResults);
              const accuracy = getExtractionAccuracy(sub);
              return (
                <button
                  key={sub.id}
                  onClick={() => onSelect(idx)}
                  className={`w-full text-left p-2.5 rounded-xl transition duration-150 flex flex-col gap-1 cursor-pointer group ${
                    isActive
                      ? "bg-primary/5 border border-primary/20 font-bold"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 w-full">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sb.bg} ${sb.text} ${sb.border} border`}
                    >
                      {sub.status}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400">
                      {sub.id.slice(0, 6)}
                    </span>
                  </div>

                  <div className="mt-1">
                    <p className="text-[10px] font-bold text-slate-700 tracking-tight group-hover:text-slate-900 transition leading-snug">
                      {sub.document_type ?? "Unclassified"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {classification !== null && (
                        <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded ${scoreBadgeClasses(classification)}`}>
                          Classification: {classification}%
                        </span>
                      )}
                      {accuracy !== null && (
                        <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded ${scoreBadgeClasses(accuracy)}`}>
                          Accuracy: {accuracy}%
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-center select-none text-[10px] text-slate-400 font-semibold uppercase tracking-widest leading-none">
            ADVISER DESK • V1.0
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
