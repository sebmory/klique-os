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
