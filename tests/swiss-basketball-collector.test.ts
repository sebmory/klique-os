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
const scheduleUrl = "https://swiss.basketball/basketplan/showLeagueSchedule.do?lang=fr&xmlView=rss&federationId=12&seasonId=31&leagueId=7&leagueHoldingId=11329&daysBack=2500&daysFuture=2250&totalGames=200&resultType=big";
const gameUrl = "https://swiss.basketball/basketplan/showGameOverview.do?lang=fr&xmlView=rss&gameId=367576";
const avbHoldingsUrl = "https://swiss.basketball/basketplan/findAllLeagueHoldings.do?lang=fr&xmlView=rss&leagueId=984&federationId=6&seasonId=31";
const avbScheduleUrl = "https://swiss.basketball/basketplan/showLeagueSchedule.do?lang=fr&xmlView=rss&federationId=6&seasonId=31&leagueId=984&leagueHoldingId=11432&daysBack=2500&daysFuture=2250&totalGames=200&resultType=big";
const avbGame371191Url = "https://swiss.basketball/basketplan/showGameOverview.do?lang=fr&xmlView=rss&gameId=371191";
const avbGame371193Url = "https://swiss.basketball/basketplan/showGameOverview.do?lang=fr&xmlView=rss&gameId=371193";

const responses = (game = fixture("swiss-basketball-game-367576.xml")) => new Map([
  [holdingsUrl, fixture("swiss-basketball-holdings.xml")],
  [scheduleUrl, fixture("swiss-basketball-schedule.xml")],
  [gameUrl, game],
]);

const avbResponses = (
  game371191 = fixture("swiss-basketball-game-371191.xml"),
  game371193 = fixture("swiss-basketball-game-371193.xml"),
) => new Map([
  [avbHoldingsUrl, fixture("swiss-basketball-avb-holdings.xml")],
  [avbScheduleUrl, fixture("swiss-basketball-avb-schedule.xml")],
  [avbGame371191Url, game371191],
  [avbGame371193Url, game371193],
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
      officialPlayerId: "71375",
      officialPlayerName: "Mila Benjak",
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
      playerName: "Benjak Mila",
    });
    expect(verification.evidence.join(" ")).toContain("feuille officielle 367576");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("verifies and collects an AVB federation binding using the recorded official sheets", async () => {
    const tylian = {
      id: "tylian-pinton",
      name: "Tylian Pinton",
      sport: "Basketball",
      club: "BBC Cossonay",
    };
    const verificationFetch = fetchFrom(avbResponses());
    const verification = await verifySwissBasketballBinding(tylian, {
      federationId: "6",
      seasonId: "31",
      leagueId: "984",
      teamId: "326",
      officialPlayerId: "83782",
      officialPlayerName: "Pinton Tylian",
      dependencies: {
        fetch: verificationFetch,
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });

    expect(verification.officialIdentity).toMatchObject({
      federationId: "6",
      seasonId: "31",
      leagueId: "984",
      leagueName: "U 20M",
      teamId: "326",
      teamName: "BBC Cossonay U20M   (AVB)",
      clubId: "17",
      playerId: "83782",
      playerName: "Pinton Tylian",
    });
    expect(verification.evidence.join(" ")).toContain("feuille officielle 371193");
    expect(verificationFetch).toHaveBeenCalledTimes(3);

    const collectionFetch = fetchFrom(avbResponses());
    const result = await collectSwissBasketballCandidates(tylian, {
      identity: verification.officialIdentity,
      dependencies: {
        fetch: collectionFetch,
        now: () => new Date("2026-10-20T10:00:00.000Z"),
      },
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.excerpt)).toEqual([
      expect.stringContaining("PTS 24"),
      expect.stringContaining("PTS 16"),
    ]);
    expect(collectionFetch).toHaveBeenCalledWith(
      avbHoldingsUrl,
      expect.any(Object),
    );
    expect(collectionFetch).toHaveBeenCalledWith(
      avbScheduleUrl,
      expect.any(Object),
    );
  });

  it("rejects a sheet whose federation differs from the configured federation", async () => {
    const nationalSheet = fixture("swiss-basketball-game-371193.xml")
      .replace('federationId="6"', 'federationId="12"');

    await expect(verifySwissBasketballBinding(athlete, {
      federationId: "6",
      seasonId: "31",
      leagueId: "984",
      teamId: "326",
      officialPlayerId: "83782",
      officialPlayerName: "Pinton Tylian",
      dependencies: {
        fetch: fetchFrom(avbResponses(
          fixture("swiss-basketball-game-371191.xml"),
          nationalSheet,
        )),
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    })).rejects.toThrow("appartient à la fédération 12, pas à la fédération 6");
  });

  it("accepts an exact official identity when the sheet reverses first and last name order", async () => {
    const verification = await verifySwissBasketballBinding(athlete, {
      seasonId: "31",
      leagueId: "7",
      teamId: "1269",
      officialPlayerId: "71375",
      officialPlayerName: "Benjak Mila",
      dependencies: {
        fetch: fetchFrom(responses()),
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });

    expect(verification.officialIdentity).toMatchObject({
      playerId: "71375",
      playerName: "Benjak Mila",
    });
  });

  it("verifies a distinct official name and ID without approximating the CRM name", async () => {
    const officialGame = fixture("swiss-basketball-game-367576.xml")
      .replace('playerFirstName="Mila"', 'playerFirstName="Liban"')
      .replace('playerId="71375"', 'playerId="76411"')
      .replace('playerLastName="Benjak"', 'playerLastName="Cadbullahi Maxamed"')
      .replace('playerName="Benjak Mila"', 'playerName="Cadbullahi Maxamed Liban"');
    const verification = await verifySwissBasketballBinding({
      ...athlete,
      id: "liban-maxamed",
      name: "Liban Maxamed",
      club: "Sion Basket",
    }, {
      seasonId: "31",
      leagueId: "7",
      teamId: "1269",
      officialPlayerId: "76411",
      officialPlayerName: "Cadbullahi Maxamed Liban",
      dependencies: {
        fetch: fetchFrom(responses(officialGame)),
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });

    expect(verification.athlete.name).toBe("Liban Maxamed");
    expect(verification.officialIdentity).toMatchObject({
      playerId: "76411",
      playerName: "Cadbullahi Maxamed Liban",
    });
    expect(verification.evidence.join(" ")).toContain(
      "Cadbullahi Maxamed Liban et l’identifiant joueur 76411 figurent ensemble",
    );
  });

  it("rejects a correct official name paired with the wrong player ID", async () => {
    const wrongIdResponses = responses();
    wrongIdResponses.set(
      scheduleUrl,
      fixture("swiss-basketball-schedule.xml")
        .replace('name="BC Winterthur" result="70"', 'name="BC Winterthur"')
        .replace('name="Elfic Fribourg Génération" result="61"', 'name="Elfic Fribourg Génération"'),
    );
    await expect(verifySwissBasketballBinding(athlete, {
      seasonId: "31",
      leagueId: "7",
      teamId: "1269",
      officialPlayerId: "99999",
      officialPlayerName: "Mila Benjak",
      dependencies: {
        fetch: fetchFrom(wrongIdResponses),
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    })).rejects.toThrow("nom officiel apparaît avec un autre identifiant joueur");
  });

  it("rejects duplicate official identity rows as ambiguous", async () => {
    const game = fixture("swiss-basketball-game-367576.xml");
    const playerRow = game.match(/<PersonGameRow\b[^>]*playerId="71375"[^>]*\/>/)?.[0];
    expect(playerRow).toBeTruthy();
    const ambiguousGame = game.replace(playerRow!, `${playerRow}${playerRow}`);

    await expect(verifySwissBasketballBinding(athlete, {
      seasonId: "31",
      leagueId: "7",
      teamId: "1269",
      officialPlayerId: "71375",
      officialPlayerName: "Mila Benjak",
      dependencies: {
        fetch: fetchFrom(responses(ambiguousGame)),
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    })).rejects.toThrow("plusieurs lignes correspondent");
  });

  it("keeps score, roster presence, starter status and explicit points separate", async () => {
    const verification = await verifySwissBasketballBinding(athlete, {
      seasonId: "31",
      leagueId: "7",
      teamId: "1269",
      officialPlayerId: "71375",
      officialPlayerName: "Mila Benjak",
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
