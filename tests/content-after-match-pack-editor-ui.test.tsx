// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AFTER_MATCH_PACK_POLL_INTERVAL_MS,
  AfterMatchPackBlock,
} from "@/components/contents/AfterMatchPackBlock";
import { ContentDocumentEditor } from "@/components/contents/ContentDocumentEditor";
import { projectAfterMatchPack } from "@/app/api/contents/packs/after-match/route-utils";
import type {
  ContentDocument,
  InterviewDocument,
  PublicationDocument,
  ReelDocument,
  StoryDocument,
} from "@/types/content-document";
import type { ContentVariant } from "@/types/content-variant";
import type { ContentDocumentDraftSaveResult } from "@/services/content-documents/draft-service";

const variantRepositoryMocks = vi.hoisted(() => ({
  save: vi.fn(),
  listBySourceDocument: vi.fn(),
  getById: vi.fn(),
}));
const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("@/services/content-variants/repository", () => ({
  ContentVariantRepositoryService: variantRepositoryMocks,
}));

const documentUpdatedAt = "2026-09-27T10:00:00.000Z";
const packId = "22222222-2222-4222-8222-222222222222";

const commonDocument: Omit<PublicationDocument, "type" | "sections" | "sourceContext"> = {
  id: "publication-1",
  status: "draft",
  createdAt: documentUpdatedAt,
  updatedAt: documentUpdatedAt,
  versions: [{ id: "version-2", createdAt: documentUpdatedAt, label: "Version 2", source: "manual" }],
  activeVersionId: "version-2",
  sidebar: {
    subject: "Klique FC",
    source: "temporary",
    objective: "engagement",
    tone: "dynamic",
    audience: "supporters",
    format: "social",
    templateVersion: "1",
    provider: "openai",
    model: "gpt",
    generatedAt: documentUpdatedAt,
  },
  metadata: {
    provider: "openai",
    model: "gpt",
    templateId: "publication",
    templateKey: "publication:v1",
    templateVersion: "1",
    promptVersion: "1",
    generatedAt: documentUpdatedAt,
    generationDurationMs: 10,
    questionCountRequested: 0,
    questionCountGenerated: 0,
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
};

const publication = (afterMatch = true): PublicationDocument => ({
  ...commonDocument,
  type: "publication",
  sections: {
    title: "Victoire à domicile",
    editorialAngle: "Une victoire collective",
    hook: "Trois points",
    text: "Klique FC s’impose.",
    cta: "Votre moment du match ?",
    hashtags: ["#KliqueFC"],
    visualSuggestion: "Le groupe devant la tribune",
    editorialNote: "",
  },
  sourceContext: afterMatch ? { afterMatch: { opponent: "FC Exemple", result: "2-1" } } : undefined,
});

const interviewDocument: InterviewDocument = {
  ...commonDocument,
  id: "interview-1",
  type: "interview",
  sections: {
    title: "Interview",
    editorialAngle: "Angle",
    introduction: "Introduction",
    questions: [],
    conclusion: "Conclusion",
  },
};

const reelDocument: ReelDocument = {
  ...commonDocument,
  id: "reel-1",
  type: "reel",
  sections: {
    title: "Reel",
    editorialAngle: "Angle",
    hook: "Hook",
    concept: "Concept",
    scenes: [],
    cta: "CTA",
    caption: "Légende",
    hashtags: [],
    coverIdea: "Cover",
  },
};

const storyDocument: StoryDocument = {
  ...commonDocument,
  id: "story-1",
  type: "story",
  sections: {
    title: "Story",
    editorialAngle: "Angle",
    hook: "Hook",
    frames: [],
    cta: "CTA",
    caption: "Légende",
    hashtags: [],
  },
};

const makeVariant = (type: "reel" | "stories"): ContentVariant => ({
  id: `variant-${type}`,
  sourceDocumentId: "publication-1",
  sourceDocumentType: "publication",
  sourceDocumentVersionId: "version-2",
  sourceDocumentUpdatedAt: documentUpdatedAt,
  workspaceId: "workspace-1",
  type,
  format: type === "reel" ? "short_video" : "stories",
  platform: "instagram",
  objective: "engagement",
  tone: "dynamic",
  audience: "supporters",
  title: type === "reel" ? "Reel du match" : "Stories du match",
  content: "Contenu",
  structuredContent: type === "reel"
    ? {
        concept: "Résumé",
        hook: "Le match",
        duration: "30 secondes",
        scenario: "Scénario",
        scenes: [],
        onScreenText: [],
        callToAction: "Réagissez",
        caption: "Victoire",
        coverIdea: "Score",
      }
    : { sequenceTitle: "Le match", stories: [], callToAction: "Réagissez" },
  status: "draft",
  origin: { type: "after_match_pack", packId, deliverable: type },
  generationMetadata: {
    provider: "openai",
    model: "gpt",
    generatedAt: documentUpdatedAt,
    generationDurationMs: 10,
    promptVersion: "1",
    variationTemplateVersion: "variation-v1",
    sourceDocumentVersionId: "version-2",
    sourceDocumentUpdatedAt: documentUpdatedAt,
    usedContextItemIds: [],
  },
  createdAt: documentUpdatedAt,
  updatedAt: documentUpdatedAt,
});

type UiStatus = "pending" | "generating" | "partial" | "completed" | "failed";
type PublicPack = ReturnType<typeof projectAfterMatchPack>;

const pack = (status: UiStatus): PublicPack => {
  const reelStatus = status === "completed" || status === "partial" ? "completed" : status;
  const storiesStatus = status === "partial" ? "failed" : status;
  return {
    id: packId,
    kind: "after_match",
    status,
    source: { documentId: "publication-1", revision: 3, versionId: "version-2", updatedAt: documentUpdatedAt },
    reel: {
      status: reelStatus,
      ...(reelStatus === "completed" ? { variantId: "variant-reel" } : {}),
    },
    stories: {
      status: storiesStatus,
      ...(storiesStatus === "completed" ? { variantId: "variant-stories" } : {}),
      ...(storiesStatus === "failed" ? { errorCode: "VARIATION_GENERATION_FAILED" } : {}),
    },
    createdAt: documentUpdatedAt,
    updatedAt: documentUpdatedAt,
    startedAt: status === "pending" ? null : documentUpdatedAt,
    finishedAt: ["partial", "completed", "failed"].includes(status) ? documentUpdatedAt : null,
  };
};

const response = (payload: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
}) as Response;

const deferredResponse = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((next) => { resolve = next; });
  return { promise, resolve };
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
};

const button = (container: HTMLElement, label: string): HTMLButtonElement => {
  const match = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Bouton introuvable: ${label}`);
  return match;
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

let container: HTMLElement;
let root: Root;
const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
const scrollIntoViewMock = vi.fn();

const mountPack = async (options: {
  currentPack?: ReturnType<typeof pack> | null;
  persisted?: boolean;
  dirty?: boolean;
  revision?: number | null;
  storageUpdatedAt?: string | null;
  onOpenVariant?: (variantId: string) => Promise<void>;
} = {}) => {
  const currentPack = options.currentPack === undefined ? null : options.currentPack;
  if (!fetchMock.getMockImplementation()) {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({}, 403);
      if (url.startsWith("/api/contents/packs/after-match?")) return response({ ok: true, pack: currentPack });
      throw new Error(`Unexpected URL: ${url}`);
    });
  }
  await act(async () => {
    root.render(
      <AfterMatchPackBlock
        document={publication()}
        isPersistedInCloud={options.persisted ?? true}
        hasUnsavedChanges={options.dirty ?? false}
        sourceDocumentRevision={options.revision === undefined ? 3 : options.revision}
        sourceDocumentStorageUpdatedAt={options.storageUpdatedAt === undefined ? documentUpdatedAt : options.storageUpdatedAt}
        onOpenSource={vi.fn()}
        onOpenVariant={options.onOpenVariant ?? vi.fn(async () => undefined)}
      />
    );
  });
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.useRealTimers();
  variantRepositoryMocks.listBySourceDocument.mockResolvedValue([]);
  variantRepositoryMocks.getById.mockResolvedValue(null);
  variantRepositoryMocks.save.mockResolvedValue(undefined);
  scrollIntoViewMock.mockReset();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoViewMock,
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("After-match Pack editor UI", () => {
  it.each([
    ["Interview", interviewDocument],
    ["Reel", reelDocument],
    ["Story", storyDocument],
    ["Publication normale", publication(false)],
  ] as Array<[string, ContentDocument]>)("hides the block for %s", async (_label, initialDocument) => {
    await act(async () => {
      root.render(<ContentDocumentEditor initialDocument={initialDocument} onSaveDraft={vi.fn()} isPersistedInCloud />);
    });
    await flush();

    expect(container.textContent).not.toContain("Pack Après-match");
  });

  it("shows the After-match block but disables it before cloud persistence", async () => {
    await mountPack({ persisted: false });

    expect(container.textContent).toContain("Pack Après-match");
    expect(container.textContent).toContain("Enregistrez cette publication avant de créer ou reprendre son Pack.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables the block while the Publication has local changes", async () => {
    await mountPack({ dirty: true });

    expect(container.textContent).toContain("Enregistrez cette publication avant de créer ou reprendre son Pack.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the SQL timestamp, never the editorial timestamp, when creating a Pack from a reopened draft", async () => {
    const editorialUpdatedAt = "2026-09-28T08:39:00.000Z";
    const storageUpdatedAt = "2026-09-28T08:45:00.000Z";
    let createBody: Record<string, unknown> | null = null;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({}, 403);
      if (url === "/api/contents/storage/drafts/publication-1") {
        return response({ ok: true, version: 4, storageUpdatedAt });
      }
      if (url.includes("/api/contents/packs/after-match?")) return response({ ok: true, pack: null });
      if (url === "/api/contents/packs/after-match" && init?.method === "POST") {
        createBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return response({ ok: true, pack: pack("completed") });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    await act(async () => {
      root.render(
        <AfterMatchPackBlock
          document={{ ...publication(), updatedAt: editorialUpdatedAt }}
          isPersistedInCloud
          hasUnsavedChanges={false}
          sourceDocumentRevision={null}
          onOpenSource={vi.fn()}
          onOpenVariant={vi.fn(async () => undefined)}
        />
      );
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/contents/packs/after-match?sourceDocumentId=publication-1&sourceDocumentRevision=4",
      expect.objectContaining({ method: "GET" })
    );
    await act(async () => button(container, "Créer le Pack Après-match").click());
    await act(async () => button(container, "Confirmer la création").click());

    expect(createBody).toEqual({
      sourceDocumentId: "publication-1",
      sourceDocumentRevision: 4,
      sourceDocumentVersionId: "version-2",
      sourceDocumentUpdatedAt: storageUpdatedAt,
    });
    expect(JSON.stringify(createBody)).not.toContain(editorialUpdatedAt);
  });

  it.each([
    ["pending", "Le Pack est prêt à être lancé."],
    ["generating", "Création du Pack en cours…"],
    ["partial", "Une partie du Pack est prête. Vous pouvez relancer uniquement le contenu manquant."],
    ["completed", "Votre Pack Après-match est prêt."],
    ["failed", "Le Pack n’a pas pu être terminé."],
  ] as Array<[UiStatus, string]>)("restores the %s state", async (status, message) => {
    await mountPack({ currentPack: pack(status) });
    expect(container.textContent).toContain(message);
  });

  it("asks for confirmation and creates with the exact source payload while blocking double clicks", async () => {
    const pending = deferredResponse();
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({}, 403);
      if (url.startsWith("/api/contents/packs/after-match?") && init?.method === "GET") return response({ ok: true, pack: null });
      if (url === "/api/contents/packs/after-match" && init?.method === "POST") return pending.promise;
      throw new Error(`Unexpected URL: ${url}`);
    });
    await mountPack();

    await act(async () => button(container, "Créer le Pack Après-match").click());
    expect(container.getAttribute("role")).not.toBe("dialog");
    expect(container.textContent).toContain("KLIQUE va créer un script de Reel et une séquence de Stories à partir de cette publication.");
    const confirm = button(container, "Confirmer la création");
    expect(document.activeElement).toBe(confirm);
    await act(async () => {
      confirm.click();
      confirm.click();
    });

    const postCalls = fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/contents/packs/after-match" && init?.method === "POST");
    expect(postCalls).toHaveLength(1);
    expect(JSON.parse(String(postCalls[0][1]?.body))).toEqual({
      sourceDocumentId: "publication-1",
      sourceDocumentRevision: 3,
      sourceDocumentVersionId: "version-2",
      sourceDocumentUpdatedAt: documentUpdatedAt,
    });

    await act(async () => pending.resolve(response({ ok: true, pack: pack("completed") })));
    expect(container.textContent).toContain("Votre Pack Après-match est prêt.");
  });

  it("uses the cloud revision and SQL timestamp while preserving the editorial timestamp after saving", async () => {
    const editorialUpdatedAt = "2026-09-28T08:39:00.000Z";
    const storageUpdatedAt = "2026-09-28T08:45:00.000Z";
    const sourceDocument = { ...publication(), updatedAt: editorialUpdatedAt };
    const cloudDocument = { ...sourceDocument };
    const saveResult: ContentDocumentDraftSaveResult = {
      document: cloudDocument,
      local: { status: "saved", storageKey: "draft:publication-1" },
      cloud: { status: "created", version: 4, storageUpdatedAt },
    };
    const onSaveDraft = vi.fn(async () => saveResult);
    let createBody: Record<string, unknown> | null = null;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({}, 403);
      if (url === "/api/contents/packs/after-match?sourceDocumentId=publication-1&sourceDocumentRevision=4") {
        return response({ ok: true, pack: null });
      }
      if (url === "/api/contents/packs/after-match" && init?.method === "POST") {
        createBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return response({ ok: true, pack: pack("completed") });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    await act(async () => {
      root.render(<ContentDocumentEditor initialDocument={sourceDocument} onSaveDraft={onSaveDraft} isPersistedInCloud={false} />);
    });
    await flush();
    await act(async () => button(container, "Enregistrer le brouillon").click());
    await flush();

    const displayedEditorialUpdatedAt = new Date(editorialUpdatedAt).toLocaleString("fr-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(container.textContent).toContain(`Derniere modification: ${displayedEditorialUpdatedAt}`);
    await act(async () => button(container, "Créer le Pack Après-match").click());
    await act(async () => button(container, "Confirmer la création").click());

    expect(createBody).toEqual({
      sourceDocumentId: "publication-1",
      sourceDocumentRevision: 4,
      sourceDocumentVersionId: "version-2",
      sourceDocumentUpdatedAt: storageUpdatedAt,
    });
    expect(container.textContent).not.toContain("La Publication a été modifiée.");
    expect(window.location.search).toBe("?documentId=publication-1");
  });

  it("shows the two-credit notice only when Media identity is reliably confirmed", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({ ok: true, balance: 10, period: { id: "period-1" } });
      if (url.startsWith("/api/contents/packs/after-match?")) return response({ ok: true, pack: null });
      throw new Error(`Unexpected URL: ${url}`);
    });
    await mountPack();
    expect(container.textContent).toContain("Cette opération peut utiliser deux crédits IA.");

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({}, 403);
      if (url.startsWith("/api/contents/packs/after-match?")) return response({ ok: true, pack: null });
      throw new Error(`Unexpected URL: ${url}`);
    });
    await act(async () => root.render(
      <AfterMatchPackBlock
        document={{ ...publication(), id: "publication-2" }}
        isPersistedInCloud
        hasUnsavedChanges={false}
        sourceDocumentRevision={3}
        sourceDocumentStorageUpdatedAt={documentUpdatedAt}
        onOpenSource={vi.fn()}
        onOpenVariant={vi.fn(async () => undefined)}
      />
    ));
    await flush();
    expect(container.textContent).not.toContain("Cette opération peut utiliser deux crédits IA.");
  });

  it("polls with GET only and stops after a terminal state", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({}, 403);
      if (url.startsWith("/api/contents/packs/after-match?")) return response({ ok: true, pack: pack("generating") });
      if (url.endsWith(`/${packId}`)) return response({ ok: true, pack: pack("completed") });
      throw new Error(`Unexpected ${init?.method} URL: ${url}`);
    });
    await mountPack({ currentPack: pack("generating") });

    await act(async () => vi.advanceTimersByTimeAsync(AFTER_MATCH_PACK_POLL_INTERVAL_MS));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith(`/${packId}`))).toHaveLength(1);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);

    await act(async () => vi.advanceTimersByTimeAsync(AFTER_MATCH_PACK_POLL_INTERVAL_MS * 2));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith(`/${packId}`))).toHaveLength(1);
  });

  it("aborts an active polling request when unmounted", async () => {
    vi.useFakeTimers();
    let pollingSignal: AbortSignal | undefined;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({}, 403);
      if (url.startsWith("/api/contents/packs/after-match?")) return response({ ok: true, pack: pack("generating") });
      if (url.endsWith(`/${packId}`)) {
        pollingSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    await mountPack({ currentPack: pack("generating") });
    await act(async () => vi.advanceTimersByTimeAsync(AFTER_MATCH_PACK_POLL_INTERVAL_MS));

    await act(async () => root.unmount());
    expect(pollingSignal?.aborted).toBe(true);
    root = createRoot(container);
  });

  it("opens both completed variants through the supplied existing-editor callback", async () => {
    const onOpenVariant = vi.fn(async () => undefined);
    await mountPack({ currentPack: pack("completed"), onOpenVariant });

    await act(async () => button(container, "Ouvrir le Reel").click());
    await act(async () => button(container, "Ouvrir les Stories").click());

    expect(onOpenVariant.mock.calls).toEqual([["variant-reel"], ["variant-stories"]]);
  });

  it("creates or reopens the mapped Story Studio project and navigates to it", async () => {
    const projectId = "33333333-3333-4333-8333-333333333333";
    const projectBodies: Array<Record<string, unknown>> = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({}, 403);
      if (url.startsWith("/api/contents/packs/after-match?")) return response({ ok: true, pack: pack("completed") });
      if (url === "/api/contents/storage/variants/variant-stories" && init?.method === "GET") {
        return response({ ok: true, variant: makeVariant("stories") });
      }
      if (url === "/api/contents/storage/story-studio/projects" && init?.method === "POST") {
        projectBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return response({ ok: true, project: { id: projectId } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    await mountPack({ currentPack: pack("completed") });

    const createButton = button(container, "Créer les visuels");
    await act(async () => createButton.click());
    await flush();
    await act(async () => button(container, "Créer les visuels").click());
    await flush();

    expect(projectBodies).toHaveLength(2);
    expect(projectBodies[0]).toEqual(projectBodies[1]);
    expect(projectBodies[0]).toMatchObject({
      sourcePackId: packId,
      sourceStoriesVariantId: "variant-stories",
      sourceDocumentId: "publication-1",
      athleteId: null,
      payload: {
        schemaVersion: 1,
        templateKey: "editorial_klique",
        frames: [
          { order: 1, role: "result" },
          { order: 2, role: "context" },
          { order: 3, role: "poll" },
          { order: 4, role: "question" },
        ],
      },
    });
    expect(routerMocks.push).toHaveBeenCalledTimes(2);
    expect(routerMocks.push).toHaveBeenNthCalledWith(1, `/contents/story-studio/${projectId}`);
    expect(routerMocks.push).toHaveBeenNthCalledWith(2, `/contents/story-studio/${projectId}`);
  });

  it("does not offer visual creation before Stories are completed", async () => {
    await mountPack({ currentPack: pack("generating") });
    expect(container.textContent).not.toContain("Créer les visuels");
  });

  it.each([
    ["reel", "Relancer le Reel", "variant-stories"],
    ["stories", "Relancer les Stories", "variant-reel"],
  ] as const)("retries only the failed %s and preserves the completed result", async (deliverable, retryLabel, successfulVariantId) => {
    const partialPack = pack("partial");
    if (deliverable === "reel") {
      partialPack.reel = { status: "failed", errorCode: "VARIATION_GENERATION_FAILED" };
      partialPack.stories = { status: "completed", variantId: "variant-stories" };
    }
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({}, 403);
      if (url.startsWith("/api/contents/packs/after-match?")) return response({ ok: true, pack: partialPack });
      if (url.endsWith("/resume") && init?.method === "POST") return response({ ok: false, code: "PACK_IN_PROGRESS", pack: pack("generating") }, 409);
      throw new Error(`Unexpected URL: ${url}`);
    });
    await mountPack({ currentPack: partialPack });

    expect(container.textContent).toContain(successfulVariantId === "variant-reel" ? "Ouvrir le Reel" : "Ouvrir les Stories");
    await act(async () => button(container, retryLabel).click());

    const resumeCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/resume"));
    expect(resumeCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(resumeCall?.[1]?.body))).toEqual({ deliverables: [deliverable] });
    expect(container.textContent).toContain("Création du Pack en cours…");
    expect(container.textContent).not.toContain(successfulVariantId === "variant-reel" ? "Relancer le Reel" : "Relancer les Stories");
  });

  it.each([
    [402, "AI_CREDIT_INSUFFICIENT", "Crédits IA insuffisants"],
    [404, "PACK_NOT_FOUND", "Le Pack ou la Publication est introuvable."],
    [409, "SOURCE_VERSION_CONFLICT", "La Publication a été modifiée."],
    [500, "INTERNAL_ERROR", "Échec temporaire."],
  ] as const)("shows a safe user error for HTTP %s", async (status, code, expected) => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({}, 403);
      if (url.startsWith("/api/contents/packs/after-match?")) return response({ ok: true, pack: null });
      if (url === "/api/contents/packs/after-match" && init?.method === "POST") return response({ ok: false, code }, status);
      throw new Error(`Unexpected URL: ${url}`);
    });
    await mountPack();
    await act(async () => button(container, "Créer le Pack Après-match").click());
    await act(async () => button(container, "Confirmer la création").click());

    const alert = container.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.textContent).toContain(expected);
    expect(document.activeElement).toBe(alert);
    expect(container.textContent).not.toContain("idempotence");
    expect(container.textContent).not.toContain("SQL");
  });

  it("never mentions a custom-content credit and uses accessible responsive states", async () => {
    await mountPack({ currentPack: pack("generating") });

    expect(container.textContent?.toLowerCase()).not.toContain("crédit contenu personnalisé");
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(".after-match-pack-item");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  const mockCompletedPackFetch = () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({}, 403);
      if (url === "/api/contents/storage/drafts/publication-1") {
        return response({ ok: true, version: 3, storageUpdatedAt: "2026-09-28T08:45:00.000Z" });
      }
      if (url.startsWith("/api/contents/packs/after-match?")) return response({ ok: true, pack: pack("completed") });
      throw new Error(`Unexpected URL: ${url}`);
    });
  };

  it("scrolls and focuses a Pack Reel that was already loaded", async () => {
    variantRepositoryMocks.listBySourceDocument.mockResolvedValue([makeVariant("reel")]);
    mockCompletedPackFetch();
    await act(async () => {
      root.render(<ContentDocumentEditor initialDocument={publication()} onSaveDraft={vi.fn()} isPersistedInCloud />);
    });
    await flush();

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    await act(async () => button(container, "Ouvrir le Reel").click());
    await flush();

    const editor = container.querySelector<HTMLElement>("[data-variant-editor-container]");
    expect(variantRepositoryMocks.getById).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Declinaison: Reel du match");
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(document.activeElement).toBe(editor);
  });

  it("waits for a fetched Pack Stories variant to render before scrolling and focusing", async () => {
    const pendingVariant = deferred<ContentVariant | null>();
    variantRepositoryMocks.getById.mockReturnValue(pendingVariant.promise);
    mockCompletedPackFetch();
    await act(async () => {
      root.render(<ContentDocumentEditor initialDocument={publication()} onSaveDraft={vi.fn()} isPersistedInCloud />);
    });
    await flush();

    await act(async () => button(container, "Ouvrir les Stories").click());
    expect(variantRepositoryMocks.getById).toHaveBeenCalledWith("variant-stories");
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    expect(container.querySelector("[data-variant-editor-container]")).toBeNull();

    await act(async () => pendingVariant.resolve(makeVariant("stories")));
    await flush();

    const editor = container.querySelector<HTMLElement>("[data-variant-editor-container]");
    expect(container.textContent).toContain("Declinaison: Stories du match");
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(editor);
  });

  it("keeps an opened Pack variant when the initial variant list resolves later", async () => {
    const pendingList = deferred<ContentVariant[]>();
    variantRepositoryMocks.listBySourceDocument.mockReturnValue(pendingList.promise);
    variantRepositoryMocks.getById.mockResolvedValue(makeVariant("stories"));
    mockCompletedPackFetch();
    await act(async () => {
      root.render(<ContentDocumentEditor initialDocument={publication()} onSaveDraft={vi.fn()} isPersistedInCloud />);
    });
    await flush();

    await act(async () => button(container, "Ouvrir les Stories").click());
    await flush();
    expect(container.textContent).toContain("Declinaison: Stories du match");
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    await act(async () => pendingList.resolve([makeVariant("reel"), makeVariant("stories")]));
    await flush();

    expect(container.textContent).toContain("Declinaison: Stories du match");
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });
});