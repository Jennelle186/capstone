"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import type { TourContent } from "@/components/tutorial/tourContent";

interface TourOverlayProps {
  tour: TourContent;
  index: number;
  targetRect: DOMRect | null;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

/** Keeps the panel off the highlighted element: if the element is on the right half of
 *  the screen the panel goes to the left, otherwise to the right. */
export function panelSide(targetRect: DOMRect | null): string {
  if (!targetRect || typeof window === "undefined") return "right-4";
  const centre = targetRect.left + targetRect.width / 2;
  return centre > window.innerWidth / 2 ? "left-4" : "right-4";
}

/** Dims the page, outlines the step's element, and shows the instruction in a side panel. */
export default function TourOverlay({ tour, index, targetRect, onBack, onNext, onSkip, onFinish }: TourOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const step = tour.steps[index];
  const total = tour.steps.length;
  const isLast = index === total - 1;

  // Move focus into the panel so screen readers announce the step and keyboard users start here.
  useEffect(() => {
    panelRef.current?.focus();
  }, [index]);

  // On narrow screens, a dialog step starts with the panel's details folded away so the dialog
  // stays visible. The details are visually hidden, not removed, so screen readers still read them.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(Boolean(tour.steps[index]?.dialog));
  }, [index, tour]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {targetRect ? (
        <div
          aria-hidden="true"
          data-testid="tour-spotlight"
          className="pointer-events-none fixed z-[60] rounded-md ring-2 ring-primary transition-all motion-reduce:transition-none"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            // On a dialog step the dialog already dims the page, so the spotlight only outlines its target.
            boxShadow: step.dialog ? "none" : "0 0 0 9999px rgba(15, 23, 42, 0.55)",
          }}
        />
      ) : step.dialog ? null : (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[59] bg-slate-900/50" />
      )}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-body"
        tabIndex={-1}
        className={`pointer-events-auto fixed bottom-4 z-[61] w-[min(360px,calc(100vw-2rem))] rounded-lg border bg-white p-5 shadow-xl outline-none ${step.dialog ? "left-4" : panelSide(targetRect)}`}
      >
        <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
          Step {index + 1} of {total}
        </p>
        <h2 id="tour-step-title" className="mt-1 text-base font-semibold text-foreground">
          {step.title}
        </h2>
        <div id="tour-step-details" className={collapsed ? "max-lg:sr-only" : undefined}>
        <p id="tour-step-body" className="mt-2 text-sm text-foreground">
          {step.body}
        </p>
        {step.target && !targetRect ? (
          <p className="mt-2 text-xs text-muted-foreground">
            This button isn't on the page right now. It appears once the page has loaded.
          </p>
        ) : null}
        {step.example ? (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {step.example.caption}
            </p>
            <dl className="mt-2 space-y-1">
              {step.example.rows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[9rem_1fr] gap-2 text-xs">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-muted-foreground">Example only. Nothing is saved.</p>
          </div>
        ) : null}
        {step.tip ? <p className="mt-3 rounded bg-slate-50 p-2 text-xs text-muted-foreground">Tip: {step.tip}</p> : null}
        </div>
        <button
          type="button"
          className="mt-3 text-xs font-medium text-primary underline lg:hidden"
          aria-expanded={!collapsed}
          aria-controls="tour-step-details"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? "Show details" : "Hide details"}
        </button>

        <div className="mt-5 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onBack} disabled={index === 0}>
              Back
            </Button>
            {isLast ? (
              <Button size="sm" onClick={onFinish}>
                Done
              </Button>
            ) : (
              <Button size="sm" onClick={onNext}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
