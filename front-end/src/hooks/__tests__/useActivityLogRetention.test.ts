import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { useActivityLogRetention } from "@/hooks/useActivityLogRetention";
import { fetchWithClerkAuth } from "@/lib/api";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => "token" }),
}));

vi.mock("@/lib/api", () => ({
  fetchWithClerkAuth: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as unknown as Response;
}

const SETTINGS_PATH = "/api/admin/activity-logs/settings";
const PURGE_PATH = "/api/admin/activity-logs/purge";
const OPTIONS = [30, 90, 180, 365];

function mockApi(overrides: Partial<Record<string, Response>> = {}) {
  vi.mocked(fetchWithClerkAuth).mockImplementation(async (path, _token, init) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    if (overrides[key]) return overrides[key]!;
    if (path === SETTINGS_PATH && (!init || !init.method)) {
      return jsonResponse({ retention_days: 365, options: OPTIONS });
    }
    if (path === SETTINGS_PATH && init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as { retention_days: number | null };
      return jsonResponse({ retention_days: body.retention_days, options: OPTIONS });
    }
    if (path === PURGE_PATH) {
      return jsonResponse({ deleted: 4 });
    }
    throw new Error(`Unexpected request ${key}`);
  });
}

describe("useActivityLogRetention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the current retention period", async () => {
    mockApi();

    const { result } = renderHook(() => useActivityLogRetention());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings?.retention_days).toBe(365);
    expect(result.current.settings?.options).toEqual(OPTIONS);
  });

  it.each([30, 90, 180, 365])("saves the %i-day option", async (days) => {
    mockApi();
    const { result } = renderHook(() => useActivityLogRetention());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.saveRetention(days);
    });

    const put = vi.mocked(fetchWithClerkAuth).mock.calls.find(([, , init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[2]?.body))).toEqual({ retention_days: days });
    expect(result.current.settings?.retention_days).toBe(days);
    expect(toast.success).toHaveBeenCalled();
  });

  it("saves keep-forever as null", async () => {
    mockApi();
    const { result } = renderHook(() => useActivityLogRetention());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.saveRetention(null);
    });

    const put = vi.mocked(fetchWithClerkAuth).mock.calls.find(([, , init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[2]?.body))).toEqual({ retention_days: null });
    expect(result.current.settings?.retention_days).toBeNull();
    expect(toast.success).toHaveBeenCalledWith("Activity logs will be kept forever.");
  });

  it.each([30, 90, 180, 365])("deletes logs older than %i days and refreshes the list", async (days) => {
    mockApi();
    const onPurged = vi.fn();
    const { result } = renderHook(() => useActivityLogRetention(onPurged));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.purgeOlderThan(days);
    });

    const post = vi.mocked(fetchWithClerkAuth).mock.calls.find(([path]) => path === PURGE_PATH);
    expect(post?.[2]?.method).toBe("POST");
    expect(JSON.parse(String(post?.[2]?.body))).toEqual({ older_than_days: days });
    expect(onPurged).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Deleted 4 activity log entries.");
  });

  it("reports a failed save and keeps the previous period", async () => {
    mockApi({
      [`PUT ${SETTINGS_PATH}`]: jsonResponse({ detail: "Retention must be one of 30, 90, 180 or 365 days." }, 400),
    });
    const { result } = renderHook(() => useActivityLogRetention());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.saveRetention(45);
    });

    expect(toast.error).toHaveBeenCalledWith("Retention must be one of 30, 90, 180 or 365 days.");
    expect(result.current.settings?.retention_days).toBe(365);
  });

  it("does not refresh the list when a delete fails", async () => {
    mockApi({
      [`POST ${PURGE_PATH}`]: jsonResponse({ detail: "Choose 30, 90, 180 or 365 days." }, 400),
    });
    const onPurged = vi.fn();
    const { result } = renderHook(() => useActivityLogRetention(onPurged));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.purgeOlderThan(7);
    });

    expect(onPurged).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Choose 30, 90, 180 or 365 days.");
  });
});
