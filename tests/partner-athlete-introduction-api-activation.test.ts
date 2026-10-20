import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  createService: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: mocks.access,
}));

vi.mock("@/lib/partner-athlete-introductions/service", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/partner-athlete-introductions/service")
  >();
  return { ...original, createPartnerAthleteIntroductionService: mocks.createService };
});

import { GET } from "@/app/api/athlete/partner-contact-requests/route";
import { GET as GET_ADMIN } from "@/app/api/admin/partner-introductions/route";

describe("athlete introduction API activation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("returns an empty disabled projection without identity or schema access", async () => {
    vi.stubEnv("KLIQUE_PARTNER_ATHLETE_INTRODUCTIONS_ENABLED", "false");

    const response = await GET(new Request("http://localhost/api/athlete/partner-contact-requests"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      workflowEnabled: false,
      contactRequests: [],
    });
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.createService).not.toHaveBeenCalled();
  });

  it("keeps the Admin cockpit disabled without identity or schema access", async () => {
    vi.stubEnv("KLIQUE_PARTNER_ATHLETE_INTRODUCTIONS_ENABLED", "false");

    const response = await GET_ADMIN(new Request("http://localhost/api/admin/partner-introductions"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      workflowEnabled: false,
      items: [],
      counters: {},
    });
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.createService).not.toHaveBeenCalled();
  });
});
