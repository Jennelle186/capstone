import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDepartmentsPage } from "@/hooks/useDepartmentsPage";
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

const SCHOOL_YEAR_ID = "sy-1";

const departmentsPayload = [
  { id: "p1", code: "ACT", name: "Accountancy", is_active: true, student_count: 0, adviser_count: 1 },
  { id: "p2", code: "BSCS", name: "BS Computer Science", is_active: true, student_count: 0, adviser_count: 1 },
  { id: "p3", code: "BSIT", name: "BS Information Technology", is_active: false, student_count: 0, adviser_count: 1 },
];

const adviserPayload = [
  {
    id: "adv-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    department: "ACT",
    departments: ["ACT", "BSCS", "BSIT"],
    is_active: true,
  },
];

function mockAdminApi(patchResponse?: unknown) {
  vi.mocked(fetchWithClerkAuth).mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      return jsonResponse(patchResponse);
    }
    if (path.startsWith("/api/admin/school-years")) {
      return jsonResponse([{ id: SCHOOL_YEAR_ID, name: "2026-2027", is_active: true, status: "active" }]);
    }
    if (path.startsWith("/api/admin/departments/advisers")) {
      return jsonResponse(adviserPayload);
    }
    if (path.startsWith("/api/admin/departments")) {
      return jsonResponse(departmentsPayload);
    }
    return jsonResponse({ detail: "unexpected" }, 404);
  });
}

async function loadHook() {
  const hook = renderHook(() => useDepartmentsPage());
  await waitFor(() => expect(hook.result.current.isPageLoading).toBe(false));
  await waitFor(() => expect(hook.result.current.advisers).toHaveLength(1));
  return hook;
}

function patchCalls() {
  return vi
    .mocked(fetchWithClerkAuth)
    .mock.calls.filter(([, , init]) => (init as RequestInit | undefined)?.method === "PATCH");
}

describe("useDepartmentsPage handleUnassign", () => {
  beforeEach(() => {
    vi.mocked(fetchWithClerkAuth).mockReset();
  });

  it("removes only the clicked program and keeps the other assignments", async () => {
    mockAdminApi({
      id: "adv-1",
      department: "ACT",
      departments: ["ACT", "BSIT"],
      is_active: true,
    });
    const { result } = await loadHook();

    await act(async () => {
      await result.current.handleUnassign(result.current.advisers[0], "BSCS");
    });

    const [path, , init] = patchCalls()[0];
    expect(path).toBe("/api/admin/departments/advisers/adv-1/department");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      department_codes: ["ACT", "BSIT"],
      school_year_id: SCHOOL_YEAR_ID,
    });
    expect(result.current.advisers[0].departments).toEqual(["ACT", "BSIT"]);
  });

  it("keeps inactive held programs in the payload when removing an active one", async () => {
    mockAdminApi({
      id: "adv-1",
      department: "BSCS",
      departments: ["BSCS", "BSIT"],
      is_active: true,
    });
    const { result } = await loadHook();

    await act(async () => {
      await result.current.handleUnassign(result.current.advisers[0], "ACT");
    });

    const [, , init] = patchCalls()[0];
    expect(JSON.parse((init as RequestInit).body as string).department_codes).toEqual(["BSCS", "BSIT"]);
  });
});
