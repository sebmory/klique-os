// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AthleteMembershipOrderPurchase, {
  TWINT_PAYMENT_INSTRUCTIONS,
  type AthletePassCatalogPlan,
} from "@/components/athletes/AthleteMembershipOrderPurchase";

const plans: AthletePassCatalogPlan[] = [
  { code: "essential", name: "Essentiel", annualPriceChf: 249, productionCredits: 1, customContentCredits: 2, videoAllowed: false },
  { code: "impact", name: "Impact", annualPriceChf: 549, productionCredits: 2, customContentCredits: 4, videoAllowed: true },
  { code: "signature", name: "Signature", annualPriceChf: 999, productionCredits: 3, customContentCredits: 6, videoAllowed: true },
];

const pendingOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  publicReference: "KQ-ABCDEF123456",
  planCode: "impact",
  planName: "Impact",
  annualPriceChf: 549,
  productionCredits: 2,
  customContentCredits: 4,
  videoAllowed: true,
  status: "pending",
  expiresAt: "2026-09-30T10:00:00.000Z",
  twintPaymentUrl: "https://pay.example.test/twint",
};

const response = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
}) as unknown as Response;

const fetchMock = vi.fn();
const copyMock = vi.fn().mockResolvedValue(undefined);
const openMock = vi.fn();
let container: HTMLElement;
let root: Root;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const mount = async () => {
  await act(async () => {
    root.render(<AthleteMembershipOrderPurchase plans={plans} />);
  });
  await flush();
};

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
};

const button = (name: string) => [...container.querySelectorAll("button")]
  .find((element) => element.textContent?.trim() === name)!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  vi.stubGlobal("open", openMock);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: copyMock },
  });
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

describe("Athlete membership order purchase", () => {
  it("shows an accessible independent loading state", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));

    await mount();

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Chargement de votre demande d’adhésion");
  });

  it("shows the three canonical plans when there is no pending order", async () => {
    fetchMock.mockResolvedValueOnce(response({ order: null }));

    await mount();

    expect(container.textContent).toContain("Essentiel");
    expect(container.textContent).toContain("Impact");
    expect(container.textContent).toContain("Signature");
    expect(container.textContent).toContain("CHF 549.00/an");
    expect(container.textContent).toContain("2 crédit(s) production");
    expect(container.textContent).toContain("4 crédit(s) contenu");
    expect(container.textContent).toContain("Vidéo : incluse");
    expect(container.querySelectorAll("button")).toHaveLength(3);
  });

  it("creates an order after explicit confirmation using only planCode", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ order: null }))
      .mockResolvedValueOnce(response({ order: pendingOrder }, 201));
    await mount();

    await click(button("Choisir cette offre"));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/athlete/membership-order");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ planCode: "essential" }),
    });
    expect(container.textContent).toContain("Paiement en attente de vérification");
  });

  it("does not create an order when the confirmation is dismissed", async () => {
    fetchMock.mockResolvedValueOnce(response({ order: null }));
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await mount();

    await click(button("Choisir cette offre"));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Choisir mon offre annuelle");
  });

  it("keeps the catalog and shows the API error when creation fails", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ order: null }))
      .mockResolvedValueOnce(response({ error: "Offre indisponible." }, 404));
    await mount();

    await click(button("Choisir cette offre"));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Offre indisponible.");
    expect(container.textContent).toContain("Choisir mon offre annuelle");
    expect(container.textContent).not.toContain("Paiement en attente de vérification");
  });

  it("displays a reused pending order returned with 200 without reloading the page", async () => {
    const reused = { ...pendingOrder, planCode: "essential", planName: "Essentiel", annualPriceChf: 249 };
    fetchMock
      .mockResolvedValueOnce(response({ order: null }))
      .mockResolvedValueOnce(response({ order: reused }, 200));
    await mount();

    await click(button("Choisir cette offre"));

    expect(container.textContent).toContain("Essentiel");
    expect(container.textContent).toContain("CHF 249.00");
    expect(container.textContent).toContain("KQ-ABCDEF123456");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("prevents a double click while creating an order", async () => {
    fetchMock.mockResolvedValueOnce(response({ order: null }));
    await mount();
    let resolveCreate!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveCreate = resolve; }));
    const chooseButton = button("Choisir cette offre") as HTMLButtonElement;

    await act(async () => {
      chooseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      chooseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(chooseButton.disabled).toBe(true);
    await act(async () => resolveCreate(response({ order: pendingOrder }, 201)));
    await flush();
  });

  it("shows pending payment details and the exact instructions without claiming payment confirmation", async () => {
    fetchMock.mockResolvedValueOnce(response({ order: pendingOrder }));

    await mount();

    expect(container.textContent).toContain("Impact");
    expect(container.textContent).toContain("CHF 549.00");
    expect(container.textContent).toContain("KQ-ABCDEF123456");
    expect(container.textContent).toContain("30 septembre 2026");
    expect(container.textContent).toContain("Paiement en attente de vérification");
    expect(container.textContent).toContain(TWINT_PAYMENT_INSTRUCTIONS);
    expect(TWINT_PAYMENT_INSTRUCTIONS).toBe("Dans TWINT, saisissez exactement le montant indiqué, votre nom et la référence KLIQUE dans le champ message. Votre Pass sera activé après vérification du paiement par KLIQUE.");
    expect(container.textContent).not.toContain("Paiement confirmé");
  });

  it("copies the exact amount and public reference", async () => {
    fetchMock.mockResolvedValueOnce(response({ order: pendingOrder }));
    await mount();

    await click(button("Copier le montant"));
    await click(button("Copier la référence"));

    expect(copyMock).toHaveBeenNthCalledWith(1, "549.00");
    expect(copyMock).toHaveBeenNthCalledWith(2, "KQ-ABCDEF123456");
  });

  it("opens only the API-provided TWINT URL in a protected new tab", async () => {
    fetchMock.mockResolvedValueOnce(response({ order: pendingOrder }));
    await mount();

    await click(button("Payer avec TWINT"));

    expect(openMock).toHaveBeenCalledWith(
      "https://pay.example.test/twint",
      "_blank",
      "noopener,noreferrer",
    );
    expect(container.textContent).toContain("Paiement en attente de vérification");
    expect(container.textContent).not.toContain("Paiement confirmé");
  });

  it("cancels only after confirmation, reloads the order and returns to the catalog", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ order: pendingOrder }))
      .mockResolvedValueOnce(response({ order: { ...pendingOrder, status: "cancelled" } }))
      .mockResolvedValueOnce(response({ order: { ...pendingOrder, status: "cancelled" } }));
    await mount();

    await click(button("Annuler ma demande"));

    expect(window.confirm).toHaveBeenCalledWith("Annuler votre demande pour l’offre Impact ?");
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/athlete/membership-order",
      { method: "DELETE", credentials: "include" },
    ]);
    expect(fetchMock.mock.calls[2][0]).toBe("/api/athlete/membership-order");
    expect(container.textContent).toContain("Votre demande d’adhésion a été annulée.");
    expect(container.textContent).toContain("Choisir mon offre annuelle");
  });

  it("does not cancel when the confirmation dialog is dismissed", async () => {
    fetchMock.mockResolvedValueOnce(response({ order: pendingOrder }));
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await mount();

    await click(button("Annuler ma demande"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("KQ-ABCDEF123456");
  });

  it("shows loading and action errors accessibly without fabricating state", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "Commande indisponible." }, 500));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Commande indisponible.");

    await act(async () => { root.unmount(); });
    root = createRoot(container);
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(response({ order: pendingOrder }))
      .mockResolvedValueOnce(response({ error: "Annulation impossible." }, 409));
    await mount();
    await click(button("Annuler ma demande"));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Annulation impossible.");
    expect(container.textContent).toContain("KQ-ABCDEF123456");
    expect(container.textContent).toContain("Paiement en attente de vérification");
  });
});
