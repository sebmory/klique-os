import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  clerkClientMock,
  authenticateRequestMock,
  getUserMock,
  createInvitationMock,
  createContentStorageClientMock,
  getDefaultWorkspaceIdMock,
  getAthletesFromGoogleSheetsMock,
  getPartnersFromGoogleSheetsMock,
  getMediaFromGoogleSheetsMock,
} = vi.hoisted(() => ({
  clerkClientMock: vi.fn(),
  authenticateRequestMock: vi.fn(),
  getUserMock: vi.fn(),
  createInvitationMock: vi.fn(),
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

import { getCurrentUserAccessProfile, inviteAthleteToKlique } from "@/lib/clerk-access/service";

const buildQueryMock = (handlers: Array<{ match: string; result: unknown[] }>) =>
  vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join(" ").toLowerCase();
    for (const handler of handlers) {
      if (sql.includes(handler.match)) {
        return handler.result;
      }
    }
    return [];
  });

describe("athlete invitation authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getDefaultWorkspaceIdMock.mockReturnValue("klique-os");
    getPartnersFromGoogleSheetsMock.mockResolvedValue([]);
    getMediaFromGoogleSheetsMock.mockResolvedValue([]);
  });

  const mockAuthenticatedUser = (options: {
    userId: string;
    email: string;
    role: string | null;
    extraHandlers?: Array<{ match: string; result: unknown[] }>;
  }) => {
    authenticateRequestMock.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: options.userId }),
    });
    getUserMock.mockResolvedValue({
      id: options.userId,
      emailAddresses: [{ emailAddress: options.email }],
    });
    clerkClientMock.mockResolvedValue({
      authenticateRequest: authenticateRequestMock,
      users: { getUser: getUserMock },
      invitations: { createInvitation: createInvitationMock },
    });

    createContentStorageClientMock.mockReturnValue(
      buildQueryMock([
        ...(options.extraHandlers ?? []),
        { match: "create table if not exists", result: [] },
        {
          match: "where clerk_user_id",
          result:
            options.role === null
              ? []
              : [
                  {
                    clerk_user_id: options.userId,
                    email: options.email,
                    role: options.role,
                    workspace_id: "klique-os",
                    athlete_id: null,
                    partner_id: null,
                    media_id: null,
                    status: "active",
                    created_at: "2026-08-10T00:00:00.000Z",
                    updated_at: "2026-08-10T00:00:00.000Z",
                  },
                ],
        },
      ]) as never,
    );
  };

  it("denies invitation for a non-admin caller and never calls Clerk", async () => {
    mockAuthenticatedUser({ userId: "user_athlete", email: "athlete@example.com", role: "athlete" });
    getAthletesFromGoogleSheetsMock.mockResolvedValue([{ key: "athlete-42", email: "target@example.com" } as never]);

    const result = await inviteAthleteToKlique(new Request("http://localhost"), "athlete-42");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("forbidden");
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("rejects the invitation when the athlete record has no email", async () => {
    mockAuthenticatedUser({ userId: "user_admin", email: "admin@example.com", role: "admin" });
    getAthletesFromGoogleSheetsMock.mockResolvedValue([{ key: "athlete-42", email: "" } as never]);

    const result = await inviteAthleteToKlique(new Request("http://localhost"), "athlete-42");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("missing_email");
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("rejects the invitation when the athlete record has an invalid email", async () => {
    mockAuthenticatedUser({ userId: "user_admin", email: "admin@example.com", role: "admin" });
    getAthletesFromGoogleSheetsMock.mockResolvedValue([{ key: "athlete-42", email: "not-an-email" } as never]);

    const result = await inviteAthleteToKlique(new Request("http://localhost"), "athlete-42");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("invalid_email");
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("rejects the invitation when the athlete already has an active access", async () => {
    getAthletesFromGoogleSheetsMock.mockResolvedValue([{ key: "athlete-42", email: "target@example.com" } as never]);
    mockAuthenticatedUser({
      userId: "user_admin",
      email: "admin@example.com",
      role: "admin",
      extraHandlers: [{ match: "role = 'athlete' and status = 'active'", result: [{ clerk_user_id: "existing-user" }] }],
    });

    const result = await inviteAthleteToKlique(new Request("http://localhost"), "athlete-42");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("already_active");
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("rejects the invitation when a pending invitation already exists", async () => {
    getAthletesFromGoogleSheetsMock.mockResolvedValue([{ key: "athlete-42", email: "target@example.com" } as never]);
    mockAuthenticatedUser({
      userId: "user_admin",
      email: "admin@example.com",
      role: "admin",
      extraHandlers: [
        { match: "role = 'athlete' and status = 'active'", result: [] },
        { match: "from athlete_invitations where athlete_id", result: [{ athlete_id: "athlete-42" }] },
      ],
    });

    const result = await inviteAthleteToKlique(new Request("http://localhost"), "athlete-42");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("already_invited");
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("allows explicit resend when a pending invitation already exists and creates a fresh Clerk invitation", async () => {
    getAthletesFromGoogleSheetsMock.mockResolvedValue([{ key: "athlete-42", email: "target@example.com" } as never]);
    createInvitationMock.mockResolvedValue({ id: "inv_resend_456" });

    mockAuthenticatedUser({
      userId: "user_admin",
      email: "admin@example.com",
      role: "admin",
      extraHandlers: [
        { match: "role = 'athlete' and status = 'active'", result: [] },
        { match: "from athlete_invitations where athlete_id", result: [{ athlete_id: "athlete-42" }] },
        {
          match: "insert into athlete_invitations",
          result: [
            {
              athlete_id: "athlete-42",
              email: "target@example.com",
              clerk_invitation_id: "inv_resend_456",
              status: "invited",
              invited_by_clerk_user_id: "user_admin",
              created_at: "2026-08-10T00:00:00.000Z",
              updated_at: "2026-08-10T01:00:00.000Z",
            },
          ],
        },
      ],
    });

    const result = await inviteAthleteToKlique(new Request("http://localhost"), "athlete-42", { resend: true });

    expect(createInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: "target@example.com",
        redirectUrl: "/athlete",
        publicMetadata: { athleteId: "athlete-42", role: "athlete" },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.invitation.clerkInvitationId).toBe("inv_resend_456");
  });

  it("allows an admin to invite an athlete and sends the athleteId + role athlete in Clerk metadata", async () => {
    getAthletesFromGoogleSheetsMock.mockResolvedValue([{ key: "athlete-42", email: "target@example.com" } as never]);
    createInvitationMock.mockResolvedValue({ id: "inv_123" });

    mockAuthenticatedUser({
      userId: "user_admin",
      email: "admin@example.com",
      role: "admin",
      extraHandlers: [
        { match: "role = 'athlete' and status = 'active'", result: [] },
        { match: "from athlete_invitations where athlete_id", result: [] },
        {
          match: "insert into athlete_invitations",
          result: [
            {
              athlete_id: "athlete-42",
              email: "target@example.com",
              clerk_invitation_id: "inv_123",
              status: "invited",
              invited_by_clerk_user_id: "user_admin",
              created_at: "2026-08-10T00:00:00.000Z",
              updated_at: "2026-08-10T00:00:00.000Z",
            },
          ],
        },
      ],
    });

    const result = await inviteAthleteToKlique(new Request("http://localhost"), "athlete-42");

    expect(createInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: "target@example.com",
        redirectUrl: "/athlete",
        publicMetadata: { athleteId: "athlete-42", role: "athlete" },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.invitation.athleteId).toBe("athlete-42");
    expect(result.ok && result.invitation.status).toBe("invited");
  });
});


describe("athlete invitation acceptance linking", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getDefaultWorkspaceIdMock.mockReturnValue("klique-os");
    getAthletesFromGoogleSheetsMock.mockResolvedValue([]);
    getPartnersFromGoogleSheetsMock.mockResolvedValue([]);
    getMediaFromGoogleSheetsMock.mockResolvedValue([]);
  });

  const mockClerkUser = (options: {
    userId: string;
    publicMetadata?: Record<string, unknown>;
    emailAddresses?: Array<{ emailAddress: string; verification?: { status: string } }>;
  }) => {
    authenticateRequestMock.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: options.userId }),
    });
    getUserMock.mockResolvedValue({
      id: options.userId,
      publicMetadata: options.publicMetadata ?? {},
      emailAddresses: options.emailAddresses ?? [],
    });
    clerkClientMock.mockResolvedValue({
      authenticateRequest: authenticateRequestMock,
      users: { getUser: getUserMock },
    });
  };

  it("links the Clerk user to user_access via athleteId and a verified email match against a pending invitation", async () => {
    mockClerkUser({
      userId: "user_new_athlete",
      publicMetadata: { role: "athlete", athleteId: "athlete-42" },
      emailAddresses: [{ emailAddress: "target@example.com", verification: { status: "verified" } }],
    });

    createContentStorageClientMock.mockReturnValue(
      buildQueryMock([
        { match: "create table if not exists", result: [] },
        { match: "where clerk_user_id", result: [] },
        {
          match: "from athlete_invitations",
          result: [{ athlete_id: "athlete-42", email: "target@example.com", clerk_invitation_id: "inv_123", status: "invited" }],
        },
        {
          match: "insert into user_access",
          result: [
            {
              clerk_user_id: "user_new_athlete",
              email: "target@example.com",
              role: "athlete",
              workspace_id: "klique-os",
              athlete_id: "athlete-42",
              partner_id: null,
              media_id: null,
              status: "active",
              created_at: "2026-08-10T00:00:00.000Z",
              updated_at: "2026-08-10T00:00:00.000Z",
            },
          ],
        },
      ]) as never,
    );

    const profile = await getCurrentUserAccessProfile();

    expect(profile?.userAccess?.role).toBe("athlete");
    expect(profile?.userAccess?.athleteId).toBe("athlete-42");
    expect(profile?.userAccess?.status).toBe("active");
  });

  it("never links using the athlete's name and requires athleteId + role metadata from a real invitation", async () => {
    mockClerkUser({
      userId: "user_new_athlete",
      publicMetadata: { firstName: "Jean", lastName: "Dupont" },
      emailAddresses: [{ emailAddress: "target@example.com", verification: { status: "verified" } }],
    });

    createContentStorageClientMock.mockReturnValue(
      buildQueryMock([
        { match: "create table if not exists", result: [] },
        { match: "where clerk_user_id", result: [] },
      ]) as never,
    );

    const profile = await getCurrentUserAccessProfile();

    expect(profile?.userAccess).toBeNull();
  });

  it("does not link when the verified Clerk email does not match the invited email", async () => {
    mockClerkUser({
      userId: "user_new_athlete",
      publicMetadata: { role: "athlete", athleteId: "athlete-42" },
      emailAddresses: [{ emailAddress: "wrong@example.com", verification: { status: "verified" } }],
    });

    createContentStorageClientMock.mockReturnValue(
      buildQueryMock([
        { match: "create table if not exists", result: [] },
        { match: "where clerk_user_id", result: [] },
        {
          match: "from athlete_invitations",
          result: [{ athlete_id: "athlete-42", email: "target@example.com", clerk_invitation_id: "inv_123", status: "invited" }],
        },
      ]) as never,
    );

    const profile = await getCurrentUserAccessProfile();

    expect(profile?.userAccess).toBeNull();
  });

  it("does not link when the matching email address is not verified", async () => {
    mockClerkUser({
      userId: "user_new_athlete",
      publicMetadata: { role: "athlete", athleteId: "athlete-42" },
      emailAddresses: [{ emailAddress: "target@example.com", verification: { status: "unverified" } }],
    });

    createContentStorageClientMock.mockReturnValue(
      buildQueryMock([
        { match: "create table if not exists", result: [] },
        { match: "where clerk_user_id", result: [] },
        {
          match: "from athlete_invitations",
          result: [{ athlete_id: "athlete-42", email: "target@example.com", clerk_invitation_id: "inv_123", status: "invited" }],
        },
      ]) as never,
    );

    const profile = await getCurrentUserAccessProfile();

    expect(profile?.userAccess).toBeNull();
  });
});
