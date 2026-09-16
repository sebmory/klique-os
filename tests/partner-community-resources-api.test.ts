import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPartnerCommunityResourceByIdMock, loadPartnerCommunityResourcesMock } = vi.hoisted(() => ({
  getPartnerCommunityResourceByIdMock: vi.fn(),
  loadPartnerCommunityResourcesMock: vi.fn(),
}));

vi.mock("@/lib/hub-resources/service", () => ({
  getPartnerCommunityResourceById: getPartnerCommunityResourceByIdMock,
  loadPartnerCommunityResources: loadPartnerCommunityResourcesMock,
}));

import { GET as getResource } from "@/app/api/partner/resources/[resourceId]/route";
import { GET as listResources } from "@/app/api/partner/resources/route";

const resource = {
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
};

describe("partner community resources API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the public resource list", async () => {
    loadPartnerCommunityResourcesMock.mockResolvedValue([resource]);

    const response = await listResources(new Request("http://localhost/api/partner/resources"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ resources: [resource] });
  });

  it("returns one public resource", async () => {
    getPartnerCommunityResourceByIdMock.mockResolvedValue(resource);
    const request = new Request("http://localhost/api/partner/resources/resource-1");

    const response = await getResource(request, { params: Promise.resolve({ resourceId: "resource-1" }) });

    expect(response.status).toBe(200);
    expect(getPartnerCommunityResourceByIdMock).toHaveBeenCalledWith(request, "resource-1");
    await expect(response.json()).resolves.toEqual({ resource });
  });

  it.each([
    ["Unauthorized", 401],
    ["Forbidden", 403],
  ])("maps list %s to HTTP %i", async (message, status) => {
    loadPartnerCommunityResourcesMock.mockRejectedValue(new Error(message));

    const response = await listResources(new Request("http://localhost/api/partner/resources"));

    expect(response.status).toBe(status);
  });

  it.each([
    ["Unauthorized", 401],
    ["Forbidden", 403],
    ["NotFound", 404],
  ])("maps detail %s to HTTP %i", async (message, status) => {
    getPartnerCommunityResourceByIdMock.mockRejectedValue(new Error(message));

    const response = await getResource(
      new Request("http://localhost/api/partner/resources/resource-1"),
      { params: Promise.resolve({ resourceId: "resource-1" }) },
    );

    expect(response.status).toBe(status);
  });
});