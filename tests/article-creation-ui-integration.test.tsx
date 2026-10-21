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
import { ContentsHubService, type ContentCreationContext } from "@/services/contents-hub";
import {
  ContentCreationAssistantService,
  createInitialAssistantDraft,
} from "@/services/content-creation-assistant";

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

  it("restores structured journalistic material after a reload", async () => {
    const context: ContentCreationContext = {
      mode: "contextual",
      subjectId: "athlete-1",
      subjectName: "Mila Martin",
      subjectType: "athlete",
      objective: "article",
    };
    const draft = createInitialAssistantDraft(context);
    draft.objective.subtypeId = "portrait";
    draft.parameters.manualEditorialMaterials = [{
      id: "quote-1",
      kind: "verbatim_quote",
      text: "Je veux progresser avec le groupe.",
      provenance: "Entretien KLIQUE",
      sourceDate: "2026-10-20",
      speaker: "Mila Martin",
    }];
    window.sessionStorage.setItem(
      "klique.contents.creation-assistant.workflow.v2",
      JSON.stringify({
        version: 2,
        contextKey: JSON.stringify({
          mode: context.mode,
          subjectId: context.subjectId,
          subjectName: context.subjectName,
          subjectType: context.subjectType,
          objective: context.objective,
          presetId: "",
        }),
        draft,
        stepIndex: 2,
        contextState: {
          loading: false,
          errorMessage: null,
          items: [],
          reports: [],
          hasCollected: false,
        },
      }),
    );
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({ ok: false }, 403);
      if (url === "/api/media-subscriptions") return response({ ok: false }, 404);
      throw new Error(`Unexpected request: ${url}`);
    }));

    await act(async () => {
      root.render(<CreationAssistantScreen context={context} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Matière journalistique");
    expect(container.textContent).toContain("Texte exact, reproduit mot pour mot");
    expect((container.querySelector('[aria-label="Locuteur de la citation 1"]') as HTMLInputElement).value)
      .toBe("Mila Martin");
    expect((container.querySelector('[aria-label="Provenance de la matière 1"]') as HTMLInputElement).value)
      .toBe("Entretien KLIQUE");
    expect((container.querySelector('[aria-label="Texte de la matière 1"]') as HTMLTextAreaElement).value)
      .toBe("Je veux progresser avec le groupe.");
  });

  it("selects, attributes and invalidates an exact interview excerpt without altering independent material", async () => {
    const context: ContentCreationContext = {
      mode: "contextual",
      subjectId: "athlete-1",
      subjectName: "Mila Martin",
      subjectType: "athlete",
      objective: "article",
    };
    const draft = createInitialAssistantDraft(context);
    const sourceText = [
      "Journaliste : Quel est votre objectif ?",
      "Mila Martin : Je veux progresser avec le groupe.",
    ].join("\n");
    const answer = "Je veux progresser avec le groupe.";
    const question = "Quel est votre objectif ?";
    draft.objective.subtypeId = "portrait";
    draft.parameters.manualEditorialMaterials = [{
      id: "independent-note",
      kind: "note",
      text: "Note indépendante.",
      provenance: "Carnet du journaliste",
      sourceDate: "2026-10-21",
    }];
    draft.parameters.manualInterviewSource = {
      id: "interview-1",
      provenance: "Entretien KLIQUE fictif",
      sourceDate: "2026-10-21",
      interviewer: "Lea Journaliste",
      interviewee: "Mila Martin",
      sourceText,
      excerpts: [{
        id: "question-1",
        start: sourceText.indexOf(question),
        end: sourceText.indexOf(question) + question.length,
        text: question,
        speakerRole: "interviewer",
        confirmed: true,
      }],
    };
    window.sessionStorage.setItem(
      "klique.contents.creation-assistant.workflow.v2",
      JSON.stringify({
        version: 2,
        contextKey: JSON.stringify({
          mode: context.mode,
          subjectId: context.subjectId,
          subjectName: context.subjectName,
          subjectType: context.subjectType,
          objective: context.objective,
          presetId: "",
        }),
        draft,
        stepIndex: 2,
        contextState: {
          loading: false,
          errorMessage: null,
          collectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          expiresAt: "2026-10-20T10:00:00.000Z",
          items: [],
          reports: [],
          hasCollected: true,
        },
      }),
    );
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({ ok: false }, 403);
      if (url === "/api/media-subscriptions") return response({ ok: false }, 404);
      throw new Error(`Unexpected request: ${url}`);
    }));

    await act(async () => {
      root.render(<CreationAssistantScreen context={context} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Exploiter un entretien");
    expect(container.textContent).toContain("Note indépendante.");
    expect(container.textContent).toContain("Note — intervention de l’intervieweur");
    expect(container.textContent).toContain("Le brouillon de l’entretien est conservé uniquement dans cet onglet.");

    const sourceArea = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Texte source de l’entretien"]',
    );
    const answerStart = sourceText.indexOf(answer);
    sourceArea!.focus();
    sourceArea!.setSelectionRange(answerStart, answerStart + answer.length);
    await clickButton(container, "Ajouter cet extrait");

    const speakerSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Locuteur de l’extrait sélectionné"]',
    );
    expect(speakerSelect?.value).toBe("");
    expect(container.textContent).toContain("Aperçu avant confirmation");
    expect(container.textContent).toContain(answer);

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      valueSetter?.call(speakerSelect, "interviewee");
      speakerSelect!.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await clickButton(container, "Confirmer l’extrait");

    expect(container.textContent).toContain("Extrait ajouté. Vous le retrouvez ci-dessous");
    expect(container.textContent).toContain("Citation exacte");
    expect(container.textContent).toContain("Texte lié à l’entretien, en lecture seule.");

    const provenanceInput = container.querySelector<HTMLInputElement>(
      '[aria-label="Provenance de l’entretien"]',
    );
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(provenanceInput, "Entretien KLIQUE corrigé");
      provenanceInput!.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("La source a changé. Ses extraits ont été retirés");
    expect(container.textContent).not.toContain("Citation exacte");
    expect(container.textContent).toContain("Note indépendante.");
    const persisted = JSON.parse(
      window.sessionStorage.getItem("klique.contents.creation-assistant.workflow.v2") ?? "{}",
    ) as {
      draft?: { parameters?: { manualInterviewSource?: { excerpts?: unknown[] } } };
      contextState?: { collectionId?: string; expiresAt?: string };
    };
    expect(persisted.draft?.parameters?.manualInterviewSource?.excerpts).toEqual([]);
    expect(persisted.contextState?.collectionId).toBeUndefined();
    expect(persisted.contextState?.expiresAt).toBeUndefined();
  });

  it("keeps the full interview source out of the Article generation payload", () => {
    const context: ContentCreationContext = {
      mode: "contextual",
      subjectId: "athlete-1",
      subjectName: "Mila Martin",
      subjectType: "athlete",
      objective: "article",
    };
    const draft = createInitialAssistantDraft(context);
    draft.objective.subtypeId = "portrait";
    draft.parameters.manualInterviewSource = {
      id: "interview-private",
      provenance: "Entretien KLIQUE fictif",
      sourceDate: "2026-10-21",
      interviewer: "Lea Journaliste",
      interviewee: "Mila Martin",
      sourceText: "TRANSCRIPTION_COMPLETE_CONFIDENTIELLE",
      excerpts: [{
        id: "excerpt-1",
        start: 0,
        end: 13,
        text: "TRANSCRIPTION",
        speakerRole: "interviewee",
        confirmed: true,
      }],
    };

    const payload = ContentCreationAssistantService.preparePayload({
      context,
      draft,
      contextCollectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      selectedContextItems: [],
    });

    expect(payload).not.toBeNull();
    expect(JSON.stringify(payload)).not.toContain("TRANSCRIPTION_COMPLETE_CONFIDENTIELLE");
    expect(JSON.stringify(payload)).not.toContain("manualInterviewSource");
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
    expect(angleRequest.request.brief.articleType).toBe("actualite");
    expect(angleRequest.request.selectedContextItems).toEqual([]);
    expect(JSON.stringify(angleRequest.request)).not.toContain("Mila Martin evolue au FC Lausanne");
  });

  it("ends Structures loading after a timeout and retries manually without losing the form", async () => {
    let structureAttempts = 0;
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
        structureAttempts += 1;
        if (structureAttempts === 1) {
          return response({
            ok: false,
            code: "ARTICLE_STRUCTURE_TIMEOUT",
            message: "La génération des structures a dépassé le délai autorisé. Vous pouvez réessayer.",
          }, 504);
        }
        return response({
          ok: true,
          action: "structures",
          result: {
            suggestions: [{
              id: "structure-retry",
              title: "Structure récupérée",
              editorialPromise: "Conserver les faits sélectionnés.",
              estimatedWordCount: 500,
              sections: [{ order: 1, title: "Repères", purpose: "Présenter les faits." }],
            }],
          },
        });
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
    await clickButton(container, "Le parcours recent");
    await clickButton(container, "Suivant");
    await clickButton(container, "Proposer des structures");

    expect(container.textContent).toContain("dépassé le délai autorisé");
    const retryButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Réessayer"));
    expect(retryButton).toBeDefined();
    expect(retryButton?.disabled).toBe(false);
    expect(container.textContent).not.toContain("Génération des structures");
    expect(getNextButton(container).disabled).toBe(true);

    await clickButton(container, "Réessayer");

    expect(container.textContent).toContain("Structure récupérée");
    expect(container.textContent).not.toContain("dépassé le délai autorisé");
    const structureRequests = fetchMock.mock.calls
      .filter(([input, init]) =>
        String(input) === "/api/contents/generate/article"
        && JSON.parse(String((init as RequestInit).body)).action === "structures")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(structureRequests).toHaveLength(2);
    expect(structureRequests[0].requestId).not.toBe(structureRequests[1].requestId);
    expect(structureRequests[0].request.brief.selectedAngle).toBe("Le parcours recent");
    expect(structureRequests[1].request.brief.selectedAngle).toBe("Le parcours recent");
    expect(structureRequests[1].request.contextSelection.collectionId)
      .toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
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
            reasons: [
              "Aucun fait individuel récent, explicitement attribué au sujet et suffisamment fiable n’est disponible pour un article d’actualité.",
            ],
            missingInformation: ["Ajoutez au moins un fait verifie."],
            contradictions: ["Une contradiction non résolue a été exclue."],
            warnings: [],
            itemDiagnostics: [{
              itemId: "item-1",
              status: "ineligible",
              reasons: ["Fait exclu pour ancienneté dans le cadre de cet article."],
            }],
            suggestedArticleTypes: ["portrait", "analyse"],
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
    expect(container.textContent).toContain("Aucun fait individuel récent");
    expect(container.textContent).toContain("Une contradiction non résolue");
    expect(container.textContent).toContain("Fait exclu pour ancienneté");
    expect(container.textContent).toContain("Comment débloquer la génération ?");
    expect(container.textContent).toContain("Portrait ou une Analyse");
    expect(container.textContent).toContain("ne garantit pas");
    expect(container.textContent).toContain("Revenir au type d’article");
    expect(container.textContent).toContain("Ajouter une information vérifiée");
    expect(container.textContent).toContain("Angle editorial de l article");
    expect(getNextButton(container).disabled).toBe(true);
    expect(getNextButton(container).getAttribute("aria-disabled")).toBe("true");
    await clickButton(container, "Suivant");
    expect(container.textContent).toContain("Angle editorial de l article");
    await clickButton(container, "Ajouter une information vérifiée");
    expect(container.textContent).toContain("Les éléments cochés ne sont pas tous nécessairement éligibles");
    expect(container.textContent).toContain("Non exploitable");
    expect(container.textContent).toContain("Fait exclu pour ancienneté");
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/contents/storage/sessions")).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/contents/generate/article")).toHaveLength(1);
    expect(mocks.navigateToContentResult).not.toHaveBeenCalled();
  });
});
