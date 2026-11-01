import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import FieldEditorRow from "@/components/admin/extraction-schemas/FieldEditorRow";
import type { ExtractionSchemaField } from "@/types/extractionSchema";

// Radix Select relies on pointer-capture and scroll APIs that jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const field: ExtractionSchemaField = {
  id: "field-1",
  key: "gender",
  type: "string",
  description: "Gender",
  required: false,
  is_analytics: true,
  analytics_mode: null,
  analytics_group: "Demographics",
};

function renderRow(overrides: Partial<ExtractionSchemaField> = {}) {
  const onUpdate = vi.fn();
  render(
    <FieldEditorRow
      field={{ ...field, ...overrides }}
      index={0}
      allFields={[field]}
      onUpdate={onUpdate}
      onDelete={() => {}}
      isLast
      analyticsGroupSuggestions={["Demographics", "Academics"]}
    />,
  );
  return { onUpdate };
}

async function openAddGroupInput(user: ReturnType<typeof userEvent.setup>) {
  const column = screen.getByText("Analytics Group").parentElement as HTMLElement;
  const trigger = within(column).getByRole("combobox");
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: /add new group/i }));
  return screen.getByPlaceholderText("New group name");
}

describe("FieldEditorRow analytics group", () => {
  it("disables Save for an empty new group so the current group is not cleared", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderRow();

    const input = await openAddGroupInput(user);
    const addGroupForm = input.parentElement as HTMLElement;
    const save = within(addGroupForm).getByRole("button", { name: "Save" });

    expect(save).toBeDisabled();
    await user.click(save);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("saves a trimmed new group name", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderRow();

    const input = await openAddGroupInput(user);
    await user.type(input, "  Health  ");
    const save = within(input.parentElement as HTMLElement).getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    await user.click(save);

    expect(onUpdate).toHaveBeenCalledWith("field-1", { analytics_group: "Health" });
  });
});
