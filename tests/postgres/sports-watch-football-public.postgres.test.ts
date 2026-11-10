import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { beforeAll, describe, expect, it } from "vitest";
import type { CollectedSportsWatchCandidate } from "@/lib/sports-watch/bcbulle-collector";
import { FootballPublicRepository } from "@/lib/sports-watch/football-public-repository";
import {
  PostgresSportsWatchRepository,
  type SportsWatchManualEntryCandidateInput,
} from "@/lib/sports-watch/repository";
import type {
  FootballCandidateEvidence,
  FootballPublicTeamDiscovery,
} from "@/types/sports-watch";

const testDatabaseUrl = process.env.KLIQUE_SPORTS_WATCH_PG_TEST_URL;
const testBranchId = process.env.KLIQUE_SPORTS_WATCH_PG_TEST_BRANCH_ID;
const describePostgres = testDatabaseUrl ? describe : describe.skip;
const sql = testDatabaseUrl
  ? neon(testDatabaseUrl)
  : null as unknown as NeonQueryFunction<false, false>;
const runId = randomUUID();
const workspaceId = `sports-watch-football-${runId}`;
const isolatedWorkspaceId = `${workspaceId}-isolated`;
const athleteId = `matheus-fixture-${runId}`;

const discovery: FootballPublicTeamDiscovery = {
  footstatsTeamId: "xh89ete5",
  teamName: "FC Richemond I",
  competition: "2e ligue AFF",
  season: "2026/27",
  teamUrl: "https://www.footstats.ch/de/teams/xh89ete5/",
  rosterUrl: "https://www.footstats.ch/de/teams/xh89ete5/players/",
  matchesUrl: "https://www.footstats.ch/de/teams/xh89ete5/matches/",
  players: [{
    id: "1e318qst",
    name: "Matheus Fixture",
    shirtNumber: "9",
    position: "Ailier",
    profileUrl: "https://www.footstats.ch/de/players/1e318qst/",
  }],
  discoveredAt: "2026-11-14T10:00:00.000Z",
  warnings: ["Fixture synthétique."],
};

const manualInput = (): SportsWatchManualEntryCandidateInput => ({
  id: randomUUID(),
  athlete: {
    id: athleteId,
    name: "Matheus Fixture",
    sport: "Football",
    club: "FC Richemond I",
  },
  sourceName: "Saisie Admin manuelle",
  sourceUrl: "https://example.test/manual",
  articleUrl: "https://example.test/manual",
  title: "Performance réelle synthétisée",
  excerpt: "Résultat explicitement saisi par un Admin.",
  resultKind: "collective_result",
  eventDate: "2026-11-12",
  collectedAt: "2026-11-14T10:00:00.000Z",
  attributionEvidence: ["Athlète synthétique sélectionné explicitement."],
  initialStatus: "pending",
  logicalKey: `manual-entry|${runId}`,
  contentHash: `manual-content-${runId}`,
  metadata: {
    mode: "manual_entry",
    newsType: "result_match",
    competition: "2e ligue AFF",
    opponent: "FC Adverse",
    score: "2-1",
    source: "Fixture synthétique",
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
      opponent: "FC Adverse",
      score: "2-1",
      competition: "2e ligue AFF",
      footstatsReference: null,
      footstatsPlayerId: null,
      footstatsTeamId: null,
    },
    basketball: null,
    statistics: [],
  },
  idempotencyKey: randomUUID(),
});

const footballEvidence: FootballCandidateEvidence = {
  mode: "football_public",
  matchKey: `2026-11-12|fc adverse|fc richemond i|${runId}`,
  eventDate: "2026-11-12",
  publicReference: discovery.matchesUrl,
  competition: "2e ligue AFF",
  team: "FC Richemond I",
  opponent: "FC Adverse",
  score: "2–1",
  footstatsTeamId: "xh89ete5",
  footstatsPlayerId: "1e318qst",
  affTeamId: null,
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
  sourceFacts: [{
    source: "footstats",
    sourceName: "Footstats — page publique, source tierce non officielle",
    sourceUrl: discovery.matchesUrl,
    official: false,
    facts: ["Résultat collectif synthétique."],
  }],
};

const automaticCandidate: CollectedSportsWatchCandidate = {
  sourceKey: "football-public",
  athlete: {
    id: athleteId,
    name: "Matheus Fixture",
    sport: "Football",
    club: "FC Richemond I",
  },
  sourceName: "Footstats — page publique, source tierce non officielle",
  sourceUrl: discovery.teamUrl,
  articleUrl: discovery.matchesUrl,
  title: "Match détecté — participation de Matheus Fixture à confirmer",
  excerpt: "FC Richemond I 2–1 FC Adverse. Participation non confirmée.",
  resultKind: "collective_result",
  publicationDate: null,
  eventDateFrom: "2026-11-12",
  eventDateTo: "2026-11-12",
  collectedAt: "2026-11-14T10:00:00.000Z",
  attributionStatus: "matched",
  attributionEvidence: ["Rattachement vérifié synthétique."],
  logicalKey: `football-public|${footballEvidence.matchKey}`,
  contentHash: `football-content-${runId}`,
  footballEvidence,
};

describePostgres.sequential("public football pilot on Neon Test", () => {
  beforeAll(async () => {
    const target = new URL(testDatabaseUrl!);
    if (
      target.protocol !== "postgresql:"
      || !target.hostname.endsWith(".neon.tech")
      || target.pathname !== "/neondb"
      || target.searchParams.get("sslmode") !== "require"
      || !testBranchId?.startsWith("br-")
      || testBranchId === "br-wandering-bar-b2gbmfn4"
    ) {
      throw new Error("La cible doit être une branche Neon Test fraîche hors Production.");
    }
    const rows = await sql.query(`
      SELECT current_database() AS database_name,
             to_regclass('public.sports_watch_football_bindings')::text AS bindings_table,
             to_regclass('public.sports_watch_football_source_suggestions')::text AS suggestions_table,
             (SELECT count(*)::int FROM sports_watch_candidates) AS candidate_count
    `) as Array<{
      database_name: string;
      bindings_table: string | null;
      suggestions_table: string | null;
      candidate_count: number;
    }>;
    expect(rows[0]).toEqual({
      database_name: "neondb",
      bindings_table: "sports_watch_football_bindings",
      suggestions_table: "sports_watch_football_source_suggestions",
      candidate_count: 63,
    });
    process.env.POSTGRES_DATABASE_URL = testDatabaseUrl;
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = workspaceId;
  });

  it("keeps draft and ambiguous bindings out of verified collection", async () => {
    const draft = await FootballPublicRepository.saveBinding({
      workspaceId,
      athleteId,
      discovery,
      selectedPlayerId: null,
      affTeamId: null,
      affPlayerId: null,
      status: "draft",
      evidence: ["Brouillon synthétique."],
      clerkUserId: "admin-fixture",
      expectedVersion: 0,
      now: "2026-11-14T10:00:00.000Z",
    });
    expect(draft?.status).toBe("draft");
    expect(await FootballPublicRepository.getVerifiedBinding(workspaceId, athleteId)).toBeNull();

    const ambiguous = await FootballPublicRepository.saveBinding({
      workspaceId,
      athleteId,
      discovery,
      selectedPlayerId: null,
      affTeamId: null,
      affPlayerId: null,
      status: "ambiguous",
      evidence: ["Correspondance ambiguë synthétique."],
      clerkUserId: "admin-fixture",
      expectedVersion: draft!.version,
      now: "2026-11-14T10:00:00.000Z",
    });
    expect(ambiguous?.status).toBe("ambiguous");
    expect(await FootballPublicRepository.getVerifiedBinding(workspaceId, athleteId)).toBeNull();
  });

  it("uses only an explicitly verified player binding and isolates workspaces", async () => {
    const current = (await FootballPublicRepository.listBindings(workspaceId))[0];
    const verified = await FootballPublicRepository.saveBinding({
      workspaceId,
      athleteId,
      discovery,
      selectedPlayerId: "1e318qst",
      affTeamId: "33108",
      affPlayerId: null,
      status: "verified",
      evidence: ["Identité confirmée explicitement par l’Admin fixture."],
      clerkUserId: "admin-fixture",
      expectedVersion: current.version,
      now: "2026-11-14T10:00:00.000Z",
    });
    expect(verified).toMatchObject({
      status: "verified",
      footstatsPlayerId: "1e318qst",
      verifiedByClerkUserId: "admin-fixture",
    });
    expect(await FootballPublicRepository.getVerifiedBinding(workspaceId, athleteId))
      .toMatchObject({ id: verified!.id });
    expect(await FootballPublicRepository.listBindings(isolatedWorkspaceId)).toEqual([]);
  });

  it("does not expose a second candidate when a prior manual entry matches", async () => {
    const manual = await PostgresSportsWatchRepository.createManualEntry({
      workspaceId,
      clerkUserId: "admin-fixture",
      candidate: manualInput(),
    });
    expect(manual?.manualEntry?.mode).toBe("manual_entry");

    expect(await FootballPublicRepository.saveCollectedCandidates(
      workspaceId,
      [automaticCandidate],
    )).toBe(0);
    expect(await FootballPublicRepository.saveCollectedCandidates(
      workspaceId,
      [automaticCandidate],
    )).toBe(0);

    const suggestions = await FootballPublicRepository.listSourceSuggestions(workspaceId);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      manualCandidateId: manual!.id,
      comparison: {
        contradictions: [],
      },
    });
    const visibleBefore = await PostgresSportsWatchRepository.listCandidates(workspaceId);
    expect(visibleBefore).toHaveLength(1);
    expect(visibleBefore[0].id).toBe(manual!.id);

    const attached = await FootballPublicRepository.decideSourceSuggestion({
      workspaceId,
      suggestionId: suggestions[0].id,
      decision: "attached",
      expectedVersion: suggestions[0].version,
      clerkUserId: "admin-fixture",
    });
    expect(attached).toMatchObject({
      supersedesCandidateId: manual!.id,
      title: manual!.title,
      footballEvidence: { matchKey: footballEvidence.matchKey },
      footballCompletion: { mode: "public_source_attached" },
    });
    expect(await PostgresSportsWatchRepository.getCandidate(workspaceId, manual!.id))
      .toEqual(manual);
    expect(await FootballPublicRepository.listSourceSuggestions(workspaceId)).toEqual([]);

    const events = await sql.query(`
      SELECT action
      FROM sports_watch_football_completion_events
      WHERE workspace_id = $1 AND previous_candidate_id = $2::uuid
      ORDER BY created_at
    `, [workspaceId, manual!.id]) as Array<{ action: string }>;
    expect(events.map((event) => event.action)).toEqual(["public_source_attached"]);
    await expect(sql.query(`
      UPDATE sports_watch_football_completion_events
      SET action = 'footstats_pro_completed'
      WHERE workspace_id = $1 AND previous_candidate_id = $2::uuid
    `, [workspaceId, manual!.id])).rejects.toThrow("append-only");
  });

  it("creates an immutable enriched version of a public candidate", async () => {
    expect(await FootballPublicRepository.saveCollectedCandidates(
      isolatedWorkspaceId,
      [automaticCandidate],
    )).toBe(1);
    const original = (await PostgresSportsWatchRepository.listCandidates(
      isolatedWorkspaceId,
    ))[0];
    const prepared = manualInput();
    prepared.metadata = {
      ...prepared.metadata,
      source: "Footstats Pro",
      sourceReference: footballEvidence.publicReference,
      football: {
        ...prepared.metadata.football!,
        participationStatus: "starter",
        footstatsReference: footballEvidence.publicReference,
        footstatsPlayerId: footballEvidence.footstatsPlayerId,
        footstatsTeamId: footballEvidence.footstatsTeamId,
      },
    };
    const completed = await FootballPublicRepository.completeCandidate({
      workspaceId: isolatedWorkspaceId,
      candidateId: original.id,
      expectedVersion: original.version,
      clerkUserId: "admin-fixture",
      prepared,
    });
    expect(completed).toMatchObject({
      supersedesCandidateId: original.id,
      manualEntry: { football: { participationStatus: "starter" } },
      footballCompletion: { mode: "football_pro_completion" },
      footballEvidence: { matchKey: footballEvidence.matchKey },
    });
    expect(await PostgresSportsWatchRepository.getCandidate(
      isolatedWorkspaceId,
      original.id,
    )).toEqual(original);
    expect((await PostgresSportsWatchRepository.listCandidates(isolatedWorkspaceId))
      .filter((item) => item.supersedesCandidateId === null)).toHaveLength(1);
  });
});
