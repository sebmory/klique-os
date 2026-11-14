// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runContentsBackfill: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/services/content-backfill", () => ({
  runContentsBackfill: mocks.runContentsBackfill,
}));

import { CreationAssistantScreen } from "@/components/contents/CreationAssistantScreen";
import { createInitialAssistantDraft } from "@/services/content-creation-assistant";
import { getInterviewAngles, serializeInterviewAngle } from "@/services/interview-angles";
import type { ContentCreationContext } from "@/services/contents-hub";

const WORKFLOW_STORAGE_KEY = "klique.contents.creation-assistant.workflow.v2";

const context: ContentCreationContext = {
  mode: "contextual",
  subjectName: "Athlète fictive",
  subjectType: "other",
  objective: "interview",
};

const contextKey = JSON.stringify({
  mode: "contextual",
  subjectId: "",
  subjectName: "Athlète fictive",
  subjectType: "other",
  objective: "interview",
  presetId: "",
});

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const clickButton = async (container: HTMLElement, label: string) => {
  const button = Array.from(container.querySelectorAll("button"))
    .find((candidate) => candidate.textContent?.includes(label));
  expect(button, `Bouton introuvable: ${label}`).toBeDefined();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("Interview angle switching", () => {
  let container: HTMLElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/contents/create");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    const draft = createInitialAssistantDraft(context);
    const afterMatchAngle = getInterviewAngles("after_match")[0];
    if (!afterMatchAngle) throw new Error("Angle Après-match fictif manquant.");
    draft.objective.subtypeId = "after_match";
    draft.parameters.interviewAngleId = afterMatchAngle.id;
    draft.parameters.interviewAngle = serializeInterviewAngle(afterMatchAngle);
    draft.parameters.requiredTopics = "Demander comment la personne envisage la suite.";
    draft.parameters.useContextIntelligence = true;
    draft.parameters.contextEnableExternalNews = true;

    window.sessionStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify({
      version: 2,
      contextKey,
      draft,
      stepIndex: 0,
      contextState: {
        loading: false,
        errorMessage: null,
        collectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        items: [],
        reports: [],
        researchedAt: "2026-11-14T10:00:00.000Z",
        dateRange: {
          preset: "last_30_days",
          from: "2026-10-15",
          to: "2026-11-14",
        },
        hasCollected: true,
      },
    }));

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url === "/api/ai-credits/balance") return response({ ok: false }, 403);
      if (url === "/api/media-subscriptions") return response({ ok: false }, 404);
      if (url === "/api/athletes") {
        return response({ source: "fixture", athletes: [] });
      }
      if (url === "/api/context/collect" && method === "POST") {
        return response({
          ok: true,
          collectionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          expiresAt: "2026-11-14T11:30:00.000Z",
          items: [],
          reports: [{
            connectorId: "external_news",
            status: "empty",
            itemCount: 0,
            message: "Recherche externe simulée sans résultat.",
          }],
          summary: {
            totalItemsFound: 0,
            selectedItemsCount: 0,
            externalSourcesCount: 0,
            researchedAt: "2026-11-14T11:00:00.000Z",
            dateRange: {
              preset: "last_30_days",
              from: "2026-10-15",
              to: "2026-11-14",
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
    vi.unstubAllGlobals();
  });

  it("clears the after-match angle when switching to injury return and sends only the new canonical angle", async () => {
    await act(async () => {
      root.render(<CreationAssistantScreen context={context} />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Lire le match");
    expect(container.textContent).toContain("Aperçu du brief");

    await clickButton(container, "Retour de blessure");

    expect(container.textContent).not.toContain("Lire le match");
    expect(container.textContent).not.toContain("Aperçu du brief");
    expect(container.textContent).toContain("Les étapes de la reprise");
    expect(container.textContent).toContain("Retrouver ses repères");
    expect(container.textContent).toContain("Reprendre confiance");

    await clickButton(container, "Les étapes de la reprise");

    expect(container.textContent).toContain("Aperçu du brief");
    expect(container.textContent).toContain("Ne confirmer ni blessure, ni diagnostic, ni date de reprise");

    await clickButton(container, "Préparer mes questions");

    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) =>
        String(input) === "/api/content/generate")).toBe(true);
    });
    const generationCall = fetchMock.mock.calls.find(([input]) =>
      String(input) === "/api/content/generate");
    expect(generationCall).toBeDefined();
    const body = JSON.parse(String((generationCall?.[1] as RequestInit | undefined)?.body)) as {
      payload: {
        objective: { subtypeId: string };
        parameters: {
          additionalContext: string;
          requiredTopics: string[];
          contextIntelligence: { selectedConnectorIds: string[] };
        };
      };
    };

    expect(body.payload.objective.subtypeId).toBe("injury_return");
    expect(body.payload.parameters.additionalContext).toContain("Les étapes de la reprise");
    expect(body.payload.parameters.additionalContext).toContain("Ne confirmer ni blessure");
    expect(body.payload.parameters.additionalContext).not.toContain("Lire le match");
    expect(body.payload.parameters.requiredTopics).toEqual([
      "Demander comment la personne envisage la suite.",
    ]);
    expect(body.payload.parameters.contextIntelligence.selectedConnectorIds)
      .toContain("external_news");
  });
});
