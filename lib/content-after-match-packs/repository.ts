import { randomUUID } from "node:crypto";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type {
  AfterMatchPackCreditStatus,
  AfterMatchPackDeliverable,
  AfterMatchPackDeliverableStatus,
  AfterMatchPackStatus,
} from "@/types/content-after-match-pack";
import type { ContentVariant } from "@/types/content-variant";

export const AFTER_MATCH_PACK_STALE_AFTER_MS = 10 * 60 * 1000;

export type AfterMatchPackRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  mediaId: string | null;
  sourceDocumentId: string;
  sourceDocumentStorageVersion: number;
  sourceDocumentVersionId: string;
  sourceDocumentUpdatedAt: string;
  status: AfterMatchPackStatus;
  reelStatus: AfterMatchPackDeliverableStatus;
  storiesStatus: AfterMatchPackDeliverableStatus;
  reelAttemptCount: number;
  storiesAttemptCount: number;
  reelVariantId: string | null;
  storiesVariantId: string | null;
  reelCreditStatus: AfterMatchPackCreditStatus;
  storiesCreditStatus: AfterMatchPackCreditStatus;
  reelCreditIdempotencyKey: string | null;
  storiesCreditIdempotencyKey: string | null;
  reelErrorCode: string | null;
  storiesErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type PackRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  media_id: string | null;
  source_document_id: string;
  source_document_storage_version: number;
  source_document_version_id: string;
  source_document_updated_at: string;
  status: AfterMatchPackStatus;
  reel_status: AfterMatchPackDeliverableStatus;
  stories_status: AfterMatchPackDeliverableStatus;
  reel_attempt_count: number;
  stories_attempt_count: number;
  reel_variant_id: string | null;
  stories_variant_id: string | null;
  reel_credit_status: AfterMatchPackCreditStatus;
  stories_credit_status: AfterMatchPackCreditStatus;
  reel_credit_idempotency_key: string | null;
  stories_credit_idempotency_key: string | null;
  reel_error_code: string | null;
  stories_error_code: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  claimed?: boolean;
};

const packColumns = `
  id, workspace_id, user_id, media_id, source_document_id,
  source_document_storage_version, source_document_version_id, source_document_updated_at,
  status, reel_status, stories_status, reel_attempt_count, stories_attempt_count,
  reel_variant_id, stories_variant_id, reel_credit_status, stories_credit_status,
  reel_credit_idempotency_key, stories_credit_idempotency_key,
  reel_error_code, stories_error_code, created_at, updated_at, started_at, finished_at
`;

const normalize = (value: unknown): string => String(value ?? "").trim();

const mapPackRow = (row: PackRow): AfterMatchPackRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  userId: row.user_id,
  mediaId: row.media_id,
  sourceDocumentId: row.source_document_id,
  sourceDocumentStorageVersion: Number(row.source_document_storage_version),
  sourceDocumentVersionId: row.source_document_version_id,
  sourceDocumentUpdatedAt: row.source_document_updated_at,
  status: row.status,
  reelStatus: row.reel_status,
  storiesStatus: row.stories_status,
  reelAttemptCount: Number(row.reel_attempt_count),
  storiesAttemptCount: Number(row.stories_attempt_count),
  reelVariantId: row.reel_variant_id,
  storiesVariantId: row.stories_variant_id,
  reelCreditStatus: row.reel_credit_status,
  storiesCreditStatus: row.stories_credit_status,
  reelCreditIdempotencyKey: row.reel_credit_idempotency_key,
  storiesCreditIdempotencyKey: row.stories_credit_idempotency_key,
  reelErrorCode: row.reel_error_code,
  storiesErrorCode: row.stories_error_code,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

const getDeliverableState = (pack: AfterMatchPackRecord, deliverable: AfterMatchPackDeliverable) =>
  deliverable === "reel"
    ? {
        status: pack.reelStatus,
        attemptCount: pack.reelAttemptCount,
        creditStatus: pack.reelCreditStatus,
        creditIdempotencyKey: pack.reelCreditIdempotencyKey,
      }
    : {
        status: pack.storiesStatus,
        attemptCount: pack.storiesAttemptCount,
        creditStatus: pack.storiesCreditStatus,
        creditIdempotencyKey: pack.storiesCreditIdempotencyKey,
      };

export type ClaimDeliverableResult =
  | { status: "not_found" }
  | { status: "claimed"; pack: AfterMatchPackRecord }
  | { status: "completed"; pack: AfterMatchPackRecord }
  | { status: "in_progress"; pack: AfterMatchPackRecord }
  | { status: "needs_reconciliation"; pack: AfterMatchPackRecord };

export const AfterMatchPackRepository = {
  async createOrGet(input: {
    sourceDocumentId: string;
    sourceDocumentStorageVersion: number;
    sourceDocumentVersionId: string;
    sourceDocumentUpdatedAt: string;
  }, access: ContentAccessContext): Promise<AfterMatchPackRecord | null> {
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      INSERT INTO content_after_match_packs (
        id, workspace_id, user_id, media_id, source_document_id,
        source_document_storage_version, source_document_version_id, source_document_updated_at
      ) VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, $8::timestamptz)
      ON CONFLICT (workspace_id, source_document_id, source_document_storage_version) DO NOTHING
      RETURNING ${packColumns}
    `, [
      randomUUID(),
      access.workspaceId,
      access.clerkUserId,
      access.isAdmin ? null : access.mediaId ?? null,
      normalize(input.sourceDocumentId),
      input.sourceDocumentStorageVersion,
      normalize(input.sourceDocumentVersionId),
      input.sourceDocumentUpdatedAt,
    ])) as PackRow[];

    if (rows[0]) return mapPackRow(rows[0]);
    return this.getBySourceRevision(input.sourceDocumentId, input.sourceDocumentStorageVersion, access);
  },

  async getById(packId: string, access: ContentAccessContext): Promise<AfterMatchPackRecord | null> {
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      SELECT ${packColumns}
      FROM content_after_match_packs
      WHERE workspace_id = $1
        AND id = $2::uuid
        AND user_id = $3
        AND ($4::boolean OR media_id = $5::uuid)
      LIMIT 1
    `, [access.workspaceId, normalize(packId), access.clerkUserId, access.isAdmin, access.mediaId ?? null])) as PackRow[];

    return rows[0] ? mapPackRow(rows[0]) : null;
  },

  async getBySourceRevision(
    sourceDocumentId: string,
    sourceDocumentStorageVersion: number,
    access: ContentAccessContext
  ): Promise<AfterMatchPackRecord | null> {
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      SELECT ${packColumns}
      FROM content_after_match_packs
      WHERE workspace_id = $1
        AND source_document_id = $2
        AND source_document_storage_version = $3
        AND user_id = $4
        AND ($5::boolean OR media_id = $6::uuid)
      LIMIT 1
    `, [
      access.workspaceId,
      normalize(sourceDocumentId),
      sourceDocumentStorageVersion,
      access.clerkUserId,
      access.isAdmin,
      access.mediaId ?? null,
    ])) as PackRow[];

    return rows[0] ? mapPackRow(rows[0]) : null;
  },

  async claimDeliverable(
    packId: string,
    deliverable: AfterMatchPackDeliverable,
    staleBefore: string,
    access: ContentAccessContext
  ): Promise<ClaimDeliverableResult> {
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      WITH locked AS (
        SELECT *
        FROM content_after_match_packs
        WHERE workspace_id = $1
          AND id = $2::uuid
          AND user_id = $3
          AND ($4::boolean OR media_id = $5::uuid)
        FOR UPDATE
      ), updated AS (
        UPDATE content_after_match_packs AS pack
        SET
          reel_status = CASE WHEN $6 = 'reel' THEN 'generating' ELSE pack.reel_status END,
          stories_status = CASE WHEN $6 = 'stories' THEN 'generating' ELSE pack.stories_status END,
          reel_attempt_count = CASE WHEN $6 = 'reel' THEN pack.reel_attempt_count + 1 ELSE pack.reel_attempt_count END,
          stories_attempt_count = CASE WHEN $6 = 'stories' THEN pack.stories_attempt_count + 1 ELSE pack.stories_attempt_count END,
          reel_credit_status = CASE WHEN $6 = 'reel' THEN CASE WHEN $4::boolean THEN 'not_required' ELSE 'not_consumed' END ELSE pack.reel_credit_status END,
          stories_credit_status = CASE WHEN $6 = 'stories' THEN CASE WHEN $4::boolean THEN 'not_required' ELSE 'not_consumed' END ELSE pack.stories_credit_status END,
          reel_credit_idempotency_key = CASE WHEN $6 = 'reel' THEN CONCAT('content:after_match_pack:', pack.id, ':reel:attempt:', pack.reel_attempt_count + 1) ELSE pack.reel_credit_idempotency_key END,
          stories_credit_idempotency_key = CASE WHEN $6 = 'stories' THEN CONCAT('content:after_match_pack:', pack.id, ':stories:attempt:', pack.stories_attempt_count + 1) ELSE pack.stories_credit_idempotency_key END,
          reel_error_code = CASE WHEN $6 = 'reel' THEN NULL ELSE pack.reel_error_code END,
          stories_error_code = CASE WHEN $6 = 'stories' THEN NULL ELSE pack.stories_error_code END,
          status = 'generating',
          updated_at = NOW(),
          started_at = NOW(),
          finished_at = NULL
        FROM locked
        WHERE pack.id = locked.id
          AND (
            ($6 = 'reel' AND locked.reel_status IN ('pending', 'failed') AND locked.reel_credit_status IN ('pending', 'not_required', 'not_consumed', 'refunded'))
            OR ($6 = 'stories' AND locked.stories_status IN ('pending', 'failed') AND locked.stories_credit_status IN ('pending', 'not_required', 'not_consumed', 'refunded'))
          )
        RETURNING pack.*, TRUE AS claimed
      )
      SELECT * FROM updated
      UNION ALL
      SELECT locked.*, FALSE AS claimed FROM locked WHERE NOT EXISTS (SELECT 1 FROM updated)
    `, [
      access.workspaceId,
      normalize(packId),
      access.clerkUserId,
      access.isAdmin,
      access.mediaId ?? null,
      deliverable,
    ])) as PackRow[];

    if (!rows[0]) return { status: "not_found" };
    const pack = mapPackRow(rows[0]);
    if (rows[0].claimed) return { status: "claimed", pack };

    const state = getDeliverableState(pack, deliverable);
    if (state.status === "completed") return { status: "completed", pack };
    const isStale = pack.startedAt !== null && Date.parse(pack.startedAt) <= Date.parse(staleBefore);
    if ((state.status === "generating" && isStale) || state.creditStatus === "refund_pending") {
      return { status: "needs_reconciliation", pack };
    }
    return { status: "in_progress", pack };
  },

  async markCreditConsumed(args: {
    packId: string;
    deliverable: AfterMatchPackDeliverable;
    attemptCount: number;
    creditIdempotencyKey: string;
    access: ContentAccessContext;
  }): Promise<AfterMatchPackRecord | null> {
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      UPDATE content_after_match_packs
      SET
        reel_credit_status = CASE WHEN $4 = 'reel' THEN 'consumed' ELSE reel_credit_status END,
        stories_credit_status = CASE WHEN $4 = 'stories' THEN 'consumed' ELSE stories_credit_status END,
        updated_at = NOW()
      WHERE workspace_id = $1
        AND id = $2::uuid
        AND user_id = $3
        AND ($5::boolean OR media_id = $6::uuid)
        AND (($4 = 'reel' AND reel_status = 'generating' AND reel_attempt_count = $7 AND reel_credit_idempotency_key = $8)
          OR ($4 = 'stories' AND stories_status = 'generating' AND stories_attempt_count = $7 AND stories_credit_idempotency_key = $8))
      RETURNING ${packColumns}
    `, [
      args.access.workspaceId,
      normalize(args.packId),
      args.access.clerkUserId,
      args.deliverable,
      args.access.isAdmin,
      args.access.mediaId ?? null,
      args.attemptCount,
      args.creditIdempotencyKey,
    ])) as PackRow[];

    return rows[0] ? mapPackRow(rows[0]) : null;
  },

  async completeDeliverableWithVariant(args: {
    packId: string;
    deliverable: AfterMatchPackDeliverable;
    attemptCount: number;
    creditIdempotencyKey: string;
    variant: ContentVariant;
    access: ContentAccessContext;
  }): Promise<AfterMatchPackRecord | null> {
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      WITH locked AS (
        SELECT *
        FROM content_after_match_packs
        WHERE workspace_id = $1
          AND id = $2::uuid
          AND user_id = $3
          AND ($4::boolean OR media_id = $5::uuid)
          AND (($6 = 'reel' AND reel_status = 'generating' AND reel_attempt_count = $7 AND reel_credit_idempotency_key = $8)
            OR ($6 = 'stories' AND stories_status = 'generating' AND stories_attempt_count = $7 AND stories_credit_idempotency_key = $8))
          AND (($6 = 'reel' AND reel_credit_status IN ('not_required', 'consumed'))
            OR ($6 = 'stories' AND stories_credit_status IN ('not_required', 'consumed')))
        FOR UPDATE
      ), inserted_variant AS (
        INSERT INTO content_variants (
          id, source_document_id, workspace_id, user_id, media_id, created_at, updated_at, payload_json
        )
        SELECT $9, $10, $1, $3, CASE WHEN $4::boolean THEN NULL ELSE $5::uuid END, $11::timestamptz, $12::timestamptz, $13::jsonb
        FROM locked
        RETURNING id
      ), updated AS (
        UPDATE content_after_match_packs AS pack
        SET
          reel_status = CASE WHEN $6 = 'reel' THEN 'completed' ELSE pack.reel_status END,
          stories_status = CASE WHEN $6 = 'stories' THEN 'completed' ELSE pack.stories_status END,
          reel_variant_id = CASE WHEN $6 = 'reel' THEN $9 ELSE pack.reel_variant_id END,
          stories_variant_id = CASE WHEN $6 = 'stories' THEN $9 ELSE pack.stories_variant_id END,
          status = CASE
            WHEN ($6 = 'reel' AND pack.stories_status = 'completed') OR ($6 = 'stories' AND pack.reel_status = 'completed') THEN 'completed'
            WHEN ($6 = 'reel' AND pack.stories_status = 'failed') OR ($6 = 'stories' AND pack.reel_status = 'failed') THEN 'partial'
            ELSE 'generating'
          END,
          updated_at = NOW(),
          finished_at = CASE
            WHEN ($6 = 'reel' AND pack.stories_status IN ('completed', 'failed')) OR ($6 = 'stories' AND pack.reel_status IN ('completed', 'failed')) THEN NOW()
            ELSE NULL
          END
        FROM locked, inserted_variant
        WHERE pack.id = locked.id
        RETURNING pack.*
      )
      SELECT * FROM updated
    `, [
      args.access.workspaceId,
      normalize(args.packId),
      args.access.clerkUserId,
      args.access.isAdmin,
      args.access.mediaId ?? null,
      args.deliverable,
      args.attemptCount,
      args.creditIdempotencyKey,
      normalize(args.variant.id),
      normalize(args.variant.sourceDocumentId),
      args.variant.createdAt,
      args.variant.updatedAt,
      JSON.stringify(args.variant),
    ])) as PackRow[];

    return rows[0] ? mapPackRow(rows[0]) : null;
  },

  async failDeliverable(args: {
    packId: string;
    deliverable: AfterMatchPackDeliverable;
    attemptCount: number;
    creditIdempotencyKey: string;
    errorCode: string;
    creditStatus: "not_required" | "not_consumed" | "refund_pending" | "refunded";
    staleBefore?: string;
    access: ContentAccessContext;
  }): Promise<AfterMatchPackRecord | null> {
    const errorCode = normalize(args.errorCode);
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(errorCode)) {
      throw new Error("Code d erreur After-match non securise.");
    }

    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      WITH locked AS (
        SELECT *
        FROM content_after_match_packs
        WHERE workspace_id = $1
          AND id = $2::uuid
          AND user_id = $3
          AND ($4::boolean OR media_id = $5::uuid)
          AND (($6 = 'reel' AND reel_status = 'generating' AND reel_attempt_count = $7 AND reel_credit_idempotency_key = $8)
            OR ($6 = 'stories' AND stories_status = 'generating' AND stories_attempt_count = $7 AND stories_credit_idempotency_key = $8))
          AND ($11::timestamptz IS NULL OR started_at <= $11::timestamptz)
        FOR UPDATE
      )
      UPDATE content_after_match_packs AS pack
      SET
        reel_status = CASE WHEN $6 = 'reel' THEN 'failed' ELSE pack.reel_status END,
        stories_status = CASE WHEN $6 = 'stories' THEN 'failed' ELSE pack.stories_status END,
        reel_credit_status = CASE WHEN $6 = 'reel' THEN $9 ELSE pack.reel_credit_status END,
        stories_credit_status = CASE WHEN $6 = 'stories' THEN $9 ELSE pack.stories_credit_status END,
        reel_error_code = CASE WHEN $6 = 'reel' THEN $10 ELSE pack.reel_error_code END,
        stories_error_code = CASE WHEN $6 = 'stories' THEN $10 ELSE pack.stories_error_code END,
        status = CASE
          WHEN ($6 = 'reel' AND pack.stories_status = 'completed') OR ($6 = 'stories' AND pack.reel_status = 'completed') THEN 'partial'
          WHEN ($6 = 'reel' AND pack.stories_status = 'failed') OR ($6 = 'stories' AND pack.reel_status = 'failed') THEN 'failed'
          ELSE 'generating'
        END,
        updated_at = NOW(),
        finished_at = CASE
          WHEN ($6 = 'reel' AND pack.stories_status IN ('completed', 'failed')) OR ($6 = 'stories' AND pack.reel_status IN ('completed', 'failed')) THEN NOW()
          ELSE NULL
        END
      FROM locked
      WHERE pack.id = locked.id
      RETURNING pack.*
    `, [
      args.access.workspaceId,
      normalize(args.packId),
      args.access.clerkUserId,
      args.access.isAdmin,
      args.access.mediaId ?? null,
      args.deliverable,
      args.attemptCount,
      args.creditIdempotencyKey,
      args.creditStatus,
      errorCode,
      args.staleBefore ?? null,
    ])) as PackRow[];

    return rows[0] ? mapPackRow(rows[0]) : null;
  },

  async markCreditRefunded(args: {
    packId: string;
    deliverable: AfterMatchPackDeliverable;
    creditIdempotencyKey: string;
    access: ContentAccessContext;
  }): Promise<AfterMatchPackRecord | null> {
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      UPDATE content_after_match_packs
      SET
        reel_credit_status = CASE WHEN $4 = 'reel' THEN 'refunded' ELSE reel_credit_status END,
        stories_credit_status = CASE WHEN $4 = 'stories' THEN 'refunded' ELSE stories_credit_status END,
        updated_at = NOW()
      WHERE workspace_id = $1
        AND id = $2::uuid
        AND user_id = $3
        AND ($5::boolean OR media_id = $6::uuid)
        AND (($4 = 'reel' AND reel_credit_status = 'refund_pending' AND reel_credit_idempotency_key = $7)
          OR ($4 = 'stories' AND stories_credit_status = 'refund_pending' AND stories_credit_idempotency_key = $7))
      RETURNING ${packColumns}
    `, [
      args.access.workspaceId,
      normalize(args.packId),
      args.access.clerkUserId,
      args.deliverable,
      args.access.isAdmin,
      args.access.mediaId ?? null,
      args.creditIdempotencyKey,
    ])) as PackRow[];

    return rows[0] ? mapPackRow(rows[0]) : null;
  },
};