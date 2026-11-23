import { describe, expect, it } from "vitest";
import { flagDetails } from "@/lib/flag-details";

describe("flagDetails", () => {
  it("uses the adviser's comment when the adviser flagged the file", () => {
    expect(flagDetails({ rejection_reason: "Name is blurred", classification_result: { flag: "low_confidence" } })).toEqual({
      fromAdviser: true,
      message: "Name is blurred",
    });
  });

  it("explains an automatic flag in plain words, and never calls it an adviser flag", () => {
    const details = flagDetails({ rejection_reason: null, classification_result: { flag: "not_a_required_document" } });
    expect(details.fromAdviser).toBe(false);
    expect(details.message).toContain("could not be matched");
  });

  it("falls back to a generic message for an unknown automatic code", () => {
    expect(flagDetails({ classification_result: { flag: "something_new" } }).fromAdviser).toBe(false);
    expect(flagDetails({ classification_result: null }).message).toContain("could not be checked automatically");
  });

  it("treats a blank comment as no adviser comment", () => {
    expect(flagDetails({ rejection_reason: "   " }).fromAdviser).toBe(false);
  });
});
