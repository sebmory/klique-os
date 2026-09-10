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

import { GET, PATCH, POST } from "@/app/api/media-requests/route";

const subjectRow = {
  id: "subject-1",
  available_request_types: ["interview", "images"],
  athlete_ids: ["athlete-1", "athlete-2"],
};

const requestRow = {
  id: "request-1",
  workspace_id: "klique-os",
  subject_id: "subject-1",
  subject_title: "Retour de blessure",
  requested_by_clerk_user_id: "user_media",
  requester_email: "media@example.com",
  media_id: "media-1",
  request_type: "interview",
  message: "Nous souhaitons une interview.",
  deadline: "2026-09-20",
  status: "submitted",
  admin_note: null,
  created_at: "2026-09-10T09:00:00.000Z",
  updated_at: "2026-09-10T09:00:00.000Z",
  athletes: [{ athlete_id: "athlete-1", consent_status: "pending", responded_at: null }],
};

type SqlCall = { text: string; values: unknown[] };

let calls: SqlCall[] = [];

const installSqlMock = (
  options: {
    subjectRows?: Array<Record<string, unknown>>;
    updateRows?: Array<Record<string, unknown>>;
    linkRows?: Array<Record<string, unknown>>;
  } = {},
) => {
  const { subjectRows = [subjectRow], updateRows = [{ id: "request-1" }], linkRows = [{ status: "awaiting_athlete" }] } =
    options;
  calls = [];
  sqlMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(" ").toLowerCase();
    calls.push({ text, values });

    if (text.includes("from media_subjects s")) return subjectRows;
    if (text.includes("select r.status")) return linkRows;
    if (text.includes("from media_requests r")) return [requestRow];
    if (text.includes("update media_request_athletes")) return [{ request_id: "request-1" }];
    if (text.includes("update media_requests")) return updateRows;
    return [];
  });
  createContentStorageClientMock.mockReturnValue(sqlMock);
};

const asRole = (role: string, status = "active", workspaceId = "klique-os", athleteId: string | null = null) => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: `user_${role}`, email: `${role}@example.com` },
    userAccess: {
      clerkUserId: `user_${role}`,
      email: `${role}@example.com`,
      role,
      status,
      workspaceId,
      athleteId: role === "athlete" ? (athleteId ?? "athlete-1") : null,
      partnerId: null,
      mediaId: role === "media" ? "media-1" : null,
    },
  });
};

const findCall = (fragment: string) => calls.find((call) => call.text.includes(fragment));

const createBody = {
  subjectId: "subject-1",
  requestType: "interview",
  message: "Nous souhaitons une interview.",
  deadline: "2026-09-20",
  athleteIds: ["athlete-1"],
};

const listRequest = () => new Request("http://localhost/api/media-requests");

const jsonRequest = (payload: Record<string, unknown>, method = "POST") =>
  new Request("http://localhost/api/media-requests", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

describe("media requests API authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("lets an active media user create and read its own requests", async () => {
    asRole("media");

    const created = await POST(jsonRequest(createBody));
    expect(created.status).toBe(201);

    const response = await GET(listRequest());
    const payload = (await response.json()) as { ok: boolean; requests: Array<{ id: string; status: string }> };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.requests[0]).toMatchObject({ id: "request-1", status: "submitted" });
    expect(findCall("from media_requests r")?.values).toContain("user_media");
  });

  it("lets an admin read the whole workspace and update a request", async () => {
    asRole("admin");

    expect((await GET(listRequest())).status).toBe(200);
    expect(findCall("from media_requests r")?.values).toContain(true);

    const patched = await PATCH(jsonRequest({ requestId: "request-1", status: "accepted", adminNote: "OK" }, "PATCH"));
    expect(patched.status).toBe(200);
  });

  it("refuses creation for an admin and any update for a media user", async () => {
    asRole("admin");
    expect((await POST(jsonRequest(createBody))).status).toBe(403);

    asRole("media");
    expect((await PATCH(jsonRequest({ requestId: "request-1", status: "accepted" }, "PATCH"))).status).toBe(403);

    expect(findCall("insert into media_requests")).toBeUndefined();
    expect(findCall("update media_requests")).toBeUndefined();
  });

  it("refuses an athlete on write, a partner and a disabled media user", async () => {
    asRole("athlete");
    expect((await POST(jsonRequest(createBody))).status).toBe(403);

    asRole("partner_expert");
    expect((await GET(listRequest())).status).toBe(403);
    expect((await POST(jsonRequest(createBody))).status).toBe(403);

    asRole("media", "disabled");
    expect((await GET(listRequest())).status).toBe(403);
    expect((await POST(jsonRequest(createBody))).status).toBe(403);
  });

  it("refuses an unauthenticated caller", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue(null);

    expect((await GET(listRequest())).status).toBe(401);
    expect((await POST(jsonRequest(createBody))).status).toBe(401);
    expect((await PATCH(jsonRequest({ requestId: "request-1", status: "accepted" }, "PATCH"))).status).toBe(401);
  });
});

describe("media requests API validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("returns 404 when the subject is not published or belongs to another workspace", async () => {
    asRole("media");
    installSqlMock({ subjectRows: [] });

    expect((await POST(jsonRequest(createBody))).status).toBe(404);
  });

  it("returns 400 on a request type not offered by the subject", async () => {
    asRole("media");

    expect((await POST(jsonRequest({ ...createBody, requestType: "podcast" }))).status).toBe(400);
    expect((await POST(jsonRequest({ ...createBody, requestType: "tribune" }))).status).toBe(400);
  });

  it("returns 400 on athletes that are not linked to the subject", async () => {
    asRole("media");

    expect((await POST(jsonRequest({ ...createBody, athleteIds: ["athlete-secret"] }))).status).toBe(400);
  });

  it("returns 400 without any athlete except for an images request", async () => {
    asRole("media");

    expect((await POST(jsonRequest({ ...createBody, athleteIds: [] }))).status).toBe(400);
    expect((await POST(jsonRequest({ ...createBody, requestType: "images", athleteIds: [] }))).status).toBe(201);
  });

  it("ignores any identity sent in the body", async () => {
    asRole("media");

    const response = await POST(
      jsonRequest({
        ...createBody,
        requestedByClerkUserId: "user_usurpateur",
        requesterEmail: "pirate@example.com",
        mediaId: "media-pirate",
        workspaceId: "autre-workspace",
        status: "accepted",
        adminNote: "note injectee",
      }),
    );

    expect(response.status).toBe(201);
    const insert = findCall("insert into media_requests");
    expect(insert?.values).toContain("user_media");
    expect(insert?.values).toContain("media@example.com");
    expect(insert?.values).toContain("klique-os");
    expect(insert?.values).not.toContain("user_usurpateur");
    expect(insert?.values).not.toContain("pirate@example.com");
    expect(insert?.values).not.toContain("autre-workspace");
    expect(insert?.values).not.toContain("note injectee");
  });

  it("returns 400 without requestId, on an invalid status and on an invalid payload", async () => {
    asRole("admin");

    expect((await PATCH(jsonRequest({ status: "accepted" }, "PATCH"))).status).toBe(400);
    expect((await PATCH(jsonRequest({ requestId: "request-1", status: "archive" }, "PATCH"))).status).toBe(400);

    const invalidJson = new Request("http://localhost/api/media-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "pas-du-json",
    });
    expect((await POST(invalidJson)).status).toBe(400);
  });

  it("returns 404 when the request to update does not exist in the workspace", async () => {
    asRole("admin");
    installSqlMock({ updateRows: [] });

    expect((await PATCH(jsonRequest({ requestId: "request-404", status: "accepted" }, "PATCH"))).status).toBe(404);
  });
});

describe("media requests API athlete consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  const consentRequest = (payload: Record<string, unknown>) =>
    jsonRequest({ action: "athlete_consent", ...payload }, "PATCH");

  it("lets an active athlete read only the requests linked to its athleteId", async () => {
    asRole("athlete");

    const response = await GET(listRequest());
    expect(response.status).toBe(200);

    const select = findCall("from media_requests r");
    expect(select?.text).toContain("link.athlete_id =");
    expect(select?.values).toContain("athlete-1");
    expect(select?.values).toContain("klique-os");
    expect(select?.values).toContain(false);
  });

  it("refuses an athlete without athleteId and an athlete outside an active access", async () => {
    asRole("athlete", "active", "klique-os", " ");
    expect((await GET(listRequest())).status).toBe(403);

    asRole("athlete", "invited");
    expect((await GET(listRequest())).status).toBe(403);
    expect((await PATCH(consentRequest({ requestId: "request-1", consent: "approved" }))).status).toBe(403);
  });

  it("records the consent on the athlete own row only", async () => {
    asRole("athlete");

    const response = await PATCH(
      consentRequest({ requestId: "request-1", consent: "approved", athleteId: "athlete-2", workspaceId: "autre" }),
    );

    expect(response.status).toBe(200);
    const update = findCall("update media_request_athletes");
    expect(update?.text).toContain("responded_at = now()");
    expect(update?.values).toEqual(["approved", "request-1", "klique-os", "athlete-1"]);
    expect(update?.values).not.toContain("athlete-2");
    expect(update?.values).not.toContain("autre");
  });

  it("returns 400 on a consent that is not approved or declined", async () => {
    asRole("athlete");

    expect((await PATCH(consentRequest({ requestId: "request-1", consent: "pending" }))).status).toBe(400);
    expect((await PATCH(consentRequest({ requestId: "request-1", consent: "maybe" }))).status).toBe(400);
    expect((await PATCH(consentRequest({ consent: "approved" }))).status).toBe(400);
    expect(findCall("update media_request_athletes")).toBeUndefined();
  });

  it("returns 403 when the request is not awaiting the athlete", async () => {
    asRole("athlete");
    installSqlMock({ linkRows: [{ status: "submitted" }] });

    expect((await PATCH(consentRequest({ requestId: "request-1", consent: "approved" }))).status).toBe(403);
    expect(findCall("update media_request_athletes")).toBeUndefined();
  });

  it("returns 404 when the athlete is not linked to the request", async () => {
    asRole("athlete");
    installSqlMock({ linkRows: [] });

    expect((await PATCH(consentRequest({ requestId: "request-1", consent: "approved" }))).status).toBe(404);
  });

  it("refuses the consent action for an admin and a media user", async () => {
    asRole("admin");
    expect((await PATCH(consentRequest({ requestId: "request-1", consent: "approved" }))).status).toBe(403);

    asRole("media");
    expect((await PATCH(consentRequest({ requestId: "request-1", consent: "approved" }))).status).toBe(403);

    expect(findCall("update media_request_athletes")).toBeUndefined();
  });

  it("keeps the admin status update out of reach for an athlete", async () => {
    asRole("athlete");

    expect((await PATCH(jsonRequest({ requestId: "request-1", status: "accepted" }, "PATCH"))).status).toBe(403);
    expect(findCall("update media_requests")).toBeUndefined();
  });

  it("keeps the admin status update unchanged", async () => {
    asRole("admin");

    const response = await PATCH(jsonRequest({ requestId: "request-1", status: "accepted", adminNote: "OK" }, "PATCH"));

    expect(response.status).toBe(200);
    expect(findCall("update media_requests")?.values).toContain("accepted");
    expect(findCall("update media_request_athletes")).toBeUndefined();
  });
});
