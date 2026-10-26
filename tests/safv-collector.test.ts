import { describe, expect, it, vi } from "vitest";
import {
  collectSafvCandidates,
  verifySafvTeam,
} from "@/lib/sports-watch/safv-collector";

const athlete = {
  id: "herez-moussa",
  name: "Herez Moussa",
  sport: "Football américain",
  club: "Lausanne Owls",
};

const scheduleUrl = "https://www.safv.ch/spiele-366618v4/leagues/14028";
const owls = { id: 352051, name: "LUCAF Owls", full_name: "Lausanne LUCAF Owls" };
const invaders = { id: 352052, name: "Langenthal Invaders" };

const game = (
  id: number,
  date: string,
  score1: number | null,
  score2: number | null,
  completed = true,
) => ({
  id,
  team1: invaders,
  team2: owls,
  score1,
  score2,
  start_date: `${date}T18:00:00+00:00`,
  completed,
  cancelled: false,
  competition: { id: 14028, name: "NLB" },
});

const scheduleHtml = (games = [
  game(2447915, "2026-07-04", 28, 7),
  game(2447916, "2026-07-20", 14, 21),
  game(2447917, "2026-07-05", null, null),
  game(2447918, "2026-05-01", 3, 10),
]): string => {
  const chunk = JSON.stringify({
    games,
    seasons: [{ id: 217, name: "2026", current: true }],
  });
  return `<html><script>self.__next_f.push(${JSON.stringify([1, chunk])})</script></html>`;
};

const fetchSchedule = (html = scheduleHtml()) => vi.fn(async () =>
  new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  }));

describe("SAFV sports watch collector", () => {
  it.runIf(process.env.KLIQUE_RUN_SAFV_LIVE === "1")(
    "reads the official LUCAF Owls league schedule once",
    async () => {
      const verification = await verifySafvTeam(athlete, {
        scheduleUrl,
        teamName: "LUCAF Owls",
      });
      expect(verification.officialTeam).toMatchObject({
        leagueId: "14028",
        teamId: "352051",
        teamName: "LUCAF Owls",
      });
    },
  );

  it("verifies the official team and current season from the league schedule", async () => {
    const verification = await verifySafvTeam(athlete, {
      scheduleUrl,
      teamName: "LUCAF Owls",
      dependencies: {
        fetch: fetchSchedule(),
        now: () => new Date("2026-07-10T12:00:00.000Z"),
      },
    });

    expect(verification.officialTeam).toEqual({
      scheduleUrl,
      leagueId: "14028",
      teamId: "352051",
      teamName: "LUCAF Owls",
      competitionName: "NLB",
      seasonId: "217",
      seasonName: "2026",
    });
    expect(verification.clubComparison).toBe("matching");
    expect(verification.evidence).toContain(
      "Ce rattachement établit seulement une veille collective ; aucune participation individuelle n’est vérifiée.",
    );
  });

  it("keeps only explicit completed results in the 30-day window", async () => {
    const result = await collectSafvCandidates(athlete, {
      team: {
        scheduleUrl,
        leagueId: "14028",
        teamId: "352051",
        teamName: "LUCAF Owls",
        competitionName: "NLB",
        seasonId: "217",
        seasonName: "2026",
      },
      dependencies: {
        fetch: fetchSchedule(),
        now: () => new Date("2026-07-10T12:00:00.000Z"),
      },
    });

    expect(result).toMatchObject({ scannedCount: 4, recentCount: 1 });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      sourceKey: "safv",
      resultKind: "collective_result",
      eventDateFrom: "2026-07-04",
      title: "NLB 2026 — Langenthal Invaders vs LUCAF Owls",
    });
    expect(result.candidates[0].excerpt).toContain(
      "Résultat collectif — participation individuelle non vérifiée.",
    );
    expect(result.candidates[0].excerpt).toContain("Score final explicite : 28-7.");
  });

  it("reports an unexpected or refused source instead of an empty result", async () => {
    await expect(verifySafvTeam(athlete, {
      scheduleUrl,
      teamName: "LUCAF Owls",
      dependencies: { fetch: fetchSchedule("<html>Calendrier indisponible</html>") },
    })).rejects.toThrow("données du calendrier sont absentes");

    await expect(verifySafvTeam(athlete, {
      scheduleUrl,
      teamName: "LUCAF Owls",
      dependencies: {
        fetch: vi.fn(async () => new Response("Forbidden", { status: 403 })),
      },
    })).rejects.toThrow("HTTP 403");
  });
});
