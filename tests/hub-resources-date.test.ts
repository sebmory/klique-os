import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, createContentStorageClientMock, getCurrentUserAccessProfileMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  getCurrentUserAccessProfileMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: () => "klique-os",
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

import { createHubResource, normalizeResourceDate, updateHubResource } from "@/lib/hub-resources/service";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const baseInput = {
  title: "Le soupir physiologique",
  category: "Mental",
  author: "Rachel Meconi",
  type: "Guide",
  description: "Description",
  content: "Contenu editorial",
  status: "published",
  date: "2026-09-08",
};

type SqlCall = { text: string; values: unknown[] };

const installSqlMock = () => {
  const calls: SqlCall[] = [];
  sqlMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(" ").toLowerCase();
    calls.push({ text, values });
    if (text.includes("insert into hub_resources") || text.includes("update hub_resources")) {
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
          cover_image_url: null,
          status: "published",
          published_at: "2026-09-08 00:00:00+00",
          created_at: "2026-09-08T19:54:12.558Z",
          updated_at: "2026-09-08T19:54:12.558Z",
        },
      ];
    }
    return [];
  });
  createContentStorageClientMock.mockReturnValue(sqlMock);
  return calls;
};

const findWrittenPublishedAt = (calls: SqlCall[], statement: string) => {
  const call = calls.find((item) => item.text.includes(statement));
  return call?.values.find((value) => typeof value === "string" && DATE_ONLY.test(value)) ?? null;
};

describe("normalizeResourceDate", () => {
  it("rejects a local date string and converts it to a civil date", () => {
    expect(normalizeResourceDate("Tue Sep 08 2026 00:00:00 GMT+0200 (heure d’été d’Europe centrale)")).toBe("2026-09-08");
    expect(normalizeResourceDate("Tue Sep 08 2026")).toBe("2026-09-08");
  });

  it("keeps the civil date of ISO and Postgres timestamps", () => {
    expect(normalizeResourceDate("2026-09-08")).toBe("2026-09-08");
    expect(normalizeResourceDate("2026-09-08 00:00:00+00")).toBe("2026-09-08");
    expect(normalizeResourceDate("2026-09-08T19:54:12.558Z")).toBe("2026-09-08");
    expect(normalizeResourceDate(new Date("2026-09-08T19:54:12.558Z"))).toBe("2026-09-08");
  });

  it("returns null for empty, invalid and non-date values", () => {
    expect(normalizeResourceDate("")).toBeNull();
    expect(normalizeResourceDate("   ")).toBeNull();
    expect(normalizeResourceDate("pas-une-date")).toBeNull();
    expect(normalizeResourceDate(new Date("invalide"))).toBeNull();
    expect(normalizeResourceDate(null)).toBeNull();
    expect(normalizeResourceDate(undefined)).toBeNull();
    expect(normalizeResourceDate(20260908)).toBeNull();
  });
});

describe("hub resource published date persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserAccessProfileMock.mockResolvedValue({
      clerkUser: { id: "user_admin" },
      userAccess: { role: "admin", status: "active", workspaceId: "klique-os" },
    });
  });

  it("never writes a local date on create", async () => {
    const calls = installSqlMock();
    const resource = await createHubResource(
      new Request("http://localhost"),
      { ...baseInput, date: "Tue Sep 08 2026 00:00:00 GMT+0200 (heure d’été d’Europe centrale)" },
      "user_admin",
    );

    expect(findWrittenPublishedAt(calls, "insert into hub_resources")).toBe("2026-09-08");
    expect(resource.publishedAt).toBe("2026-09-08");
    expect(resource.date).toMatch(DATE_ONLY);
  });

  it("never writes a local date on update", async () => {
    const calls = installSqlMock();
    const resource = await updateHubResource(
      new Request("http://localhost"),
      "resource-1",
      { ...baseInput, date: "Tue Sep 08 2026 00:00:00 GMT+0200 (heure d’été d’Europe centrale)" },
      "user_admin",
    );

    expect(findWrittenPublishedAt(calls, "update hub_resources")).toBe("2026-09-08");
    expect(resource.publishedAt).toBe("2026-09-08");
  });

  it("writes null when the resource is a draft", async () => {
    const calls = installSqlMock();
    await updateHubResource(
      new Request("http://localhost"),
      "resource-1",
      { ...baseInput, status: "draft", date: "Tue Sep 08 2026" },
      "user_admin",
    );

    const update = calls.find((call) => call.text.includes("update hub_resources"));
    expect(update?.values).toContain(null);
    expect(findWrittenPublishedAt(calls, "update hub_resources")).toBeNull();
  });

  it("falls back to today when the published date is unusable", async () => {
    const calls = installSqlMock();
    await createHubResource(new Request("http://localhost"), { ...baseInput, date: "pas-une-date" }, "user_admin");

    expect(findWrittenPublishedAt(calls, "insert into hub_resources")).toBe(new Date().toISOString().slice(0, 10));
  });
});
