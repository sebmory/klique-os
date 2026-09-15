// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ athleteId: "athlete-1" }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/components/ui/Modal", () => ({
  Modal: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

import PartnerAthleteProfilePage from "@/app/partner/athletes/[athleteId]/page";
import type { PublicAthleteProfile } from "@/types/athlete";

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const athlete: PublicAthleteProfile = {
  name: "Mila Martin",
  sport: "Football",
  club: "FC Lausanne",
  age: 25,
  nationality: "Suisse",
  position: "Attaquante",
  palmares: "Championne régionale",
  shortTermGoals: "Intégrer la sélection",
  longTermGoals: "Passer professionnelle",
  city: "Lausanne",
  country: "Suisse",
  portraitUrl: "",
  presentation: "Présentation publique",
  journey: "Parcours public",
  goals: "Objectifs publics",
  distinctions: [{ type: "athlete_of_the_month", awardMonth: 9, awardYear: 2026, description: "Distinction publique" }],
  socialLinks: [{ label: "Instagram", url: "@mila.public" }],
};

const mount = async (payload = athlete) => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ athlete: payload, introductionPending: false }),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(PartnerAthleteProfilePage));
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

describe("PartnerAthleteProfilePage", () => {
  it("shows the available public athlete information and introduction action", async () => {
    await mount();

    const content = container.textContent ?? "";
    expect(content).toContain("Sport");
    expect(content).toContain("Football");
    expect(content).toContain("Club / équipe");
    expect(content).toContain("FC Lausanne");
    expect(content).toContain("Âge");
    expect(content).toContain("25 ans");
    expect(content).toContain("Nationalité");
    expect(content).toContain("Poste / spécialité");
    expect(content).toContain("Attaquante");
    expect(content).toContain("Localisation");
    expect(content).toContain("Lausanne, Suisse");
    expect(content).toContain("Présentation");
    expect(content).toContain("Parcours sportif");
    expect(content).toContain("Objectifs sportifs");
    expect(content).toContain("Palmarès");
    expect(content).toContain("Objectifs à court terme");
    expect(content).toContain("Objectifs à long terme");
    expect(content).toContain("Distinctions KLIQUE");
    expect(content).toContain("Réseaux publics");
    expect(content).toContain("Demander une mise en relation");
  });

  it("hides public information that is absent", async () => {
    await mount({
      ...athlete,
      sport: "",
      club: "",
      age: undefined,
      nationality: "",
      position: "",
      palmares: "",
      shortTermGoals: "",
      longTermGoals: "",
      city: "",
      country: "",
      presentation: "",
      journey: "",
      goals: "",
      distinctions: [],
      socialLinks: [],
    });

    const content = container.textContent ?? "";
    expect(content).not.toContain("Sport");
    expect(content).not.toContain("Club / équipe");
    expect(content).not.toContain("Âge");
    expect(content).not.toContain("Nationalité");
    expect(content).not.toContain("Poste / spécialité");
    expect(content).not.toContain("Localisation");
    expect(content).not.toContain("Présentation");
    expect(content).not.toContain("Parcours sportif");
    expect(content).not.toContain("Objectifs sportifs");
    expect(content).not.toContain("Palmarès");
    expect(content).not.toContain("Objectifs à court terme");
    expect(content).not.toContain("Objectifs à long terme");
    expect(content).not.toContain("Distinctions KLIQUE");
    expect(content).not.toContain("Réseaux publics");
    expect(content).toContain("Demander une mise en relation");
  });
});