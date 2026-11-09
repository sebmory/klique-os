import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  dashboard: vi.fn(),
  listPage: vi.fn(),
  listSwissBindings: vi.fn(),
  listIwwfBindings: vi.fn(),
  listSafvBindings: vi.fn(),
  listBeBasketBindings: vi.fn(),
  listSwissBasketballBindings: vi.fn(),
  latestRefresh: vi.fn(),
  errorStatus: vi.fn(),
}));

vi.mock("@/lib/sports-watch/activation", () => ({
  isSportsWatchEnabled: () => true,
  isScheduledSportsWatchRefreshEnabled: () => true,
}));

vi.mock("@/lib/sports-watch/service", () => ({
  requireSportsWatchAdmin: mocks.requireAdmin,
  sportsWatchErrorStatus: mocks.errorStatus,
  SportsWatchService: {
    dashboard: mocks.dashboard,
    listPage: mocks.listPage,
    listSwissBindings: mocks.listSwissBindings,
    listIwwfBindings: mocks.listIwwfBindings,
    listSafvBindings: mocks.listSafvBindings,
    listBeBasketBindings: mocks.listBeBasketBindings,
    listSwissBasketballBindings: mocks.listSwissBasketballBindings,
  },
}));

vi.mock("@/lib/sports-watch/refresh-repository", () => ({
  PostgresSportsWatchRefreshRepository: {
    getLatestBatch: mocks.latestRefresh,
  },
}));

import { GET } from "@/app/api/admin/sports-watch/route";

const identity = {
  workspaceId: "workspace-a",
  clerkUserId: "user-admin",
};

const emptyPage = (group: "pending" | "validated" | "history") => ({
  group,
  items: [],
  nextCursor: null,
  hasMore: false,
  limit: 20,
});

describe("sports watch pagination route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(identity);
    mocks.errorStatus.mockReturnValue(500);
    mocks.dashboard.mockResolvedValue({
      pages: {
        pending: emptyPage("pending"),
        validated: emptyPage("validated"),
        history: emptyPage("history"),
      },
      totals: {
        pending: 54,
        validated: 6,
        exploited: 2,
        rejected: 0,
        dismissed: 0,
        superseded: 0,
        supersededPending: 0,
        supersededValidated: 0,
      },
      athleteTotals: [],
    });
    mocks.listPage.mockResolvedValue(emptyPage("validated"));
    mocks.listSwissBindings.mockResolvedValue([]);
    mocks.listIwwfBindings.mockResolvedValue([]);
    mocks.listSafvBindings.mockResolvedValue([]);
    mocks.listBeBasketBindings.mockResolvedValue([]);
    mocks.listSwissBasketballBindings.mockResolvedValue([]);
    mocks.latestRefresh.mockResolvedValue(null);
  });

  it("returns independent bootstrap pages and global totals", async () => {
    const response = await GET(new Request("http://localhost/api/admin/sports-watch"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.candidateDashboard.totals).toMatchObject({
      pending: 54,
      validated: 6,
      exploited: 2,
    });
    expect(payload.candidates).toEqual([]);
    expect(mocks.dashboard).toHaveBeenCalledWith(identity, null);
    expect(mocks.listPage).not.toHaveBeenCalled();
  });

  it("loads only the requested group page", async () => {
    const response = await GET(new Request(
      "http://localhost/api/admin/sports-watch?group=validated&cursor=opaque&limit=10",
    ));

    expect(response.status).toBe(200);
    expect(mocks.listPage).toHaveBeenCalledWith(
      "validated",
      "opaque",
      "10",
      identity,
    );
    expect(mocks.dashboard).not.toHaveBeenCalled();
    expect(mocks.listSwissBindings).not.toHaveBeenCalled();
  });

  it("rejects unknown, repeated, or incomplete parameters", async () => {
    const unknown = await GET(new Request(
      "http://localhost/api/admin/sports-watch?status=validated",
    ));
    const repeated = await GET(new Request(
      "http://localhost/api/admin/sports-watch?group=pending&group=validated",
    ));
    const orphanCursor = await GET(new Request(
      "http://localhost/api/admin/sports-watch?cursor=opaque",
    ));

    expect(unknown.status).toBe(400);
    expect(repeated.status).toBe(400);
    expect(orphanCursor.status).toBe(400);
    expect(mocks.dashboard).not.toHaveBeenCalled();
    expect(mocks.listPage).not.toHaveBeenCalled();
  });

  it("refuses a request when the Admin session is not active", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("Un accès Admin actif est requis."));
    mocks.errorStatus.mockReturnValueOnce(403);

    const response = await GET(new Request("http://localhost/api/admin/sports-watch"));

    expect(response.status).toBe(403);
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
});
