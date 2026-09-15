import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  clerkClientMock,
  authenticateRequestMock,
  getUserMock,
  createInvitationMock,
  createContentStorageClientMock,
  getDefaultWorkspaceIdMock,
  getActiveMediaOrganizationMock,
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
  getActiveMediaOrganizationMock: vi.fn(),
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

vi.mock("@/lib/media-organizations/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media-organizations/service")>();
  return {
    ...actual,
    getActiveMediaOrganization: getActiveMediaOrganizationMock,
  };
});

vi.mock("@/lib/google-sheets", () => ({
  getAthletesFromGoogleSheets: getAthletesFromGoogleSheetsMock,
  getPartnersFromGoogleSheets: getPartnersFromGoogleSheetsMock,
  getMediaFromGoogleSheets: getMediaFromGoogleSheetsMock,
}));

import {
  getCurrentUserAccessProfile,
  inviteMediaToKlique,
} from "@/lib/clerk-access/service";
import { MediaOrganizationNotFoundError } from "@/lib/media-organizations/service";

const mediaId = "49c345aa-fb6e-46e8-83ef-1e07d7b69192";

type SqlCall = { text: string; values: unknown[] };

const accessRow = (overrides: Record<string, unknown> = {}) => ({
  clerk_user_id: "user-admin",
  email: "admin@example.com",
  role: "admin",
  workspace_id: "workspace-1",
  athlete_id: null,
  partner_id: null,
  media_id: null,
  status: "active",
  created_at: "2026-09-15T08:00:00.000Z",
  updated_at: "2026-09-15T08:00:00.000Z",
  ...overrides,
});

const installSqlMock = (
  resolver: (call: SqlCall) => unknown[] = () => [],
): { calls: SqlCall[] } => {
  const calls: SqlCall[] = [];
  const sqlMock = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const call = { text: strings.join(" ").toLowerCase(), values };
    calls.push(call);
    return resolver(call);
  });
  createContentStorageClientMock.mockReturnValue(sqlMock as never);
  return { calls };
};

const mockClerkUser = (options: {
  userId: string;
  email: string;
  verification?: string;
  publicMetadata?: Record<string, unknown>;
}) => {
  authenticateRequestMock.mockResolvedValue({
    isAuthenticated: true,
    toAuth: () => ({ userId: options.userId }),
  });
  getUserMock.mockResolvedValue({
    id: options.userId,
    publicMetadata: options.publicMetadata ?? {},
    emailAddresses: [{
      emailAddress: options.email,
      verification: { status: options.verification ?? "verified" },
    }],
  });
  clerkClientMock.mockResolvedValue({
    authenticateRequest: authenticateRequestMock,
    users: { getUser: getUserMock },
    invitations: { createInvitation: createInvitationMock },
  });
};

describe("media invitation service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.klique.ch");
    getDefaultWorkspaceIdMock.mockReturnValue("klique-os");
    getAthletesFromGoogleSheetsMock.mockResolvedValue([]);
    getPartnersFromGoogleSheetsMock.mockResolvedValue([]);
    getMediaFromGoogleSheetsMock.mockResolvedValue([]);
  });

  it("requires mediaId before checking an organization or calling Clerk", async () => {
    mockClerkUser({ userId: "user-admin", email: "admin@example.com" });
    installSqlMock(({ text }) => text.includes("where clerk_user_id") ? [accessRow()] : []);

    const result = await inviteMediaToKlique(
      new Request("http://localhost"),
      "journalist@example.com",
    );

    expect(result).toEqual({ ok: false, reason: "invalid_media" });
    expect(getActiveMediaOrganizationMock).not.toHaveBeenCalled();
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("rejects an inactive or missing organization in the current workspace", async () => {
    mockClerkUser({ userId: "user-admin", email: "admin@example.com" });
    installSqlMock(({ text }) => text.includes("where clerk_user_id") ? [accessRow()] : []);
    getActiveMediaOrganizationMock.mockRejectedValue(new MediaOrganizationNotFoundError());

    const result = await inviteMediaToKlique(
      new Request("http://localhost"),
      "journalist@example.com",
      mediaId,
    );

    expect(getActiveMediaOrganizationMock).toHaveBeenCalledWith("workspace-1", mediaId);
    expect(result).toEqual({ ok: false, reason: "media_not_found" });
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("stores mediaId and sends exact Clerk metadata with the media signup redirect", async () => {
    mockClerkUser({ userId: "user-admin", email: "admin@example.com" });
    getActiveMediaOrganizationMock.mockResolvedValue({ id: mediaId, status: "active" });
    createInvitationMock.mockResolvedValue({ id: "inv-media-1" });
    const { calls } = installSqlMock(({ text }) => {
      if (text.includes("where clerk_user_id")) return [accessRow()];
      if (text.includes("from user_access") && text.includes("role = 'media'")) return [];
      if (text.includes("from media_invitations") && text.includes("select id")) return [];
      if (text.includes("insert into media_invitations")) {
        return [{ id: "d39e8e52-5125-4ba6-a809-f6f69f98ed76", email: "journalist@example.com", media_id: mediaId }];
      }
      return [];
    });

    const result = await inviteMediaToKlique(
      new Request("http://localhost"),
      " Journalist@Example.com ",
      mediaId.toUpperCase(),
    );

    expect(createInvitationMock).toHaveBeenCalledWith({
      emailAddress: "journalist@example.com",
      publicMetadata: {
        role: "media",
        workspaceId: "workspace-1",
        mediaId,
      },
      redirectUrl: "https://app.klique.ch/sign-up?portal=media",
      notify: true,
    });
    expect(result).toEqual({
      ok: true,
      invitationId: "d39e8e52-5125-4ba6-a809-f6f69f98ed76",
      email: "journalist@example.com",
      mediaId,
    });
    const insert = calls.find(({ text }) => text.includes("insert into media_invitations"));
    expect(insert?.text).toContain("media_id");
    expect(insert?.values).toContain(mediaId);
  });
});

describe("media invitation access linking", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getDefaultWorkspaceIdMock.mockReturnValue("klique-os");
    getAthletesFromGoogleSheetsMock.mockResolvedValue([]);
    getPartnersFromGoogleSheetsMock.mockResolvedValue([]);
    getMediaFromGoogleSheetsMock.mockResolvedValue([]);
  });

  it("creates linked media access from matching metadata and verified email", async () => {
    mockClerkUser({
      userId: "user-media",
      email: "journalist@example.com",
      publicMetadata: { role: "media", workspaceId: "workspace-1", mediaId },
    });
    const { calls } = installSqlMock(({ text }) => {
      if (text.includes("select clerk_user_id") && text.includes("from user_access")) return [];
      if (text.includes("with claimed as") && text.includes("from media_invitations")) {
        return [accessRow({
          clerk_user_id: "user-media",
          email: "journalist@example.com",
          role: "media",
          media_id: mediaId,
        })];
      }
      return [];
    });

    const profile = await getCurrentUserAccessProfile(new Request("http://localhost"));

    expect(profile?.userAccess).toMatchObject({
      clerkUserId: "user-media",
      role: "media",
      workspaceId: "workspace-1",
      mediaId,
      status: "active",
    });
    const linking = calls.find(({ text }) => text.includes("with claimed as") && text.includes("from media_invitations"));
    expect(linking?.text).toContain("workspace_id =");
    expect(linking?.text).toContain("media_id =");
    expect(linking?.text).toContain("claimed.media_id::text");
    expect(linking?.text).toContain("on conflict (clerk_user_id) do nothing");
    expect(linking?.text).toContain("exists (select 1 from upserted)");
    expect(linking?.values).toContainEqual(["journalist@example.com"]);
    expect(linking?.values).toContain("workspace-1");
    expect(linking?.values).toContain(mediaId);
  });

  it.each([
    [{ workspaceId: "workspace-1", mediaId }, "missing role"],
    [{ role: "media", mediaId }, "missing workspace"],
    [{ role: "media", workspaceId: "workspace-1" }, "missing mediaId"],
    [{ role: "athlete", workspaceId: "workspace-1", mediaId }, "wrong role"],
  ])("does not link when Clerk metadata is incomplete: %s", async (publicMetadata, _scenario: string) => {
    mockClerkUser({
      userId: "user-media",
      email: "journalist@example.com",
      publicMetadata,
    });
    const { calls } = installSqlMock(({ text }) =>
      text.includes("select clerk_user_id") && text.includes("from user_access") ? [] : []
    );

    const profile = await getCurrentUserAccessProfile(new Request("http://localhost"));

    expect(profile?.userAccess).toBeNull();
    expect(calls.some(({ text }) => text.includes("with claimed as") && text.includes("from media_invitations"))).toBe(false);
  });

  it("does not link an unverified Clerk email", async () => {
    mockClerkUser({
      userId: "user-media",
      email: "journalist@example.com",
      verification: "unverified",
      publicMetadata: { role: "media", workspaceId: "workspace-1", mediaId },
    });
    const { calls } = installSqlMock(() => []);

    const profile = await getCurrentUserAccessProfile(new Request("http://localhost"));

    expect(profile?.userAccess).toBeNull();
    expect(calls.some(({ text }) => text.includes("with claimed as") && text.includes("from media_invitations"))).toBe(false);
  });

  it("keeps legacy NULL-media invitations unaccepted when no exact invitation matches", async () => {
    mockClerkUser({
      userId: "user-media",
      email: "legacy@example.com",
      publicMetadata: { role: "media", workspaceId: "workspace-1", mediaId },
    });
    const { calls } = installSqlMock(() => []);

    const profile = await getCurrentUserAccessProfile(new Request("http://localhost"));

    expect(profile?.userAccess).toBeNull();
    const linking = calls.find(({ text }) => text.includes("with claimed as") && text.includes("from media_invitations"));
    expect(linking?.text).toContain("media_id =");
    expect(linking?.text).toContain("status = 'invited'");
  });
});