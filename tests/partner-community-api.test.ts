import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadPartnerCommunityPublicationsMock } = vi.hoisted(() => ({
  loadPartnerCommunityPublicationsMock: vi.fn(),
}));

vi.mock("@/lib/hub-community/service", () => ({
  loadPartnerCommunityPublications: loadPartnerCommunityPublicationsMock,
}));

import { GET } from "@/app/api/partner/community/route";

const request = new Request("http://localhost/api/partner/community");

describe("GET /api/partner/community", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the public community projection", async () => {
    const publication = {
      id: "publication-1",
      type: "publication",
      title: "Actualité",
      content: "Contenu public",
      createdAt: "2026-09-16T10:00:00.000Z",
      authorDisplayName: "KLIQUE",
      authorRole: "admin",
      authorSpecialty: "Communauté",
    };
    loadPartnerCommunityPublicationsMock.mockResolvedValue([publication]);

    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ publications: [publication] });
  });

  it.each([
    ["Unauthorized", 401],
    ["Forbidden", 403],
  ])("maps %s to HTTP %i", async (message, status) => {
    loadPartnerCommunityPublicationsMock.mockRejectedValue(new Error(message));

    const response = await GET(request);

    expect(response.status).toBe(status);
  });
});