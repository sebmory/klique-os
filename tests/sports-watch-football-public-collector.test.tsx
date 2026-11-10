import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FootballPublicPilotPanel } from "@/components/app-shell/FootballPublicPilotPanel";
import {
  AFF_ROBOTS_BLOCK_MESSAGE,
  collectFootballPublicCandidates,
  discoverFootstatsFootballTeam,
  parseFootstatsMatches,
  parseFootstatsRoster,
  type FootballSourceMatch,
} from "@/lib/sports-watch/football-public-collector";
import { compareFootballCandidates } from "@/lib/sports-watch/football-public-repository";
import { buildSportsWatchRefreshTasks } from "@/lib/sports-watch/refresh";
import type {
  FootballCandidateEvidence,
  FootballPublicBinding,
  SportsWatchCandidate,
  SportsWatchManualEntryMetadata,
} from "@/types/sports-watch";

const athlete = {
  id: "athlete-matheus",
  name: "Matheus Monteiro",
  sport: "Football",
  club: "FC Richemond I",
};

const binding: FootballPublicBinding = {
  id: "00000000-0000-4000-8000-000000000001",
  athleteId: athlete.id,
  footstatsTeamId: "xh89ete5",
  footstatsTeamName: "FC Richemond I",
  footstatsPlayerId: "1e318qst",
  footstatsPlayerName: "Matheus Monteiro Dos Santos dos Santos",
  affTeamId: "33108",
  affPlayerId: null,
  competition: "2. Liga",
  season: "2026/27",
  status: "verified",
  roster: [],
  evidence: [],
  verifiedByClerkUserId: "admin",
  verifiedAt: "2026-10-01T00:00:00.000Z",
  version: 1,
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const matchesHtml = (score = true) => `
  <html><body>
    <div>31.10.2026</div><div>18:00</div>
    <div>FC Richemond I</div><div>FC Marly</div>
    ${score ? "<div>3</div><div>1</div>" : ""}
    <div>20.03.2027</div><div>18:00</div>
    <div>FC Marly</div><div>FC Richemond I</div>
  </body></html>
`;

const response = (body: string) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "text/html" },
  }) as Response & { url: string };

const fetchHtml = (body: string) => vi.fn(async () => {
  const result = response(body);
  Object.defineProperty(result, "url", {
    value: "https://www.footstats.ch/de/teams/xh89ete5/matches/",
  });
  return result;
});

const affMatch = (
  overrides: Partial<FootballSourceMatch> = {},
): FootballSourceMatch => ({
  source: "aff",
  sourceUrl: "https://matchcenter.aff-ffv.ch/match-public",
  date: "2026-10-31",
  competition: "2e ligue AFF",
  firstTeam: "FC Richemond I",
  secondTeam: "FC Marly",
  firstScore: 3,
  secondScore: 1,
  lineupAvailable: true,
  playerNamed: true,
  starter: null,
  substitute: null,
  entered: null,
  entryMinute: null,
  exitMinute: null,
  goals: null,
  goalMinutes: [],
  yellowCards: null,
  redCards: null,
  cardMinutes: [],
  facts: ["Feuille de match publique."],
  ...overrides,
});

const collect = (
  aff: FootballSourceMatch[] | null = null,
  fetchOverride: typeof fetch = fetchHtml(matchesHtml()) as unknown as typeof fetch,
) => collectFootballPublicCandidates(athlete, {
  binding,
  dependencies: {
    fetch: fetchOverride,
    now: () => new Date("2026-11-08T12:00:00.000Z"),
    ...(aff === null ? {} : { collectAffMatches: async () => aff }),
  },
});

const evidence = (
  overrides: Partial<FootballCandidateEvidence> = {},
): FootballCandidateEvidence => ({
  mode: "football_public",
  matchKey: "2026-10-31|fc marly|fc richemond i",
  eventDate: "2026-10-31",
  publicReference: "https://www.footstats.ch/de/teams/xh89ete5/matches/",
  competition: "2e ligue AFF",
  team: "FC Richemond I",
  opponent: "FC Marly",
  score: "3–1",
  footstatsTeamId: "xh89ete5",
  footstatsPlayerId: "1e318qst",
  affTeamId: "33108",
  affPlayerId: null,
  lineupAvailable: false,
  playerNamed: false,
  starter: null,
  substitute: null,
  entered: null,
  entryMinute: null,
  exitMinute: null,
  goals: null,
  goalMinutes: [],
  yellowCards: null,
  redCards: null,
  cardMinutes: [],
  participationProved: false,
  proofs: ["team_match"],
  sourceFacts: [],
  ...overrides,
});

const manualMetadata: SportsWatchManualEntryMetadata = {
  mode: "manual_entry",
  newsType: "result_match",
  competition: "2e ligue AFF",
  opponent: "FC Marly",
  score: "3-1",
  source: "Source Admin",
  sourceReference: null,
  internalNote: null,
  football: {
    team: "FC Richemond I",
    participationStatus: "unknown",
    minutes: null,
    goals: null,
    assists: null,
    yellowCards: null,
    redCards: null,
    opponent: "FC Marly",
    score: "3-1",
    competition: "2e ligue AFF",
    footstatsReference: null,
    footstatsPlayerId: null,
    footstatsTeamId: null,
  },
  basketball: null,
  statistics: [],
};

const candidate = (
  id: string,
  options: {
    manual?: SportsWatchManualEntryMetadata;
    football?: FootballCandidateEvidence;
  },
): SportsWatchCandidate => ({
  id,
  athleteId: athlete.id,
  athleteName: athlete.name,
  sourceName: options.manual ? "Saisie Admin manuelle" : "Footstats",
  sourceUrl: "https://example.com",
  articleUrl: "https://example.com/match",
  title: "Match",
  excerpt: "Faits",
  resultKind: "collective_result",
  publicationDate: null,
  eventDateFrom: "2026-10-31",
  eventDateTo: "2026-10-31",
  collectedAt: "2026-11-08T12:00:00.000Z",
  attributionStatus: "matched",
  attributionEvidence: [],
  verificationStatus: "unverified",
  adminStatus: "pending",
  supersedesCandidateId: null,
  version: 1,
  manualEntry: options.manual ?? null,
  footballEvidence: options.football ?? null,
});

describe("public football pilot", () => {
  it("parses the public Footstats roster without confirming identity by name", () => {
    const roster = parseFootstatsRoster(`
      <a href="/de/players/1e318qst/">
        <span>9</span><span>Matheus Monteiro Dos Santos</span><span>Linker Flügel</span>
      </a>
    `);
    expect(roster).toEqual([expect.objectContaining({
      id: "1e318qst",
      name: "Matheus Monteiro Dos Santos",
      shirtNumber: "9",
    })]);
  });

  it("discovers FC Richemond and its public roster", async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const body = url.endsWith("/players/")
        ? `<meta property="og:title" content="FC Richemond I - Kader 2026/27">
           <a href="/de/players/1e318qst/"><span>9</span>
           <span>Matheus Monteiro Dos Santos</span><span>Linker Flügel</span></a>`
        : `<meta property="og:title" content="FC Richemond I - Footstats">
           <div>2. Liga</div><div>FC Richemond I</div>`;
      const result = response(body);
      Object.defineProperty(result, "url", { value: url });
      return result;
    });
    const discovery = await discoverFootstatsFootballTeam("xh89ete5", {
      fetch: mockFetch as typeof fetch,
      now: () => new Date("2026-11-08T12:00:00.000Z"),
    });
    expect(discovery).toMatchObject({
      teamName: "FC Richemond I",
      competition: "2. Liga",
      season: "2026/27",
    });
    expect(discovery.players[0].id).toBe("1e318qst");
  });

  it("uses the team league link instead of an unrelated competition mention", async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const body = url.endsWith("/players/")
        ? `<meta property="og:title" content="FC Breitenrain - Kader 2026/27">
           <a href="/de/players/1s5eh85j/"><span>14</span>
           <span>Wenzi Aggee Wenzi</span><span>Zentrales Mittelfeld</span></a>`
        : `<meta property="og:title" content="FC Breitenrain - Footstats">
           <div>2. Liga interregional</div>
           <a href="/de/leagues/pl-hoval-promotion-league/">
             <span>Hoval Promotion League</span>
           </a>`;
      const result = response(body);
      Object.defineProperty(result, "url", { value: url });
      return result;
    });

    const discovery = await discoverFootstatsFootballTeam("wjsj6p08", {
      fetch: mockFetch as typeof fetch,
      now: () => new Date("2026-11-10T12:00:00.000Z"),
    });

    expect(discovery).toMatchObject({
      teamName: "FC Breitenrain",
      competition: "Hoval Promotion League",
      season: "2026/27",
    });
  });

  it("parses completed matches and keeps future scores absent", () => {
    const matches = parseFootstatsMatches(matchesHtml(), "https://www.footstats.ch/matches");
    expect(matches[0]).toMatchObject({
      date: "2026-10-31",
      firstScore: 3,
      secondScore: 1,
      playerNamed: false,
    });
    expect(matches[1].firstScore).toBeNull();
  });

  it("creates only a collective pending candidate when no sheet exists", async () => {
    const result = await collect();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      title: "Match détecté — participation de Matheus Monteiro à confirmer",
      resultKind: "collective_result",
    });
    expect(result.candidates[0].footballEvidence.participationProved).toBe(false);
    expect(result.report.partialCoverage).toBe(true);
    expect(result.report.errors).toContain(AFF_ROBOTS_BLOCK_MESSAGE);
  });

  it("keeps a lineup without Matheus as unknown participation", async () => {
    const result = await collect([affMatch({ playerNamed: false })]);
    expect(result.candidates[0].footballEvidence).toMatchObject({
      lineupAvailable: true,
      playerNamed: false,
      participationProved: false,
    });
  });

  it("keeps a named substitute without entry as unproved participation", async () => {
    const result = await collect([affMatch({ substitute: true, entered: false })]);
    expect(result.candidates[0]).toMatchObject({
      title: "Matheus Monteiro sur la feuille face à FC Marly",
      resultKind: "collective_result",
    });
    expect(result.candidates[0].footballEvidence.entered).toBe(false);
  });

  it("proves participation from an explicit starter status", async () => {
    const result = await collect([affMatch({ starter: true, substitute: false })]);
    expect(result.candidates[0]).toMatchObject({
      title: "Matheus Monteiro titulaire face à FC Marly",
      resultKind: "participation",
    });
  });

  it("proves participation from an explicit entry", async () => {
    const result = await collect([affMatch({
      substitute: true,
      entered: true,
      entryMinute: 63,
    })]);
    expect(result.candidates[0].footballEvidence).toMatchObject({
      entered: true,
      entryMinute: 63,
      participationProved: true,
    });
  });

  it("keeps an explicit goal and its minute", async () => {
    const result = await collect([affMatch({ goals: 1, goalMinutes: [72] })]);
    expect(result.candidates[0].title).toBe("Matheus Monteiro buteur avec FC Richemond I");
    expect(result.candidates[0].footballEvidence.goalMinutes).toEqual([72]);
  });

  it("keeps an explicit card and does not invent minutes", async () => {
    const result = await collect([affMatch({ yellowCards: 1, cardMinutes: [54] })]);
    expect(result.candidates[0].footballEvidence).toMatchObject({
      yellowCards: 1,
      entryMinute: null,
      exitMinute: null,
      participationProved: true,
    });
  });

  it("keeps every absent individual statistic null", async () => {
    const result = await collect([affMatch()]);
    expect(result.candidates[0].footballEvidence).toMatchObject({
      starter: null,
      entered: null,
      goals: null,
      yellowCards: null,
      redCards: null,
    });
  });

  it("continues with AFF facts when Footstats is unavailable", async () => {
    const failedFetch = vi.fn(async () => new Response("", { status: 503 }));
    const result = await collect([affMatch()], failedFetch as typeof fetch);
    expect(result.candidates).toHaveLength(1);
    expect(result.report.sourcesQueried[0].status).toBe("failed");
    expect(result.report.sourcesQueried[1].status).toBe("available");
  });

  it("continues with Footstats when AFF is unavailable", async () => {
    const result = await collect(null);
    expect(result.candidates).toHaveLength(1);
    expect(result.report.sourcesQueried[1].status).toBe("unavailable");
  });

  it("fails explicitly when both sources are unavailable", async () => {
    const failedFetch = vi.fn(async () => new Response("", { status: 503 }));
    await expect(collect([], failedFetch as typeof fetch)).rejects.toThrow(
      "aucune source n’est disponible",
    );
  });

  it("rejects an oversized public calendar", () => {
    const rows = Array.from({ length: 81 }, (_, index) =>
      `<div>${String((index % 28) + 1).padStart(2, "0")}.10.2026</div>
       <div>18:00</div><div>FC Richemond I</div><div>Club ${index}</div>
       <div>1</div><div>0</div>`).join("");
    expect(() => parseFootstatsMatches(rows, "https://www.footstats.ch/matches"))
      .toThrow("volume autorisé");
  });

  it("produces stable technical keys and hashes on repetition", async () => {
    const first = await collect();
    const second = await collect();
    expect(second.candidates[0].logicalKey).toBe(first.candidates[0].logicalKey);
    expect(second.candidates[0].contentHash).toBe(first.candidates[0].contentHash);
  });

  it("ignores draft and ambiguous bindings in the scheduler", () => {
    const base = {
      athletes: [{
        key: athlete.id,
        athleteId: athlete.id,
        name: athlete.name,
        sport: athlete.sport,
        club: athlete.club,
        status: "Actif",
      }],
      swissBindings: [],
      iwwfBindings: [],
      safvBindings: [],
      beBasketBindings: [],
      swissBasketballBindings: [],
    };
    expect(buildSportsWatchRefreshTasks({
      ...base,
      footballBindings: [{ athleteId: athlete.id, status: "draft" }],
    })).toEqual([]);
    expect(buildSportsWatchRefreshTasks({
      ...base,
      footballBindings: [{ athleteId: athlete.id, status: "ambiguous" }],
    })).toEqual([]);
  });

  it("schedules only a verified football binding", () => {
    const tasks = buildSportsWatchRefreshTasks({
      athletes: [{
        key: athlete.id,
        athleteId: athlete.id,
        name: athlete.name,
        sport: athlete.sport,
        club: athlete.club,
        status: "Actif",
      }],
      swissBindings: [],
      iwwfBindings: [],
      safvBindings: [],
      beBasketBindings: [],
      swissBasketballBindings: [],
      footballBindings: [{ athleteId: athlete.id, status: "verified" }],
    });
    expect(tasks).toEqual([{
      sourceKey: "football-public",
      athleteId: athlete.id,
      athleteName: athlete.name,
    }]);
  });

  it("detects a probable manual/automatic match without merging it", () => {
    const comparison = compareFootballCandidates(
      candidate("00000000-0000-4000-8000-000000000010", { manual: manualMetadata }),
      candidate("00000000-0000-4000-8000-000000000011", { football: evidence() }),
    );
    expect(comparison?.identical).toContain("Adversaire identique");
    expect(comparison?.identical).toContain("Score identique");
    expect(comparison?.contradictions).toEqual([]);
  });

  it("surfaces contradictions and never resolves them automatically", () => {
    const comparison = compareFootballCandidates(
      candidate("00000000-0000-4000-8000-000000000010", { manual: manualMetadata }),
      candidate("00000000-0000-4000-8000-000000000011", {
        football: evidence({ score: "1–3", starter: true, participationProved: true }),
      }),
    );
    expect(comparison?.contradictions).toContain("Score différent");
    expect(comparison?.complementary).toContain("Participation renseignée dans une seule source");
  });

  it("does not compare different dates or athletes", () => {
    const automatic = candidate("00000000-0000-4000-8000-000000000011", {
      football: evidence(),
    });
    automatic.eventDateFrom = "2026-11-01";
    expect(compareFootballCandidates(
      candidate("00000000-0000-4000-8000-000000000010", { manual: manualMetadata }),
      automatic,
    )).toBeNull();
  });

  it("renders a responsive 390px-safe Admin pilot without another athlete", () => {
    const markup = renderToStaticMarkup(<FootballPublicPilotPanel athletes={[
      {
        key: athlete.id,
        athleteId: athlete.id,
        name: athlete.name,
        sport: athlete.sport,
        club: athlete.club,
        status: "Actif",
      },
      {
        key: "other",
        athleteId: "other",
        name: "Autre athlète",
        sport: "Football",
        club: "Autre club",
        status: "Actif",
      },
    ]} />);
    expect(markup).toContain("Pilote football public — Matheus Monteiro");
    expect(markup).toContain("min(100%, 16rem)");
    expect(markup).not.toContain("Autre athlète");
  });
});
