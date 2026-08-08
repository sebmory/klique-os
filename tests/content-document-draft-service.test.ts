import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentDocumentDraftService } from "@/services/content-documents/draft-service";
import type { ContentDocument } from "@/types/content-document";

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

const createMemoryStorage = (): MemoryStorage => {
  const entries = new Map<string, string>();

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  };
};

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

const readStoredDraft = (storage: MemoryStorage, documentId: string) => {
  const raw = storage.getItem(`klique.contents.document-editor.draft.v2:${documentId}`);
  return raw ? (JSON.parse(raw) as { document: ContentDocument; cloudVersion?: number }) : null;
};

describe("ContentDocumentDraftService", () => {
  let storage: MemoryStorage;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = createMemoryStorage();
    fetchMock = vi.fn();
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the cloud draft and refreshes local storage", async () => {
    const cloudDocument = { ...baseDocument, updatedAt: "2026-08-08T11:00:00.000Z" };
    fetchMock.mockResolvedValueOnce(createResponse({ ok: true, version: 4, document: cloudDocument }));

    const document = await ContentDocumentDraftService.loadDraft("document-1");

    expect(document).toEqual(cloudDocument);
    expect(fetchMock).toHaveBeenCalledWith("/api/contents/storage/drafts/document-1");
    expect(readStoredDraft(storage, "document-1")).toMatchObject({ document: cloudDocument, cloudVersion: 4 });
  });

  it("falls back to local draft and creates cloud draft when cloud is missing", async () => {
    const localDocument = { ...baseDocument, updatedAt: "2026-08-08T12:00:00.000Z" };
    storage.setItem(
      "klique.contents.document-editor.draft.v2:document-1",
      JSON.stringify({ document: localDocument })
    );
    fetchMock
      .mockResolvedValueOnce(createResponse({ ok: false, message: "Brouillon introuvable." }, 404))
      .mockResolvedValueOnce(createResponse({ ok: true, version: 2, document: localDocument }, 201));

    const document = await ContentDocumentDraftService.loadDraft("document-1");

    expect(document).toEqual(localDocument);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/contents/storage/drafts/document-1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/contents/storage/drafts",
      expect.objectContaining({ method: "POST" })
    );
    expect(readStoredDraft(storage, "document-1")).toMatchObject({ document: localDocument, cloudVersion: 2 });
  });

  it("saves a new draft locally and creates it in cloud", async () => {
    const newDocument = { ...baseDocument, id: "document-new", updatedAt: "2026-08-08T13:00:00.000Z" };
    fetchMock.mockResolvedValueOnce(createResponse({ ok: true, version: 3, document: newDocument }, 201));

    const result = await ContentDocumentDraftService.saveDraft(newDocument);

    expect(result.cloud).toEqual({ status: "created", version: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/contents/storage/drafts",
      expect.objectContaining({ method: "POST" })
    );
    expect(readStoredDraft(storage, "document-new")).toMatchObject({ document: newDocument, cloudVersion: 3 });
  });

  it("saves an existing draft locally and patches the cloud version", async () => {
    const existingDocument = { ...baseDocument, updatedAt: "2026-08-08T14:00:00.000Z" };
    storage.setItem(
      "klique.contents.document-editor.draft.v2:document-1",
      JSON.stringify({ document: baseDocument, cloudVersion: 7 })
    );
    fetchMock.mockResolvedValueOnce(createResponse({ ok: true, version: 8, document: existingDocument }));

    const result = await ContentDocumentDraftService.saveDraft(existingDocument);

    expect(result.cloud).toEqual({ status: "updated", version: 8 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/contents/storage/drafts/document-1",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(readStoredDraft(storage, "document-1")).toMatchObject({ document: existingDocument, cloudVersion: 8 });
  });

  it("keeps the local draft when the cloud version conflicts", async () => {
    const localDocument = { ...baseDocument, updatedAt: "2026-08-08T15:00:00.000Z" };
    const serverDocument = { ...baseDocument, updatedAt: "2026-08-08T16:00:00.000Z" };
    storage.setItem(
      "klique.contents.document-editor.draft.v2:document-1",
      JSON.stringify({ document: baseDocument, cloudVersion: 5 })
    );
    fetchMock.mockResolvedValueOnce(
      createResponse({ ok: false, message: "Conflit de version du brouillon.", currentVersion: 9, currentDocument: serverDocument }, 409)
    );

    const result = await ContentDocumentDraftService.saveDraft(localDocument);

    expect(result.cloud.status).toBe("conflict");
    expect(result.cloud.currentVersion).toBe(9);
    expect(readStoredDraft(storage, "document-1")).toMatchObject({ document: localDocument, cloudVersion: 5 });
  });

  it("keeps the local draft when the cloud is unavailable", async () => {
    const localDocument = { ...baseDocument, id: "document-unavailable", updatedAt: "2026-08-08T17:00:00.000Z" };
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    const result = await ContentDocumentDraftService.saveDraft(localDocument);

    expect(result.cloud.status).toBe("unavailable");
    expect(readStoredDraft(storage, "document-unavailable")).toMatchObject({ document: localDocument });
  });
});