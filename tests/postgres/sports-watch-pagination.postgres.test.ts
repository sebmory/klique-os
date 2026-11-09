import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresSportsWatchRepository } from "@/lib/sports-watch/repository";

const testDatabaseUrl = process.env.KLIQUE_SPORTS_WATCH_PG_TEST_URL;
const testBranchId = process.env.KLIQUE_SPORTS_WATCH_PG_TEST_BRANCH_ID;
const describePostgres = testDatabaseUrl ? describe : describe.skip;
const sql = testDatabaseUrl
  ? neon(testDatabaseUrl)
  : null as unknown as NeonQueryFunction<false, false>;
const runId = randomUUID();
const workspaceId = `sports-watch-pagination-${runId}`;
const isolatedWorkspaceId = `${workspaceId}-isolated`;

describePostgres.sequential("sports watch pagination on Neon Test", () => {
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
      throw new Error("La cible doit être explicitement une branche Neon Test hors Production.");
    }
    const rows = await sql.query(`
      SELECT current_database() AS database_name,
             to_regclass('public.sports_watch_candidates')::text AS candidates_table
    `) as Array<{ database_name: string; candidates_table: string | null }>;
    expect(rows[0]).toEqual({
      database_name: "neondb",
      candidates_table: "sports_watch_candidates",
    });
    process.env.POSTGRES_DATABASE_URL = testDatabaseUrl;
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = workspaceId;

    await sql.query(`
      INSERT INTO sports_watch_candidates (
        id, workspace_id, source_key, athlete_id, athlete_name_snapshot,
        athlete_sport_snapshot, athlete_club_snapshot, source_name, source_url,
        article_url, title, excerpt, result_kind, publication_date,
        event_date_from, event_date_to, collected_at, attribution_status,
        attribution_evidence_json, factual_verification_status, admin_status,
        reviewed_by_clerk_user_id, reviewed_at,
        dismissed_by_clerk_user_id, dismissed_at, logical_key, content_hash
      )
      SELECT
        gen_random_uuid(),
        $1,
        'bc-bulle',
        'athlete-' || (value % 4)::text,
        'Athlète ' || (value % 4)::text,
        'Badminton',
        'Club fixture',
        'Source fixture',
        'https://example.com/feed',
        'https://example.com/result/' || value::text,
        'Résultat ' || value::text,
        'Résultat de pagination ' || value::text,
        'individual_result',
        TIMESTAMPTZ '2026-10-01T10:00:00Z' + value * INTERVAL '1 minute',
        DATE '2026-10-01',
        DATE '2026-10-01',
        TIMESTAMPTZ '2026-10-01T10:00:00Z' + value * INTERVAL '1 minute',
        'matched',
        '[]'::jsonb,
        'unverified',
        CASE
          WHEN value <= 54 THEN 'pending'
          WHEN value <= 60 THEN 'validated'
          WHEN value = 61 THEN 'exploited'
          ELSE 'dismissed'
        END,
        CASE WHEN value <= 54 THEN NULL ELSE 'fixture-admin' END,
        CASE WHEN value <= 54 THEN NULL ELSE NOW() END,
        CASE WHEN value = 62 THEN 'fixture-admin' ELSE NULL END,
        CASE WHEN value = 62 THEN NOW() ELSE NULL END,
        'logical-' || value::text,
        'content-' || value::text
      FROM generate_series(1, 62) AS fixture(value)
    `, [workspaceId]);
    await sql.query(`
      INSERT INTO sports_watch_candidates (
        id, workspace_id, source_key, athlete_id, athlete_name_snapshot,
        athlete_sport_snapshot, athlete_club_snapshot, source_name, source_url,
        article_url, title, excerpt, result_kind, collected_at,
        attribution_status, attribution_evidence_json, logical_key, content_hash
      ) VALUES (
        gen_random_uuid(), $1, 'bc-bulle', 'isolated-athlete', 'Athlète isolé',
        'Badminton', 'Club fixture', 'Source fixture', 'https://example.com/feed',
        'https://example.com/isolated', 'Résultat isolé', 'Fixture isolée',
        'individual_result', NOW(), 'matched', '[]'::jsonb, 'isolated', 'isolated'
      )
    `, [isolatedWorkspaceId]);
  });

  afterAll(async () => {
    if (!testDatabaseUrl) return;
    await sql.query(
      "DELETE FROM sports_watch_candidates WHERE workspace_id = ANY($1::text[])",
      [[workspaceId, isolatedWorkspaceId]],
    );
  });

  it("keeps every validated candidate accessible beside more than 50 pending candidates", async () => {
    const totals = await PostgresSportsWatchRepository.countCandidates(workspaceId);
    expect(totals).toEqual({
      pending: 54,
      validated: 6,
      exploited: 1,
      rejected: 0,
      dismissed: 1,
      superseded: 0,
      supersededPending: 0,
      supersededValidated: 0,
    });

    const validated = await PostgresSportsWatchRepository.listCandidatePage(workspaceId, {
      group: "validated",
      cursor: null,
      limit: 20,
    });
    expect(validated.items).toHaveLength(6);
    expect(validated.items.every((candidate) => candidate.adminStatus === "validated")).toBe(true);

    const seen = new Set<string>();
    let cursor: { collectedAt: string; id: string } | null = null;
    do {
      const page = await PostgresSportsWatchRepository.listCandidatePage(workspaceId, {
        group: "pending",
        cursor,
        limit: 20,
      });
      for (const candidate of page.items) {
        expect(seen.has(candidate.id)).toBe(false);
        seen.add(candidate.id);
      }
      cursor = page.nextCursor
        ? JSON.parse(Buffer.from(page.nextCursor, "base64url").toString("utf8"))
        : null;
    } while (cursor);
    expect(seen.size).toBe(54);

    const history = await PostgresSportsWatchRepository.listCandidatePage(workspaceId, {
      group: "history",
      cursor: null,
      limit: 20,
    });
    expect(history.items.map((candidate) => candidate.adminStatus).sort())
      .toEqual(["dismissed", "exploited"]);
    expect(await PostgresSportsWatchRepository.countCandidates(isolatedWorkspaceId))
      .toMatchObject({ pending: 1, validated: 0, dismissed: 0 });
  });

  it("returns exact global athlete counts independently from page limits", async () => {
    const totals = await PostgresSportsWatchRepository.countCandidatesByAthlete(workspaceId);
    expect(totals.reduce((sum, total) => sum + total.pending, 0)).toBe(54);
    expect(totals.reduce((sum, total) => sum + total.validated, 0)).toBe(6);
  });
});
