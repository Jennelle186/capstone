import { describe, expect, it } from "vitest";

import { buildActivityLogQuery } from "@/hooks/useActivityLogsPage";

const EMPTY = { search: "", entityType: "all", action: "all", actorUserId: "all", dateFrom: "", dateTo: "" };

describe("buildActivityLogQuery", () => {
  it("paginates with skip and limit and omits empty filters", () => {
    const query = buildActivityLogQuery(EMPTY, 3, 25);
    const params = new URLSearchParams(query.split("?")[1]);

    expect(query.startsWith("/api/admin/activity-logs?")).toBe(true);
    expect(params.get("skip")).toBe("50");
    expect(params.get("limit")).toBe("25");
    expect(params.has("search")).toBe(false);
    expect(params.has("entity_type")).toBe(false);
    expect(params.has("action")).toBe(false);
    expect(params.has("actor_user_id")).toBe(false);
    expect(params.has("date_from")).toBe(false);
    expect(params.has("date_to")).toBe(false);
  });

  it("sends the selected action and admin", () => {
    const params = new URLSearchParams(
      buildActivityLogQuery(
        { ...EMPTY, action: "update", actorUserId: "3f2c8d1e-0000-4000-8000-000000000001" },
        1,
      ).split("?")[1],
    );

    expect(params.get("action")).toBe("update");
    expect(params.get("actor_user_id")).toBe("3f2c8d1e-0000-4000-8000-000000000001");
  });

  it("sends trimmed search and the selected module", () => {
    const params = new URLSearchParams(
      buildActivityLogQuery({ ...EMPTY, search: "  Jane  ", entityType: "adviser" }, 1).split("?")[1],
    );

    expect(params.get("search")).toBe("Jane");
    expect(params.get("entity_type")).toBe("adviser");
    expect(params.get("skip")).toBe("0");
  });

  it("converts date-only filters into a full local day range", () => {
    const params = new URLSearchParams(
      buildActivityLogQuery({ ...EMPTY, dateFrom: "2026-10-01", dateTo: "2026-10-31" }, 1).split("?")[1],
    );

    const from = new Date(params.get("date_from") ?? "");
    const to = new Date(params.get("date_to") ?? "");
    // Start of the first day and end of the last day, in local time.
    expect(from.getTime()).toBe(new Date("2026-10-01T00:00:00").getTime());
    expect(to.getTime()).toBe(new Date("2026-10-31T23:59:59.999").getTime());
  });
});
