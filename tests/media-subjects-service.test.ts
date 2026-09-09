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

import type { ContentAccessContext } from "@/lib/content-storage/access";
import {
  MediaSubjectValidationError,
  createMediaSubject,
  deleteMediaSubject,
  getMediaSubjectById,
  listMediaSubjects,
  normalizeMediaRequestTypes,
  normalizeMediaSubjectCoverUrl,
  normalizeMediaSubjectDate,
  normalizeMediaSubjectStatus,
  updateMediaSubject,
} from "@/lib/media-subjects/service";

const adminAccess: ContentAccessContext = {
  clerkUserId: "user_admin",
  workspaceId: "klique-os",
  role: "admin",
  isAdmin: true,
};

const mediaAccess: ContentAccessContext = {
  clerkUserId: "user_media",
  workspaceId: "klique-os",
  role: "media",
  isAdmin: false,
};

const otherWorkspaceAccess: ContentAccessContext = {
  clerkUserId: "user_admin_2",
  workspaceId: "autre-workspace",
  role: "admin",
  isAdmin: true,
};

const subjectRow = (overrides: Record<string, unknown> = {}) => ({
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
  athlete_ids: ["athlete-1", "athlete-2"],
  ...overrides,
});

type SqlCall = { text: string; values: unknown[] };

let calls: SqlCall[] = [];

const installSqlMock = (selectRows: Array<Record<string, unknown>> = [subjectRow()]) => {
  calls = [];
  getAthletesFromGoogleSheetsMock.mockResolvedValue([
    { key: "athlete-1", name: "Mila Benjak" },
    { key: "athlete-2", name: "Loan Cueto" },
    { key: "athlete-secret", name: "Athlete Confidentiel" },
  ]);
  sqlMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(" ").toLowerCase();
    calls.push({ text, values });

    if (text.includes("from media_subjects s")) {
      return selectRows;
    }
    if (text.includes("update media_subjects") || text.includes("delete from media_subjects")) {
      return [{ id: "subject-1" }];
    }
    return [];
  });
  createContentStorageClientMock.mockReturnValue(sqlMock);
};

const findCall = (fragment: string) => calls.find((call) => call.text.includes(fragment));
const findCalls = (fragment: string) => calls.filter((call) => call.text.includes(fragment));

const validInput = {
  title: "Retour de blessure",
  summary: "Resume du sujet",
  angle: "Angle editorial",
  sport: "Tennis",
  location: "Fribourg",
  date: "2026-09-08",
  coverImageUrl: "https://blob.example.com/media-subjects/a.jpg",
  availableRequestTypes: ["interview", "images"],
  athleteIds: ["athlete-1", "athlete-2"],
  status: "published",
};

describe("media subjects normalization", () => {
  it("keeps only the three allowed statuses", () => {
    expect(normalizeMediaSubjectStatus("published")).toBe("published");
    expect(normalizeMediaSubjectStatus("archived")).toBe("archived");
    expect(normalizeMediaSubjectStatus("draft")).toBe("draft");
    expect(normalizeMediaSubjectStatus("Publié")).toBe("draft");
    expect(normalizeMediaSubjectStatus(null)).toBe("draft");
  });

  it("accepts only https visuals", () => {
    expect(normalizeMediaSubjectCoverUrl("https://blob.example.com/a.jpg")).toBe("https://blob.example.com/a.jpg");
    expect(normalizeMediaSubjectCoverUrl("http://blob.example.com/a.jpg")).toBeNull();
    expect(normalizeMediaSubjectCoverUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeMediaSubjectCoverUrl("")).toBeNull();
    expect(normalizeMediaSubjectCoverUrl(42)).toBeNull();
  });

  it("normalizes dates to a civil date and rejects unusable values", () => {
    expect(normalizeMediaSubjectDate("2026-09-08")).toBe("2026-09-08");
    expect(normalizeMediaSubjectDate("2026-09-08 00:00:00+00")).toBe("2026-09-08");
    expect(normalizeMediaSubjectDate(new Date("2026-09-08T10:00:00.000Z"))).toBe("2026-09-08");
    expect(normalizeMediaSubjectDate("Tue Sep 08 2026")).toBe("2026-09-08");
    expect(normalizeMediaSubjectDate("pas-une-date")).toBeNull();
    expect(normalizeMediaSubjectDate(null)).toBeNull();
  });

  it("keeps only the five supported request types, deduplicated and ordered", () => {
    expect(normalizeMediaRequestTypes(["podcast", "interview", "interview", "inconnu"])).toEqual([
      "interview",
      "podcast",
    ]);
    expect(normalizeMediaRequestTypes(["INTERVIEW", " Reaction ", "reportage", "images"])).toEqual([
      "interview",
      "reaction",
      "reportage",
      "images",
    ]);
    expect(normalizeMediaRequestTypes("interview")).toEqual([]);
    expect(normalizeMediaRequestTypes([])).toEqual([]);
  });
});

describe("media subjects read isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("filters the list by workspace and restricts a media user to published subjects", async () => {
    await listMediaSubjects(mediaAccess);

    const select = findCall("from media_subjects s");
    expect(select?.values).toContain("klique-os");
    expect(select?.values).toContain(false);
    expect(select?.text).toContain("s.workspace_id =");
    expect(select?.text).toContain("or s.status = 'published'");
  });

  it("lets an admin read every status of its own workspace", async () => {
    await listMediaSubjects(adminAccess);

    const select = findCall("from media_subjects s");
    expect(select?.values).toContain(true);
    expect(select?.values).toContain("klique-os");
  });

  it("never reads a subject outside the caller workspace", async () => {
    await getMediaSubjectById(otherWorkspaceAccess, "subject-1");

    const select = findCall("from media_subjects s");
    expect(select?.values).toContain("autre-workspace");
    expect(select?.values).not.toContain("klique-os");
  });

  it("maps the row into a subject with its athletes and request types", async () => {
    const subject = await getMediaSubjectById(mediaAccess, "subject-1");

    expect(subject).toMatchObject({
      id: "subject-1",
      status: "published",
      date: "2026-09-08",
      coverImageUrl: "https://blob.example.com/media-subjects/a.jpg",
      availableRequestTypes: ["interview", "images"],
      athleteIds: ["athlete-1", "athlete-2"],
    });
  });

  it("drops a non https visual coming from the database", async () => {
    installSqlMock([subjectRow({ cover_image_url: "http://blob.example.com/a.jpg" })]);

    const subject = await getMediaSubjectById(mediaAccess, "subject-1");
    expect(subject?.coverImageUrl).toBeNull();
  });

  it("returns the names of the linked athletes only", async () => {
    const subjects = await listMediaSubjects(mediaAccess);

    expect(subjects[0].athletes).toEqual([
      { id: "athlete-1", name: "Mila Benjak" },
      { id: "athlete-2", name: "Loan Cueto" },
    ]);
    expect(JSON.stringify(subjects)).not.toContain("Athlete Confidentiel");
    expect(JSON.stringify(subjects)).not.toContain("athlete-secret");
  });

  it("keeps athleteIds for the admin interface", async () => {
    const subject = await getMediaSubjectById(adminAccess, "subject-1");
    expect(subject?.athleteIds).toEqual(["athlete-1", "athlete-2"]);
  });

  it("never resolves athletes when no subject is returned", async () => {
    installSqlMock([]);

    const subjects = await listMediaSubjects(mediaAccess);

    expect(subjects).toEqual([]);
    expect(getAthletesFromGoogleSheetsMock).not.toHaveBeenCalled();
  });

  it("falls back on the identifier when the athlete source is unavailable", async () => {
    installSqlMock();
    getAthletesFromGoogleSheetsMock.mockRejectedValue(new Error("sheets down"));

    const subjects = await listMediaSubjects(mediaAccess);

    expect(subjects[0].athletes).toEqual([
      { id: "athlete-1", name: "athlete-1" },
      { id: "athlete-2", name: "athlete-2" },
    ]);
  });
});

describe("media subjects writes are admin only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("refuses create, update and delete for an active media user", async () => {
    await expect(createMediaSubject(mediaAccess, validInput)).rejects.toThrow("Forbidden");
    await expect(updateMediaSubject(mediaAccess, "subject-1", validInput)).rejects.toThrow("Forbidden");
    await expect(deleteMediaSubject(mediaAccess, "subject-1")).rejects.toThrow("Forbidden");

    expect(findCall("insert into media_subjects")).toBeUndefined();
    expect(findCall("update media_subjects")).toBeUndefined();
    expect(findCall("delete from media_subjects")).toBeUndefined();
  });

  it("rejects an incomplete subject before any write", async () => {
    await expect(createMediaSubject(adminAccess, { ...validInput, title: "  " })).rejects.toBeInstanceOf(
      MediaSubjectValidationError,
    );
    await expect(createMediaSubject(adminAccess, { ...validInput, summary: "" })).rejects.toBeInstanceOf(
      MediaSubjectValidationError,
    );
    await expect(createMediaSubject(adminAccess, { ...validInput, angle: "" })).rejects.toBeInstanceOf(
      MediaSubjectValidationError,
    );
    await expect(
      createMediaSubject(adminAccess, { ...validInput, availableRequestTypes: ["inconnu"] }),
    ).rejects.toBeInstanceOf(MediaSubjectValidationError);

    expect(findCall("insert into media_subjects")).toBeUndefined();
  });

  it("scopes update and delete to the caller workspace", async () => {
    await updateMediaSubject(adminAccess, "subject-1", validInput);
    expect(findCall("update media_subjects")?.text).toContain("workspace_id =");
    expect(findCall("update media_subjects")?.values).toContain("klique-os");

    installSqlMock();
    await deleteMediaSubject(adminAccess, "subject-1");
    expect(findCall("delete from media_subjects")?.values).toContain("klique-os");
  });
});

describe("media subjects publication and athletes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSqlMock();
  });

  it("sets published_at when a subject is created as published", async () => {
    await createMediaSubject(adminAccess, validInput);

    const insert = findCall("insert into media_subjects");
    const publishedAt = insert?.values.find(
      (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value),
    );
    expect(publishedAt).toBeTruthy();
    expect(insert?.values).toContain("published");
    expect(insert?.values).toContain("klique-os");
  });

  it("leaves published_at null when a subject is created as draft", async () => {
    await createMediaSubject(adminAccess, { ...validInput, status: "draft" });

    const insert = findCall("insert into media_subjects");
    expect(insert?.values).toContain("draft");
    expect(insert?.values).toContain(null);
    expect(insert?.values.some((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value))).toBe(false);
  });

  it("keeps the first publication date and clears it outside the published status", async () => {
    await updateMediaSubject(adminAccess, "subject-1", validInput);

    const update = findCall("update media_subjects");
    expect(update?.text).toContain("coalesce(published_at, now())");
    expect(update?.text).toContain("else null");
  });

  it("replaces the athlete association within the workspace", async () => {
    await createMediaSubject(adminAccess, validInput);

    const cleanup = findCall("delete from media_subject_athletes");
    expect(cleanup?.values).toContain("klique-os");

    const links = findCalls("insert into media_subject_athletes");
    expect(links).toHaveLength(2);
    expect(links.flatMap((call) => call.values)).toEqual(
      expect.arrayContaining(["athlete-1", "athlete-2", "klique-os"]),
    );
  });

  it("accepts a subject without any athlete", async () => {
    await createMediaSubject(adminAccess, { ...validInput, athleteIds: [] });

    expect(findCalls("insert into media_subject_athletes")).toHaveLength(0);
    expect(findCall("delete from media_subject_athletes")).toBeDefined();
  });
});
