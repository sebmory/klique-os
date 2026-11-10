// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SportsWatchManualEntryPanel } from "@/components/app-shell/SportsWatchManualEntryPanel";
import type { SportsWatchCandidate } from "@/types/sports-watch";

const athletes = [{
  key: "footballer",
  athleteId: "footballer",
  name: "Joueuse Football",
  sport: "Football",
  club: "FC Test",
  status: "Actif",
}, {
  key: "basketballer",
  athleteId: "basketballer",
  name: "Joueuse Basketball",
  sport: "Basketball",
  club: "BC Test",
  status: "Actif",
}, {
  key: "fighter",
  athleteId: "fighter",
  name: "Athlète Combat",
  sport: "Judo",
  club: "Dojo Test",
  status: "Actif",
}, {
  key: "inactive",
  athleteId: "inactive",
  name: "Athlète Inactif",
  sport: "Football",
  club: "FC Test",
  status: "Inactif",
}];

const candidate: SportsWatchCandidate = {
  id: "11111111-1111-4111-8111-111111111111",
  athleteId: "footballer",
  athleteName: "Joueuse Football",
  sourceName: "Saisie manuelle Admin",
  sourceUrl: "",
  articleUrl: "",
  title: "Victoire",
  excerpt: "Origine : saisie manuelle Admin.",
  resultKind: "collective_result",
  publicationDate: null,
  eventDateFrom: "2026-11-12",
  eventDateTo: "2026-11-12",
  collectedAt: "2026-11-13T10:00:00.000Z",
  attributionStatus: "matched",
  attributionEvidence: [],
  verificationStatus: "unverified",
  adminStatus: "pending",
  supersedesCandidateId: null,
  version: 1,
  manualEntry: null,
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const controlFor = (
  container: HTMLElement,
  label: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
  const element = Array.from(container.querySelectorAll("label"))
    .find((item) => item.textContent?.trim().startsWith(label))
    ?.querySelector("input, textarea, select");
  if (!element) throw new Error(`Contrôle introuvable : ${label}`);
  return element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
};

const setValue = async (
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) => {
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

describe("sports watch manual entry panel", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("crypto", {
      randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const render = async (onCandidateCreated = vi.fn()) => {
    await act(async () => {
      root.render(
        <SportsWatchManualEntryPanel
          athletes={athletes}
          onCandidateCreated={onCandidateCreated}
        />,
      );
      await flush();
    });
    return onCandidateCreated;
  };

  const fillRequiredFootball = async () => {
    await setValue(
      container.querySelector('select[aria-label="Athlète pour l’actualité manuelle"]')!,
      "footballer",
    );
    await setValue(controlFor(container, "Date de l’événement"), "2026-11-12");
    await setValue(controlFor(container, "Titre"), "Victoire");
    await setValue(controlFor(container, "Résumé factuel"), "Résumé factuel du match.");
  };

  const fillFootballGenerationFacts = async () => {
    await setValue(
      container.querySelector('select[aria-label="Athlète pour l’actualité manuelle"]')!,
      "footballer",
    );
    await setValue(controlFor(container, "Date de l’événement"), "2026-11-12");
    await setValue(controlFor(container, "Club ou équipe"), "FC Test");
    await setValue(controlFor(container, "Compétition"), "Championnat test");
    await setValue(controlFor(container, "Adversaire"), "FC Adverse");
    await setValue(controlFor(container, "Score collectif"), "2-1");
  };

  it("submits required-only football fields with every numeric value left null", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, candidate, created: true }),
      requestBody: init.body,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = await render();
    await fillRequiredFootball();

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await flush();
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      athleteId: "footballer",
      initialStatus: "pending",
      football: {
        participationStatus: "unknown",
        minutes: null,
        goals: null,
        assists: null,
        yellowCards: null,
        redCards: null,
      },
    });
    expect(onCreated).toHaveBeenCalledWith(candidate, true);
  });

    it("prefills and enriches a public football candidate without creating a second candidate", async () => {
      const publicCandidate: SportsWatchCandidate = {
        ...candidate,
        sourceName: "Footstats — page publique, source tierce non officielle",
        articleUrl: "https://www.footstats.ch/de/teams/xh89ete5/matches/",
        footballEvidence: {
          mode: "football_public",
          matchKey: "2026-11-12|fc adverse|fc test",
          eventDate: "2026-11-12",
          publicReference: "https://www.footstats.ch/de/teams/xh89ete5/matches/",
          competition: "Championnat test",
          team: "FC Test",
          opponent: "FC Adverse",
          score: "2–1",
          footstatsTeamId: "xh89ete5",
          footstatsPlayerId: "player-test",
          affTeamId: null,
          affPlayerId: null,
          lineupAvailable: false,
          playerNamed: false,
          starter: null,
          substitute: null,
          entered: null,
          entryMinute: null,
          exitMinute: null,
          goals: null,
          goalMinutes: [],
          yellowCards: null,
          redCards: null,
          cardMinutes: [],
          participationProved: false,
          proofs: ["team_match"],
          sourceFacts: [],
        },
      };
      const enriched = {
        ...publicCandidate,
        id: "22222222-2222-4222-8222-222222222222",
        supersedesCandidateId: publicCandidate.id,
        manualEntry: {
          mode: "manual_entry" as const,
          newsType: "result_match" as const,
          competition: "Championnat test",
          opponent: "FC Adverse",
          score: "2–1",
          source: "Footstats Pro",
          sourceReference: publicCandidate.articleUrl,
          internalNote: null,
          football: null,
          basketball: null,
          statistics: [],
        },
      };
      const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
        void _url;
        void _init;
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, candidate: enriched }),
        };
      });
      vi.stubGlobal("fetch", fetchMock);
      const onCreated = vi.fn();
      await act(async () => {
        root.render(
          <SportsWatchManualEntryPanel
            athletes={athletes}
            completionCandidate={publicCandidate}
            onCandidateCreated={onCreated}
          />,
        );
        await flush();
      });

      expect(controlFor(container, "Athlète").value).toBe("footballer");
      expect(controlFor(container, "Date de l’événement").value).toBe("2026-11-12");
      expect(controlFor(container, "Club ou équipe").value).toBe("FC Test");
      expect(controlFor(container, "Adversaire").value).toBe("FC Adverse");
      expect(controlFor(container, "Score collectif").value).toBe("2–1");
      expect(fetchMock).not.toHaveBeenCalled();

      const starter = container.querySelector(
        'input[name="manual-football-participation"][value="starter"]',
      ) as HTMLInputElement;
      await act(async () => starter.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      await setValue(controlFor(container, "Titre"), "Joueuse Football titulaire");
      await setValue(controlFor(container, "Résumé factuel"), "Participation confirmée par l’Admin.");
      await act(async () => {
        container.querySelector("form")?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
        await flush();
      });

      expect(fetchMock.mock.calls[0][0]).toBe(
        `/api/admin/sports-watch/football-candidates/${publicCandidate.id}`,
      );
      const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(request).toMatchObject({
        action: "complete",
        expectedVersion: 1,
        entry: {
          athleteId: "footballer",
          source: "Footstats Pro",
          football: {
            team: "FC Test",
            opponent: "FC Adverse",
            score: "2–1",
            participationStatus: "starter",
          },
        },
      });
      expect(onCreated).toHaveBeenCalledWith(enriched, false, publicCandidate.id);
    });

  it("preserves explicit zeroes and sends validated status separately from factual verification", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        ok: true,
        candidate: { ...candidate, adminStatus: "validated" },
        created: true,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await render();
    await fillRequiredFootball();
    await setValue(controlFor(container, "Statut initial"), "validated");
    const entered = container.querySelector(
      'input[name="manual-football-participation"][value="entered"]',
    ) as HTMLInputElement;
    await act(async () => {
      entered.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    for (const label of [
      "Minutes jouées",
      "Buts",
      "Passes décisives",
      "Cartons jaunes",
      "Cartons rouges",
    ]) {
      await setValue(controlFor(container, label), "0");
    }

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await flush();
    });

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(firstCall[1].body as string);
    expect(body.initialStatus).toBe("validated");
    expect(body.football).toMatchObject({
      participationStatus: "entered",
      minutes: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
    });
    expect(body).not.toHaveProperty("factualVerificationStatus");
  });

  it("shows basketball and bounded custom-statistic fields for the selected sport", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await render();
    await setValue(
      container.querySelector('select[aria-label="Athlète pour l’actualité manuelle"]')!,
      "basketballer",
    );

    expect(container.textContent).toContain("Basketball · facultatif");
    expect(container.textContent).toContain("Interceptions");
    expect(container.textContent).not.toContain("Identifiant joueur Footstats");

    const addStatistic = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Ajouter une statistique");
    await act(async () => {
      addStatistic?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(controlFor(container, "Libellé 1")).toBeInstanceOf(HTMLInputElement);
  });

  it("generates editable text locally without a request or candidate creation", async () => {
    const fetchMock = vi.fn();
    const onCreated = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await render(onCreated);
    await fillFootballGenerationFacts();

    expect((controlFor(container, "Titre") as HTMLInputElement).value).toBe("");
    expect((controlFor(container, "Résumé factuel") as HTMLTextAreaElement).value).toBe("");
    const generate = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Générer le titre et le résumé");
    expect(generate?.disabled).toBe(false);
    await act(async () => {
      generate?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const title = controlFor(container, "Titre") as HTMLInputElement;
    const summary = controlFor(container, "Résumé factuel") as HTMLTextAreaElement;
    expect(title.value).toBe("Victoire 2–1 du FC Test face à FC Adverse");
    expect(summary.value).toContain("La participation de Joueuse Football n’est pas renseignée.");
    expect(summary.value).not.toContain("Footstats");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();

    await setValue(title, "Titre modifié par l’Admin");
    await setValue(summary, "Résumé modifié par l’Admin.");
    expect(title.value).toBe("Titre modifié par l’Admin");
    expect(summary.value).toBe("Résumé modifié par l’Admin.");
  });

  it("never overwrites edited text without confirmed regeneration", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await render();
    await fillFootballGenerationFacts();
    const generate = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Générer le titre et le résumé");
    await act(async () => {
      generate?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const title = controlFor(container, "Titre") as HTMLInputElement;
    await setValue(title, "Titre éditorial conservé");

    const regenerate = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Régénérer");
    await act(async () => {
      regenerate?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(title.value).toBe("Titre éditorial conservé");
    expect(container.textContent).toContain("Remplacer le titre et le résumé modifiés ?");

    const confirm = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Confirmer la régénération");
    await act(async () => {
      confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(title.value).toBe("Victoire 2–1 du FC Test face à FC Adverse");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("orders source and structured facts before generated editorial text", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await render();
    await setValue(
      container.querySelector('select[aria-label="Athlète pour l’actualité manuelle"]')!,
      "footballer",
    );
    const text = Array.from(container.querySelectorAll("form label"))
      .map((label) => label.textContent?.trim() ?? "");
    const indexOf = (label: string) => text.findIndex((value) => value.startsWith(label));
    expect(indexOf("Source")).toBeLessThan(indexOf("Club ou équipe"));
    expect(indexOf("Club ou équipe")).toBeLessThan(indexOf("Titre *"));
    expect(indexOf("Titre *")).toBeLessThan(indexOf("Note interne Admin"));
  });

  it("presents probable duplicates and only retries after explicit Admin confirmation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          ok: false,
          error: {
            message: "Rapprochement requis.",
            duplicates: [{
              candidateId: "existing",
              sourceName: "SAFV",
              title: "Match existant",
              eventDate: "2026-11-12",
              articleUrl: "https://example.com/match",
              reason: "Même adversaire.",
            }],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ ok: true, candidate, created: true }),
      });
    vi.stubGlobal("fetch", fetchMock);
    await render();
    await fillRequiredFootball();

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await flush();
    });
    expect(container.textContent).toContain("Rapprochement nécessaire");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const confirm = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Créer malgré le rapprochement");
    await act(async () => {
      confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).allowPotentialDuplicate).toBe(true);
  });

  it.each([
    [1440, 900],
    [390, 844],
  ])("keeps the form responsive at %d × %d", async (width, height) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    await render();

    const panel = container.querySelector("[data-sports-watch-manual-entry]") as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.style.minWidth).toBe("0px");
    expect(container.textContent).toContain("Ajouter une actualité");
    expect(container.textContent).not.toContain("Athlète Inactif");
  });
});
