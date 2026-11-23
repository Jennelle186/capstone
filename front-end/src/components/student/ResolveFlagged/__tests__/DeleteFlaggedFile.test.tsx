import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import DeleteFlaggedFile from "@/components/student/ResolveFlagged/DeleteFlaggedFile";

const fetchWithClerkAuth = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchWithClerkAuth: (...args: unknown[]) => fetchWithClerkAuth(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

describe("DeleteFlaggedFile", () => {
  beforeEach(() => {
    fetchWithClerkAuth.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("deletes the file after confirmation and reports the removal", async () => {
    fetchWithClerkAuth.mockResolvedValue(new Response(null, { status: 204 }));
    const onDeleted = vi.fn();
    const getToken = vi.fn().mockResolvedValue("token-123");

    render(
      <DeleteFlaggedFile submissionId="sub-9" filename="report-card.pdf" getToken={getToken} onDeleted={onDeleted} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete file" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("sub-9"));
    expect(fetchWithClerkAuth).toHaveBeenCalledWith("/api/me/documents/sub-9", "token-123", { method: "DELETE" });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("keeps the file and shows the server's message when the delete is refused", async () => {
    fetchWithClerkAuth.mockResolvedValue(
      new Response(JSON.stringify({ detail: "This file is locked." }), { status: 409 }),
    );
    const onDeleted = vi.fn();

    render(
      <DeleteFlaggedFile
        submissionId="sub-9"
        filename="report-card.pdf"
        getToken={vi.fn().mockResolvedValue("token-123")}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete file" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("This file is locked."));
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
