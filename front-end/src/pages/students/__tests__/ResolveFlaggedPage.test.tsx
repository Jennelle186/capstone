import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  docs: [] as Array<Record<string, unknown>>,
  navigate: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useParams: () => ({ documentId: "doc-1" }),
  useNavigate: () => hoisted.navigate,
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: async () => "token", isLoaded: true, isSignedIn: true }),
}));

vi.mock("@/lib/api", () => ({
  fetchWithClerkAuth: vi.fn(async () => ({
    ok: true,
    json: async () => hoisted.docs,
  })),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import ResolveFlaggedPage from "../ResolveFlaggedPage";

describe("ResolveFlaggedPage", () => {
  beforeEach(() => {
    hoisted.docs = [];
  });

  it("says there is nothing to correct when the document was not flagged", async () => {
    hoisted.docs = [{ id: "doc-1", status: "submitted", document_type_id: "t1", document_type_name: "Certificate" }];
    render(<ResolveFlaggedPage />);

    await waitFor(() => expect(screen.getByText("Nothing to correct")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Upload & Verify/ })).not.toBeInTheDocument();
  });

  it("shows the correction flow for a flagged document", async () => {
    hoisted.docs = [{ id: "doc-1", status: "flagged", document_type_id: "t1", document_type_name: "Certificate", file_key: "k", original_filename: "c.pdf", classification_result: null }];
    render(<ResolveFlaggedPage />);

    await waitFor(() => expect(screen.queryByText("Nothing to correct")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: /Upload & Verify/ })).toBeInTheDocument());
  });

  it("says the document was not found when it is not in the list", async () => {
    hoisted.docs = [];
    render(<ResolveFlaggedPage />);

    await waitFor(() => expect(screen.getByText("Document Not Found")).toBeInTheDocument());
  });
});
