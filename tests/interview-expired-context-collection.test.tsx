// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAuthenticatedContentStorageRole } from "@/services/content-storage-access";

const mocks = vi.hoisted(() => ({
  runContentsBackfill: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("step=summary"),
}));

vi.mock("@/services/content-backfill", () => ({
  runContentsBackfill: mocks.runContentsBackfill,
}));

import { CreationAssistantScreen } from "@/components/contents/CreationAssistantScreen";
import { createInitialAssistantDraft } from "@/services/content-creation-assistant";
import type { ContentCreationContext } from "@/services/contents-hub";

const WORKFLOW_STORAGE_KEY = "klique.contents.creation-assistant.workflow.v2";
const OLD_COLLECTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FRESH_COLLECTION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const context: ContentCreationContext = {
  mode: "contextual",
  subjectId: "athlete-1",
  subjectName: "Mila Martin",
  subjectType: "athlete",
  objective: "interview",
};
const contextKey = JSON.stringify({
  ...context,
  presetId: "",
});

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("expired interview context collection", () => {
  let container: HTMLElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setAuthenticatedContentStorageRole("admin");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/contents/create?step=summary");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    const draft = createInitialAssistantDraft(context);
    draft.objective.subtypeId = "portrait";
    draft.parameters.interviewAngleId = "portrait-trigger";
    window.sessionStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify({
      version: 2,
      contextKey,
      draft,
      stepIndex: 0,
      contextState: {
        loading: false,
        errorMessage: null,
        items: [],
        reports: [],
        hasCollected: true,
        collectionId: OLD_COLLECTION_ID,
        expiresAt: "2000-01-01T00:00:00.000Z",
      },
    }));

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/ai-credits/balance") return response({ ok: false }, 403);
      if (url === "/api/media-subscriptions") return response({ ok: false }, 404);
      if (url === "/api/athletes") return response({ source: "fixture", athletes: [] });
      if (url === "/api/context/collect" && method === "POST") {
        return response({
          ok: true,
          collectionId: FRESH_COLLECTION_ID,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          items: [],
          reports: [],
          summary: {
            totalItemsFound: 0,
            selectedItemsCount: 0,
            externalSourcesCount: 0,
            researchedAt: "2026-11-16T18:45:00.000Z",
            dateRange: {
              preset: "last_30_days",
              from: "2026-10-18",
              to: "2026-11-16",
            },
            warnings: [],
          },
        });
      }
      if (url === "/api/content/generate" && method === "POST") {
        return response({
          ok: false,
          code: "GENERATION_FAILED",
          message: "Génération simulée pour le test.",
        }, 502);
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
    setAuthenticatedContentStorageRole(null);
    vi.unstubAllGlobals();
  });

  it("collects fresh context before generating instead of reusing an expired collection", async () => {
    await act(async () => {
      root.render(<CreationAssistantScreen context={context} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const generateButton = Array.from(container.querySelectorAll("button"))
      .find((button) => (
        button.textContent?.includes("Préparer mes questions")
        || button.textContent?.includes("Creer l interview")
      ));
    expect(generateButton).toBeDefined();

    await act(async () => {
      generateButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const relevantCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = String(input);
      return url === "/api/context/collect" || url === "/api/content/generate";
    });
    expect(relevantCalls.map(([input]) => String(input))).toEqual([
      "/api/context/collect",
      "/api/content/generate",
    ]);
    const generationBody = JSON.parse(
      String((relevantCalls[1]?.[1] as RequestInit | undefined)?.body),
    ) as {
      payload: {
        parameters: {
          contextIntelligence: {
            collectionId?: string;
          };
        };
      };
    };
    expect(generationBody.payload.parameters.contextIntelligence.collectionId)
      .toBe(FRESH_COLLECTION_ID);
    expect(JSON.stringify(generationBody)).not.toContain(OLD_COLLECTION_ID);
  });
});
