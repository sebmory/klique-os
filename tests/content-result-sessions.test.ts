import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildResultUrl,
  restoreInterviewResultSession,
  saveInterviewResultSession,
  type StoredInterviewResult,
} from "@/services/content-result-sessions";
import type { ContentDocument } from "@/types/content-document";

const draftServiceMock = vi.hoisted(() => ({
  loadDraft: vi.fn(),
}));

vi.mock("@/services/content-documents/draft-service", () => ({
  ContentDocumentDraftService: draftServiceMock,
}));

type MemorySessionStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

const createMemorySessionStorage = (): MemorySessionStorage => {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
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

const createStoredResult = (sessionId = "content-session-fixed"): StoredInterviewResult => ({
  payload: { step: "summary" } as never,
  request: { requestType: "interview" } as never,
  result: { title: "Result" } as never,
  createdAt: "2026-08-08T12:00:00.000Z",
  sessionId,
});

const createResponse = (body: unknown, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

describe("result session helper", () => {
  let sessionStorage: MemorySessionStorage;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage = createMemorySessionStorage();
    fetchMock = vi.fn();
    draftServiceMock.loadDraft.mockReset();
    draftServiceMock.loadDraft.mockResolvedValue(null);
    vi.stubGlobal("window", { sessionStorage });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stores the result in sessionStorage and posts the cloud session", async () => {
    const record = createStoredResult("content-session-fixed");
    fetchMock.mockResolvedValueOnce(createResponse({ ok: true, sessionId: record.sessionId, expiresAt: "2026-08-09T12:00:00.000Z" }, 201));

    const saved = await saveInterviewResultSession(record);

    expect(saved.sessionId).toBe(record.sessionId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/contents/storage/sessions",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as { sessionId: string; session: StoredInterviewResult; expiresAt: string };
    expect(body.sessionId).toBe(record.sessionId);
    expect(body.session).toMatchObject(record);
    expect(body.expiresAt).toBe("2026-08-09T12:00:00.000Z");
    expect(sessionStorage.getItem("klique.contents.creation-assistant.interview-result.v1")).not.toBeNull();
  });

  it("builds a result URL with sessionId and documentId", () => {
    expect(buildResultUrl("content-session-fixed", "document-1")).toBe(
      "/contents/create/result?sessionId=content-session-fixed&documentId=document-1"
    );
  });

  it("restores the cloud session when it exists", async () => {
    const record = createStoredResult("content-session-fixed");
    fetchMock.mockResolvedValueOnce(createResponse({ ok: true, sessionId: record.sessionId, session: record, expiresAt: "2026-08-09T12:00:00.000Z" }));

    const sessionId = record.sessionId ?? "content-session-fixed";
    const restored = await restoreInterviewResultSession(sessionId, "document-1");

    expect(restored.source).toBe("cloud");
    if (restored.source === "cloud") {
      expect(restored.result.sessionId).toBe(sessionId);
    }
  });

  it.each([404, 410])("falls back to sessionStorage when cloud session returns %i", async (status) => {
    const record = createStoredResult("content-session-fixed");
    sessionStorage.setItem("klique.contents.creation-assistant.interview-result.v1", JSON.stringify(record));
    fetchMock.mockResolvedValueOnce(createResponse({ ok: false, message: "Session indisponible." }, status));

    const sessionId = record.sessionId ?? "content-session-fixed";
    const restored = await restoreInterviewResultSession(sessionId, "document-1");

    expect(restored.source).toBe("sessionStorage");
    if (restored.source === "sessionStorage") {
      expect(restored.result.sessionId).toBe(sessionId);
    }
  });

  it("falls back to sessionStorage when the cloud session is unavailable", async () => {
    const record = createStoredResult("content-session-fixed");
    sessionStorage.setItem("klique.contents.creation-assistant.interview-result.v1", JSON.stringify(record));
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    const sessionId = record.sessionId ?? "content-session-fixed";
    const restored = await restoreInterviewResultSession(sessionId, "document-1");

    expect(restored.source).toBe("sessionStorage");
  });

  it("falls back to the draft when sessionStorage is absent", async () => {
    fetchMock.mockResolvedValueOnce(createResponse({ ok: false, message: "Session introuvable." }, 404));
    draftServiceMock.loadDraft.mockResolvedValueOnce(baseDocument);

    const restored = await restoreInterviewResultSession("content-session-fixed", "document-1");

    expect(restored.source).toBe("draft");
    expect(draftServiceMock.loadDraft).toHaveBeenCalledWith("document-1");
  });

  it("returns missing when all sources fail", async () => {
    fetchMock.mockResolvedValueOnce(createResponse({ ok: false, message: "Session introuvable." }, 404));
    draftServiceMock.loadDraft.mockResolvedValueOnce(null);

    const restored = await restoreInterviewResultSession("content-session-fixed", "document-1");

    expect(restored.source).toBe("missing");
  });
});