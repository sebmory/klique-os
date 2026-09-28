import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { ContentAccessError } from "@/lib/content-storage/access";
import { POST as openProject } from "@/app/api/contents/storage/story-studio/projects/route";
import { GET as listPhotos } from "@/app/api/contents/storage/story-studio/photos/route";

const mocks = vi.hoisted(() => ({
  requireContentAccess: vi.fn(),
  createOrGet: vi.fn(),
  listPhotos: vi.fn(),
  createPhoto: vi.fn(),
}));

vi.mock("@/lib/content-storage/access", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/content-storage/access")>(),
  requireContentAccess: mocks.requireContentAccess,
}));
vi.mock("@/lib/story-studio/repository", () => ({
  StoryStudioProjectRepository: { createOrGet: mocks.createOrGet },
}));
vi.mock("@/lib/story-studio/photo-repository", () => ({
  StoryStudioPhotoRepository: { list: mocks.listPhotos, create: mocks.createPhoto },
}));

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
  frames: [frame(1, "result"), frame(2, "context"), frame(3, "poll"), frame(4, "question")],
};

const project = { id: "project-1", version: 1, payload };
const photo = { id: "photo-1", athleteId: "athlete-1", blobUrl: "https://studio.public.blob.vercel-storage.com/photo.jpg" };

const jsonRequest = (body: unknown) => new Request("http://localhost", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const nextRequest = (url: string): NextRequest => ({ nextUrl: new URL(url) } as NextRequest);

describe("Story Studio collection routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireContentAccess.mockResolvedValue(access);
    mocks.createOrGet.mockResolvedValue(project);
    mocks.listPhotos.mockResolvedValue([photo]);
    mocks.createPhoto.mockResolvedValue(photo);
  });

  it("creates or reopens a project with the scoped access context", async () => {
    const input = {
      sourcePackId: "pack-1",
      sourceStoriesVariantId: "stories-1",
      sourceDocumentId: "document-1",
      athleteId: "athlete-1",
      payload,
    };
    const response = await openProject(jsonRequest(input));

    expect(response.status).toBe(200);
    expect(mocks.createOrGet).toHaveBeenCalledWith(input, access);
    await expect(response.json()).resolves.toMatchObject({ ok: true, project: { id: "project-1" } });
  });

  it("rejects an invalid project body before persistence", async () => {
    const response = await openProject(jsonRequest({ sourcePackId: "" }));
    expect(response.status).toBe(400);
    expect(mocks.createOrGet).not.toHaveBeenCalled();
  });

  it.each([
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
  ] as const)("maps %s access errors", async (code, status) => {
    mocks.requireContentAccess.mockRejectedValueOnce(new ContentAccessError(code));
    const response = await openProject(jsonRequest({}));
    expect(response.status).toBe(status);
    expect(mocks.createOrGet).not.toHaveBeenCalled();
  });

  it("lists only photos returned by the scoped repository", async () => {
    const response = await listPhotos(nextRequest("http://localhost/api/photos?athleteId=athlete-1"));
    expect(response.status).toBe(200);
    expect(mocks.listPhotos).toHaveBeenCalledWith("athlete-1", access);
    await expect(response.json()).resolves.toMatchObject({ photos: [{ id: "photo-1" }] });
  });
});