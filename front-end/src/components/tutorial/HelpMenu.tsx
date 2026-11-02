"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TourOverlay from "@/components/tutorial/TourOverlay";
import { moduleKeyForPath, TOURS } from "@/components/tutorial/tourContent";
import { useAdminTutorialProgress } from "@/hooks/useAdminTutorialProgress";
import type { TourStartRequest } from "@/types/tutorial";

/** Help icon for the admin header: starts the guided tour for this page, and
 *  offers the restart option. */
export default function HelpMenu() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, update } = useAdminTutorialProgress();
  const moduleKey = moduleKeyForPath(location.pathname);
  const tour = moduleKey ? TOURS[moduleKey] : undefined;

  const [active, setActive] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [redraw, setRedraw] = useState(0);

  // A tour belongs to the page it started on.
  useEffect(() => {
    setActive(false);
  }, [location.pathname]);

  // Escape closes the tour.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Scroll the step's element into view and keep the outline on it.
  useLayoutEffect(() => {
    if (!active || !tour) return;
    const step = tour.steps[index];
    const find = () =>
      step?.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;

    const measure = () => {
      const element = find();
      setTargetRect(element ? element.getBoundingClientRect() : null);
    };
    measure();
    const timer = window.setTimeout(measure, 350);
    const onMove = () => setRedraw((value) => value + 1);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [active, index, tour, redraw]);

  // Scroll to the step's target once per step. This is not repeated on scroll, so the user can move away.
  useLayoutEffect(() => {
    if (!active || !tour) return;
    const step = tour.steps[index];
    const element = step?.target
      ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      : null;
    // Scroll instantly when the user has asked for reduced motion.
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    element?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }, [active, index, tour]);

  // Each step tells the page which dialog should be open (if any), and can click one control on
  // entry to show a mode, such as "Generate with AI". Only UI state changes; nothing is submitted.
  useEffect(() => {
    if (!active || !tour) return;
    const step = tour.steps[index];
    window.dispatchEvent(
      new CustomEvent("admin-tour:step", { detail: { moduleKey, dialog: step?.dialog ?? null } }),
    );
    if (!step?.press) return;
    // The dialog may still be mounting, so keep looking for the control for up to a second.
    const selector = `[data-tour="${step.press}"]`;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const element = document.querySelector<HTMLElement>(selector);
      if (element) {
        window.clearInterval(timer);
        // Tabs switch on mousedown rather than click, so send both.
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        element.click();
      } else if (attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [active, index, tour, moduleKey]);

  const beginTour = () => {
    setIndex(0);
    setActive(true);
    // Pages with an editor (for example the Schema Builder) listen for this to know a guide is running.
    window.dispatchEvent(new CustomEvent("admin-tour:start", { detail: { moduleKey } }));
  };

  const startTour = () => {
    if (!tour) return;
    // Ask the page first. A page that needs a decision (the Schema Builder, when a schema is open)
    // takes over and calls proceed(). If no page takes over, the tour starts now.
    const request: TourStartRequest = { moduleKey, handled: false, proceed: beginTour };
    window.dispatchEvent(new CustomEvent("admin-tour:request-start", { detail: request }));
    if (!request.handled) beginTour();
  };

  // The first-visit question opens a page with "?guide=1". Remove the flag so a refresh does not
  // restart the guide, then start it after a short delay so the page has loaded its data.
  // No cleanup: removing the flag re-runs this effect, and a cleanup would cancel the start.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("guide") !== "1" || !tour) return;
    const next = new URLSearchParams(searchParams);
    next.delete("guide");
    setSearchParams(next, { replace: true });
    window.setTimeout(() => startTour(), 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tour]);

  const endTour = () => {
    setActive(false);
    // Closes any dialog the guide opened.
    window.dispatchEvent(new CustomEvent("admin-tour:step", { detail: { moduleKey, dialog: null } }));
    window.dispatchEvent(new CustomEvent("admin-tour:end", { detail: { moduleKey } }));
    // Give focus back to the Help button. The delay lets a dialog the guide opened restore its own focus first.
    window.setTimeout(() => helpButtonRef.current?.focus(), 50);
  };

  const finishTour = () => {
    endTour();
    if (moduleKey) void update({ seen: { [moduleKey]: true } });
  };

  const restartTutorial = () => {
    void update({
      mainDone: false,
      checklistHidden: false,
      welcomeSeen: false,
      seen: {},
      resetSeen: true,
    });
    navigate("/admin");
  };

  const showDot = Boolean(tour && moduleKey && !state.seen[moduleKey]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={helpButtonRef} variant="ghost" size="sm" className="relative gap-1.5" aria-label="Help">
            <CircleHelp className="h-4 w-4" aria-hidden="true" />
            <span>Help</span>
            {showDot ? (
              <span
                aria-hidden="true"
                data-testid="help-dot"
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary"
              />
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>This page</DropdownMenuLabel>
          <DropdownMenuItem disabled={!tour} onSelect={startTour}>
            {tour ? "Guide me through this page" : "No guide for this page yet"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Setup</DropdownMenuLabel>
          <DropdownMenuItem onSelect={restartTutorial}>Restart tutorial</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {active && tour ? (
        <TourOverlay
          tour={tour}
          index={index}
          targetRect={targetRect}
          onBack={() => setIndex((value) => Math.max(0, value - 1))}
          onNext={() => setIndex((value) => Math.min(tour.steps.length - 1, value + 1))}
          onSkip={endTour}
          onFinish={finishTour}
        />
      ) : null}
    </>
  );
}
