import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import SetupChecklistCard, { firstOpenRequiredIndex } from "@/components/tutorial/SetupChecklistCard";
import type { AdminSetupStatus } from "@/types/tutorial";

function status(overrides: Partial<Record<string, boolean>> = {}): AdminSetupStatus {
  const done = (key: string) => overrides[key] ?? false;
  return {
    active_school_year_name: done("school_year") ? "2026-2027" : null,
    core_complete: false,
    steps: [
      { key: "school_year", done: done("school_year"), count: done("school_year") ? 1 : 0, required: true },
      { key: "programs", done: done("programs"), count: done("programs") ? 3 : 0, required: true },
      { key: "advisers", done: done("advisers"), count: 0, required: true },
      { key: "document_types", done: done("document_types"), count: 0, required: true },
      { key: "schemas", done: done("schemas"), count: 0, required: true },
      { key: "requirements", done: done("requirements"), count: 0, required: true },
      { key: "branding", done: done("branding"), count: 0, required: false },
      { key: "forms", done: done("forms"), count: 0, required: false },
    ],
  };
}

function renderCard(data: AdminSetupStatus, onHide = vi.fn()) {
  render(
    <MemoryRouter>
      <SetupChecklistCard status={data} onHide={onHide} />
    </MemoryRouter>,
  );
  return { onHide };
}

describe("firstOpenRequiredIndex", () => {
  it("points at the first required step that is not done", () => {
    expect(firstOpenRequiredIndex(status({ school_year: true }))).toBe(1);
  });

  it("skips optional steps", () => {
    const data = status({ school_year: true, programs: true, advisers: true, document_types: true, schemas: true, requirements: true });

    expect(firstOpenRequiredIndex(data)).toBe(-1);
  });
});

describe("SetupChecklistCard", () => {
  it("shows the count of required steps done", () => {
    renderCard(status({ school_year: true, programs: true }));

    expect(screen.getByText("2 of 6 required")).toBeInTheDocument();
  });

  it("marks only the first unfinished required step as Next", () => {
    renderCard(status({ school_year: true }));

    expect(screen.getAllByText("Next")).toHaveLength(1);
    expect(screen.getByText("Academic programs").closest("li")).toHaveTextContent("Next");
  });

  it("labels optional steps as Recommended and never as Next", () => {
    renderCard(status({ school_year: true, programs: true, advisers: true, document_types: true, schemas: true, requirements: true }));

    expect(screen.getAllByText("Recommended")).toHaveLength(2);
    expect(screen.queryByText("Next")).toBeNull();
  });

  it("calls onHide when the admin hides the checklist", () => {
    const { onHide } = renderCard(status());

    fireEvent.click(screen.getByRole("button", { name: "Hide for now" }));

    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("does not offer Go for a step that is already done", () => {
    renderCard(status({ school_year: true }));

    const schoolYearRow = screen.getByText("School year").closest("li") as HTMLElement;
    expect(schoolYearRow).not.toHaveTextContent("Go");
    expect(schoolYearRow).toHaveTextContent("Done");
  });
});
