import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserAccessProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

import { ContentAccessError, requireContentAccess } from "@/lib/content-storage/access";

const request = new Request("http://localhost/api/contents/storage/drafts");

const profile = (role: "admin" | "media", mediaId: string | null) => ({
  clerkUser: { id: `user-${role}`, email: `${role}@example.com` },
  userAccess: {
    clerkUserId: `user-${role}`,
    email: `${role}@example.com`,
    role,
    workspaceId: "workspace-1",
    athleteId: null,
    partnerId: null,
    mediaId,
    status: "active",
    createdAt: "2026-09-15T10:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
  },
});

describe("content storage media access", () => {
  beforeEach(() => {
    getCurrentUserAccessProfileMock.mockReset();
  });

  it("allows an active admin without mediaId", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue(profile("admin", null));

    await expect(requireContentAccess(request)).resolves.toEqual({
      clerkUserId: "user-admin",
      workspaceId: "workspace-1",
      mediaId: null,
      role: "admin",
      isAdmin: true,
    });
  });

  it("returns the mediaId resolved from the active media session", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue(
      profile("media", "11111111-1111-4111-8111-111111111111"),
    );

    await expect(requireContentAccess(request)).resolves.toEqual({
      clerkUserId: "user-media",
      workspaceId: "workspace-1",
      mediaId: "11111111-1111-4111-8111-111111111111",
      role: "media",
      isAdmin: false,
    });
  });

  it("refuses an active media access without mediaId", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue(profile("media", null));

    await expect(requireContentAccess(request)).rejects.toEqual(
      expect.objectContaining<Partial<ContentAccessError>>({ code: "FORBIDDEN" }),
    );
  });
});
