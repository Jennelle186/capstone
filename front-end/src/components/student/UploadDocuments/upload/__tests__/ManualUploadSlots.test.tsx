import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ManualUploadSlots from "@/components/student/UploadDocuments/upload/ManualUploadSlots";
import type { SlotStatusResponse } from "@/types/requirement";
import type { SubmissionDetail } from "@/types/submission";

function financialGroup(minRequired: number): SlotStatusResponse {
  return {
    id: "slot-fin",
    slot_type: "group",
    group_name: "Financial Record",
    description: null,
    min_required: minRequired,
    display_order: 0,
    items: [
      { item_id: "item-itr", document_type_id: "dt-itr", document_type_name: "Income Tax", document_type_code: "itr", form_id: null, form_name: null, is_primary: true },
      { item_id: "item-ind", document_type_id: "dt-ind", document_type_name: "Certificate of Indigency", document_type_code: "indigency", form_id: null, form_name: null, is_primary: false },
    ],
    is_complete: false,
    matched_submission_ids: [],
    duplicate_submission_ids: [],
    matched_count: 0,
    verified_count: 0,
    has_verified_conflict: false,
  } as unknown as SlotStatusResponse;
}

function submission(overrides: Partial<SubmissionDetail>): SubmissionDetail {
  return {
    id: "sub-1",
    status: "uploaded",
    original_filename: "file.pdf",
    file_size: "1024",
    mime_type: "application/pdf",
    document_type_id: null,
    document_type_name: null,
    classification_result: null,
    is_compiled: false,
    parent_submission_id: null,
    filled_online: false,
    created_at: new Date().toISOString(),
    ...overrides,
  } as unknown as SubmissionDetail;
}

function renderList(slot: SlotStatusResponse, existing: SubmissionDetail[]) {
  return render(
    <ManualUploadSlots
      slots={[slot]}
      legacyDocuments={[]}
      existingSubmissions={existing}
      uploadingTypeIds={new Set()}
      onChooseFile={vi.fn()}
      onView={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

describe("ManualUploadSlots group alternatives", () => {
  it("stops the other alternatives accepting an upload once the group's required count is covered", () => {
    const existing = [submission({ id: "sub-itr", document_type_id: "dt-itr", status: "verified" })];

    const { container } = renderList(financialGroup(1), existing);

    expect(screen.getByText("Not needed: this group is already covered")).toBeDefined();
    // The one empty alternative has no file input, so nothing can be uploaded to it.
    expect(container.querySelector("#choose-file-dt-ind")).toBeNull();
    expect(container.querySelector("#choose-file-dt-itr")).toBeNull();
  });

  it("keeps the upload control on every alternative while the group still needs documents", () => {
    const { container } = renderList(financialGroup(2), [submission({ id: "sub-itr", document_type_id: "dt-itr", status: "verified" })]);

    expect(screen.queryByText("Not needed: this group is already covered")).toBeNull();
    expect(container.querySelector("#choose-file-dt-ind")).not.toBeNull();
  });

  it("does not count a flagged file toward the group, so the other alternative stays open", () => {
    // The server does not count a flagged file toward min_required, so the group is still incomplete.
    const existing = [submission({ id: "sub-itr", document_type_id: "dt-itr", status: "flagged" })];

    const { container } = renderList(financialGroup(1), existing);

    expect(screen.queryByText("Not needed: this group is already covered")).toBeNull();
    expect(container.querySelector("#choose-file-dt-ind")).not.toBeNull();
  });
});
