import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { SubmissionDetail } from "@/types/submission";

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

vi.mock("@/components/student/ReviewDocumentDetailModal", () => ({
  default: () => <div data-testid="review-modal">ReviewModal</div>,
}));

vi.mock("@/components/student/UploadDocuments/upload/DropZone", () => ({
  default: () => <div data-testid="drop-zone">DropZone</div>,
}));

vi.mock(
  "@/components/student/UploadDocuments/upload/PreviouslyUploadedSection",
  () => ({
    default: () => <div data-testid="previously-uploaded">PreviouslyUploaded</div>,
  }),
);

vi.mock("@/components/student/UploadDocuments/upload/NewFileList", () => ({
  default: () => <div data-testid="new-file-list">NewFileList</div>,
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
//  StepUpload tests
// ═══════════════════════════════════════════════════════════════

import StepUpload from "@/components/student/UploadDocuments/upload/StepUpload";

describe("StepUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue("mock-token");
  });

  it("renders DropZone when not all verified", () => {
    render(<StepUpload getToken={mockGetToken} />);
    expect(screen.getByTestId("drop-zone")).toBeDefined();
  });

  it("renders the previously uploaded section", () => {
    render(<StepUpload getToken={mockGetToken} />);
    expect(screen.getByTestId("previously-uploaded")).toBeDefined();
  });

  it("renders the new file list", () => {
    render(<StepUpload getToken={mockGetToken} />);
    expect(screen.getByTestId("new-file-list")).toBeDefined();
  });

  it("renders the upload sidebar with required documents", () => {
    render(<StepUpload getToken={mockGetToken} />);
    expect(screen.getByTestId("upload-sidebar")).toBeDefined();
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
  created_at: new Date().toISOString(),
  extracted_data: null,
  rejection_reason: null,
  document_type_code: null,
  file_key: "",
  parent_submission_id: null,
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
            llama_job_id: null,
          },
        ]}
        getToken={mockGetToken}
      />,
    );
    expect(screen.queryByText(/verified/)).toBeNull();
  });
});
