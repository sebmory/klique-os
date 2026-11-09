import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createProductionCreativeBriefFromCanonicalMission,
  transitionProductionCreativeBrief,
} from "@/lib/admin-production-creative";
import { transitionAthleteSessionRequestAsAdmin } from "@/lib/athlete-session-requests";
import {
  createAdminOperationalMission,
  listOperationalCreativeCandidates,
  updateAdminOperationalMission,
  type OperationalMissionDraftInput,
} from "@/lib/operational-creative-missions";
import {
  applyToProductionCreativeMission,
  updateProductionCreativeAssignment,
} from "@/lib/production-creative-missions";

const databaseUrl = process.env.KLIQUE_OPERATIONAL_MISSIONS_PG_TEST_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const sql = databaseUrl
  ? neon(databaseUrl)
  : null as unknown as NeonQueryFunction<false, false>;
const runId = randomUUID();
const workspaceId = `operational-mission-test-${runId}`;
const otherWorkspaceId = `operational-mission-other-${runId}`;
const adminId = `admin-${runId}`;
const creativeClerkUserId = `creative-${runId}`;
const creativeId = randomUUID();

const draft = (
  idempotencyKey: string,
  title = "Media Day opérationnel",
): OperationalMissionDraftInput => ({
  idempotencyKey,
  title,
  missionType: "media_day",
  athletes: [{ id: "athlete-1", name: "Athlète 1" }],
  scheduledAt: "2026-12-12T09:00:00.000Z",
  periodEndsAt: "2026-12-12T12:00:00.000Z",
  locationName: "Stade",
  region: "Vaud",
  deliverables: "Portraits et interview",
  contextNotes: "Préparation de saison Basketball",
  usageRights: "Web et réseaux KLIQUE",
  budgetAmountMinor: null,
  expensesCovered: false,
  expenseTerms: "Frais non prévus",
  responseDeadline: "2026-12-01T17:00:00.000Z",
  searchMode: "targeted_creatives",
});

const cleanup = async () => {
  const fixtureWhere =
    "workspace_id LIKE 'operational-mission-test-%' OR workspace_id LIKE 'operational-mission-other-%'";
  await sql.transaction([
    sql.query("ALTER TABLE creative_mission_links DISABLE TRIGGER USER"),
    sql.query("ALTER TABLE creative_mission_events DISABLE TRIGGER USER"),
    sql.query("ALTER TABLE production_creative_events DISABLE TRIGGER USER"),
    sql.query("ALTER TABLE athlete_session_request_events DISABLE TRIGGER USER"),
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
    sql.query("ALTER TABLE creative_mission_events ENABLE TRIGGER USER"),
    sql.query("ALTER TABLE creative_mission_links ENABLE TRIGGER USER"),
    sql.query("ALTER TABLE production_creative_events ENABLE TRIGGER USER"),
    sql.query("ALTER TABLE athlete_session_request_events ENABLE TRIGGER USER"),
    sql.query("ALTER TABLE production_creative_assignments ENABLE TRIGGER USER"),
    sql.query("ALTER TABLE production_creative_briefs ENABLE TRIGGER USER"),
    sql.query("ALTER TABLE athlete_session_requests ENABLE TRIGGER USER"),
  ]);
};

const historicalSnapshot = async () => {
  const rows = await sql.query(`
    SELECT count(*)::int AS count,
           md5(COALESCE(jsonb_agg(to_jsonb(mission) ORDER BY mission.id)::text, '[]')) AS hash
    FROM creative_missions mission
    WHERE mission.regularization_status <> 'none'
  `) as Array<{ count: number; hash: string }>;
  return rows[0];
};

describePostgres.sequential("operational creative missions on fresh Neon Test", () => {
  let historicalBefore: { count: number; hash: string };

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
             EXISTS (
               SELECT 1
               FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = 'creative_missions'
                 AND column_name = 'admin_creation_key'
             ) AS operational_v2
    `) as Array<Record<string, string | boolean | null>>;
    expect(schema[0]).toEqual({
      database_name: "neondb",
      missions: "creative_missions",
      operational_v2: true,
    });

    process.env.POSTGRES_DATABASE_URL = databaseUrl;
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = workspaceId;
    await cleanup();
    historicalBefore = await historicalSnapshot();
    expect(historicalBefore.count).toBe(7);

    await sql.transaction([
      sql.query(`
        INSERT INTO creative_profiles (
          id, workspace_id, provenance, display_name, creative_type, contact_email,
          coverage_areas, specialties, status, approved_by_clerk_user_id, approved_at
        ) VALUES (
          $1::uuid, $2, 'admin_manual', 'Créatif opérationnel', 'both', $3,
          ARRAY['Vaud'], ARRAY['Basketball'], 'active', $4, NOW()
        )
      `, [creativeId, workspaceId, `${creativeClerkUserId}@example.test`, adminId]),
      sql.query(`
        INSERT INTO creative_access (
          workspace_id, creative_profile_id, clerk_user_id, status,
          invitation_email, invited_by_clerk_user_id, activated_at
        ) VALUES ($1, $2::uuid, $3, 'active', $4, $5, NOW())
      `, [
        workspaceId,
        creativeId,
        creativeClerkUserId,
        `${creativeClerkUserId}@example.test`,
        adminId,
      ]),
    ]);
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    const historicalAfter = await historicalSnapshot();
    if (historicalBefore) expect(historicalAfter).toEqual(historicalBefore);
    await cleanup();
  });

  it("creates one Admin mission per workspace and idempotency key", async () => {
    const key = randomUUID();
    const first = await createAdminOperationalMission({
      workspaceId,
      clerkUserId: adminId,
      input: draft(key),
    });
    const replay = await createAdminOperationalMission({
      workspaceId,
      clerkUserId: adminId,
      input: draft(key),
    });
    const otherWorkspace = await createAdminOperationalMission({
      workspaceId: otherWorkspaceId,
      clerkUserId: adminId,
      input: draft(key),
    });

    expect(first.outcome).toBe("changed");
    expect(replay).toEqual({ missionId: first.missionId, outcome: "unchanged" });
    expect(otherWorkspace.missionId).not.toBe(first.missionId);

    const rows = await sql.query(`
      SELECT workspace_id, count(*)::int AS count
      FROM creative_missions
      WHERE workspace_id IN ($1, $2)
      GROUP BY workspace_id
      ORDER BY workspace_id
    `, [workspaceId, otherWorkspaceId]) as Array<{ workspace_id: string; count: number }>;
    expect(rows).toEqual([
      { workspace_id: otherWorkspaceId, count: 1 },
      { workspace_id: workspaceId, count: 1 },
    ].sort((left, right) => left.workspace_id.localeCompare(right.workspace_id)));
  });

  it("updates a draft once and uses availability only as decision support", async () => {
    const mission = await sql.query(`
      SELECT id
      FROM creative_missions
      WHERE workspace_id = $1 AND origin_kind = 'admin'
    `, [workspaceId]) as Array<{ id: string }>;
    const updateKey = randomUUID();
    const first = await updateAdminOperationalMission({
      workspaceId,
      clerkUserId: adminId,
      missionId: mission[0].id,
      input: draft(updateKey, "Media Day mis à jour"),
    });
    const replay = await updateAdminOperationalMission({
      workspaceId,
      clerkUserId: adminId,
      missionId: mission[0].id,
      input: draft(updateKey, "Titre ignoré au rejeu"),
    });
    expect(first).toBe("changed");
    expect(replay).toBe("unchanged");

    const before = await sql.query(`
      SELECT count(*)::int AS count FROM creative_missions WHERE workspace_id = $1
    `, [workspaceId]) as Array<{ count: number }>;
    await sql.query(`
      INSERT INTO creative_availability_rules (
        workspace_id, creative_profile_id, availability_date,
        all_day, recurrence, regions, mission_types,
        created_by_clerk_user_id, updated_by_clerk_user_id
      ) VALUES (
        $1, $2::uuid, '2026-12-12', TRUE, 'none',
        ARRAY['Vaud'], ARRAY['media_day'], $3, $3
      )
    `, [workspaceId, creativeId, creativeClerkUserId]);
    const candidates = await listOperationalCreativeCandidates({
      workspaceId,
      from: "2026-12-01",
      to: "2026-12-31",
    });
    const after = await sql.query(`
      SELECT count(*)::int AS count FROM creative_missions WHERE workspace_id = $1
    `, [workspaceId]) as Array<{ count: number }>;

    expect(candidates).toHaveLength(1);
    expect(candidates[0].availability).toHaveLength(1);
    expect(after).toEqual(before);
  });

  it("delegates proposal, application, assignment and delivery to the existing engine", async () => {
    const mission = await sql.query(`
      SELECT id
      FROM creative_missions
      WHERE workspace_id = $1 AND origin_kind = 'admin'
    `, [workspaceId]) as Array<{ id: string }>;
    const prepared = await createProductionCreativeBriefFromCanonicalMission(
      { workspaceId, clerkUserId: adminId },
      { missionId: mission[0].id, recipientIds: [creativeId] },
    );
    const replay = await createProductionCreativeBriefFromCanonicalMission(
      { workspaceId, clerkUserId: adminId },
      { missionId: mission[0].id, recipientIds: [creativeId] },
    );
    expect(prepared.outcome).toBe("changed");
    expect(replay).toMatchObject({ outcome: "unchanged", briefId: prepared.briefId });

    expect(await transitionProductionCreativeBrief(
      { workspaceId, clerkUserId: adminId },
      { briefId: prepared.briefId!, action: "publish" },
    )).toBe("changed");
    expect(await applyToProductionCreativeMission(
      { workspaceId, creativeProfileId: creativeId, clerkUserId: creativeClerkUserId },
      { briefId: prepared.briefId!, action: "apply", message: "Disponible" },
    )).toBe("changed");
    expect(await transitionProductionCreativeBrief(
      { workspaceId, clerkUserId: adminId },
      {
        briefId: prepared.briefId!,
        action: "assign",
        creativeProfileId: creativeId,
      },
    )).toBe("changed");
    expect(await updateProductionCreativeAssignment(
      { workspaceId, creativeProfileId: creativeId, clerkUserId: creativeClerkUserId },
      {
        briefId: prepared.briefId!,
        action: "confirm",
        conditionsVersion: 1,
        links: [],
        comment: null,
      },
    )).toBe("changed");
    expect(await updateProductionCreativeAssignment(
      { workspaceId, creativeProfileId: creativeId, clerkUserId: creativeClerkUserId },
      {
        briefId: prepared.briefId!,
        action: "deliver",
        conditionsVersion: null,
        links: ["https://example.test/delivery"],
        comment: "Livraison",
      },
    )).toBe("changed");
    expect(await transitionProductionCreativeBrief(
      { workspaceId, clerkUserId: adminId },
      {
        briefId: prepared.briefId!,
        action: "request_changes",
        comment: "Ajouter deux portraits",
      },
    )).toBe("changed");

    const state = await sql.query(`
      SELECT mission.business_state,
             (SELECT count(*)::int
                FROM production_creative_briefs brief
               WHERE brief.workspace_id = $1
                 AND brief.origin_type = 'canonical_mission') AS briefs
      FROM creative_missions mission
      WHERE mission.workspace_id = $1 AND mission.id = $2::uuid
    `, [workspaceId, mission[0].id]) as Array<{ business_state: string; briefs: number }>;
    expect(state[0]).toEqual({ business_state: "changes_requested", briefs: 1 });
  });

  it("accepts and later closes an Athlete request without duplicating its projection", async () => {
    const requestId = randomUUID();
    await sql.query(`
      INSERT INTO athlete_session_requests (
        id, workspace_id, athlete_id, athlete_clerk_user_id,
        submission_idempotency_key, request_type, workflow_status,
        sport, event_type, event_starts_at, event_ends_at,
        region, location_name, objective, deliverables, commercial_mode
      ) VALUES (
        $1::uuid, $2, 'athlete-operational', $3, $4::uuid,
        'match_competition', 'submitted', 'Basketball', 'Match',
        '2026-12-20T14:00:00.000Z', '2026-12-20T16:00:00.000Z',
        'Vaud', 'Lausanne', 'Couverture match', '20 photos', 'admin_decision'
      )
    `, [requestId, workspaceId, `athlete-${runId}`, randomUUID()]);

    expect(await transitionAthleteSessionRequestAsAdmin({
      workspaceId,
      clerkUserId: adminId,
      requestId,
      action: "accept",
      idempotencyKey: randomUUID(),
    })).toBe("changed");
    expect(await transitionAthleteSessionRequestAsAdmin({
      workspaceId,
      clerkUserId: adminId,
      requestId,
      action: "refuse",
      reason: "Besoin annulé",
      idempotencyKey: randomUUID(),
    })).toBe("changed");

    const rows = await sql.query(`
      SELECT request.workflow_status, mission.business_state,
             count(*) OVER ()::int AS mission_count
      FROM athlete_session_requests request
      JOIN creative_mission_links link
        ON link.workspace_id = request.workspace_id
       AND link.source_type = 'athlete_session_request'
       AND link.source_id = request.id::text
      JOIN creative_missions mission
        ON mission.workspace_id = link.workspace_id
       AND mission.id = link.mission_id
      WHERE request.workspace_id = $1 AND request.id = $2::uuid
    `, [workspaceId, requestId]) as Array<{
      workflow_status: string;
      business_state: string;
      mission_count: number;
    }>;
    expect(rows).toEqual([{
      workflow_status: "refused",
      business_state: "closed_without_action",
      mission_count: 1,
    }]);
  });
});
