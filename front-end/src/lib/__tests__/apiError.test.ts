import { describe, expect, it } from "vitest";

import { messageFromErrorDetail, readApiErrorMessage } from "@/lib/apiError";

describe("messageFromErrorDetail", () => {
  it("returns a string detail as-is", () => {
    expect(messageFromErrorDetail("Not allowed.", "fallback")).toBe("Not allowed.");
  });

  it("joins validation messages from a 422 detail array", () => {
    const detail = [
      { loc: ["query", "search"], msg: "String should have at most 200 characters", type: "string_too_long" },
      { loc: ["query", "limit"], msg: "Input should be less than or equal to 100", type: "less_than_equal" },
    ];
    expect(messageFromErrorDetail(detail, "fallback")).toBe(
      "String should have at most 200 characters Input should be less than or equal to 100",
    );
  });

  it("uses the fallback for empty or unknown details", () => {
    expect(messageFromErrorDetail("   ", "fallback")).toBe("fallback");
    expect(messageFromErrorDetail(undefined, "fallback")).toBe("fallback");
    expect(messageFromErrorDetail([{ foo: 1 }], "fallback")).toBe("fallback");
  });
});

describe("readApiErrorMessage", () => {
  it("reads the detail from a JSON error body", async () => {
    const response = new Response(JSON.stringify({ detail: "Forbidden." }), { status: 403 });
    await expect(readApiErrorMessage(response)).resolves.toBe("Forbidden.");
  });

  it("falls back to the status for non-JSON bodies", async () => {
    const response = new Response("oops", { status: 500 });
    await expect(readApiErrorMessage(response)).resolves.toBe("Request failed with status 500.");
  });
});
