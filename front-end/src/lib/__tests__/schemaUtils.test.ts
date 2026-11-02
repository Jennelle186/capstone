import { describe, expect, it } from "vitest";

import { fieldsMissingLabel, normalizeFieldKey } from "@/lib/schema-utils";

describe("fieldsMissingLabel", () => {
  it("returns no positions when every field has a label name", () => {
    expect(fieldsMissingLabel([{ key: "Units taken" }, { key: "extra_units" }])).toEqual([]);
  });

  it("flags blank and symbol-only label names by position", () => {
    expect(fieldsMissingLabel([{ key: "student_name" }, { key: "" }, { key: "   " }, { key: "@@" }])).toEqual([1, 2, 3]);
  });

  it("treats a label that normalises to nothing as missing", () => {
    expect(normalizeFieldKey("@@")).toBe("");
    expect(fieldsMissingLabel([{ key: "@@" }])).toEqual([0]);
  });
});
