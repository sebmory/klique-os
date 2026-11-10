// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AthleteDirectory from "@/components/public-athletes/AthleteDirectory";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

const athletes = [
  { slug: "mila-martin", name: "Mila Martin", sport: "Football", club: "FC Lausanne", portrait: "/mila.jpg", colorCategory: "field" as const },
  { slug: "elodie-dupont", name: "Élodie Dupont", sport: "Judo", club: "Judo Club", colorCategory: "combat" as const },
];
const fullDirectory = Array.from({ length: 24 }, (_, index) => ({
  slug: `athlete-${index + 1}`,
  name: index === 23 ? "Aggee Wenzi" : `Athlète ${index + 1}`,
  sport: index === 23 ? "Football" : "Tennis",
  club: `Club ${index + 1}`,
  colorCategory: "field" as const,
}));

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("public athlete directory", () => {
  it("filters by accessible name search and sport, with a keyboard-usable reset", async () => {
    await act(async () => root.render(<AthleteDirectory athletes={athletes} />));
    const input = container.querySelector("input")!;
    const select = container.querySelector("select")!;

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "elodie");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).toContain("Élodie Dupont");
    expect(container.textContent).not.toContain("Mila Martin");

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, "Football");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Mila Martin");
    expect(container.textContent).not.toContain("Élodie Dupont");

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "inconnu");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Aucun profil");
    expect(container.querySelector("button")?.tabIndex).toBe(0);
  });

  it("shows initials and category when no portrait is published", async () => {
    await act(async () => root.render(<AthleteDirectory athletes={athletes} />));
    const placeholder = container.querySelector('[aria-hidden="true"]');
    expect(placeholder?.textContent).toContain("ÉD");
    expect(placeholder?.textContent).toContain("Judo");
  });

  it("shows twelve profiles initially and reveals the next twelve without another request", async () => {
    await act(async () => root.render(<AthleteDirectory athletes={fullDirectory} />));

    expect(container.querySelectorAll('a[href^="/athletes/"]')).toHaveLength(12);
    const loadMore = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Afficher plus d’athlètes");
    expect(loadMore?.getAttribute("aria-controls")).toBe("athlete-directory-results");

    await act(async () => loadMore?.click());

    expect(container.querySelectorAll('a[href^="/athletes/"]')).toHaveLength(24);
    expect(container.textContent).not.toContain("Afficher plus d’athlètes");
  });

  it("searches all loaded profiles even when a match starts beyond the first twelve", async () => {
    await act(async () => root.render(<AthleteDirectory athletes={fullDirectory} />));
    const input = container.querySelector("input")!;

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Aggee");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.querySelectorAll('a[href^="/athletes/"]')).toHaveLength(1);
    expect(container.textContent).toContain("Aggee Wenzi");
  });
});
