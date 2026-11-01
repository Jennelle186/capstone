import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FALLBACK_BRANDING, usePublicBranding } from "@/hooks/usePublicBranding";

describe("usePublicBranding fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the College of Computing Studies name when the branding request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { result } = renderHook(() => usePublicBranding());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.branding.institution_name).toBe("College of Computing Studies");
    expect(FALLBACK_BRANDING.institution_name).toBe("College of Computing Studies");
  });
});
