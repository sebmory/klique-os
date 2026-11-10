import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  errorStatus: vi.fn(),
  list: vi.fn(),
  discover: vi.fn(),
  saveBinding: vi.fn(),
  disableBinding: vi.fn(),
  decideReconciliation: vi.fn(),
}));

vi.mock("@/lib/sports-watch/activation", () => ({
  isSportsWatchEnabled: () => true,
}));

vi.mock("@/lib/sports-watch/service", () => ({
  requireSportsWatchAdmin: mocks.requireAdmin,
  sportsWatchErrorStatus: mocks.errorStatus,
}));

vi.mock("@/lib/sports-watch/football-public-service", () => ({
  FootballPublicService: {
    list: mocks.list,
    discover: mocks.discover,
    saveBinding: mocks.saveBinding,
    disableBinding: mocks.disableBinding,
    decideReconciliation: mocks.decideReconciliation,
  },
}));

import {
  GET,
  POST,
  PUT,
} from "@/app/api/admin/sports-watch/football-bindings/route";
import { PUT as PUT_RECONCILIATION } from "@/app/api/admin/sports-watch/football-reconciliations/[reconciliationId]/route";

const request = (method: string, body?: unknown) => new Request(
  "http://localhost/api/admin/sports-watch/football-bindings",
  {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  },
);

describe("public football pilot routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.errorStatus.mockReturnValue(400);
  });

  it("refuses a non-Admin before reading or mutating a binding", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Accès Admin requis."));
    mocks.errorStatus.mockReturnValue(403);

    expect((await GET(request("GET"))).status).toBe(403);
    expect((await POST(request("POST", { athleteId: "a", teamId: "xh89ete5" }))).status)
      .toBe(403);
    expect((await PUT(request("PUT", { athleteId: "a" }))).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.discover).not.toHaveBeenCalled();
    expect(mocks.saveBinding).not.toHaveBeenCalled();
  });

  it("passes the server workspace identity to discovery and confirmation", async () => {
    const identity = { workspaceId: "workspace-a", clerkUserId: "admin-a" };
    const discovery = { footstatsTeamId: "xh89ete5", players: [] };
    const binding = { id: "binding-a", status: "verified" };
    mocks.requireAdmin.mockResolvedValue(identity);
    mocks.discover.mockResolvedValue(discovery);
    mocks.saveBinding.mockResolvedValue(binding);

    const discoveryResponse = await POST(request("POST", {
      athleteId: "matheus",
      teamId: "xh89ete5",
    }));
    const bindingResponse = await PUT(request("PUT", {
      athleteId: "matheus",
      teamId: "xh89ete5",
      status: "verified",
    }));

    expect(discoveryResponse.status).toBe(200);
    expect(bindingResponse.status).toBe(200);
    expect(mocks.discover).toHaveBeenCalledWith("matheus", "xh89ete5", identity);
    expect(mocks.saveBinding).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: "matheus", status: "verified" }),
      identity,
    );
  });

  it("records reconciliation decisions only after Admin authorization", async () => {
    const identity = { workspaceId: "workspace-a", clerkUserId: "admin-a" };
    mocks.requireAdmin.mockResolvedValue(identity);
    mocks.decideReconciliation.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      decision: "keep_manual",
    });
    const response = await PUT_RECONCILIATION(
      request("PUT", { decision: "keep_manual", expectedVersion: 1 }),
      {
        params: Promise.resolve({
          reconciliationId: "00000000-0000-4000-8000-000000000001",
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(mocks.decideReconciliation).toHaveBeenCalledWith({
      reconciliationId: "00000000-0000-4000-8000-000000000001",
      decision: "keep_manual",
      expectedVersion: 1,
    }, identity);
  });
});
