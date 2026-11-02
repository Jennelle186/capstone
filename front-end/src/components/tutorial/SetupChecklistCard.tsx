"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SETUP_STEP_INFO } from "@/components/tutorial/setupSteps";
import type { AdminSetupStatus, AdminSetupStepKey } from "@/types/tutorial";

interface SetupChecklistCardProps {
  status: AdminSetupStatus;
  onHide: () => void;
}

/** Index of the first required step that is not done yet, or -1 if none. */
export function firstOpenRequiredIndex(status: AdminSetupStatus): number {
  return status.steps.findIndex((step) => step.required && !step.done);
}

export default function SetupChecklistCard({ status, onHide }: SetupChecklistCardProps) {
  const navigate = useNavigate();
  const requiredSteps = status.steps.filter((step) => step.required);
  const doneRequired = requiredSteps.filter((step) => step.done).length;
  const focusIndex = firstOpenRequiredIndex(status);
  const percent = requiredSteps.length === 0 ? 100 : Math.round((doneRequired / requiredSteps.length) * 100);

  return (
    <section
      aria-labelledby="setup-checklist-title"
      className="rounded-lg border bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="setup-checklist-title" className="text-base font-semibold text-foreground">
            Set up the system
          </h2>
          <p className="text-sm text-muted-foreground">
            Complete these steps in order so students can start uploading documents.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onHide}>
          Hide for now
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Setup progress"
          className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
        >
          <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          {doneRequired} of {requiredSteps.length} required
        </span>
      </div>

      <ol className="mt-4 divide-y">
        {status.steps.map((step, index) => {
          const info = SETUP_STEP_INFO[step.key as AdminSetupStepKey];
          const isFocus = index === focusIndex;
          return (
            <li
              key={step.key}
              className={`flex flex-wrap items-center gap-3 py-3 ${isFocus ? "bg-amber-50 -mx-2 px-2 rounded" : ""}`}
            >
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
              ) : (
                <Circle className="h-5 w-5 text-slate-400" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{info.label}</span>
                  {!step.required ? <Badge variant="outline">Recommended</Badge> : null}
                  {isFocus ? <Badge>Next</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">{info.why}</p>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {step.done ? "Done" : step.count > 0 ? `${step.count} added` : "Not started"}
              </span>
              {!step.done ? (
                <Button size="sm" variant={isFocus ? "default" : "outline"} onClick={() => navigate(info.route)}>
                  Go
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
