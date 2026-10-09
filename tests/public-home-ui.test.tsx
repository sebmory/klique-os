// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authState } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: false },
}));

vi.mock("@clerk/nextjs", () => ({ useUser: () => authState }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));
vi.mock("next/image", () => ({
  default: ({ fill: _fill, priority: _priority, ...props }: { fill?: boolean; priority?: boolean; alt: string; src: string }) =>
    createElement("img", props),
}));

import PublicHome from "@/components/home/PublicHome";

const plans = [
  { code: "essential", name: "Essentiel", annualPriceChf: 249, durationMonths: 12, productionCredits: 1, customContentCredits: 2, videoAllowed: false },
  { code: "impact", name: "Impact", annualPriceChf: 549, durationMonths: 12, productionCredits: 2, customContentCredits: 4, videoAllowed: true },
  { code: "signature", name: "Signature", annualPriceChf: 999, durationMonths: 12, productionCredits: 3, customContentCredits: 6, videoAllowed: true },
];

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const response = (payload: unknown, ok = true) => ({ ok, json: async () => payload }) as Response;

const mount = async (
  statsResponse: Promise<Response> = Promise.resolve(response({
    athleteCount: 14,
    partnerExpertCount: 9,
    sportCount: 6,
    creativeCount: 4,
  })),
) => {
  fetchMock.mockImplementation((url: string) => {
    if (url === "/api/public/membership-plans") return Promise.resolve(response({ plans }));
    if (url === "/api/public/klique-stats") return statsResponse;
    throw new Error(`Unexpected URL: ${url}`);
  });
  await act(async () => {
    root.render(<PublicHome />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.isLoaded = true;
  authState.isSignedIn = false;
  vi.stubGlobal("fetch", fetchMock);
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

describe("Public KLIQUE home", () => {
  it("presents KLIQUE, its audience, value, process, ecosystem, and canonical Pass preview", async () => {
    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/public/membership-plans", { cache: "no-store" });
    expect(fetchMock).toHaveBeenCalledWith("/api/public/klique-stats");
    expect(container.querySelector("h1")?.textContent).toBe("Votre ambition mérite tout un réseau.");
    expect(container.textContent).toContain("LE RÉSEAU AU SERVICE DES ATHLÈTES");
    expect(container.textContent).toContain("KLIQUE réunit autour des Athlètes les ressources, les expertises et les opportunités");
    expect(container.textContent).toContain("KLIQUE · UN RÉSEAU AUTOUR DE L’ATHLÈTE");
    expect(container.textContent).toContain("Bien plus qu’un abonnement. Un réseau pour avancer.");
    expect(container.textContent).toContain("Chaque Athlète a son parcours, ses besoins et ses objectifs.");
    expect(container.textContent).toContain("Développer son image");
    expect(container.textContent).toContain("S’entourer d’experts");
    expect(container.textContent).toContain("Profiter d’avantages");
    expect(container.textContent).toContain("Accéder à des opportunités");
    expect(container.textContent).toContain("Activez votre réseau");
    expect(container.textContent).toContain("Utilisez les contenus, expertises, avantages et opportunités disponibles");
    expect(container.textContent).toContain("Un écosystème complémentaire, construit autour de l’Athlète.");
    expect(container.textContent).toContain("Prêt à rejoindre un réseau construit autour de vos ambitions ?");
    expect(container.textContent).toContain("Le paiement est vérifié manuellement par KLIQUE");
    for (const actor of ["Athlètes", "Partenaires et experts", "Médias", "Créatifs KLIQUE"]) {
      expect(container.textContent).toContain(actor);
    }
    expect(container.textContent).toContain("Essentiel");
    expect(container.textContent).toContain("CHF 549.00");
    expect(container.textContent).toContain("3 crédit(s) production photo/vidéo");
    const passLinkLabels = [...container.querySelectorAll('a[href="/pass"]')].map((link) => link.textContent);
    expect(passLinkLabels).toContain("Les offres");
    expect(passLinkLabels.some((label) => label?.includes("Découvrir les Pass"))).toBe(true);
    expect(passLinkLabels.some((label) => label?.includes("Comparer les Pass"))).toBe(true);
    expect(container.querySelectorAll('a[href="/sign-in"]')).toHaveLength(4);
  });

  it("renders the four real statistics in an accessible band", async () => {
    await mount();

    const statsBand = container.querySelector('[aria-label="KLIQUE en chiffres"]');
    expect(statsBand?.textContent).toContain("14Athlètes accompagnés");
    expect(statsBand?.textContent).toContain("9Partenaires & experts");
    expect(statsBand?.textContent).toContain("6Disciplines représentées");
    expect(statsBand?.textContent).toContain("4Créatifs");
    expect(statsBand?.querySelectorAll("strong")).toHaveLength(4);
  });

  it("renders a safe zero creative count without changing the other counters", async () => {
    await mount(Promise.resolve(response({
      athleteCount: 14,
      partnerExpertCount: 9,
      sportCount: 6,
      creativeCount: 0,
    })));

    const statsBand = container.querySelector('[aria-label="KLIQUE en chiffres"]');
    expect(statsBand?.textContent).toContain("14Athlètes accompagnés");
    expect(statsBand?.textContent).toContain("9Partenaires & experts");
    expect(statsBand?.textContent).toContain("6Disciplines représentées");
    expect(statsBand?.textContent).toContain("0Créatifs");
  });

  it("shows no false counters while statistics are loading", async () => {
    await mount(new Promise<Response>(() => {}));

    expect(container.querySelector('[aria-label="KLIQUE en chiffres"]')).toBeNull();
    expect(container.textContent).not.toContain("0Athlètes accompagnés");
  });

  it("silently hides the statistics when their API is unavailable", async () => {
    await mount(Promise.resolve(response({ error: "indisponible" }, false)));

    expect(container.querySelector('[aria-label="KLIQUE en chiffres"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Votre ambition mérite tout un réseau.");
  });

  it("sends an authenticated visitor back to the existing workspace", async () => {
    authState.isSignedIn = true;
    await mount();

    const workspaceLinks = [...container.querySelectorAll('a[href="/today"]')];
    expect(workspaceLinks).toHaveLength(4);
    expect(workspaceLinks.every((link) => link.textContent?.includes("Accéder à mon espace"))).toBe(true);
    expect(container.querySelector('a[href="/sign-in"]')).toBeNull();
  });
});