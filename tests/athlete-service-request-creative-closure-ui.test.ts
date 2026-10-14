import { describe, expect, it } from "vitest";
import { getCommercialCompletionSurface } from "@/components/crm/AthleteServiceRequestsCrmSection";

describe("creative workflow commercial completion surface", () => {
  it("neutralizes generic completion when a creative workflow exists", () => {
    expect(getCommercialCompletionSurface("in_progress", true)).toBe("creative_review");
  });

  it("keeps generic completion for a request without a creative workflow", () => {
    expect(getCommercialCompletionSurface("in_progress", false)).toBe("generic");
  });

  it("fails closed while workflow presence is still loading", () => {
    expect(getCommercialCompletionSurface("in_progress", undefined)).toBe("checking");
    expect(getCommercialCompletionSurface("completed", false)).toBe("hidden");
  });
});
