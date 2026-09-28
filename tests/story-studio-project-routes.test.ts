import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentAccessError } from "@/lib/content-storage/access";
import { GET, PATCH } from "@/app/api/contents/storage/story-studio/projects/[projectId]/route";
import { POST as renderProject } from "@/app/api/contents/storage/story-studio/projects/[projectId]/render/route";

const { renderStoryStudioProjectPngMock, repositoryMock, requireContentAccessMock } = vi.hoisted(() => ({
  renderStoryStudioProjectPngMock: vi.fn(),
  repositoryMock: {
    getById: vi.fn(),
    update: vi.fn(),
  },
  requireContentAccessMock: vi.fn(),
}));

vi.mock("@/lib/story-studio/repository", () => ({
  StoryStudioProjectRepository: repositoryMock,
}));

vi.mock("@/lib/story-studio/png-renderer", () => ({
  renderStoryStudioProjectPng: renderStoryStudioProjectPngMock,
}));

vi.mock("@/lib/content-storage/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/content-storage/access")>();
  return {
    ...actual,
    requireContentAccess: requireContentAccessMock,
  };
});

const access = {
  clerkUserId: "user-1",
  workspaceId: "workspace-1",
  mediaId: "11111111-1111-4111-8111-111111111111",
  role: "media" as const,
  isAdmin: false,
};

const frame = (order: 1 | 2 | 3 | 4, role: "result" | "context" | "poll" | "question") => ({
  id: `frame-${order}`,
  order,
  role,
  sourceStoryIndex: order,
  text: { eyebrow: "", headline: "Titre", body: "", interaction: "" },
  photo: { assetId: null, visible: true, scale: 1, x: 0, y: 0 },
  elements: { athleteName: true, score: true, competition: true, logo: false, signature: true, interactionZone: order > 2 },
});

const payload = {
  schemaVersion: 1 as const,
  templateKey: "editorial_klique" as const,
  frames: [frame(1, "result"), frame(2, "context"), frame(3, "poll"), frame(4, "question")] as const,
};

const project = {
  id: "22222222-2222-4222-8222-222222222222",
  workspaceId: access.workspaceId,
  userId: access.clerkUserId,
  mediaId: access.mediaId,
  sourcePackId: "33333333-3333-4333-8333-333333333333",
  sourceStoriesVariantId: "variant-stories-1",
  sourceDocumentId: "document-1",
  athleteId: null,
  projectType: "after_match" as const,
  templateKey: payload.templateKey,
  status: "draft" as const,
  payload,
  version: 1,
  createdAt: "2026-09-28T10:00:00.000Z",
  updatedAt: "2026-09-28T10:00:00.000Z",
};

const params = { params: Promise.resolve({ projectId: project.id }) };
const jsonRequest = (body: unknown) => new Request("http://localhost", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("Story Studio project routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireContentAccessMock.mockResolvedValue(access);
    repositoryMock.getById.mockResolvedValue(project);
    repositoryMock.update.mockResolvedValue({ status: "updated", project: { ...project, version: 2 } });
    renderStoryStudioProjectPngMock.mockResolvedValue({
      bytes: new Uint8Array([137, 80, 78, 71]).buffer,
      filename: `story-studio-${project.id}.png`,
      placeholder: true,
    });
  });

  it("reads an accessible project", async () => {
    const response = await GET(new Request("http://localhost"), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, project: { id: project.id } });
    expect(repositoryMock.getById).toHaveBeenCalledWith(project.id, access);
  });

  it("returns 404 when the scoped project is absent", async () => {
    repositoryMock.getById.mockResolvedValueOnce(null);
    const response = await GET(new Request("http://localhost"), params);
    expect(response.status).toBe(404);
  });

  it("maps Clerk access errors", async () => {
    requireContentAccessMock.mockRejectedValueOnce(new ContentAccessError("UNAUTHORIZED"));
    const response = await GET(new Request("http://localhost"), params);
    expect(response.status).toBe(401);
  });

  it("validates and updates a project", async () => {
    const response = await PATCH(jsonRequest({
      expectedVersion: 1,
      athleteId: null,
      status: "draft",
      payload,
    }), params);

    expect(response.status).toBe(200);
    expect(repositoryMock.update).toHaveBeenCalledWith({
      projectId: project.id,
      expectedVersion: 1,
      athleteId: null,
      status: "draft",
      payload,
    }, access);
  });

  it("returns 400 for an invalid PATCH body", async () => {
    const response = await PATCH(jsonRequest({ expectedVersion: 0, payload }), params);
    expect(response.status).toBe(400);
    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  it("returns 409 with the current project on a version conflict", async () => {
    repositoryMock.update.mockResolvedValueOnce({
      status: "version_conflict",
      currentVersion: 2,
      current: { ...project, version: 2 },
    });
    const response = await PATCH(jsonRequest({
      expectedVersion: 1,
      athleteId: null,
      status: "draft",
      payload,
    }), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ currentVersion: 2 });
  });

  it("secures render access before returning the PNG bytes", async () => {
    const response = await renderProject(new Request("http://localhost", { method: "POST" }), params);

    expect(repositoryMock.getById).toHaveBeenCalledWith(project.id, access);
    expect(renderStoryStudioProjectPngMock).toHaveBeenCalledWith(project);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toContain(`story-studio-${project.id}.png`);
    expect(response.headers.get("x-story-studio-renderer")).toBe("stub");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });
});