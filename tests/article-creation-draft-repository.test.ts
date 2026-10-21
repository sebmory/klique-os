import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { createInitialAssistantDraft } from "@/services/content-creation-assistant";
import type { ArticleCreationDraftPayload } from "@/types/article-creation-draft";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: mocks.createClient,
}));

import { ArticleCreationDraftRepository } from "@/lib/article-creation-drafts/repository";

const access: ContentAccessContext = {
  workspaceId: "workspace-1",
  clerkUserId: "user-1",
  role: "admin",
  isAdmin: true,
  mediaId: null,
};

const draft = createInitialAssistantDraft({ mode: "free", objective: "article" });
draft.subject = {
  ...draft.subject,
  type: "free_topic",
  source: "temporary",
  displayName: "Alex Exemple",
};
const payload: ArticleCreationDraftPayload = {
  schemaVersion: 1,
  contextKey: "article:alex",
  draft,
  stepId: "angle",
  contextState: { items: [], reports: [], hasCollected: false },
  articleWorkflow: {
    suggestions: [],
    structures: [],
    selectedStructureId: "",
    choicesNeedReview: false,
  },
};
const row = {
  id: "22222222-2222-4222-8222-222222222222",
  client_creation_id: "11111111-1111-4111-8111-111111111111",
  display_title: "Alex Exemple — Portrait",
  subject_name: "Alex Exemple",
  step_id: "angle",
  payload_json: payload,
  version: 1,
  created_at: new Date("2026-10-21T12:00:00.000Z"),
  updated_at: new Date("2026-10-21T12:00:00.000Z"),
  deleted_at: null,
};

const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("ArticleCreationDraftRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockReturnValue({ query: mocks.query });
  });

  it("lists summaries without selecting the private payload", async () => {
    mocks.query.mockResolvedValueOnce([row]);

    const summaries = await ArticleCreationDraftRepository.list(access);
    const [query] = mocks.query.mock.calls[0] as [string, unknown[]];
    const normalized = normalizeSql(query);

    expect(normalized).toContain("subject_name");
    expect(normalized).toContain("step_id");
    expect(normalized).not.toContain("payload_json");
    expect(summaries[0]).toMatchObject({
      subjectName: "Alex Exemple",
      stepId: "angle",
    });
  });

  it("isolates even administrators by exact workspace, user, role and media owner", async () => {
    mocks.query.mockResolvedValueOnce([row]);

    await ArticleCreationDraftRepository.getById(row.id, access);
    const [query, values] = mocks.query.mock.calls[0] as [string, unknown[]];
    const normalized = normalizeSql(query);

    expect(normalized).toContain("workspace_id = $2");
    expect(normalized).toContain("clerk_user_id = $3");
    expect(normalized).toContain("role = $4");
    expect(normalized).toContain("media_id IS NOT DISTINCT FROM $5::uuid");
    expect(normalized).not.toContain("OR media_id");
    expect(values).toEqual([row.id, access.workspaceId, access.clerkUserId, access.role, null]);
  });

  it("reuses a client creation id after a repeated network request", async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);

    const result = await ArticleCreationDraftRepository.createOrGet({
      clientCreationId: row.client_creation_id,
      displayTitle: row.display_title,
      payload,
    }, access);
    const [insertQuery] = mocks.query.mock.calls[0] as [string, unknown[]];

    expect(normalizeSql(insertQuery)).toContain(
      "ON CONFLICT (workspace_id, clerk_user_id, client_creation_id) DO NOTHING",
    );
    expect(result?.id).toBe(row.id);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("uses one atomic expected-version update and reports a conflict", async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...row, version: 2 }]);

    const result = await ArticleCreationDraftRepository.update(row.id, {
      expectedVersion: 1,
      displayTitle: row.display_title,
      payload,
    }, access);
    const [query] = mocks.query.mock.calls[0] as [string, unknown[]];
    const normalized = normalizeSql(query);

    expect(normalized).toContain("version = $5 + 1");
    expect(normalized).toContain("AND version = $5");
    expect(normalized).toContain("deleted_at IS NULL");
    expect(result).toEqual({ status: "version_conflict", currentVersion: 2 });
  });

  it("clears private content and tombstones a deleted draft", async () => {
    mocks.query.mockResolvedValueOnce([{ id: row.id }]);

    expect(await ArticleCreationDraftRepository.remove(row.id, access)).toBe(true);
    const [query] = mocks.query.mock.calls[0] as [string, unknown[]];
    const normalized = normalizeSql(query);

    expect(normalized).toContain("payload_json = '{}'::jsonb");
    expect(normalized).toContain("subject_name = 'Sujet supprime'");
    expect(normalized).toContain("deleted_at = NOW()");
    expect(normalized).toContain("clerk_user_id = $3");
  });
});
