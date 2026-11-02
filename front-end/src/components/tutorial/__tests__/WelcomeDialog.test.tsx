import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";

import WelcomeDialog from "@/components/tutorial/WelcomeDialog";
import type { AdminSetupStatus } from "@/types/tutorial";

const status: AdminSetupStatus = {
  active_school_year_name: null,
  core_complete: false,
  steps: [
    { key: "school_year", done: false, count: 0, required: true },
    { key: "programs", done: true, count: 2, required: true },
    { key: "advisers", done: false, count: 0, required: true },
    { key: "branding", done: false, count: 0, required: false },
  ],
};

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

describe("WelcomeDialog", () => {
  it("asks which part to set up first, listing only the parts not done yet", () => {
    render(
      <MemoryRouter>
        <WelcomeDialog open onClose={vi.fn()} status={status} />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole("dialog", { name: "Which part do you want to set up first?" });
    expect(within(dialog).getByRole("button", { name: /School year/ })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Advisers/ })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Academic programs/ })).toBeNull();
    expect(within(dialog).getByText("Recommended")).toBeTruthy();
  });

  it("locks every part except the school year until the school year is set up", () => {
    render(
      <MemoryRouter>
        <WelcomeDialog open onClose={vi.fn()} status={status} />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole("dialog", { name: "Which part do you want to set up first?" });
    expect((within(dialog).getByRole("button", { name: /Advisers/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: /School year/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(dialog).getAllByText("After school year").length).toBe(2);
    expect(within(dialog).getByText(/Start with the school year/)).toBeTruthy();
  });

  it("opens the chosen page with the guide flag", () => {
    const onClose = vi.fn();
    const doneSchoolYear: AdminSetupStatus = {
      ...status,
      steps: status.steps.map((step) => (step.key === "school_year" ? { ...step, done: true } : step)),
    };
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <WelcomeDialog open onClose={onClose} status={doneSchoolYear} />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Advisers/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location").textContent).toBe("/admin/advisers?guide=1");
  });
});
