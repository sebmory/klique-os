import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, createContentStorageClientMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: () => "klique-os",
}));

import {
  MediaDayForbiddenError,
  MediaDayNotFoundError,
  MediaDayValidationError,
  createMediaDay,
  deleteMediaDay,
  getMediaDayById,
  listMediaDays,
  normalizeMediaDayDate,
  normalizeMediaDayStatus,
  normalizeMediaDayTime,
  respondToMediaDay,
  updateMediaDay,
  type MediaDayAccessContext,
} from "@/lib/media-days/service";

const adminAccess: MediaDayAccessContext = {
  clerkUserId: "user_admin",
  workspaceId: "klique-os",
  role: "admin",
  isAdmin: true,
};

const mediaAccess: MediaDayAccessContext = {
  clerkUserId: "user_media",
  workspaceId: "klique-os",
  role: "media",
  isAdmin: false,
};

const athleteAccess: MediaDayAccessContext = {
  clerkUserId: "user_athlete",
  workspaceId: "klique-os",
  role: "athlete",
  isAdmin: false,
  athleteId: "athlete-1",
};

const otherWorkspaceAdminAccess: MediaDayAccessContext = {
  ...adminAccess,
  workspaceId: "autre-workspace",
};

const dayRow = (overrides: Record<string, unknown> = {}) => ({
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
  created_at: new Date("2026-09-10T09:00:00.000Z"),
  updated_at: new Date("2026-09-10T10:00:00.000Z"),
  athletes: [
    {
      athlete_id: "athlete-1",
      status: "invited",
      slot_start: "09:30:00",
      slot_end: "10:00:00",
      responded_at: null,
      admin_note: "Prevoir maillot",
    },
  ],
  ...overrides,
});

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
    dayRows = [dayRow()],
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

const findCall = (fragment: string) => calls.find((call) => call.text.includes(fragment));
const findCalls = (fragment: string) => calls.filter((call) => call.text.includes(fragment));

const validInput = {
  title: "Media Day Fribourg",
  description: "Journee media KLIQUE",
  date: "2026-10-02",
  startTime: "09:00",
  endTime: "17:00",
  location: "Fribourg",
  capacity: 12,
  status: "open",
  athletes: [{ athleteId: "athlete-1", slotStart: "09:30", slotEnd: "10:00", adminNote: "Prevoir maillot" }],
};

describe("media days normalization", () => {
  it("keeps only the four allowed statuses", () => {
    expect(normalizeMediaDayStatus("draft")).toBe("draft");
    expect(normalizeMediaDayStatus("OPEN")).toBe("open");
    expect(normalizeMediaDayStatus("completed")).toBe("completed");
    expect(normalizeMediaDayStatus("cancelled")).toBe("cancelled");
    expect(normalizeMediaDayStatus("archived")).toBeNull();
    expect(normalizeMediaDayStatus(null)).toBeNull();
  });

  it("normalizes civil dates and rejects unusable values", () => {
    expect(normalizeMediaDayDate("2026-10-02")).toBe("2026-10-02");
    expect(normalizeMediaDayDate("2026-10-02 00:00:00+00")).toBe("2026-10-02");
    expect(normalizeMediaDayDate(new Date("2026-10-02T10:00:00.000Z"))).toBe("2026-10-02");
    expect(normalizeMediaDayDate("pas-une-date")).toBeNull();
    expect(normalizeMediaDayDate(null)).toBeNull();
  });

  it("normalizes times to HH:MM", () => {
    expect(normalizeMediaDayTime("9:05")).toBe("09:05");
    expect(normalizeMediaDayTime("09:30:00")).toBe("09:30");
    expect(normalizeMediaDayTime("24:00")).toBeNull();
    expect(normalizeMediaDayTime("09:75")).toBeNull();
    expect(normalizeMediaDayTime("matin")).toBeNull();
    expect(normalizeMediaDayTime(null)).toBeNull();
  });
});

describe("media days read isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("lets an admin read every media day of its workspace", async () => {
    await listMediaDays(adminAccess);

    const select = findCall("from media_days d");
    expect(select?.text).toContain("d.workspace_id =");
    expect(select?.values).toContain("klique-os");
    expect(select?.values).toContain(true);
  });

  it("restricts an athlete to the published media days it is linked to", async () => {
    await listMediaDays(athleteAccess);

    const select = findCall("from media_days d");
    expect(select?.text).toContain("d.status <> 'draft'");
    expect(select?.text).toContain("link.athlete_id =");
    expect(select?.values).toContain("athlete-1");
    expect(select?.values).toContain(false);
  });

  it("never scopes an admin or a media user on an athleteId", async () => {
    await listMediaDays(adminAccess);
    expect(findCall("from media_days d")?.values).not.toContain("athlete-1");

    installSqlMock();
    await listMediaDays({ ...mediaAccess, athleteId: "athlete-1" });
    expect(findCall("from media_days d")?.values).not.toContain("athlete-1");
  });

  it("reads nothing when the athlete context has no athleteId", async () => {
    await getMediaDayById({ ...athleteAccess, athleteId: null }, "day-1");

    const select = findCall("from media_days d");
    expect(select?.values).toContain(null);
    expect(select?.values).not.toContain("athlete-1");
  });

  it("never reads a media day outside the caller workspace", async () => {
    await getMediaDayById(otherWorkspaceAdminAccess, "day-1");

    const select = findCall("from media_days d");
    expect(select?.values).toContain("autre-workspace");
    expect(select?.values).not.toContain("klique-os");
  });

  it("maps the row with its athletes and ISO timestamps", async () => {
    const mediaDay = await getMediaDayById(adminAccess, "day-1");

    expect(mediaDay).toMatchObject({
      id: "day-1",
      title: "Media Day Fribourg",
      date: "2026-10-02",
      startTime: "09:00",
      endTime: "17:00",
      location: "Fribourg",
      capacity: 12,
      status: "open",
      athleteIds: ["athlete-1"],
      createdAt: "2026-09-10T09:00:00.000Z",
      updatedAt: "2026-09-10T10:00:00.000Z",
    });
    expect(mediaDay?.athletes).toEqual([
      {
        athleteId: "athlete-1",
        status: "invited",
        slotStart: "09:30",
        slotEnd: "10:00",
        respondedAt: null,
        adminNote: "Prevoir maillot",
      },
    ]);
  });

  it("returns null on an unknown or blank identifier", async () => {
    installSqlMock({ dayRows: [] });

    expect(await getMediaDayById(adminAccess, "day-404")).toBeNull();
    expect(await getMediaDayById(adminAccess, "  ")).toBeNull();
  });
});

describe("media days writes are admin only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("refuses create, update and delete for an athlete and a media user", async () => {
    for (const access of [athleteAccess, mediaAccess]) {
      installSqlMock();
      await expect(createMediaDay(access, validInput)).rejects.toBeInstanceOf(MediaDayForbiddenError);
      await expect(updateMediaDay(access, "day-1", validInput)).rejects.toBeInstanceOf(MediaDayForbiddenError);
      await expect(deleteMediaDay(access, "day-1")).rejects.toBeInstanceOf(MediaDayForbiddenError);

      expect(findCall("insert into media_days")).toBeUndefined();
      expect(findCall("update media_days")).toBeUndefined();
      expect(findCall("delete from media_days")).toBeUndefined();
    }
  });

  it("stores the media day with the caller identity and workspace", async () => {
    await createMediaDay(adminAccess, validInput);

    const insert = findCall("insert into media_days");
    expect(insert?.values).toContain("klique-os");
    expect(insert?.values).toContain("user_admin");
    expect(insert?.values).toContain("2026-10-02");
    expect(insert?.values).toContain("09:00");
    expect(insert?.values).toContain("17:00");
    expect(insert?.values).toContain(12);
    expect(insert?.values).toContain("open");
  });

  it("scopes update and delete to the caller workspace", async () => {
    await updateMediaDay(adminAccess, "day-1", validInput);
    expect(findCall("update media_days")?.text).toContain("workspace_id =");
    expect(findCall("update media_days")?.values).toContain("klique-os");

    installSqlMock();
    await deleteMediaDay(adminAccess, "day-1");
    expect(findCall("delete from media_days")?.values).toContain("klique-os");
  });

  it("reports an unknown media day on update and delete", async () => {
    installSqlMock({ updateRows: [] });
    await expect(updateMediaDay(adminAccess, "day-404", validInput)).rejects.toBeInstanceOf(MediaDayNotFoundError);

    installSqlMock({ deleteRows: [] });
    await expect(deleteMediaDay(adminAccess, "day-404")).rejects.toBeInstanceOf(MediaDayNotFoundError);
  });
});

describe("media days validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("requires a title, a description and a date", async () => {
    for (const patch of [{ title: "  " }, { description: "" }, { date: "pas-une-date" }, { date: null }]) {
      installSqlMock();
      await expect(createMediaDay(adminAccess, { ...validInput, ...patch })).rejects.toBeInstanceOf(
        MediaDayValidationError,
      );
      expect(findCall("insert into media_days")).toBeUndefined();
    }
  });

  it("refuses an end before its start and an invalid athlete slot", async () => {
    await expect(
      createMediaDay(adminAccess, { ...validInput, startTime: "17:00", endTime: "09:00" }),
    ).rejects.toBeInstanceOf(MediaDayValidationError);

    installSqlMock();
    await expect(
      createMediaDay(adminAccess, {
        ...validInput,
        athletes: [{ athleteId: "athlete-1", slotStart: "11:00", slotEnd: "10:00" }],
      }),
    ).rejects.toBeInstanceOf(MediaDayValidationError);

    expect(findCall("insert into media_days")).toBeUndefined();
  });

  it("refuses a non positive or fractional capacity", async () => {
    for (const capacity of [0, -3, 2.5, "beaucoup"]) {
      installSqlMock();
      await expect(createMediaDay(adminAccess, { ...validInput, capacity })).rejects.toBeInstanceOf(
        MediaDayValidationError,
      );
    }

    installSqlMock();
    await createMediaDay(adminAccess, { ...validInput, capacity: null });
    expect(findCall("insert into media_days")?.values).toContain(null);
  });

  it("refuses an athlete without identifier and an invalid athlete list", async () => {
    await expect(
      createMediaDay(adminAccess, { ...validInput, athletes: [{ athleteId: "  " }] }),
    ).rejects.toBeInstanceOf(MediaDayValidationError);

    installSqlMock();
    await expect(createMediaDay(adminAccess, { ...validInput, athletes: "athlete-1" })).rejects.toBeInstanceOf(
      MediaDayValidationError,
    );
  });

  it("defaults an unknown status to draft and accepts a media day without athlete", async () => {
    await createMediaDay(adminAccess, { ...validInput, status: "archived", athletes: [] });

    expect(findCall("insert into media_days")?.values).toContain("draft");
    expect(findCalls("insert into media_day_athletes")).toHaveLength(0);
  });

  it("deduplicates the athletes and keeps their answers on update", async () => {
    await updateMediaDay(adminAccess, "day-1", {
      ...validInput,
      athletes: [
        { athleteId: "athlete-1", slotStart: "09:30", slotEnd: "10:00" },
        { athleteId: "athlete-1", slotStart: "10:00", slotEnd: "10:30" },
        { athleteId: "athlete-2" },
      ],
    });

    const links = findCalls("insert into media_day_athletes");
    expect(links).toHaveLength(2);
    expect(links[0].values).toContain("10:00");
    expect(links[0].text).toContain("on conflict (media_day_id, athlete_id) do update");
    expect(links[0].text).not.toContain("set status");

    const cleanup = findCall("delete from media_day_athletes");
    expect(cleanup?.text).toContain("workspace_id =");
    expect(cleanup?.values).toContain("klique-os");
    expect(cleanup?.values).toEqual(expect.arrayContaining([["athlete-1", "athlete-2"]]));
  });
});

describe("media days athlete response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("refuses the response for an admin, a media user and an athlete without athleteId", async () => {
    await expect(respondToMediaDay(adminAccess, "day-1", "confirmed")).rejects.toBeInstanceOf(MediaDayForbiddenError);
    await expect(respondToMediaDay(mediaAccess, "day-1", "confirmed")).rejects.toBeInstanceOf(MediaDayForbiddenError);
    await expect(
      respondToMediaDay({ ...athleteAccess, athleteId: " " }, "day-1", "confirmed"),
    ).rejects.toBeInstanceOf(MediaDayForbiddenError);

    expect(findCall("update media_day_athletes")).toBeUndefined();
  });

  it("accepts only confirmed or declined", async () => {
    for (const response of ["invited", "completed", "peut-etre", "", null]) {
      installSqlMock();
      await expect(respondToMediaDay(athleteAccess, "day-1", response)).rejects.toBeInstanceOf(
        MediaDayValidationError,
      );
      expect(findCall("update media_day_athletes")).toBeUndefined();
    }

    installSqlMock();
    await respondToMediaDay(athleteAccess, "day-1", "declined");
    expect(findCall("update media_day_athletes")?.values).toContain("declined");
  });

  it("updates only its own row inside its workspace and stamps responded_at", async () => {
    await respondToMediaDay(athleteAccess, "day-1", "confirmed");

    const update = findCall("update media_day_athletes");
    expect(update?.text).toContain("responded_at = now()");
    expect(update?.text).toContain("athlete_id =");
    expect(update?.text).toContain("workspace_id =");
    expect(update?.text).toContain("status = 'invited'");
    expect(update?.values).toEqual(["confirmed", "day-1", "klique-os", "athlete-1"]);
  });

  it("refuses a media day that is not open", async () => {
    for (const dayStatus of ["draft", "completed", "cancelled"]) {
      installSqlMock({ linkRows: [{ day_status: dayStatus, athlete_status: "invited" }] });
      await expect(respondToMediaDay(athleteAccess, "day-1", "confirmed")).rejects.toBeInstanceOf(
        MediaDayForbiddenError,
      );
      expect(findCall("update media_day_athletes")).toBeUndefined();
    }
  });

  it("refuses a second answer", async () => {
    for (const athleteStatus of ["confirmed", "declined", "completed"]) {
      installSqlMock({ linkRows: [{ day_status: "open", athlete_status: athleteStatus }] });
      await expect(respondToMediaDay(athleteAccess, "day-1", "confirmed")).rejects.toBeInstanceOf(
        MediaDayForbiddenError,
      );
      expect(findCall("update media_day_athletes")).toBeUndefined();
    }
  });

  it("reports an unknown link between the athlete and the media day", async () => {
    installSqlMock({ linkRows: [] });

    await expect(respondToMediaDay(athleteAccess, "day-1", "confirmed")).rejects.toBeInstanceOf(
      MediaDayNotFoundError,
    );
    expect(findCall("update media_day_athletes")).toBeUndefined();
  });

  it("returns the refreshed media day scoped to the athlete", async () => {
    const updated = await respondToMediaDay(athleteAccess, "day-1", "confirmed");

    expect(updated).toMatchObject({ id: "day-1", status: "open" });
    expect(findCall("from media_days d")?.values).toContain("athlete-1");
  });
});
