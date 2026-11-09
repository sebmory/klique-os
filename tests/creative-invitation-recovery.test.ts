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
    expect(flow.createInvitation).toHaveBeenCalledOnce();
    expectSingleNonDestructivePersistence(flow.executedQueries);
  });
});
