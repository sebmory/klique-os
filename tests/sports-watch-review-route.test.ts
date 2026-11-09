import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  review: vi.fn(),
}));

vi.mock("@/lib/sports-watch/activation", () => ({
  isSportsWatchEnabled: () => true,
}));

vi.mock("@/lib/sports-watch/service", () => ({
  requireSportsWatchAdmin: mocks.requireAdmin,
  sportsWatchErrorStatus: () => 403,
  SportsWatchService: {
    review: mocks.review,
  },
}));

import { PATCH } from "@/app/api/admin/sports-watch/[candidateId]/route";

const candidateId = "11111111-1111-4111-8111-111111111111";
const request = () => new Request(
  `http://localhost/api/admin/sports-watch/${candidateId}`,
  {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "dismissed", version: 2 }),
  },
);
const context = { params: Promise.resolve({ candidateId }) };

describe("sports watch review route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a non-Admin before invoking the transition", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("Accès Admin requis."));

    const response = await PATCH(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.review).not.toHaveBeenCalled();
  });

  it("passes the resolved Admin workspace identity to the transition service", async () => {
    const identity = { workspaceId: "workspace-a", clerkUserId: "admin-a" };
    const candidate = { id: candidateId, adminStatus: "dismissed", version: 3 };
    mocks.requireAdmin.mockResolvedValueOnce(identity);
    mocks.review.mockResolvedValueOnce(candidate);

    const response = await PATCH(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.review).toHaveBeenCalledWith(
      candidateId,
      "dismissed",
      2,
      identity,
    );
    await expect(response.json()).resolves.toMatchObject({ ok: true, candidate });
  });
});
