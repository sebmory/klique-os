// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAuthenticatedContentStorageRole } from "@/services/content-storage-access";

const mocks = vi.hoisted(() => ({
  navigateToContentResult: vi.fn(),
  runContentsBackfill: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("step=summary"),
}));

vi.mock("@/services/content-result-navigation", () => ({
  navigateToContentResult: mocks.navigateToContentResult,
}));

vi.mock("@/services/content-backfill", () => ({
  runContentsBackfill: mocks.runContentsBackfill,
}));

vi.mock("@/components/contents/InterviewResultScreen", () => ({
  InterviewResultScreen: ({ initialResult }: { initialResult: { title: string } }) =>
    createElement("section", { "data-testid": "final-interview" }, initialResult.title),
}));

vi.mock("@/components/contents/ArticleResultScreen", () => ({
  ArticleResultScreen: () => null,
}));

vi.mock("@/components/contents/ArticleDocumentEditor", () => ({
  ArticleDocumentEditor: () => null,
}));

vi.mock("@/components/contents/ContentDocumentEditor", () => ({
  ContentDocumentEditor: () => null,
}));

import { CreationAssistantScreen } from "@/components/contents/CreationAssistantScreen";
import { InterviewResultPageClient } from "@/components/contents/InterviewResultPageClient";
import { ContentCreationAssistantService } from "@/services/content-creation-assistant";
import { ContentVariantRepositoryService } from "@/services/content-variants/repository";

const preparedPayload = {
  templateId: "interview",
  context: { mode: "contextual" },
  subject: {
    id: "athlete-1",
    type: "person",
    source: "crm",
    displayName: "Mila Martin",
    photoAvailable: false,
  },
  objective: { id: "interview", subtypeId: "portrait" },
  parameters: {
    language: "fr",
    toneId: "journalistic",
    questionCount: 5,
    formatId: "written",
    audienceId: "general",
    additionalContext: "",
    requiredTopics: [],
    avoidedTopics: [],
    contextIntelligence: {
      enabled: false,
      selectedConnectorIds: [],
      dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
      sourcePreference: "official_and_reliable",
      searchDepth: "standard",
      selectedItemIds: [],
      manualEdits: [],
      selectedContextItems: [],
    },
  },
} as const;

const generatedRequest = {
  requestType: "interview",
  contextSelection: {},
};

const generatedResult = {
  title: "Interview finale de Mila Martin",
  metadata: { generatedAt: "2026-10-19T10:00:00.000Z" },
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("content generation to result integration", () => {
  let container: HTMLElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;
  let preparePayloadSpy: ReturnType<typeof vi.spyOn>;
  let releaseSessionRead: () => void;
  let sessionReadGate: Promise<void>;
  let sessionCreationStatus: number;

  beforeEach(() => {
    vi.clearAllMocks();
    setAuthenticatedContentStorageRole("media");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/contents/create?step=summary");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    preparePayloadSpy = vi.spyOn(ContentCreationAssistantService, "preparePayload")
      .mockReturnValue(preparedPayload as never);
    sessionReadGate = new Promise<void>((resolve) => {
      releaseSessionRead = resolve;
    });
    sessionCreationStatus = 201;

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/content/generate" && method === "POST") {
        return jsonResponse({ ok: true, request: generatedRequest, result: generatedResult }, 200);
      }
      if (url === "/api/contents/storage/sessions" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as { sessionId: string };
        return sessionCreationStatus === 201
          ? jsonResponse({ ok: true, sessionId: body.sessionId }, 201)
          : jsonResponse({ ok: false, message: "Session indisponible." }, sessionCreationStatus);
      }
      if (url.startsWith("/api/contents/storage/drafts/")) {
        return jsonResponse({ ok: false, message: "Brouillon introuvable." }, 404);
      }
      if (url.startsWith("/api/contents/storage/sessions/")) {
        await sessionReadGate;
        const sessionId = decodeURIComponent(url.split("/").pop() ?? "");
        return jsonResponse({
          ok: true,
          sessionId,
          session: {
            payload: preparedPayload,
            request: generatedRequest,
            result: generatedResult,
            createdAt: "2026-10-19T10:00:00.000Z",
          },
        }, 200);
      }
      if (url.startsWith("/api/contents/storage/variants?")) {
        return jsonResponse({ ok: false, message: "Aucune variante." }, 404);
      }
      if (url === "/api/ai-credits/balance") {
        return jsonResponse({ ok: false }, 403);
      }
      if (url === "/api/media-subscriptions") {
        return jsonResponse({ ok: false }, 404);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    preparePayloadSpy.mockRestore();
    setAuthenticatedContentStorageRole(null);
    vi.unstubAllGlobals();
  });

  it("keeps the successful flow on the final interview without a paid retry", async () => {
    await act(async () => {
      root.render(
        <CreationAssistantScreen
          context={{
            mode: "contextual",
            subjectId: "athlete-1",
            subjectName: "Mila Martin",
            subjectType: "athlete",
            objective: "interview",
          }}
        />,
      );
      await Promise.resolve();
    });

    const generateButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Creer l interview"));
    expect(generateButton).toBeDefined();

    await act(async () => {
      generateButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const generationCalls = fetchMock.mock.calls.filter(([input, init]) =>
      String(input) === "/api/content/generate" && (init as RequestInit | undefined)?.method === "POST");
    const sessionCreationCalls = fetchMock.mock.calls.filter(([input, init]) =>
      String(input) === "/api/contents/storage/sessions" && (init as RequestInit | undefined)?.method === "POST");

    expect(generationCalls).toHaveLength(1);
    expect(sessionCreationCalls).toHaveLength(1);
    expect(mocks.navigateToContentResult).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Creation en cours");

    const resultUrl = mocks.navigateToContentResult.mock.calls[0]?.[0] as string;
    window.history.replaceState(null, "", resultUrl);

    await act(async () => {
      root.render(<InterviewResultPageClient />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Chargement du resultat");

    await act(async () => {
      releaseSessionRead();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const variants = await ContentVariantRepositoryService.listBySourceDocument(
      "document-2026-10-19T10:00:00.000Z",
    );

    expect(variants).toEqual([]);
    expect(container.querySelector('[data-testid="final-interview"]')?.textContent)
      .toBe("Interview finale de Mila Martin");
    expect(container.textContent).not.toContain("Selectionnez un type de sujet");
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/contents/storage/drafts/")))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/contents/storage/variants?")))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/content/generate"))
      .toHaveLength(1);
  });

  it("keeps the current data and exposes a manual retry when session creation fails", async () => {
    sessionCreationStatus = 500;
    await act(async () => {
      root.render(
        <CreationAssistantScreen
          context={{
            mode: "contextual",
            subjectId: "athlete-1",
            subjectName: "Mila Martin",
            subjectType: "athlete",
            objective: "interview",
          }}
        />,
      );
      await Promise.resolve();
    });

    const generateButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Creer l interview"));

    await act(async () => {
      generateButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Reessayer");
    expect(container.textContent).toContain("Mila Martin");
    expect(mocks.navigateToContentResult).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/content/generate"))
      .toHaveLength(1);
  });
});
