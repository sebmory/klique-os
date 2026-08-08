import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentDocumentDraftService } from "@/services/content-documents/draft-service";
import { ContentVariantRepositoryService } from "@/services/content-variants/repository";
import {
  restoreInterviewResultSession,
  saveInterviewResultSession,
} from "@/services/content-result-sessions";
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

type CloudState = {
  drafts: Map<string, { document: ContentDocument; version: number }>;
  variants: Map<string, ContentVariant>;
  sessions: Map<string, { session: unknown; expiresAt: string }>;
};

const createResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const installDevice = (localStorage: MemoryStorage, sessionStorage: MemoryStorage) => {
  vi.stubGlobal("window", { localStorage, sessionStorage });
};

const createCloud = (): CloudState => ({
  drafts: new Map(),
  variants: new Map(),
  sessions: new Map(),
});

const installCloudFetch = (cloud: CloudState) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;

    if (url.startsWith("/api/contents/storage/drafts/")) {
      const id = decodeURIComponent(url.split("/").pop() ?? "");
      const existing = cloud.drafts.get(id);
      if (method === "GET") {
        if (!existing) return createResponse({ ok: false, message: "Brouillon introuvable." }, 404);
        return createResponse({ ok: true, version: existing.version, document: existing.document });
      }
      if (method === "PATCH") {
        const expectedVersion = body?.expectedVersion as number;
        if (!existing) return createResponse({ ok: false, message: "Brouillon introuvable." }, 404);
        if (existing.version !== expectedVersion) {
          return createResponse({ ok: false, message: "Conflit de version du brouillon.", currentVersion: existing.version, currentDocument: existing.document }, 409);
        }
        const nextVersion = existing.version + 1;
        cloud.drafts.set(id, { document: body.document, version: nextVersion });
        return createResponse({ ok: true, version: nextVersion, document: body.document });
      }
      if (method === "POST") {
        const document = body.document as ContentDocument;
        cloud.drafts.set(document.id, { document, version: existing?.version ?? 1 });
        return createResponse({ ok: true, version: existing?.version ?? 1, document }, 201);
      }
    }

    if (url.startsWith("/api/contents/storage/variants?")) {
      const params = new URLSearchParams(url.split("?")[1] ?? "");
      const sourceDocumentId = params.get("sourceDocumentId") ?? "";
      const variants = Array.from(cloud.variants.values()).filter((item) => item.sourceDocumentId === sourceDocumentId);
      return createResponse({ ok: true, sourceDocumentId, variants });
    }

    if (url.startsWith("/api/contents/storage/variants/")) {
      const id = decodeURIComponent(url.split("/").pop() ?? "");
      const existing = cloud.variants.get(id);
      if (method === "GET") {
        if (!existing) return createResponse({ ok: false, message: "Variante introuvable." }, 404);
        return createResponse({ ok: true, variant: existing });
      }
    }

    if (url === "/api/contents/storage/variants" && method === "POST") {
      const variant = body.variant as ContentVariant;
      cloud.variants.set(variant.id, variant);
      return createResponse({ ok: true, variant }, 201);
    }

    if (url.startsWith("/api/contents/storage/sessions/")) {
      const sessionId = decodeURIComponent(url.split("/").pop() ?? "");
      const existing = cloud.sessions.get(sessionId);
      if (!existing) return createResponse({ ok: false, message: "Session introuvable." }, 404);
      return createResponse({ ok: true, sessionId, session: existing.session, expiresAt: existing.expiresAt });
    }

    if (url === "/api/contents/storage/sessions" && method === "POST") {
      const sessionId = body.sessionId as string;
      cloud.sessions.set(sessionId, { session: body.session, expiresAt: body.expiresAt });
      return createResponse({ ok: true, sessionId, session: body.session, expiresAt: body.expiresAt }, 201);
    }

    return createResponse({ ok: false, message: "Route non prise en charge." }, 500);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const baseDocument = (): ContentDocument => ({
  id: "document-a",
  type: "interview",
  status: "draft",
  createdAt: "2026-08-08T10:00:00.000Z",
  updatedAt: "2026-08-08T10:00:00.000Z",
  versions: [{ id: "version-1", createdAt: "2026-08-08T10:00:00.000Z", label: "Initiale", source: "generation" }],
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
      { id: "q1", text: "Question ?", purpose: "Purpose", topic: "Topic", followUps: [], locked: false, privateNotes: "Note privee" },
    ],
    conclusion: "Conclusion",
  },
});

const baseVariant = (): ContentVariant => ({
  id: "variant-a",
  sourceDocumentId: "document-a",
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
});

describe("content multi-device validation", () => {
  let cloud: CloudState;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cloud = createCloud();
    fetchMock = installCloudFetch(cloud);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lets device B load a draft saved by device A from cloud", async () => {
    const deviceAStorage = new MemoryStorage();
    const deviceASessions = new MemoryStorage();
    installDevice(deviceAStorage, deviceASessions);

    const document = baseDocument();
    await ContentDocumentDraftService.saveDraft(document);
    cloud.drafts.set(document.id, { document, version: 1 });

    const deviceBStorage = new MemoryStorage();
    const deviceBSessions = new MemoryStorage();
    installDevice(deviceBStorage, deviceBSessions);

    const loaded = await ContentDocumentDraftService.loadDraft(document.id);

    expect(loaded?.id).toBe(document.id);
    expect(deviceBStorage.getItem(`klique.contents.document-editor.draft.v2:${document.id}`)).not.toBeNull();
  });

  it("lets device B open a generation result via sessionId from cloud", async () => {
    const deviceAStorage = new MemoryStorage();
    const deviceASessions = new MemoryStorage();
    installDevice(deviceAStorage, deviceASessions);

    const record = {
      payload: { step: "summary" },
      request: { requestType: "interview" },
      result: { title: "Result" },
      createdAt: "2026-08-08T12:00:00.000Z",
      sessionId: "content-session-fixed",
    };
    await saveInterviewResultSession(record as never);

    const deviceBStorage = new MemoryStorage();
    const deviceBSessions = new MemoryStorage();
    installDevice(deviceBStorage, deviceBSessions);

    const restored = await restoreInterviewResultSession("content-session-fixed", "document-a");

    expect(restored.source).toBe("cloud");
  });

  it("lets device B retrieve a variant created by device A from cloud", async () => {
    const deviceAStorage = new MemoryStorage();
    const deviceASessions = new MemoryStorage();
    installDevice(deviceAStorage, deviceASessions);

    await ContentVariantRepositoryService.save(baseVariant());

    const deviceBStorage = new MemoryStorage();
    const deviceBSessions = new MemoryStorage();
    installDevice(deviceBStorage, deviceBSessions);

    const variant = await ContentVariantRepositoryService.getById("variant-a");

    expect(variant?.id).toBe("variant-a");
  });

  it("keeps local draft data when the cloud version conflicts", async () => {
    const deviceAStorage = new MemoryStorage();
    const deviceASessions = new MemoryStorage();
    installDevice(deviceAStorage, deviceASessions);

    const document = baseDocument();
    await ContentDocumentDraftService.saveDraft(document);
    cloud.drafts.set(document.id, { document: { ...document, updatedAt: "2026-08-08T11:00:00.000Z" }, version: 2 });

    deviceAStorage.setItem(
      `klique.contents.document-editor.draft.v2:${document.id}`,
      JSON.stringify({ document, cloudVersion: 1 })
    );

    const updatedDocument = { ...document, updatedAt: "2026-08-08T13:00:00.000Z" };
    const result = await ContentDocumentDraftService.saveDraft(updatedDocument);

    expect(result.cloud.status).toBe("conflict");
    expect(deviceAStorage.getItem(`klique.contents.document-editor.draft.v2:${document.id}`)).not.toBeNull();
  });

  it("falls back to local data when the cloud is unavailable", async () => {
    const deviceAStorage = new MemoryStorage();
    const deviceASessions = new MemoryStorage();
    installDevice(deviceAStorage, deviceASessions);

    const document = baseDocument();
    deviceAStorage.setItem(
      `klique.contents.document-editor.draft.v2:${document.id}`,
      JSON.stringify({ document })
    );
    fetchMock.mockRejectedValueOnce(new Error("Cloud down"));

    const loaded = await ContentDocumentDraftService.loadDraft(document.id);

    expect(loaded?.id).toBe(document.id);
    expect(deviceAStorage.getItem(`klique.contents.document-editor.draft.v2:${document.id}`)).not.toBeNull();
  });
});