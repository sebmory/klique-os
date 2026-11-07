import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createProductionCreativeBrief,
  transitionProductionCreativeBrief,
  updateProductionCreativeConditions,
} from "@/lib/admin-production-creative";
import {
  applyToProductionCreativeMission,
  listProductionCreativeMissions,
  updateProductionCreativeAssignment,
} from "@/lib/production-creative-missions";

const testDatabaseUrl = process.env.KLIQUE_CREATIVE_PG_TEST_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;
const sql = testDatabaseUrl
  ? neon(testDatabaseUrl)
  : null as unknown as NeonQueryFunction<false, false>;
const runId = randomUUID();
const workspaceId = `creative-space-test-${runId}`;
const otherWorkspaceId = `creative-space-other-${runId}`;
const adminUserId = `admin-${runId}`;
const creativeA = { id: randomUUID(), clerkUserId: `creative-a-${runId}` };
const creativeB = { id: randomUUID(), clerkUserId: `creative-b-${runId}` };

const cleanup = async () => {
  const fixtureWhere = "workspace_id LIKE 'creative-space-test-%' OR workspace_id LIKE 'creative-space-other-%'";
  await sql.transaction([
    sql.query("ALTER TABLE production_creative_events DISABLE TRIGGER USER"),
    sql.query(`DELETE FROM production_creative_events WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_assignments WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_applications WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_recipients WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_condition_versions WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM production_creative_briefs WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_access WHERE ${fixtureWhere}`),
    sql.query(`DELETE FROM creative_profiles WHERE ${fixtureWhere}`),
    sql.query("ALTER TABLE production_creative_events ENABLE TRIGGER USER"),
  ]);
};

const insertCreative = async (
  workspace: string,
  creative: { id: string; clerkUserId: string },
  name: string,
) => {
  await sql.transaction([
    sql.query(`
      INSERT INTO creative_profiles (
        id, workspace_id, provenance, display_name, creative_type, contact_email,
        coverage_areas, specialties, status, approved_by_clerk_user_id, approved_at
      ) VALUES ($1::uuid, $2, 'admin_manual', $3, 'both', $4, ARRAY['Vaud'],
                ARRAY['Basketball'], 'active', $5, NOW())
    `, [creative.id, workspace, name, `${creative.clerkUserId}@example.test`, adminUserId]),
    sql.query(`
      INSERT INTO creative_access (
        workspace_id, creative_profile_id, clerk_user_id, status,
        invitation_email, invited_by_clerk_user_id, activated_at
      ) VALUES ($1, $2::uuid, $3, 'active', $4, $5, NOW())
    `, [
      workspace,
      creative.id,
      creative.clerkUserId,
      `${creative.clerkUserId}@example.test`,
      adminUserId,
    ]),
  ]);
};

describePostgres.sequential("production creative space on confirmed Neon Test", () => {
  beforeAll(async () => {
    const target = new URL(testDatabaseUrl!);
    if (
      target.protocol !== "postgresql:"
      || !target.hostname.endsWith(".neon.tech")
      || target.pathname !== "/klique_intro_app_test"
      || target.searchParams.get("sslmode") !== "require"
    ) {
      throw new Error("La cible doit être explicitement la base Neon Test autorisée.");
    }
    const rows = await sql.query(`
      SELECT current_database() AS database_name,
             to_regclass('public.production_creative_briefs')::text AS briefs_table
    `) as Array<{ database_name: string; briefs_table: string | null }>;
    expect(rows[0]).toEqual({
      database_name: "klique_intro_app_test",
      briefs_table: "production_creative_briefs",
    });
    process.env.POSTGRES_DATABASE_URL = testDatabaseUrl;
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = workspaceId;
    await cleanup();
    await insertCreative(workspaceId, creativeA, "Créatif A");
    await insertCreative(workspaceId, creativeB, "Créatif B");
    await insertCreative(otherWorkspaceId, {
      id: randomUUID(),
      clerkUserId: `other-${runId}`,
    }, "Autre workspace");
  });

  afterAll(async () => {
    if (!testDatabaseUrl) return;
    await cleanup();
    const rows = await sql.query(`
      SELECT
        (SELECT count(*)::int FROM production_creative_briefs WHERE workspace_id LIKE 'creative-space-%') AS briefs,
        (SELECT count(*)::int FROM production_creative_assignments WHERE workspace_id LIKE 'creative-space-%') AS assignments,
        (SELECT count(*)::int FROM production_creative_events WHERE workspace_id LIKE 'creative-space-%') AS events,
        (SELECT count(*)::int FROM creative_profiles WHERE workspace_id LIKE 'creative-space-%') AS profiles
    `) as Array<Record<string, number>>;
    expect(rows[0]).toEqual({ briefs: 0, assignments: 0, events: 0, profiles: 0 });
  });

  it("runs application, concurrent assignment, versioning, refusal, reassignment and delivery", async () => {
    const briefInput = {
      productionSourceRow: 40,
      productionSnapshot: {
        date: "2026-11-20",
        type: "Match",
        athlete: "Athlète fixture",
        sport: "Basketball",
        location: "Lausanne",
        objective: "Couverture fixture",
      },
      productionSourceFingerprint: "a".repeat(64),
      title: "Match fixture",
      creativeType: "photo" as const,
      athletes: [{ id: `athlete-${runId}`, name: "Athlète fixture" }],
      scheduledDate: "2026-11-20",
      dateToAgree: false,
      region: "Vaud",
      locationDetails: "Lausanne",
      objective: "Couverture fixture",
      deliverables: "20 photos",
      deliveryDueDate: "2026-11-22",
      compensation: {
        type: "unpaid_collaboration" as const,
        amountMinor: null,
        currency: null,
      },
      expensesCovered: false,
      expenseTerms: "Aucun frais pris en charge.",
      creditsAndUsage: "Usage réseaux KLIQUE avec crédit.",
      necessaryContactDetails: "Contact fixture après confirmation.",
      recipientIds: [creativeA.id, creativeB.id],
    };
    const adminContext = { workspaceId, clerkUserId: adminUserId };
    const briefId = await createProductionCreativeBrief(adminContext, briefInput);
    await expect(createProductionCreativeBrief(adminContext, briefInput))
      .rejects.toMatchObject({
        code: "23505",
        constraint: "production_creative_briefs_source_anchor_unique_idx",
      });

    expect(await transitionProductionCreativeBrief({
      workspaceId,
      clerkUserId: adminUserId,
    }, { briefId, action: "publish" })).toBe("changed");

    const contextA = {
      workspaceId,
      creativeProfileId: creativeA.id,
      clerkUserId: creativeA.clerkUserId,
    };
    const contextB = {
      workspaceId,
      creativeProfileId: creativeB.id,
      clerkUserId: creativeB.clerkUserId,
    };
    expect(await Promise.all([
      applyToProductionCreativeMission(contextA, {
        briefId, action: "apply", message: "Disponible A",
      }),
      applyToProductionCreativeMission(contextA, {
        briefId, action: "apply", message: "Disponible A",
      }),
    ])).toEqual(["changed", "changed"]);
    await applyToProductionCreativeMission(contextB, {
      briefId, action: "apply", message: "Disponible B",
    });
    const duplicateRows = await sql.query(`
      SELECT count(*)::int AS count
      FROM production_creative_applications
      WHERE workspace_id = $1 AND brief_id = $2::uuid
        AND creative_profile_id = $3::uuid
    `, [workspaceId, briefId, creativeA.id]) as Array<{ count: number }>;
    expect(duplicateRows[0].count).toBe(1);

    const assignments = await Promise.all([
      transitionProductionCreativeBrief({
        workspaceId,
        clerkUserId: adminUserId,
      }, { briefId, action: "assign", creativeProfileId: creativeA.id }),
      transitionProductionCreativeBrief({
        workspaceId,
        clerkUserId: adminUserId,
      }, { briefId, action: "assign", creativeProfileId: creativeB.id }),
    ]);
    expect(assignments.sort()).toEqual(["changed", "conflict"]);

    const activeRows = await sql.query(`
      SELECT creative_profile_id::text AS creative_profile_id
      FROM production_creative_assignments
      WHERE workspace_id = $1 AND brief_id = $2::uuid AND status = 'active'
    `, [workspaceId, briefId]) as Array<{ creative_profile_id: string }>;
    const assignedContext = activeRows[0].creative_profile_id === creativeA.id
      ? contextA
      : contextB;
    const waitingContext = assignedContext === contextA ? contextB : contextA;

    const concurrent = await Promise.all([
      updateProductionCreativeAssignment(assignedContext, {
        briefId, action: "confirm", conditionsVersion: 1, links: [], comment: null,
      }),
      updateProductionCreativeConditions({
        workspaceId,
        clerkUserId: adminUserId,
      }, briefId, {
        compensation: { type: "unpaid_collaboration", amountMinor: null, currency: null },
        expensesCovered: true,
        expenseTerms: "Train remboursé sur justificatif.",
        deliverables: "25 photos",
        creditsAndUsage: "Usage réseaux KLIQUE avec crédit.",
        scheduledDate: "2026-11-20",
        dateToAgree: false,
        region: "Vaud",
        locationDetails: "Lausanne, salle principale",
        deliveryDueDate: "2026-11-23",
      }),
    ]);
    expect(concurrent).toContain("changed");
    const afterConditions = await sql.query(`
      SELECT brief.conditions_version, assignment.confirmation_status
      FROM production_creative_briefs brief
      JOIN production_creative_assignments assignment
        ON assignment.workspace_id = brief.workspace_id AND assignment.brief_id = brief.id
       AND assignment.status = 'active'
      WHERE brief.workspace_id = $1 AND brief.id = $2::uuid
    `, [workspaceId, briefId]) as Array<{
      conditions_version: number;
      confirmation_status: string;
    }>;
    expect(afterConditions[0]).toEqual({
      conditions_version: 2,
      confirmation_status: "confirmation_required",
    });
    const versions = await sql.query(`
      SELECT version, conditions_snapshot ->> 'deliverables' AS deliverables
      FROM production_creative_condition_versions
      WHERE workspace_id = $1 AND brief_id = $2::uuid
      ORDER BY version
    `, [workspaceId, briefId]) as Array<{ version: number; deliverables: string }>;
    expect(versions).toEqual([
      { version: 1, deliverables: "20 photos" },
      { version: 2, deliverables: "25 photos" },
    ]);
    expect(await updateProductionCreativeAssignment(assignedContext, {
      briefId, action: "confirm", conditionsVersion: 1, links: [], comment: null,
    })).toBe("conditions_changed");
    expect(await updateProductionCreativeAssignment(assignedContext, {
      briefId, action: "confirm", conditionsVersion: 2, links: [], comment: null,
    })).toBe("changed");

    expect(await updateProductionCreativeAssignment(assignedContext, {
      briefId, action: "refuse", conditionsVersion: null, links: [],
      comment: "Nouvelles conditions incompatibles.",
    })).toBe("changed");
    expect(await transitionProductionCreativeBrief({
      workspaceId,
      clerkUserId: adminUserId,
    }, {
      briefId,
      action: "assign",
      creativeProfileId: waitingContext.creativeProfileId,
    })).toBe("changed");

    await sql.query(`
      UPDATE creative_profiles SET status = 'inactive'
      WHERE workspace_id = $1 AND id = $2::uuid
    `, [workspaceId, waitingContext.creativeProfileId]);
    expect(await updateProductionCreativeAssignment(waitingContext, {
      briefId, action: "confirm", conditionsVersion: 2, links: [], comment: null,
    })).toBe("access_denied");
    await sql.query(`
      UPDATE creative_profiles SET status = 'active'
      WHERE workspace_id = $1 AND id = $2::uuid
    `, [workspaceId, waitingContext.creativeProfileId]);
    expect(await updateProductionCreativeAssignment(waitingContext, {
      briefId, action: "confirm", conditionsVersion: 2, links: [], comment: null,
    })).toBe("changed");
    expect(await updateProductionCreativeAssignment(waitingContext, {
      briefId, action: "deliver", conditionsVersion: null,
      links: ["https://example.test/fixture-delivery"], comment: "Livraison fixture",
    })).toBe("changed");
    expect(await transitionProductionCreativeBrief({
      workspaceId,
      clerkUserId: adminUserId,
    }, { briefId, action: "request_changes", comment: "Ajouter cinq images." })).toBe("changed");
    expect(await updateProductionCreativeAssignment(waitingContext, {
      briefId, action: "deliver", conditionsVersion: null,
      links: ["https://example.test/fixture-delivery-v2"], comment: "Complément fixture",
    })).toBe("changed");
    expect(await transitionProductionCreativeBrief({
      workspaceId,
      clerkUserId: adminUserId,
    }, { briefId, action: "validate_delivery" })).toBe("changed");

    expect(await listProductionCreativeMissions({
      workspaceId: otherWorkspaceId,
      creativeProfileId: waitingContext.creativeProfileId,
    })).toEqual([]);
    const history = await sql.query(`
      SELECT
        count(*) FILTER (WHERE action = 'conditions_changed')::int AS conditions_changes,
        count(*) FILTER (WHERE action = 'assignment_refused')::int AS refusals,
        count(*) FILTER (WHERE action = 'delivery_validated')::int AS validations
      FROM production_creative_events
      WHERE workspace_id = $1 AND brief_id = $2::uuid
    `, [workspaceId, briefId]) as Array<Record<string, number>>;
    expect(history[0]).toEqual({
      conditions_changes: 1,
      refusals: 1,
      validations: 1,
    });
  });
});
