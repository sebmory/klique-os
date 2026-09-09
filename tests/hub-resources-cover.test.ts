import { beforeEach, describe, expect, it, vi } from "vitest";

const { putMock, sqlMock, createContentStorageClientMock, getCurrentUserAccessProfileMock } = vi.hoisted(() => ({
  putMock: vi.fn(),
  sqlMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  getCurrentUserAccessProfileMock: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: putMock }));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: () => "klique-os",
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

import {
  createHubResource,
  normalizeCoverImageUrl,
  updateHubResource,
} from "@/lib/hub-resources/service";
import {
  MAX_HUB_RESOURCE_COVER_BYTES,
  isAllowedHubResourceCoverContentType,
  uploadHubResourceCover,
} from "@/lib/hub-resources/cover-upload";

const buildFile = (type: string, size: number) =>
  new File([new Uint8Array(size)], "cover", { type });

const baseInput = {
  title: "Titre",
  category: "Mental",
  author: "KLIQUE",
  type: "Article",
  description: "Description",
  content: "Contenu editorial",
  status: "published",
  date: "2026-09-09",
};

type SqlCall = { text: string; values: unknown[] };

const installSqlMock = () => {
  const calls: SqlCall[] = [];
  sqlMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(" ").toLowerCase();
    calls.push({ text, values });
    if (text.includes("insert into hub_resources") || text.includes("update hub_resources")) {
      const coverValue = values.find((value) => typeof value === "string" && value.startsWith("https://")) ?? null;
      return [
        {
          id: "resource-1",
          title: baseInput.title,
          category: baseInput.category,
          author: baseInput.author,
          type: baseInput.type,
          description: baseInput.description,
          content: baseInput.content,
          url: null,
          cover_image_url: coverValue,
          status: "published",
          published_at: "2026-09-09",
          created_at: "2026-09-09T00:00:00.000Z",
          updated_at: "2026-09-09T00:00:00.000Z",
        },
      ];
    }
    return [];
  });
  createContentStorageClientMock.mockReturnValue(sqlMock);
  return calls;
};

const mockAdmin = () => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: "user_admin" },
    userAccess: { role: "admin", status: "active", workspaceId: "klique-os" },
  });
};

describe("normalizeCoverImageUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts an https url", () => {
    expect(normalizeCoverImageUrl("https://blob.example.com/hub-resources/covers/a.jpg")).toBe(
      "https://blob.example.com/hub-resources/covers/a.jpg",
    );
  });

  it("returns null for http, empty, non-string and malformed values", () => {
    expect(normalizeCoverImageUrl("http://blob.example.com/a.jpg")).toBeNull();
    expect(normalizeCoverImageUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeCoverImageUrl("")).toBeNull();
    expect(normalizeCoverImageUrl("   ")).toBeNull();
    expect(normalizeCoverImageUrl("pas-une-url")).toBeNull();
    expect(normalizeCoverImageUrl(null)).toBeNull();
    expect(normalizeCoverImageUrl(undefined)).toBeNull();
    expect(normalizeCoverImageUrl(42)).toBeNull();
  });
});

describe("hub resource cover upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putMock.mockResolvedValue({ url: "https://blob.example.com/hub-resources/covers/a.jpg" });
  });

  it("allows only JPEG and PNG content types", () => {
    expect(isAllowedHubResourceCoverContentType("image/jpeg")).toBe(true);
    expect(isAllowedHubResourceCoverContentType("image/png")).toBe(true);
    expect(isAllowedHubResourceCoverContentType("image/webp")).toBe(false);
    expect(isAllowedHubResourceCoverContentType("application/pdf")).toBe(false);
    expect(isAllowedHubResourceCoverContentType("text/html")).toBe(false);
  });

  it("uploads a JPEG under the hub-resources/covers prefix and returns only the url", async () => {
    const result = await uploadHubResourceCover(buildFile("image/jpeg", 1024));

    expect(putMock).toHaveBeenCalledTimes(1);
    const [pathname, , options] = putMock.mock.calls[0];
    expect(String(pathname)).toMatch(/^hub-resources\/covers\/\d+-[0-9a-f-]+\.jpg$/);
    expect(options).toEqual({ access: "public", contentType: "image/jpeg" });
    expect(result).toEqual({ url: "https://blob.example.com/hub-resources/covers/a.jpg" });
  });

  it("uploads a PNG with the png extension", async () => {
    await uploadHubResourceCover(buildFile("image/png", 1024));
    expect(String(putMock.mock.calls[0][0])).toMatch(/\.png$/);
  });

  it("rejects non JPEG/PNG files without touching the blob store", async () => {
    await expect(uploadHubResourceCover(buildFile("application/pdf", 1024))).rejects.toThrow(/JPEG, PNG/);
    await expect(uploadHubResourceCover(buildFile("image/webp", 1024))).rejects.toThrow(/JPEG, PNG/);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("rejects files above 4 Mo and accepts the limit itself", async () => {
    await expect(
      uploadHubResourceCover(buildFile("image/jpeg", MAX_HUB_RESOURCE_COVER_BYTES + 1)),
    ).rejects.toThrow(/4 Mo/);
    expect(putMock).not.toHaveBeenCalled();

    await expect(uploadHubResourceCover(buildFile("image/png", MAX_HUB_RESOURCE_COVER_BYTES))).resolves.toEqual({
      url: "https://blob.example.com/hub-resources/covers/a.jpg",
    });
  });
});

describe("hub resource cover persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdmin();
  });

  it("persists an https cover on create", async () => {
    const calls = installSqlMock();
    const resource = await createHubResource(
      new Request("http://localhost"),
      { ...baseInput, coverImageUrl: "https://blob.example.com/hub-resources/covers/a.jpg" },
      "user_admin",
    );

    const insert = calls.find((call) => call.text.includes("insert into hub_resources"));
    expect(insert?.values).toContain("https://blob.example.com/hub-resources/covers/a.jpg");
    expect(resource.coverImageUrl).toBe("https://blob.example.com/hub-resources/covers/a.jpg");
  });

  it("stores null on create when the cover is absent or not https", async () => {
    const calls = installSqlMock();
    const withoutCover = await createHubResource(new Request("http://localhost"), baseInput, "user_admin");
    expect(withoutCover.coverImageUrl).toBeNull();

    const insecure = await createHubResource(
      new Request("http://localhost"),
      { ...baseInput, coverImageUrl: "http://blob.example.com/a.jpg" },
      "user_admin",
    );
    expect(insecure.coverImageUrl).toBeNull();
    expect(calls.filter((call) => call.text.includes("insert into hub_resources"))).toHaveLength(2);
  });

  it("persists the cover on update and clears it when set to null", async () => {
    installSqlMock();
    const updated = await updateHubResource(
      new Request("http://localhost"),
      "resource-1",
      { ...baseInput, coverImageUrl: "https://blob.example.com/hub-resources/covers/b.png" },
      "user_admin",
    );
    expect(updated.coverImageUrl).toBe("https://blob.example.com/hub-resources/covers/b.png");

    const cleared = await updateHubResource(
      new Request("http://localhost"),
      "resource-1",
      { ...baseInput, coverImageUrl: null },
      "user_admin",
    );
    expect(cleared.coverImageUrl).toBeNull();
  });

  it("refuses to write a cover for a non-admin user", async () => {
    installSqlMock();
    getCurrentUserAccessProfileMock.mockResolvedValue({
      clerkUser: { id: "user_athlete" },
      userAccess: { role: "athlete", status: "active", workspaceId: "klique-os" },
    });

    await expect(
      createHubResource(
        new Request("http://localhost"),
        { ...baseInput, coverImageUrl: "https://blob.example.com/hub-resources/covers/a.jpg" },
        "user_athlete",
      ),
    ).rejects.toThrow("Forbidden");
  });
});

describe("hub resource cover upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putMock.mockResolvedValue({ url: "https://blob.example.com/hub-resources/covers/a.jpg" });
  });

  const postCover = async (file: File | null) => {
    const { POST } = await import("@/app/api/hub-resources/cover/route");
    const formData = new FormData();
    if (file) formData.append("file", file);
    const request = new Request("http://localhost/api/hub-resources/cover", { method: "POST", body: formData });
    return POST(request as never);
  };

  it("returns the blob url for an admin uploading a JPEG", async () => {
    mockAdmin();
    const response = await postCover(buildFile("image/jpeg", 2048));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      url: "https://blob.example.com/hub-resources/covers/a.jpg",
    });
  });

  it("rejects a non-admin user", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue({
      clerkUser: { id: "user_media" },
      userAccess: { role: "media", status: "active", workspaceId: "klique-os" },
    });

    const response = await postCover(buildFile("image/png", 2048));

    expect(response.status).toBe(403);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("rejects an inactive admin", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue({
      clerkUser: { id: "user_admin" },
      userAccess: { role: "admin", status: "revoked", workspaceId: "klique-os" },
    });

    const response = await postCover(buildFile("image/png", 2048));
    expect(response.status).toBe(403);
  });

  it("rejects a missing file, an unsupported type and an oversized image", async () => {
    mockAdmin();

    expect((await postCover(null)).status).toBe(400);
    expect((await postCover(buildFile("application/pdf", 2048))).status).toBe(400);
    expect((await postCover(buildFile("image/jpeg", MAX_HUB_RESOURCE_COVER_BYTES + 1))).status).toBe(400);
    expect(putMock).not.toHaveBeenCalled();
  });
});
