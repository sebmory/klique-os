import { describe, expect, it, vi } from "vitest";
import * as route from "@/app/api/public/klique-stats/route";
import { createPublicKliqueStatsHandlers } from "@/app/api/public/klique-stats/route";
import { isPublicKliqueStatsApi } from "@/proxy";

const url = "http://localhost/api/public/klique-stats";

describe("Public KLIQUE stats API", () => {
  it("returns only the four aggregate counters with public caching", async () => {
    const response = await createPublicKliqueStatsHandlers({
      loadStats: vi.fn().mockResolvedValue({
        athleteCount: 12,
        partnerExpertCount: 8,
        sportCount: 5,
        creativeCount: 4,
        contactEmail: "private@example.com",
      }),
    }).GET(new Request(url));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      athleteCount: 12,
      partnerExpertCount: 8,
      sportCount: 5,
      creativeCount: 4,
    });
    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=900, stale-while-revalidate=3600");
  });

  it.each([
    { athleteCount: 1, partnerExpertCount: 2, sportCount: 3, creativeCount: -1 },
    { athleteCount: 1, partnerExpertCount: 2, sportCount: 3, creativeCount: 1.5 },
  ])("rejects invalid aggregate values without exposing them %#", async (stats) => {
    const response = await createPublicKliqueStatsHandlers({
      loadStats: vi.fn().mockResolvedValue(stats),
    }).GET(new Request(url));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Une erreur interne est survenue.",
    });
  });

  it("rejects query parameters and non-GET calls before loading data", async () => {
    const loadStats = vi.fn();
    const handlers = createPublicKliqueStatsHandlers({ loadStats });

    const invalidQuery = await handlers.GET(new Request(`${url}?detail=true`));
    expect(invalidQuery.status).toBe(400);

    const invalidMethod = await handlers.GET(new Request(url, { method: "POST" }));
    expect(invalidMethod.status).toBe(405);
    expect(invalidMethod.headers.get("Allow")).toBe("GET");
    expect(loadStats).not.toHaveBeenCalled();
  });

  it("keeps failures private and exports no write method", async () => {
    const response = await createPublicKliqueStatsHandlers({
      loadStats: vi.fn().mockRejectedValue(new Error("private sheet detail")),
    }).GET(new Request(url));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Une erreur interne est survenue." });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(await createPublicKliqueStatsHandlers({
      loadStats: vi.fn().mockResolvedValue({
        athleteCount: 1,
        partnerExpertCount: 2,
        sportCount: 3,
        creativeCount: 0,
      }),
    }).GET(new Request(url)).then((result) => result.json()))).not.toMatch(/name|email|row|athleteId|partnerId/i);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isPublicKliqueStatsApi("/api/public/klique-stats", method)).toBe(false);
      expect(method in route).toBe(false);
    }
    expect(isPublicKliqueStatsApi("/api/public/klique-stats", "GET")).toBe(true);
    expect(isPublicKliqueStatsApi("/api/public/klique-stats/details", "GET")).toBe(false);
  });
});