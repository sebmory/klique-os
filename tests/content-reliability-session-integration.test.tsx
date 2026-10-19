// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAuthenticatedContentStorageRole } from "@/services/content-storage-access";
import type {
  ArticleGenerationRequest,
  EditorialGenerationMetadata,
  InterviewGenerationRequest,
  InterviewGenerationResult,
} from "@/types/content-generation";

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, {
    sessionId: string;
    session: unknown;
    workspaceId: string;
    createdAt: string;
    expiresAt: string;
  }>(),
  requireContentAccess: vi.fn(),
  listVariants: vi.fn(async () => []),
  runContentsBackfill: vi.fn(async () => undefined),
}));

vi.mock("@/lib/content-storage/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/content-storage/access")>();
  return {
    ...actual,
    requireContentAccess: mocks.requireContentAccess,
  };
});

vi.mock("@/lib/content-storage/repository", () => ({
  ContentStorageRepository: {
    createSession: vi.fn(async (sessionId: string, session: { createdAt: string }, expiresAt: string) => {
      const stored = {
        sessionId,
        session,
        workspaceId: "workspace-1",
        createdAt: session.createdAt,
        expiresAt,
      };
      mocks.sessions.set(sessionId, stored);
      return stored;
    }),
    getSession: vi.fn(async (sessionId: string) => mocks.sessions.get(sessionId) ?? null),
  },
}));

vi.mock("@/services/content-variants/repository", () => ({
  ContentVariantRepositoryService: {
    listBySourceDocument: mocks.listVariants,
    getById: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
  },
}));

vi.mock("@/services/content-backfill", () => ({
  runContentsBackfill: mocks.runContentsBackfill,
}));

vi.mock("@/services/content-documents/draft-service", () => ({
  ContentDocumentDraftService: {
    loadDraftRecord: vi.fn(async () => null),
    loadDraft: vi.fn(async () => null),
    saveDraft: vi.fn(),
  },
}));

import { POST as postSession } from "@/app/api/contents/storage/sessions/route";
import { GET as getSession } from "@/app/api/contents/storage/sessions/[sessionId]/route";
import { InterviewResultPageClient } from "@/components/contents/InterviewResultPageClient";
import {
  saveArticleResultSession,
  saveInterviewResultSession,
} from "@/services/content-result-sessions";

const editorialMetadata: EditorialGenerationMetadata = {
  dossierRevision: 3,
  generationMode: "limited",
  confidence: {
    level: "medium",
    score: 65,
    explanation: ["La confiance est limitée par un fait restant à confirmer."],
  },
  usedSources: [{
    name: "Fédération officielle",
    url: "https://federation.example/resultat",
    publishedAt: "2026-10-18T18:00:00.000Z",
    official: true,
    confidence: "high",
  }],
  contradictions: ["Une contradiction non résolue a été exclue."],
  missingInformation: ["Le poste public reste à confirmer."],
  warnings: ["Vérifier les éléments limités avant publication."],
};

const interviewRequest: InterviewGenerationRequest = {
  requestType: "interview",
  language: "fr",
  template: { key: "interview:v1", family: "interview", name: "Interview", version: "v1" },
  context: {
    source: "crm",
    subjectType: "person",
    displayName: "Mila Martin",
    knownFacts: ["Victoire 3-0"],
    objective: "interview",
    audience: "general",
    templateKey: "interview:v1",
    contentType: "interview",
    interviewType: "portrait",
    format: "written",
    tone: "journalistic",
    internalFacts: [],
    externalVerifiedFacts: ["Victoire 3-0"],
    userProvidedContextItems: [],
    editorialLeads: [],
    excludedContext: [],
    constraints: { requiredTopics: [], avoidedTopics: [], questionCount: 1 },
  },
  brief: {
    interviewType: "portrait",
    objective: "interview",
    tone: "journalistic",
    questionCount: 1,
    format: "written",
    audience: "general",
    requiredTopics: [],
    avoidedTopics: [],
    additionalContext: "",
  },
  selectedContextItems: [{
    id: "editorial-fact-1",
    connectorId: "external_news",
    category: "result",
    title: "Résultat officiel",
    summary: "Victoire 3-0",
    factualStatement: "Victoire 3-0",
    statementType: "fact",
    sourceType: "official",
    sourceName: "Fédération officielle",
    sourceUrl: "https://federation.example/resultat",
    retrievedAt: "2026-10-19T10:00:00.000Z",
    publishedAt: "2026-10-18T18:00:00.000Z",
    confidence: "high",
    verificationStatus: "verified",
    isSelected: true,
    isEditable: false,
    metadata: {},
  }],
  contextSelection: {
    collectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    selectedItemIds: ["official-result"],
    manualEdits: [],
  },
  rulesVersion: "editorial-rules-v1",
  externalContext: null,
  editorialGeneration: editorialMetadata,
};

const interviewResult: InterviewGenerationResult = {
  title: "Interview de Mila Martin",
  editorialAngle: "Le collectif",
  introduction: "Introduction",
  questions: [{
    id: "question-1",
    text: "Comment abordez-vous la suite ?",
    purpose: "Explorer la suite",
    followUps: [],
    optional: false,
    topic: "Collectif",
  }],
  conclusion: "Conclusion",
  reelIdeas: [],
  storyIdeas: [],
  publicationIdeas: [],
  contextUsage: {
    usedContextItemIds: ["editorial-fact-1"],
    usedSourceIds: ["https://federation.example/resultat"],
    unusedSelectedContextItemIds: [],
    externalContextUsed: true,
    selectedItems: interviewRequest.selectedContextItems,
  },
  metadata: {
    provider: "openai",
    model: "gpt-test",
    templateId: "interview",
    templateKey: "interview:v1",
    templateVersion: "v1",
    promptVersion: "v1",
    generatedAt: "2026-10-19T10:00:00.000Z",
    generationDurationMs: 10,
    questionCountRequested: 1,
    questionCountGenerated: 1,
    reliabilityNotes: [],
    missingInformation: [],
    externalContextUsed: true,
    editorial: editorialMetadata,
  },
};

const articleRequest: ArticleGenerationRequest = {
  ...interviewRequest,
  requestType: "article",
  template: { key: "article:v1", family: "article", name: "Article", version: "v1" },
  context: {
    ...interviewRequest.context,
    objective: "article",
    templateKey: "article:v1",
    contentType: "article",
    interviewType: undefined,
    format: "actualite",
  },
  brief: {
    objective: "article",
    selectedAngle: "La victoire",
    articleType: "actualite",
    length: "breve",
    tone: "journalistic",
    audience: "general",
    additionalContext: "",
    requiredTopics: [],
    externalVerifiedSources: [{ title: "Fédération officielle", url: "https://federation.example/resultat" }],
    providedCitations: [],
  },
};

const articleResult = {
  title: "Une victoire nette",
  lead: "Mila Martin s impose avec son équipe.",
  sections: [{ order: 1, heading: "Le résultat", paragraphs: ["Victoire 3-0."] }],
  conclusion: "",
  usedCitations: [],
  usedSources: [{ title: "Fédération officielle", url: "https://federation.example/resultat" }],
  estimatedWordCount: 8,
  metadata: {
    templateId: "article" as const,
    templateVersion: "v1" as const,
    editorial: editorialMetadata,
  },
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("8C reliability session integration", () => {
  let container: HTMLElement;
  let root: Root;
  let generationCalls: number;

  beforeEach(() => {
    mocks.sessions.clear();
    mocks.requireContentAccess.mockResolvedValue({
      clerkUserId: "admin-1",
      workspaceId: "workspace-1",
      role: "admin",
      mediaId: null,
      isAdmin: true,
    });
    generationCalls = 0;
    setAuthenticatedContentStorageRole("admin");
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/contents/create");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/content/generate" && init?.method === "POST") {
        generationCalls += 1;
        return response({ ok: true, request: interviewRequest, result: interviewResult });
      }
      if (url === "/api/contents/generate/article" && init?.method === "POST") {
        generationCalls += 1;
        return response({
          ok: true,
          action: "final",
          result: {
            article: articleResult,
            metadata: {
              provider: "openai",
              model: "gpt-test",
              generatedAt: "2026-10-19T10:00:00.000Z",
              generationDurationMs: 12,
            },
            editorial: editorialMetadata,
          },
        });
      }
      if (url === "/api/contents/storage/sessions" && init?.method === "POST") {
        return postSession(new Request("http://localhost/api/contents/storage/sessions", init));
      }
      if (url.startsWith("/api/contents/storage/sessions/")) {
        const sessionId = decodeURIComponent(url.split("/").pop() ?? "");
        return getSession(new Request(`http://localhost${url}`), {
          params: Promise.resolve({ sessionId }),
        });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    setAuthenticatedContentStorageRole(null);
    vi.unstubAllGlobals();
  });

  const renderResultAndAssert = async (sessionId: string) => {
    window.history.replaceState(null, "", `/contents/create/result?sessionId=${sessionId}`);
    await act(async () => {
      root.render(createElement(InterviewResultPageClient));
      await flush();
    });
    const panelButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Fiabilité et sources");
    expect(panelButton).toBeDefined();
    expect(panelButton?.getAttribute("aria-expanded")).toBe("false");
    expect(panelButton?.getAttribute("aria-controls")).toBeTruthy();
    expect(document.getElementById(panelButton?.getAttribute("aria-controls") ?? "")).not.toBeNull();
    await act(async () => {
      panelButton!.click();
      await flush();
    });
    expect(panelButton?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Génération limitée");
    expect(container.textContent).toContain("Moyenne (65/100)");
    expect(container.textContent).toContain("Fédération officielle");
    expect(container.textContent).toContain("Le poste public reste à confirmer.");
    expect(container.textContent).toContain("Une contradiction non résolue a été exclue.");
    expect(container.textContent).toContain("Vérifier les éléments limités avant publication.");
    expect(container.textContent).not.toContain("Sources vérifiées");
  };

  const remountAndAssert = async (sessionId: string) => {
    await act(async () => root.unmount());
    container.innerHTML = "";
    root = createRoot(container);
    await renderResultAndAssert(sessionId);
  };

  it("persists and restores Interview reliability metadata through navigation and F5", async () => {
    const generationResponse = await fetch("/api/content/generate", {
      method: "POST",
      body: JSON.stringify({ payload: {} }),
    });
    const generated = await generationResponse.json() as {
      request: InterviewGenerationRequest;
      result: InterviewGenerationResult;
    };
    const saved = await saveInterviewResultSession({
      payload: { step: "summary" } as never,
      request: generated.request,
      result: generated.result,
      createdAt: "2026-10-19T10:00:00.000Z",
      sessionId: "interview-reliability-session",
    });

    expect(mocks.sessions.get(saved.sessionId)?.session).toMatchObject({
      editorialMetadata: { dossierRevision: 3, generationMode: "limited" },
    });
    await renderResultAndAssert(saved.sessionId);
    await remountAndAssert(saved.sessionId);
    expect(generationCalls).toBe(1);
  });

  it("persists and restores Article reliability metadata without duplicate sources", async () => {
    const generationResponse = await fetch("/api/contents/generate/article", {
      method: "POST",
      body: JSON.stringify({ action: "final" }),
    });
    const generated = await generationResponse.json() as {
      result: {
        article: typeof articleResult;
        metadata: {
          provider: "openai";
          model: string;
          generatedAt: string;
          generationDurationMs: number;
        };
      };
    };
    const saved = await saveArticleResultSession({
      request: articleRequest,
      result: generated.result.article,
      selectedAngle: { id: "angle-1", title: "La victoire" },
      selectedStructure: {
        id: "structure-1",
        title: "Structure courte",
        editorialPromise: "Présenter le résultat",
        sections: [{ order: 1, title: "Le résultat", purpose: "Informer", points: ["Victoire 3-0"] }],
        estimatedWordCount: 80,
      },
      generationMetadata: generated.result.metadata,
      createdAt: "2026-10-19T10:00:00.000Z",
      sessionId: "article-reliability-session",
    });

    expect(mocks.sessions.get(saved.sessionId)?.session).toMatchObject({
      editorialMetadata: { dossierRevision: 3, generationMode: "limited" },
    });
    await renderResultAndAssert(saved.sessionId);
    await remountAndAssert(saved.sessionId);
    expect(generationCalls).toBe(1);
  });

  it("keeps a legacy Interview session readable without inventing reliability metadata", async () => {
    const legacyRequest = {
      ...interviewRequest,
      editorialGeneration: undefined,
    };
    const legacyResult = {
      ...interviewResult,
      metadata: {
        ...interviewResult.metadata,
        editorial: undefined,
      },
    };
    const saved = await saveInterviewResultSession({
      payload: { step: "summary" } as never,
      request: legacyRequest,
      result: legacyResult,
      createdAt: "2026-10-19T10:00:00.000Z",
      sessionId: "legacy-interview-session",
    });
    window.history.replaceState(null, "", `/contents/create/result?sessionId=${saved.sessionId}`);

    await act(async () => {
      root.render(createElement(InterviewResultPageClient));
      await flush();
    });

    expect(container.textContent).toContain("Interview de Mila Martin");
    expect(container.textContent).not.toContain("Fiabilité et sources");
    expect(container.textContent).toContain("Sources vérifiées");
  });
});
