import { Sparkles, BadgeAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router";
import { useDocumentReviewDesk } from "./hooks/useDocumentReviewDesk";
import { useSubmissionHistory } from "@/hooks/useSubmissionHistory";
import ReviewDeskLayout from "./components/ReviewDeskLayout";

export default function DocumentReviewDesk() {
  const navigate = useNavigate();
  const {
    student,
    currentSubmission,
    submissionsList,
    currentIndex,
    loading,
    actioning,
    sidebarOpen,
    autoAdvance,
    scale,
    rotated,
    activeSectionId,
    currentExtractions,
    classificationResults,
    previewUrl,
    stats,
    flagReasons,
    submittedFlags,
    setCurrentIndex,
    setSidebarOpen,
    setAutoAdvance,
    setScale,
    setRotated,
    setActiveSectionId,
    handlePrev,
    handleNext,
    handleFieldChange,
    handleFlagReasonChange,
    handleSubmitFlag,
    handleUpdateStatus,
    handleSaveField,
    handleReassignProgram,
    departments,
  } = useDocumentReviewDesk();

  const { entries: historyEntries, loading: historyLoading } =
    useSubmissionHistory(currentSubmission?.id, "adviser");

  const flagReason = currentSubmission ? flagReasons[currentSubmission.id] ?? "" : "";
  const flagSubmitted = currentSubmission ? submittedFlags[currentSubmission.id] ?? false : false;

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-center items-center text-slate-500">
        <Sparkles className="h-10 w-10 text-primary animate-pulse mb-4" />
        <p className="text-sm font-semibold tracking-wide">
          Loading Document Review Desk...
        </p>
        <div className="w-56 h-1 bg-slate-100 rounded-full mt-3 overflow-hidden">
          <div className="h-full w-2/3 bg-primary animate-pulse rounded-full" />
        </div>
      </div>
    );
  }

  if (!currentSubmission || !student) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-6 bg-white">
        <BadgeAlert className="h-12 w-12 text-slate-300 mb-3" />
        <h3 className="text-base font-bold text-slate-700">
          No submissions found
        </h3>
        <p className="text-xs text-slate-500 max-w-xs mt-1">
          This student has no submitted documents ready for review.
        </p>
        <Button
          onClick={() => navigate("/adviser/students")}
          className="mt-4"
        >
          Back to Advisees
        </Button>
      </div>
    );
  }

  return (
    <ReviewDeskLayout
      student={student}
      currentSubmission={currentSubmission}
      submissionsList={submissionsList}
      currentIndex={currentIndex}
      sidebarOpen={sidebarOpen}
      autoAdvance={autoAdvance}
      scale={scale}
      rotated={rotated}
      activeSectionId={activeSectionId}
      currentExtractions={currentExtractions}
      previewUrl={previewUrl}
      stats={stats}
      actioning={actioning}
      flagReason={flagReason}
      flagSubmitted={flagSubmitted}
      classificationResults={classificationResults}
      onSetCurrentIndex={setCurrentIndex}
      onSetSidebarOpen={setSidebarOpen}
      onSetAutoAdvance={setAutoAdvance}
      onSetScale={setScale}
      onSetRotated={setRotated}
      onSetActiveSectionId={setActiveSectionId}
      onPrev={handlePrev}
      onNext={handleNext}
      onFieldChange={handleFieldChange}
      onSaveField={handleSaveField}
      onFlagReasonChange={handleFlagReasonChange}
      onSubmitFlag={handleSubmitFlag}
      onUpdateStatus={handleUpdateStatus}
      onReassignProgram={handleReassignProgram}
      departments={departments}
      historyEntries={historyEntries}
      historyLoading={historyLoading}
    />
  );
}
