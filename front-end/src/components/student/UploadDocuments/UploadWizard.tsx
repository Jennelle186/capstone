"use client";

import { type ReactNode } from "react";
import { ArrowRight, ChevronLeft, Info } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Upload", number: 1 },
  { label: "Classify", number: 2 },
  { label: "Review", number: 3 },
  { label: "Submit", number: 4 },
];

const SUBTITLES: Record<number, string> = {
  1: "Select or drag files for verification",
  2: "Review and confirm document classifications",
  3: "Review extracted data",
  4: "Finalize and submit your records",
};

const FOOTER_HINTS: Record<number, string> = {
  1: "Supported formats: PDF, PNG, JPG — up to 315MB",
  2: "Click a document to review its classification or flag it for review",
  3: "Verify extracted fields and correct any mismatches",
  4: "Double-check your documents before final submission",
};

const NEXT_LABELS: Record<number, string> = {
  1: "Next: Classify & Organize",
  2: "Next: Review Extraction",
  3: "Next: Review & Submit",
  4: "Submit All",
};

type UploadWizardProps = {
  step: number;
  onStepChange: (step: number) => void;
  nextDisabled?: boolean;
  children: ReactNode;
};

export default function UploadWizard({ step, onStepChange, nextDisabled, children }: UploadWizardProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header + Stepper */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Upload Your Enrolment Records</h2>
            <p className="text-sm text-slate-500">Step {step}: {SUBTITLES[step]}</p>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-0 w-full md:w-auto">
            {STEPS.map((s, i) => (
              <div key={s.number} className="flex items-center flex-1 md:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold z-10",
                      s.number <= step
                        ? "bg-primary text-white"
                        : "bg-white border-2 border-slate-200 text-slate-500"
                    )}
                  >
                    {s.number}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase mt-1.5 whitespace-nowrap",
                      s.number <= step ? "text-primary" : "text-slate-500"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 mx-2 md:w-12",
                      s.number < step ? "bg-primary" : "bg-slate-200"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      {children}

      {/* Sticky footer */}
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-lg">
        <div className="flex items-center gap-2 px-2">
          <Info className="h-4 w-4 text-slate-500" />
          <p className="text-sm text-slate-500">{FOOTER_HINTS[step]}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate("/student/dashboard")}
            className="text-slate-500 hover:text-slate-700"
          >
            Cancel
          </Button>
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => onStepChange(step - 1)}
              className="rounded-xl gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
          )}
          <Button
            disabled={nextDisabled}
            onClick={() => step < 4 && onStepChange(step + 1)}
            className={cn(
              "rounded-xl shadow-md gap-2",
              nextDisabled
                ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                : "bg-primary text-white hover:bg-primary/90",
            )}
          >
            {NEXT_LABELS[step]}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
