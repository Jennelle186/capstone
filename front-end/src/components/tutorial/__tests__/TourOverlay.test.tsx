import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TourOverlay from "@/components/tutorial/TourOverlay";
import type { TourContent } from "@/components/tutorial/tourContent";

const tour: TourContent = {
  moduleKey: "test",
  title: "Test",
  steps: [
    { id: "one", title: "First thing", body: "Do this first." },
    { id: "two", title: "Second thing", body: "Then this.", tip: "A helpful tip." },
    { id: "three", title: "Last thing", body: "Finish here." },
  ],
};

function renderTour(index: number, overrides: Partial<Parameters<typeof TourOverlay>[0]> = {}) {
  const handlers = {
    onBack: vi.fn(),
    onNext: vi.fn(),
    onSkip: vi.fn(),
    onFinish: vi.fn(),
  };
  render(
    <TourOverlay
      tour={tour}
      index={index}
      targetRect={null}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("TourOverlay", () => {
  it("shows the step counter and the instruction", () => {
    renderTour(0);

    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "First thing" })).toBeInTheDocument();
    expect(screen.getByText("Do this first.")).toBeInTheDocument();
  });

  it("disables Back on the first step", () => {
    renderTour(0);

    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("calls onNext and onBack from the buttons", () => {
    const { onNext, onBack } = renderTour(1);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows Done instead of Next on the last step and calls onFinish", () => {
    const { onFinish } = renderTour(2);

    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("calls onSkip from the Skip button", () => {
    const { onSkip } = renderTour(0);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("shows the tip when a step has one", () => {
    renderTour(1);

    expect(screen.getByText(/A helpful tip\./)).toBeInTheDocument();
  });

  it("shows a worked example with a note that nothing is saved", () => {
    renderTour(0, {
      tour: {
        ...tour,
        steps: [
          {
            id: "x",
            title: "Units",
            body: "B",
            example: { caption: "Example field: Units taken", rows: [["Type", "number"], ["Required (REQ)", "On"]] },
          },
        ],
      },
    });

    expect(screen.getByText("Example field: Units taken")).toBeInTheDocument();
    expect(screen.getByText("Required (REQ)")).toBeInTheDocument();
    expect(screen.getByText("Example only. Nothing is saved.")).toBeInTheDocument();
  });

  it("explains a missing element instead of failing", () => {
    renderTour(0, {
      tour: { ...tour, steps: [{ id: "x", target: "missing-target", title: "T", body: "B" }] },
    });

    expect(screen.getByText(/isn't on the page right now/)).toBeInTheDocument();
    expect(screen.queryByTestId("tour-spotlight")).toBeNull();
  });
});
