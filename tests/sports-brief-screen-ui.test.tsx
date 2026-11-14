// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SportsBriefScreen } from "@/components/contents/SportsBriefScreen";
import { validateContentDocumentWriteBody } from "@/lib/content-storage/validation";
import type { ContentDocument } from "@/types/content-document";
import type { SportsWatchBriefCandidate } from "@/types/sports-watch";

const candidate: SportsWatchBriefCandidate = {
  id: "00000000-0000-4000-8000-000000000042",
  athleteId: "athlete-fictif",
  athleteName: "Athlète Fictif",
  sourceName: "Source officielle fictive",
  articleUrl: "https://example.test/match-fictif",
  title: "Club Fictif 82-74 Rival Fictif",
  excerpt: "Résultat individuel vérifié : 82-74.",
  resultKind: "individual_result",
  publicationDate: "2026-11-10T08:00:00.000Z",
  eventDateFrom: "2026-11-09",
  eventDateTo: "2026-11-09",
  collectedAt: "2026-11-10T09:00:00.000Z",
  verificationStatus: "verified",
  adminStatus: "validated",
  provesIndividualParticipation: true,
  verifiedStatistics: [{ label: "Points", value: "18" }],
  materials: [{
    id: "sports-watch-00000000-0000-4000-8000-000000000042-1",
    kind: "note",
    text: "Résultat individuel vérifié : 82-74, 18 points.",
    provenance: "Source officielle fictive · Vérification factuelle : vérifiée",
    sourceDate: "2026-11-09",
    sourceType: "external",
    verificationStatus: "verified",
    statementType: "fact",
    category: "result",
    sourceUrl: "https://example.test/match-fictif",
  }],
};

let container: HTMLElement;
let root: Root;

beforeEach(() => {
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

describe("SportsBriefScreen", () => {
  it("rehydrates the explicit candidate server-side and renders facts and editor", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        context: { selectedCandidateId: candidate.id, candidates: [candidate] },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<SportsBriefScreen initialCandidateId={candidate.id} />);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/sports-watch/brief-context?candidateId=${candidate.id}`,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(container.querySelector(".sports-brief-workspace")).not.toBeNull();
    expect(container.textContent).toContain("Faits et source");
    expect(container.textContent).toContain("À vérifier — exclu de la génération".replace("À vérifier — exclu de la génération", "Fait vérifié"));
    expect(container.textContent).toContain("Performance individuelle");
  });

  it("shows the eligible news picker without an explicit candidate", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        context: { selectedCandidateId: null, candidates: [candidate] },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<SportsBriefScreen />);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/sports-watch/brief-context",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(container.textContent).toContain("Choisir une actualité éligible");
    expect(container.querySelector(".sports-brief-candidate")).not.toBeNull();
  });

  it("saves and reopens a manual draft without verified facts while assisted writing stays disabled", async () => {
    const unverified: SportsWatchBriefCandidate = {
      ...candidate,
      verificationStatus: "unverified",
      provesIndividualParticipation: false,
      verifiedStatistics: [],
      materials: [{
        ...candidate.materials[0],
        verificationStatus: "unverified",
        statementType: "editorial_lead",
        text: "Piste fictive non vérifiée : PTS 21.",
      }],
    };
    let savedDocument: ContentDocument | null = null;
    const fetchMock = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/api/admin/sports-watch/brief-context")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            context: { selectedCandidateId: unverified.id, candidates: [unverified] },
          }),
        };
      }
      if (url.includes("/api/contents/storage/drafts") && method === "POST") {
        const body = JSON.parse(init?.body ?? "{}") as { document?: ContentDocument };
        // La sauvegarde doit rester acceptée par la validation serveur réelle.
        savedDocument = validateContentDocumentWriteBody(body);
        return {
          ok: true,
          status: 201,
          json: async () => ({ ok: true, version: 1, document: savedDocument }),
        };
      }
      if (url.includes("/api/contents/storage/drafts/") && method === "GET") {
        return {
          ok: true,
          json: async () => ({ ok: true, version: 1, document: savedDocument }),
        };
      }
      throw new Error(`Appel inattendu : ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<SportsBriefScreen initialCandidateId={unverified.id} />);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const generateButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Rédiger à partir des faits vérifiés"));
    const saveButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Enregistrer le brouillon"));
    expect(generateButton?.disabled).toBe(true);
    expect(saveButton?.disabled).toBe(true);
    // L’angle « Actualité » est sélectionné par défaut, sans préremplissage du texte.
    const defaultAngle = container.querySelector('.sports-brief-angles [role="radio"][aria-checked="true"]');
    expect(defaultAngle?.textContent).toBe("Actualité");
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe("");

    const setFieldValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const [titleInput] = container.querySelectorAll<HTMLInputElement>('input[type="text"]');
    const [leadInput, bodyInput] = container.querySelectorAll<HTMLTextAreaElement>("textarea");
    await act(async () => {
      setFieldValue(titleInput, "[TEST] Brève manuelle fictive");
      setFieldValue(leadInput, "Chapô manuel fictif.");
      setFieldValue(bodyInput, "Corps manuel fictif, sans donnée à vérifier.");
    });

    expect(saveButton?.disabled).toBe(false);
    await act(async () => {
      saveButton!.click();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(savedDocument).not.toBeNull();
    expect(savedDocument!.sections).toMatchObject({
      title: "[TEST] Brève manuelle fictive",
      selectedAngle: { id: "news", title: "Actualité" },
    });
    expect(container.textContent).toContain("Brouillon enregistré avec sa source.");

    // Réouverture : le texte, l’angle et la source d’origine sont conservés.
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<SportsBriefScreen initialDocumentId={savedDocument!.id} />);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector<HTMLInputElement>('input[type="text"]')?.value)
      .toBe("[TEST] Brève manuelle fictive");
    expect(container.textContent).toContain("Chapô manuel fictif.");
    const reopenedAngle = container.querySelector('.sports-brief-angles [role="radio"][aria-checked="true"]');
    expect(reopenedAngle?.textContent).toBe("Actualité");
    expect(container.textContent).toContain("Source officielle fictive");
    const reopenedGenerate = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Rédiger à partir des faits vérifiés"));
    expect(reopenedGenerate?.disabled).toBe(true);
  });
});
