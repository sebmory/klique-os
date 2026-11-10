// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell/SportsWatchAdminCard", () => ({
  SportsWatchAdminCard: ({ athletes }: { athletes: unknown[] }) => (
    <div data-testid="sports-watch-card">{athletes.length} athlète</div>
  ),
}));

import { SportsWatchAdminPage } from "@/components/app-shell/SportsWatchAdminPage";

describe("page Admin Sports Watch", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("réutilise la carte complète et lui transmet l’annuaire Athlètes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      athletes: [{ id: "athlete-1", firstName: "Ada", lastName: "Lovelace" }],
    }), { status: 200 })));

    await act(async () => {
      root.render(<SportsWatchAdminPage />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector("h1")?.textContent).toBe("Sports Watch");
    expect(container.querySelector('[data-testid="sports-watch-card"]')?.textContent).toBe("1 athlète");
    expect(fetch).toHaveBeenCalledWith(
      "/api/athletes?weeklyResponseDays=14&monthlyResponseDays=45",
      { cache: "no-store", credentials: "include" },
    );
  });

  it("explique l’échec de l’annuaire, conserve la carte et permet de réessayer", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        athletes: [{ id: "athlete-1" }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<SportsWatchAdminPage />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("L’annuaire Athlètes n’a pas pu être chargé");
    expect(container.querySelector('[data-testid="sports-watch-card"]')).not.toBeNull();

    const retry = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Réessayer");
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[data-testid="sports-watch-card"]')?.textContent).toBe("1 athlète");
  });
});
