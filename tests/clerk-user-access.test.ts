import { beforeEach, describe, expect, it, vi } from "vitest";

const { clerkClientMock, authenticateRequestMock, getUserMock, createContentStorageClientMock, getDefaultWorkspaceIdMock } = vi.hoisted(() => ({
  clerkClientMock: vi.fn(),
  authenticateRequestMock: vi.fn(),
  getUserMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  getDefaultWorkspaceIdMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: clerkClientMock,
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: getDefaultWorkspaceIdMock,
}));

import { bootstrapCurrentUserAsAdmin, getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

describe("clerk user access service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getDefaultWorkspaceIdMock.mockReturnValue("klique-os");
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
});
