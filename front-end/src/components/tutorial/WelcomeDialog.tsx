"use client";

import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { firstOpenRequiredIndex } from "@/components/tutorial/SetupChecklistCard";
import { SETUP_STEP_INFO } from "@/components/tutorial/setupSteps";
import type { AdminSetupStatus } from "@/types/tutorial";

interface WelcomeDialogProps {
  open: boolean;
  onClose: () => void;
  /** Setup status, so the question lists only the parts that are not set up yet. */
  status?: AdminSetupStatus | null;
}

/** First-visit question: which part of setup to start with. The chosen page opens with its guide. */
export default function WelcomeDialog({ open, onClose, status }: WelcomeDialogProps) {
  const navigate = useNavigate();

  const openSetup = (route: string) => {
    onClose();
    // "?guide=1" tells the page to start its guide once it has loaded.
    navigate(`${route}?guide=1`);
  };

  const openSteps = status ? status.steps.filter((step) => !step.done) : [];
  const recommendedIndex = status ? firstOpenRequiredIndex(status) : -1;
  const recommendedKey = recommendedIndex >= 0 ? status?.steps[recommendedIndex]?.key : undefined;
  // The school year comes first: nothing else can be set up until it exists and is active.
  const schoolYearDone = status ? status.steps.find((step) => step.key === "school_year")?.done ?? false : true;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Which part do you want to set up first?</DialogTitle>
          <DialogDescription>
            {schoolYearDone
              ? "Pick one to open its page with a short guide. The setup checklist on the dashboard keeps track of the rest. While setup is incomplete, Restart tutorial in the Help menu shows this question again."
              : "Start with the school year. Students, advisers and everything else belong to an active school year, so the other parts unlock once it is set up."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1">
          {openSteps.map((step) => {
            const info = SETUP_STEP_INFO[step.key];
            const locked = !schoolYearDone && step.key !== "school_year";
            return (
              <button
                key={step.key}
                type="button"
                disabled={locked}
                onClick={() => openSetup(info.route)}
                className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{info.label}</span>
                  <span className="block text-xs text-slate-500">{info.why}</span>
                </span>
                <span className="shrink-0 text-[11px] font-medium text-primary">
                  {locked
                    ? "After school year"
                    : step.key === recommendedKey
                      ? "Recommended"
                      : step.required
                        ? ""
                        : "Optional"}
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
