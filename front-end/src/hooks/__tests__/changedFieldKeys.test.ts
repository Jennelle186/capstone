import { describe, expect, it } from "vitest";

import { changedFieldKeys } from "@/hooks/useActivityLogsPage";

describe("changedFieldKeys", () => {
  it("lists only keys whose values differ", () => {
    const keys = changedFieldKeys({
      previous_values: { id: "a", name: "2027-2028", status: "closed" },
      new_values: { id: "a", name: "2027-2028", status: "upcoming" },
    });

    expect(keys).toEqual(["status"]);
  });

  it("returns nothing when every value is unchanged", () => {
    const keys = changedFieldKeys({
      previous_values: { name: "2027-2028", end_date: "2028-05-16" },
      new_values: { name: "2027-2028", end_date: "2028-05-16" },
    });

    expect(keys).toEqual([]);
  });

  it("treats a key present on only one side as changed", () => {
    const keys = changedFieldKeys({
      previous_values: { logo_file_key: "old.png" },
      new_values: { logo_file_key: "new.png", logo_content_type: "image/png" },
    });

    expect(keys.sort()).toEqual(["logo_content_type", "logo_file_key"]);
  });

  it("compares nested values by content", () => {
    const keys = changedFieldKeys({
      previous_values: { departments: ["BSCS", "BSIT"] },
      new_values: { departments: ["BSCS", "BSIT"] },
    });

    expect(keys).toEqual([]);
  });

  it("detects a nested value that changed", () => {
    const keys = changedFieldKeys({
      previous_values: { departments: ["BSCS"] },
      new_values: { departments: ["BSCS", "BSIT"] },
    });

    expect(keys).toEqual(["departments"]);
  });

  it("handles entries with no values at all", () => {
    expect(changedFieldKeys({ previous_values: null, new_values: null })).toEqual([]);
  });
});
