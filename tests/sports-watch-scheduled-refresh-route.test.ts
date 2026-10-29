import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sportsWatchEnabled: vi.fn(() => true),
  scheduledEnabled: vi.fn(() => true),
  schedule: vi.fn(async () => []),
  work: vi.fn(async () => ({ status: "idle" })),
  finalize: vi.fn(async () => 0),
}));

vi.mock("@/lib/sports-watch/activation", () => ({
  isSportsWatchEnabled: mocks.sportsWatchEnabled,
  isScheduledSportsWatchRefreshEnabled: mocks.scheduledEnabled,
}));

vi.mock("@/lib/sports-watch/scheduled-refresh", () => ({
  ScheduledSportsWatchRefresh: {
    schedule: mocks.schedule,
    work: mocks.work,
    finalize: mocks.finalize,
  },
}));

import { GET } from "@/app/api/internal/sports-watch-refresh/route";

describe("scheduled sports watch refresh route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.sportsWatchEnabled.mockReturnValue(true);
    mocks.scheduledEnabled.mockReturnValue(true);
  });

  it("rejects anonymous requests", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const response = await GET(new Request(
      "http://localhost/api/internal/sports-watch-refresh?mode=work",
    ));
    expect(response.status).toBe(401);
    expect(mocks.work).not.toHaveBeenCalled();
  });

  it.each([
    ["an absent configured secret", "", "Bearer supplied-secret"],
    ["an incorrect supplied secret", "cron-secret", "Bearer incorrect-secret"],
  ])("rejects %s", async (_label, configuredSecret, authorization) => {
    vi.stubEnv("CRON_SECRET", configuredSecret);
    const response = await GET(new Request(
      "http://localhost/api/internal/sports-watch-refresh?mode=work",
      { headers: { authorization } },
    ));

    expect(response.status).toBe(401);
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.work).not.toHaveBeenCalled();
  });

  it("has no effect until explicit activation", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.scheduledEnabled.mockReturnValue(false);
    const response = await GET(new Request(
      "http://localhost/api/internal/sports-watch-refresh?mode=work",
      { headers: { authorization: "Bearer cron-secret" } },
    ));
    expect(response.status).toBe(204);
    expect(mocks.work).not.toHaveBeenCalled();
  });

  it("uses the first worker slot as a durable scheduler fallback", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const response = await GET(new Request(
      "http://localhost/api/internal/sports-watch-refresh?mode=work&slot=01",
      { headers: { authorization: "Bearer cron-secret" } },
    ));
    expect(response.status).toBe(200);
    expect(mocks.schedule).toHaveBeenCalledOnce();
    expect(mocks.work).toHaveBeenCalledOnce();
  });
});
