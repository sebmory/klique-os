import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import type { StoryStudioProjectPayload } from "@/types/story-studio";

const { sqlMock, createContentStorageClientMock } = vi.hoisted(() => ({
  sqlMock: Object.assign(vi.fn(), { query: vi.fn() }),
  createContentStorageClientMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({ createContentStorageClient: createContentStorageClientMock }));

import { StoryStudioProjectRepository } from "@/lib/story-studio/repository";

const access: ContentAccessContext = {
  clerkUserId: "user-1",
  workspaceId: "workspace-1",
  mediaId: "11111111-1111-4111-8111-111111111111",
  role: "media",
  isAdmin: false,
};

const frame = (order: 1 | 2 | 3 | 4, role: "result" | "context" | "poll" | "question") => ({
  id: `frame-${order}`,
  order,
  role,
  sourceStoryIndex: order,
  text: { eyebrow: "Apres-match", headline: `Frame ${order}`, body: "Texte", interaction: "" },
  photo: { assetId: null, visible: true, scale: 1, x: 0, y: 0 },
  elements: { athleteName: true, score: true, competition: true, logo: false, signature: true, interactionZone: order > 2 },
});

const payload: StoryStudioProjectPayload = {
  schemaVersion: 1,
  templateKey: "editorial_klique",
  frames: [frame(1, "result"), frame(2, "context"), frame(3, "poll"), frame(4, "question")],
};

const row = {
  id: "22222222-2222-4222-8222-222222222222",
  workspace_id: access.workspaceId,
  user_id: access.clerkUserId,
  media_id: access.mediaId,
  source_pack_id: "33333333-3333-4333-8333-333333333333",
  source_stories_variant_id: "variant-stories-1",
  source_document_id: "publication-1",
  athlete_id: null,
  project_type: "after_match",
  template_key: payload.templateKey,
  status: "draft",
  payload_json: payload,
  version: 1,
  created_at: new Date("2026-09-28T10:00:00.123Z"),
  updated_at: new Date("2026-09-28T10:00:00.123Z"),
};

const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("StoryStudioProjectRepository", () => {
  beforeEach(() => {
    sqlMock.query.mockReset();
    createContentStorageClientMock.mockReset();
    createContentStorageClientMock.mockReturnValue(sqlMock);
  });

  it("creates one isolated project and maps Neon timestamps", async () => {
    sqlMock.query.mockResolvedValueOnce([row]);

    const project = await StoryStudioProjectRepository.createOrGet({
      sourcePackId: row.source_pack_id,
      sourceStoriesVariantId: row.source_stories_variant_id,
      sourceDocumentId: row.source_document_id,
      athleteId: null,
      payload,
    }, access);
    const [query, values] = sqlMock.query.mock.calls[0] as [string, unknown[]];

    expect(normalizeSql(query)).toContain("ON CONFLICT (workspace_id, source_stories_variant_id) DO NOTHING");
    expect(values).toContain(access.workspaceId);
    expect(values).toContain(access.clerkUserId);
    expect(values).toContain(access.mediaId);
    expect(project).toMatchObject({
      sourceStoriesVariantId: row.source_stories_variant_id,
      athleteId: null,
      version: 1,
      createdAt: "2026-09-28T10:00:00.123Z",
    });
  });

  it("re-reads the existing project after an idempotent conflict", async () => {
    sqlMock.query.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);

    const project = await StoryStudioProjectRepository.createOrGet({
      sourcePackId: row.source_pack_id,
      sourceStoriesVariantId: row.source_stories_variant_id,
      sourceDocumentId: row.source_document_id,
      athleteId: null,
      payload,
    }, access);
    const [query, values] = sqlMock.query.mock.calls[1] as [string, unknown[]];

    expect(project?.id).toBe(row.id);
    expect(normalizeSql(query)).toContain("source_stories_variant_id = $2");
    expect(normalizeSql(query)).toContain("user_id = $3");
    expect(normalizeSql(query)).toContain("OR media_id = $5::uuid");
    expect(values).toEqual([access.workspaceId, row.source_stories_variant_id, access.clerkUserId, false, access.mediaId]);
  });

  it("isolates reads by workspace, user and media", async () => {
    sqlMock.query.mockResolvedValueOnce([row]);

    await StoryStudioProjectRepository.getById(row.id, access);
    const [query, values] = sqlMock.query.mock.calls[0] as [string, unknown[]];
    const normalized = normalizeSql(query);

    expect(normalized).toContain("workspace_id = $1");
    expect(normalized).toContain("user_id = $3");
    expect(normalized).toContain("OR media_id = $5::uuid");
    expect(values).toEqual([access.workspaceId, row.id, access.clerkUserId, false, access.mediaId]);
  });

  it("returns the current project on a version conflict", async () => {
    sqlMock.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...row, version: 2 }]);

    const result = await StoryStudioProjectRepository.update({
      projectId: row.id,
      expectedVersion: 1,
      athleteId: null,
      status: "draft",
      payload,
    }, access);
    const [updateQuery] = sqlMock.query.mock.calls[0] as [string, unknown[]];

    expect(normalizeSql(updateQuery)).toContain("version = $5 + 1");
    expect(normalizeSql(updateQuery)).toContain("AND version = $5");
    expect(result).toMatchObject({ status: "version_conflict", currentVersion: 2 });
  });
});