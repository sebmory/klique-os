import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  clerkClientMock,
  createContentStorageClientMock,
  getDefaultWorkspaceIdMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  clerkClientMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  getDefaultWorkspaceIdMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}));
vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: getDefaultWorkspaceIdMock,
}));
vi.mock("@/lib/google-sheets", () => ({
  getAthletesFromGoogleSheets: vi.fn(async () => []),
  getPartnersFromGoogleSheets: vi.fn(async () => []),
  getMediaFromGoogleSheets: vi.fn(async () => []),
}));

import {
  getCurrentUserAccessProfile,
  getCurrentUserCreativeAccessProfile,
} from "@/lib/clerk-access/service";

const creativeId = "11111111-1111-4111-8111-111111111111";

describe("creative Clerk activation 6C", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMock.mockResolvedValue({ userId: "user-admin-creative" });
    getDefaultWorkspaceIdMock.mockReturnValue("workspace-a");
  });

  it("resolves an existing creative access locally when the remote Clerk API is unavailable", async () => {
    clerkClientMock.mockRejectedValue(new Error("Clerk unavailable"));
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ").toLowerCase();
      if (query.includes("create table if not exists") || query.includes("create unique index")) {
        return [];
      }
      if (query.includes("from creative_access ca")) {
        return [{
          id: "22222222-2222-4222-8222-222222222222",
          workspace_id: "workspace-a",
          creative_profile_id: creativeId,
          clerk_user_id: "user-admin-creative",
          status: "active",
          invitation_email: "seb@example.com",
          invited_by_clerk_user_id: "admin-1",
          invited_at: "2026-10-12T07:30:00.000Z",
          activated_at: "2026-10-12T08:00:00.000Z",
          revoked_at: null,
          created_at: "2026-10-12T08:00:00.000Z",
          updated_at: "2026-10-12T08:00:00.000Z",
          creative_display_name: "Séb Mory Photographe",
          creative_profile_status: "active",
        }];
      }
      return [];
    });
    createContentStorageClientMock.mockReturnValue(sql as never);

    await expect(getCurrentUserCreativeAccessProfile()).resolves.toMatchObject({
      clerkUserId: "user-admin-creative",
      creativeProfileId: creativeId,
      workspaceId: "workspace-a",
      status: "active",
    });
    expect(clerkClientMock).not.toHaveBeenCalled();
  });

  it("uses the local admin access immediately and never reaches Clerk when the session is already authorized", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ").toLowerCase();
      if (query.includes("from user_access") && query.includes("where clerk_user_id") && !query.includes("with claimed")) {
        return [{
          clerk_user_id: "user-admin-creative",
          email: "seb@example.com",
          role: "admin",
          workspace_id: "workspace-a",
          athlete_id: null,
          partner_id: null,
          media_id: null,
          status: "active",
          created_at: "2026-10-12T07:00:00.000Z",
          updated_at: "2026-10-12T07:00:00.000Z",
        }];
      }
      if (query.includes("from creative_access ca") && !query.includes("with claimed")) {
        return [{
          id: "22222222-2222-4222-8222-222222222222",
          workspace_id: "workspace-a",
          creative_profile_id: creativeId,
          clerk_user_id: "user-admin-creative",
          status: "active",
          invitation_email: "seb@example.com",
          invited_by_clerk_user_id: "admin-1",
          invited_at: "2026-10-12T07:30:00.000Z",
          activated_at: "2026-10-12T08:00:00.000Z",
          revoked_at: null,
          created_at: "2026-10-12T08:00:00.000Z",
          updated_at: "2026-10-12T08:00:00.000Z",
          creative_display_name: "Séb Mory Photographe",
          creative_profile_status: "active",
        }];
      }
      return [];
    });
    createContentStorageClientMock.mockReturnValue(sql as never);
    authMock.mockResolvedValue({ userId: "user-admin-creative" });
    clerkClientMock.mockRejectedValue(new Error("Clerk unavailable"));

    const profile = await getCurrentUserAccessProfile();

    expect(profile?.userAccess).toMatchObject({
      role: "admin",
      status: "active",
      workspaceId: "workspace-a",
    });
    expect(profile?.clerkUser).toMatchObject({
      id: "user-admin-creative",
      email: "seb@example.com",
    });
    expect(clerkClientMock).not.toHaveBeenCalled();
  });

  it("links the exact invited canonical profile for an initial account without user_access", async () => {
    clerkClientMock.mockResolvedValue({
      authenticateRequest: vi.fn(async () => ({
        isAuthenticated: true,
        toAuth: () => ({ userId: "user-admin-creative" }),
      })),
      users: {
        getUser: vi.fn(async () => ({
          id: "user-admin-creative",
          publicMetadata: {
            role: "creative",
            workspaceId: "workspace-a",
            creativeProfileId: creativeId,
          },
          emailAddresses: [{
            emailAddress: "seb@example.com",
            verification: { status: "verified" },
          }],
        })),
      },
    });

    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ").toLowerCase();
      if (query.includes("create table if not exists") || query.includes("create unique index")) {
        return [];
      }
      if (
        query.includes("from user_access")
        && query.includes("where clerk_user_id")
        && !query.includes("with claimed")
      ) {
        return [];
      }
      if (query.includes("from creative_access ca") && !query.includes("with claimed")) {
        return [];
      }
      if (query.includes("with claimed") && query.includes("creative_invitations")) {
        return [{
          id: "22222222-2222-4222-8222-222222222222",
          workspace_id: "workspace-a",
          creative_profile_id: creativeId,
          clerk_user_id: "user-admin-creative",
          status: "active",
          invitation_email: "seb@example.com",
          invited_by_clerk_user_id: "admin-1",
          invited_at: "2026-10-12T07:30:00.000Z",
          activated_at: "2026-10-12T08:00:00.000Z",
          revoked_at: null,
          created_at: "2026-10-12T08:00:00.000Z",
          updated_at: "2026-10-12T08:00:00.000Z",
          creative_display_name: "Séb Mory Photographe",
          creative_profile_status: "active",
        }];
      }
      return [];
    });
    createContentStorageClientMock.mockReturnValue(sql as never);

    const profile = await getCurrentUserAccessProfile();

    expect(profile?.userAccess).toBeNull();
    expect(profile?.creativeAccess).toMatchObject({
      clerkUserId: "user-admin-creative",
      creativeProfileId: creativeId,
      workspaceId: "workspace-a",
      status: "active",
      creativeDisplayName: "Séb Mory Photographe",
    });
  });
});
