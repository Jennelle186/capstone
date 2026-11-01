import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AdministratorHistory from "@/components/admin/admins/AdministratorHistory";
import { useAdministratorHistory } from "@/hooks/useAdministratorHistory";

vi.mock("@/hooks/useAdministratorHistory", () => ({
  useAdministratorHistory: vi.fn(),
}));

describe("AdministratorHistory", () => {
  it("lists each event as a table row, newest first, with the person, actor and status", () => {
    vi.mocked(useAdministratorHistory).mockReturnValue({
      isLoading: false,
      people: [
        {
          email: "new.admin@example.edu",
          name: "New Admin",
          status: "removed",
          events: [
            { type: "invited", at: "2026-10-02T08:00:00Z", actor_name: "Anton Lee" },
            { type: "accepted", at: "2026-10-03T08:00:00Z", actor_name: null },
            { type: "removed", at: "2026-10-08T08:00:00Z", actor_name: "Anton Lee" },
          ],
        },
      ],
    });

    render(<AdministratorHistory />);

    const rows = screen.getAllByRole("row").slice(1); // skip the header row
    expect(rows).toHaveLength(3);

    // Newest event first.
    expect(within(rows[0]).getByText("Administrator access removed")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Accepted invitation")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Invited")).toBeInTheDocument();

    expect(within(rows[0]).getByText("New Admin")).toBeInTheDocument();
    expect(within(rows[0]).getByText("new.admin@example.edu")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Anton Lee")).toBeInTheDocument();
    expect(within(rows[1]).getByText("—")).toBeInTheDocument();
    expect(within(rows[0]).getByText("No longer an administrator")).toBeInTheDocument();
  });

  it("shows an empty state when there is no history", () => {
    vi.mocked(useAdministratorHistory).mockReturnValue({ isLoading: false, people: [] });

    render(<AdministratorHistory />);

    expect(screen.getByText("No administrator history yet")).toBeInTheDocument();
  });

  it("shows a loading state while the history loads", () => {
    vi.mocked(useAdministratorHistory).mockReturnValue({ isLoading: true, people: [] });

    render(<AdministratorHistory />);

    expect(screen.getByText("Loading administrator history…")).toBeInTheDocument();
  });
});
