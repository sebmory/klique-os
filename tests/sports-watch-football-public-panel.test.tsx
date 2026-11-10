// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FootballPublicPilotPanel } from "@/components/app-shell/FootballPublicPilotPanel";

describe("public football pilot responsive panel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("remains usable at 390 × 844 without mutating data on mount", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ ok: true, bindings: [], reconciliations: [] }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ));
    const container = document.createElement("div");
    container.style.width = "390px";
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<FootballPublicPilotPanel athletes={[{
        key: "matheus",
        athleteId: "matheus",
        name: "Matheus Monteiro",
        sport: "Football",
        club: "FC Richemond I",
        status: "Actif",
      }]} />);
    });

    expect(container.textContent).toContain("Pilote football public — Matheus Monteiro");
    expect(container.querySelector("button")?.textContent).toContain(
      "Découvrir l’équipe et l’effectif",
    );
    expect(container.innerHTML).toContain("min(100%, 16rem)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/sports-watch/football-bindings",
      { cache: "no-store" },
    );
    expect(fetchMock.mock.calls.some(([, init]) =>
      (init as RequestInit | undefined)?.method === "POST"
      || (init as RequestInit | undefined)?.method === "PUT"
      || (init as RequestInit | undefined)?.method === "DELETE")).toBe(false);

    await act(async () => root.unmount());
  });
});
