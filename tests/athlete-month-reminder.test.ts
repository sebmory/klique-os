import { describe, expect, it, vi } from "vitest";
import {
  loadAthleteMonthReminder,
  resolveAthleteMonthReminder,
  type AthleteMonthVoteState,
} from "@/lib/athlete-month-reminder";
import type {
  AthleteDistinctionNominationRecord,
  AthleteDistinctionRecord,
} from "@/lib/athlete-distinctions/service";

const completed: AthleteMonthVoteState = { nominationCount: 3, winnerAnnounced: true };
const empty: AthleteMonthVoteState = { nominationCount: 0, winnerAnnounced: false };

const resolve = (
  now: string,
  current: AthleteMonthVoteState = empty,
  previous: AthleteMonthVoteState = completed,
) => resolveAthleteMonthReminder({ now: new Date(now), current, previous });

const nomination = (id: string): AthleteDistinctionNominationRecord => ({
  id,
  workspaceId: "workspace-a",
  athleteId: `athlete-${id}`,
  type: "athlete_of_the_month",
  awardMonth: 11,
  awardYear: 2026,
  nominatedAt: "2026-11-25T10:00:00.000Z",
  reason: null,
  createdAt: "2026-11-25T10:00:00.000Z",
  updatedAt: "2026-11-25T10:00:00.000Z",
});

const winner = (month: number, year: number): AthleteDistinctionRecord => ({
  id: `winner-${year}-${month}`,
  workspaceId: "workspace-a",
  athleteId: "athlete-winner",
  type: "athlete_of_the_month",
  awardMonth: month,
  awardYear: year,
  awardedAt: `${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`,
  description: null,
  createdAt: `${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`,
  updatedAt: `${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`,
});

describe("rappel Admin de l’Athlète du mois", () => {
  it("ne prépare pas le vote le 24, puis le propose dès le 25 et le dernier jour à Zurich", () => {
    expect(resolve("2026-10-24T21:59:59.000Z")).toBeNull();
    expect(resolve("2026-10-24T22:00:00.000Z")).toMatchObject({
      status: "prepare",
      rewardMonth: 10,
      rewardYear: 2026,
      label: "Préparer le vote de l’Athlète du mois",
    });
    expect(resolve("2026-10-31T22:59:59.000Z")).toMatchObject({
      status: "prepare",
      rewardMonth: 10,
    });
  });

  it("fait passer le vote publié à l’annonce du 1er au 5 à 23:59 Europe/Zurich", () => {
    const published = { nominationCount: 3, winnerAnnounced: false };
    expect(resolve("2026-10-31T23:00:00.000Z", empty, published)).toMatchObject({
      status: "announce",
      rewardMonth: 10,
      label: "Annoncer l’Athlète du mois d’octobre",
      timingLabel: "À annoncer avant le 5 novembre",
    });
    expect(resolve("2026-11-05T22:59:59.000Z", empty, published)?.status).toBe("announce");
  });

  it("passe en retard exactement le 6 à 00:00 Europe/Zurich", () => {
    expect(resolve(
      "2026-11-05T23:00:00.000Z",
      empty,
      { nominationCount: 3, winnerAnnounced: false },
    )).toMatchObject({
      status: "overdue",
      priority: "urgente",
      timingLabel: "À annoncer avant le 5 novembre",
    });
  });

  it("gère le passage de décembre à janvier", () => {
    expect(resolve(
      "2026-12-31T23:00:00.000Z",
      empty,
      { nominationCount: 3, winnerAnnounced: false },
    )).toMatchObject({
      status: "announce",
      rewardMonth: 12,
      rewardYear: 2026,
      label: "Annoncer l’Athlète du mois de décembre",
      timingLabel: "À annoncer avant le 5 janvier",
    });
  });

  it("priorise un vote précédent incomplet et retire un vote terminé", () => {
    expect(resolve(
      "2026-11-25T10:00:00.000Z",
      empty,
      { nominationCount: 1, winnerAnnounced: false },
    )).toMatchObject({
      status: "overdue",
      rewardMonth: 10,
    });
    expect(resolve("2026-11-25T10:00:00.000Z", completed, completed)).toBeNull();
  });

  it("distingue le brouillon du vote publié sans changer le workflow existant", () => {
    expect(resolve(
      "2026-11-25T10:00:00.000Z",
      { nominationCount: 2, winnerAnnounced: false },
    )).toMatchObject({
      status: "draft",
      label: "Finaliser et annoncer le vote",
      actionCount: 1,
    });
    expect(resolve(
      "2026-11-25T10:00:00.000Z",
      { nominationCount: 3, winnerAnnounced: false },
    )).toMatchObject({
      status: "published",
      label: "Vote de l’Athlète du mois en cours",
      actionCount: 0,
    });
  });

  it("charge un seul rappel, isolé par workspace et sans mutation", async () => {
    const listNominations = vi.fn()
      .mockResolvedValueOnce([nomination("1"), nomination("2"), nomination("3")])
      .mockResolvedValueOnce([nomination("previous")]);
    const getWinner = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner(10, 2026));

    const reminder = await loadAthleteMonthReminder(
      "workspace-a",
      new Date("2026-11-25T10:00:00.000Z"),
      { listNominations, getWinner },
    );

    expect(reminder?.status).toBe("published");
    expect(listNominations).toHaveBeenCalledTimes(2);
    expect(getWinner).toHaveBeenCalledTimes(2);
    expect([...listNominations.mock.calls, ...getWinner.mock.calls]
      .every((call) => call[3] === "workspace-a")).toBe(true);
  });
});
