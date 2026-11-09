import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listCreativeAvailability,
  saveCreativeAvailability,
} from "@/lib/creative-availability";
import {
  confirmAthleteSessionFinally,
  createProductionBriefFromAthleteSession,
  listAdminAthleteSessionRequests,
} from "@/lib/athlete-session-requests";
import { transitionProductionCreativeBrief } from "@/lib/admin-production-creative";
import {
  applyToProductionCreativeMission,
  updateProductionCreativeAssignment,
} from "@/lib/production-creative-missions";

const databaseUrl = process.env.KLIQUE_CREATIVE_SESSION_PG_TEST_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const sql = databaseUrl
  ? neon(databaseUrl)
  : null as unknown as NeonQueryFunction<false, false>;
const runId = randomUUID();
const workspaceId = `creative-session-test-${runId}`;
const otherWorkspaceId = `creative-session-other-${runId}`;
const adminId = `admin-${runId}`;
const creativeUserId = `creative-${runId}`;
const creativeId = randomUUID();
const otherCreativeId = randomUUID();

const fixtureWhere = "workspace_id LIKE 'creative-session-test-%' OR workspace_id LIKE 'creative-session-other-%'";

const cleanup = async () => {
  await sql.transaction([
    sql.query("ALTER TABLE athlete_session_request_events DISABLE TRIGGER USER"),
    sql.query("ALTER TABLE production_creative_events DISABLE TRIGGER USER"),
    sql.query(`DELETE FROM athlete_session_request_events WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM athlete_session_confirmed_creative_slots WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM athlete_session_request_periods WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_events WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_assignments WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_applications WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_recipients WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_condition_versions WHERE ${fixtureWhere}`),
    sql.query(`UPDATE athlete_session_requests SET production_brief_id = NULL WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_briefs WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM athlete_session_requests WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_availability_exceptions WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_availability_rules WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_access WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_profiles WHERE ${fixtureWhere}`),
    sql.query("ALTER TABLE production_creative_events ENABLE TRIGGER USER"),
    sql.query("ALTER TABLE athlete_session_request_events ENABLE TRIGGER USER"),
  ]);
};

const insertCreative = async (
  workspace: string,
  id: string,
  displayName: string,
  clerkUserId: string,
) => {
  await sql.transaction([
    sql.query(`
      INSERT INTO creative_profiles (
        id, workspace_id, provenance, display_name, creative_type, contact_email,
        coverage_areas, specialties, status, approved_by_clerk_user_id, approved_at
      ) VALUES (
        $1::uuid, $2, 'admin_manual', $3, 'both', $4,
        ARRAY['Vaud'], ARRAY['Basketball'], 'active', $5, NOW()
      )
    `, [id, workspace, displayName, `${id}@example.test`, adminId]),
    sql.query(`
      INSERT INTO creative_access (
        workspace_id, creative_profile_id, clerk_user_id, status,
        invitation_email, invited_by_clerk_user_id, activated_at
      ) VALUES ($1, $2::uuid, $3, 'active', $4, $5, NOW())
    `, [workspace, id, clerkUserId, `${id}@example.test`, adminId]),
  ]);
};

const insertConfirmableRequest = async (requestId: string, briefId: string) => {
  const eventStart = "2026-12-12T14:00:00.000Z";
  await sql.transaction([
    sql.query(`
      INSERT INTO athlete_session_requests (
        id, workspace_id, athlete_id, athlete_clerk_user_id,
        submission_idempotency_key, request_type, workflow_status,
        sport, event_type, event_starts_at, event_ends_at,
        region, location_name, objective, deliverables,
        commercial_mode, production_brief_id
      ) VALUES (
        $1::uuid, $2, $3, $4, $5::uuid, 'match_competition', 'creative_agreed',
        'Basketball', 'Match', $6::timestamptz, $7::timestamptz,
        'Vaud', 'Lausanne', 'Couverture Test', '20 photos',
        'admin_decision', NULL
      )
    `, [
      requestId,
      workspaceId,
      `athlete-${requestId}`,
      `clerk-${requestId}`,
      randomUUID(),
      eventStart,
      "2026-12-12T16:00:00.000Z",
    ]),
    sql.query(`
      INSERT INTO production_creative_briefs (
        id, workspace_id, production_source, production_source_fingerprint,
        production_snapshot, origin_type, origin_request_id,
        title, creative_type, athlete_refs, scheduled_date, date_to_agree,
        region, objective, deliverables, compensation_type,
        expenses_covered, expense_terms, credits_and_usage,
        status, assigned_creative_profile_id, assigned_at, created_by_clerk_user_id
      ) VALUES (
        $1::uuid, $2, 'athlete_session_request', $3, '{}'::jsonb,
        'athlete_session_request', $4::uuid,
        'Match Test', 'photo', '[]'::jsonb, '2026-12-12', FALSE,
        'Vaud', 'Couverture Test', '20 photos', 'unpaid_collaboration',
        FALSE, 'Aucun frais.', 'Crédit obligatoire.',
        'assigned', $5::uuid, NOW(), $6
      )
    `, [briefId, workspaceId, requestId.replaceAll("-", ""), requestId, creativeId, adminId]),
    sql.query(`
      INSERT INTO production_creative_condition_versions (
        workspace_id, brief_id, version, conditions_snapshot, created_by_clerk_user_id
      ) VALUES ($1, $2::uuid, 1, '{}'::jsonb, $3)
    `, [workspaceId, briefId, adminId]),
    sql.query(`
      INSERT INTO production_creative_assignments (
        workspace_id, brief_id, creative_profile_id, conditions_version,
        conditions_snapshot, status, confirmation_status, confirmed_at
      ) VALUES (
        $1, $2::uuid, $3::uuid, 1, '{}'::jsonb,
        'active', 'confirmed', NOW()
      )
    `, [workspaceId, briefId, creativeId]),
    sql.query(`
      UPDATE athlete_session_requests
      SET production_brief_id = $3::uuid
      WHERE workspace_id = $1 AND id = $2::uuid
    `, [workspaceId, requestId, briefId]),
  ]);
};

describePostgres.sequential("creative availability and session requests on Neon Test", () => {
  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    if (
      target.protocol !== "postgresql:"
      || target.hostname !== "ep-twilight-pond-b23rxfe7-pooler.c-6.eu-central-1.aws.neon.tech"
      || target.pathname !== "/neondb"
      || target.searchParams.get("sslmode") !== "require"
    ) {
      throw new Error("La cible doit être la branche Neon Test temporaire autorisée.");
    }
    const schema = await sql.query(`
      SELECT current_database() AS database_name,
             to_regclass('public.creative_availability_rules')::text AS availability,
             to_regclass('public.athlete_session_requests')::text AS requests,
             to_regclass('public.athlete_session_confirmed_creative_slots')::text AS slots
    `) as Array<Record<string, string | null>>;
    expect(schema[0]).toEqual({
      database_name: "neondb",
      availability: "creative_availability_rules",
      requests: "athlete_session_requests",
      slots: "athlete_session_confirmed_creative_slots",
    });
    process.env.POSTGRES_DATABASE_URL = databaseUrl;
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = workspaceId;
    await cleanup();
    await insertCreative(workspaceId, creativeId, "Créatif Test", creativeUserId);
    await insertCreative(otherWorkspaceId, otherCreativeId, "Créatif Autre", `other-${runId}`);
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await cleanup();
    const remaining = await sql.query(`
      SELECT
        (SELECT count(*)::int FROM athlete_session_requests WHERE ${fixtureWhere}) AS requests,
        (SELECT count(*)::int FROM creative_availability_rules WHERE ${fixtureWhere}) AS availability,
        (SELECT count(*)::int FROM creative_profiles WHERE ${fixtureWhere}) AS profiles
    `) as Array<Record<string, number>>;
    expect(remaining[0]).toEqual({ requests: 0, availability: 0, profiles: 0 });
  });

  it("isolates availability by workspace and rejects exact duplicates", async () => {
    const input = {
      availabilityDate: "2026-12-07",
      startTime: "09:00",
      endTime: "12:00",
      allDay: false,
      recurrence: "weekly" as const,
      recurrenceUntil: "2026-12-28",
      exceptionDates: ["2026-12-21"],
      regions: ["Vaud"],
      missionTypes: ["match_competition" as const],
      internalComment: "Fixture Test",
    };
    await saveCreativeAvailability({
      workspaceId,
      creativeProfileId: creativeId,
      actorClerkUserId: adminId,
      input,
    });
    await expect(saveCreativeAvailability({
      workspaceId,
      creativeProfileId: creativeId,
      actorClerkUserId: adminId,
      input,
    })).rejects.toMatchObject({ code: "23505" });
    await saveCreativeAvailability({
      workspaceId: otherWorkspaceId,
      creativeProfileId: otherCreativeId,
      actorClerkUserId: adminId,
      input: { ...input, internalComment: "Autre workspace" },
    });
    const calendar = await listCreativeAvailability({
      workspaceId,
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(calendar.rules).toHaveLength(1);
    expect(calendar.rules[0].creativeProfileId).toBe(creativeId);
    expect(calendar.occurrences.map((item) => item.date))
      .toEqual(["2026-12-07", "2026-12-14", "2026-12-28"]);
  });

  it("serializes final confirmation and keeps the event journal immutable", async () => {
    const first = { requestId: randomUUID(), briefId: randomUUID() };
    const second = { requestId: randomUUID(), briefId: randomUUID() };
    await insertConfirmableRequest(first.requestId, first.briefId);
    await insertConfirmableRequest(second.requestId, second.briefId);

    const outcomes = await Promise.all([
      confirmAthleteSessionFinally({
        workspaceId,
        clerkUserId: adminId,
        requestId: first.requestId,
        idempotencyKey: randomUUID(),
      }),
      confirmAthleteSessionFinally({
        workspaceId,
        clerkUserId: adminId,
        requestId: second.requestId,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(outcomes.sort()).toEqual(["changed", "conflict"]);

    const state = await sql.query(`
      SELECT workflow_status, count(*)::int AS count
      FROM athlete_session_requests
      WHERE workspace_id = $1 AND id = ANY($2::uuid[])
      GROUP BY workflow_status
      ORDER BY workflow_status
    `, [workspaceId, [first.requestId, second.requestId]]) as Array<{
      workflow_status: string;
      count: number;
    }>;
    expect(state).toEqual([
      { workflow_status: "confirmed", count: 1 },
      { workflow_status: "creative_agreed", count: 1 },
    ]);
    const events = await sql.query(`
      SELECT id
      FROM athlete_session_request_events
      WHERE workspace_id = $1 AND action = 'final_confirmation'
    `, [workspaceId]) as Array<{ id: string }>;
    expect(events).toHaveLength(1);
    await expect(sql.query(`
      UPDATE athlete_session_request_events SET action = 'tampered' WHERE id = $1::uuid
    `, [events[0].id])).rejects.toThrow(/immutable/);
  });

  it("joins an accepted Athlete request to the existing Production and Creative workflow", async () => {
    const requestId = randomUUID();
    await sql.query(`
      INSERT INTO athlete_session_requests (
        id, workspace_id, athlete_id, athlete_clerk_user_id,
        submission_idempotency_key, request_type, workflow_status,
        sport, event_type, event_starts_at, event_ends_at,
        region, location_name, objective, deliverables,
        commercial_mode
      ) VALUES (
        $1::uuid, $2, $3, $4, $5::uuid, 'match_competition', 'accepted',
        'Basketball', 'Match', '2026-12-19T14:00:00Z', '2026-12-19T16:00:00Z',
        'Vaud', 'Lausanne', 'Couverture complète', '20 photos',
        'admin_decision'
      )
    `, [
      requestId,
      workspaceId,
      `athlete-e2e-${runId}`,
      `clerk-athlete-e2e-${runId}`,
      randomUUID(),
    ]);

    const linked = await createProductionBriefFromAthleteSession({
      workspaceId,
      clerkUserId: adminId,
      requestId,
      athleteName: "Athlète E2E",
      input: {
        idempotencyKey: randomUUID(),
        creativeType: "photo",
        selectedPeriodStart: null,
        deliveryDueDate: "2026-12-22",
        compensation: {
          type: "unpaid_collaboration",
          amountMinor: null,
          currency: null,
        },
        expensesCovered: false,
        expenseTerms: "Aucun frais pris en charge.",
        creditsAndUsage: "Crédit photo obligatoire.",
        necessaryContactDetails: "Contact après confirmation.",
        recipientIds: [creativeId],
      },
    });
    expect(linked.outcome).toBe("changed");
    expect(linked.briefId).toMatch(/^[0-9a-f-]{36}$/);

    const adminContext = { workspaceId, clerkUserId: adminId };
    expect(await transitionProductionCreativeBrief(adminContext, {
      briefId: linked.briefId!,
      action: "publish",
    })).toBe("changed");
    const creativeContext = {
      workspaceId,
      creativeProfileId: creativeId,
      clerkUserId: creativeUserId,
    };
    expect(await applyToProductionCreativeMission(creativeContext, {
      briefId: linked.briefId!,
      action: "apply",
      message: "Disponible.",
    })).toBe("changed");
    expect(await transitionProductionCreativeBrief(adminContext, {
      briefId: linked.briefId!,
      action: "assign",
      creativeProfileId: creativeId,
    })).toBe("changed");
    expect(await updateProductionCreativeAssignment(creativeContext, {
      briefId: linked.briefId!,
      action: "confirm",
      conditionsVersion: 1,
      links: [],
      comment: null,
    })).toBe("changed");
    expect(await confirmAthleteSessionFinally({
      workspaceId,
      clerkUserId: adminId,
      requestId,
      idempotencyKey: randomUUID(),
    })).toBe("changed");

    const requests = await listAdminAthleteSessionRequests({
      workspaceId,
      athleteNames: new Map([[`athlete-e2e-${runId}`, "Athlète E2E"]]),
    });
    const completedWorkflow = requests.find((request) => request.id === requestId);
    expect(completedWorkflow).toMatchObject({
      workflowStatus: "confirmed",
      productionBriefId: linked.briefId,
      assignedCreativeProfileId: creativeId,
      creativeConfirmationStatus: "confirmed",
    });
    expect(completedWorkflow?.events.map((event) => event.toStatus)).toEqual([
      "production_linked",
      "proposed_to_creatives",
      "candidate_received",
      "assigned",
      "creative_agreed",
      "confirmed",
    ]);
  });
});
