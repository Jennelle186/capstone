import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ActivityLogsPage from "@/pages/admin/activity-logs/ActivityLogsPage";
import { useActivityAdminOptions, useActivityLogsPage } from "@/hooks/useActivityLogsPage";
import { useActivityLogRetention } from "@/hooks/useActivityLogRetention";

vi.mock("@/hooks/useActivityLogsPage", () => ({
  useActivityLogsPage: vi.fn(),
  useActivityAdminOptions: vi.fn(),
  changedFieldKeys: vi.fn(() => []),
}));

vi.mock("@/hooks/useActivityLogRetention", () => ({
  useActivityLogRetention: vi.fn(),
}));

function mockRetention(overrides: Partial<ReturnType<typeof useActivityLogRetention>> = {}) {
  const value = {
    settings: { retention_days: null, options: [30, 90, 180, 365] },
    isLoading: false,
    isSaving: false,
    isPurging: false,
    saveRetention: vi.fn(async () => undefined),
    purgeOlderThan: vi.fn(async () => undefined),
    countOlderThan: vi.fn(async () => 4),
    ...overrides,
  } as unknown as ReturnType<typeof useActivityLogRetention>;
  vi.mocked(useActivityLogRetention).mockReturnValue(value);
  return value;
}

describe("ActivityLogsPage delete approval", () => {
  beforeEach(() => {
    vi.mocked(useActivityLogsPage).mockReturnValue({
      items: [],
      total: 0,
      page: 1,
      pageCount: 1,
      pageSize: 25,
      setPage: vi.fn(),
      filters: {
        search: "",
        entityType: "all",
        action: "all",
        actorUserId: "all",
        dateFrom: "",
        dateTo: "",
      },
      setFilters: vi.fn(),
      resetFilters: vi.fn(),
      isLoading: false,
      reload: vi.fn(),
    } as unknown as ReturnType<typeof useActivityLogsPage>);
    vi.mocked(useActivityAdminOptions).mockReturnValue([]);
  });

  it("shows how many entries would be deleted before anything is removed", async () => {
    const retention = mockRetention();
    render(<ActivityLogsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete logs" }));

    await waitFor(() => expect(retention.countOlderThan).toHaveBeenCalledWith(365));
    expect(await screen.findByText(/4 entries will be deleted/)).toBeInTheDocument();
    expect(retention.purgeOlderThan).not.toHaveBeenCalled();
  });

  it("deletes only after the admin confirms", async () => {
    const retention = mockRetention();
    render(<ActivityLogsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete logs" }));
    await screen.findByText(/4 entries will be deleted/);
    expect(retention.purgeOlderThan).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(retention.purgeOlderThan).toHaveBeenCalledWith(365));
  });
});
