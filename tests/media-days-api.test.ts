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

import { DELETE, GET, PATCH, POST } from "@/app/api/media-days/route";
import { isAthleteAllowedRoute, isMediaAllowedApi, isPartnerAllowedApi } from "@/proxy";

const dayRow = {
  id: "day-1",
  workspace_id: "klique-os",
  title: "Media Day Fribourg",
  description: "Journee media KLIQUE",
  day_date: "2026-10-02",
  start_time: "09:00:00",
  end_time: "17:00:00",
  location: "Fribourg",
  capacity: 12,
  status: "open",
  created_at: "2026-09-10T09:00:00.000Z",
  updated_at: "2026-09-10T10:00:00.000Z",
  athletes: [
    { athlete_id: "athlete-1", status: "invited", slot_start: "09:30:00", slot_end: "10:00:00", responded_at: null, admin_note: null },
  ],
};

type SqlCall = { text: string; values: unknown[] };

let calls: SqlCall[] = [];

const installSqlMock = (
  options: {
    dayRows?: Array<Record<string, unknown>>;
    updateRows?: Array<Record<string, unknown>>;
    deleteRows?: Array<Record<string, unknown>>;
    linkRows?: Array<Record<string, unknown>>;
  } = {},
) => {
  const {
    dayRows = [dayRow],
    updateRows = [{ id: "day-1" }],
    deleteRows = [{ id: "day-1" }],
    linkRows = [{ day_status: "open", athlete_status: "invited" }],
  } = options;
  calls = [];
  sqlMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(" ").toLowerCase();
    calls.push({ text, values });

    if (text.includes("select d.status as day_status")) return linkRows;
    if (text.includes("from media_days d")) return dayRows;
    if (text.includes("update media_day_athletes")) return [{ media_day_id: "day-1" }];
    if (text.includes("update media_days")) return updateRows;
    if (text.includes("delete from media_days")) return deleteRows;
    return [];
  });
  createContentStorageClientMock.mockReturnValue(sqlMock);
};

const asRole = (
  role: string,
  options: { status?: string; workspaceId?: string; athleteId?: string | null } = {},
) => {
  const { status = "active", workspaceId = "klique-os", athleteId = "athlete-1" } = options;
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: `user_${role}`, email: `${role}@example.com` },
    userAccess: {
      clerkUserId: `user_${role}`,
      email: `${role}@example.com`,
      role,
      status,
      workspaceId,
      athleteId: role === "athlete" ? athleteId : null,
      partnerId: role === "partner_expert" ? "partner-1" : null,
      mediaId: role === "media" ? "media-1" : null,
    },
  });
};

const findCall = (fragment: string) => calls.find((call) => call.text.includes(fragment));

const createBody = {
  title: "Media Day Fribourg",
  description: "Journee media KLIQUE",
  date: "2026-10-02",
  startTime: "09:00",
  endTime: "17:00",
  location: "Fribourg",
  capacity: 12,
  status: "open",
  athletes: [{ athleteId: "athlete-1", slotStart: "09:30", slotEnd: "10:00" }],
};

const listRequest = () => new Request("http://localhost/api/media-days");

const jsonRequest = (payload: Record<string, unknown>, method = "POST") =>
  new Request("http://localhost/api/media-days", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

const deleteRequest = (search = "?mediaDayId=day-1") =>
  new Request(`http://localhost/api/media-days${search}`, { method: "DELETE" });

describe("media days API authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("lets an active admin read and write", async () => {
    asRole("admin");

    expect((await GET(listRequest())).status).toBe(200);
    expect((await POST(jsonRequest(createBody))).status).toBe(201);
    expect((await PATCH(jsonRequest({ ...createBody, mediaDayId: "day-1" }, "PATCH"))).status).toBe(200);
    expect((await DELETE(deleteRequest())).status).toBe(200);
  });

  it("lets an active athlete read its own media days", async () => {
    asRole("athlete");

    const response = await GET(listRequest());
    const payload = (await response.json()) as { ok: boolean; mediaDays: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.mediaDays[0]).toMatchObject({ id: "day-1", status: "open" });

    const select = findCall("from media_days d");
    expect(select?.text).toContain("d.status <> 'draft'");
    expect(select?.values).toContain("athlete-1");
    expect(select?.values).toContain(false);
  });

  it("refuses every admin write for an athlete", async () => {
    asRole("athlete");

    expect((await POST(jsonRequest(createBody))).status).toBe(403);
    expect((await PATCH(jsonRequest({ ...createBody, mediaDayId: "day-1" }, "PATCH"))).status).toBe(403);
    expect((await DELETE(deleteRequest())).status).toBe(403);

    expect(findCall("insert into media_days")).toBeUndefined();
    expect(findCall("update media_days")).toBeUndefined();
    expect(findCall("delete from media_days")).toBeUndefined();
  });

  it("refuses a media user, a partner, a disabled admin and an athlete without athleteId", async () => {
    asRole("media");
    expect((await GET(listRequest())).status).toBe(403);

    asRole("partner_expert");
    expect((await GET(listRequest())).status).toBe(403);

    asRole("admin", { status: "disabled" });
    expect((await GET(listRequest())).status).toBe(403);

    asRole("athlete", { athleteId: "  " });
    expect((await GET(listRequest())).status).toBe(403);
  });

  it("refuses an unauthenticated caller", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue(null);

    expect((await GET(listRequest())).status).toBe(401);
    expect((await POST(jsonRequest(createBody))).status).toBe(401);
    expect((await PATCH(jsonRequest({ mediaDayId: "day-1" }, "PATCH"))).status).toBe(401);
    expect((await DELETE(deleteRequest())).status).toBe(401);
  });
});

describe("media days API athlete response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  const responseRequest = (payload: Record<string, unknown>) =>
    jsonRequest({ action: "athlete_response", ...payload }, "PATCH");

  it("records the response on the athlete own row only", async () => {
    asRole("athlete");

    const response = await PATCH(
      responseRequest({ mediaDayId: "day-1", response: "confirmed", athleteId: "athlete-2", workspaceId: "autre" }),
    );

    expect(response.status).toBe(200);
    const update = findCall("update media_day_athletes");
    expect(update?.text).toContain("responded_at = now()");
    expect(update?.values).toEqual(["confirmed", "day-1", "klique-os", "athlete-1"]);
    expect(update?.values).not.toContain("athlete-2");
    expect(update?.values).not.toContain("autre");
  });

  it("returns 400 on an invalid response and without mediaDayId", async () => {
    asRole("athlete");

    expect((await PATCH(responseRequest({ mediaDayId: "day-1", response: "peut-etre" }))).status).toBe(400);
    expect((await PATCH(responseRequest({ response: "confirmed" }))).status).toBe(400);
    expect(findCall("update media_day_athletes")).toBeUndefined();
  });

  it("returns 403 when the media day is not open or already answered", async () => {
    asRole("athlete");
    installSqlMock({ linkRows: [{ day_status: "draft", athlete_status: "invited" }] });
    expect((await PATCH(responseRequest({ mediaDayId: "day-1", response: "confirmed" }))).status).toBe(403);

    installSqlMock({ linkRows: [{ day_status: "open", athlete_status: "confirmed" }] });
    expect((await PATCH(responseRequest({ mediaDayId: "day-1", response: "declined" }))).status).toBe(403);
  });

  it("returns 404 when the athlete is not invited", async () => {
    asRole("athlete");
    installSqlMock({ linkRows: [] });

    expect((await PATCH(responseRequest({ mediaDayId: "day-1", response: "confirmed" }))).status).toBe(404);
  });

  it("refuses the athlete response action for an admin", async () => {
    asRole("admin");

    expect((await PATCH(responseRequest({ mediaDayId: "day-1", response: "confirmed" }))).status).toBe(403);
    expect(findCall("update media_day_athletes")).toBeUndefined();
  });
});

describe("media days API validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("returns 400 on an invalid payload and on missing identifiers", async () => {
    asRole("admin");

    expect((await POST(jsonRequest({ ...createBody, title: "  " }))).status).toBe(400);
    expect((await POST(jsonRequest({ ...createBody, endTime: "08:00" }))).status).toBe(400);
    expect((await PATCH(jsonRequest(createBody, "PATCH"))).status).toBe(400);
    expect((await DELETE(deleteRequest("?mediaDayId="))).status).toBe(400);

    const invalidJson = new Request("http://localhost/api/media-days", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "pas-du-json",
    });
    expect((await POST(invalidJson)).status).toBe(400);
  });

  it("returns 404 when the media day does not exist in the workspace", async () => {
    asRole("admin");

    installSqlMock({ updateRows: [] });
    expect((await PATCH(jsonRequest({ ...createBody, mediaDayId: "day-404" }, "PATCH"))).status).toBe(404);

    installSqlMock({ deleteRows: [] });
    expect((await DELETE(deleteRequest("?mediaDayId=day-404"))).status).toBe(404);
  });

  it("hides the server details on an unexpected failure", async () => {
    asRole("admin");
    sqlMock.mockRejectedValue(new Error("Neon credentials missing at /secret/path"));

    const response = await GET(listRequest());
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(500);
    expect(payload.message).toBe("Impossible de traiter les journees media.");
    expect(JSON.stringify(payload)).not.toContain("/secret/path");
  });
});

describe("media days proxy access", () => {
  it("opens the route to the athlete in read and response only", () => {
    expect(isAthleteAllowedRoute("/api/media-days", "GET")).toBe(true);
    expect(isAthleteAllowedRoute("/api/media-days", "PATCH")).toBe(true);

    for (const method of ["POST", "PUT", "DELETE"]) {
      expect(isAthleteAllowedRoute("/api/media-days", method)).toBe(false);
    }

    expect(isAthleteAllowedRoute("/api/media-days/day-1", "GET")).toBe(false);
  });

  it("closes the route to the media and partner roles", () => {
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      expect(isMediaAllowedApi("/api/media-days", method)).toBe(false);
      expect(isPartnerAllowedApi("/api/media-days", method)).toBe(false);
    }
  });

  it("keeps the other media routes unchanged", () => {
    expect(isMediaAllowedApi("/api/media-bank", "GET")).toBe(true);
    expect(isMediaAllowedApi("/api/media-requests", "POST")).toBe(true);
    expect(isAthleteAllowedRoute("/api/media-requests", "PATCH")).toBe(true);
  });
});
