import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  clerkClientMock,
  authenticateRequestMock,
  getUserMock,
  createInvitationMock,
  createContentStorageClientMock,
  getDefaultWorkspaceIdMock,
  getPartnersFromGoogleSheetsMock,
} = vi.hoisted(() => ({
  clerkClientMock: vi.fn(),
  authenticateRequestMock: vi.fn(),
  getUserMock: vi.fn(),
  createInvitationMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  getDefaultWorkspaceIdMock: vi.fn(),
  getPartnersFromGoogleSheetsMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: clerkClientMock,
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: getDefaultWorkspaceIdMock,
}));

vi.mock("@/lib/google-sheets", () => ({
  getAthletesFromGoogleSheets: vi.fn(),
  getPartnersFromGoogleSheets: getPartnersFromGoogleSheetsMock,
  getMediaFromGoogleSheets: vi.fn(),
}));

import { invitePartnerToKlique, resolveCurrentUserBusinessLink } from "@/lib/clerk-access/service";

const adminAccessRow = {
  clerk_user_id: "user_admin",
  email: "admin@example.com",
  role: "admin",
  workspace_id: "workspace-1",
  athlete_id: null,
  partner_id: null,
  media_id: null,
  status: "active",
  created_at: "2026-09-14T00:00:00.000Z",
  updated_at: "2026-09-14T00:00:00.000Z",
};

const partnerAccessRow = (partnerId: string) => ({
  ...adminAccessRow,
  clerk_user_id: "user_partner",
  email: "partner@example.com",
  role: "partner_expert",
  partner_id: partnerId,
});

describe("partner invitation redirect", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.klique.ch");
    getDefaultWorkspaceIdMock.mockReturnValue("workspace-1");
    authenticateRequestMock.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: "user_admin" }),
    });
    getUserMock.mockResolvedValue({
      id: "user_admin",
      emailAddresses: [{ emailAddress: "admin@example.com", verification: { status: "verified" } }],
    });
    createInvitationMock.mockResolvedValue({ id: "inv_partner_1" });
    clerkClientMock.mockResolvedValue({
      authenticateRequest: authenticateRequestMock,
      users: { getUser: getUserMock },
      invitations: { createInvitation: createInvitationMock },
    });
    createContentStorageClientMock.mockReturnValue(vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ").toLowerCase();
      if (sql.includes("create table if not exists")) return [];
      if (sql.includes("select clerk_user_id, email, role") && sql.includes("where clerk_user_id")) {
        return [adminAccessRow];
      }
      if (sql.includes("select workspace_id from user_access")) return [adminAccessRow];
      if (sql.includes("insert into partner_invitations")) {
        return [{ clerk_invitation_id: "inv_partner_1" }];
      }
      return [];
    }) as never);
  });

  it("redirects the Clerk invitation to the partner signup portal", async () => {
    const result = await invitePartnerToKlique(
      new Request("https://app.klique.ch"),
      { partnerId: "row-7", email: "partner@example.com" },
    );

    expect(result.ok).toBe(true);
    expect(createInvitationMock).toHaveBeenCalledWith(expect.objectContaining({
      redirectUrl: "https://app.klique.ch/sign-up?portal=partner",
    }));
  });
});

describe("partner business identifiers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getDefaultWorkspaceIdMock.mockReturnValue("workspace-1");
    authenticateRequestMock.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: "user_partner" }),
    });
    getUserMock.mockResolvedValue({
      id: "user_partner",
      emailAddresses: [{ emailAddress: "partner@example.com", verification: { status: "verified" } }],
    });
    clerkClientMock.mockResolvedValue({
      authenticateRequest: authenticateRequestMock,
      users: { getUser: getUserMock },
    });
    getPartnersFromGoogleSheetsMock.mockResolvedValue([{
      id: "3d216a5b-4594-4c5a-b66b-1338b982a95f",
      name: "Studio Alpha",
      row: 7,
    }]);
  });

  it.each([
    ["business identifier", "3d216a5b-4594-4c5a-b66b-1338b982a95f"],
    ["raw row number", "7"],
    ["row-N identifier", "row-7"],
    ["legacy partner name", "Studio Alpha"],
  ])("resolves a partner from its %s", async (_label, partnerId) => {
    createContentStorageClientMock.mockReturnValue(vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ").toLowerCase();
      if (sql.includes("create table if not exists")) return [];
      if (sql.includes("select clerk_user_id, email, role") && sql.includes("where clerk_user_id")) {
        return [partnerAccessRow(partnerId)];
      }
      return [];
    }) as never);

    const result = await resolveCurrentUserBusinessLink(new Request("https://app.klique.ch"));

    expect(result.businessType).toBe("partner");
    expect(result.businessRecord).toMatchObject({
      id: "3d216a5b-4594-4c5a-b66b-1338b982a95f",
      row: 7,
    });
  });
});