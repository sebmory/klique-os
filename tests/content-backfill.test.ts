import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runContentsBackfill } from "@/services/content-backfill";
import type { ContentDocument } from "@/types/content-document";
import type { ContentVariant } from "@/types/content-variant";

class MemoryStorage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const createResponse = (body: unknown, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

const baseDocument: ContentDocument = {
  id: "document-1",
  type: "interview",
  status: "draft",
  createdAt: "2026-08-08T10:00:00.000Z",
  updatedAt: "2026-08-08T10:00:00.000Z",
  versions: [
    { id: "version-1", createdAt: "2026-08-08T10:00:00.000Z", label: "Version initiale", source: "generation" },
  ],
  activeVersionId: "version-1",
  sidebar: {
    subject: "Alpha Martin",
    source: "crm",
    objective: "portrait",
    tone: "authentic",
    audience: "general",
    format: "written",
    templateVersion: "v1",
    provider: "openai",
    model: "gpt",
    generatedAt: "2026-08-08T10:00:00.000Z",
  },
  metadata: {
    provider: "openai",
    model: "gpt",
    templateId: "interview",
    templateKey: "interview:v1",
    templateVersion: "1",
    promptVersion: "1",
    generatedAt: "2026-08-08T10:00:00.000Z",
    generationDurationMs: 10,
    questionCountRequested: 5,
    questionCountGenerated: 5,
    reliabilityNotes: [],
    missingInformation: [],
    externalContextUsed: false,
  },
  contextUsage: {
    usedContextItemIds: [],
    usedSourceIds: [],
    unusedSelectedContextItemIds: [],
    externalContextUsed: false,
    selectedItems: [],
  },
  sections: {
    title: "Titre",
    editorialAngle: "Angle",
    introduction: "Intro",
    questions: [
      {
        id: "q1",
        text: "Question ?",
        purpose: "Purpose",
        topic: "Topic",
        followUps: [],
        locked: false,
        privateNotes: "Note privee",
      },
    ],
    conclusion: "Conclusion",
  },
};

const baseVariant: ContentVariant = {
  id: "variant-1",
  sourceDocumentId: "document-1",
  sourceDocumentType: "interview",
  sourceDocumentVersionId: "version-1",
  sourceDocumentUpdatedAt: "2026-08-08T10:00:00.000Z",
  type: "publication",
  format: "instagram",
  platform: "instagram",
  objective: "inform",
  tone: "authentic",
  audience: "general",
  title: "Variant title",
  content: "Content",
  structuredContent: {
    angle: "Angle",
    hook: "Hook",
    body: "Body",
    callToAction: "CTA",
    hashtags: ["#tag"],
    visualIdea: "Visual",
  },
  status: "draft",
  generationMetadata: {
    provider: "openai",
    model: "gpt",
    generatedAt: "2026-08-08T10:00:00.000Z",
    generationDurationMs: 1,
    promptVersion: "1",
    variationTemplateVersion: "1",
    sourceDocumentVersionId: "version-1",
    sourceDocumentUpdatedAt: "2026-08-08T10:00:00.000Z",
    usedContextItemIds: [],
  },
  createdAt: "2026-08-08T10:00:00.000Z",
  updatedAt: "2026-08-08T10:00:00.000Z",
};

const baseSession = {
  payload: { step: "summary" },
  request: { requestType: "interview" },
  result: { title: "Result" },
  createdAt: "2026-08-08T12:00:00.000Z",
  sessionId: "content-session-fixed",
};

describe("content backfill", () => {
  let localStorage: MemoryStorage;
  let sessionStorage: MemoryStorage;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage = new MemoryStorage();
    sessionStorage = new MemoryStorage();
    fetchMock = vi.fn();
    vi.stubGlobal("window", { localStorage, sessionStorage });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a missing draft in cloud", async () => {
    localStorage.setItem("klique.contents.document-editor.draft.v1:document-1", JSON.stringify(baseDocument));
    fetchMock
      .mockResolvedValueOnce(createResponse({ ok: false, message: "Brouillon introuvable." }, 404))
      .mockResolvedValueOnce(createResponse({ ok: true, version: 1, document: baseDocument }, 201));

    const result = await runContentsBackfill();

    expect(result.draftsCreated).toBe(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/contents/storage/drafts/document-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/contents/storage/drafts", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(localStorage.getItem("klique.contents.backfill.v1") as string)).toMatchObject({
      version: 1,
      drafts: { "document-1": expect.any(String) },
    });
  });

  it("does not overwrite an already present cloud draft", async () => {
    localStorage.setItem("klique.contents.document-editor.draft.v1:document-1", JSON.stringify(baseDocument));
    fetchMock.mockResolvedValueOnce(createResponse({ ok: true, version: 3, document: baseDocument }));

    const result = await runContentsBackfill();

    expect(result.draftsCreated).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/contents/storage/drafts", expect.anything());
  });

  it("creates a missing variant in cloud and ignores duplicate local ids", async () => {
    const duplicated = [{ ...baseVariant }, { ...baseVariant, title: "Duplicate title" }];
    localStorage.setItem("klique.contents.variants.v1", JSON.stringify(duplicated));
    fetchMock
      .mockResolvedValueOnce(createResponse({ ok: false, message: "Variante introuvable." }, 404))
      .mockResolvedValueOnce(createResponse({ ok: true, variant: baseVariant }, 201));

    const result = await runContentsBackfill();

    expect(result.variantsCreated).toBe(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/contents/storage/variants/variant-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/contents/storage/variants", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(localStorage.getItem("klique.contents.backfill.v1") as string)).toMatchObject({
      variants: { "variant-1": expect.any(String) },
    });
  });

  it("keeps local data and retries when the cloud is unavailable", async () => {
    localStorage.setItem("klique.contents.variants.v1", JSON.stringify([baseVariant]));
    fetchMock.mockRejectedValue(new Error("Network down"));

    const first = await runContentsBackfill();
    const second = await runContentsBackfill();

    expect(first.failures).toBeGreaterThan(0);
    expect(second.failures).toBeGreaterThan(0);
    expect(localStorage.getItem("klique.contents.variants.v1")).not.toBeNull();
  });

  it("creates a session cloud record and stores the success marker", async () => {
    sessionStorage.setItem("klique.contents.creation-assistant.interview-result.v1", JSON.stringify(baseSession));
    fetchMock
      .mockResolvedValueOnce(createResponse({ ok: false, message: "Session introuvable." }, 404))
      .mockResolvedValueOnce(createResponse({ ok: true, sessionId: baseSession.sessionId, session: baseSession, expiresAt: "2026-08-09T12:00:00.000Z" }, 201));

    const result = await runContentsBackfill();

    expect(result.sessionsCreated).toBe(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/contents/storage/sessions/content-session-fixed");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/contents/storage/sessions", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(localStorage.getItem("klique.contents.backfill.v1") as string)).toMatchObject({
      sessions: { "content-session-fixed": expect.any(String) },
    });
  });
});