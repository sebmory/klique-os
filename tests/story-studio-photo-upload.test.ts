import { beforeEach, describe, expect, it, vi } from "vitest";

const { imageSizeMock } = vi.hoisted(() => ({ imageSizeMock: vi.fn() }));
vi.mock("image-size", () => ({ imageSize: imageSizeMock }));

import {
  createStoryStudioPhotoUploadIntent,
  validateStoryStudioPhotoBytes,
  verifyStoryStudioPhotoUploadIntent,
} from "@/lib/story-studio/photo-service";
import { MAX_STORY_STUDIO_PHOTO_BYTES } from "@/types/story-studio-photo";

const access = {
  clerkUserId: "user-1",
  workspaceId: "workspace-1",
  mediaId: "11111111-1111-4111-8111-111111111111",
  role: "media" as const,
  isAdmin: false,
};

describe("Story Studio client photo upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test-secret");
    imageSizeMock.mockReturnValue({ width: 1080, height: 1920, type: "jpg" });
  });

  it("signs an upload intent bound to the authenticated owner", () => {
    const result = createStoryStudioPhotoUploadIntent({
      athleteId: "athlete-1",
      contentType: "image/jpeg",
      sizeBytes: 13_105_574,
    }, access);

    expect(result.pathname).toMatch(/^story-studio\/photos\/[0-9a-f-]+\.jpg$/);
    expect(verifyStoryStudioPhotoUploadIntent(result.uploadIntent, access)).toMatchObject({
      pathname: result.pathname,
      athleteId: "athlete-1",
      contentType: "image/jpeg",
      sizeBytes: 13_105_574,
    });
    expect(() => verifyStoryStudioPhotoUploadIntent(result.uploadIntent, {
      ...access,
      clerkUserId: "user-2",
    })).toThrow(/non autorisée/);
  });

  it("enforces the 25 MB V1 limit and accepted MIME types", () => {
    expect(() => createStoryStudioPhotoUploadIntent({
      athleteId: null,
      contentType: "image/jpeg",
      sizeBytes: MAX_STORY_STUDIO_PHOTO_BYTES + 1,
    }, access)).toThrow(/25 Mo/);
    expect(() => createStoryStudioPhotoUploadIntent({
      athleteId: null,
      contentType: "image/gif",
      sizeBytes: 1024,
    }, access)).toThrow(/JPEG, PNG, WebP/);
  });

  it("validates MIME, dimensions and byte count from the uploaded Blob", () => {
    const bytes = new Uint8Array(1024);
    expect(validateStoryStudioPhotoBytes(bytes, "image/jpeg", bytes.byteLength)).toEqual({
      contentType: "image/jpeg",
      width: 1080,
      height: 1920,
      sizeBytes: 1024,
    });

    imageSizeMock.mockReturnValueOnce({ width: 1080, height: 1920, type: "png" });
    expect(() => validateStoryStudioPhotoBytes(bytes, "image/jpeg", bytes.byteLength)).toThrow(/type MIME/);
    imageSizeMock.mockReturnValueOnce({ width: 200, height: 1920, type: "jpg" });
    expect(() => validateStoryStudioPhotoBytes(bytes, "image/jpeg", bytes.byteLength)).toThrow(/320 et 8192/);
    expect(() => validateStoryStudioPhotoBytes(bytes, "image/jpeg", bytes.byteLength + 1)).toThrow(/taille du Blob/);
  });
});
