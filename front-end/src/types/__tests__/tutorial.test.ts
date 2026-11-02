import { describe, expect, it } from "vitest";

import {
  EMPTY_TUTORIAL_STATE,
  mergeTutorialState,
  readTutorialState,
} from "@/types/tutorial";

describe("readTutorialState", () => {
  it("returns the empty state when nothing is stored", () => {
    expect(readTutorialState(undefined)).toEqual(EMPTY_TUTORIAL_STATE);
    expect(readTutorialState(null)).toEqual(EMPTY_TUTORIAL_STATE);
    expect(readTutorialState("garbage")).toEqual(EMPTY_TUTORIAL_STATE);
  });

  it("ignores wrong types instead of trusting them", () => {
    const state = readTutorialState({ mainDone: "yes", checklistHidden: 1, seen: ["x"] });

    expect(state.mainDone).toBe(false);
    expect(state.checklistHidden).toBe(false);
    expect(state.seen).toEqual({});
  });

  it("keeps valid stored values", () => {
    const state = readTutorialState({ mainDone: true, welcomeSeen: true, seen: { "school-years": true } });

    expect(state.mainDone).toBe(true);
    expect(state.welcomeSeen).toBe(true);
    expect(state.seen).toEqual({ "school-years": true });
  });
});

describe("mergeTutorialState", () => {
  it("changes only the fields in the patch", () => {
    const current = { ...EMPTY_TUTORIAL_STATE, welcomeSeen: true };

    const next = mergeTutorialState(current, { mainDone: true });

    expect(next.mainDone).toBe(true);
    expect(next.welcomeSeen).toBe(true);
    expect(next.checklistHidden).toBe(false);
  });

  it("keeps other seen entries when one is added", () => {
    const current = { ...EMPTY_TUTORIAL_STATE, seen: { advisers: true } };

    const next = mergeTutorialState(current, { seen: { "school-years": true } });

    expect(next.seen).toEqual({ advisers: true, "school-years": true });
  });

  it("replaces the seen list when resetSeen is set", () => {
    const current = { ...EMPTY_TUTORIAL_STATE, seen: { advisers: true, departments: true } };

    const next = mergeTutorialState(current, { seen: {}, resetSeen: true, mainDone: false });

    expect(next.seen).toEqual({});
    expect(next.mainDone).toBe(false);
  });

  it("does not mutate the previous state", () => {
    const current = { ...EMPTY_TUTORIAL_STATE, seen: { advisers: true } };

    mergeTutorialState(current, { seen: { departments: true }, mainDone: true });

    expect(current.seen).toEqual({ advisers: true });
    expect(current.mainDone).toBe(false);
  });
});
