// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SportsWatchAdminCard } from "@/components/app-shell/SportsWatchAdminCard";
import type { SportsWatchRunResult } from "@/types/sports-watch";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const athlete = {
  key: "alice",
  athleteId: "alice",
  name: "Alice Badminton",
  sport: "Badminton",
  club: "BC Bulle",
  status: "Actif",
};

const dashboardPayload = {
  candidates: [],
  swissBindings: [{ athleteId: "alice", active: true }],
  iwwfBindings: [],
  safvBindings: [],
  beBasketBindings: [],
  swissBasketballBindings: [],
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("sports watch refresh all UI", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("guards double clicks and shows one summary per athlete and source", async () => {
    const pendingResponses: Array<(result: SportsWatchRunResult) => void> = [];
    const postBodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== "POST") {
        return {
          ok: true,
          json: async () => dashboardPayload,
        };
      }
      const body = JSON.parse(String(init.body)) as { sourceKey?: string };
      postBodies.push(body);
      if (body.sourceKey === "swiss-badminton") {
        return {
          ok: false,
          json: async () => ({ message: "Le registre CRM des athlètes reçoit trop de demandes. Réessayez dans une minute." }),
        };
      }
      return await new Promise((resolve) => {
        pendingResponses.push((result) => resolve({
          ok: true,
          json: async () => ({ result }),
        }));
      });
    }));

    await act(async () => {
      root.render(<SportsWatchAdminCard athletes={[athlete]} />);
      await flush();
    });
    const button = Array.from(container.querySelectorAll("button"))
      .find((item) => item.textContent === "Actualiser toutes les veilles") as HTMLButtonElement;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    });

    expect(postBodies).toEqual(expect.arrayContaining([
      { sourceKey: "bc-bulle", athleteId: "alice" },
      { sourceKey: "swiss-badminton", athleteId: "alice" },
    ]));
    expect(postBodies).toHaveLength(2);
    expect(button.disabled).toBe(true);

    await act(async () => {
      for (const [index, resolve] of pendingResponses.entries()) {
        resolve({
          sourceName: index === 0 ? "Badminton Club Bulle" : "Swiss Badminton",
          sourceUrl: "https://example.com",
          message: index === 0
            ? "1 nouveau candidat ajouté."
            : "Aucun résultat Swiss Badminton daté des 30 derniers jours.",
          scannedCount: 1,
          recentCount: index === 0 ? 1 : 0,
          createdCount: index === 0 ? 1 : 0,
          candidates: [],
        });
      }
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("2/2 veilles traitées");
    expect(container.textContent).toContain("1 nouveau résultat");
    expect(container.textContent).toContain("Actualisation partielle");
    expect(container.textContent).toContain("Voir le détail des 2 veilles");
    expect(container.textContent).not.toContain("Alice BadmintonSwiss Badminton");

    const detailsButton = Array.from(container.querySelectorAll("button"))
      .find((item) => item.textContent?.includes("Voir le détail des 2 veilles"));
    await act(async () => {
      detailsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    });
    expect(container.textContent).toContain("Échec");
  });

  it("shows grouped partial warnings in amber with clickable source links", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== "POST") {
        return {
          ok: true,
          json: async () => dashboardPayload,
        };
      }
      const body = JSON.parse(String(init.body)) as { sourceKey?: string };
      if (body.sourceKey !== "swiss-badminton") {
        return {
          ok: true,
          json: async () => ({
            result: {
              sourceName: "Badminton Club Bulle",
              sourceUrl: "https://bcbulle.ch/feed/",
              message: "Aucun nouveau résultat.",
              scannedCount: 0,
              recentCount: 0,
              createdCount: 0,
              candidates: [],
            } satisfies SportsWatchRunResult,
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          result: {
            sourceName: "Swiss Badminton / Tournamentsoftware",
            sourceUrl: "https://sb.tournamentsoftware.com/player-profile/official",
            message: "Couverture partielle : 4 rencontres inexploitable écartées.",
            scannedCount: 7,
            recentCount: 3,
            createdCount: 3,
            observations: Array.from({ length: 4 }, (_, index) => ({
              matchUrl: "https://sb.tournamentsoftware.com/sport/draw.aspx?id=official&draw=20",
              title: `Championnats fribourgeois — Mixte 2 — match ${index + 1}`,
              eventDate: "2026-10-31",
              status: "binding_error",
              warning: "La source Swiss Badminton / Tournamentsoftware est inexploitable : un match attribué à Antoine Majeux possède un HTML incomplet. Rencontre : Championnats fribourgeois — Mixte 2. URL : https://sb.tournamentsoftware.com/sport/draw.aspx?id=official&draw=20",
            })),
            candidates: [],
          } satisfies SportsWatchRunResult,
        }),
      };
    }));

    await act(async () => {
      root.render(<SportsWatchAdminCard athletes={[athlete]} />);
      await flush();
    });
    const button = Array.from(container.querySelectorAll("button"))
      .find((item) => item.textContent === "Actualiser toutes les veilles") as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("3 nouveaux résultats · 4 rencontres écartées · 0 échecs");
    expect(container.textContent).toContain("Couverture partielle");
    const partialPanel = Array.from(container.querySelectorAll<HTMLElement>("div"))
      .find((item) =>
        item.style.background === "rgb(255, 251, 235)"
        && item.textContent?.includes("3 nouveaux résultats · 4 rencontres écartées"));
    expect(partialPanel).toBeDefined();

    const detailsButton = Array.from(container.querySelectorAll("button"))
      .find((item) => item.textContent?.includes("Voir le détail"));
    await act(async () => {
      detailsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    });

    expect(container.textContent).toContain("4× La source Swiss Badminton");
    expect(container.textContent?.match(/4× La source Swiss Badminton/g)).toHaveLength(1);
    expect(container.textContent).toContain("match 1");
    expect(container.textContent).toContain("match 4");
    const links = Array.from(container.querySelectorAll("a"));
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        href: "https://sb.tournamentsoftware.com/player-profile/official",
      }),
      expect.objectContaining({
        href: "https://sb.tournamentsoftware.com/sport/draw.aspx?id=official&draw=20",
      }),
    ]));
  });
});
