import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  list: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/lib/sports-watch/activation", () => ({
  isSportsWatchEnabled: () => false,
}));

vi.mock("@/lib/sports-watch/service", () => ({
  requireSportsWatchAdmin: mocks.requireAdmin,
  sportsWatchErrorStatus: vi.fn(),
  SportsWatchService: {
    list: mocks.list,
    run: mocks.run,
  },
}));

import { GET, POST } from "@/app/api/admin/sports-watch/route";

describe("disabled sports watch routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns before Admin resolution or repository-backed service access", async () => {
    const getResponse = await GET(new Request("http://localhost/api/admin/sports-watch"));
    const postResponse = await POST(new Request("http://localhost/api/admin/sports-watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId: "athlete-1" }),
    }));

    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
