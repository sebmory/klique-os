// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authState } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: false },
}));

vi.mock("@clerk/nextjs", () => ({ useUser: () => authState }));
vi.mock("next/link", () => ({
  default: (linkProps: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => {
    const {
    href,
    children,
    prefetch,
    ...props
    } = linkProps;
    void prefetch;
    return createElement("a", { href, ...props }, children);
  },
}));
vi.mock("next/image", () => ({
  default: (props: { fill?: boolean; priority?: boolean; alt: string; src: string }) => {
    const imageProps = { ...props };
    delete imageProps.fill;
    delete imageProps.priority;
    return createElement("img", imageProps);
  },
}));

import PublicHome from "@/components/home/PublicHome";
import type { PublicAthleteCard } from "@/lib/public-athletes";

const plans = [
  { code: "essential", name: "Essentiel", annualPriceChf: 249, normalAnnualPriceChf: 249, launchPromotionActive: false, durationMonths: 12, productionCredits: 1, customContentCredits: 2, videoAllowed: false },
  { code: "impact", name: "Impact", annualPriceChf: 549, normalAnnualPriceChf: 549, launchPromotionActive: false, durationMonths: 12, productionCredits: 2, customContentCredits: 4, videoAllowed: true },
  { code: "signature", name: "Signature", annualPriceChf: 999, normalAnnualPriceChf: 999, launchPromotionActive: false, durationMonths: 12, productionCredits: 3, customContentCredits: 6, videoAllowed: true },
];

const promotedPlans = [
  { ...plans[0], annualPriceChf: 124.5, launchPromotionActive: true },
  { ...plans[1], annualPriceChf: 274.5, launchPromotionActive: true },
  { ...plans[2], annualPriceChf: 499.5, launchPromotionActive: true },
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
  plansResponse: Promise<Response> = Promise.resolve(response({ plans })),
  featuredAthletes: readonly PublicAthleteCard[] = [],
) => {
  fetchMock.mockImplementation((url: string) => {
    if (url === "/api/public/membership-plans") return plansResponse;
    if (url === "/api/public/klique-stats") return statsResponse;
    throw new Error(`Unexpected URL: ${url}`);
  });
  await act(async () => {
    root.render(
      <PublicHome
        publicAthletes={featuredAthletes}
        featuredAthletes={featuredAthletes}
      />,
    );
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
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
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
    expect(container.textContent).toContain("Trois portes d’entrée");
    expect(container.textContent).toContain("Des compétences qui répondent aux réalités du parcours.");
    expect(container.textContent).toContain("Chaque Pass ouvre un niveau d’accompagnement");
    expect(container.textContent).toContain("Quelle place voulez-vous prendre dans le réseau ?");
    for (const actor of ["Athlètes", "Experts · Partenaires", "Créatifs · Médias"]) {
      expect(container.textContent).toContain(actor);
    }
    expect(container.textContent).toContain("Essentiel");
    expect(container.textContent).toContain("CHF 549.–");
    expect(container.textContent).toContain("3 crédit(s) production photo/vidéo");
    const passLinkLabels = [...container.querySelectorAll('a[href="/pass"]')].map((link) => link.textContent);
    expect(passLinkLabels).toContain("Les Pass");
    expect(passLinkLabels.some((label) => label?.includes("Comparer les Pass"))).toBe(true);
    expect(container.querySelector('a[href="/athletes"]')?.textContent).toContain("Les athlètes");
  });

  it("affiche l’offre de lancement et les trois couples de prix fournis par l’API", async () => {
    await mount(undefined, Promise.resolve(response({ plans: promotedPlans })));

    expect(container.textContent).toContain("Offre de lancement : -50 % jusqu’au 31.12.2026");
    expect([...container.querySelectorAll("del")].map((element) => element.textContent)).toEqual([
      "CHF 249.–",
      "CHF 549.–",
      "CHF 999.–",
    ]);
    for (const price of ["CHF 124.50", "CHF 274.50", "CHF 499.50"]) {
      expect(container.textContent).toContain(`${price} par an`);
    }
    expect(container.querySelector('a[href="/pass"]')?.textContent).toContain("Les Pass");
    expect([...container.querySelectorAll('a[href="/pass"]')]
      .some((link) => link.textContent?.includes("Comparer les Pass"))).toBe(true);
  });

  it("retire automatiquement la présentation promotionnelle quand l’API la désactive", async () => {
    await mount(undefined, Promise.resolve(response({ plans })));

    expect(container.textContent).not.toContain("Offre de lancement");
    expect(container.querySelectorAll("del")).toHaveLength(0);
    for (const price of ["CHF 249.–", "CHF 549.–", "CHF 999.–"]) {
      expect(container.textContent).toContain(`${price} par an`);
    }
    expect([...container.querySelectorAll('a[href="/pass"]')]
      .some((link) => link.textContent?.includes("Comparer les Pass"))).toBe(true);
  });

  it("renders the four real statistics in an accessible band", async () => {
    await mount();

    const statsBand = container.querySelector('[aria-label="KLIQUE en chiffres"]');
    expect(statsBand?.textContent).toContain("14Athlètes actifs accompagnés");
    expect(statsBand?.textContent).toContain("9Partenaires & experts actifs");
    expect(statsBand?.textContent).toContain("6Disciplines représentées");
    expect(statsBand?.textContent).toContain("4Créatifs actifs");
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
    expect(statsBand?.textContent).toContain("14Athlètes actifs accompagnés");
    expect(statsBand?.textContent).toContain("9Partenaires & experts actifs");
    expect(statsBand?.textContent).toContain("6Disciplines représentées");
    expect(statsBand?.textContent).toContain("0Créatifs actifs");
  });

  it("shows no false counters while statistics are loading", async () => {
    await mount(new Promise<Response>(() => {}));

    expect(container.querySelector('[aria-label="KLIQUE en chiffres"]')).toBeNull();
    expect(container.textContent).not.toContain("0Athlètes actifs accompagnés");
  });

  it("shows a compact retryable state when statistics are unavailable", async () => {
    await mount(Promise.resolve(response({ error: "indisponible" }, false)));

    expect(container.querySelector('[aria-label="KLIQUE en chiffres"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("Les chiffres du réseau sont momentanément indisponibles.");
    expect(container.querySelector('[role="alert"] button')?.textContent).toBe("Réessayer");
    expect(container.querySelector("h1")?.textContent).toBe("Votre ambition mérite tout un réseau.");
  });

  it("shows a separate retryable state when plans are unavailable", async () => {
    await mount(undefined, Promise.resolve(response({ error: "indisponible" }, false)));

    const alerts = [...container.querySelectorAll('[role="alert"]')];
    expect(alerts.some((alert) => alert.textContent?.includes("Les offres sont momentanément indisponibles."))).toBe(true);
    expect(alerts.some((alert) => alert.querySelector("button")?.textContent === "Réessayer")).toBe(true);
  });

  it("uses the premium placeholder for a featured athlete without portrait", async () => {
    await mount(undefined, undefined, [{
      slug: "noa-roy",
      name: "Noa Roy",
      sport: "Judo",
      club: "Judo Club",
      colorCategory: "combat",
    }]);

    const featuredLink = container.querySelector('a[href="/athletes/noa-roy"]');
    expect(featuredLink?.textContent).toContain("NR");
    expect(featuredLink?.textContent).toContain("Noa Roy");
    expect(featuredLink?.querySelector("img")).toBeNull();
  });

  it("sends an authenticated visitor back to the existing workspace", async () => {
    authState.isSignedIn = true;
    await mount();

    const workspaceLinks = [...container.querySelectorAll('a[href="/today"]')];
    expect(workspaceLinks).toHaveLength(2);
    expect(workspaceLinks.every((link) => link.textContent?.includes("Accéder à mon espace"))).toBe(true);
  });
});