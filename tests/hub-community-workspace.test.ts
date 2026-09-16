import { beforeEach, describe, expect, it, vi } from "vitest";

const { createContentStorageClientMock, getCurrentUserAccessProfileMock, sqlMock } = vi.hoisted(() => ({
  createContentStorageClientMock: vi.fn(),
  getCurrentUserAccessProfileMock: vi.fn(),
  sqlMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

vi.mock("@/lib/google-sheets", () => ({
  getAthletesFromGoogleSheets: vi.fn(),
}));

import {
  createCommunityPublication,
  loadCommunityPublications,
  loadPartnerCommunityPublications,
} from "@/lib/hub-community/service";

const publicationRow = {
  id: "publication-1",
  author_clerk_user_id: "user_admin",
  author_role: "admin",
  author_name: "KLIQUE",
  author_specialty: "Communauté",
  type: "publication",
  title: "Actualité",
  content: "Contenu public",
  created_at: "2026-09-16T10:00:00.000Z",
};

const asUser = (role: "admin" | "athlete" | "partner_expert", workspaceId = "workspace-a") => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: `user_${role}`, email: `${role}@example.test` },
    userAccess: {
      role,
      status: "active",
      workspaceId,
      athleteId: role === "athlete" ? "athlete-1" : null,
      partnerId: role === "partner_expert" ? "partner-1" : null,
    },
  });
};

const sqlText = (call: unknown[]): string => (call[0] as TemplateStringsArray).join(" ").toLowerCase();

describe("community feed workspace isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createContentStorageClientMock.mockReturnValue(sqlMock);
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = strings.join(" ").toLowerCase();
      if (text.includes("from community_publications") && text.includes("where workspace_id")) {
        return [publicationRow];
      }
      if (text.includes("count(*)") && text.includes("community_reactions")) return [{ count: 0 }];
      return [];
    });
  });

  it.each(["admin", "athlete"] as const)("filters the existing %s read by the session workspace", async (role) => {
    asUser(role);

    await loadCommunityPublications(`user_${role}`, new Request("http://localhost/api/hub-community"));

    const selectCall = sqlMock.mock.calls.find((call) =>
      sqlText(call).includes("from community_publications") && sqlText(call).includes("where workspace_id"),
    );
    expect(selectCall?.[1]).toBe("workspace-a");
  });

  it("stores the Admin session workspace when creating a publication", async () => {
    asUser("admin");

    await createCommunityPublication(
      new Request("http://localhost/api/hub-community"),
      { title: "Actualité", content: "Contenu public", type: "publication" },
    );

    const insertCall = sqlMock.mock.calls.find((call) => sqlText(call).includes("insert into community_publications"));
    expect(sqlText(insertCall ?? [])).toContain("workspace_id");
    expect(insertCall?.[2]).toBe("workspace-a");
  });

  it("returns only the public partner fields from its workspace", async () => {
    asUser("partner_expert");

    const publications = await loadPartnerCommunityPublications(
      new Request("http://localhost/api/partner/community"),
    );

    expect(publications).toEqual([{
      id: "publication-1",
      type: "publication",
      title: "Actualité",
      content: "Contenu public",
      createdAt: "2026-09-16T10:00:00.000Z",
      authorDisplayName: "KLIQUE",
      authorRole: "admin",
      authorSpecialty: "Communauté",
    }]);
    expect(Object.keys(publications[0])).toEqual([
      "id",
      "type",
      "title",
      "content",
      "createdAt",
      "authorDisplayName",
      "authorRole",
      "authorSpecialty",
    ]);

    const selectCall = sqlMock.mock.calls.find((call) =>
      sqlText(call).includes("from community_publications") && sqlText(call).includes("where workspace_id"),
    );
    expect(selectCall?.[1]).toBe("workspace-a");
    expect(sqlText(selectCall ?? [])).not.toContain("author_clerk_user_id");
  });

  it.each([
    { role: "athlete", status: "active", workspaceId: "workspace-a", partnerId: null },
    { role: "partner_expert", status: "disabled", workspaceId: "workspace-a", partnerId: "partner-1" },
    { role: "partner_expert", status: "active", workspaceId: "", partnerId: "partner-1" },
    { role: "partner_expert", status: "active", workspaceId: "workspace-a", partnerId: null },
  ])("refuses an incomplete partner access: %o", async (userAccess) => {
    getCurrentUserAccessProfileMock.mockResolvedValue({
      clerkUser: { id: "user_partner" },
      userAccess,
    });

    await expect(loadPartnerCommunityPublications(
      new Request("http://localhost/api/partner/community"),
    )).rejects.toThrow("Forbidden");
  });
});