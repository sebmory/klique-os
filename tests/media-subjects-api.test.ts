import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, createContentStorageClientMock, getCurrentUserAccessProfileMock, getAthletesFromGoogleSheetsMock } =
  vi.hoisted(() => ({
    sqlMock: vi.fn(),
    createContentStorageClientMock: vi.fn(),
    getCurrentUserAccessProfileMock: vi.fn(),
    getAthletesFromGoogleSheetsMock: vi.fn(),
  }));

vi.mock("@/lib/google-sheets", () => ({
  getAthletesFromGoogleSheets: getAthletesFromGoogleSheetsMock,
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: () => "klique-os",
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

import { DELETE, GET, PATCH, POST } from "@/app/api/media-subjects/route";

const subjectRow = {
  id: "subject-1",
  workspace_id: "klique-os",
  title: "Retour de blessure",
  summary: "Resume du sujet",
  angle: "Angle editorial",
  sport: "Tennis",
  location: "Fribourg",
  subject_date: "2026-09-08",
  cover_image_url: "https://blob.example.com/media-subjects/a.jpg",
  available_request_types: ["interview", "images"],
  status: "published",
  published_at: "2026-09-08T10:00:00.000Z",
  created_at: "2026-09-08T09:00:00.000Z",
  updated_at: "2026-09-08T10:00:00.000Z",
  athlete_ids: ["athlete-1"],
};

let calls: string[] = [];

const installSqlMock = () => {
  calls = [];
  getAthletesFromGoogleSheetsMock.mockResolvedValue([
    { key: "athlete-1", name: "Mila Benjak" },
    { key: "athlete-secret", name: "Athlete Confidentiel" },
  ]);
  sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
    const text = strings.join(" ").toLowerCase();
    calls.push(text);
    if (text.includes("from media_subjects s")) return [subjectRow];
    if (text.includes("update media_subjects") || text.includes("delete from media_subjects")) {
      return [{ id: "subject-1" }];
    }
    return [];
  });
  createContentStorageClientMock.mockReturnValue(sqlMock);
};

const asRole = (role: string, status = "active", workspaceId = "klique-os") => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: `user_${role}` },
    userAccess: { role, status, workspaceId, athleteId: null, partnerId: null, mediaId: null },
  });
};

const body = {
  title: "Retour de blessure",
  summary: "Resume du sujet",
  angle: "Angle editorial",
  sport: "Tennis",
  location: "Fribourg",
  date: "2026-09-08",
  coverImageUrl: "https://blob.example.com/media-subjects/a.jpg",
  availableRequestTypes: ["interview", "images"],
  athleteIds: ["athlete-1"],
  status: "published",
};

const jsonRequest = (payload: Record<string, unknown>) =>
  new Request("http://localhost/api/media-subjects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

describe("media subjects API authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("lets an active media user read the published subjects", async () => {
    asRole("media");

    const response = await GET(new Request("http://localhost/api/media-subjects"));
    const payload = (await response.json()) as {
      ok: boolean;
      subjects: Array<{ id: string; status: string; athleteIds: string[]; athletes: Array<{ id: string; name: string }> }>;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.subjects[0]).toMatchObject({ id: "subject-1", status: "published" });
    expect(payload.subjects.every((subject) => subject.status === "published")).toBe(true);
    expect(payload.subjects[0].athletes).toEqual([{ id: "athlete-1", name: "Mila Benjak" }]);
    expect(payload.subjects[0].athleteIds).toEqual(["athlete-1"]);
    expect(JSON.stringify(payload)).not.toContain("Athlete Confidentiel");
  });

  it("lets an admin read and write", async () => {
    asRole("admin");

    expect((await GET(new Request("http://localhost/api/media-subjects"))).status).toBe(200);
    expect((await POST(jsonRequest(body))).status).toBe(201);
    expect((await PATCH(jsonRequest({ ...body, subjectId: "subject-1" }))).status).toBe(200);
    expect(
      (await DELETE(new Request("http://localhost/api/media-subjects?subjectId=subject-1", { method: "DELETE" })))
        .status,
    ).toBe(200);
  });

  it("refuses every write for an active media user", async () => {
    asRole("media");

    expect((await POST(jsonRequest(body))).status).toBe(403);
    expect((await PATCH(jsonRequest({ ...body, subjectId: "subject-1" }))).status).toBe(403);
    expect(
      (await DELETE(new Request("http://localhost/api/media-subjects?subjectId=subject-1", { method: "DELETE" })))
        .status,
    ).toBe(403);

    expect(calls.some((text) => text.includes("insert into media_subjects"))).toBe(false);
    expect(calls.some((text) => text.includes("update media_subjects"))).toBe(false);
    expect(calls.some((text) => text.includes("delete from media_subjects"))).toBe(false);
  });

  it("refuses an athlete, a partner and an inactive media user", async () => {
    asRole("athlete");
    expect((await GET(new Request("http://localhost/api/media-subjects"))).status).toBe(403);

    asRole("partner_expert");
    expect((await GET(new Request("http://localhost/api/media-subjects"))).status).toBe(403);

    asRole("media", "disabled");
    expect((await GET(new Request("http://localhost/api/media-subjects"))).status).toBe(403);
  });

  it("refuses an unauthenticated caller", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue(null);

    expect((await GET(new Request("http://localhost/api/media-subjects"))).status).toBe(401);
  });

  it("returns 400 on an invalid subject and 400 without subjectId", async () => {
    asRole("admin");

    expect((await POST(jsonRequest({ ...body, availableRequestTypes: [] }))).status).toBe(400);
    expect((await PATCH(jsonRequest(body))).status).toBe(400);
  });
});
