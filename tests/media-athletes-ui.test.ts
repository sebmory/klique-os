// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import MediaAthletesPage from "@/app/media/athletes/page";
import { MediaAthleteProfileScreen } from "@/components/media/MediaAthleteProfileScreen";

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const mount = async (element: ReactNode) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(element);
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("media athletes pages", () => {
  it("loads the directory and links cards to media athlete profiles", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        athletes: [{ athleteId: "athlete-1", name: "Mila Martin", sport: "Football", club: "FC Lausanne", portraitUrl: "" }],
      }),
    });

    await mount(createElement(MediaAthletesPage));

    expect(fetchMock).toHaveBeenCalledWith("/api/media/athletes", { credentials: "include", cache: "no-store" });
    expect(container.textContent).toContain("Mila Martin");
    expect(container.querySelector('a[href="/media/athletes/athlete-1"]')).not.toBeNull();
  });

  it("shows only the requested public sporting profile fields", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        athlete: {
          name: "Mila Martin",
          sport: "Football",
          club: "FC Lausanne",
          age: 26,
          nationality: "Suisse",
          position: "Attaquante",
          journey: "Parcours public",
          goals: "Objectifs publics",
          palmares: "Championne régionale",
          shortTermGoals: "Intégrer la sélection",
          longTermGoals: "Passer professionnelle",
          portraitUrl: "",
          instagram: "@mila.public",
        },
      }),
    });

    await mount(createElement(MediaAthleteProfileScreen, { athleteId: "athlete-1" }));

    const content = container.textContent ?? "";
    expect(fetchMock).toHaveBeenCalledWith("/api/media/athletes/athlete-1", { credentials: "include", cache: "no-store" });
    for (const label of ["Âge", "Sport", "Club / équipe", "Poste / spécialité", "Nationalité", "Parcours sportif", "Objectifs sportifs", "Palmarès", "Instagram public"]) {
      expect(content).toContain(label);
    }
    expect(content).not.toContain("Téléphone");
    expect(content).not.toContain("E-mail");
    expect(content).not.toContain("Demander une mise en relation");
    expect(container.querySelector('a[href="https://instagram.com/mila.public"]')).not.toBeNull();
  });
});