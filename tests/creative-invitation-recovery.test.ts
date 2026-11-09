import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  createContentStorageClient: vi.fn(),
  getDefaultWorkspaceId: vi.fn(),
  getAthletes: vi.fn(),
  getPartners: vi.fn(),
  getMedia: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: mocks.createContentStorageClient,
  getDefaultWorkspaceId: mocks.getDefaultWorkspaceId,
}));

vi.mock("@/lib/google-sheets", () => ({
  getAthletesFromGoogleSheets: mocks.getAthletes,
  getPartnersFromGoogleSheets: mocks.getPartners,
  getMediaFromGoogleSheets: mocks.getMedia,
}));

import { inviteCreativeProfileToKlique } from "@/lib/clerk-access/service";

const profileId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "workspace-a";
const email = "forms-creative@example.com";
const invitationId = "inv_pending_fixture";

const configureFlow = (pendingInvitationExists: boolean) => {
  let invitationPersisted = false;
  const executedQueries: Array<{ sql: string; values: unknown[] }> = [];
  const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
    executedQueries.push({ sql: query, values });
    if (query.includes("create table if not exists") || query.includes("create unique index")) {
      return [];
    }
    if (query.includes("from user_access") && query.includes("where clerk_user_id")) {
      return [{
        clerk_user_id: "admin-user",
        email: "admin@example.com",
        role: "admin",
        workspace_id: workspaceId,
        athlete_id: null,
        partner_id: null,
        media_id: null,
        status: "active",
        created_at: "2026-11-09T10:00:00.000Z",
        updated_at: "2026-11-09T10:00:00.000Z",
      }];
    }
    if (query.includes("from creative_access ca")) return [];
    if (query.includes("select id, workspace_id, contact_email, status, onboarding_message")) {
      return [{
        id: profileId,
        workspace_id: workspaceId,
        contact_email: email,
        status: "active",
        onboarding_message: null,
      }];
    }
    if (query.includes("from creative_profiles") && query.includes("order by id")) {
      return [{ id: profileId }];
    }
    if (query.includes("select access.clerk_user_id")) return [];
    if (query.includes("from creative_invitations") && query.includes("status = 'invited'")) {
      return invitationPersisted ? [{
        id: "22222222-2222-4222-8222-222222222222",
        email,
        creative_profile_id: profileId,
        clerk_invitation_id: invitationId,
      }] : [];
    }
    if (query.includes("invitation_saved as")) {
      invitationPersisted = true;
      return [{
        email,
        creative_profile_id: profileId,
        clerk_invitation_id: invitationId,
        status: "invited",
      }];
    }
    return [];
  });
  mocks.createContentStorageClient.mockReturnValue(sql as never);

  const createInvitation = vi.fn(async () => ({
    id: invitationId,
    emailAddress: email,
    status: "pending",
    publicMetadata: {
      role: "creative",
      workspaceId,
      creativeProfileId: profileId,
    },
  }));
  const getInvitationList = vi.fn(async () => ({
    data: pendingInvitationExists ? [{
      id: invitationId,
      emailAddress: email,
      status: "pending",
      publicMetadata: {
        role: "creative",
        workspaceId,
        creativeProfileId: profileId,
      },
    }] : [],
    totalCount: pendingInvitationExists ? 1 : 0,
  }));
  mocks.clerkClient.mockResolvedValue({
    authenticateRequest: vi.fn(async () => ({
      isAuthenticated: true,
      toAuth: () => ({ userId: "admin-user" }),
    })),
    users: {
      getUser: vi.fn(async () => ({
        id: "admin-user",
        emailAddresses: [{ emailAddress: "admin@example.com" }],
      })),
      getUserList: vi.fn(async () => ({ data: [] })),
    },
    invitations: { createInvitation, getInvitationList },
  });
  return { createInvitation, executedQueries, getInvitationList };
};

const expectSingleNonDestructivePersistence = (
  executedQueries: Array<{ sql: string; values: unknown[] }>,
) => {
  const persistenceQueries = executedQueries.filter(({ sql: query }) =>
    query.includes("invitation_saved as"));
  expect(persistenceQueries).toHaveLength(1);
  expect(persistenceQueries[0].sql).toContain("jsonb_build_object('email', ?::text)");
  expect(persistenceQueries[0].values.filter((value) => value === null)).not.toHaveLength(0);
  expect(persistenceQueries[0].sql).not.toMatch(
    /set\s+(display_name|creative_type|contact_email|coverage_areas|specialties|bio)/,
  );
};

describe("creative invitation recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.klique.ch");
    mocks.auth.mockResolvedValue({ userId: "admin-user" });
    mocks.getDefaultWorkspaceId.mockReturnValue(workspaceId);
    mocks.getAthletes.mockResolvedValue([]);
    mocks.getPartners.mockResolvedValue([]);
    mocks.getMedia.mockResolvedValue([]);
  });

  it("reconciles an existing Clerk invitation once without replacing Forms data", async () => {
    const flow = configureFlow(true);
    const request = new Request("https://app.klique.ch/api/admin/creatives/access");

    const first = await inviteCreativeProfileToKlique(request, profileId, { message: null });
    const repeated = await inviteCreativeProfileToKlique(request, profileId, { message: null });

    expect(first).toMatchObject({ ok: true, clerkInvitationId: invitationId });
    expect(repeated).toMatchObject({ ok: true, clerkInvitationId: invitationId });
    expect(first).toMatchObject({ outcome: "invitation_reconciled" });
    expect(flow.getInvitationList).toHaveBeenCalledOnce();
    expect(flow.createInvitation).not.toHaveBeenCalled();
    expectSingleNonDestructivePersistence(flow.executedQueries);
  });

  it("creates a missing invitation once and treats the repeated request as successful", async () => {
    const flow = configureFlow(false);
    const request = new Request("https://app.klique.ch/api/admin/creatives/access");

    const first = await inviteCreativeProfileToKlique(request, profileId, { message: null });
    const repeated = await inviteCreativeProfileToKlique(request, profileId, { message: null });

    expect(first).toMatchObject({ ok: true, clerkInvitationId: invitationId });
    expect(repeated).toMatchObject({ ok: true, clerkInvitationId: invitationId });
    expect(first).toMatchObject({ outcome: "invitation_sent" });
    expect(flow.createInvitation).toHaveBeenCalledOnce();
    expectSingleNonDestructivePersistence(flow.executedQueries);
  });

  it("links an existing verified Clerk user without replacing another role or creating an invitation", async () => {
    let acceptedInvitationCount = 0;
    const executedQueries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
      executedQueries.push(query);
      if (query.includes("create table if not exists") || query.includes("create unique index")) return [];
      if (query.includes("from user_access") && query.includes("where clerk_user_id")) {
        return [{
          clerk_user_id: "admin-user",
          email: "admin@example.com",
          role: "admin",
          workspace_id: workspaceId,
          status: "active",
        }];
      }
      if (query.includes("from creative_access ca")) return [];
      if (query.includes("select id, workspace_id, contact_email, status, onboarding_message")) {
        return [{
          id: profileId,
          workspace_id: workspaceId,
          contact_email: email,
          status: "active",
          onboarding_message: null,
        }];
      }
      if (query.includes("from creative_profiles") && query.includes("order by id")) {
        return [{ id: profileId }];
      }
      if (query.includes("select access.clerk_user_id")) return [];
      if (query.includes("from creative_invitations") && query.includes("status = 'invited'")) return [];
      if (query.includes("invitation_updated as")) {
        acceptedInvitationCount = 1;
        expect(values).toContain("creative-user");
        return [{ creative_profile_id: profileId }];
      }
      return [];
    });
    mocks.createContentStorageClient.mockReturnValue(sql as never);
    const createInvitation = vi.fn();
    mocks.clerkClient.mockResolvedValue({
      authenticateRequest: vi.fn(async () => ({
        isAuthenticated: true,
        toAuth: () => ({ userId: "admin-user" }),
      })),
      users: {
        getUser: vi.fn(async () => ({
          id: "admin-user",
          emailAddresses: [{ emailAddress: "admin@example.com" }],
        })),
        getUserList: vi.fn(async () => ({
          data: [{
            id: "creative-user",
            publicMetadata: { role: "athlete" },
            emailAddresses: [{
              emailAddress: email,
              verification: { status: "verified" },
            }],
          }],
        })),
      },
      invitations: {
        createInvitation,
        getInvitationList: vi.fn(),
      },
    });
    const request = new Request("https://app.klique.ch/api/admin/creatives/access");

    const first = await inviteCreativeProfileToKlique(request, profileId, { message: null });
    const repeated = await inviteCreativeProfileToKlique(request, profileId, { message: null });

    expect(first).toMatchObject({
      ok: true,
      outcome: "existing_user_linked",
      clerkInvitationId: "existing:creative-user",
    });
    expect(repeated).toMatchObject({ ok: true, outcome: "existing_user_linked" });
    expect(createInvitation).not.toHaveBeenCalled();
    expect(acceptedInvitationCount).toBe(1);
    expect(executedQueries.filter((query) => query.includes("insert into user_access"))).toEqual([]);
    const linkingQueries = executedQueries.filter((query) => query.includes("invitation_updated as"));
    expect(linkingQueries).toHaveLength(2);
    expect(linkingQueries[0]).toContain("where not exists (select 1 from invitation_updated)");
    expect(linkingQueries[0]).toContain("on conflict (workspace_id, creative_profile_id)");
    expect(linkingQueries[0]).toContain(
      "onboarding_status in ('invitation_to_send', 'invitation_sent', 'active')",
    );
  });

  it("reconciles an accepted invitation through the existing user without creating duplicates", async () => {
    let acceptedInvitationCount = 1;
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
      if (query.includes("create table if not exists") || query.includes("create unique index")) return [];
      if (query.includes("from user_access") && query.includes("where clerk_user_id")) {
        return [{
          clerk_user_id: "admin-user",
          email: "admin@example.com",
          role: "admin",
          workspace_id: workspaceId,
          status: "active",
        }];
      }
      if (query.includes("from creative_access ca")) return [];
      if (query.includes("select id, workspace_id, contact_email, status, onboarding_message")) {
        return [{
          id: profileId,
          workspace_id: workspaceId,
          contact_email: email,
          status: "active",
          onboarding_message: null,
        }];
      }
      if (query.includes("from creative_profiles") && query.includes("order by id")) {
        return [{ id: profileId }];
      }
      if (query.includes("select access.clerk_user_id")) return [];
      if (query.includes("from creative_invitations") && query.includes("status = 'invited'")) return [];
      if (query.includes("invitation_updated as")) {
        acceptedInvitationCount = 1;
        return [{ creative_profile_id: profileId }];
      }
      return [];
    });
    mocks.createContentStorageClient.mockReturnValue(sql as never);
    const createInvitation = vi.fn();
    mocks.clerkClient.mockResolvedValue({
      authenticateRequest: vi.fn(async () => ({
        isAuthenticated: true,
        toAuth: () => ({ userId: "admin-user" }),
      })),
      users: {
        getUser: vi.fn(async () => ({
          id: "admin-user",
          emailAddresses: [{ emailAddress: "admin@example.com" }],
        })),
        getUserList: vi.fn(async () => ({
          data: [{
            id: "creative-user",
            emailAddresses: [{
              emailAddress: email,
              verification: { status: "verified" },
            }],
          }],
        })),
      },
      invitations: { createInvitation, getInvitationList: vi.fn() },
    });
    const request = new Request("https://app.klique.ch/api/admin/creatives/access");

    await inviteCreativeProfileToKlique(request, profileId, { message: null });
    await inviteCreativeProfileToKlique(request, profileId, { message: null });

    expect(acceptedInvitationCount).toBe(1);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("blocks multiple verified Clerk identities without creating an invitation", async () => {
    const flow = configureFlow(false);
    mocks.clerkClient.mockResolvedValue({
      authenticateRequest: vi.fn(async () => ({
        isAuthenticated: true,
        toAuth: () => ({ userId: "admin-user" }),
      })),
      users: {
        getUser: vi.fn(async () => ({
          id: "admin-user",
          emailAddresses: [{ emailAddress: "admin@example.com" }],
        })),
        getUserList: vi.fn(async () => ({
          data: ["creative-user-a", "creative-user-b"].map((id) => ({
            id,
            emailAddresses: [{
              emailAddress: email,
              verification: { status: "verified" },
            }],
          })),
        })),
      },
      invitations: {
        createInvitation: flow.createInvitation,
        getInvitationList: flow.getInvitationList,
      },
    });

    const result = await inviteCreativeProfileToKlique(
      new Request("https://app.klique.ch/api/admin/creatives/access"),
      profileId,
      { message: null },
    );

    expect(result).toMatchObject({ ok: false, reason: "ambiguous_identity" });
    expect(flow.createInvitation).not.toHaveBeenCalled();
  });
});
