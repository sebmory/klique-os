import { describe, expect, it } from "vitest";
import {
  MEDIA_REQUEST_ACTION_LABELS,
  MEDIA_REQUEST_TYPE_LABELS,
  type MediaSubject,
  collectSubjectSports,
  filterMediaSubjects,
  formatSubjectDateLabel,
  getSubjectAthleteNames,
  sortRequestTypes,
} from "@/components/media-desk/media-subject-presentation";

const subject = (overrides: Partial<MediaSubject> = {}): MediaSubject => ({
  id: "subject-1",
  title: "Retour de blessure",
  summary: "Resume",
  angle: "Angle",
  sport: "Tennis",
  location: "Fribourg",
  date: "2026-09-08",
  coverImageUrl: "https://blob.example.com/a.jpg",
  availableRequestTypes: ["interview", "images"],
  athleteIds: ["athlete-1"],
  athletes: [{ id: "athlete-1", name: "Mila Benjak" }],
  status: "published",
  publishedAt: "2026-09-08T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
  ...overrides,
});

const noFilters = { query: "", sport: "all", requestType: "all" } as const;

describe("media subject presentation", () => {
  it("formats the date in french or falls back", () => {
    expect(formatSubjectDateLabel("2026-09-08")).toBe("08.09.2026");
    expect(formatSubjectDateLabel("2026-09-08 00:00:00+00")).toBe("08.09.2026");
    expect(formatSubjectDateLabel(null)).toBe("Sans date");
    expect(formatSubjectDateLabel("pas-une-date")).toBe("Sans date");
  });

  it("reads the athlete names carried by the subject and falls back on the id", () => {
    expect(
      getSubjectAthleteNames(
        subject({
          athleteIds: ["athlete-1", "athlete-9"],
          athletes: [
            { id: "athlete-1", name: "Mila Benjak" },
            { id: "athlete-9", name: "athlete-9" },
          ],
        }),
      ),
    ).toEqual(["Mila Benjak", "athlete-9"]);

    expect(getSubjectAthleteNames(subject({ athleteIds: ["athlete-3"], athletes: [] }))).toEqual(["athlete-3"]);
  });

  it("collects the distinct sports for the filter", () => {
    expect(
      collectSubjectSports([subject(), subject({ id: "b", sport: "Badminton" }), subject({ id: "c", sport: null })]),
    ).toEqual(["Badminton", "Tennis"]);
  });

  it("orders the request types and exposes both label sets", () => {
    expect(sortRequestTypes(["podcast", "interview", "images"])).toEqual(["interview", "images", "podcast"]);
    expect(MEDIA_REQUEST_TYPE_LABELS.reaction).toBe("Réaction");
    expect(MEDIA_REQUEST_ACTION_LABELS.podcast).toBe("Demander un podcast");
  });
});

describe("media subject filtering", () => {
  it("never exposes a subject that is not published", () => {
    const subjects = [subject(), subject({ id: "draft", status: "draft" }), subject({ id: "old", status: "archived" })];

    expect(filterMediaSubjects(subjects, noFilters).map((entry) => entry.id)).toEqual(["subject-1"]);
  });

  it("searches on the title, the sport and the athlete name", () => {
    const subjects = [
      subject({
        id: "a",
        title: "Retour de blessure",
        sport: "Tennis",
        athleteIds: ["athlete-1"],
        athletes: [{ id: "athlete-1", name: "Mila Benjak" }],
      }),
      subject({
        id: "b",
        title: "Camp intensif",
        sport: "Badminton",
        athleteIds: ["athlete-2"],
        athletes: [{ id: "athlete-2", name: "Loan Cueto" }],
      }),
    ];

    const search = (query: string) =>
      filterMediaSubjects(subjects, { ...noFilters, query }).map((entry) => entry.id);

    expect(search("retour")).toEqual(["a"]);
    expect(search("badminton")).toEqual(["b"]);
    expect(search("loan")).toEqual(["b"]);
    expect(search("  MILA ")).toEqual(["a"]);
    expect(search("inconnu")).toEqual([]);
  });

  it("filters by sport and by request type", () => {
    const subjects = [
      subject({ id: "a", sport: "Tennis", availableRequestTypes: ["interview"] }),
      subject({ id: "b", sport: "Badminton", availableRequestTypes: ["podcast", "images"] }),
    ];

    expect(
      filterMediaSubjects(subjects, { ...noFilters, sport: "Badminton" }).map((entry) => entry.id),
    ).toEqual(["b"]);

    expect(
      filterMediaSubjects(subjects, { ...noFilters, requestType: "interview" }).map((entry) => entry.id),
    ).toEqual(["a"]);

    expect(filterMediaSubjects(subjects, { ...noFilters, sport: "Tennis", requestType: "podcast" })).toEqual([]);
  });
});
