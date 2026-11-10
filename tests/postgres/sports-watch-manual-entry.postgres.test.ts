import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { beforeAll, describe, expect, it } from "vitest";
import {
  PostgresSportsWatchRepository,
  type SportsWatchManualEntryCandidateInput,
} from "@/lib/sports-watch/repository";

const testDatabaseUrl = process.env.KLIQUE_SPORTS_WATCH_PG_TEST_URL;
const testBranchId = process.env.KLIQUE_SPORTS_WATCH_PG_TEST_BRANCH_ID;
const describePostgres = testDatabaseUrl ? describe : describe.skip;
const sql = testDatabaseUrl
  ? neon(testDatabaseUrl)
  : null as unknown as NeonQueryFunction<false, false>;
const runId = randomUUID();
const workspaceId = `sports-watch-manual-${runId}`;
const isolatedWorkspaceId = `${workspaceId}-isolated`;

const input = (
  idempotencyKey: string,
  status: "pending" | "validated",
  title: string,
): SportsWatchManualEntryCandidateInput => ({
  id: randomUUID(),
  athlete: {
    id: "athlete-fixture",
    name: "Athlète Fixture",
    sport: "Football",
    club: "FC Fixture",
  },
  sourceName: "Footstats Pro — saisie manuelle, source tierce non officielle",
  sourceUrl: "https://example.com/footstats-reference",
  articleUrl: "https://example.com/footstats-reference",
  title,
  excerpt: "Origine : saisie manuelle Admin. Statut factuel initial : non vérifié.",
  resultKind: "collective_result",
  eventDate: "2026-11-12",
  collectedAt: "2026-11-13T10:00:00.000Z",
  attributionEvidence: [
    "Athlète sélectionné explicitement par un Admin dans le registre CRM actif.",
  ],
  initialStatus: status,
  logicalKey: `manual-entry|${title.toLowerCase().replaceAll(" ", "-")}`,
  contentHash: `hash-${title.toLowerCase().replaceAll(" ", "-")}`,
  metadata: {
    mode: "manual_entry",
    newsType: "result_match",
    competition: "Championnat fixture",
    opponent: "FC Adverse",
    score: "2-1",
    source: "Footstats Pro",
    sourceReference: "https://example.com/footstats-reference",
    internalNote: "Note interne fixture",
    football: {
      team: "FC Fixture",
      participationStatus: "starter",
      minutes: 90,
      goals: 1,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      opponent: "FC Adverse",
      score: "2-1",
      competition: "Championnat fixture",
      footstatsReference: "match-fixture",
      footstatsPlayerId: "player-fixture",
      footstatsTeamId: "team-fixture",
    },
    basketball: null,
    statistics: [],
  },
  idempotencyKey,
});

describePostgres.sequential("sports watch manual entry on Neon Test", () => {
  beforeAll(async () => {
    const target = new URL(testDatabaseUrl!);
    if (
      target.protocol !== "postgresql:"
      || !target.hostname.endsWith(".neon.tech")
      || target.pathname !== "/klique_intro_app_test"
      || target.searchParams.get("sslmode") !== "require"
      || !testBranchId?.startsWith("br-")
      || testBranchId === "br-wandering-bar-b2gbmfn4"
    ) {
      throw new Error("La cible doit être explicitement une branche Neon Test hors Production.");
    }
    const rows = await sql.query(`
      SELECT current_database() AS database_name,
             to_regclass('public.sports_watch_candidates')::text AS candidates_table,
             to_regclass('public.sports_watch_candidate_events')::text AS events_table
    `) as Array<{
      database_name: string;
      candidates_table: string | null;
      events_table: string | null;
    }>;
    expect(rows[0]).toEqual({
      database_name: "klique_intro_app_test",
      candidates_table: "sports_watch_candidates",
      events_table: "sports_watch_candidate_events",
    });
    process.env.POSTGRES_DATABASE_URL = testDatabaseUrl;
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = workspaceId;
  });

  it("atomically creates pending and validated candidates with immutable audit attribution", async () => {
    const draftsBefore = await sql.query(
      "SELECT count(*)::int AS count FROM article_creation_drafts WHERE workspace_id = $1",
      [workspaceId],
    ) as Array<{ count: number }>;
    const notificationsBefore = await sql.query(
      "SELECT count(*)::int AS count FROM notifications WHERE workspace_id = $1",
      [workspaceId],
    ) as Array<{ count: number }>;
    const pendingInput = input(randomUUID(), "pending", "Actualité pending");
    const validatedInput = input(randomUUID(), "validated", "Actualité validée");

    const pending = await PostgresSportsWatchRepository.createManualEntry({
      workspaceId,
      clerkUserId: "admin-fixture",
      candidate: pendingInput,
    });
    const validated = await PostgresSportsWatchRepository.createManualEntry({
      workspaceId,
      clerkUserId: "admin-fixture",
      candidate: validatedInput,
    });

    expect(pending).toMatchObject({
      adminStatus: "pending",
      verificationStatus: "unverified",
      manualEntry: { mode: "manual_entry" },
    });
    expect(validated).toMatchObject({
      adminStatus: "validated",
      verificationStatus: "unverified",
      manualEntry: {
        football: { goals: 1, assists: 0 },
      },
    });
    const rows = await sql.query(`
      SELECT
        candidate.admin_status,
        candidate.factual_verification_status,
        candidate.created_by_clerk_user_id,
        candidate.reviewed_by_clerk_user_id,
        candidate.reviewed_at,
        event.action,
        event.actor_clerk_user_id,
        event.created_at
      FROM sports_watch_candidates candidate
      JOIN sports_watch_candidate_events event
        ON event.workspace_id = candidate.workspace_id
       AND event.candidate_id = candidate.id
      WHERE candidate.workspace_id = $1
      ORDER BY candidate.admin_status
    `, [workspaceId]) as Array<{
      admin_status: string;
      factual_verification_status: string;
      created_by_clerk_user_id: string;
      reviewed_by_clerk_user_id: string | null;
      reviewed_at: string | null;
      action: string;
      actor_clerk_user_id: string;
      created_at: string;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) =>
      row.factual_verification_status === "unverified"
      && row.created_by_clerk_user_id === "admin-fixture"
      && row.action === "manual_created"
      && row.actor_clerk_user_id === "admin-fixture"
      && Boolean(row.created_at))).toBe(true);
    expect(rows.find((row) => row.admin_status === "pending")).toMatchObject({
      reviewed_by_clerk_user_id: null,
      reviewed_at: null,
    });
    expect(rows.find((row) => row.admin_status === "validated")).toMatchObject({
      reviewed_by_clerk_user_id: "admin-fixture",
    });
    expect(rows.find((row) => row.admin_status === "validated")?.reviewed_at).toBeTruthy();

    const draftsAfter = await sql.query(
      "SELECT count(*)::int AS count FROM article_creation_drafts WHERE workspace_id = $1",
      [workspaceId],
    ) as Array<{ count: number }>;
    const notificationsAfter = await sql.query(
      "SELECT count(*)::int AS count FROM notifications WHERE workspace_id = $1",
      [workspaceId],
    ) as Array<{ count: number }>;
    expect(draftsAfter[0].count).toBe(draftsBefore[0].count);
    expect(notificationsAfter[0].count).toBe(notificationsBefore[0].count);

    const articleCandidates = await PostgresSportsWatchRepository.getArticleCandidates(
      workspaceId,
      [validated!.id],
    );
    expect(articleCandidates).toHaveLength(1);
    expect(articleCandidates[0].manualEntry?.internalNote).toBe("Note interne fixture");
    expect(articleCandidates[0].excerpt).not.toContain("Note interne fixture");
  });

  it("blocks repeated requests and exact duplicate forms without crossing workspaces", async () => {
    const idempotencyKey = randomUUID();
    const repeatedInput = input(idempotencyKey, "pending", "Actualité idempotente");
    const first = await PostgresSportsWatchRepository.createManualEntry({
      workspaceId,
      clerkUserId: "admin-fixture",
      candidate: repeatedInput,
    });
    const replay = await PostgresSportsWatchRepository.createManualEntry({
      workspaceId,
      clerkUserId: "admin-fixture",
      candidate: { ...repeatedInput, id: randomUUID() },
    });
    const exact = await PostgresSportsWatchRepository.createManualEntry({
      workspaceId,
      clerkUserId: "admin-fixture",
      candidate: {
        ...repeatedInput,
        id: randomUUID(),
        idempotencyKey: randomUUID(),
      },
    });
    const isolated = await PostgresSportsWatchRepository.createManualEntry({
      workspaceId: isolatedWorkspaceId,
      clerkUserId: "admin-isolated",
      candidate: { ...repeatedInput, id: randomUUID() },
    });

    expect(first).not.toBeNull();
    expect(replay).toBeNull();
    expect(exact).toBeNull();
    expect(isolated).not.toBeNull();
    expect(await PostgresSportsWatchRepository.getManualEntryByIdempotency(
      workspaceId,
      idempotencyKey,
    )).toMatchObject({ candidate: { id: first!.id } });
    expect(await PostgresSportsWatchRepository.getManualEntryByIdempotency(
      isolatedWorkspaceId,
      idempotencyKey,
    )).toMatchObject({ candidate: { id: isolated!.id } });

    const counts = await sql.query(`
      SELECT workspace_id, count(*)::int AS count
      FROM sports_watch_candidates
      WHERE workspace_id = ANY($1::text[])
        AND title = 'Actualité idempotente'
      GROUP BY workspace_id
      ORDER BY workspace_id
    `, [[workspaceId, isolatedWorkspaceId]]) as Array<{
      workspace_id: string;
      count: number;
    }>;
    expect(counts).toEqual([
      { workspace_id: workspaceId, count: 1 },
      { workspace_id: isolatedWorkspaceId, count: 1 },
    ].sort((left, right) => left.workspace_id.localeCompare(right.workspace_id)));
  });
});
