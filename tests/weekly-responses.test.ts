import { describe, expect, it } from "vitest";
import {
  getSafeHttpsUrl,
  getWeeklyResponseDetails,
  getWeeklyResponsePriority,
  getWeeklyResponseSummary,
  selectWeeklyResponses,
} from "@/lib/weekly-responses";
import type { Athlete, WeeklyFormResponse } from "@/types/athlete";

const NOW = new Date(2026, 9, 17, 14, 0, 0).getTime();

const createResponse = (overrides: Partial<WeeklyFormResponse> = {}): WeeklyFormResponse => ({
  timestamp: "16/10/2026 10:00:00",
  competitionParticipation: "",
  competition: "",
  result: "",
  notableEvent: "",
  notableEventExplanation: "",
  media: "",
  mediaLink: "",
  appointment: "",
  quickContact: "",
  quickContactReason: "",
  contactRequested: false,
  firstAppointmentDate: "",
  secondAppointmentDate: "",
  thirdAppointmentDate: "",
  ...overrides,
});

const createAthlete = (
  key: string,
  weeklyFormResponse: WeeklyFormResponse,
  overrides: Partial<Athlete> = {},
): Athlete => ({
  key,
  athleteId: key,
  name: key,
  initials: key.slice(0, 2).toUpperCase(),
  sport: "Basketball",
  club: "",
  status: "Actif",
  instagram: "",
  phone: "",
  email: "",
  nextContact: "",
  notes: "",
  palmares: "",
  objective: "",
  longTerm: "",
  desiredAreas: "",
  lastContact: "",
  nextAction: "",
  followUpNotes: "",
  lastResponseMonthly: "",
  lastResponseWeekly: weeklyFormResponse.timestamp,
  weeklyFormResponse,
  lastPublication: "",
  titlesOfMonth: "",
  analysisItems: "",
  plannedContents: "",
  lastPost: "",
  lastStory: "",
  daysWithoutVisibility: 0,
  lastShoot: "",
  media: 0,
  premium: 0,
  coverage: 0,
  tone: "correct",
  heightWeight: "",
  birthDate: "",
  nationality: "",
  position: "",
  competitionPhoto: false,
  adhesionDate: "",
  ...overrides,
});

describe("weekly response read model", () => {
  it("returns every unprocessed latest response in the rolling 14-day window without a four-item cap", () => {
    const athletes = Array.from({ length: 7 }, (_, index) =>
      createAthlete(`athlete-${index}`, createResponse({
        timestamp: `${10 + index}/10/2026 10:00:00`,
        notableEvent: `Actualité ${index}`,
      })),
    );
    const processed = new Set([
      JSON.stringify(["athlete-1", "11/10/2026 10:00:00"]),
    ]);

    const selected = selectWeeklyResponses(athletes, processed, NOW);

    expect(selected).toHaveLength(6);
    expect(selected.map((item) => item.athlete.key)).not.toContain("athlete-1");
  });

  it("keeps only the most recent response for a canonical athlete id", () => {
    const older = createAthlete("same-athlete", createResponse({ timestamp: "10/10/2026 10:00:00", result: "Ancien" }));
    const latest = createAthlete("same-athlete", createResponse({ timestamp: "16/10/2026 10:00:00", result: "Récent" }));

    const selected = selectWeeklyResponses([older, latest], new Set(), NOW);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.response.result).toBe("Récent");
  });

  it("restores every meaningful Liban field and builds a deterministic summary", () => {
    const response = createResponse({
      competitionParticipation: "Oui",
      competition: "Coupe suisse",
      result: "Win avec bonne apport defensif",
      appointment: "Match de championnat vs Sarine",
    });

    const details = getWeeklyResponseDetails(response);

    expect(details.map((item) => item.value)).toEqual(expect.arrayContaining([
      "Coupe suisse",
      "Win avec bonne apport defensif",
      "Match de championnat vs Sarine",
    ]));
    expect(getWeeklyResponseSummary(response)).toBe("Victoire en Coupe suisse");
    expect(getWeeklyResponsePriority(response)).toMatchObject({ level: 3, label: "Performance" });
  });

  it("summarizes Antoine's ankle injury without copying his long explanation", () => {
    const response = createResponse({
      competition: "Interclub contre Glane",
      result: "Perdu mon double 15-13/15-13 mais gagne la rencontre 4-3",
      notableEvent: "Blessure",
      notableEventExplanation: "petite torsion de la cheville mais rien de grave pas eu besoin de faire de pause",
      appointment: "Non",
    });

    expect(getWeeklyResponsePriority(response)).toMatchObject({ level: 2, label: "Difficulté signalée" });
    expect(getWeeklyResponseSummary(response)).toBe("Blessure à la cheville");
    expect(getWeeklyResponseDetails(response)).toContainEqual(expect.objectContaining({
      key: "notableEventExplanation",
      value: "petite torsion de la cheville mais rien de grave pas eu besoin de faire de pause",
    }));
  });

  it("uses Tylian's explicit first victory instead of prefixing his free-form competition sentence", () => {
    const response = createResponse({
      competition: "J’ai eu un match vendredi passé contre Echallens",
      result: "On a gagner 113-57 et j’ai mis 24 pts, 6 assitst et 3 rebond",
      notableEvent: "Premier victoire de la saison",
      notableEventExplanation: "Une première victoire de la saison et j’ai fais un bon match je trouve",
    });

    expect(getWeeklyResponsePriority(response)).toMatchObject({ level: 3, label: "Performance" });
    expect(getWeeklyResponseSummary(response)).toBe("Première victoire de la saison");
    expect(getWeeklyResponseSummary(response)).not.toContain("J’ai eu un match");
  });

  it("classifies Chiona's explicit 12 points as a performance before her future match", () => {
    const response = createResponse({
      competition: "Match contre Arlesheim 1LN",
      result: "Défaite 60-48, points mis : 12",
      notableEventExplanation: "//",
      appointment: "Match contre Zürich",
    });

    expect(getWeeklyResponsePriority(response)).toMatchObject({ level: 3, label: "Performance" });
    expect(getWeeklyResponseSummary(response)).toBe("12 points inscrits");
    expect(getWeeklyResponseDetails(response)).toContainEqual(expect.objectContaining({
      key: "appointment",
      value: "Match contre Zürich",
    }));
  });

  it("keeps Mila's record ahead of her upcoming events", () => {
    const response = createResponse({
      competition: "SBLW vs Hélios",
      result: "Gagné",
      notableEvent: "Nouveau record",
      notableEventExplanation: "Nouveau record de points en SBLW (9 points)",
      appointment: "Eurocup et SBLW",
    });

    expect(getWeeklyResponsePriority(response)).toMatchObject({ level: 3, label: "Performance" });
    expect(getWeeklyResponseSummary(response)).toBe("Nouveau record personnel");
  });

  it.each([
    ["On a gagné", "Match contre Echallens", "Victoire contre Echallens"],
    ["Victoire importante", "Championnat régional", "Victoire en championnat"],
    ["Win", "J’ai joué une longue rencontre vendredi soir", "Victoire"],
  ])("builds a safe victory title for %s / %s", (result, competition, expected) => {
    const response = createResponse({ result, competition });

    expect(getWeeklyResponseSummary(response)).toBe(expected);
    expect(getWeeklyResponseSummary(response).split(/\s+/).length).toBeLessThanOrEqual(7);
  });

  it("returns all entered business fields and removes empty or technical absence values", () => {
    const response = createResponse({
      competitionParticipation: "Oui",
      competition: "Finale",
      result: "2e place",
      notableEvent: "Sélection",
      notableEventExplanation: "Première convocation",
      media: "Photos disponibles",
      mediaLink: "https://example.com/resultats",
      appointment: "Stage national",
      quickContact: "Oui",
      quickContactReason: "Besoin d'accompagnement",
      firstAppointmentDate: "20/10/2026",
      secondAppointmentDate: "  ",
      thirdAppointmentDate: "//",
    });

    const details = getWeeklyResponseDetails(response);

    expect(details).toHaveLength(11);
    expect(details.map((item) => item.key)).not.toContain("secondAppointmentDate");
    expect(details.map((item) => item.key)).not.toContain("thirdAppointmentDate");
    expect(getWeeklyResponseDetails(createResponse({
      competition: "-",
      result: "//",
      notableEvent: " ",
    }))).toEqual([]);
  });

  it("accepts only safe HTTPS links", () => {
    expect(getSafeHttpsUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(getSafeHttpsUrl("http://example.com/path")).toBeNull();
    expect(getSafeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(getSafeHttpsUrl("not a url")).toBeNull();
  });

  it.each([
    [createResponse({ quickContact: "Oui", contactRequested: true }), 1, "action"],
    [createResponse({ notableEventExplanation: "Douleur au dos" }), 2, "danger"],
    [createResponse({ result: "Nouveau record personnel" }), 3, "success"],
    [createResponse({ appointment: "Match samedi" }), 4, "event"],
    [createResponse({ notableEvent: "Actualité du club" }), 5, "neutral"],
  ] as const)("computes priority level %# from entered values only", (response, level, tone) => {
    expect(getWeeklyResponsePriority(response)).toMatchObject({ level, tone });
  });

  it("orders by priority, then newest date, then stable input order", () => {
    const ordinaryOld = createAthlete("ordinary-old", createResponse({
      timestamp: "15/10/2026 10:00:00",
      notableEvent: "Actualité",
    }));
    const ordinaryNewFirst = createAthlete("ordinary-new-first", createResponse({
      timestamp: "16/10/2026 10:00:00",
      notableEvent: "Actualité A",
    }));
    const ordinaryNewSecond = createAthlete("ordinary-new-second", createResponse({
      timestamp: "16/10/2026 10:00:00",
      notableEvent: "Actualité B",
    }));
    const contact = createAthlete("contact", createResponse({
      timestamp: "14/10/2026 10:00:00",
      quickContact: "Oui",
      contactRequested: true,
    }));

    const selected = selectWeeklyResponses(
      [ordinaryOld, ordinaryNewFirst, ordinaryNewSecond, contact],
      new Set(),
      NOW,
    );

    expect(selected.map((item) => item.athlete.key)).toEqual([
      "contact",
      "ordinary-new-first",
      "ordinary-new-second",
      "ordinary-old",
    ]);
  });
});
