// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigateToContentResult: vi.fn(),
  runContentsBackfill: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/services/content-result-navigation", () => ({
  navigateToContentResult: mocks.navigateToContentResult,
}));

vi.mock("@/services/content-backfill", () => ({
  runContentsBackfill: mocks.runContentsBackfill,
}));

import { CreationAssistantScreen } from "@/components/contents/CreationAssistantScreen";
import { ContentsHubService } from "@/services/contents-hub";

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
  return button!;
};

const getNextButton = (container: HTMLElement): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.includes("Suivant"));
  expect(button).toBeDefined();
  return button!;
};

const contextResponse = {
  ok: true,
  collectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  expiresAt: "2026-10-19T11:30:00.000Z",
  items: [{
    id: "item-1",
    connectorId: "crm",
    category: "profile",
    title: "Profil public",
    summary: "Mila Martin evolue au FC Lausanne.",
    factualStatement: "Mila Martin evolue au FC Lausanne.",
    statementType: "fact",
    sourceType: "internal",
    sourceName: "Projection editoriale Athlete",
    sourceUrl: "https://example.com/mila-martin",
    publishedAt: "2026-10-18T09:30:00.000Z",
    retrievedAt: "2026-10-19T11:00:00.000Z",
    confidence: "high",
    verificationStatus: "verified",
    isSelected: true,
    isEditable: true,
    metadata: {},
  }],
  reports: [
    { connectorId: "crm", status: "completed", itemCount: 1 },
    { connectorId: "manual", status: "empty", itemCount: 0 },
    { connectorId: "external_news", status: "completed", itemCount: 2 },
  ],
  summary: {
    totalItemsFound: 1,
    selectedItemsCount: 1,
    externalSourcesCount: 0,
    researchedAt: "2026-10-19T11:00:00.000Z",
    dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
    warnings: [],
  },
};

const articleResult = {
  title: "Mila Martin, un parcours documente",
  lead: "Un article fonde sur les faits transmis.",
  sections: [{ order: 1, heading: "Parcours", paragraphs: ["Un paragraphe documente."] }],
  conclusion: "Une conclusion prudente.",
  usedCitations: [],
  usedSources: [],
  estimatedWordCount: 120,
  metadata: {
    templateId: "article",
    templateVersion: "v1",
    editorial: {
      dossierRevision: 1,
      generationMode: "ready",
      confidence: { level: "high", reasons: ["Fait verifie"] },
      usedSources: [],
      contradictions: [],
      missingInformation: [],
      warnings: [],
    },
  },
};

describe("Article creation UI", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("exposes Article as a generator distinct from Publication", () => {
    const article = ContentsHubService.generators().find((generator) => generator.id === "article");
    const publication = ContentsHubService.generators().find((generator) => generator.id === "publication");

    expect(article).toMatchObject({
      title: "Article",
      entryRoute: "/contents/create?objective=article",
      isAvailable: true,
    });
    expect(article?.description).toContain("article éditorial documenté");
    expect(publication).toMatchObject({
      title: "Publication",
      entryRoute: "/contents/create?objective=publication",
    });
    expect(ContentsHubService.contextFromSearchParams({ objective: "article" })).toEqual({
      mode: "free",
      objective: "article",
      presetId: undefined,
    });
  });

  it.each(["interview", "publication"] as const)(
    "does not apply Article progression locks to %s",
    async (objective) => {
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/ai-credits/balance") return response({ ok: false }, 403);
        if (url === "/api/media-subscriptions") return response({ ok: false }, 404);
        throw new Error(`Unexpected request: ${url}`);
      }));

      await act(async () => {
        root.render(
          <CreationAssistantScreen
            context={{
              mode: "contextual",
              subjectId: "athlete-1",
              subjectName: "Mila Martin",
              subjectType: "athlete",
              objective,
            }}
          />,
        );
        await Promise.resolve();
      });

      expect(getNextButton(container).disabled).toBe(false);
      expect(getNextButton(container).getAttribute("aria-disabled")).toBe("false");
    },
  );

  it("runs context, angles, structures and final Article once before creating the result session", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/ai-credits/balance") return response({ ok: false }, 403);
      if (url === "/api/media-subscriptions") return response({ ok: false }, 404);
      if (url === "/api/context/collect" && method === "POST") return response(contextResponse);
      if (url === "/api/contents/generate/article" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as { action: string };
        if (body.action === "angles") {
          return response({
            ok: true,
            action: "angles",
            result: {
              suggestions: [
                { id: "angle-1", title: "Le parcours recent", rationale: "Angle fonde sur le profil." },
                { id: "angle-2", title: "La progression", rationale: "Angle prudent." },
                { id: "angle-3", title: "Le role public", rationale: "Angle documente." },
              ],
            },
          });
        }
        if (body.action === "structures") {
          return response({
            ok: true,
            action: "structures",
            result: {
              suggestions: [{
                id: "structure-1",
                title: "Du profil aux faits",
                editorialPromise: "Une structure strictement factuelle.",
                estimatedWordCount: 700,
                sections: [{ order: 1, title: "Parcours", purpose: "Presenter les faits." }],
              }],
            },
          });
        }
        return response({
          ok: true,
          action: "final",
          result: {
            article: articleResult,
            metadata: {
              provider: "openai",
              model: "test-model",
              generatedAt: "2026-10-19T11:05:00.000Z",
              generationDurationMs: 20,
            },
          },
        });
      }
      if (url === "/api/contents/storage/sessions" && method === "POST") {
        return response({ ok: true, sessionId: "article-session-1" }, 201);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <CreationAssistantScreen
          context={{
            mode: "contextual",
            subjectId: "athlete-1",
            subjectName: "Mila Martin",
            subjectType: "athlete",
            objective: "article",
          }}
        />,
      );
      await Promise.resolve();
    });

    await clickButton(container, "Suivant");
    await clickButton(container, "Actualite");
    await clickButton(container, "Suivant");
    await clickButton(container, "Suivant");
    await clickButton(container, "Rechercher le contexte");

    const reports = Array.from(container.querySelectorAll(".creation-context-report-head"));
    const manualReport = reports.find((report) => report.querySelector("strong")?.textContent === "Contexte manuel");
    const externalReport = reports.find((report) => report.querySelector("strong")?.textContent === "Actualité externe");
    expect(manualReport?.querySelector("span")?.textContent).toBe("Aucune donnée reçue");
    expect(externalReport?.querySelector("span")?.textContent).toBe("Données récupérées");
    expect(manualReport?.querySelector("strong")).not.toBe(manualReport?.querySelector("span"));
    expect(container.textContent).toContain("Révision et sélection");
    expect(container.textContent).toContain("sélectionné(s)");
    expect(container.textContent).toContain("Tout sélectionner");
    expect(container.textContent).toContain("Tout désélectionner");

    const contextItem = container.querySelector(".creation-context-card");
    expect(contextItem).not.toBeNull();
    expect(container.querySelector(".creation-context-cards > ul")).toBeNull();
    expect(container.querySelector(".creation-context-cards > li")).toBeNull();
    expect(contextItem?.querySelector(".creation-context-card-check input[type='checkbox']")).not.toBeNull();
    expect(contextItem?.querySelector(".creation-context-card-head h5")?.textContent).toBe("Profil public");
    expect(contextItem?.querySelector(".creation-context-card-badge")?.textContent).toContain("Profil");
    expect(contextItem?.querySelector(".creation-context-card-copy")?.textContent)
      .toBe("Mila Martin evolue au FC Lausanne.");
    expect(contextItem?.querySelector("textarea")).toBeNull();
    expect(contextItem?.querySelector(".creation-context-card-meta strong")?.textContent).toBe("Projection editoriale Athlete");
    expect(contextItem?.querySelector(".creation-context-card-meta time")?.getAttribute("datetime"))
      .toBe("2026-10-18T09:30:00.000Z");
    expect(contextItem?.querySelector<HTMLAnchorElement>(".creation-context-card-meta a")?.href)
      .toBe("https://example.com/mila-martin");

    await clickButton(container, "Modifier");
    const editArea = container.querySelector<HTMLTextAreaElement>(".creation-context-card-editor textarea");
    expect(editArea).not.toBeNull();
    expect(editArea?.classList.contains("creation-textarea")).toBe(true);
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      valueSetter?.call(editArea, "Modification annulee");
      editArea!.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    await clickButton(container, "Annuler");
    expect(container.querySelector(".creation-context-card-editor textarea")).toBeNull();
    expect(container.querySelector(".creation-context-card-copy")?.textContent)
      .toBe("Mila Martin evolue au FC Lausanne.");

    await clickButton(container, "Modifier");
    const savedEditArea = container.querySelector<HTMLTextAreaElement>(".creation-context-card-editor textarea");
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      valueSetter?.call(savedEditArea, "Version editoriale modifiee.");
      savedEditArea!.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    await clickButton(container, "Enregistrer la modification");
    expect(container.querySelector(".creation-context-card-editor textarea")).toBeNull();
    expect(container.querySelector(".creation-context-card-copy")?.textContent)
      .toBe("Version editoriale modifiee.");

    await clickButton(container, "Suivant");
    expect(getNextButton(container).disabled).toBe(true);
    expect(getNextButton(container).getAttribute("aria-disabled")).toBe("true");
    await clickButton(container, "Proposer des angles");
    expect(getNextButton(container).disabled).toBe(true);
    await clickButton(container, "Le parcours recent");
    expect(getNextButton(container).disabled).toBe(false);
    expect(getNextButton(container).getAttribute("aria-disabled")).toBe("false");
    await clickButton(container, "Suivant");
    expect(getNextButton(container).disabled).toBe(true);
    await clickButton(container, "Proposer des structures");
    expect(getNextButton(container).disabled).toBe(true);
    await clickButton(container, "Du profil aux faits");
    expect(getNextButton(container).disabled).toBe(false);
    await clickButton(container, "Suivant");

    const finalButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Creer l article"));
    expect(finalButton).toBeDefined();
    await act(async () => {
      finalButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      finalButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const articleActions = fetchMock.mock.calls
      .filter(([input]) => String(input) === "/api/contents/generate/article")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)).action);
    expect(articleActions).toEqual(["angles", "structures", "final"]);
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/contents/storage/sessions")).toHaveLength(1);
    expect(mocks.navigateToContentResult).toHaveBeenCalledTimes(1);

    const angleRequest = JSON.parse(String(
      (fetchMock.mock.calls.find(([, init]) =>
        JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")).action === "angles")?.[1] as RequestInit).body,
    ));
    expect(angleRequest.request.contextSelection.collectionId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(angleRequest.request.selectedContextItems).toEqual([]);
    expect(JSON.stringify(angleRequest.request)).not.toContain("Mila Martin evolue au FC Lausanne");
  });

  it("keeps the Article workflow on the angle step when eligibility blocks generation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/ai-credits/balance") return response({ ok: false }, 403);
      if (url === "/api/media-subscriptions") return response({ ok: false }, 404);
      if (url === "/api/context/collect" && method === "POST") return response(contextResponse);
      if (url === "/api/contents/generate/article" && method === "POST") {
        return response({
          ok: false,
          message: "Article bloque: aucun fait exploitable.",
          editorial: {
            missingInformation: ["Ajoutez au moins un fait verifie."],
            warnings: [],
          },
        }, 422);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <CreationAssistantScreen
          context={{
            mode: "contextual",
            subjectId: "athlete-1",
            subjectName: "Mila Martin",
            subjectType: "athlete",
            objective: "article",
          }}
        />,
      );
      await Promise.resolve();
    });

    await clickButton(container, "Suivant");
    await clickButton(container, "Actualite");
    await clickButton(container, "Suivant");
    await clickButton(container, "Suivant");
    await clickButton(container, "Rechercher le contexte");
    await clickButton(container, "Suivant");
    await clickButton(container, "Proposer des angles");

    expect(container.textContent).toContain("Article bloque: aucun fait exploitable.");
    expect(container.textContent).toContain("Ajoutez au moins un fait verifie.");
    expect(container.textContent).toContain("Angle editorial de l article");
    expect(getNextButton(container).disabled).toBe(true);
    expect(getNextButton(container).getAttribute("aria-disabled")).toBe("true");
    await clickButton(container, "Suivant");
    expect(container.textContent).toContain("Angle editorial de l article");
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/contents/storage/sessions")).toHaveLength(0);
    expect(mocks.navigateToContentResult).not.toHaveBeenCalled();
  });
});
