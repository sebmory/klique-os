import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireContentAccess: vi.fn(),
  validateRequest: vi.fn(),
  collect: vi.fn(),
  createCollection: vi.fn(),
  projectCollection: vi.fn((response) => response),
}));

vi.mock("@/lib/content-storage/access", () => ({
  requireContentAccess: mocks.requireContentAccess,
  contentAccessErrorResponse: vi.fn(() => null),
}));

vi.mock("@/services/context-intelligence/request-validation", () => ({
  validateContextCollectionRequest: mocks.validateRequest,
}));

vi.mock("@/services/context-intelligence/collector", () => ({
  collectContextIntelligence: mocks.collect,
  toContextCollectionErrorResponse: vi.fn((error) => ({
    ok: false,
    code: "INVALID_CONTEXT_REQUEST",
    message: error instanceof Error ? error.message : "error",
  })),
}));

vi.mock("@/services/context-intelligence/collection-service", () => ({
  createEditorialContextCollection: mocks.createCollection,
  projectEditorialCollectionForAccess: mocks.projectCollection,
}));

import { POST } from "@/app/api/context/collect/route";

describe("context collection route workspace security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireContentAccess.mockResolvedValue({
      clerkUserId: "user-1",
      workspaceId: "workspace-server",
      mediaId: "11111111-1111-4111-8111-111111111111",
      role: "media",
      isAdmin: false,
    });
    mocks.validateRequest.mockReturnValue({
      workspaceId: "",
      subject: {
        id: "athlete-1",
        type: "person",
        source: "crm",
        displayName: "Mila Martin",
      },
      selectedConnectorIds: ["crm"],
      dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
      sourcePreference: "official_and_reliable",
      searchDepth: "standard",
      language: "fr",
      contentType: "interview",
    });
    mocks.collect.mockResolvedValue({
      ok: true,
      items: [],
      reports: [],
      summary: {
        totalItemsFound: 0,
        selectedItemsCount: 0,
        externalSourcesCount: 0,
        researchedAt: "2026-10-19T10:00:00.000Z",
        dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
        warnings: [],
      },
    });
    mocks.createCollection.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expiresAt: "2026-10-19T10:30:00.000Z",
    });
  });

  it("ignores client workspace identifiers and injects authenticated workspace", async () => {
    const response = await POST(new Request("http://localhost/api/context/collect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: "workspace-client",
        subject: { workspaceId: "workspace-client", displayName: "Mila Martin" },
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.collect).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-server",
        subject: expect.objectContaining({ workspaceId: "workspace-server" }),
      }),
      expect.objectContaining({
        workspaceId: "workspace-server",
        role: "media",
      }),
    );
  });
});
