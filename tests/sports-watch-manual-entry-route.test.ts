import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  create: vi.fn(),
  errorStatus: vi.fn(),
}));

vi.mock("@/lib/sports-watch/activation", () => ({
  isSportsWatchEnabled: () => true,
}));

vi.mock("@/lib/sports-watch/service", () => ({
  requireSportsWatchAdmin: mocks.requireAdmin,
  sportsWatchErrorStatus: mocks.errorStatus,
}));

vi.mock("@/lib/sports-watch/manual-entry-service", () => ({
  SportsWatchManualEntryConflictError: class SportsWatchManualEntryConflictError extends Error {
    constructor(
      message: string,
      public readonly duplicates: unknown[],
    ) {
      super(message);
    }
  },
  SportsWatchManualEntryService: {
    create: mocks.create,
  },
}));

import { POST } from "@/app/api/admin/sports-watch/manual-entry/route";
import { SportsWatchManualEntryConflictError } from "@/lib/sports-watch/manual-entry-service";

const request = () => new Request(
  "http://localhost/api/admin/sports-watch/manual-entry",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ athleteId: "athlete-a" }),
  },
);

describe("sports watch manual entry route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.errorStatus.mockReturnValue(400);
  });

  it("refuses a non-Admin before creating a candidate", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("Accès Admin requis."));
    mocks.errorStatus.mockReturnValueOnce(403);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "manual_entry_failed" },
    });
  });

  it("passes the server-resolved workspace identity and returns creation status", async () => {
    const identity = { workspaceId: "workspace-a", clerkUserId: "admin-a" };
    const candidate = { id: "candidate-a", adminStatus: "pending" };
    mocks.requireAdmin.mockResolvedValueOnce(identity);
    mocks.create.mockResolvedValueOnce({ candidate, created: true });

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ athleteId: "athlete-a" }, identity);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      candidate,
      created: true,
    });
  });

  it("returns an explicit rapprochement instead of silently merging", async () => {
    const duplicates = [{
      candidateId: "candidate-existing",
      sourceName: "SAFV",
      title: "Match existant",
      eventDate: "2026-11-12",
      articleUrl: "https://example.com/match",
      reason: "Même athlète, même date et même adversaire.",
    }];
    mocks.requireAdmin.mockResolvedValueOnce({
      workspaceId: "workspace-a",
      clerkUserId: "admin-a",
    });
    mocks.errorStatus.mockReturnValueOnce(409);
    mocks.create.mockRejectedValueOnce(
      new SportsWatchManualEntryConflictError("Rapprochement requis.", duplicates),
    );

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "potential_duplicate",
        message: "Rapprochement requis.",
        duplicates,
      },
    });
  });
});
