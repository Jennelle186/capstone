import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AssignDepartmentDialog from "../AssignDepartmentDialog";

const departments = [
  { value: "BSIT", label: "BSIT", isActive: true },
  { value: "BSCS", label: "BSCS", isActive: true },
] as never;

function renderDialog(adviserIsActive: boolean) {
  return render(
    <AssignDepartmentDialog
      open
      onOpenChange={vi.fn()}
      onSubmit={vi.fn()}
      onDepartmentsChange={vi.fn()}
      departments={departments}
      isSubmitting={false}
      selectedAdviserName="Ada Lovelace"
      selectedDepartments={["BSIT"]}
      selectedSchoolYearName="2026-2027"
      adviserIsActive={adviserIsActive}
      adviserCurrentDepartments={["BSIT"]}
    />,
  );
}

describe("AssignDepartmentDialog", () => {
  it("explains that an inactive adviser can only lose programs", () => {
    renderDialog(false);
    expect(screen.getByRole("note")).toHaveTextContent("new programs can only be added after the adviser is activated");
  });

  it("shows no inactive notice for an active adviser", () => {
    renderDialog(true);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});
