import { describe, expect, it } from "vitest";

import { MODULE_KEY_BY_PATH, TOURS, moduleKeyForPath } from "@/components/tutorial/tourContent";

// Read every source file as text, so the test checks the real attributes without rendering pages.
const sources = Object.values(
  import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
).join("\n");

describe("tour content", () => {
  it("every tour step target exists as a data-tour attribute in the source", () => {
    const missing: string[] = [];
    for (const tour of Object.values(TOURS)) {
      for (const step of tour.steps) {
        if (step.target && !sources.includes(`data-tour="${step.target}"`)) {
          missing.push(`${tour.moduleKey}:${step.id} -> ${step.target}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("every route maps to a tour that exists", () => {
    for (const [path, key] of Object.entries(MODULE_KEY_BY_PATH)) {
      expect(TOURS[key], `missing tour for ${path}`).toBeDefined();
    }
  });

  it("each tour has between 2 and 16 steps with unique step ids", () => {
    // The Schema Builder is detailed on purpose (16 entries, including the 3a/3b/3c variants); other tours stay short.
    for (const tour of Object.values(TOURS)) {
      expect(tour.steps.length).toBeGreaterThanOrEqual(2);
      expect(tour.steps.length).toBeLessThanOrEqual(16);
      const ids = tour.steps.map((step) => step.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("returns null for a page with no tour", () => {
    expect(moduleKeyForPath("/admin")).toBeNull();
    expect(moduleKeyForPath("/admin/advisers")).toBe("advisers");
  });
});
