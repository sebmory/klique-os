import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  clerkClientMock,
  authenticateRequestMock,
  getUserMock,
  getInvitationListMock,
  createInvitationMock,
  createContentStorageClientMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  clerkClientMock: vi.fn(),
  authenticateRequestMock: vi.fn(),
  getUserMock: vi.fn(),
  getInvitationListMock: vi.fn(),
  createInvitationMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
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
  getEcosystemPartnersFrom06Partenaires: vi.fn(async () => []),
  getPartnersFromGoogleSheets: vi.fn(async () => []),
  getMediaFromGoogleSheets: vi.fn(async () => []),
  isPartnerUuid: () => true,
}));

import { invitePartnerToKlique } from "@/lib/clerk-access/service";

const partnerId = "9ca2699c-5cc1-52a6-bbb5-7d6b6c2e97a4";
const email = "partner@example.com";
const attemptId = "11111111-1111-4111-8111-111111111111";
const adminAccess = {
  clerk_user_id: "user_admin",
  email: "admin@example.com",
  role: "admin",
  workspace_id: "klique-os",
  athlete_id: null,
  partner_id: null,
  media_id: null,
  status: "active",
  created_at: "2026-10-14T10:00:00.000Z",
  updated_at: "2026-10-14T10:00:00.000Z",
};

describe("partner invitation intent workflow", () => {
  let intentExists: boolean;
  let persistedInvitationId: string | null;
  let claimed: boolean;
  let remoteInvitation: Record<string, unknown> | null;
  let failFinalization: boolean;

  beforeEach(() => {
    vi.resetAllMocks();
    intentExists = false;
    persistedInvitationId = null;
    claimed = false;
    remoteInvitation = null;
    failFinalization = false;
    authMock.mockResolvedValue({ userId: "user_admin" });
    authenticateRequestMock.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: "user_admin" }),
    });
    getUserMock.mockResolvedValue({
      id: "user_admin",
      emailAddresses: [{ emailAddress: "admin@example.com", verification: { status: "verified" } }],
    });
    getInvitationListMock.mockImplementation(async () => ({
      data: remoteInvitation ? [remoteInvitation] : [],
      totalCount: remoteInvitation ? 1 : 0,
    }));
    createInvitationMock.mockImplementation(async (input: { publicMetadata: Record<string, unknown> }) => {
      remoteInvitation = {
        id: "inv_partner",
        emailAddress: email,
        status: "pending",
        publicMetadata: input.publicMetadata,
      };
      return remoteInvitation;
    });
    clerkClientMock.mockResolvedValue({
      authenticateRequest: authenticateRequestMock,
      users: { getUser: getUserMock },
      invitations: {
        getInvitationList: getInvitationListMock,
        createInvitation: createInvitationMock,
      },
    });
    createContentStorageClientMock.mockReturnValue(vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ").toLowerCase();
      if (query.includes("create table") || query.includes("create unique index")) return [];
      if (query.includes("from creative_access ca")) return [];
      if (query.includes("from user_access") && query.includes("where clerk_user_id")) return [adminAccess];
      if (query.includes("select workspace_id from user_access")) return [adminAccess];
      if (query.includes("select clerk_user_id from user_access")) return [];
      if (query.includes("select partner_id, email, clerk_invitation_id")) {
        return intentExists ? [{
          partner_id: partnerId,
          email,
          clerk_invitation_id: persistedInvitationId,
          clerk_invitation_attempt_id: attemptId,
        }] : [];
      }
      if (query.includes("insert into partner_invitations")) {
        intentExists = true;
        return [];
      }
      if (query.includes("set clerk_invitation_attempt_id = coalesce")) {
        return intentExists && !persistedInvitationId
          ? [{ clerk_invitation_attempt_id: attemptId }]
          : [];
      }
      if (query.includes("set clerk_creation_started_at = now()")) {
        if (claimed) return [];
        claimed = true;
        return [{ partner_id: partnerId }];
      }
      if (query.includes("set clerk_invitation_id =")) {
        if (failFinalization) throw new Error("Neon unavailable");
        persistedInvitationId = "inv_partner";
        claimed = false;
        return [{ clerk_invitation_id: persistedInvitationId }];
      }
      if (query.includes("set clerk_creation_started_at = null")) {
        claimed = false;
        return [];
      }
      return [];
    }) as never);
  });

  it("persists a local intent before Clerk and confirms the local invitation before success", async () => {
    const result = await invitePartnerToKlique(
      new Request("https://app.klique.ch"),
      { partnerId, email },
    );

    expect(result.ok).toBe(true);
    expect(intentExists).toBe(true);
    expect(persistedInvitationId).toBe("inv_partner");
    expect(createInvitationMock).toHaveBeenCalledOnce();
    expect(createInvitationMock).toHaveBeenCalledWith(expect.objectContaining({
      publicMetadata: expect.objectContaining({
        role: "partner_expert",
        workspaceId: "klique-os",
        partnerId,
        invitationAttemptId: attemptId,
      }),
    }));
  });

  it("allows only one concurrent caller to create a Clerk invitation", async () => {
    const [first, second] = await Promise.all([
      invitePartnerToKlique(new Request("https://app.klique.ch"), { partnerId, email }),
      invitePartnerToKlique(new Request("https://app.klique.ch"), { partnerId, email }),
    ]);

    expect([first.ok, second.ok]).toContain(true);
    expect(createInvitationMock).toHaveBeenCalledOnce();
    expect(persistedInvitationId).toBe("inv_partner");
  });

  it("keeps a retryable intent and reports no success when Clerk fails", async () => {
    createInvitationMock.mockRejectedValueOnce(new Error("Clerk unavailable"));

    const failed = await invitePartnerToKlique(
      new Request("https://app.klique.ch"),
      { partnerId, email },
    );

    expect(failed.ok).toBe(false);
    expect(intentExists).toBe(true);
    expect(persistedInvitationId).toBeNull();

    const retried = await invitePartnerToKlique(
      new Request("https://app.klique.ch"),
      { partnerId, email },
    );
    expect(retried.ok).toBe(true);
    expect(createInvitationMock).toHaveBeenCalledTimes(2);
  });

  it("recovers a Clerk invitation after Neon finalization fails without creating another invitation", async () => {
    failFinalization = true;

    const failed = await invitePartnerToKlique(
      new Request("https://app.klique.ch"),
      { partnerId, email },
    );

    expect(failed.ok).toBe(false);
    expect(remoteInvitation).not.toBeNull();
    expect(persistedInvitationId).toBeNull();

    failFinalization = false;
    const retried = await invitePartnerToKlique(
      new Request("https://app.klique.ch"),
      { partnerId, email },
    );

    expect(retried.ok).toBe(true);
    expect(createInvitationMock).toHaveBeenCalledOnce();
    expect(persistedInvitationId).toBe("inv_partner");
  });
});
