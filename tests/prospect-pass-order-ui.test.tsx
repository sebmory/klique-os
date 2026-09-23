// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProspectPassOrder, {
  PROSPECT_FOLLOW_UP_MESSAGE,
  PROSPECT_TWINT_INSTRUCTIONS,
} from "@/components/pass/ProspectPassOrder";

const plans = [
  { code: "essential", name: "Essentiel", annualPriceChf: 249, durationMonths: 12, productionCredits: 1, customContentCredits: 2, videoAllowed: false },
  { code: "impact", name: "Impact", annualPriceChf: 549, durationMonths: 12, productionCredits: 2, customContentCredits: 4, videoAllowed: true },
  { code: "signature", name: "Signature", annualPriceChf: 999, durationMonths: 12, productionCredits: 3, customContentCredits: 6, videoAllowed: true },
];
const pendingOrder = {
  ...plans[1],
  id: "11111111-1111-4111-8111-111111111111",
  publicReference: "KQ-ABCDEF123456",
  verifiedEmail: "prospect@example.test",
  fullName: "Lina Morel",
  phone: "+41790000000",
  planCode: "impact",
  planName: "Impact",
  paymentMethod: "twint_business",
  status: "pending_payment",
  termsVersion: "2026-09-23",
  termsAcceptedAt: "2026-09-23T10:00:00.000Z",
  expiresAt: "2026-09-30T10:00:00.000Z",
  paidAt: null,
  cancelledAt: null,
  createdAt: "2026-09-23T10:00:00.000Z",
  updatedAt: "2026-09-23T10:00:00.000Z",
  twintPaymentUrl: "https://pay.example.test/twint",
};
const response = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
}) as Response;

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
const mount = async (initialPlan: "essential" | "impact" | "signature" | null = "impact") => {
  await act(async () => root.render(<ProspectPassOrder initialPlan={initialPlan} />));
  await flush();
};
const button = (name: string) => [...container.querySelectorAll("button")]
  .find((element) => element.textContent?.trim() === name)!;
const click = async (element: Element) => {
  await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  vi.stubGlobal("open", openMock);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copyMock } });
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

describe("Prospect Pass order", () => {
  it("loads catalog and current order, then shows the selected offer form", async () => {
    fetchMock.mockResolvedValueOnce(response({ plans })).mockResolvedValueOnce(response({ order: null }));
    await mount();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/public/membership-plans",
      "/api/join/pass/order",
    ]);
    expect(container.textContent).toContain("Impact");
    expect(container.textContent).toContain("Nom complet");
    expect(container.textContent).toContain("Téléphone (facultatif)");
    expect(container.textContent).toContain("Lire les conditions commerciales");
    expect(container.textContent).toContain("commence seulement après réception et validation");
    expect(container.querySelector('a[href="/pass"]')?.textContent).toContain("Choisir une autre offre");
  });

  it("requires consent and sends only the strict normalized creation body", async () => {
    fetchMock.mockResolvedValueOnce(response({ plans })).mockResolvedValueOnce(response({ order: null }));
    await mount();
    const name = container.querySelector('input[name="fullName"]') as HTMLInputElement;
    const phone = container.querySelector('input[name="phone"]') as HTMLInputElement;
    const form = container.querySelector("form")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(name, " Lina Morel ");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("accepter les conditions");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      checkbox.click();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(phone, " +41790000000 ");
      phone.dispatchEvent(new Event("input", { bubbles: true }));
    });
    fetchMock.mockResolvedValueOnce(response({ order: pendingOrder }, 201));
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ planCode: "impact", fullName: "Lina Morel", phone: "+41790000000", termsAccepted: true }),
    });
  });

  it("prevents duplicate order creation", async () => {
    fetchMock.mockResolvedValueOnce(response({ plans })).mockResolvedValueOnce(response({ order: null }));
    await mount();
    const name = container.querySelector('input[name="fullName"]') as HTMLInputElement;
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const form = container.querySelector("form")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(name, "Lina Morel");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      checkbox.click();
    });
    let resolveCreate!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveCreate = resolve; }));
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((button("Création…") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolveCreate(response({ order: pendingOrder }, 201)));
  });

  it("lets an existing live order override the URL plan and shows exact pending instructions", async () => {
    fetchMock.mockResolvedValueOnce(response({ plans })).mockResolvedValueOnce(response({ order: pendingOrder }));
    await mount("signature");
    expect(container.textContent).toContain("Impact");
    expect(container.textContent).toContain("CHF 549.00");
    expect(container.textContent).toContain("KQ-ABCDEF123456");
    expect(container.textContent).toContain("30 septembre 2026");
    expect(container.textContent).toContain(PROSPECT_TWINT_INSTRUCTIONS);
    expect(container.textContent).toContain(PROSPECT_FOLLOW_UP_MESSAGE);
    expect(container.textContent).not.toContain("Paiement vérifié");
  });

  it("copies payment values and opens only the server TWINT URL safely", async () => {
    fetchMock.mockResolvedValueOnce(response({ plans })).mockResolvedValueOnce(response({ order: pendingOrder }));
    await mount();
    await click(button("Copier le montant"));
    await click(button("Copier la référence"));
    await click(button("Payer avec TWINT"));
    expect(copyMock).toHaveBeenNthCalledWith(1, "549.00");
    expect(copyMock).toHaveBeenNthCalledWith(2, "KQ-ABCDEF123456");
    expect(openMock).toHaveBeenCalledWith("https://pay.example.test/twint", "_blank", "noopener,noreferrer");
    expect(container.textContent).not.toContain("Paiement vérifié");
  });

  it("cancels only after confirmation and returns to the selected offer", async () => {
    fetchMock.mockResolvedValueOnce(response({ plans })).mockResolvedValueOnce(response({ order: pendingOrder }));
    await mount();
    fetchMock.mockResolvedValueOnce(response({ order: { ...pendingOrder, status: "cancelled" } }));
    await click(button("Annuler la commande"));
    expect(window.confirm).toHaveBeenCalledWith("Annuler votre commande pour l’offre Impact ?");
    expect(fetchMock.mock.calls[2]).toEqual(["/api/join/pass/order", { method: "DELETE", credentials: "include" }]);
    expect(container.textContent).toContain("Préparer ma commande");
    expect(container.textContent).toContain("Votre commande a été annulée.");
  });

  it("shows paid awaiting form without cancellation, portal access, credits, or active Pass claims", async () => {
    const paid = { ...pendingOrder, status: "paid_awaiting_form", paidAt: "2026-09-23T12:00:00.000Z" };
    fetchMock.mockResolvedValueOnce(response({ plans })).mockResolvedValueOnce(response({ order: paid }));
    await mount();
    expect(container.textContent).toContain("Paiement vérifié");
    expect(container.textContent).toContain("KLIQUE vous enverra personnellement le formulaire");
    expect(container.textContent).toContain("Votre Pass n’est pas encore actif");
    expect(button("Annuler la commande")).toBeUndefined();
    expect(container.textContent).not.toContain("crédit(s)");
    expect(container.textContent).not.toContain("Accéder à mon espace");
  });

  it("shows accessible loading and API error states without technical leakage", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce(response({ order: null }));
    await mount();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Chargement de votre parcours Pass");

    await act(async () => root.unmount());
    root = createRoot(container);
    fetchMock.mockReset()
      .mockResolvedValueOnce(response({ plans }))
      .mockResolvedValueOnce(response({ error: "Parcours indisponible." }, 500));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Parcours indisponible.");
    expect(container.textContent).not.toContain("SQL");
  });
});