import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sqlMock,
  createContentStorageClientMock,
  getCurrentUserAccessProfileMock,
  createNotificationsForRecipientsMock,
  findActiveAdminClerkUserIdsMock,
  findActiveAthleteClerkUserIdsMock,
} = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  getCurrentUserAccessProfileMock: vi.fn(),
  createNotificationsForRecipientsMock: vi.fn(),
  findActiveAdminClerkUserIdsMock: vi.fn(),
  findActiveAthleteClerkUserIdsMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: () => "klique-os",
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

vi.mock("@/lib/notifications/service", () => ({
  createNotificationsForRecipients: createNotificationsForRecipientsMock,
  findActiveAdminClerkUserIds: findActiveAdminClerkUserIdsMock,
  findActiveAthleteClerkUserIds: findActiveAthleteClerkUserIdsMock,
}));

import {
  MediaRequestForbiddenError,
  MediaRequestNotFoundError,
  MediaRequestValidationError,
  createMediaRequest,
  getMediaRequestById,
  listMediaRequests,
  normalizeMediaRequestDeadline,
  normalizeMediaRequestOrigin,
  normalizeMediaRequestStatus,
  normalizeMediaRequestType,
  updateMediaRequestAthleteConsent,
  updateMediaRequestStatus,
  type MediaRequestAccessContext,
} from "@/lib/media-requests/service";

const adminAccess: MediaRequestAccessContext = {
  clerkUserId: "user_admin",
  workspaceId: "klique-os",
  role: "admin",
  isAdmin: true,
  email: "admin@example.com",
  mediaId: null,
};

const mediaAccess: MediaRequestAccessContext = {
  clerkUserId: "user_media",
  workspaceId: "klique-os",
  role: "media",
  isAdmin: false,
  email: "media@example.com",
  mediaId: "media-1",
};

const otherWorkspaceMediaAccess: MediaRequestAccessContext = {
  ...mediaAccess,
  clerkUserId: "user_media_2",
  workspaceId: "autre-workspace",
};

const athleteAccess: MediaRequestAccessContext = {
  clerkUserId: "user_athlete",
  workspaceId: "klique-os",
  role: "athlete",
  isAdmin: false,
  email: "athlete@example.com",
  athleteId: "athlete-1",
};

const subjectRow = (overrides: Record<string, unknown> = {}) => ({
  id: "subject-1",
  available_request_types: ["interview", "images"],
  athlete_ids: ["athlete-1", "athlete-2"],
  ...overrides,
});

const requestRow = (overrides: Record<string, unknown> = {}) => ({
  id: "request-1",
  workspace_id: "klique-os",
  origin: "klique_proposal",
  subject_id: "subject-1",
  title: "Retour de blessure",
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
  ...overrides,
});

type SqlCall = { text: string; values: unknown[] };

let calls: SqlCall[] = [];

const installSqlMock = (
  options: {
    subjectRows?: Array<Record<string, unknown>>;
    requestRows?: Array<Record<string, unknown>>;
    athleteRows?: Array<Record<string, unknown>>;
    updateRows?: Array<Record<string, unknown>>;
    linkRows?: Array<Record<string, unknown>>;
  } = {},
) => {
  const {
    subjectRows = [subjectRow()],
    requestRows = [requestRow()],
    athleteRows = [{ athlete_id: "athlete-1" }, { athlete_id: "athlete-2" }],
    updateRows = [{ id: "request-1" }],
    linkRows = [{ status: "awaiting_athlete" }],
  } = options;
  calls = [];
  sqlMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(" ").toLowerCase();
    calls.push({ text, values });

    if (text.includes("from media_subjects s")) return subjectRows;
  if (text.includes("from user_access")) return athleteRows;
    if (text.includes("select r.status")) return linkRows;
    if (text.includes("from media_requests r")) return requestRows;
    if (text.includes("update media_request_athletes")) return [{ request_id: "request-1" }];
    if (text.includes("update media_requests")) return updateRows;
    return [];
  });
  createContentStorageClientMock.mockReturnValue(sqlMock);
};

const findCall = (fragment: string) => calls.find((call) => call.text.includes(fragment));
const findCalls = (fragment: string) => calls.filter((call) => call.text.includes(fragment));

const validInput = {
  subjectId: "subject-1",
  requestType: "interview",
  message: "Nous souhaitons une interview.",
  deadline: "2026-09-20",
  athleteIds: ["athlete-1"],
};

beforeEach(() => {
  createNotificationsForRecipientsMock.mockReset().mockResolvedValue([]);
  findActiveAdminClerkUserIdsMock.mockReset().mockResolvedValue([]);
  findActiveAthleteClerkUserIdsMock.mockReset().mockResolvedValue([]);
});

describe("media requests normalization", () => {
  it("keeps only the seven allowed statuses", () => {
    expect(normalizeMediaRequestStatus("submitted")).toBe("submitted");
    expect(normalizeMediaRequestStatus("AWAITING_ATHLETE")).toBe("awaiting_athlete");
    expect(normalizeMediaRequestStatus("cancelled")).toBe("cancelled");
    expect(normalizeMediaRequestStatus("archive")).toBeNull();
    expect(normalizeMediaRequestStatus(null)).toBeNull();
  });

  it("keeps only the five supported request types", () => {
    expect(normalizeMediaRequestType(" Interview ")).toBe("interview");
    expect(normalizeMediaRequestType("podcast")).toBe("podcast");
    expect(normalizeMediaRequestType("tribune")).toBeNull();
    expect(normalizeMediaRequestType(42)).toBeNull();
  });

  it("keeps only the two supported request origins", () => {
    expect(normalizeMediaRequestOrigin(" KLIQUE_PROPOSAL ")).toBe("klique_proposal");
    expect(normalizeMediaRequestOrigin("free")).toBe("free");
    expect(normalizeMediaRequestOrigin("partner")).toBeNull();
  });

  it("normalizes the deadline to a civil date", () => {
    expect(normalizeMediaRequestDeadline("2026-09-20")).toBe("2026-09-20");
    expect(normalizeMediaRequestDeadline("2026-09-20 00:00:00+00")).toBe("2026-09-20");
    expect(normalizeMediaRequestDeadline(new Date("2026-09-20T10:00:00.000Z"))).toBe("2026-09-20");
    expect(normalizeMediaRequestDeadline("pas-une-date")).toBeNull();
    expect(normalizeMediaRequestDeadline(null)).toBeNull();
  });
});

describe("media requests read isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("restricts a media user to its organization inside its workspace", async () => {
    await listMediaRequests(mediaAccess);

    const select = findCall("from media_requests r");
    expect(select?.text).toContain("r.workspace_id =");
    expect(select?.text).toContain("r.media_id =");
    expect(select?.text).not.toContain("r.requested_by_clerk_user_id =");
    expect(select?.values).toContain("klique-os");
    expect(select?.values).toContain("media-1");
    expect(select?.values).not.toContain("user_media");
    expect(select?.values).toContain(false);
  });

  it("uses the same organization scope for another individual media account", async () => {
    await getMediaRequestById({ ...mediaAccess, clerkUserId: "user_media_colleague" }, "request-1");

    const select = findCall("from media_requests r");
    expect(select?.text).toContain("r.media_id =");
    expect(select?.values).toContain("media-1");
    expect(select?.values).not.toContain("user_media_colleague");
  });

  it("never uses another media organization when listing or reading details", async () => {
    const otherOrganizationAccess = { ...mediaAccess, mediaId: "media-2" };

    await listMediaRequests(otherOrganizationAccess);
    expect(findCall("from media_requests r")?.values).toContain("media-2");
    expect(findCall("from media_requests r")?.values).not.toContain("media-1");

    installSqlMock();
    await getMediaRequestById(otherOrganizationAccess, "request-1");
    expect(findCall("from media_requests r")?.values).toContain("media-2");
    expect(findCall("from media_requests r")?.values).not.toContain("media-1");
  });

  it("refuses media reads without an organization", async () => {
    const legacyAccess = { ...mediaAccess, mediaId: null };

    await expect(listMediaRequests(legacyAccess)).rejects.toBeInstanceOf(MediaRequestForbiddenError);
    await expect(getMediaRequestById(legacyAccess, "request-1")).rejects.toBeInstanceOf(MediaRequestForbiddenError);
    expect(findCall("from media_requests r")).toBeUndefined();
  });

  it("lets an admin read every request of its own workspace", async () => {
    await listMediaRequests(adminAccess);

    const select = findCall("from media_requests r");
    expect(select?.values).toContain(true);
    expect(select?.values).toContain("klique-os");
  });

  it("never reads a request outside the caller workspace", async () => {
    await getMediaRequestById(otherWorkspaceMediaAccess, "request-1");

    const select = findCall("from media_requests r");
    expect(select?.values).toContain("autre-workspace");
    expect(select?.values).not.toContain("klique-os");
  });

  it("maps the row into a request with its athletes", async () => {
    const mediaRequest = await getMediaRequestById(mediaAccess, "request-1");

    expect(findCall("from media_requests r")?.text).toContain("left join media_subjects");
    expect(mediaRequest).toMatchObject({
      id: "request-1",
      origin: "klique_proposal",
      subjectId: "subject-1",
      title: "Retour de blessure",
      requestType: "interview",
      status: "submitted",
      deadline: "2026-09-20",
      athleteIds: ["athlete-1"],
    });
    expect(mediaRequest?.athletes).toEqual([
      { athleteId: "athlete-1", consentStatus: "pending", respondedAt: null },
    ]);
  });

  it("maps a free request with a nullable subject and its own title", async () => {
    installSqlMock({
      requestRows: [requestRow({
        origin: "free",
        subject_id: null,
        title: "Portrait de la relève",
        subject_title: null,
      })],
    });

    const mediaRequest = await getMediaRequestById(mediaAccess, "request-1");

    expect(mediaRequest).toMatchObject({
      origin: "free",
      subjectId: null,
      title: "Portrait de la relève",
      subjectTitle: null,
    });
  });

  it("returns null on an unknown request without querying anything else", async () => {
    installSqlMock({ requestRows: [] });

    expect(await getMediaRequestById(mediaAccess, "request-404")).toBeNull();
    expect(await getMediaRequestById(mediaAccess, "  ")).toBeNull();
  });

  // Regression : le driver renvoie des Date pour les TIMESTAMPTZ, l UI affichait "Sans date".
  it("exposes an ISO date when the driver returns Date objects", async () => {
    const driverRow = {
      id: "request-1",
      workspace_id: "klique-os",
      subject_id: "subject-1",
      subject_title: "Retour de blessure",
      requested_by_clerk_user_id: "user_media",
      requester_email: "media@example.com",
      media_id: "media-1",
      request_type: "interview",
      message: "Nous souhaitons une interview.",
      deadline: new Date("2026-09-20T00:00:00.000Z"),
      status: "awaiting_athlete",
      admin_note: null,
      created_at: new Date("2026-09-10T09:00:00.000Z"),
      updated_at: new Date("2026-09-10T10:30:00.000Z"),
      athletes: [
        { athlete_id: "athlete-1", consent_status: "approved", responded_at: new Date("2026-09-10T10:30:00.000Z") },
      ],
    };
    installSqlMock({ requestRows: [driverRow] });

    const [listed] = await listMediaRequests(mediaAccess);
    const fetched = await getMediaRequestById(mediaAccess, "request-1");

    for (const mediaRequest of [listed, fetched]) {
      expect(mediaRequest?.createdAt).toBe("2026-09-10T09:00:00.000Z");
      expect(mediaRequest?.updatedAt).toBe("2026-09-10T10:30:00.000Z");
      expect(mediaRequest?.deadline).toBe("2026-09-20");
      expect(mediaRequest?.athletes[0].respondedAt).toBe("2026-09-10T10:30:00.000Z");
      expect(/^\d{4}-\d{2}-\d{2}/.test(mediaRequest?.createdAt ?? "")).toBe(true);
    }
  });

  it("keeps the ISO text form returned for a created request", async () => {
    installSqlMock({
      requestRows: [requestRow({ created_at: "2026-09-10 09:00:00+00", updated_at: new Date("2026-09-10T09:00:00.000Z") })],
    });

    const created = await createMediaRequest(mediaAccess, validInput);

    expect(created.createdAt).toBe("2026-09-10 09:00:00+00");
    expect(created.updatedAt).toBe("2026-09-10T09:00:00.000Z");
  });
});

describe("media requests creation is reserved to the media role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("refuses creation for an admin, an athlete and a partner", async () => {
    await expect(createMediaRequest(adminAccess, validInput)).rejects.toBeInstanceOf(MediaRequestForbiddenError);
    await expect(createMediaRequest(athleteAccess, validInput)).rejects.toBeInstanceOf(MediaRequestForbiddenError);
    await expect(
      createMediaRequest(
        { ...mediaAccess, role: "partner_expert" } as unknown as MediaRequestAccessContext,
        validInput,
      ),
    ).rejects.toBeInstanceOf(MediaRequestForbiddenError);

    expect(findCall("insert into media_requests")).toBeUndefined();
  });

  it("takes the requester identity from the context and never from the body", async () => {
    const payload = {
      ...validInput,
      requestedByClerkUserId: "user_usurpateur",
      requesterEmail: "pirate@example.com",
      mediaId: "media-pirate",
      workspaceId: "autre-workspace",
      status: "accepted",
      adminNote: "note injectee",
    };

    await createMediaRequest(mediaAccess, payload);

    const insert = findCall("insert into media_requests");
    expect(insert?.values).toContain("user_media");
    expect(insert?.values).toContain("media@example.com");
    expect(insert?.values).toContain("media-1");
    expect(insert?.values).toContain("klique-os");
    expect(insert?.values).not.toContain("user_usurpateur");
    expect(insert?.values).not.toContain("pirate@example.com");
    expect(insert?.values).not.toContain("media-pirate");
    expect(insert?.values).not.toContain("autre-workspace");
    expect(insert?.values).not.toContain("accepted");
    expect(insert?.values).not.toContain("note injectee");
    expect(insert?.text).toContain("'submitted'");
  });

  it("refuses creation without a media organization", async () => {
    await expect(createMediaRequest({ ...mediaAccess, mediaId: null }, validInput)).rejects.toBeInstanceOf(
      MediaRequestForbiddenError,
    );
    expect(findCall("insert into media_requests")).toBeUndefined();
  });

  it("creates the athlete links as pending inside the workspace", async () => {
    await createMediaRequest(mediaAccess, { ...validInput, athleteIds: ["athlete-1", "athlete-2"] });

    const links = findCalls("insert into media_request_athletes");
    expect(links).toHaveLength(2);
    expect(links.flatMap((call) => call.values)).toEqual(
      expect.arrayContaining(["athlete-1", "athlete-2", "klique-os"]),
    );
  });

  it.each([
    ["interview", "Interview"],
    ["reaction", "Réaction"],
    ["reportage", "Reportage"],
    ["images", "Images"],
    ["podcast", "Podcast"],
  ] as const)("notifies all active admins after creating a %s request", async (requestType, label) => {
    findActiveAdminClerkUserIdsMock.mockResolvedValue(["user_admin_1", "user_admin_2"]);
    installSqlMock({
      subjectRows: [subjectRow({
        available_request_types: ["interview", "reaction", "reportage", "images", "podcast"],
      })],
      requestRows: [requestRow({ request_type: requestType })],
    });

    await createMediaRequest(mediaAccess, {
      ...validInput,
      requestType,
      athleteIds: requestType === "images" ? [] : validInput.athleteIds,
    });

    expect(findActiveAdminClerkUserIdsMock).toHaveBeenCalledWith("klique-os");
    expect(createNotificationsForRecipientsMock).toHaveBeenCalledWith({
      workspaceId: "klique-os",
      recipientClerkUserIds: ["user_admin_1", "user_admin_2"],
      type: "media_request.created",
      title: "Nouvelle demande média",
      body: label,
      actionHref: "/media-desk",
      sourceType: "media_request_created",
      sourceId: "request-1",
    });
  });

  it("keeps the created request successful when admin notification fails", async () => {
    findActiveAdminClerkUserIdsMock.mockResolvedValue(["user_admin"]);
    createNotificationsForRecipientsMock.mockRejectedValue(new Error("Notifications unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(createMediaRequest(mediaAccess, validInput)).resolves.toMatchObject({
      id: "request-1",
      requestType: "interview",
    });

    expect(consoleError).toHaveBeenCalledWith("[media_requests_notifications] Notifications unavailable");
    consoleError.mockRestore();
  });

  it("only reads a published subject of the caller workspace", async () => {
    await createMediaRequest(mediaAccess, validInput);

    const select = findCall("from media_subjects s");
    expect(select?.text).toContain("s.status = 'published'");
    expect(select?.values).toContain("klique-os");
    expect(select?.values).toContain("subject-1");
  });

  it("creates a normalized free request without loading a subject", async () => {
    installSqlMock({
      athleteRows: [{ athlete_id: "athlete-1" }],
      requestRows: [requestRow({
        origin: "free",
        subject_id: null,
        title: "Portrait de la relève",
        subject_title: null,
      })],
    });

    const created = await createMediaRequest(mediaAccess, {
      origin: "free",
      title: "  Portrait de la relève  ",
      requestType: "interview",
      message: "  Nous préparons un portrait.  ",
      deadline: "2026-10-01",
      athleteIds: ["athlete-1"],
    });

    expect(findCall("from media_subjects s")).toBeUndefined();
    const athleteSelect = findCall("from user_access");
    expect(athleteSelect?.text).toContain("workspace_id =");
    expect(athleteSelect?.text).toContain("role = 'athlete'");
    expect(athleteSelect?.values).toContain("klique-os");
    expect(athleteSelect?.values).toContainEqual(["athlete-1"]);

    const insert = findCall("insert into media_requests");
    expect(insert?.values).toEqual(expect.arrayContaining([
      "free",
      null,
      "Portrait de la relève",
      "Nous préparons un portrait.",
      "2026-10-01",
    ]));
    expect(created).toMatchObject({ origin: "free", subjectId: null, title: "Portrait de la relève" });
  });

  it("rejects an invalid free request before writing", async () => {
    await expect(createMediaRequest(mediaAccess, {
      ...validInput,
      origin: "free",
      title: "Titre libre",
    })).rejects.toBeInstanceOf(MediaRequestValidationError);
    await expect(createMediaRequest(mediaAccess, {
      ...validInput,
      origin: "free",
      subjectId: undefined,
      title: "   ",
    })).rejects.toBeInstanceOf(MediaRequestValidationError);
    await expect(createMediaRequest(mediaAccess, {
      ...validInput,
      origin: "unknown",
    })).rejects.toBeInstanceOf(MediaRequestValidationError);

    expect(findCall("insert into media_requests")).toBeUndefined();
  });

  it("rejects free-request athletes outside the workspace", async () => {
    installSqlMock({ athleteRows: [{ athlete_id: "athlete-1" }] });

    await expect(createMediaRequest(mediaAccess, {
      origin: "free",
      title: "Portrait de la relève",
      requestType: "interview",
      message: "Nous préparons un portrait.",
      athleteIds: ["athlete-1", "athlete-other-workspace"],
    })).rejects.toBeInstanceOf(MediaRequestValidationError);

    expect(findCall("insert into media_requests")).toBeUndefined();
  });

  it("keeps the athlete-count rule for free requests", async () => {
    for (const requestType of ["interview", "reaction", "reportage", "podcast"] as const) {
      installSqlMock();
      await expect(createMediaRequest(mediaAccess, {
        origin: "free",
        title: "Demande libre",
        requestType,
        message: "Message",
        athleteIds: [],
      })).rejects.toBeInstanceOf(MediaRequestValidationError);
      expect(findCall("insert into media_requests")).toBeUndefined();
    }

    installSqlMock({
      requestRows: [requestRow({
        origin: "free",
        subject_id: null,
        title: "Banque images",
        subject_title: null,
        athletes: [],
      })],
    });
    await expect(createMediaRequest(mediaAccess, {
      origin: "free",
      title: "Banque images",
      requestType: "images",
      message: "Besoin de visuels.",
      athleteIds: [],
    })).resolves.toMatchObject({ origin: "free", athleteIds: [] });
    expect(findCall("from user_access")).toBeUndefined();
  });

  it("refuses a subject that is missing, unpublished or from another workspace", async () => {
    installSqlMock({ subjectRows: [] });

    await expect(createMediaRequest(mediaAccess, validInput)).rejects.toBeInstanceOf(MediaRequestNotFoundError);
    expect(findCall("insert into media_requests")).toBeUndefined();
  });

  it("refuses a request type not offered by the subject", async () => {
    await expect(createMediaRequest(mediaAccess, { ...validInput, requestType: "podcast" })).rejects.toBeInstanceOf(
      MediaRequestValidationError,
    );
    expect(findCall("insert into media_requests")).toBeUndefined();
  });

  it("refuses an unknown request type, an empty message or a missing subject", async () => {
    await expect(createMediaRequest(mediaAccess, { ...validInput, requestType: "tribune" })).rejects.toBeInstanceOf(
      MediaRequestValidationError,
    );
    await expect(createMediaRequest(mediaAccess, { ...validInput, message: "   " })).rejects.toBeInstanceOf(
      MediaRequestValidationError,
    );
    await expect(createMediaRequest(mediaAccess, { ...validInput, subjectId: "" })).rejects.toBeInstanceOf(
      MediaRequestValidationError,
    );
    expect(findCall("insert into media_requests")).toBeUndefined();
  });

  it("refuses athletes that are not linked to the subject", async () => {
    await expect(
      createMediaRequest(mediaAccess, { ...validInput, athleteIds: ["athlete-1", "athlete-secret"] }),
    ).rejects.toBeInstanceOf(MediaRequestValidationError);
    expect(findCall("insert into media_requests")).toBeUndefined();
  });

  it("requires at least one athlete except for an images request", async () => {
    for (const requestType of ["interview", "reaction", "reportage", "podcast"]) {
      installSqlMock({
        subjectRows: [subjectRow({ available_request_types: ["interview", "reaction", "reportage", "podcast"] })],
      });
      await expect(
        createMediaRequest(mediaAccess, { ...validInput, requestType, athleteIds: [] }),
      ).rejects.toBeInstanceOf(MediaRequestValidationError);
      expect(findCall("insert into media_requests")).toBeUndefined();
    }

    installSqlMock();
    await createMediaRequest(mediaAccess, { ...validInput, requestType: "images", athleteIds: [] });
    expect(findCall("insert into media_requests")).toBeDefined();
    expect(findCalls("insert into media_request_athletes")).toHaveLength(0);
  });

  it("refuses creation when the media account has no email in the Clerk context", async () => {
    await expect(createMediaRequest({ ...mediaAccess, email: null }, validInput)).rejects.toBeInstanceOf(
      MediaRequestValidationError,
    );
    expect(findCall("insert into media_requests")).toBeUndefined();
  });
});

describe("media requests status update is admin only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("refuses the update for a media user and for an athlete", async () => {
    await expect(
      updateMediaRequestStatus(mediaAccess, "request-1", { status: "accepted" }),
    ).rejects.toBeInstanceOf(MediaRequestForbiddenError);
    await expect(
      updateMediaRequestStatus(athleteAccess, "request-1", { status: "accepted" }),
    ).rejects.toBeInstanceOf(MediaRequestForbiddenError);
    expect(findCall("update media_requests")).toBeUndefined();
  });

  it("scopes the update to the caller workspace", async () => {
    await updateMediaRequestStatus(adminAccess, "request-1", { status: "accepted", adminNote: "  Note  " });

    const update = findCall("update media_requests");
    expect(update?.text).toContain("workspace_id =");
    expect(update?.values).toContain("klique-os");
    expect(update?.values).toContain("accepted");
    expect(update?.values).toContain("Note");
  });

  it("keeps the existing admin note when it is not provided", async () => {
    await updateMediaRequestStatus(adminAccess, "request-1", { status: "reviewing" });

    const update = findCall("update media_requests");
    expect(update?.values).toContain(false);
    expect(update?.text).toContain("else admin_note end");
  });

  it.each([
    ["submitted", "Envoyée"],
    ["reviewing", "En cours d’examen"],
    ["awaiting_athlete", "En attente de l’athlète"],
    ["accepted", "Acceptée"],
    ["declined", "Refusée"],
    ["completed", "Terminée"],
    ["cancelled", "Annulée"],
  ] as const)("notifies the requester when status changes to %s", async (status, label) => {
    const previousStatus = status === "submitted" ? "reviewing" : "submitted";
    installSqlMock({
      updateRows: [{
        id: "request-1",
        previous_status: previousStatus,
        requested_by_clerk_user_id: "user_media",
      }],
      requestRows: [requestRow({ status })],
    });

    await updateMediaRequestStatus(adminAccess, "request-1", { status });

    expect(createNotificationsForRecipientsMock).toHaveBeenCalledWith({
      workspaceId: "klique-os",
      recipientClerkUserIds: ["user_media"],
      type: "media_request.status_updated",
      title: "Votre demande média a été mise à jour",
      body: label,
      actionHref: "/media-desk",
      sourceType: "media_request_status",
      sourceId: `request-1:${status}`,
    });
  });

  it("does not notify when only the internal note changes", async () => {
    installSqlMock({
      updateRows: [{
        id: "request-1",
        previous_status: "submitted",
        requested_by_clerk_user_id: "user_media",
      }],
      requestRows: [requestRow({ status: "submitted", admin_note: "Note actualisee" })],
    });

    await updateMediaRequestStatus(adminAccess, "request-1", {
      status: "submitted",
      adminNote: "Note actualisee",
    });

    expect(createNotificationsForRecipientsMock).not.toHaveBeenCalled();
    expect(findActiveAthleteClerkUserIdsMock).not.toHaveBeenCalled();
  });

  it.each([
    ["interview", "Interview"],
    ["reaction", "Réaction"],
    ["reportage", "Reportage"],
    ["images", "Images"],
    ["podcast", "Podcast"],
  ] as const)("notifies each active athlete when a %s request awaits consent", async (requestType, label) => {
    installSqlMock({
      updateRows: [{
        id: "request-1",
        previous_status: "reviewing",
        requested_by_clerk_user_id: "user_media",
      }],
      requestRows: [requestRow({
        status: "awaiting_athlete",
        request_type: requestType,
        athletes: [
          { athlete_id: "athlete-1", consent_status: "pending", responded_at: null },
          { athlete_id: "athlete-2", consent_status: "pending", responded_at: null },
        ],
      })],
    });
    findActiveAthleteClerkUserIdsMock.mockImplementation(
      async (_workspaceId: string, athleteIds: string[]) => [`user_${athleteIds[0]}`],
    );

    await updateMediaRequestStatus(adminAccess, "request-1", { status: "awaiting_athlete" });

    expect(findActiveAthleteClerkUserIdsMock).toHaveBeenNthCalledWith(1, "klique-os", ["athlete-1"]);
    expect(findActiveAthleteClerkUserIdsMock).toHaveBeenNthCalledWith(2, "klique-os", ["athlete-2"]);
    for (const athleteId of ["athlete-1", "athlete-2"]) {
      expect(createNotificationsForRecipientsMock).toHaveBeenCalledWith({
        workspaceId: "klique-os",
        recipientClerkUserIds: [`user_${athleteId}`],
        type: "media_request.athlete_consent_requested",
        title: "Votre accord est demandé",
        body: label,
        actionHref: "/athlete/media-requests",
        sourceType: "media_request_athlete",
        sourceId: `request-1:${athleteId}`,
      });
    }
  });

  it("keeps the status update successful and continues after an athlete notification fails", async () => {
    installSqlMock({
      updateRows: [{
        id: "request-1",
        previous_status: "reviewing",
        requested_by_clerk_user_id: "user_media",
      }],
      requestRows: [requestRow({
        status: "awaiting_athlete",
        athletes: [
          { athlete_id: "athlete-1", consent_status: "pending", responded_at: null },
          { athlete_id: "athlete-2", consent_status: "pending", responded_at: null },
        ],
      })],
    });
    findActiveAthleteClerkUserIdsMock.mockImplementation(
      async (_workspaceId: string, athleteIds: string[]) => [`user_${athleteIds[0]}`],
    );
    createNotificationsForRecipientsMock
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Notifications unavailable"))
      .mockResolvedValueOnce([]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(updateMediaRequestStatus(adminAccess, "request-1", { status: "awaiting_athlete" }))
      .resolves.toMatchObject({ id: "request-1", status: "awaiting_athlete" });

    expect(findActiveAthleteClerkUserIdsMock).toHaveBeenCalledTimes(2);
    expect(createNotificationsForRecipientsMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "request-1:athlete-2" }),
    );
    expect(consoleError).toHaveBeenCalledWith("[media_requests_notifications] Notifications unavailable");
    consoleError.mockRestore();
  });

  it("keeps the status update successful when notification delivery fails", async () => {
    installSqlMock({
      updateRows: [{
        id: "request-1",
        previous_status: "submitted",
        requested_by_clerk_user_id: "user_media",
      }],
      requestRows: [requestRow({ status: "accepted" })],
    });
    createNotificationsForRecipientsMock.mockRejectedValue(new Error("Notifications unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(updateMediaRequestStatus(adminAccess, "request-1", { status: "accepted" }))
      .resolves.toMatchObject({ id: "request-1", status: "accepted" });

    expect(consoleError).toHaveBeenCalledWith("[media_requests_notifications] Notifications unavailable");
    consoleError.mockRestore();
  });

  it("refuses an invalid status before any write", async () => {
    await expect(
      updateMediaRequestStatus(adminAccess, "request-1", { status: "archive" }),
    ).rejects.toBeInstanceOf(MediaRequestValidationError);
    expect(findCall("update media_requests")).toBeUndefined();
  });

  it("reports an unknown request of the workspace", async () => {
    installSqlMock({ updateRows: [] });

    await expect(
      updateMediaRequestStatus(adminAccess, "request-404", { status: "accepted" }),
    ).rejects.toBeInstanceOf(MediaRequestNotFoundError);
  });
});

describe("media requests athlete read scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("restricts an athlete to the requests targeting its own athleteId", async () => {
    await listMediaRequests(athleteAccess);

    const select = findCall("from media_requests r");
    expect(select?.text).toContain("link.athlete_id =");
    expect(select?.values).toContain("klique-os");
    expect(select?.values).toContain("athlete-1");
    expect(select?.values).toContain(false);
  });

  it("never scopes an admin or a media user on an athleteId", async () => {
    await listMediaRequests(adminAccess);
    expect(findCall("from media_requests r")?.values).not.toContain("athlete-1");

    installSqlMock();
    await listMediaRequests({ ...mediaAccess, athleteId: "athlete-1" });
    expect(findCall("from media_requests r")?.values).not.toContain("athlete-1");
  });

  it("reads nothing when the athlete context has no athleteId", async () => {
    await getMediaRequestById({ ...athleteAccess, athleteId: null }, "request-1");

    const select = findCall("from media_requests r");
    expect(select?.values).toContain(null);
    expect(select?.values).not.toContain("athlete-1");
  });
});

describe("media requests athlete consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("refuses the consent for an admin, a media user or an athlete without athleteId", async () => {
    await expect(updateMediaRequestAthleteConsent(adminAccess, "request-1", "approved")).rejects.toBeInstanceOf(
      MediaRequestForbiddenError,
    );
    await expect(updateMediaRequestAthleteConsent(mediaAccess, "request-1", "approved")).rejects.toBeInstanceOf(
      MediaRequestForbiddenError,
    );
    await expect(
      updateMediaRequestAthleteConsent({ ...athleteAccess, athleteId: " " }, "request-1", "approved"),
    ).rejects.toBeInstanceOf(MediaRequestForbiddenError);

    expect(findCall("update media_request_athletes")).toBeUndefined();
  });

  it("accepts only approved or declined", async () => {
    for (const consent of ["pending", "maybe", "", null]) {
      installSqlMock();
      await expect(updateMediaRequestAthleteConsent(athleteAccess, "request-1", consent)).rejects.toBeInstanceOf(
        MediaRequestValidationError,
      );
      expect(findCall("update media_request_athletes")).toBeUndefined();
    }

    installSqlMock();
    await updateMediaRequestAthleteConsent(athleteAccess, "request-1", "declined");
    expect(findCall("update media_request_athletes")?.values).toContain("declined");
  });

  it("updates only its own row inside its workspace and stamps responded_at", async () => {
    await updateMediaRequestAthleteConsent(athleteAccess, "request-1", "approved");

    const update = findCall("update media_request_athletes");
    expect(update?.text).toContain("responded_at = now()");
    expect(update?.text).toContain("athlete_id =");
    expect(update?.text).toContain("workspace_id =");
    expect(update?.values).toEqual(["approved", "request-1", "klique-os", "athlete-1"]);
  });

  it.each([
    ["approved", "Accord athlète reçu"],
    ["declined", "Demande média refusée par l’athlète"],
  ] as const)("notifies all active admins after an athlete response of %s", async (consent, title) => {
    findActiveAdminClerkUserIdsMock.mockResolvedValue(["user_admin_1", "user_admin_2"]);

    await updateMediaRequestAthleteConsent(athleteAccess, "request-1", consent);

    expect(findActiveAdminClerkUserIdsMock).toHaveBeenCalledWith("klique-os");
    expect(createNotificationsForRecipientsMock).toHaveBeenCalledWith({
      workspaceId: "klique-os",
      recipientClerkUserIds: ["user_admin_1", "user_admin_2"],
      type: "media_request.athlete_response",
      title,
      actionHref: "/media-desk",
      sourceType: "media_request_athlete_response",
      sourceId: `request-1:athlete-1:${consent}`,
    });
  });

  it("keeps the athlete response successful when admin notification fails", async () => {
    findActiveAdminClerkUserIdsMock.mockResolvedValue(["user_admin"]);
    createNotificationsForRecipientsMock.mockRejectedValue(new Error("Notifications unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(updateMediaRequestAthleteConsent(athleteAccess, "request-1", "approved"))
      .resolves.toMatchObject({ id: "request-1" });

    expect(consoleError).toHaveBeenCalledWith("[media_requests_notifications] Notifications unavailable");
    consoleError.mockRestore();
  });

  it("refuses to answer a request that is not awaiting the athlete", async () => {
    for (const status of ["submitted", "reviewing", "accepted", "completed", "cancelled"]) {
      installSqlMock({ linkRows: [{ status }] });
      await expect(
        updateMediaRequestAthleteConsent(athleteAccess, "request-1", "approved"),
      ).rejects.toBeInstanceOf(MediaRequestForbiddenError);
      expect(findCall("update media_request_athletes")).toBeUndefined();
    }
  });

  it("reports an unknown link between the athlete and the request", async () => {
    installSqlMock({ linkRows: [] });

    await expect(updateMediaRequestAthleteConsent(athleteAccess, "request-1", "approved")).rejects.toBeInstanceOf(
      MediaRequestNotFoundError,
    );
    expect(findCall("update media_request_athletes")).toBeUndefined();
  });

  it("returns the refreshed request after the consent", async () => {
    const updated = await updateMediaRequestAthleteConsent(athleteAccess, "request-1", "approved");

    expect(updated).toMatchObject({ id: "request-1", status: "submitted" });
    expect(findCall("from media_requests r")?.values).toContain("athlete-1");
  });
});
