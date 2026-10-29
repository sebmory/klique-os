import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildPrefill: vi.fn(),
  requireAdmin: vi.fn(),
  errorStatus: vi.fn(),
}));

vi.mock("@/lib/sports-watch/activation", () => ({
  isSportsWatchEnabled: () => true,
}));

vi.mock("@/lib/sports-watch/service", () => ({
  SportsWatchService: {
    buildArticlePrefillFromSelection: mocks.buildPrefill,
  },
  requireSportsWatchAdmin: mocks.requireAdmin,
  sportsWatchErrorStatus: mocks.errorStatus,
}));

import { POST } from "@/app/api/admin/sports-watch/article-prefill/route";

const candidateIds = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
];

const prefill = {
  candidateId: candidateIds[0],
  candidateIds,
  athleteId: "athlete-a",
  athleteIds: ["athlete-a"],
  verificationStatus: "unverified",
  materials: [],
  potentialDuplicates: [{
    id: candidateIds.join(":"),
    reason: "Même match potentiel.",
    candidates: candidateIds.map((id, index) => ({
      id,
      athleteName: "Athlète A",
      sourceName: index === 0 ? "BeBasket" : "Swiss Basketball",
      articleUrl: `https://example.test/${index}`,
      title: "Lions 80–70 Bears",
      eventDateFrom: "2026-10-20",
    })),
  }],
};

describe("sports watch multi-result Article route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      workspaceId: "workspace-a",
      clerkUserId: "admin-a",
    });
    mocks.buildPrefill.mockResolvedValue(prefill);
    mocks.errorStatus.mockReturnValue(400);
  });

  it("sends only candidate IDs to the workspace-scoped service and reports duplicates", async () => {
    const response = await POST(new Request(
      "http://localhost/api/admin/sports-watch/article-prefill",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds }),
      },
    ));

    expect(response.status).toBe(409);
    expect(mocks.buildPrefill).toHaveBeenCalledWith(candidateIds, {
      workspaceId: "workspace-a",
      clerkUserId: "admin-a",
    });
    expect(await response.json()).toMatchObject({
      ok: false,
      prefill: { potentialDuplicates: prefill.potentialDuplicates },
    });
  });

  it("accepts explicit distinct-event confirmation without changing the ID-only body", async () => {
    const response = await POST(new Request(
      "http://localhost/api/admin/sports-watch/article-prefill?confirmDistinct=true",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds }),
      },
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, prefill });
  });
});
