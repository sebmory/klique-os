import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import type { ContentVariant } from "@/types/content-variant";

const { sqlMock, createContentStorageClientMock } = vi.hoisted(() => ({
  sqlMock: Object.assign(vi.fn(), { query: vi.fn() }),
  createContentStorageClientMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
}));

import { AfterMatchPackRepository } from "@/lib/content-after-match-packs/repository";

const access: ContentAccessContext = {
  clerkUserId: "user-1",
  workspaceId: "workspace-1",
  mediaId: "11111111-1111-4111-8111-111111111111",
  role: "media",
  isAdmin: false,
};

const row = {
  id: "22222222-2222-4222-8222-222222222222",
  workspace_id: access.workspaceId,
  user_id: access.clerkUserId,
  media_id: access.mediaId,
  source_document_id: "publication-1",
  source_document_storage_version: 3,
  source_document_version_id: "version-2",
  source_document_updated_at: "2026-09-27T10:00:00.000Z",
  status: "generating",
  reel_status: "generating",
  stories_status: "pending",
  reel_attempt_count: 1,
  stories_attempt_count: 0,
  reel_variant_id: null,
  stories_variant_id: null,
  reel_credit_status: "not_consumed",
  stories_credit_status: "pending",
  reel_credit_idempotency_key: "content:after_match_pack:22222222-2222-4222-8222-222222222222:reel:attempt:1",
  stories_credit_idempotency_key: null,
  reel_error_code: null,
  stories_error_code: null,
  created_at: "2026-09-27T12:00:00.000Z",
  updated_at: "2026-09-27T12:00:00.000Z",
  started_at: "2026-09-27T12:00:00.000Z",
  finished_at: null,
};

const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("AfterMatchPackRepository SQL contracts", () => {
  beforeEach(() => {
    sqlMock.query.mockReset();
    createContentStorageClientMock.mockReset();
    createContentStorageClientMock.mockReturnValue(sqlMock);
  });

  it("reads by source revision with workspace, user and media isolation", async () => {
    sqlMock.query.mockResolvedValueOnce([row]);

    const result = await AfterMatchPackRepository.getBySourceRevision(
      row.source_document_id,
      row.source_document_storage_version,
      access
    );
    const [query, values] = sqlMock.query.mock.calls[0] as [string, unknown[]];
    const normalized = normalizeSql(query);

    expect(result?.id).toBe(row.id);
    expect(normalized).toContain("workspace_id = $1");
    expect(normalized).toContain("source_document_id = $2");
    expect(normalized).toContain("source_document_storage_version = $3");
    expect(normalized).toContain("user_id = $4");
    expect(normalized).toContain("media_id = $6::uuid");
    expect(values).toEqual([
      access.workspaceId,
      row.source_document_id,
      row.source_document_storage_version,
      access.clerkUserId,
      false,
      access.mediaId,
    ]);
  });

  it("claims a deliverable under FOR UPDATE with workspace, user and media predicates", async () => {
    sqlMock.query.mockResolvedValueOnce([{ ...row, claimed: true }]);

    const result = await AfterMatchPackRepository.claimDeliverable(
      row.id,
      "reel",
      "2026-09-27T11:50:00.000Z",
      access
    );
    const [query, values] = sqlMock.query.mock.calls[0] as [string, unknown[]];
    const normalized = normalizeSql(query);

    expect(result.status).toBe("claimed");
    expect(normalized).toContain("FOR UPDATE");
    expect(normalized).toContain("workspace_id = $1");
    expect(normalized).toContain("user_id = $3");
    expect(normalized).toContain("media_id = $5::uuid");
    expect(values).toContain(access.workspaceId);
    expect(values).toContain(access.clerkUserId);
    expect(values).toContain(access.mediaId);
  });

  it("increments the attempt and derives its stable credit key in the locked statement", async () => {
    sqlMock.query.mockResolvedValueOnce([{ ...row, claimed: true }]);
    await AfterMatchPackRepository.claimDeliverable(row.id, "reel", "2026-09-27T11:50:00.000Z", access);

    const [query] = sqlMock.query.mock.calls[0] as [string, unknown[]];
    const normalized = normalizeSql(query);
    expect(normalized).toContain("reel_attempt_count + 1");
    expect(normalized).toContain("content:after_match_pack:");
    expect(normalized).toContain(":reel:attempt:");
  });

  it("persists the variant and completes the claimed deliverable atomically", async () => {
    sqlMock.query.mockResolvedValueOnce([{ ...row, reel_status: "completed", reel_variant_id: "variant-1" }]);
    const variant = {
      id: "variant-1",
      sourceDocumentId: row.source_document_id,
      createdAt: row.updated_at,
      updatedAt: row.updated_at,
    } as unknown as ContentVariant;

    await AfterMatchPackRepository.completeDeliverableWithVariant({
      packId: row.id,
      deliverable: "reel",
      attemptCount: 1,
      creditIdempotencyKey: row.reel_credit_idempotency_key,
      variant,
      access,
    });

    const [query] = sqlMock.query.mock.calls[0] as [string, unknown[]];
    const normalized = normalizeSql(query);
    expect(normalized).toContain("WITH locked AS");
    expect(normalized).toContain("FOR UPDATE");
    expect(normalized).toContain("INSERT INTO content_variants");
    expect(normalized).toContain("UPDATE content_after_match_packs");
    expect(normalized).toContain("reel_credit_status IN ('not_required', 'consumed')");
    expect(sqlMock.query).toHaveBeenCalledTimes(1);
  });
});