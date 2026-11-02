import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HelpMenu from "@/components/tutorial/HelpMenu";
import { EMPTY_TUTORIAL_STATE } from "@/types/tutorial";

vi.mock("@/hooks/useAdminTutorialProgress", () => ({
  useAdminTutorialProgress: () => ({ state: EMPTY_TUTORIAL_STATE, update: vi.fn() }),
}));

function renderOnForms() {
  render(
    <MemoryRouter initialEntries={["/admin/forms"]}>
      <HelpMenu />
    </MemoryRouter>,
  );
}

function startGuide() {
  const trigger = screen.getByRole("button", { name: "Help" });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(screen.getByRole("menuitem", { name: "Guide me through this page" }));
}

describe("HelpMenu guide: dialog and press steps", () => {
  let stepEvents: Array<{ moduleKey: string | null; dialog: string | null }>;
  const onStep = (event: Event) => {
    stepEvents.push((event as CustomEvent).detail);
  };

  beforeEach(() => {
    stepEvents = [];
    window.addEventListener("admin-tour:step", onStep);
  });

  afterEach(() => {
    window.removeEventListener("admin-tour:step", onStep);
    document.querySelectorAll("[data-test-control]").forEach((node) => node.remove());
  });

  it("tells the page which dialog to show, and closes it on a step without one", async () => {
    renderOnForms();
    startGuide();

    // Step 1 (index 0) has no dialog.
    expect(stepEvents.at(-1)).toEqual({ moduleKey: "forms", dialog: null });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(stepEvents.at(-1)).toEqual({ moduleKey: "forms", dialog: "create-form" }));

    // Back to the first step closes the dialog again.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(stepEvents.at(-1)).toEqual({ moduleKey: "forms", dialog: null }));
  });

  it("clicks the control named by a step's press target when the step opens", async () => {
    renderOnForms();
    startGuide();

    // Put a stand-in for the "Generate with AI" mode button on the page. It is created after the
    // guide starts, which is how the dialog's real button appears, so the press has to wait for it.
    const onAiClick = vi.fn();
    const aiButton = document.createElement("button");
    aiButton.setAttribute("data-tour", "forms-create-ai");
    aiButton.setAttribute("data-test-control", "true");
    aiButton.addEventListener("click", onAiClick);

    // Steps 1 to 4 lead to the first AI step (index 4).
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
    await act(async () => {
      document.body.appendChild(aiButton);
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    await waitFor(() => expect(onAiClick).toHaveBeenCalled());
  });

  it("closes any guide dialog when the guide ends", async () => {
    renderOnForms();
    startGuide();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(stepEvents.at(-1)?.dialog).toBe("create-form"));

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(stepEvents.at(-1)).toEqual({ moduleKey: "forms", dialog: null });
  });

  it("gives focus back to the Help button when the guide ends", async () => {
    renderOnForms();
    startGuide();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Help" })));
  });
});

describe("HelpMenu guide started from a link", () => {
  it("starts the page's guide when the URL carries ?guide=1, and removes the flag", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/forms?guide=1"]}>
        <HelpMenu />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Step 1 of 11", {}, { timeout: 2000 })).toBeTruthy();
  });
});
