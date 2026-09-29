import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentAccessContext } from "@/lib/content-storage/access";

const { sqlMock, createContentStorageClientMock } = vi.hoisted(() => ({
  sqlMock: Object.assign(vi.fn(), { query: vi.fn() }),
  createContentStorageClientMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({ createContentStorageClient: createContentStorageClientMock }));

import { StoryStudioPhotoRepository } from "@/lib/story-studio/photo-repository";

const access: ContentAccessContext = {
  clerkUserId: "user-1",
  workspaceId: "workspace-1",
  mediaId: "11111111-1111-4111-8111-111111111111",
  role: "media",
  isAdmin: false,
};

const row = {
  id: "22222222-2222-4222-8222-222222222222",
  workspace_id: access.workspaceId,
  user_id: access.clerkUserId,
  media_id: access.mediaId,
  athlete_id: "athlete-1",
  blob_url: "https://studio.public.blob.vercel-storage.com/story-studio/photos/photo.webp",
  blob_pathname: "story-studio/photos/photo.webp",
  content_type: "image/webp",
  width_px: 1080,
  height_px: 1920,
  size_bytes: "2048",
  created_at: new Date("2026-09-28T12:00:00.123Z"),
};

const blob = {
  url: row.blob_url,
  pathname: row.blob_pathname,
  contentType: "image/webp" as const,
  width: 1080,
  height: 1920,
  sizeBytes: 2048,
};

const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("StoryStudioPhotoRepository", () => {
  beforeEach(() => {
    sqlMock.query.mockReset();
    createContentStorageClientMock.mockReset();
    createContentStorageClientMock.mockReturnValue(sqlMock);
  });

  it("persists Blob metadata with its workspace/user/media owner", async () => {
    sqlMock.query.mockResolvedValueOnce([row]);
    const photo = await StoryStudioPhotoRepository.create({ athleteId: "athlete-1", blob }, access);
    const [query, values] = sqlMock.query.mock.calls[0] as [string, unknown[]];

    expect(normalizeSql(query)).toContain("INSERT INTO story_studio_photos");
    expect(values).toContain(access.workspaceId);
    expect(values).toContain(access.clerkUserId);
    expect(values).toContain(access.mediaId);
    expect(photo).toMatchObject({
      athleteId: "athlete-1",
      blobUrl: row.blob_url,
      width: 1080,
      height: 1920,
      sizeBytes: 2048,
      createdAt: "2026-09-28T12:00:00.123Z",
    });
  });

  it("accepts the Brand Kit logo Blob prefix", async () => {
    const logoPathname = "story-studio/brand-kit-logos/elfic.png";
    const logoUrl = `https://studio.public.blob.vercel-storage.com/${logoPathname}`;
    sqlMock.query.mockResolvedValueOnce([{
      ...row,
      athlete_id: null,
      blob_url: logoUrl,
      blob_pathname: logoPathname,
      content_type: "image/png",
      width_px: 652,
      height_px: 296,
    }]);

    await expect(StoryStudioPhotoRepository.create({
      athleteId: null,
      blob: {
        ...blob,
        url: logoUrl,
        pathname: logoPathname,
        contentType: "image/png",
        width: 652,
        height: 296,
      },
    }, access)).resolves.toMatchObject({ blobPathname: logoPathname, width: 652, height: 296 });
    expect(sqlMock.query).toHaveBeenCalledOnce();
  });

  it("refuses metadata that does not originate from the Studio Blob prefix", async () => {
    await expect(StoryStudioPhotoRepository.create({
      athleteId: null,
      blob: { ...blob, url: "https://sheets.google.com/gallery/photo", pathname: "gallery/photo.jpg" },
    }, access)).rejects.toThrow(/upload Story Studio/);
    await expect(StoryStudioPhotoRepository.create({
      athleteId: null,
      blob: { ...blob, url: "https://sheets.google.com/gallery/photo" },
    }, access)).rejects.toThrow(/upload Story Studio/);
    await expect(StoryStudioPhotoRepository.create({
      athleteId: null,
      blob: {
        ...blob,
        url: "https://studio.public.blob.vercel-storage.com/story-studio/other/photo.webp",
        pathname: "story-studio/other/photo.webp",
      },
    }, access)).rejects.toThrow(/upload Story Studio/);
    expect(sqlMock.query).not.toHaveBeenCalled();
  });

  it("isolates reads by workspace, user and media", async () => {
    sqlMock.query.mockResolvedValueOnce([row]);
    await StoryStudioPhotoRepository.getById(row.id, access);
    const [query, values] = sqlMock.query.mock.calls[0] as [string, unknown[]];

    expect(normalizeSql(query)).toContain("workspace_id = $1");
    expect(normalizeSql(query)).toContain("user_id = $3");
    expect(normalizeSql(query)).toContain("OR media_id = $5::uuid");
    expect(values).toEqual([access.workspaceId, row.id, access.clerkUserId, false, access.mediaId]);
  });

  it("filters the owned catalog by athlete when requested", async () => {
    sqlMock.query.mockResolvedValueOnce([row]);
    const photos = await StoryStudioPhotoRepository.list("athlete-1", access);
    const [query, values] = sqlMock.query.mock.calls[0] as [string, unknown[]];

    expect(normalizeSql(query)).toContain("($5::text IS NULL OR athlete_id = $5)");
    expect(values).toEqual([access.workspaceId, access.clerkUserId, false, access.mediaId, "athlete-1"]);
    expect(photos).toHaveLength(1);
  });
});