import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, createContentStorageClientMock, getCurrentUserAccessProfileMock, authMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  getCurrentUserAccessProfileMock: vi.fn(),
  authMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: () => "klique-os",
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

import { GET, POST } from "@/app/api/hub-resources/route";

const resourceRow = (id: string, status: "published" | "draft") => ({
  id,
  title: `Ressource ${id}`,
  category: "Mental",
  author: "KLIQUE",
  type: "Guide",
  description: "Description",
  content: "Contenu",
  url: null,
  cover_image_url: "https://blob.example.com/hub-resources/covers/a.jpg",
  status,
  published_at: "2026-09-08 00:00:00+00",
  created_at: "2026-09-08T19:54:12.558Z",
  updated_at: "2026-09-08T19:54:12.558Z",
});

const installSqlMock = () => {
  sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
    const text = strings.join(" ").toLowerCase();
    if (text.includes("select id from hub_resources limit 1")) {
      return [{ id: "published-1" }];
    }
    if (text.includes("select") && text.includes("cover_image_url") && text.includes("from hub_resources")) {
      return [resourceRow("published-1", "published"), resourceRow("draft-1", "draft")];
    }
    return [];
  });
  createContentStorageClientMock.mockReturnValue(sqlMock);
};

const asAthlete = () => {
  authMock.mockResolvedValue({ userId: "user_athlete" });
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: "user_athlete" },
    userAccess: { role: "athlete", status: "active", workspaceId: "klique-os", athleteId: "athlete-1" },
  });
};

const asAdmin = () => {
  authMock.mockResolvedValue({ userId: "user_admin" });
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: "user_admin" },
    userAccess: { role: "admin", status: "active", workspaceId: "klique-os" },
  });
};

const mutationBody = {
  resourceId: "published-1",
  title: "Titre",
  category: "Mental",
  author: "KLIQUE",
  type: "Guide",
  description: "Description",
  content: "Contenu",
  status: "published",
  date: "2026-09-08",
  coverImageUrl: "https://blob.example.com/hub-resources/covers/a.jpg",
};

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/hub-resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("hub resources GET authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("lets an active athlete read only the published resources", async () => {
    asAthlete();

    const response = await GET(new Request("http://localhost/api/hub-resources"));
    const payload = (await response.json()) as { resources: Array<{ id: string; status: string; coverImageUrl: string | null }> };

    expect(response.status).toBe(200);
    expect(payload.resources.map((resource) => resource.id)).toEqual(["published-1"]);
    expect(payload.resources[0].status).toBe("published");
    expect(payload.resources[0].coverImageUrl).toBe("https://blob.example.com/hub-resources/covers/a.jpg");
  });

  it("lets an admin read drafts and published resources", async () => {
    asAdmin();

    const response = await GET(new Request("http://localhost/api/hub-resources"));
    const payload = (await response.json()) as { resources: Array<{ id: string }> };

    expect(payload.resources.map((resource) => resource.id)).toEqual(["published-1", "draft-1"]);
  });
});

describe("hub resources mutations stay admin only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
    asAthlete();
  });

  it("refuses create, update and delete for an active athlete", async () => {
    const created = await post({ ...mutationBody, resourceId: undefined });
    const updated = await post(mutationBody);
    const deleted = await post({ action: "delete", resourceId: "published-1" });

    expect(created.status).toBe(403);
    expect(updated.status).toBe(403);
    expect(deleted.status).toBe(403);
  });

  it("refuses the cover upload for an active athlete", async () => {
    const { POST: uploadCover } = await import("@/app/api/hub-resources/cover/route");
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array(16)], "cover", { type: "image/png" }));

    const response = await uploadCover(
      new Request("http://localhost/api/hub-resources/cover", { method: "POST", body: formData }) as never,
    );

    expect(response.status).toBe(403);
  });
});
