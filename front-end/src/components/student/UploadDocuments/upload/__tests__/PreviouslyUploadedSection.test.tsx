import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PreviouslyUploadedSection from "@/components/student/UploadDocuments/upload/PreviouslyUploadedSection";
import type { PreviewItem } from "@/components/student/UploadDocuments/upload/DocumentPreviewDialog";
import type { SubmissionDetail } from "@/types/submission";

function submission(overrides: Partial<SubmissionDetail>): SubmissionDetail {
  return {
    id: "sub-1",
    status: "uploaded",
    original_filename: "file.pdf",
    file_size: "1024",
    mime_type: "application/pdf",
    document_type_id: "dt-1",
    document_type_name: "Birth certificate",
    classification_result: null,
    is_compiled: false,
    parent_submission_id: null,
    filled_online: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as unknown as SubmissionDetail;
}

function renderSection(submissions: SubmissionDetail[]) {
  // Only submissions the preview dialog can open are in previewItems, as in the real page.
  const previewItems = submissions
    .filter((s) => s.status !== "verified")
    .map((s) => ({ type: "existing", submission: s })) as unknown as PreviewItem[];

  render(
    <PreviouslyUploadedSection
      submissions={submissions}
      previewItems={previewItems}
      onPreview={vi.fn()}
      onDeleteSubmission={vi.fn()}
      getToken={vi.fn().mockResolvedValue("token")}
    />,
  );
}

describe("PreviouslyUploadedSection preview button", () => {
  it("offers a preview for an uploaded document", () => {
    renderSection([submission({ id: "sub-up", original_filename: "birth.pdf", status: "uploaded" })]);

    expect(screen.getByRole("button", { name: "Preview birth.pdf" })).toBeInTheDocument();
  });

  it("does not offer a preview for a verified document, which the preview dialog cannot open", () => {
    renderSection([submission({ id: "sub-ver", original_filename: "verified.pdf", status: "verified" })]);

    expect(screen.queryByRole("button", { name: "Preview verified.pdf" })).not.toBeInTheDocument();
  });
});
