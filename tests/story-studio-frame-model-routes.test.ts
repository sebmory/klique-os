import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentAccessError } from "@/lib/content-storage/access";
import { GET, POST } from "@/app/api/contents/storage/story-studio/frame-models/route";

const { repositoryMock, requireContentAccessMock } = vi.hoisted(() => ({
  repositoryMock: { list: vi.fn(), create: vi.fn() },
  requireContentAccessMock: vi.fn(),
}));

vi.mock("@/lib/story-studio/frame-model-repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/story-studio/frame-model-repository")>(),
  StoryStudioFrameModelRepository: repositoryMock,
}));
vi.mock("@/lib/content-storage/access", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/content-storage/access")>(),
  requireContentAccess: requireContentAccessMock,
}));

const access = { clerkUserId: "user-1", workspaceId: "workspace-1", mediaId: null, role: "admin" as const, isAdmin: true };
const input = {
  name: "Score premium",
  content: {
    schemaVersion: 1 as const,
    canvasFormat: "1080x1350" as const,
    templateKey: "editorial_klique" as const,
    brandKitId: null,
    brandKitSnapshot: null,
    frame: {
      text: { eyebrow: "Finale", headline: "Victoire", body: "Texte", interaction: "" },
      elements: { athleteName: true, score: true, competition: true, logo: true, signature: false, interactionZone: false },
    },
  },
};
const request = (method = "GET", body?: unknown) => new Request("http://localhost", {
  method,
  headers: body ? { "content-type": "application/json" } : undefined,
  body: body ? JSON.stringify(body) : undefined,
});

describe("Story Studio frame model routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireContentAccessMock.mockResolvedValue(access);
    repositoryMock.list.mockResolvedValue([]);
    repositoryMock.create.mockResolvedValue({ id: "model-1", workspaceId: access.workspaceId, ...input });
  });

  it("lists and creates models through the authenticated workspace repository", async () => {
    expect((await GET(request())).status).toBe(200);
    expect(repositoryMock.list).toHaveBeenCalledWith(access);
    expect((await POST(request("POST", input))).status).toBe(201);
    expect(repositoryMock.create).toHaveBeenCalledWith(input, access);
  });

  it("rejects excluded frame data before persistence", async () => {
    const response = await POST(request("POST", {
      ...input,
      content: { ...input.content, frame: { ...input.content.frame, photo: {} } },
    }));
    expect(response.status).toBe(400);
    expect(repositoryMock.create).not.toHaveBeenCalled();
  });

  it("maps access failures before repository calls", async () => {
    requireContentAccessMock.mockRejectedValueOnce(new ContentAccessError("FORBIDDEN"));
    expect((await GET(request())).status).toBe(403);
    expect(repositoryMock.list).not.toHaveBeenCalled();
  });
});