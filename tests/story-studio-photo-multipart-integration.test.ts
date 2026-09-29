import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireContentAccess: vi.fn(),
  createPhoto: vi.fn(),
  head: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/content-storage/access", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/content-storage/access")>(),
  requireContentAccess: mocks.requireContentAccess,
}));
vi.mock("@/lib/story-studio/photo-repository", () => ({
  StoryStudioPhotoRepository: { create: mocks.createPhoto },
}));
vi.mock("@vercel/blob", () => ({ head: mocks.head, del: mocks.del }));

import { POST as photoUpload } from "@/app/api/contents/storage/story-studio/photos/route";

const access = {
  clerkUserId: "user-1",
  workspaceId: "workspace-1",
  mediaId: "11111111-1111-4111-8111-111111111111",
  role: "media" as const,
  isAdmin: false,
};
const blobUrl = "https://studio.public.blob.vercel-storage.com/story-studio/photos/upload.png";
const photo = { id: "photo-real", athleteId: "athlete-1", blobUrl };

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer) => {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
};

const validPng = () => {
  const width = 400;
  const height = 400;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const pixels = Buffer.alloc(height * (1 + width * 4));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const jsonRequest = (body: unknown) => new Request("http://localhost/api/contents/storage/story-studio/photos", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const createIntent = async (bytes: Uint8Array) => {
  const response = await photoUpload(jsonRequest({
    action: "create-upload-intent",
    athleteId: "athlete-1",
    contentType: "image/png",
    sizeBytes: bytes.byteLength,
  }));
  expect(response.status).toBe(200);
  return response.json() as Promise<{ pathname: string; uploadIntent: string }>;
};

describe("Story Studio direct Blob upload integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test-store_test-secret");
    mocks.requireContentAccess.mockResolvedValue(access);
    mocks.createPhoto.mockResolvedValue(photo);
    mocks.del.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("issues a client token then validates and persists the uploaded Blob", async () => {
    const bytes = validPng();
    const intent = await createIntent(bytes);
    const tokenResponse = await photoUpload(jsonRequest({
      type: "blob.generate-client-token",
      payload: { pathname: intent.pathname, multipart: true, clientPayload: intent.uploadIntent },
    }));
    expect(tokenResponse.status).toBe(200);
    await expect(tokenResponse.json()).resolves.toMatchObject({ type: "blob.generate-client-token" });

    mocks.head.mockResolvedValue({
      url: blobUrl,
      pathname: intent.pathname,
      contentType: "image/png",
      size: bytes.byteLength,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, { status: 200 })));

    const response = await photoUpload(jsonRequest({
      action: "register-upload",
      uploadIntent: intent.uploadIntent,
      blob: { url: blobUrl, pathname: intent.pathname },
    }));

    expect(response.status).toBe(201);
    expect(mocks.createPhoto).toHaveBeenCalledWith({
      athleteId: "athlete-1",
      blob: {
        url: blobUrl,
        pathname: intent.pathname,
        contentType: "image/png",
        width: 400,
        height: 400,
        sizeBytes: bytes.byteLength,
      },
    }, access);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("deletes the uploaded Blob when database persistence fails", async () => {
    const bytes = validPng();
    const intent = await createIntent(bytes);
    mocks.head.mockResolvedValue({
      url: blobUrl,
      pathname: intent.pathname,
      contentType: "image/png",
      size: bytes.byteLength,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, { status: 200 })));
    mocks.createPhoto.mockRejectedValueOnce(new Error("Neon unavailable"));

    const response = await photoUpload(jsonRequest({
      action: "register-upload",
      uploadIntent: intent.uploadIntent,
      blob: { url: blobUrl, pathname: intent.pathname },
    }));

    expect(response.status).toBe(500);
    expect(mocks.del).toHaveBeenCalledWith(blobUrl);
  });

  it("returns valid JSON when a legacy multipart upload body is received", async () => {
    const response = await photoUpload(new Request("http://localhost/api/contents/storage/story-studio/photos", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=legacy" },
      body: "--legacy\r\ncontent\r\n--legacy--",
    }));

    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ ok: false, message: expect.any(String) });
  });
});
