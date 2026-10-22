import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  del: vi.fn(),
  validate: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: mocks.put,
  del: mocks.del,
}));

vi.mock("@/lib/story-studio/photo-service", () => ({
  validateStoryStudioPhotoBytes: mocks.validate,
}));

import {
  deleteAthleteNewsPhoto,
  uploadAthleteNewsPhoto,
} from "@/lib/athlete-news-reports/photo";

describe("athlete news private photo storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      "KLIQUE_ATHLETE_NEWS_BLOB_READ_WRITE_TOKEN",
      "vercel_blob_rw_private-athlete-news_test-secret",
    );
    mocks.validate.mockReturnValue({
      contentType: "image/jpeg",
      width: 640,
      height: 480,
      sizeBytes: 12,
    });
    mocks.put.mockResolvedValue({
      url: "https://private-test.private.blob.vercel-storage.com/athlete-news-reports/photo.jpg",
      pathname: "athlete-news-reports/photo.jpg",
    });
  });

  it("uses only the dedicated token and private access for uploads", async () => {
    const photo = new File([new Uint8Array(12)], "photo.jpg", { type: "image/jpeg" });
    await uploadAthleteNewsPhoto(photo);

    expect(mocks.put).toHaveBeenCalledWith(
      expect.stringMatching(/^athlete-news-reports\/.+\.jpg$/),
      expect.any(Buffer),
      expect.objectContaining({
        access: "private",
        token: "vercel_blob_rw_private-athlete-news_test-secret",
      }),
    );
  });

  it("uses the dedicated token for deletion", async () => {
    await deleteAthleteNewsPhoto(
      "https://private-test.private.blob.vercel-storage.com/athlete-news-reports/photo.jpg",
    );

    expect(mocks.del).toHaveBeenCalledWith(
      "https://private-test.private.blob.vercel-storage.com/athlete-news-reports/photo.jpg",
      { token: "vercel_blob_rw_private-athlete-news_test-secret" },
    );
  });

  it("fails explicitly instead of falling back to the shared token", async () => {
    vi.stubEnv("KLIQUE_ATHLETE_NEWS_BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "shared-public-store-token");
    const photo = new File([new Uint8Array(12)], "photo.jpg", { type: "image/jpeg" });

    await expect(uploadAthleteNewsPhoto(photo))
      .rejects.toThrow("KLIQUE_ATHLETE_NEWS_BLOB_READ_WRITE_TOKEN est absent.");
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
