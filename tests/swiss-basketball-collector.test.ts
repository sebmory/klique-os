import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  SWISS_BASKETBALL_SOURCE_NAME,
  collectSwissBasketballCandidates,
  verifySwissBasketballBinding,
} from "@/lib/sports-watch/swiss-basketball-collector";

const fixture = (name: string) => readFileSync(
  new URL(`./fixtures/sports-watch/${name}`, import.meta.url),
  "utf8",
);

const athlete = {
  id: "mila-benjak",
  name: "Mila Benjak",
  sport: "Basketball",
  club: "BCF Elfic Fribourg",
};

const holdingsUrl = "https://swiss.basketball/basketplan/findAllLeagueHoldings.do?lang=fr&xmlView=rss&leagueId=7&federationId=12&seasonId=31";
const scheduleUrl = "https://swiss.basketball/basketplan/showLeagueSchedule.do?lang=fr&xmlView=rss&leagueId=7&leagueHoldingId=11329&daysBack=2500&daysFuture=2250&totalGames=200&resultType=big";
const gameUrl = "https://swiss.basketball/basketplan/showGameOverview.do?lang=fr&xmlView=rss&gameId=367576";

const responses = (game = fixture("swiss-basketball-game-367576.xml")) => new Map([
  [holdingsUrl, fixture("swiss-basketball-holdings.xml")],
  [scheduleUrl, fixture("swiss-basketball-schedule.xml")],
  [gameUrl, game],
]);

const fetchFrom = (entries: Map<string, string>) => vi.fn<typeof fetch>(async (input) => {
  const body = entries.get(String(input));
  return body
    ? new Response(body, { status: 200, headers: { "Content-Type": "text/xml" } })
    : new Response("Not found", { status: 404 });
});

describe("Swiss Basketball collector", () => {
  it("verifies configurable season, league, team and CRM player identity from official XML", async () => {
    const fetchMock = fetchFrom(responses());
    const verification = await verifySwissBasketballBinding(athlete, {
      seasonId: "31",
      leagueId: "7",
      teamId: "1269",
      dependencies: {
        fetch: fetchMock,
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });

    expect(verification.officialIdentity).toMatchObject({
      federationId: "12",
      seasonId: "31",
      seasonName: "2026-2027",
      leagueId: "7",
      leagueName: "NLB Women",
      teamId: "1269",
      teamName: "Elfic Fribourg Génération",
      clubId: "199",
      playerId: "71375",
      playerName: "Mila Benjak",
    });
    expect(verification.evidence.join(" ")).toContain("feuille officielle 367576");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps score, roster presence, starter status and explicit points separate", async () => {
    const verification = await verifySwissBasketballBinding(athlete, {
      seasonId: "31",
      leagueId: "7",
      teamId: "1269",
      dependencies: {
        fetch: fetchFrom(responses()),
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });
    const fetchMock = fetchFrom(responses());
    const result = await collectSwissBasketballCandidates(athlete, {
      identity: verification.officialIdentity,
      dependencies: {
        fetch: fetchMock,
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });

    expect(result.scannedCount).toBe(3);
    expect(result.recentCount).toBe(1);
    expect(result.observations).toEqual([
      expect.objectContaining({ status: "participation_explicit", eventDate: "2026-10-25" }),
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      sourceKey: "swiss-basketball",
      sourceName: SWISS_BASKETBALL_SOURCE_NAME,
      eventDateFrom: "2026-10-25",
      logicalKey: "swiss-basketball|31|7|1269|367576|71375",
    });
    expect(result.candidates[0].excerpt).toContain("Elfic Fribourg Génération 63–51 BC Arlesheim");
    expect(result.candidates[0].excerpt).toContain("Titularisation : non");
    expect(result.candidates[0].excerpt).toContain("PTS 16");
    expect(result.candidates[0].excerpt).toContain("Minutes et autres statistiques absentes");
    expect(result.candidates[0].excerpt).not.toContain("MIN 0");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not infer participation from roster presence or turn an absent value into zero", async () => {
    const listedOnly = fixture("swiss-basketball-game-367576.xml")
      .replace(' points="16"', "");
    const identity = {
      scheduleUrl: holdingsUrl,
      federationId: "12",
      seasonId: "31",
      seasonName: "2026-2027",
      leagueId: "7",
      leagueName: "NLB Women",
      teamId: "1269",
      teamName: "Elfic Fribourg Génération",
      clubId: "199",
      playerId: "71375",
      playerName: "Mila Benjak",
    };
    const result = await collectSwissBasketballCandidates(athlete, {
      identity,
      dependencies: {
        fetch: fetchFrom(responses(listedOnly)),
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].resultKind).toBe("participation");
    expect(result.candidates[0].excerpt).toContain(
      "Participation non établie par la seule présence sur la feuille.",
    );
    expect(result.candidates[0].excerpt).toContain(
      "Aucune statistique individuelle chiffrée explicite n’est présente.",
    );
    expect(result.candidates[0].excerpt).not.toContain("PTS 0");
    expect(result.observations).toEqual([
      expect.objectContaining({ status: "player_listed_without_participation" }),
    ]);
  });
});
