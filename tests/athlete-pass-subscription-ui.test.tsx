// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AthletePassPage from "@/app/athlete/pass/page";
import {
  ATHLETE_CONTENT_FORMATS,
  type AthleteContentFormat,
} from "@/lib/athlete-subscription-catalog";

type SubscriptionContentFormats = readonly AthleteContentFormat[];

const pass = {
  id: "membership-impact",
  contentRequestSubscriptionId: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
  membershipKind: "subscription",
  planCode: "impact",
  status: "active",
  startsAt: "2026-09-14T08:00:00.000Z",
  endsAt: "2027-09-14T08:00:00.000Z",
  autoRenew: true,
  isFounder: false,
  catalog: {
    code: "impact",
    name: "Impact",
    annualPriceChf: 549,
    productionCreditCount: 2,
    customContentCount: 4,
    videoAllowed: true,
    commonBenefits: [
      { code: "platform", name: "Plateforme KLIQUE", description: "Accès à l’espace Athlète KLIQUE." },
      { code: "media_requests", name: "Demandes médias", description: "Envoi et suivi des demandes médias." },
    ],
    contentFormats: ATHLETE_CONTENT_FORMATS as SubscriptionContentFormats,
  },
  credits: {
    production: { included: 2, available: 1 },
    customContent: { included: 4, available: 4 },
  },
};

const founderSubscription = {
  ...pass,
  id: "membership-founder",
  membershipKind: "founder",
  planCode: "founder",
  isFounder: true,
  autoRenew: false,
  catalog: {
    ...pass.catalog,
    code: "founder",
    name: "Membre fondateur",
    annualPriceChf: 0,
    productionCreditCount: 0,
    customContentCount: 0,
    videoAllowed: false,
    contentFormats: [] as SubscriptionContentFormats,
  },
  credits: {
    production: { included: 0, available: 0 },
    customContent: { included: 0, available: 0 },
  },
};

const catalogPlans = [
  {
    code: "essential",
    name: "Essentiel",
    annualPriceChf: 249,
    productionCredits: 1,
    customContentCredits: 2,
    videoAllowed: false,
  },
  {
    code: "impact",
    name: "Impact",
    annualPriceChf: 549,
    productionCredits: 2,
    customContentCredits: 4,
    videoAllowed: true,
  },
  {
    code: "signature",
    name: "Signature",
    annualPriceChf: 999,
    productionCredits: 3,
    customContentCredits: 6,
    videoAllowed: true,
  },
] as const;

const contentRequest = (overrides: Record<string, unknown> = {}) => ({
  id: "91d272d1-1a5b-4486-bbc0-69b1ce747e4d",
  subscriptionId: pass.contentRequestSubscriptionId,
  formatCode: "portrait",
  status: "requested",
  athleteNote: "Portrait pour une annonce.",
  preferredDate: "2026-10-02",
  adminNote: null,
  reservedAt: null,
  completedAt: null,
  createdAt: "2026-09-14T08:00:00.000Z",
  updatedAt: "2026-09-14T08:00:00.000Z",
  ...overrides,
});

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const response = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
}) as unknown as Response;

const mockInitialLoad = (
  currentPass: typeof pass | null = pass,
  requests: Array<ReturnType<typeof contentRequest>> = [],
) => {
  fetchMock
    .mockResolvedValueOnce(response({
      pass: currentPass,
      ...(currentPass ? {} : { plans: catalogPlans }),
    }))
    .mockResolvedValueOnce(response({ requests }))
    .mockResolvedValueOnce(response(currentPass ? { benefits: [] } : { order: null }));
};

const mount = async () => {
  await act(async () => {
    root.render(<AthletePassPage />);
    await Promise.resolve();
  });
};

const setValue = async (
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) => {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("Athlete KLIQUE Pass subscription view", () => {
  it("loads the subscription and its content requests", async () => {
    mockInitialLoad();

    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/athlete/subscription", {
      credentials: "include",
      cache: "no-store",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/athlete/subscription/content-requests", {
      credentials: "include",
      cache: "no-store",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/athlete/partner-benefits", {
      credentials: "include",
      cache: "no-store",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("displays the canonical offer, validity and annual catalog price", async () => {
    mockInitialLoad();

    await mount();

    expect(container.textContent).toContain("Impact");
    expect(container.textContent).toContain("14 septembre 2026");
    expect(container.textContent).toContain("14 septembre 2027");
    expect(container.textContent).toContain("Membre fondateur : Non");
    expect(container.textContent).toContain("CHF 549/an");
    expect(container.textContent).toContain("Renouvellement : automatique");
    expect(container.textContent).not.toContain("à payer");
  });

  it("lists canonical included and available credits, benefits and formats", async () => {
    mockInitialLoad();

    await mount();

    expect(container.textContent).toContain("Production : 1 disponible(s) sur 2");
    expect(container.textContent).toContain("Contenu personnalisé : 4 disponible(s) sur 4");
    expect(container.textContent).toContain("Vidéo : incluse");
    expect(container.textContent).toContain("Plateforme KLIQUE");
    expect(container.textContent).toContain("Demandes médias");
    expect(container.textContent).toContain("Portrait");
    expect(container.textContent).toContain("Reel");
  });

  it("shows Founder validity and complimentary platform access without guaranteed content UI", async () => {
    mockInitialLoad(founderSubscription);

    await mount();

    expect(container.textContent).toContain("Membre fondateur");
    expect(container.textContent).toContain("14 septembre 2026");
    expect(container.textContent).toContain("14 septembre 2027");
    expect(container.textContent).toContain("Accès plateforme offert pendant un an");
    expect(container.textContent).toContain("Plateforme KLIQUE");
    expect(container.textContent).not.toContain("Offre active");
    expect(container.textContent).not.toContain("Crédits de l’offre");
    expect(container.textContent).not.toContain("Formats disponibles");
    expect(container.textContent).not.toContain("Mes contenus personnalisés");
    expect(container.textContent).not.toContain("Renouvellement :");
    expect(container.textContent).not.toContain("Choisir cette offre");
    expect(container.textContent).not.toContain("TWINT");
    expect(container.querySelector("form")).toBeNull();
  });

  it("shows annual, occupied and available places for the current subscription", async () => {
    mockInitialLoad(pass, [
      contentRequest({ id: "request-1", status: "requested" }),
      contentRequest({ id: "request-2", status: "completed" }),
      contentRequest({ id: "request-3", status: "declined" }),
      contentRequest({ id: "request-old", subscriptionId: "old-subscription", status: "accepted" }),
    ]);

    await mount();

    const quota = container.querySelector('[aria-label="Quota de contenus personnalisés"]');
    expect(quota?.textContent).toContain("Crédits inclus4");
    expect(quota?.textContent).toContain("Places occupées2");
    expect(quota?.textContent).toContain("Places disponibles2");
  });

  it("shows the canonical catalog without an active subscription", async () => {
    mockInitialLoad(null);

    await mount();

    expect(container.textContent).toContain("Essentiel");
    expect(container.textContent).toContain("Impact");
    expect(container.textContent).toContain("Signature");
    expect(container.textContent).toContain("CHF 249.00/an");
    expect(container.textContent).toContain("1 crédit(s) production");
    expect(container.textContent).toContain("2 crédit(s) contenu");
    expect(container.textContent).toContain("Vidéo : non incluse");
    expect(container.querySelectorAll("button")).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith("/api/athlete/membership-order", {
      credentials: "include",
      cache: "no-store",
    });
  });

  it("does not load or display membership ordering for an active commercial Pass", async () => {
    mockInitialLoad();

    await mount();

    expect(fetchMock.mock.calls.some(([url]) => url === "/api/athlete/membership-order")).toBe(false);
    expect(container.textContent).not.toContain("Choisir cette offre");
    expect(container.textContent).not.toContain("Payer avec TWINT");
  });

  it("exposes accessible loading and error states", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await mount();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Chargement");

    await act(async () => { root.unmount(); });
    root = createRoot(container);
  fetchMock.mockReset();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/athlete/subscription") {
        return Promise.resolve(response({ error: "Accès refusé." }, 403));
      }
      if (url === "/api/athlete/subscription/content-requests") {
        return Promise.resolve(response({ requests: [] }));
      }
      if (url === "/api/athlete/partner-benefits") {
        return Promise.resolve(response({ benefits: [] }));
      }
      throw new Error(`URL inattendue : ${url}`);
    });
    await mount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Accès refusé.");
  });

  it("offers all 12 formats and explains the selected format media", async () => {
    mockInitialLoad();
    await mount();

    const select = container.querySelector('[aria-label="Format du contenu"]') as HTMLSelectElement;
    expect(select.options).toHaveLength(13);

    await act(async () => {
      select.value = "editorial_interview";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("Entretien rédigé qui approfondit le parcours");
    expect(container.textContent).toContain("Médias nécessaires : Informations Athlète, Audio d’interview, Photo portrait");
  });

  it("submits optional values and prepends the created request locally", async () => {
    const createdRequest = contentRequest({
      id: "created-request",
      formatCode: "reel",
      athleteNote: "Une capsule dynamique",
      preferredDate: "2026-11-03",
    });
    mockInitialLoad(pass, [contentRequest({ id: "existing-request", status: "declined" })]);
    fetchMock.mockResolvedValueOnce(response({ request: createdRequest }, 201));
    await mount();

    const select = container.querySelector('[aria-label="Format du contenu"]') as HTMLSelectElement;
    const note = container.querySelector('[aria-label="Note pour KLIQUE"]') as HTMLTextAreaElement;
    const date = container.querySelector('[aria-label="Date souhaitée"]') as HTMLInputElement;
    await act(async () => {
      select.value = "reel";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await setValue(note, " Une capsule dynamique ");
    await setValue(date, "2026-11-03");

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenLastCalledWith("/api/athlete/subscription/content-requests", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formatCode: "reel",
        athleteNote: "Une capsule dynamique",
        preferredDate: "2026-11-03",
      }),
    });
    expect(container.textContent).toContain("Votre demande de contenu a été envoyée.");
    expect(container.textContent).toContain("Une capsule dynamique");
    expect(container.textContent).toContain("Places occupées1");
    expect(container.textContent).toContain("Places disponibles3");
  });

  it.each([
    ["requested", "Demandé"],
    ["accepted", "Accepté"],
    ["in_progress", "En cours"],
    ["completed", "Terminé"],
    ["declined", "Refusé"],
    ["cancelled", "Annulé"],
  ])("renders status %s in French", async (status, label) => {
    mockInitialLoad(pass, [contentRequest({ status })]);

    await mount();

    expect(container.textContent).toContain(label);
  });

  it("blocks submission when every annual place is occupied", async () => {
    mockInitialLoad(pass, [
      contentRequest({ id: "request-1", status: "requested" }),
      contentRequest({ id: "request-2", status: "accepted" }),
      contentRequest({ id: "request-3", status: "in_progress" }),
      contentRequest({ id: "request-4", status: "completed" }),
    ]);
    await mount();

    const submit = Array.from(container.querySelectorAll("button")).find((button) => (
      button.textContent?.includes("Envoyer la demande")
    ));
    expect(submit?.disabled).toBe(true);
    expect(container.textContent).toContain("Votre quota annuel est occupé");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});