import { createContentStorageClient } from "@/lib/content-storage/db";
import type { ProductionCreativeBrief } from "@/types/production-creative";

type CreativeContext = {
  workspaceId: string;
  creativeProfileId: string;
  clerkUserId: string;
};

type BriefRow = {
  id: string;
  title: string;
  creative_type: ProductionCreativeBrief["creativeType"];
  athlete_refs: ProductionCreativeBrief["athletes"];
  scheduled_date: string | null;
  date_to_agree: boolean;
  region: string;
  location_details: string | null;
  objective: string;
  deliverables: string;
  delivery_due_date: string | null;
  compensation_type: "unpaid_collaboration" | "paid_mandate";
  compensation_amount_minor: number | null;
  compensation_currency: string | null;
  expenses_covered: boolean;
  expense_terms: string;
  credits_and_usage: string;
  status: ProductionCreativeBrief["status"];
  conditions_version: number;
  application_status: ProductionCreativeBrief["applicationStatus"] | null;
  application_message: string | null;
  confirmation_status: "pending" | "confirmed" | "confirmation_required" | null;
  delivery_status: "pending" | "delivered" | "changes_requested" | "validated" | null;
  delivery_links: string[] | null;
  delivery_comment: string | null;
  review_comment: string | null;
  necessary_contact_details: string | null;
};

const mapBrief = (row: BriefRow): ProductionCreativeBrief => ({
  id: row.id,
  title: row.title,
  creativeType: row.creative_type,
  athletes: Array.isArray(row.athlete_refs) ? row.athlete_refs : [],
  scheduledDate: row.scheduled_date,
  dateToAgree: row.date_to_agree,
  region: row.region,
  locationDetails: row.location_details,
  objective: row.objective,
  deliverables: row.deliverables,
  deliveryDueDate: row.delivery_due_date,
  compensation: row.compensation_type === "paid_mandate"
    ? {
        type: "paid_mandate",
        amountMinor: Number(row.compensation_amount_minor),
        currency: row.compensation_currency!,
      }
    : { type: "unpaid_collaboration", amountMinor: null, currency: null },
  expensesCovered: row.expenses_covered,
  expenseTerms: row.expense_terms,
  creditsAndUsage: row.credits_and_usage,
  status: row.status,
  conditionsVersion: row.conditions_version,
  applicationStatus: row.application_status ?? "none",
  applicationMessage: row.application_message,
  assignment: row.confirmation_status && row.delivery_status
    ? {
        confirmationStatus: row.confirmation_status,
        deliveryStatus: row.delivery_status,
        deliveryLinks: Array.isArray(row.delivery_links) ? row.delivery_links : [],
        deliveryComment: row.delivery_comment,
        reviewComment: row.review_comment,
        necessaryContactDetails: row.confirmation_status === "confirmed"
          ? row.necessary_contact_details
          : null,
      }
    : null,
});

export const listProductionCreativeMissions = async (
  context: Omit<CreativeContext, "clerkUserId">,
): Promise<ProductionCreativeBrief[]> => {
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    SELECT brief.id, brief.title, brief.creative_type, brief.athlete_refs,
           brief.scheduled_date::text, brief.date_to_agree, brief.region,
           brief.location_details, brief.objective, brief.deliverables,
           brief.delivery_due_date::text, brief.compensation_type,
           brief.compensation_amount_minor, brief.compensation_currency,
           brief.expenses_covered, brief.expense_terms, brief.credits_and_usage,
           brief.status, brief.conditions_version,
           application.status AS application_status,
           application.message AS application_message,
           assignment.confirmation_status, assignment.delivery_status,
           assignment.delivery_links, assignment.delivery_comment,
           assignment.review_comment, brief.necessary_contact_details
    FROM production_creative_briefs brief
    JOIN production_creative_recipients recipient
      ON recipient.workspace_id = brief.workspace_id
     AND recipient.brief_id = brief.id
     AND recipient.creative_profile_id = $2::uuid
    LEFT JOIN production_creative_applications application
      ON application.workspace_id = brief.workspace_id
     AND application.brief_id = brief.id
     AND application.creative_profile_id = $2::uuid
    LEFT JOIN production_creative_assignments assignment
      ON assignment.workspace_id = brief.workspace_id
     AND assignment.brief_id = brief.id
     AND assignment.creative_profile_id = $2::uuid
     AND assignment.status = 'active'
    WHERE brief.workspace_id = $1
      AND brief.status IN ('published', 'assigned', 'cancelled')
      AND (
        brief.status <> 'assigned'
        OR brief.assigned_creative_profile_id = $2::uuid
        OR application.status IS NOT NULL
      )
    ORDER BY COALESCE(brief.scheduled_date, brief.delivery_due_date) ASC NULLS LAST,
             brief.created_at DESC
  `, [context.workspaceId, context.creativeProfileId]) as BriefRow[];
  return rows.map(mapBrief);
};

export type CreativeMutationOutcome =
  | "changed"
  | "not_found"
  | "access_denied"
  | "already_assigned"
  | "conditions_changed"
  | "confirmation_required";

export const applyToProductionCreativeMission = async (
  context: CreativeContext,
  input: { briefId: string; action: "apply" | "withdraw"; message: string | null },
): Promise<CreativeMutationOutcome> => {
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    WITH access AS (
      SELECT profile.status AS profile_status, creative_access.status AS access_status
      FROM creative_access
      JOIN creative_profiles profile
        ON profile.workspace_id = creative_access.workspace_id
       AND profile.id = creative_access.creative_profile_id
      WHERE creative_access.workspace_id = $1
        AND creative_access.creative_profile_id = $2::uuid
        AND creative_access.clerk_user_id = $3
    ), target AS (
      SELECT brief.id, brief.status, brief.assigned_creative_profile_id
      FROM production_creative_briefs brief
      JOIN production_creative_recipients recipient
        ON recipient.workspace_id = brief.workspace_id
       AND recipient.brief_id = brief.id
       AND recipient.creative_profile_id = $2::uuid
      WHERE brief.workspace_id = $1 AND brief.id = $4::uuid
      FOR UPDATE OF brief
    ), changed AS (
      INSERT INTO production_creative_applications (
        workspace_id, brief_id, creative_profile_id, status, message
      )
      SELECT $1, target.id, $2::uuid,
             CASE WHEN $5 = 'apply' THEN 'interested' ELSE 'withdrawn' END,
             CASE WHEN $5 = 'apply' THEN $6 ELSE NULL END
      FROM target, access
      WHERE access.profile_status = 'active'
        AND access.access_status = 'active'
        AND target.status = 'published'
        AND target.assigned_creative_profile_id IS NULL
      ON CONFLICT (workspace_id, brief_id, creative_profile_id)
      DO UPDATE SET status = EXCLUDED.status, message = EXCLUDED.message, updated_at = NOW()
      RETURNING brief_id
    ), event AS (
      INSERT INTO production_creative_events (
        workspace_id, brief_id, creative_profile_id, action, actor_clerk_user_id, details
      )
      SELECT $1, changed.brief_id, $2::uuid,
             CASE WHEN $5 = 'apply' THEN 'application_submitted' ELSE 'application_withdrawn' END,
             $3, jsonb_build_object('message', $6)
      FROM changed RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM access WHERE profile_status = 'active' AND access_status = 'active')
        THEN 'access_denied'
      WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
      WHEN EXISTS (SELECT 1 FROM target WHERE status <> 'published' OR assigned_creative_profile_id IS NOT NULL)
        THEN 'already_assigned'
      WHEN EXISTS (SELECT 1 FROM event) THEN 'changed'
      ELSE 'not_found'
    END AS outcome
  `, [
    context.workspaceId,
    context.creativeProfileId,
    context.clerkUserId,
    input.briefId,
    input.action,
    input.message,
  ]) as Array<{ outcome: CreativeMutationOutcome }>;
  return rows[0]?.outcome ?? "not_found";
};

export const updateProductionCreativeAssignment = async (
  context: CreativeContext,
  input: {
    briefId: string;
    action: "confirm" | "deliver" | "refuse";
    conditionsVersion: number | null;
    links: string[];
    comment: string | null;
  },
): Promise<CreativeMutationOutcome> => {
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    WITH access AS (
      SELECT profile.status AS profile_status, creative_access.status AS access_status
      FROM creative_access
      JOIN creative_profiles profile
        ON profile.workspace_id = creative_access.workspace_id
       AND profile.id = creative_access.creative_profile_id
      WHERE creative_access.workspace_id = $1
        AND creative_access.creative_profile_id = $2::uuid
        AND creative_access.clerk_user_id = $3
    ), target AS (
      SELECT assignment.id, assignment.brief_id, assignment.confirmation_status, assignment.conditions_version,
             assignment.delivery_status, assignment.conditions_snapshot,
             brief.conditions_version AS current_conditions_version
      FROM production_creative_assignments assignment
      JOIN production_creative_briefs brief
        ON brief.workspace_id = assignment.workspace_id AND brief.id = assignment.brief_id
      WHERE assignment.workspace_id = $1
        AND assignment.brief_id = $4::uuid
        AND assignment.creative_profile_id = $2::uuid
        AND assignment.status = 'active'
      FOR UPDATE OF assignment, brief
    ), changed AS (
      UPDATE production_creative_assignments assignment
      SET       status = CASE WHEN $5 = 'refuse' THEN 'refused' ELSE assignment.status END,
      refusal_reason = CASE WHEN $5 = 'refuse' THEN $8 ELSE assignment.refusal_reason END,
      refused_at = CASE WHEN $5 = 'refuse' THEN NOW() ELSE assignment.refused_at END,
      confirmation_status = CASE WHEN $5 = 'confirm' THEN 'confirmed' ELSE assignment.confirmation_status END,
          confirmed_at = CASE WHEN $5 = 'confirm' THEN NOW() ELSE assignment.confirmed_at END,
          delivery_status = CASE WHEN $5 = 'deliver' THEN 'delivered' ELSE assignment.delivery_status END,
          delivery_links = CASE WHEN $5 = 'deliver' THEN $7::jsonb ELSE assignment.delivery_links END,
          delivery_comment = CASE WHEN $5 = 'deliver' THEN $8 ELSE assignment.delivery_comment END,
          delivered_at = CASE WHEN $5 = 'deliver' THEN NOW() ELSE assignment.delivered_at END,
          review_comment = CASE WHEN $5 = 'deliver' THEN NULL ELSE assignment.review_comment END,
          updated_at = NOW()
      FROM target, access
      WHERE assignment.id = target.id
        AND access.profile_status = 'active' AND access.access_status = 'active'
        AND (($5 = 'confirm' AND $6 = target.current_conditions_version)
          OR ($5 = 'deliver' AND target.confirmation_status = 'confirmed'
            AND target.conditions_version = target.current_conditions_version)
          OR ($5 = 'refuse'))
      RETURNING assignment.brief_id
    ), refused_brief AS (
      UPDATE production_creative_briefs brief
      SET status = 'published', assigned_creative_profile_id = NULL,
          assigned_at = NULL, updated_at = NOW()
      FROM changed
      WHERE $5 = 'refuse' AND brief.workspace_id = $1 AND brief.id = changed.brief_id
      RETURNING brief.id
    ), refused_application AS (
      UPDATE production_creative_applications application
      SET status = 'withdrawn', updated_at = NOW()
      FROM changed
      WHERE $5 = 'refuse' AND application.workspace_id = $1
        AND application.brief_id = changed.brief_id
        AND application.creative_profile_id = $2::uuid
    ), event AS (
      INSERT INTO production_creative_events (
        workspace_id, brief_id, creative_profile_id, action, actor_clerk_user_id, details
      )
      SELECT $1, changed.brief_id, $2::uuid,
             CASE WHEN $5 = 'confirm' THEN 'assignment_confirmed'
               WHEN $5 = 'refuse' THEN 'assignment_refused'
               ELSE 'delivery_submitted' END,
             $3, CASE WHEN $5 = 'deliver'
               THEN jsonb_build_object('links', $7::jsonb, 'comment', $8)
               WHEN $5 = 'refuse'
               THEN jsonb_build_object(
                 'reason', $8, 'conditionsVersion', target.conditions_version,
                 'conditions', target.conditions_snapshot,
                 'deliveryStatus', target.delivery_status
               )
               ELSE jsonb_build_object('conditionsVersion', $6) END
      FROM changed JOIN target ON target.brief_id = changed.brief_id
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM access WHERE profile_status = 'active' AND access_status = 'active')
        THEN 'access_denied'
      WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
      WHEN $5 = 'confirm' AND EXISTS (
        SELECT 1 FROM target WHERE current_conditions_version <> $6
      ) THEN 'conditions_changed'
      WHEN $5 = 'deliver' AND EXISTS (
        SELECT 1 FROM target
        WHERE confirmation_status <> 'confirmed'
           OR conditions_version <> current_conditions_version
      ) THEN 'confirmation_required'
      WHEN EXISTS (SELECT 1 FROM event) THEN 'changed'
      ELSE 'not_found'
    END AS outcome
  `, [
    context.workspaceId,
    context.creativeProfileId,
    context.clerkUserId,
    input.briefId,
    input.action,
    input.conditionsVersion,
    JSON.stringify(input.links),
    input.comment,
  ]) as Array<{ outcome: CreativeMutationOutcome }>;
  return rows[0]?.outcome ?? "not_found";
};
