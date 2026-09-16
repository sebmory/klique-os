import { beforeEach, describe, expect, it, vi } from "vitest";

const { createContentStorageClientMock, getCurrentUserAccessProfileMock, sqlMock } = vi.hoisted(() => ({
  createContentStorageClientMock: vi.fn(),
  getCurrentUserAccessProfileMock: vi.fn(),
  sqlMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: () => "klique-os",
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

import {
  getPartnerCommunityResourceById,
  loadPartnerCommunityResources,
} from "@/lib/hub-resources/service";

const request = new Request("http://localhost/api/partner/resources");

const resourceRow = {
  id: "resource-1",
  workspace_id: "workspace-a",
  title: "Guide récupération",
  category: "Santé",
  author: "KLIQUE",
  type: "Guide",
  description: "Conseils pratiques",
  content: "Contenu éditorial complet",
  url: "https://example.com/guide",
  cover_image_url: "https://cdn.example.com/guide.png",
  status: "published",
  published_at: "2026-09-16T10:00:00.000Z",
  author_clerk_user_id: "user_admin_secret",
  created_at: "2026-09-15T10:00:00.000Z",
  updated_at: "2026-09-16T11:00:00.000Z",
};

const normalizeSql = (call: unknown[]): string =>
  (call[0] as TemplateStringsArray).join(" ").replace(/\s+/g, " ").trim().toLowerCase();

const asPartner = (overrides: Record<string, unknown> = {}) => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: "user_partner" },
    userAccess: {
      role: "partner_expert",
      status: "active",
      workspaceId: "workspace-a",
      ...overrides,
    },
  });
};

describe("partner community resources service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asPartner();
    createContentStorageClientMock.mockReturnValue(sqlMock);
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = strings.join(" ").toLowerCase();
      if (text.includes("select id, title") && text.includes("from hub_resources")) {
        return [resourceRow];
      }
      return [];
    });
  });

  it("lists only published resources from the session workspace through the public DTO", async () => {
    const resources = await loadPartnerCommunityResources(request);

    const selectCall = sqlMock.mock.calls.find((call) =>
      normalizeSql(call).includes("select id, title") && !normalizeSql(call).includes("where id ="),
    );
    expect(selectCall?.[1]).toBe("workspace-a");
    expect(normalizeSql(selectCall ?? [])).toContain("where workspace_id =");
    expect(normalizeSql(selectCall ?? [])).toContain("and status = 'published'");
    expect(normalizeSql(selectCall ?? []).split(" from ")[0]).not.toMatch(/workspace_id|status|clerk|created_at|updated_at/);
    expect(resources).toEqual([{
      id: "resource-1",
      title: "Guide récupération",
      category: "Santé",
      author: "KLIQUE",
      type: "Guide",
      description: "Conseils pratiques",
      content: "Contenu éditorial complet",
      url: "https://example.com/guide",
      coverImageUrl: "https://cdn.example.com/guide.png",
      date: "2026-09-16",
    }]);
    expect(Object.keys(resources[0])).toEqual([
      "id",
      "title",
      "category",
      "author",
      "type",
      "description",
      "content",
      "url",
      "coverImageUrl",
      "date",
    ]);
  });

  it("loads a published detail by id and workspace", async () => {
    const resource = await getPartnerCommunityResourceById(request, " resource-1 ");

    const selectCall = sqlMock.mock.calls.find((call) => normalizeSql(call).includes("where id ="));
    expect(selectCall?.[1]).toBe("resource-1");
    expect(selectCall?.[2]).toBe("workspace-a");
    expect(normalizeSql(selectCall ?? [])).toContain("and status = 'published'");
    expect(resource.id).toBe("resource-1");
  });

  it.each(["absent", "draft", "other-workspace"])("returns NotFound for a %s resource", async () => {
    sqlMock.mockImplementation(async () => []);

    await expect(getPartnerCommunityResourceById(request, "resource-hidden")).rejects.toThrow("NotFound");
  });

  it.each([
    { role: "athlete", status: "active", workspaceId: "workspace-a" },
    { role: "partner_expert", status: "disabled", workspaceId: "workspace-a" },
    { role: "partner_expert", status: "active", workspaceId: "" },
  ])("refuses access without an active partner workspace: %o", async (userAccess) => {
    getCurrentUserAccessProfileMock.mockResolvedValue({
      clerkUser: { id: "user_partner" },
      userAccess,
    });

    await expect(loadPartnerCommunityResources(request)).rejects.toThrow("Forbidden");
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns Unauthorized without an authenticated Clerk user", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue(null);

    await expect(loadPartnerCommunityResources(request)).rejects.toThrow("Unauthorized");
    expect(sqlMock).not.toHaveBeenCalled();
  });
});