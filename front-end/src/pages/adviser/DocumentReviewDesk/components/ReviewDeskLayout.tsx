import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import ReviewDeskNavbar from "./ReviewDeskNavbar";
import SubmissionSidebar from "./SubmissionSidebar";
import DocumentCanvas from "./DocumentCanvas";
import ExtractionFieldEditor from "./ExtractionFieldEditor";
import ReviewActionFooter from "./ReviewActionFooter";
import SubmissionHistoryTimeline from "@/components/common/document-detail/SubmissionHistoryTimeline";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { SubmissionHistoryEntry } from "@/types/submission-history";
import type { AdviserStudentSubmission } from "@/types/adviser-students";
import type { ExtractionSection } from "@/components/common/document-detail/DocumentDetailModal";
import type { ReviewDeskStats, ReviewStatus } from "../types";

interface StudentInfo {
  id: string;
  name: string;
  student_number?: string | null;
  program?: string;
  program_mismatch_pending?: boolean;
  program_mismatch_extracted?: string | null;
}

interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

interface Props {
  student: StudentInfo | null;
  currentSubmission: AdviserStudentSubmission | null;
  submissionsList: AdviserStudentSubmission[];
  currentIndex: number;
  sidebarOpen: boolean;
  autoAdvance: boolean;
  scale: number;
  rotated: number;
  activeSectionId: string;
  currentExtractions: ExtractionSection[];
  previewUrl: string | null;
  stats: ReviewDeskStats;
  actioning: boolean;
  flagReason: string;
  flagSubmitted: boolean;
  classificationResults: Record<string, Record<string, unknown> | null>;
  onSetCurrentIndex: (i: number) => void;
  onSetSidebarOpen: (v: boolean) => void;
  onSetAutoAdvance: (v: boolean) => void;
  onSetScale: (v: number) => void;
  onSetRotated: (v: number) => void;
  onSetActiveSectionId: (v: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onFieldChange: (key: string, value: string) => void;
  onSaveField: (fieldId: string, value: string) => void;
  onFlagReasonChange: (submissionId: string, reason: string) => void;
  onSubmitFlag: () => void;
  onUpdateStatus: (status: ReviewStatus) => void;
  onReassignProgram: (programId: string) => void;
  departments: DepartmentOption[];
  historyEntries: SubmissionHistoryEntry[];
  historyLoading: boolean;
}

export default function ReviewDeskLayout({
  student,
  currentSubmission,
  submissionsList,
  currentIndex,
  sidebarOpen,
  autoAdvance,
  scale,
  rotated,
  activeSectionId,
  currentExtractions,
  previewUrl,
  stats,
  actioning,
  flagReason,
  flagSubmitted,
  classificationResults,
  onSetCurrentIndex,
  onSetSidebarOpen,
  onSetAutoAdvance,
  onSetScale,
  onSetRotated,
  onSetActiveSectionId,
  onPrev,
  onNext,
  onFieldChange,
  onSaveField,
  onFlagReasonChange,
  onSubmitFlag,
  onUpdateStatus,
  onReassignProgram,
  departments,
  historyEntries,
  historyLoading,
}: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<string>("");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-slate-900 font-sans antialiased h-screen w-screen overflow-hidden">
      <ReviewDeskNavbar
            currentIndex={currentIndex}
            totalSubmissions={submissionsList.length}
            stats={stats}
            autoAdvance={autoAdvance}
            sidebarOpen={sidebarOpen}
            studentId={student?.id ?? ""}
            studentName={student?.name ?? ""}
            studentNumber={student?.student_number ?? null}
            onPrev={onPrev}
            onNext={onNext}
            onAutoAdvanceToggle={onSetAutoAdvance}
            onSidebarToggle={() => onSetSidebarOpen(!sidebarOpen)}
      />

      {student?.program_mismatch_pending && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-800">
              Program mismatch: student is assigned to{" "}
              <strong>{student.program ?? "unknown"}</strong>, but their admission
              form indicates <strong>{student.program_mismatch_extracted}</strong>.
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Select value={reassignTarget} onValueChange={setReassignTarget}>
                <SelectTrigger className="h-8 w-56 bg-white border-amber-300 text-xs">
                  <SelectValue placeholder="Select new program..." />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                disabled={!reassignTarget || actioning}
                onClick={() => {
                  if (reassignTarget) {
                    onReassignProgram(reassignTarget);
                    setReassignTarget("");
                  }
                }}
              >
                Reassign
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <SubmissionSidebar
          open={sidebarOpen}
          submissionsList={submissionsList}
          currentIndex={currentIndex}
          classificationResults={classificationResults}
          onSelect={(idx) => {
            onSetCurrentIndex(idx);
            onSetScale(1.0);
            onSetRotated(0);
          }}
        />

        <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 overflow-hidden h-full">
          <DocumentCanvas
            previewUrl={previewUrl}
            studentName={currentSubmission?.document_type ?? "Document"}
            studentNumber={student?.student_number ?? null}
            scale={scale}
            rotated={rotated}
            onZoomIn={() => onSetScale(Math.min(scale + 0.15, 1.5))}
            onZoomOut={() => onSetScale(Math.max(scale - 0.15, 0.7))}
            onRotate={() => onSetRotated((rotated + 90) % 360)}
            onReset={() => {
              onSetScale(1.0);
              onSetRotated(0);
            }}
            documentType={currentSubmission?.document_type ?? ""}
          />

          <div className="xl:col-span-5 h-full flex flex-col bg-white overflow-hidden">
            <ExtractionFieldEditor
              currentSubmission={currentSubmission}
              currentExtractions={currentExtractions}
              activeSectionId={activeSectionId}
              onSectionChange={onSetActiveSectionId}
              onFieldChange={onFieldChange}
              onSaveField={onSaveField}
            />
            <div className="px-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex items-center justify-between w-full py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
              >
                <span>Document History</span>
                {historyOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              {historyOpen && (
                <div className="pb-3 overflow-y-auto max-h-48">
                  <SubmissionHistoryTimeline
                    entries={historyEntries}
                    loading={historyLoading}
                    showSystemEventsDefault
                  />
                </div>
              )}
            </div>
            <ReviewActionFooter
              currentSubmission={currentSubmission}
              actioning={actioning}
              autoAdvance={autoAdvance}
              flagReason={flagReason}
              flagSubmitted={flagSubmitted}
              onFlagReasonChange={onFlagReasonChange}
              onUpdateStatus={onUpdateStatus}
              onSubmitFlag={onSubmitFlag}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
