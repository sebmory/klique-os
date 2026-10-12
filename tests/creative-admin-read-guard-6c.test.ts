import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  clerkClientMock,
  createContentStorageClientMock,
  queryMock,
  sqlMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  clerkClientMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  queryMock: vi.fn(),
  sqlMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}));
vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
}));

import { GET as getCreativeAssignments } from "@/app/api/admin/athlete-service-creative-assignments/route";
import { GET as getMissions } from "@/app/api/admin/athlete-service-missions/route";

const requestId = "11111111-1111-4111-8111-111111111111";
const assignmentsRequest = () => new Request(
  `http://localhost/api/admin/athlete-service-creative-assignments?requestId=${requestId}`,
  { headers: { "x-workspace-id": "workspace-client" } },
);
const missionsRequest = () => new Request(
  `http://localhost/api/admin/athlete-service-missions?requestId=${requestId}`,
  { headers: { "x-workspace-id": "workspace-client" } },
);

describe("6C Admin read guard", () => {
  let accessRow: Record<string, unknown> | null;

  beforeEach(() => {
    vi.resetAllMocks();
    accessRow = {
      role: "admin",
      status: "active",
      workspace_id: "workspace-server",
    };
    Object.assign(sqlMock, { query: queryMock });
    createContentStorageClientMock.mockReturnValue(sqlMock);
    queryMock.mockResolvedValue([]);
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ").toLowerCase();
      if (query.includes("from user_access")) {
        return accessRow ? [accessRow] : [];
      }
      return [];
    });
  });

  it("serves both GET routes from auth() and local user_access while remote Clerk is unavailable", async () => {
    authMock.mockResolvedValue({ userId: "user-admin" });
    clerkClientMock.mockRejectedValue(new Error("Clerk unavailable"));

    const [assignments, missions] = await Promise.all([
      getCreativeAssignments(assignmentsRequest()),
      getMissions(missionsRequest()),
    ]);

    expect(assignments.status).toBe(200);
    expect(missions.status).toBe(200);
    await expect(assignments.json()).resolves.toEqual({
      creatives: [],
      assignments: [],
    });
    await expect(missions.json()).resolves.toEqual({ records: [] });
    expect(clerkClientMock).not.toHaveBeenCalled();

    const guardValues = sqlMock.mock.calls.flatMap((call) => call.slice(1));
    const repositoryValues = queryMock.mock.calls.flatMap((call) => (
      Array.isArray(call[1]) ? call[1] : []
    ));
    expect(guardValues).toContain("user-admin");
    expect(repositoryValues).toContain("workspace-server");
    expect(repositoryValues).not.toContain("workspace-client");
  });

  it("returns 401 from both GET routes when auth() has no session", async () => {
    authMock.mockResolvedValue({ userId: null });

    const [assignments, missions] = await Promise.all([
      getCreativeAssignments(assignmentsRequest()),
      getMissions(missionsRequest()),
    ]);

    expect(assignments.status).toBe(401);
    expect(missions.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
    expect(clerkClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing access", null],
    ["inactive access", { role: "admin", status: "disabled", workspace_id: "workspace-server" }],
    ["wrong role", { role: "athlete", status: "active", workspace_id: "workspace-server" }],
  ])("returns 403 from both GET routes for %s", async (_label, row) => {
    authMock.mockResolvedValue({ userId: "user-without-admin-access" });
    accessRow = row;

    const [assignments, missions] = await Promise.all([
      getCreativeAssignments(assignmentsRequest()),
      getMissions(missionsRequest()),
    ]);

    expect(assignments.status).toBe(403);
    expect(missions.status).toBe(403);
    expect(clerkClientMock).not.toHaveBeenCalled();
  });
});
