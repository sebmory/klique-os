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
    expect(container.textContent).toContain("Échec");
    expect(container.textContent).toContain("Actualisation partielle");
  });
});
