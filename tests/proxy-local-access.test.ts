import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  clerkClientMock,
  createContentStorageClientMock,
  sqlMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  clerkClientMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  sqlMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
  clerkMiddleware: vi.fn((handler) => handler),
  createRouteMatcher: vi.fn(() => () => false),
}));
vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: vi.fn(() => "workspace-server"),
}));
vi.mock("@/lib/google-sheets", () => ({
  getAthletesFromGoogleSheets: vi.fn(async () => []),
  getPartnersFromGoogleSheets: vi.fn(async () => []),
  getMediaFromGoogleSheets: vi.fn(async () => []),
}));

import { GET as getClerkAccess } from "@/app/api/clerk/access/route";
import { handleKliqueProxyRequest } from "@/proxy";

type AccessRow = {
  clerk_user_id: string;
  email: string;
  role: "admin" | "athlete" | "partner_expert" | "media";
  workspace_id: string;
  athlete_id: string | null;
  partner_id: string | null;
  media_id: string | null;
  status: "active" | "disabled";
  created_at: string;
  updated_at: string;
};

const baseAccessRow = {
  clerk_user_id: "user-local",
  email: "local@example.com",
  workspace_id: "workspace-server",
  athlete_id: null,
  partner_id: null,
  media_id: null,
  status: "active" as const,
  created_at: "2026-10-12T08:00:00.000Z",
  updated_at: "2026-10-12T08:00:00.000Z",
};

const activeCreativeRow = {
  id: "11111111-1111-4111-8111-111111111111",
  workspace_id: "workspace-server",
  creative_profile_id: "22222222-2222-4222-8222-222222222222",
  clerk_user_id: "user-local",
  status: "active",
  invitation_email: "local@example.com",
  invited_by_clerk_user_id: "admin-1",
  invited_at: "2026-10-12T07:30:00.000Z",
  activated_at: "2026-10-12T08:00:00.000Z",
  revoked_at: null,
  created_at: "2026-10-12T08:00:00.000Z",
  updated_at: "2026-10-12T08:00:00.000Z",
  creative_display_name: "Local Creative",
  creative_profile_status: "active",
};

const request = (pathname: string) => new NextRequest(`http://localhost${pathname}`, {
  headers: { "x-workspace-id": "workspace-client" },
});

const expectAllowed = (response: Response) => {
  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(response.headers.get("location")).toBeNull();
};

describe("proxy local-first access", () => {
  let accessRow: AccessRow | null;
  let creativeRow: typeof activeCreativeRow | null;
  const protect = vi.fn(async () => undefined);
  const makeAuth = (userId: string | null = "user-local") => Object.assign(
    vi.fn(async () => ({ userId })),
    { protect },
  );

  beforeEach(() => {
    vi.resetAllMocks();
    accessRow = { ...baseAccessRow, role: "admin" };
    creativeRow = null;
    authMock.mockResolvedValue({ userId: "user-local" });
    clerkClientMock.mockRejectedValue(new Error("Clerk remote unavailable"));
    createContentStorageClientMock.mockReturnValue(sqlMock);
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ").toLowerCase();
      if (query.includes("from user_access") && query.includes("where clerk_user_id")) {
        return accessRow ? [accessRow] : [];
      }
      if (query.includes("from creative_access ca")) {
        return creativeRow ? [creativeRow] : [];
      }
      return [];
    });
  });

  it.each(["/today", "/crm/demandes"])(
    "keeps an active local Admin on %s when remote Clerk is unavailable",
    async (pathname) => {
      const response = await handleKliqueProxyRequest(makeAuth("user-local"), request(pathname));

      expectAllowed(response);
      expect(protect).toHaveBeenCalledOnce();
      expect(clerkClientMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["admin", "/today", { ...baseAccessRow, role: "admin" }],
    ["athlete", "/athlete", { ...baseAccessRow, role: "athlete", athlete_id: "athlete-1" }],
    ["partner expert", "/partner", { ...baseAccessRow, role: "partner_expert", partner_id: "partner-1" }],
    ["media", "/media-desk", { ...baseAccessRow, role: "media", media_id: "33333333-3333-4333-8333-333333333333" }],
  ] as const)(
    "authorizes the local %s role without remote Clerk",
    async (_label, pathname, row) => {
      accessRow = row;

      const response = await handleKliqueProxyRequest(makeAuth("user-local"), request(pathname));

      expectAllowed(response);
      expect(clerkClientMock).not.toHaveBeenCalled();
    },
  );

  it("authorizes a local creative-only account only in the creative space", async () => {
    accessRow = null;
    creativeRow = activeCreativeRow;

    const [creativeResponse, todayResponse, crmResponse] = await Promise.all([
      handleKliqueProxyRequest(makeAuth("user-local"), request("/creative")),
      handleKliqueProxyRequest(makeAuth("user-local"), request("/today")),
      handleKliqueProxyRequest(makeAuth("user-local"), request("/crm/demandes")),
    ]);

    expectAllowed(creativeResponse);
    for (const response of [todayResponse, crmResponse]) {
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost/creative");
      expect(response.headers.get("location")).not.toContain("/access-pending");
    }
    expect(clerkClientMock).not.toHaveBeenCalled();
  });

  it("preserves Admin and creative access for the same local Clerk user", async () => {
    creativeRow = activeCreativeRow;
    const todayAuth = makeAuth("user-local");
    const crmAuth = makeAuth("user-local");
    const creativeAuth = makeAuth("user-local");

    const [todayResponse, crmResponse, creativeResponse] = await Promise.all([
      handleKliqueProxyRequest(todayAuth, request("/today")),
      handleKliqueProxyRequest(crmAuth, request("/crm/demandes")),
      handleKliqueProxyRequest(creativeAuth, request("/creative")),
    ]);

    for (const response of [todayResponse, crmResponse, creativeResponse]) {
      expectAllowed(response);
      expect(response.headers.get("location")).not.toBe("http://localhost/access-pending");
    }
    expect(todayAuth).toHaveBeenCalledOnce();
    expect(crmAuth).toHaveBeenCalledOnce();
    expect(creativeAuth).toHaveBeenCalledOnce();
    expect(clerkClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["athlete", "/athlete", { ...baseAccessRow, role: "athlete", athlete_id: "athlete-1" }],
    ["partner expert", "/partner", { ...baseAccessRow, role: "partner_expert", partner_id: "partner-1" }],
    ["media", "/media-desk", { ...baseAccessRow, role: "media", media_id: "33333333-3333-4333-8333-333333333333" }],
  ] as const)(
    "keeps the active historical %s role prioritized over creative access",
    async (_label, expectedPath, row) => {
      accessRow = row;
      creativeRow = activeCreativeRow;

      const response = await handleKliqueProxyRequest(makeAuth("user-local"), request("/creative"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`http://localhost${expectedPath}`);
      expect(clerkClientMock).not.toHaveBeenCalled();
    },
  );

  it("keeps /api/clerk/access coherent with the proxy without remote Clerk", async () => {
    creativeRow = activeCreativeRow;

    const response = await getClerkAccess(new Request("http://localhost/api/clerk/access"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.userAccess).toMatchObject({
      role: "admin",
      status: "active",
      workspaceId: "workspace-server",
    });
    expect(payload.creativeAccess).toMatchObject({
      status: "active",
      creativeProfileStatus: "active",
    });
    expect(payload.permissions).toMatchObject({
      isAdmin: true,
      isActive: true,
      isCreative: true,
    });
    expect(JSON.stringify(payload)).not.toContain("workspace-client");
    expect(clerkClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["admin", { ...baseAccessRow, role: "admin" }],
    ["athlete", { ...baseAccessRow, role: "athlete", athlete_id: "athlete-1" }],
    ["partner_expert", { ...baseAccessRow, role: "partner_expert", partner_id: "partner-1" }],
    ["media", { ...baseAccessRow, role: "media", media_id: "33333333-3333-4333-8333-333333333333" }],
  ] as const)(
    "resolves the historical %s role identically through /api/clerk/access",
    async (role, row) => {
      accessRow = row;

      const response = await getClerkAccess(new Request("http://localhost/api/clerk/access"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.userAccess).toMatchObject({
        role,
        status: "active",
        workspaceId: "workspace-server",
      });
      expect(clerkClientMock).not.toHaveBeenCalled();
    },
  );

  it("fails closed for an inactive local access without consulting remote Clerk", async () => {
    accessRow = { ...baseAccessRow, role: "admin", status: "disabled" };

    const response = await handleKliqueProxyRequest(makeAuth("user-local"), request("/today"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/access-pending");
    expect(clerkClientMock).not.toHaveBeenCalled();
  });

  it("fails closed at access-pending when no local relation exists", async () => {
    accessRow = null;
    creativeRow = null;

    const response = await handleKliqueProxyRequest(makeAuth("user-local"), request("/today"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/access-pending");
    expect(clerkClientMock).not.toHaveBeenCalled();
  });
});
