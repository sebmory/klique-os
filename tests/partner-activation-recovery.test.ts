import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  clerkClientMock,
  authenticateRequestMock,
  getUserMock,
  getInvitationListMock,
  createContentStorageClientMock,
  getPartnersMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  clerkClientMock: vi.fn(),
  authenticateRequestMock: vi.fn(),
  getUserMock: vi.fn(),
  getInvitationListMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  getPartnersMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: () => "klique-os",
}));

vi.mock("@/lib/google-sheets", () => ({
  getAthletesFromGoogleSheets: vi.fn(async () => []),
  getEcosystemPartnersFrom06Partenaires: getPartnersMock,
  getPartnersFromGoogleSheets: vi.fn(async () => []),
  getMediaFromGoogleSheets: vi.fn(async () => []),
  isPartnerUuid: (value: unknown) =>
    typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
}));

import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

const partnerId = "9ca2699c-5cc1-52a6-bbb5-7d6b6c2e97a4";
const email = "partner@example.com";
type LocalAccessRow = {
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

const activeAccess: LocalAccessRow = {
  clerk_user_id: "user_partner",
  email,
  role: "partner_expert",
  workspace_id: "klique-os",
  athlete_id: null,
  partner_id: partnerId,
  media_id: null,
  status: "active",
  created_at: "2026-10-14T10:00:00.000Z",
  updated_at: "2026-10-14T10:00:00.000Z",
};
const acceptedInvitation = {
  id: "inv_accepted",
  emailAddress: email,
  status: "accepted",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  publicMetadata: {
    role: "partner_expert",
    workspaceId: "klique-os",
    partnerId,
  },
};

describe("partner activation recovery", () => {
  let localAccess: LocalAccessRow | null;
  let reconciliationWrites: number;
  let normalInvitationAccess: boolean;

  beforeEach(() => {
    vi.resetAllMocks();
    localAccess = null;
    reconciliationWrites = 0;
    normalInvitationAccess = false;
    authMock.mockResolvedValue({ userId: "user_partner" });
    authenticateRequestMock.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: "user_partner" }),
    });
    getUserMock.mockResolvedValue({
      id: "user_partner",
      publicMetadata: {
        role: "partner_expert",
        workspaceId: "klique-os",
        partnerId,
      },
      emailAddresses: [{
        emailAddress: email,
        verification: { status: "verified" },
      }],
    });
    getInvitationListMock.mockResolvedValue({ data: [acceptedInvitation], totalCount: 1 });
    clerkClientMock.mockResolvedValue({
      authenticateRequest: authenticateRequestMock,
      users: { getUser: getUserMock },
      invitations: { getInvitationList: getInvitationListMock },
    });
    getPartnersMock.mockResolvedValue([{
      id: partnerId,
      name: "Partner",
      status: "Actif",
      email,
    }]);
    createContentStorageClientMock.mockReturnValue(vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ").toLowerCase();
      if (query.includes("create table") || query.includes("create unique index")) return [];
      if (query.includes("from creative_access ca")) return [];
      if (
        query.includes("from user_access")
        && query.includes("where clerk_user_id")
        && !query.includes("reconciled_invitation")
      ) {
        return localAccess ? [localAccess] : [];
      }
      if (query.includes("update partner_invitations invitation") && query.includes("from claimed")) {
        if (normalInvitationAccess) {
          localAccess = activeAccess;
          return [activeAccess];
        }
        return [];
      }
      if (query.includes("reconciled_invitation")) {
        reconciliationWrites += 1;
        localAccess = activeAccess;
        return [activeAccess];
      }
      return [];
    }) as never);
  });

  it("activates a normal persisted partner invitation", async () => {
    normalInvitationAccess = true;

    const profile = await getCurrentUserAccessProfile(new Request("https://app.klique.ch/api/clerk/access"));

    expect(profile?.userAccess).toMatchObject({
      role: "partner_expert",
      status: "active",
      partnerId,
    });
    expect(getInvitationListMock).not.toHaveBeenCalled();
  });

  it("repairs an accepted Clerk invitation with no local rows", async () => {
    const profile = await getCurrentUserAccessProfile(new Request("https://app.klique.ch/api/clerk/access"));

    expect(profile?.userAccess).toMatchObject({
      role: "partner_expert",
      workspaceId: "klique-os",
      partnerId,
      status: "active",
    });
    expect(reconciliationWrites).toBe(1);
    expect(getInvitationListMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "accepted",
      query: email,
    }));
  });

  it("refuses an unverified email", async () => {
    getUserMock.mockResolvedValueOnce({
      id: "user_partner",
      publicMetadata: { role: "partner_expert", workspaceId: "klique-os", partnerId },
      emailAddresses: [{ emailAddress: email, verification: { status: "unverified" } }],
    });

    const profile = await getCurrentUserAccessProfile();

    expect(profile?.userAccess).toBeNull();
    expect(getInvitationListMock).not.toHaveBeenCalled();
    expect(reconciliationWrites).toBe(0);
  });

  it("refuses a verified email different from the accepted invitation", async () => {
    getInvitationListMock.mockResolvedValue({
      data: [{ ...acceptedInvitation, emailAddress: "other@example.com" }],
      totalCount: 1,
    });

    const profile = await getCurrentUserAccessProfile();

    expect(profile?.userAccess).toBeNull();
    expect(reconciliationWrites).toBe(0);
  });

  it("refuses account metadata without an accepted Clerk invitation", async () => {
    getInvitationListMock.mockResolvedValue({ data: [], totalCount: 0 });

    const profile = await getCurrentUserAccessProfile();

    expect(profile?.userAccess).toBeNull();
    expect(reconciliationWrites).toBe(0);
  });

  it("refuses an inactive partner", async () => {
    getPartnersMock.mockResolvedValueOnce([{
      id: partnerId,
      name: "Partner",
      status: "Inactif",
      email,
    }]);

    const profile = await getCurrentUserAccessProfile();

    expect(profile?.userAccess).toBeNull();
    expect(reconciliationWrites).toBe(0);
  });

  it("does not overwrite a local access with another role", async () => {
    localAccess = {
      ...activeAccess,
      role: "athlete",
      athlete_id: "athlete-1",
      partner_id: null,
    };

    const profile = await getCurrentUserAccessProfile();

    expect(profile?.userAccess?.role).toBe("athlete");
    expect(getInvitationListMock).not.toHaveBeenCalled();
    expect(reconciliationWrites).toBe(0);
  });

  it("is idempotent and returns the local access without a second write", async () => {
    const first = await getCurrentUserAccessProfile();
    const second = await getCurrentUserAccessProfile();

    expect(first?.userAccess?.partnerId).toBe(partnerId);
    expect(second?.userAccess?.partnerId).toBe(partnerId);
    expect(reconciliationWrites).toBe(1);
    expect(getInvitationListMock).toHaveBeenCalledOnce();
  });

  it("converges concurrent recovery calls on one active local access", async () => {
    const [first, second] = await Promise.all([
      getCurrentUserAccessProfile(),
      getCurrentUserAccessProfile(),
    ]);

    expect(first?.userAccess).toMatchObject({ clerkUserId: "user_partner", partnerId });
    expect(second?.userAccess).toMatchObject({ clerkUserId: "user_partner", partnerId });
    expect(localAccess).toMatchObject({
      clerk_user_id: "user_partner",
      partner_id: partnerId,
      role: "partner_expert",
      status: "active",
    });
  });

  it("leaves local state untouched when Clerk recovery fails", async () => {
    getInvitationListMock.mockRejectedValueOnce(new Error("Clerk unavailable"));

    await expect(getCurrentUserAccessProfile()).rejects.toThrow("Clerk unavailable");
    expect(localAccess).toBeNull();
    expect(reconciliationWrites).toBe(0);
  });
});
