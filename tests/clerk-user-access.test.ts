import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  clerkClientMock,
  authenticateRequestMock,
  getUserMock,
  createContentStorageClientMock,
  getDefaultWorkspaceIdMock,
  getAthletesFromGoogleSheetsMock,
  getPartnersFromGoogleSheetsMock,
  getMediaFromGoogleSheetsMock,
} = vi.hoisted(() => ({
  clerkClientMock: vi.fn(),
  authenticateRequestMock: vi.fn(),
  getUserMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  getDefaultWorkspaceIdMock: vi.fn(),
  getAthletesFromGoogleSheetsMock: vi.fn(),
  getPartnersFromGoogleSheetsMock: vi.fn(),
  getMediaFromGoogleSheetsMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: clerkClientMock,
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: getDefaultWorkspaceIdMock,
}));

vi.mock("@/lib/google-sheets", () => ({
  getAthletesFromGoogleSheets: getAthletesFromGoogleSheetsMock,
  getPartnersFromGoogleSheets: getPartnersFromGoogleSheetsMock,
  getMediaFromGoogleSheets: getMediaFromGoogleSheetsMock,
}));

import {
  bootstrapCurrentUserAsAdmin,
  buildUserAccessPermissionContext,
  evaluateBusinessAccess,
  getCurrentUserAccessProfile,
  resolveCurrentUserBusinessLink,
} from "@/lib/clerk-access/service";

describe("clerk user access service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getDefaultWorkspaceIdMock.mockReturnValue("klique-os");
    getAthletesFromGoogleSheetsMock.mockResolvedValue([]);
    getPartnersFromGoogleSheetsMock.mockResolvedValue([]);
    getMediaFromGoogleSheetsMock.mockResolvedValue([]);
    authenticateRequestMock.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: "user_123" }),
    });
    getUserMock.mockResolvedValue({
      id: "user_123",
      emailAddresses: [{ emailAddress: "tester@example.com" }],
    });
    clerkClientMock.mockResolvedValue({
      authenticateRequest: authenticateRequestMock,
      users: { getUser: getUserMock },
    });
  });

  it("creates the first admin access record for the current Clerk user", async () => {
    const query = vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ").toLowerCase();
      if (sql.includes("create table if not exists")) {
        return [];
      }
      if (sql.includes("select")) {
        return [];
      }
      if (sql.includes("insert into user_access")) {
        return [{
          clerk_user_id: "user_123",
          email: "tester@example.com",
          role: "admin",
          workspace_id: "klique-os",
          athlete_id: null,
          partner_id: null,
          media_id: null,
          status: "active",
          created_at: "2026-08-10T00:00:00.000Z",
          updated_at: "2026-08-10T00:00:00.000Z",
        }];
      }
      return [];
    });

    createContentStorageClientMock.mockReturnValue(query as never);
    process.env.KLIQUE_BOOTSTRAP_ADMIN_EMAIL = "tester@example.com";

    const result = await bootstrapCurrentUserAsAdmin();

    expect(result?.role).toBe("admin");
    expect(result?.workspaceId).toBe("klique-os");
    expect(result?.status).toBe("active");
  });

  it("rejects bootstrap when the clerk email is not the configured bootstrap email", async () => {
    const query = vi.fn(async () => []);

    createContentStorageClientMock.mockReturnValue(query as never);
    getUserMock.mockResolvedValue({
      id: "user_123",
      emailAddresses: [{ emailAddress: "wrong@example.com" }],
    });
    process.env.KLIQUE_BOOTSTRAP_ADMIN_EMAIL = "tester@example.com";

    await expect(bootstrapCurrentUserAsAdmin()).rejects.toThrow("Forbidden");
  });

  it("rejects bootstrap when an admin already exists", async () => {
    const query = vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ").toLowerCase();
      if (sql.includes("create table if not exists")) {
        return [];
      }
      if (sql.includes("where role = 'admin'")) {
        return [{ clerk_user_id: "existing-admin" }];
      }
      return [];
    });

    createContentStorageClientMock.mockReturnValue(query as never);
    process.env.KLIQUE_BOOTSTRAP_ADMIN_EMAIL = "tester@example.com";

    await expect(bootstrapCurrentUserAsAdmin()).rejects.toThrow("Forbidden");
  });

  it("returns the current clerk profile and access record", async () => {
    const query = vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ").toLowerCase();
      if (sql.includes("create table if not exists")) {
        return [];
      }
      if (sql.includes("select")) {
        return [{
          clerk_user_id: "user_123",
          email: "tester@example.com",
          role: "partner_expert",
          workspace_id: "klique-os",
          athlete_id: null,
          partner_id: "partner-1",
          media_id: null,
          status: "active",
          created_at: "2026-08-10T00:00:00.000Z",
          updated_at: "2026-08-10T00:00:00.000Z",
        }];
      }
      return [];
    });

    createContentStorageClientMock.mockReturnValue(query as never);

    const profile = await getCurrentUserAccessProfile();

    expect(profile?.clerkUser.id).toBe("user_123");
    expect(profile?.userAccess?.role).toBe("partner_expert");
    expect(profile?.userAccess?.partnerId).toBe("partner-1");
  });

  it("builds an admin permission context with full access", () => {
    const context = buildUserAccessPermissionContext({
      role: "admin",
      athleteId: null,
      partnerId: null,
      mediaId: null,
      workspaceId: "workspace-1",
      status: "active",
    } as never);

    expect(context.role).toBe("admin");
    expect(context.isAdmin).toBe(true);
    expect(context.hasFullAccess).toBe(true);
    expect(context.canAccessPersonalSpace).toBe(true);
    expect(context.canAccessCommunityZones).toBe(true);
  });

  it("builds an athlete permission context with personal and community access", () => {
    const context = buildUserAccessPermissionContext({
      role: "athlete",
      athleteId: "athlete-42",
      partnerId: null,
      mediaId: null,
      workspaceId: "workspace-1",
      status: "active",
    } as never);

    expect(context.role).toBe("athlete");
    expect(context.isAthlete).toBe(true);
    expect(context.athleteId).toBe("athlete-42");
    expect(context.canAccessPersonalSpace).toBe(true);
    expect(context.canAccessCommunityZones).toBe(true);
    expect(context.canAccessAthleteSpace).toBe(true);
    expect(context.canAccessPartnerSpace).toBe(false);
  });

  it("builds a partner expert permission context with partner-specific access", () => {
    const context = buildUserAccessPermissionContext({
      role: "partner_expert",
      athleteId: null,
      partnerId: "partner-7",
      mediaId: null,
      workspaceId: "workspace-1",
      status: "active",
    } as never);

    expect(context.role).toBe("partner_expert");
    expect(context.isPartnerExpert).toBe(true);
    expect(context.partnerId).toBe("partner-7");
    expect(context.canAccessPersonalSpace).toBe(true);
    expect(context.canAccessCommunityZones).toBe(true);
    expect(context.canAccessPartnerSpace).toBe(true);
    expect(context.canAccessAthleteSpace).toBe(false);
  });

  it("returns an unlinked resolution when a clerk user has no business record", async () => {
    const query = vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ").toLowerCase();
      if (sql.includes("create table if not exists")) {
        return [];
      }
      if (sql.includes("select")) {
        return [{
          clerk_user_id: "user_123",
          email: "tester@example.com",
          role: "athlete",
          workspace_id: "klique-os",
          athlete_id: null,
          partner_id: null,
          media_id: null,
          status: "active",
          created_at: "2026-08-10T00:00:00.000Z",
          updated_at: "2026-08-10T00:00:00.000Z",
        }];
      }
      return [];
    });

    createContentStorageClientMock.mockReturnValue(query as never);

    const result = await resolveCurrentUserBusinessLink();

    expect(result.businessType).toBe("unlinked");
    expect(result.businessRecord).toBeNull();
    expect(result.reason).toBe("no_link");
  });

  it("returns an invalid resolution when the linked record cannot be found", async () => {
    const query = vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ").toLowerCase();
      if (sql.includes("create table if not exists")) {
        return [];
      }
      if (sql.includes("select")) {
        return [{
          clerk_user_id: "user_123",
          email: "tester@example.com",
          role: "athlete",
          workspace_id: "klique-os",
          athlete_id: "missing-athlete",
          partner_id: null,
          media_id: null,
          status: "active",
          created_at: "2026-08-10T00:00:00.000Z",
          updated_at: "2026-08-10T00:00:00.000Z",
        }];
      }
      return [];
    });

    createContentStorageClientMock.mockReturnValue(query as never);

    const result = await resolveCurrentUserBusinessLink();

    expect(result.businessType).toBe("invalid");
    expect(result.businessRecord).toBeNull();
    expect(result.reason).toBe("missing_record");
  });

  it("allows an athlete to access only their own athlete record", async () => {
    const query = vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ").toLowerCase();
      if (sql.includes("create table if not exists")) {
        return [];
      }
      if (sql.includes("select")) {
        return [{
          clerk_user_id: "user_123",
          email: "tester@example.com",
          role: "athlete",
          workspace_id: "klique-os",
          athlete_id: "athlete-42",
          partner_id: null,
          media_id: null,
          status: "active",
          created_at: "2026-08-10T00:00:00.000Z",
          updated_at: "2026-08-10T00:00:00.000Z",
        }];
      }
      return [];
    });

    createContentStorageClientMock.mockReturnValue(query as never);
    getAthletesFromGoogleSheetsMock.mockResolvedValue([{ key: "athlete-42", row: 8 } as never]);

    const ownAccess = await evaluateBusinessAccess(undefined, { action: "read:athlete-record", targetAthleteId: "athlete-42" });
    const otherAccess = await evaluateBusinessAccess(undefined, { action: "read:athlete-record", targetAthleteId: "athlete-99" });

    expect(ownAccess.allowed).toBe(true);
    expect(otherAccess.allowed).toBe(false);
    expect(otherAccess.reason).toBe("owner_mismatch");
  });

  it("denies partner_expert access to athlete crm data and admin-only actions", async () => {
    const query = vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ").toLowerCase();
      if (sql.includes("create table if not exists")) {
        return [];
      }
      if (sql.includes("select")) {
        return [{
          clerk_user_id: "user_123",
          email: "tester@example.com",
          role: "partner_expert",
          workspace_id: "klique-os",
          athlete_id: null,
          partner_id: "partner-7",
          media_id: null,
          status: "active",
          created_at: "2026-08-10T00:00:00.000Z",
          updated_at: "2026-08-10T00:00:00.000Z",
        }];
      }
      return [];
    });

    createContentStorageClientMock.mockReturnValue(query as never);
    getPartnersFromGoogleSheetsMock.mockResolvedValue([{ id: "partner-7", row: 3 } as never]);

    const athleteAccess = await evaluateBusinessAccess(undefined, { action: "read:athlete-record", targetAthleteId: "athlete-42" });
    const partnerAccess = await evaluateBusinessAccess(undefined, { action: "read:partner-record", targetPartnerId: "partner-7" });
    const adminAction = await evaluateBusinessAccess(undefined, { action: "write:crm" });

    expect(athleteAccess.allowed).toBe(false);
    expect(athleteAccess.reason).toBe("role_forbidden");
    expect(partnerAccess.allowed).toBe(true);
    expect(adminAction.allowed).toBe(false);
    expect(adminAction.reason).toBe("admin_required");
  });
});
