import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listDrafts } from "@/app/api/contents/article-drafts/route";
import { PATCH as updateDraft } from "@/app/api/contents/article-drafts/[draftId]/route";
import { createInitialAssistantDraft } from "@/services/content-creation-assistant";
import type { ArticleCreationDraftPayload } from "@/types/article-creation-draft";

const mocks = vi.hoisted(() => ({
  requireContentAccess: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/content-storage/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/content-storage/access")>();
  return {
    ...actual,
    requireContentAccess: mocks.requireContentAccess,
  };
});

vi.mock("@/lib/article-creation-drafts/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/article-creation-drafts/repository")>();
  return {
    ...actual,
    ArticleCreationDraftRepository: {
      ...actual.ArticleCreationDraftRepository,
      list: mocks.list,
      update: mocks.update,
    },
  };
});

const access = {
  workspaceId: "workspace-1",
  clerkUserId: "user-1",
  role: "admin" as const,
  isAdmin: true,
  mediaId: null,
};
const draftId = "22222222-2222-4222-8222-222222222222";
const makePayload = (): ArticleCreationDraftPayload => {
  const draft = createInitialAssistantDraft({ mode: "free", objective: "article" });
  draft.subject = {
    ...draft.subject,
    type: "free_topic",
    source: "temporary",
    displayName: "Alex Exemple",
  };
  return {
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
};

describe("Article creation draft routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireContentAccess.mockResolvedValue(access);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not authenticate or query storage while the feature is disabled", async () => {
    vi.stubEnv("KLIQUE_ARTICLE_CREATION_DRAFTS_ENABLED", "false");

    const response = await listDrafts(new Request("http://localhost/api/contents/article-drafts"));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "ARTICLE_DRAFTS_DISABLED" });
    expect(mocks.requireContentAccess).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("reports an enabled feature with a missing table explicitly and privately", async () => {
    vi.stubEnv("KLIQUE_ARTICLE_CREATION_DRAFTS_ENABLED", "true");
    mocks.list.mockRejectedValue({
      code: "42P01",
      message: 'relation "article_creation_drafts" does not exist',
    });

    const response = await listDrafts(new Request("http://localhost/api/contents/article-drafts"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toEqual({
      ok: false,
      code: "ARTICLE_DRAFT_SCHEMA_MISSING",
      message: "La sauvegarde des brouillons Article est activee, mais son schema de stockage est absent.",
    });
  });

  it("lists summaries without exposing private draft content", async () => {
    vi.stubEnv("KLIQUE_ARTICLE_CREATION_DRAFTS_ENABLED", "true");
    mocks.list.mockResolvedValue([{
      id: draftId,
      displayTitle: "Alex Exemple — Portrait",
      subjectName: "Alex Exemple",
      stepId: "angle",
      version: 3,
      createdAt: "2026-10-21T12:00:00.000Z",
      updatedAt: "2026-10-21T12:30:00.000Z",
    }]);

    const response = await listDrafts(new Request("http://localhost/api/contents/article-drafts"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.drafts).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("sourceText");
    expect(JSON.stringify(body)).not.toContain("transcription");
  });

  it("returns a version conflict without returning the private payload", async () => {
    vi.stubEnv("KLIQUE_ARTICLE_CREATION_DRAFTS_ENABLED", "true");
    mocks.update.mockResolvedValue({ status: "version_conflict", currentVersion: 7 });
    const request = new Request(`http://localhost/api/contents/article-drafts/${draftId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 6,
        displayTitle: "Alex Exemple — Portrait",
        payload: makePayload(),
      }),
    });

    const response = await updateDraft(request, { params: Promise.resolve({ draftId }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: "ARTICLE_DRAFT_VERSION_CONFLICT",
      currentVersion: 7,
    });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(JSON.stringify(body)).not.toContain("sourceText");
  });
});
