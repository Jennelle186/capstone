import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import UploadSidebar from "@/components/student/UploadDocuments/upload/UploadSidebar";
import type { SlotStatusResponse } from "@/types/requirement";

const financialRecords = {
  id: "slot-fin",
  slot_type: "group",
  group_name: "Financial Records",
  description: null,
  min_required: 1,
  display_order: 0,
  items: [
    {
      item_id: "item-indigency",
      document_type_id: "dt-indigency",
      document_type_name: "Certificate of Indigency",
      document_type_code: "indigency",
      form_id: null,
      form_name: null,
      is_primary: true,
    },
    {
      item_id: "item-itr",
      document_type_id: "dt-itr",
      document_type_name: "Income Tax Return",
      document_type_code: "itr",
      form_id: "form-itr",
      form_name: "ITR form",
      is_primary: false,
    },
  ],
  is_complete: false,
  matched_submission_ids: [],
  duplicate_submission_ids: [],
  matched_count: 0,
  verified_count: 0,
  has_verified_conflict: false,
} as unknown as SlotStatusResponse;

describe("UploadSidebar", () => {
  it("lists every alternative of a group, including ones without a blank form", () => {
    render(
      <MemoryRouter>
        <UploadSidebar slots={[financialRecords]} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Upload any 1 of these:")).toBeDefined();
    expect(screen.getByText("Certificate of Indigency")).toBeDefined();
    expect(screen.getByText("Income Tax Return")).toBeDefined();
  });

  it("shows form links only for alternatives that have a blank form", () => {
    render(
      <MemoryRouter>
        <UploadSidebar slots={[financialRecords]} />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("link", { name: /Download blank form: Income Tax Return/ })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Download blank form: Certificate of Indigency/ })).toBeNull();
    const group = screen.getByText("Financial Records").closest("li") as HTMLElement;
    expect(within(group).getAllByRole("link")).toHaveLength(2);
  });

  it("keeps blank form downloads visible once the requirement is complete", () => {
    const completed = {
      ...financialRecords,
      is_complete: true,
      matched_count: 1,
    } as unknown as SlotStatusResponse;
    render(
      <MemoryRouter>
        <UploadSidebar slots={[completed]} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Requirement fulfilled: new uploads add alternate copies.")).toBeDefined();
    expect(screen.getAllByRole("link", { name: /Download blank form: Income Tax Return/ })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Fill online/ })).toBeNull();
  });
});
