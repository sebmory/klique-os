import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCreativeMissionRegularization } from "@/lib/creative-mission-regularization";

const databaseUrl = process.env.KLIQUE_CANONICAL_MISSIONS_PG_TEST_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const sql = databaseUrl
  ? neon(databaseUrl)
  : null as unknown as NeonQueryFunction<false, false>;
const runId = randomUUID();
const workspaceId = `canonical-mission-test-${runId}`;
const otherWorkspaceId = `canonical-mission-other-${runId}`;
const adminId = `admin-${runId}`;
const creativeId = randomUUID();

const cleanup = async () => {
  const fixtureWhere =
    "workspace_id LIKE 'canonical-mission-test-%' OR workspace_id LIKE 'canonical-mission-other-%'";
  await sql.transaction([
    sql.query("ALTER TABLE creative_mission_links DISABLE TRIGGER USER"),
    sql.query("ALTER TABLE creative_mission_events DISABLE TRIGGER USER"),
    sql.query("ALTER TABLE athlete_session_requests DISABLE TRIGGER USER"),
    sql.query("ALTER TABLE production_creative_briefs DISABLE TRIGGER USER"),
    sql.query("ALTER TABLE production_creative_assignments DISABLE TRIGGER USER"),
    sql.query(`DELETE FROM creative_mission_events WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_mission_links WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_mission_athletes WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_missions WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_events WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_assignments WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_applications WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_recipients WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_condition_versions WHERE ${fixtureWhere}`),
    sql.query(`UPDATE athlete_session_requests SET production_brief_id = NULL WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_briefs WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM athlete_session_request_events WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM athlete_session_request_periods WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM athlete_session_requests WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_availability_exceptions WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_availability_rules WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_access WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_profiles WHERE ${fixtureWhere}`),
    sql.query("ALTER TABLE production_creative_assignments ENABLE TRIGGER USER"),
    sql.query("ALTER TABLE production_creative_briefs ENABLE TRIGGER USER"),
    sql.query("ALTER TABLE athlete_session_requests ENABLE TRIGGER USER"),
    sql.query("ALTER TABLE creative_mission_events ENABLE TRIGGER USER"),
    sql.query("ALTER TABLE creative_mission_links ENABLE TRIGGER USER"),
  ]);
};

const productionSnapshot = async () => {
  const rows = await sql.query(`
    SELECT
      md5(COALESCE(jsonb_agg(to_jsonb(request) ORDER BY request.id)::text, '[]')) AS request_hash,
      (SELECT count(*)::int FROM production_creative_briefs) AS briefs,
      (SELECT count(*)::int FROM production_creative_applications) AS applications,
      (SELECT count(*)::int FROM production_creative_assignments) AS assignments,
      (SELECT count(*)::int FROM creative_mission_executions) AS legacy_executions
    FROM athlete_service_requests request
  `) as Array<{
    request_hash: string;
    briefs: number;
    applications: number;
    assignments: number;
    legacy_executions: number;
  }>;
  return rows[0];
};

describePostgres.sequential("canonical creative missions on fresh Neon Test", () => {
  let productionWorkspaceId = "";

  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    if (
      target.protocol !== "postgresql:"
      || !target.hostname.endsWith(".neon.tech")
      || target.pathname !== "/neondb"
      || target.searchParams.get("sslmode") !== "require"
    ) {
      throw new Error("La cible doit être une branche Neon Test fraîche.");
    }
    const schema = await sql.query(`
      SELECT current_database() AS database_name,
             to_regclass('public.creative_missions')::text AS missions,
             to_regclass('public.creative_mission_links')::text AS links,
             to_regclass('public.creative_mission_events')::text AS events
    `) as Array<Record<string, string | null>>;
    expect(schema[0]).toEqual({
      database_name: "neondb",
      missions: "creative_missions",
      links: "creative_mission_links",
      events: "creative_mission_events",
    });

    const scopes = await sql.query(`
      SELECT workspace_id, count(*)::int AS count
      FROM athlete_service_requests
      GROUP BY workspace_id
    `) as Array<{ workspace_id: string; count: number }>;
    expect(scopes).toHaveLength(1);
    expect(scopes[0].count).toBe(14);
    productionWorkspaceId = scopes[0].workspace_id;

    process.env.POSTGRES_DATABASE_URL = databaseUrl;
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = productionWorkspaceId;
    await cleanup();
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await cleanup();
  });

  it("regularizes exactly five completed missions, twelve services and two closed tests idempotently", async () => {
    const before = await productionSnapshot();
    const first = await runCreativeMissionRegularization({
      workspaceId: productionWorkspaceId,
    });
    const second = await runCreativeMissionRegularization({
      workspaceId: productionWorkspaceId,
    });
    const after = await productionSnapshot();

    expect(first).toEqual({
      canonicalRecords: 7,
      completedMissions: 5,
      closedEntries: 2,
      serviceLinks: 14,
      productionLinks: 2,
      athleteLinks: 9,
      events: 7,
    });
    expect(second).toEqual(first);
    expect(after).toEqual(before);

    const groups = await sql.query(`
      SELECT mission.regularization_key,
             mission.record_kind,
             mission.business_state,
             mission.historical_creative_name,
             mission.historical_creative_profile_id IS NOT NULL AS has_profile_reference,
             count(DISTINCT athlete.athlete_id)::int AS athletes,
             count(DISTINCT link.athlete_service_request_id)::int AS services
      FROM creative_missions mission
      LEFT JOIN creative_mission_athletes athlete
        ON athlete.workspace_id = mission.workspace_id
       AND athlete.mission_id = mission.id
      LEFT JOIN creative_mission_links link
        ON link.workspace_id = mission.workspace_id
       AND link.mission_id = mission.id
       AND link.source_type = 'athlete_service_request'
      WHERE mission.workspace_id = $1
        AND mission.regularization_status <> 'none'
      GROUP BY mission.id
      ORDER BY mission.regularization_key
    `, [productionWorkspaceId]) as Array<{
      regularization_key: string;
      record_kind: string;
      business_state: string;
      historical_creative_name: string | null;
      has_profile_reference: boolean;
      athletes: number;
      services: number;
    }>;

    expect(groups.filter((group) => group.record_kind === "mission")).toHaveLength(5);
    expect(groups.filter((group) => group.record_kind === "historical_entry")).toHaveLength(2);
    expect(groups.find((group) => group.regularization_key.includes(
      "armand-angha:raphael-monty",
    ))).toMatchObject({
      athletes: 2,
      services: 4,
      historical_creative_name: "Sébastien Mory",
      has_profile_reference: true,
    });
    expect(groups.find((group) => group.regularization_key.includes(
      "chiona-kapinga:veronika-bernardini",
    ))).toMatchObject({
      athletes: 2,
      services: 4,
      historical_creative_name: "Sébastien Mory",
      has_profile_reference: true,
    });
    expect(groups.find((group) => group.regularization_key.includes(
      "abdou-bobodi-camara",
    ))).toMatchObject({
      athletes: 1,
      services: 1,
      historical_creative_name: "Alan Jeanbourquin",
      has_profile_reference: true,
    });
  });

  it("keeps links and the canonical journal immutable", async () => {
    await expect(sql.query(`
      UPDATE creative_mission_events
      SET note = 'mutation interdite'
      WHERE workspace_id = $1
    `, [productionWorkspaceId])).rejects.toThrow("creative_mission_events is immutable");
    await expect(sql.query(`
      DELETE FROM creative_mission_links
      WHERE workspace_id = $1
    `, [productionWorkspaceId])).rejects.toThrow("creative_mission_links is immutable");
  });

  it("projects modern session and Production states without turning availability into a mission", async () => {
    await sql.query(`
      INSERT INTO creative_profiles (
        id, workspace_id, provenance, display_name, creative_type, contact_email,
        coverage_areas, specialties, status, approved_by_clerk_user_id, approved_at
      ) VALUES (
        $1::uuid, $2, 'admin_manual', 'Créatif projection', 'both',
        $3, ARRAY['Vaud'], ARRAY['Basketball'], 'active', $4, NOW()
      )
    `, [creativeId, workspaceId, `${creativeId}@example.test`, adminId]);

    await sql.query(`
      INSERT INTO creative_availability_rules (
        workspace_id, creative_profile_id, availability_date,
        all_day, recurrence, regions, mission_types,
        created_by_clerk_user_id, updated_by_clerk_user_id
      ) VALUES (
        $1, $2::uuid, '2026-12-12', TRUE, 'none',
        ARRAY['Vaud'], ARRAY['match_competition'], $3, $3
      )
    `, [workspaceId, creativeId, adminId]);
    const afterAvailability = await sql.query(`
      SELECT count(*)::int AS count
      FROM creative_missions
      WHERE workspace_id = $1
    `, [workspaceId]) as Array<{ count: number }>;
    expect(afterAvailability[0].count).toBe(0);

    const requestId = randomUUID();
    const briefId = randomUUID();
    await sql.query(`
      INSERT INTO athlete_session_requests (
        id, workspace_id, athlete_id, athlete_clerk_user_id,
        submission_idempotency_key, request_type, workflow_status,
        sport, event_type, event_starts_at, event_ends_at,
        region, location_name, objective, deliverables, commercial_mode
      ) VALUES (
        $1::uuid, $2, 'athlete-projection', $3, $4::uuid,
        'match_competition', 'submitted', 'Basketball', 'Match',
        '2026-12-12T14:00:00.000Z', '2026-12-12T16:00:00.000Z',
        'Vaud', 'Lausanne', 'Couverture match', '20 photos', 'admin_decision'
      )
    `, [requestId, workspaceId, `athlete-${runId}`, randomUUID()]);

    await sql.query(`
      UPDATE athlete_session_requests
      SET workflow_status = 'accepted', updated_at = NOW()
      WHERE workspace_id = $1 AND id = $2::uuid
    `, [workspaceId, requestId]);

    await sql.query(`
      INSERT INTO production_creative_briefs (
        id, workspace_id, production_source, production_source_fingerprint,
        production_snapshot, origin_type, origin_request_id,
        title, creative_type, athlete_refs, scheduled_date, date_to_agree,
        region, objective, deliverables, compensation_type,
        expenses_covered, expense_terms, credits_and_usage,
        status, created_by_clerk_user_id
      ) VALUES (
        $1::uuid, $2, 'athlete_session_request', $3, '{}'::jsonb,
        'athlete_session_request', $4::uuid,
        'Match projection', 'photo',
        jsonb_build_array(jsonb_build_object('id', 'athlete-projection', 'name', 'Athlète Projection')),
        '2026-12-12', FALSE, 'Vaud', 'Couverture match', '20 photos',
        'unpaid_collaboration', FALSE, 'Aucun frais.', 'Crédit KLIQUE.',
        'published', $5
      )
    `, [briefId, workspaceId, "f".repeat(64), requestId, adminId]);

    await sql.query(`
      UPDATE athlete_session_requests
      SET workflow_status = 'proposed_to_creatives',
          production_brief_id = $3::uuid,
          updated_at = NOW()
      WHERE workspace_id = $1 AND id = $2::uuid
    `, [workspaceId, requestId, briefId]);

    await sql.query(`
      INSERT INTO production_creative_condition_versions (
        workspace_id, brief_id, version, conditions_snapshot, created_by_clerk_user_id
      ) VALUES ($1, $2::uuid, 1, '{}'::jsonb, $3)
    `, [workspaceId, briefId, adminId]);
    const assignmentId = randomUUID();
    await sql.query(`
      INSERT INTO production_creative_assignments (
        id, workspace_id, brief_id, creative_profile_id, conditions_version,
        conditions_snapshot, status, confirmation_status, confirmed_at
      ) VALUES (
        $1::uuid, $2, $3::uuid, $4::uuid, 1, '{}'::jsonb,
        'active', 'confirmed', NOW()
      )
    `, [assignmentId, workspaceId, briefId, creativeId]);

    const confirmed = await sql.query(`
      SELECT business_state, operational_creative_profile_id,
             (SELECT count(*)::int FROM creative_missions WHERE workspace_id = $1) AS mission_count
      FROM creative_missions
      WHERE workspace_id = $1
    `, [workspaceId]) as Array<{
      business_state: string;
      operational_creative_profile_id: string;
      mission_count: number;
    }>;
    expect(confirmed[0]).toMatchObject({
      business_state: "confirmed",
      operational_creative_profile_id: creativeId,
      mission_count: 1,
    });

    await sql.query(`
      UPDATE production_creative_assignments
      SET delivery_status = 'delivered',
          delivery_links = '["https://example.test/delivery"]'::jsonb,
          delivered_at = NOW(),
          updated_at = NOW()
      WHERE workspace_id = $1 AND id = $2::uuid
    `, [workspaceId, assignmentId]);
    await sql.query(`
      UPDATE production_creative_assignments
      SET delivery_status = 'validated', validated_at = NOW(), updated_at = NOW()
      WHERE workspace_id = $1 AND id = $2::uuid
    `, [workspaceId, assignmentId]);

    const completed = await sql.query(`
      SELECT business_state, occurred_at_source
      FROM creative_missions
      WHERE workspace_id = $1
    `, [workspaceId]) as Array<{
      business_state: string;
      occurred_at_source: string;
    }>;
    expect(completed[0]).toEqual({
      business_state: "completed",
      occurred_at_source: "production_delivery_validated_at",
    });

    await sql.query(`
      INSERT INTO athlete_session_requests (
        id, workspace_id, athlete_id, athlete_clerk_user_id,
        submission_idempotency_key, request_type, workflow_status,
        sport, event_type, event_starts_at, event_ends_at,
        region, objective, deliverables, commercial_mode
      ) VALUES (
        $1::uuid, $2, 'other-athlete', $3, $4::uuid,
        'match_competition', 'submitted', 'Basketball', 'Match',
        '2026-12-13T14:00:00.000Z', '2026-12-13T16:00:00.000Z',
        'Genève', 'Autre workspace', '10 photos', 'admin_decision'
      )
    `, [randomUUID(), otherWorkspaceId, `other-${runId}`, randomUUID()]);

    const isolation = await sql.query(`
      SELECT workspace_id, count(*)::int AS count
      FROM creative_missions
      WHERE workspace_id IN ($1, $2)
      GROUP BY workspace_id
      ORDER BY workspace_id
    `, [workspaceId, otherWorkspaceId]) as Array<{ workspace_id: string; count: number }>;
    expect(isolation).toEqual([
      { workspace_id: otherWorkspaceId, count: 1 },
      { workspace_id: workspaceId, count: 1 },
    ].sort((left, right) => left.workspace_id.localeCompare(right.workspace_id)));
  });
});
