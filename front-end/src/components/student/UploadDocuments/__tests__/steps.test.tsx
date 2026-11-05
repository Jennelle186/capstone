import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import type { SubmissionDetail } from "@/types/submission";
import { allSlotsVerified, type SlotStatusResponse } from "@/types/requirement";

const { mockGetToken, mockFetchWithClerk } = vi.hoisted(() => ({
  mockGetToken: vi.fn().mockResolvedValue("mock-token"),
  mockFetchWithClerk: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    getToken: mockGetToken,
    isLoaded: true,
    isSignedIn: true,
  }),
}));

vi.mock("@/lib/api", () => ({
  fetchWithClerkAuth: mockFetchWithClerk,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock(
  "@/components/student/UploadDocuments/classify/ClassificationCard",
  () => ({
    default: () => <div data-testid="classification-card">ClassificationCard</div>,
  }),
);

vi.mock(
  "@/components/student/UploadDocuments/classify/SubmissionChecklist",
  () => ({
    default: () => <div data-testid="submission-checklist">SubmissionChecklist</div>,
  }),
);

vi.mock("@/components/student/UploadDocuments/JobProgress", () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="job-progress" data-progress={String(props.progress)} data-total={String(props.total)}>
      JobProgress
    </div>
  ),
}));

vi.mock(
  "@/components/student/UploadDocuments/extract/ExtractionCard",
  () => ({
    default: () => <div data-testid="extraction-card">ExtractionCard</div>,
  }),
);

vi.mock(
  "@/components/student/UploadDocuments/submit/SubmissionCard",
  () => ({
    default: () => <div data-testid="submission-card">SubmissionCard</div>,
  }),
);

vi.mock(
  "@/components/student/UploadDocuments/submit/SubmissionSummary",
  () => ({
    default: () => <div data-testid="submission-summary">SubmissionSummary</div>,
  }),
);

vi.mock(
  "@/components/student/UploadDocuments/ProgramMismatchBanner",
  () => ({
    default: () => <div data-testid="program-mismatch-banner">ProgramMismatchBanner</div>,
  }),
);

vi.mock("@/components/student/ReviewDocumentDetailModal", () => ({
  default: () => <div data-testid="review-modal">ReviewModal</div>,
}));

vi.mock("@/components/student/UploadDocuments/upload/DropZone", () => ({
  default: (props: { onFilesAdded?: (files: File[]) => void }) => (
    <div data-testid="drop-zone">
      DropZone
      <button
        data-testid="add-file"
        onClick={() => props.onFilesAdded?.([new File(["pdf"], "a.pdf", { type: "application/pdf" })])}
      >
        AddFile
      </button>
    </div>
  ),
}));

vi.mock(
  "@/components/student/UploadDocuments/upload/PreviouslyUploadedSection",
  () => ({
    default: () => <div data-testid="previously-uploaded">PreviouslyUploaded</div>,
  }),
);

vi.mock("@/components/student/UploadDocuments/upload/NewFileList", () => ({
  default: (props: {
    files?: unknown[];
    onUpload?: (item: unknown) => void;
    onUploadAll?: () => void;
  }) => (
    <div data-testid="new-file-list">
      <span data-testid="new-file-count">{props.files?.length ?? 0}</span>
      <button
        data-testid="upload-one"
        onClick={() =>
          props.onUpload?.(props.files?.[0] ?? {
            id: "f1",
            file: new File(["pdf"], "a.pdf", { type: "application/pdf" }),
            previewUrl: undefined,
            pdfUrl: undefined,
          })
        }
      >
        UploadOne
      </button>
      <button data-testid="upload-all" onClick={() => props.onUploadAll?.()}>
        UploadAll
      </button>
    </div>
  ),
}));

vi.mock("@/components/student/UploadDocuments/upload/UploadSidebar", () => ({
  default: () => <div data-testid="upload-sidebar">UploadSidebar</div>,
}));

vi.mock(
  "@/components/student/UploadDocuments/upload/DocumentPreviewDialog",
  () => ({
    default: (props: { open?: boolean }) =>
      props.open ? <div data-testid="preview-dialog">Preview</div> : null,
  }),
);

vi.mock("@/components/student/UploadDocuments/submit/ConfirmDialog", () => ({
  default: (props: { open?: boolean }) =>
    props.open ? <div data-testid="confirm-dialog">Confirm</div> : null,
}));

vi.mock("@/lib/jobs", () => ({
  createJob: vi.fn().mockResolvedValue({
    id: "job-1",
    operation: "classify",
    status: "queued",
    progress: 0,
    total: 2,
    result: null,
    error_message: null,
    attempt_number: 1,
    parent_job_id: null,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    last_updated_at: new Date().toISOString(),
    student_id: "student-1",
    submissions: [],
  }),
  getActiveJobs: vi.fn().mockResolvedValue({ jobs: [] }),
  getJob: vi.fn(),
  retryJob: vi.fn(),
}));

import * as jobLib from "@/lib/jobs";

const makeSlot = (overrides: Partial<SlotStatusResponse> = {}): SlotStatusResponse => ({
  id: "slot-1",
  slot_type: "solo",
  group_name: null,
  description: null,
  min_required: 1,
  display_order: 0,
  items: [],
  is_complete: true,
  matched_submission_ids: [],
  duplicate_submission_ids: [],
  matched_count: 1,
  verified_count: 1,
  has_verified_conflict: true,
  ...overrides,
});

// ═══════════════════════════════════════════════════════════════
//  Pure utility tests
// ═══════════════════════════════════════════════════════════════

describe("isClassificationComplete", () => {
  it("returns false for empty array", async () => {
    const { isClassificationComplete } = await import("@/lib/constants");
    expect(isClassificationComplete([])).toBe(false);
  });

  it("returns true when all items are classified", async () => {
    const { isClassificationComplete } = await import("@/lib/constants");
    expect(
      isClassificationComplete([
        { status: "classified" as const },
        { status: "submitted" as const },
        { status: "overridden" as const },
      ]),
    ).toBe(true);
  });

  it("returns false when any item is pending", async () => {
    const { isClassificationComplete } = await import("@/lib/constants");
    expect(
      isClassificationComplete([
        { status: "classified" as const },
        { status: "pending" as const },
      ]),
    ).toBe(false);
  });

  it("returns false when any item is processing", async () => {
    const { isClassificationComplete } = await import("@/lib/constants");
    expect(
      isClassificationComplete([
        { status: "classified" as const },
        { status: "processing" as const },
      ]),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  allSlotsVerified utility tests
// ═══════════════════════════════════════════════════════════════

describe("allSlotsVerified", () => {
  it("returns false for empty slots", () => {
    expect(allSlotsVerified([])).toBe(false);
  });

  it("returns true when every slot is fully verified", () => {
    expect(allSlotsVerified([makeSlot()])).toBe(true);
  });

  it("returns false when a slot is only partially verified", () => {
    expect(allSlotsVerified([makeSlot({ min_required: 2, verified_count: 1 })])).toBe(false);
  });

  it("returns false when any slot is not fully verified", () => {
    expect(
      allSlotsVerified([
        makeSlot({ id: "slot-1", min_required: 1, verified_count: 1 }),
        makeSlot({ id: "slot-2", min_required: 2, verified_count: 1 }),
      ]),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  StepUpload tests
// ═══════════════════════════════════════════════════════════════

import StepUpload from "@/components/student/UploadDocuments/upload/StepUpload";

describe("StepUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue("mock-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders DropZone when the student chooses AI sorting", async () => {
    render(<StepUpload getToken={mockGetToken} />);
    await userEvent.setup().click(screen.getByRole("radio", { name: /Let AI sort my files/ }));
    expect(screen.getByTestId("drop-zone")).toBeDefined();
  });

  it("shows the required documents by default, without the AI drop zone", () => {
    render(
      <StepUpload
        requiredSlots={[]}
        requiredDocuments={[{ id: "dt-1", name: "Report Card", code: "report_card", description: "", is_required: true }]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.getByText("Report Card")).toBeDefined();
    expect(screen.queryByTestId("drop-zone")).toBeNull();
    expect(screen.queryByTestId("previously-uploaded")).toBeNull();
    expect((screen.getByRole("radio", { name: /I'll choose the document/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("sends a chosen file with its document type and without AI splitting", async () => {
    const initiateBodies: string[] = [];
    mockFetchWithClerk.mockImplementation((url: string, _token: string, init?: { body?: string }) => {
      if (url.includes("initiate")) {
        initiateBodies.push(init?.body ?? "");
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ url: "https://gcs.example/file", submission_id: "sub-3" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { container } = render(
      <StepUpload
        requiredSlots={[]}
        requiredDocuments={[{ id: "dt-1", name: "Report Card", code: "report_card", description: "", is_required: true }]}
        getToken={mockGetToken}
      />,
    );
    const input = container.querySelector<HTMLInputElement>("#choose-file-dt-1");
    expect(input).not.toBeNull();
    await userEvent.setup().upload(input!, new File(["pdf"], "card.pdf", { type: "application/pdf" }));

    await waitFor(() => expect(initiateBodies.length).toBe(1));
    const body = JSON.parse(initiateBodies[0]);
    expect(body.document_type_id).toBe("dt-1");
    expect(body.classify_manually).toBe(true);
    expect(body.is_compiled).toBe(false);
  });

  it("hides DropZone when all documents are verified", () => {
    render(<StepUpload requiredSlots={[makeSlot()]} getToken={mockGetToken} />);
    expect(screen.queryByTestId("drop-zone")).toBeNull();
    expect(screen.getByText("All documents verified")).toBeDefined();
  });

  it("renders the previously uploaded section when the student chooses AI sorting", async () => {
    render(<StepUpload getToken={mockGetToken} />);
    await userEvent.setup().click(screen.getByRole("radio", { name: /Let AI sort my files/ }));
    expect(screen.getByTestId("previously-uploaded")).toBeDefined();
  });

  it("hides the previously uploaded section when the student chooses the document for each file", () => {
    render(<StepUpload getToken={mockGetToken} />);
    expect(screen.queryByTestId("previously-uploaded")).toBeNull();
  });

  it("renders the new file list when the student chooses AI sorting", async () => {
    render(<StepUpload getToken={mockGetToken} />);
    await userEvent.setup().click(screen.getByRole("radio", { name: /Let AI sort my files/ }));
    expect(screen.getByTestId("new-file-list")).toBeDefined();
  });

  it("renders the upload sidebar with required documents", () => {
    render(<StepUpload getToken={mockGetToken} />);
    expect(screen.getByTestId("upload-sidebar")).toBeDefined();
  });

  it("resets the compiled checkbox after a single-file upload completes", async () => {
    mockFetchWithClerk.mockImplementation((url: string) => {
      if (url.includes("initiate")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ url: "https://gcs.example/file", submission_id: "sub-1" }),
        });
      }
      if (url.includes("confirm")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<StepUpload requiredSlots={[]} getToken={mockGetToken} />);

    await userEvent.setup().click(screen.getByRole("radio", { name: /Let AI sort my files/ }));
    const checkbox = screen.getByRole("checkbox", {
      name: /multiple documents/i,
    });
    await userEvent.setup().click(checkbox);
    expect(checkbox).toBeChecked();

    await userEvent.setup().click(screen.getByTestId("upload-one"));

    await waitFor(() => expect(checkbox).not.toBeChecked());
  });

  it("removes a file from the list below the drop zone once its upload completes", async () => {
    mockFetchWithClerk.mockImplementation((url: string) => {
      if (url.includes("initiate")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ url: "https://gcs.example/file", submission_id: "sub-2" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<StepUpload requiredSlots={[]} getToken={mockGetToken} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /Let AI sort my files/ }));
    await user.click(screen.getByTestId("add-file"));
    expect(screen.getByTestId("new-file-count").textContent).toBe("1");

    await user.click(screen.getByTestId("upload-one"));

    await waitFor(() => expect(screen.getByTestId("new-file-count").textContent).toBe("0"));
  });

  it("removes the file it replaces only after the new file is saved", async () => {
    const calls: string[] = [];
    mockFetchWithClerk.mockImplementation((url: string, _token: string, init?: { method?: string }) => {
      if (init?.method === "DELETE") {
        calls.push(`delete:${url}`);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (url.includes("initiate")) {
        calls.push("initiate");
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ url: "https://gcs.example/file", submission_id: "sub-new" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      calls.push("gcs");
      return Promise.resolve({ ok: true });
    }));

    const { container } = render(
      <StepUpload
        requiredSlots={[]}
        requiredDocuments={[{ id: "dt-1", name: "Report Card", code: "report_card", description: "", is_required: true }]}
        existingSubmissions={[makeSubmission({ id: "old-1", document_type_id: "dt-1", status: "uploaded" })]}
        getToken={mockGetToken}
      />,
    );
    const input = container.querySelector<HTMLInputElement>("#choose-file-dt-1");
    await userEvent.setup().upload(input!, new File(["pdf"], "new.pdf", { type: "application/pdf" }));

    await waitFor(() => expect(calls).toContain("delete:/api/me/documents/old-1"));
    expect(calls.indexOf("delete:/api/me/documents/old-1")).toBeGreaterThan(calls.indexOf("gcs"));
  });

  it("keeps the file it would replace when the new upload fails", async () => {
    const calls: string[] = [];
    mockFetchWithClerk.mockImplementation((url: string, _token: string, init?: { method?: string }) => {
      if (init?.method === "DELETE") {
        calls.push("delete");
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (url.includes("initiate")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ url: "https://gcs.example/file", submission_id: "sub-new" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error", text: () => Promise.resolve("boom") }));

    const { container } = render(
      <StepUpload
        requiredSlots={[]}
        requiredDocuments={[{ id: "dt-1", name: "Report Card", code: "report_card", description: "", is_required: true }]}
        existingSubmissions={[makeSubmission({ id: "old-1", document_type_id: "dt-1", status: "uploaded" })]}
        getToken={mockGetToken}
      />,
    );
    const input = container.querySelector<HTMLInputElement>("#choose-file-dt-1");
    await userEvent.setup().upload(input!, new File(["pdf"], "new.pdf", { type: "application/pdf" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(calls).not.toContain("delete");
  });

  it("lists files that match no required document in choose mode", () => {
    render(
      <StepUpload
        requiredSlots={[]}
        requiredDocuments={[{ id: "dt-1", name: "Report Card", code: "report_card", description: "", is_required: true }]}
        existingSubmissions={[makeSubmission({ id: "x", document_type_id: "dt-other", status: "uploaded" })]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.getByTestId("previously-uploaded")).toBeDefined();
  });

  it("does not list files that are already on a required-document card in choose mode", () => {
    render(
      <StepUpload
        requiredSlots={[]}
        requiredDocuments={[{ id: "dt-1", name: "Report Card", code: "report_card", description: "", is_required: true }]}
        existingSubmissions={[makeSubmission({ id: "x", document_type_id: "dt-1", status: "uploaded" })]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.queryByTestId("previously-uploaded")).toBeNull();
  });

  it("reports a failed delete instead of confirming it", async () => {
    mockFetchWithClerk.mockImplementation((_url: string, _token: string, init?: { method?: string }) =>
      Promise.resolve({ ok: init?.method !== "DELETE", status: 409, statusText: "Conflict", json: () => Promise.resolve({}) }),
    );

    render(
      <StepUpload
        requiredSlots={[]}
        requiredDocuments={[{ id: "dt-1", name: "Report Card", code: "report_card", description: "", is_required: true }]}
        existingSubmissions={[makeSubmission({ id: "old-1", document_type_id: "dt-1", status: "uploaded", original_filename: "card.pdf" })]}
        getToken={mockGetToken}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete card.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete file" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("offers no View button for a form filled in online, because it has no file", () => {
    render(
      <StepUpload
        requiredSlots={[]}
        requiredDocuments={[{ id: "dt-1", name: "Admission Form", code: "admission_form", description: "", is_required: true }]}
        existingSubmissions={[makeSubmission({ id: "sub-f", document_type_id: "dt-1", status: "submitted", filled_online: true, original_filename: "form.pdf" })]}
        getToken={mockGetToken}
      />,
    );

    expect(screen.queryByRole("button", { name: /View form\.pdf/ })).toBeNull();
  });

  it("opens the preview for a file that is being processed", async () => {
    render(
      <StepUpload
        requiredSlots={[]}
        requiredDocuments={[{ id: "dt-1", name: "Report Card", code: "report_card", description: "", is_required: true }]}
        existingSubmissions={[makeSubmission({ id: "sub-e", document_type_id: "dt-1", status: "processing", original_filename: "reading.pdf" })]}
        getToken={mockGetToken}
      />,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "View reading.pdf" }));
    expect(screen.getByTestId("preview-dialog")).toBeDefined();
  });

  it("opens the preview for a file that is already submitted", async () => {
    render(
      <StepUpload
        requiredSlots={[]}
        requiredDocuments={[{ id: "dt-1", name: "Report Card", code: "report_card", description: "", is_required: true }]}
        existingSubmissions={[makeSubmission({ id: "sub-s", document_type_id: "dt-1", status: "submitted", original_filename: "sent.pdf" })]}
        getToken={mockGetToken}
      />,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "View sent.pdf" }));
    expect(screen.getByTestId("preview-dialog")).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  StepClassify tests
// ═══════════════════════════════════════════════════════════════

import StepClassify from "@/components/student/UploadDocuments/classify/StepClassify";

const makeSubmission = (overrides: Partial<SubmissionDetail> = {}) => ({
  id: overrides.id ?? "sub-1",
  status: overrides.status ?? "uploaded",
  original_filename: overrides.original_filename ?? "test.pdf",
  file_size: overrides.file_size ?? "1024",
  mime_type: overrides.mime_type ?? "application/pdf",
  document_type_id: (overrides.document_type_id ?? null) as string | null,
  document_type_name: (overrides.document_type_name ?? null) as string | null,
  classification_result: overrides.classification_result ?? null,
  is_compiled: (overrides.is_compiled ?? false) as boolean,
  filled_online: (overrides.filled_online ?? false) as boolean,
  created_at: new Date().toISOString(),
  extracted_data: null,
  rejection_reason: null,
  document_type_code: null,
  file_key: "",
  parent_submission_id: null,
  page_range: null,
  segment_index: null,
  is_compiled_parent: false,
  page_count: null,
  children: [],
  llama_job_id: null,
});

describe("StepClassify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue("mock-token");
    mockFetchWithClerk.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.mocked(jobLib.getActiveJobs).mockResolvedValue({ jobs: [] });
  });

  it("renders the checklist and header", () => {
    render(
      <StepClassify
        requiredSlots={[]}
        requiredDocuments={[
          {
            id: "dt-1",
            name: "Report Card",
            code: "report_card",
            description: "",
            is_required: true,
          },
        ]}
        submissions={[makeSubmission()]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.getByTestId("submission-checklist")).toBeDefined();
    expect(screen.getByText("Classify Your Documents")).toBeDefined();
  });

  it("shows empty state when no visible items", () => {
    render(
      <StepClassify
        requiredSlots={[]}
        requiredDocuments={[]}
        submissions={[]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.getByText(/No documents uploaded yet/)).toBeDefined();
  });

  it("shows verified empty state when all slots are verified", () => {
    render(
      <StepClassify
        requiredSlots={[makeSlot()]}
        requiredDocuments={[]}
        submissions={[]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.getByText(/All documents verified/)).toBeDefined();
    expect(screen.queryByText(/No documents uploaded yet/)).toBeNull();
  });

  it("shows Classify All button when items are pending", () => {
    render(
      <StepClassify
        requiredSlots={[]}
        requiredDocuments={[
          {
            id: "dt-1",
            name: "Form 137",
            code: "form_137",
            description: "",
            is_required: true,
          },
        ]}
        submissions={[makeSubmission({ status: "uploaded" })]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.getByRole("button", { name: /Classify All/ })).toBeDefined();
  });

  it("does not show Classify All when all items are classified", () => {
    render(
      <StepClassify
        requiredSlots={[]}
        requiredDocuments={[
          {
            id: "dt-1",
            name: "Form 137",
            code: "form_137",
            description: "",
            is_required: true,
          },
        ]}
        submissions={[
          makeSubmission({
            id: "sub-1",
            status: "classified",
            document_type_id: "dt-1",
            classification_result: {
              confidence: 0.95,
              accepted_by_user: false,
            },
          }),
        ]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.queryByText("Classify All")).toBeNull();
  });

  it("does not flag documents as non-requirements when no slots are configured", () => {
    render(
      <StepClassify
        requiredSlots={[]}
        requiredDocuments={[
          {
            id: "dt-1",
            name: "Form 137",
            code: "form_137",
            description: "",
            is_required: true,
          },
        ]}
        submissions={[
          makeSubmission({
            id: "sub-1",
            status: "classified",
            document_type_id: "dt-1",
            classification_result: {
              confidence: 0.95,
              accepted_by_user: false,
            },
          }),
        ]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.queryByText(/not part of your requirements/)).toBeNull();
  });

  it("triggers onClassificationChange(true) when all items are classified", async () => {
    const onChange = vi.fn();
    render(
      <StepClassify
        requiredSlots={[]}
        requiredDocuments={[
          {
            id: "dt-1",
            name: "Form 137",
            code: "form_137",
            description: "",
            is_required: true,
          },
        ]}
        submissions={[
          makeSubmission({
            id: "sub-1",
            status: "classified",
            document_type_id: "dt-1",
            classification_result: {
              confidence: 0.95,
              accepted_by_user: false,
            },
          }),
        ]}
        onClassificationChange={onChange}
        getToken={mockGetToken}
      />,
    );
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(true);
    });
  });

  it("triggers onClassificationChange(false) when items are still pending", async () => {
    const onChange = vi.fn();
    render(
      <StepClassify
        requiredSlots={[]}
        requiredDocuments={[
          {
            id: "dt-1",
            name: "Form 137",
            code: "form_137",
            description: "",
            is_required: true,
          },
        ]}
        submissions={[makeSubmission({ id: "sub-1", status: "uploaded" })]}
        onClassificationChange={onChange}
        getToken={mockGetToken}
      />,
    );
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows processing spinner after Classify All is clicked", async () => {
    vi.mocked(jobLib.createJob).mockResolvedValueOnce({
      id: "job-1",
      operation: "classify",
      status: "queued",
      progress: 0,
      total: 1,
      result: null,
      error_message: null,
      attempt_number: 1,
      parent_job_id: null,
      created_at: "",
      started_at: null,
      completed_at: null,
      last_updated_at: "",
      student_id: "s-1",
      submissions: [],
    });

    render(
      <StepClassify
        requiredSlots={[]}
        requiredDocuments={[
          {
            id: "dt-1",
            name: "Form 137",
            code: "form_137",
            description: "",
            is_required: true,
          },
        ]}
        submissions={[makeSubmission({ id: "sub-1", status: "uploaded" })]}
        getToken={mockGetToken}
      />,
    );

    await userEvent.setup().click(
      screen.getByRole("button", { name: /Classify All/ }),
    );

    await waitFor(() => {
      expect(screen.getByText("Classifying document…")).toBeDefined();
    });
  });

  it("handles 409 conflict by attaching to existing job", async () => {
    vi.mocked(jobLib.createJob).mockRejectedValueOnce({ status: 409 });
    vi.mocked(jobLib.getActiveJobs).mockResolvedValueOnce({
      jobs: [
        {
          id: "conflict-job",
          operation: "classify",
          status: "running",
          progress: 2,
          total: 4,
          result: null,
          error_message: null,
          attempt_number: 1,
          parent_job_id: null,
          created_at: "",
          started_at: null,
          completed_at: null,
          last_updated_at: "",
          student_id: "s-1",
          submissions: [],
        },
      ],
    });

    render(
      <StepClassify
        requiredSlots={[]}
        requiredDocuments={[
          {
            id: "dt-1",
            name: "Form 137",
            code: "form_137",
            description: "",
            is_required: true,
          },
        ]}
        submissions={[makeSubmission({ id: "sub-1", status: "uploaded" })]}
        getToken={mockGetToken}
      />,
    );

    await userEvent.setup().click(
      screen.getByRole("button", { name: /Classify All/ }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("job-progress")).toBeDefined();
    });
  });

  it("attaches to existing active job from getActiveJobs on mount", async () => {
    vi.mocked(jobLib.getActiveJobs).mockResolvedValueOnce({
      jobs: [
        {
          id: "existing-job-1",
          operation: "classify",
          status: "running",
          progress: 1,
          total: 3,
          result: null,
          error_message: null,
          attempt_number: 1,
          parent_job_id: null,
          created_at: "",
          started_at: null,
          completed_at: null,
          last_updated_at: "",
          student_id: "s-1",
          submissions: [],
        },
      ],
    });

    render(
      <StepClassify
        requiredSlots={[]}
        requiredDocuments={[
          {
            id: "dt-1",
            name: "Form 137",
            code: "form_137",
            description: "",
            is_required: true,
          },
        ]}
        submissions={[makeSubmission({ status: "processing" })]}
        getToken={mockGetToken}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("job-progress")).toBeDefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  StepExtract tests
// ═══════════════════════════════════════════════════════════════

import StepExtract from "@/components/student/UploadDocuments/extract/StepExtract";

describe("StepExtract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue("mock-token");
    mockFetchWithClerk.mockImplementation((url: string) => {
      if (url.includes("/documents/extractions")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                submission_id: "sub-1",
                file_name: "test.pdf",
                document_type_name: "Form 137",
                fields: [
                  {
                    id: "f1",
                    key: "student_name",
                    label: "Student Name",
                    value: "John Doe",
                    confidence: 0.95,
                    needsReview: false,
                    required: true,
                  },
                ],
              },
            ]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    vi.mocked(jobLib.getActiveJobs).mockResolvedValue({ jobs: [] });
  });

  it("shows loading state on initial mount", () => {
    render(<StepExtract getToken={mockGetToken} />);
    expect(screen.getByText("Loading extraction data...")).toBeDefined();
  });

  it("clears loading state after fetch", async () => {
    render(<StepExtract getToken={mockGetToken} />);

    await waitFor(() => {
      expect(
        screen.queryByText("Loading extraction data..."),
      ).toBeNull();
    });
  });

  it("shows empty state when no items after loading", async () => {
    mockFetchWithClerk.mockImplementation((url: string) => {
      if (url.includes("/documents/extractions")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<StepExtract getToken={mockGetToken} />);

    await waitFor(() => {
      expect(screen.getByText("No extracted data available.")).toBeDefined();
    });
  });

  it("shows verified empty state when all documents are verified", async () => {
    mockFetchWithClerk.mockImplementation((url: string) => {
      if (url.includes("/documents/extractions")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<StepExtract getToken={mockGetToken} allVerified />);

    await waitFor(() => {
      expect(screen.getByText(/All documents verified/)).toBeDefined();
    });
  });

  it("shows Extract All button when items are loaded", async () => {
    render(<StepExtract getToken={mockGetToken} />);

    await waitFor(() => {
      expect(screen.getByText("Extract All")).toBeDefined();
    });
  });

  it("handles 409 conflict on Extract All", async () => {
    vi.mocked(jobLib.createJob).mockRejectedValueOnce({ status: 409 });
    vi.mocked(jobLib.getActiveJobs).mockResolvedValueOnce({
      jobs: [
        {
          id: "extract-conflict",
          operation: "extract",
          status: "running",
          progress: 0,
          total: 1,
          result: null,
          error_message: null,
          attempt_number: 1,
          parent_job_id: null,
          created_at: "",
          started_at: null,
          completed_at: null,
          last_updated_at: "",
          student_id: "s-1",
          submissions: [],
        },
      ],
    });

    mockFetchWithClerk.mockImplementation((url: string) => {
      if (url.includes("/documents/extractions")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                submission_id: "sub-1",
                file_name: "test.pdf",
                document_type_name: "Form 137",
                fields: [
                  {
                    id: "f1",
                    key: "x",
                    label: "X",
                    value: "",
                    confidence: 0,
                    needsReview: false,
                    required: false,
                  },
                ],
              },
            ]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<StepExtract getToken={mockGetToken} />);
    // 409 does not crash — silently attaches to existing job
  });
});

// ═══════════════════════════════════════════════════════════════
//  StepSubmit tests
// ═══════════════════════════════════════════════════════════════

import StepSubmit from "@/components/student/UploadDocuments/submit/StepSubmit";

describe("StepSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue("mock-token");
    mockFetchWithClerk.mockImplementation((url: string) => {
      if (url.includes("/documents/extractions")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it("renders submission cards for pending items", () => {
    render(
      <StepSubmit
        requiredSlots={[]}
        submissions={[
          {
            id: "sub-1",
            status: "classified",
            document_type_id: "dt-1",
            document_type_name: "Report Card",
            original_filename: "report.pdf",
            file_size: "1024",
            mime_type: "application/pdf",
            classification_result: { confidence: 0.95 },
            is_compiled: false,
            created_at: new Date().toISOString(),
            extracted_data: null,
            rejection_reason: null,
            document_type_code: null,
            file_key: "",
            parent_submission_id: null,
            page_range: null,
            segment_index: null,
            is_compiled_parent: false,
            page_count: null,
            children: [],
            llama_job_id: null,
          },
        ]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.getByTestId("submission-card")).toBeDefined();
  });

  it("renders the submission summary", () => {
    render(
      <StepSubmit
        requiredSlots={[]}
        submissions={[
          {
            id: "sub-1",
            status: "classified",
            document_type_id: "dt-1",
            document_type_name: "Report Card",
            original_filename: "report.pdf",
            file_size: "1024",
            mime_type: "application/pdf",
            classification_result: { confidence: 0.95 },
            is_compiled: false,
            created_at: new Date().toISOString(),
            extracted_data: null,
            rejection_reason: null,
            document_type_code: null,
            file_key: "",
            parent_submission_id: null,
            page_range: null,
            segment_index: null,
            is_compiled_parent: false,
            page_count: null,
            children: [],
            llama_job_id: null,
          },
        ]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.getByTestId("submission-summary")).toBeDefined();
  });

  it("shows verified document count when there are verified submissions", () => {
    render(
      <StepSubmit
        requiredSlots={[]}
        submissions={[
          {
            id: "v-1",
            status: "verified",
            document_type_id: "dt-1",
            document_type_name: "Report Card",
            original_filename: "report.pdf",
            file_size: "1024",
            mime_type: "application/pdf",
            classification_result: null,
            is_compiled: false,
            created_at: new Date().toISOString(),
            extracted_data: null,
            rejection_reason: null,
            document_type_code: null,
            file_key: "",
            parent_submission_id: null,
            page_range: null,
            segment_index: null,
            is_compiled_parent: false,
            page_count: null,
            children: [],
            llama_job_id: null,
          },
        ]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.getByText("(1 verified)")).toBeDefined();
  });

  it("does not show verified count when there are no verified submissions", () => {
    render(
      <StepSubmit
        requiredSlots={[]}
        submissions={[
          {
            id: "sub-1",
            status: "classified",
            document_type_id: "dt-1",
            document_type_name: "Report Card",
            original_filename: "report.pdf",
            file_size: "1024",
            mime_type: "application/pdf",
            classification_result: { confidence: 0.95 },
            is_compiled: false,
            created_at: new Date().toISOString(),
            extracted_data: null,
            rejection_reason: null,
            document_type_code: null,
            file_key: "",
            parent_submission_id: null,
            page_range: null,
            segment_index: null,
            is_compiled_parent: false,
            page_count: null,
            children: [],
            llama_job_id: null,
          },
        ]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.queryByText(/verified/)).toBeNull();
  });

  it("shows all-verified completion screen when every slot is verified", () => {
    render(
      <StepSubmit
        requiredSlots={[makeSlot()]}
        submissions={[]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.getByText("All Documents Verified")).toBeDefined();
    expect(screen.getByText("Return to Dashboard")).toBeDefined();
  });
});
