// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AthleteMembershipProspectOrdersAdminSection, {
  PROSPECT_ACTIVATION_CONFIRMATION_WARNING,
  PROSPECT_PAYMENT_CONFIRMATION_WARNING,
  PROSPECT_PAYMENT_CONFIRMED_LABEL,
} from "@/components/settings/AthleteMembershipProspectOrdersAdminSection";
import type { Athlete } from "@/types/athlete";

const orderId = "11111111-1111-4111-8111-111111111111";
const pendingOrder = {
  id: orderId,
  publicReference: "KQ-ABCDEF123456",
  verifiedEmail: "prospect@example.test",
  fullName: "Lina Morel",
  phone: "+41790000000",
  planCode: "impact",
  planName: "Impact",
  annualPriceChf: 549,
  paymentMethod: "twint_business",
  status: "pending_payment",
  expiresAt: "2026-09-30T10:00:00.000Z",
  paidAt: null,
  cancelledAt: null,
  createdAt: "2026-09-23T10:00:00.000Z",
  updatedAt: "2026-09-23T10:00:00.000Z",
};

const paidOrder = {
  ...pendingOrder,
  status: "paid_awaiting_form",
  paidAt: "2026-09-23T11:00:00.000Z",
};

const canonicalAthlete = {
  row: 12,
  athleteId: "lina-morel",
  key: "lina-morel",
  name: "Lina Morel",
  email: "prospect@example.test",
} as Athlete;

const response = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
}) as Response;

const fetchMock = vi.fn();
const membershipsRefreshMock = vi.fn<() => Promise<void>>();
let container: HTMLElement;
let root: Root;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const mount = async (athletes: Athlete[] = [canonicalAthlete]) => {
  await act(async () => root.render(
    <AthleteMembershipProspectOrdersAdminSection
      athletes={athletes}
      onMembershipsRefresh={membershipsRefreshMock}
    />,
  ));
  await flush();
};

const confirmButton = () => [...container.querySelectorAll("button")]
  .find((button) => button.textContent?.trim() === "Confirmer le paiement");

const activationButton = () => [...container.querySelectorAll("button")]
  .find((button) => button.textContent?.trim() === "Activer le Pass");

const athleteSelect = () => container.querySelector('select[aria-label^="Fiche Athlete canonique"]') as HTMLSelectElement;

const setSelectValue = async (select: HTMLSelectElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  await act(async () => select.dispatchEvent(new Event("change", { bubbles: true })));
  await flush();
};

const click = async (element: Element) => {
  await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  membershipsRefreshMock.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
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

describe("Admin prospect membership orders settings section", () => {
  it("shows an accessible loading state and uses pending_payment as the initial filter", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await mount();

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Chargement des commandes publiques");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/admin/athlete-membership-prospect-orders?status=pending_payment",
    );
    expect((container.querySelector("select") as HTMLSelectElement).value).toBe("pending_payment");
  });

  it("shows the API error", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "File momentanément indisponible." }, 500));
    await mount();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("File momentanément indisponible.");
  });

  it("shows the empty state", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [] }));
    await mount();

    expect(container.textContent).toContain("Aucune commande publique ne correspond à ces filtres.");
  });

  it("shows useful prospect, offer, payment and timing data", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [pendingOrder] }));
    await mount();

    for (const value of [
      "Lina Morel",
      "prospect@example.test",
      "+41790000000",
      "Impact",
      "CHF",
      "KQ-ABCDEF123456",
      "Commandée le",
      "Expire le",
      "Paiement en attente",
    ]) {
      expect(container.textContent).toContain(value);
    }
  });

  it("asks for explicit confirmation before calling the confirmation API", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [pendingOrder] }));
    await mount();
    fetchMock.mockResolvedValueOnce(response({ order: { ...pendingOrder, status: "paid_awaiting_form" }, alreadyConfirmed: false }));
    fetchMock.mockResolvedValueOnce(response({ orders: [] }));

    await click(confirmButton()!);

    expect(window.confirm).toHaveBeenCalledWith(PROSPECT_PAYMENT_CONFIRMATION_WARNING);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `/api/admin/athlete-membership-prospect-orders/${orderId}/confirm-payment`,
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", body: "{}" });
  });

  it("does not call the API when confirmation is cancelled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    fetchMock.mockResolvedValueOnce(response({ orders: [pendingOrder] }));
    await mount();

    await click(confirmButton()!);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the manual form status and refreshes after success", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [pendingOrder] }));
    await mount();
    fetchMock.mockResolvedValueOnce(response({ order: { ...pendingOrder, status: "paid_awaiting_form" }, alreadyConfirmed: false }));
    fetchMock.mockResolvedValueOnce(response({ orders: [] }));

    await click(confirmButton()!);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/admin/athlete-membership-prospect-orders?status=pending_payment",
    );
    expect(container.textContent).toContain(`${PROSPECT_PAYMENT_CONFIRMED_LABEL} pour Lina Morel.`);
  });

  it("blocks a double click while confirmation is in progress", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [pendingOrder] }));
    await mount();
    let resolveConfirmation!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveConfirmation = resolve; }));
    const button = confirmButton()!;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.confirm).toHaveBeenCalledOnce();
    expect((container.querySelector('button[aria-busy="true"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolveConfirmation(response({ order: pendingOrder, alreadyConfirmed: false })));
  });

  it.each(["pending_payment", "activated", "cancelled", "expired"])(
    "offers no activation action for %s orders",
    async (status) => {
      fetchMock.mockResolvedValueOnce(response({ orders: [{ ...pendingOrder, status }] }));
      await mount();

      expect(activationButton()).toBeUndefined();
      if (status === "pending_payment") expect(confirmButton()).toBeDefined();
      if (status === "activated") expect(container.textContent).toContain("Pass activé");
    },
  );

  it("offers only canonical Athlete rows", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [paidOrder] }));
    await mount([
      canonicalAthlete,
      { ...canonicalAthlete, row: 0, key: "virtual-athlete", athleteId: "virtual-athlete", name: "Fiche virtuelle" },
      { ...canonicalAthlete, row: undefined, key: "missing-row", athleteId: "missing-row", name: "Sans ligne" },
    ]);

    const options = [...athleteSelect().options].map((option) => option.textContent);
    expect(options).toContain("Lina Morel — prospect@example.test");
    expect(options).not.toContain("Fiche virtuelle — prospect@example.test");
    expect(options).not.toContain("Sans ligne — prospect@example.test");
  });

  it("never preselects an Athlete by name", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [paidOrder] }));
    await mount([{ ...canonicalAthlete, email: "other@example.test" }]);

    expect(athleteSelect().value).toBe("");
    expect(container.textContent).not.toContain("Présélection automatique");
  });

  it("preselects only one unique exact normalized email match and makes it visible", async () => {
    fetchMock.mockResolvedValueOnce(response({
      orders: [{ ...paidOrder, verifiedEmail: " Prospect@Example.Test " }],
    }));
    await mount([
      canonicalAthlete,
      { ...canonicalAthlete, row: 13, key: "other-athlete", athleteId: "other-athlete", name: "Autre Athlete", email: "other@example.test" },
    ]);

    expect(athleteSelect().value).toBe("lina-morel");
    expect(container.textContent).toContain("Présélection automatique : correspondance unique sur l’e-mail exact.");
    expect((activationButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not preselect when several canonical Athletes share the exact email", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [paidOrder] }));
    await mount([
      canonicalAthlete,
      { ...canonicalAthlete, row: 13, key: "duplicate-email", athleteId: "duplicate-email", name: "Homonyme" },
    ]);

    expect(athleteSelect().value).toBe("");
    expect((activationButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("allows a manual canonical selection when normalized emails match", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [paidOrder] }));
    await mount([
      { ...canonicalAthlete, email: " Prospect@Example.Test " },
      { ...canonicalAthlete, row: 13, key: "duplicate-email", athleteId: "duplicate-email", email: "prospect@example.test" },
    ]);

    await setSelectValue(athleteSelect(), "duplicate-email");

    expect(athleteSelect().value).toBe("duplicate-email");
    expect((activationButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows both emails and blocks activation when they differ", async () => {
    const differentEmailAthlete = { ...canonicalAthlete, email: "different@example.test" };
    fetchMock.mockResolvedValueOnce(response({ orders: [paidOrder] }));
    await mount([differentEmailAthlete]);

    await setSelectValue(athleteSelect(), differentEmailAthlete.key);

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("E-mail commande : prospect@example.test");
    expect(alert?.textContent).toContain("E-mail fiche Athlete : different@example.test");
    expect(alert?.textContent).toContain("02_Athlètes");
    expect(alert?.textContent).toContain("synchronisez");
    expect((activationButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks for confirmation, calls only the activation route and refreshes both projections", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [paidOrder] }));
    await mount();
    fetchMock.mockResolvedValueOnce(response({
      order: { ...paidOrder, status: "activated", athleteId: canonicalAthlete.key },
      membership: { athleteId: canonicalAthlete.key, status: "active" },
      alreadyActivated: false,
    }));
    fetchMock.mockResolvedValueOnce(response({ orders: [] }));

    await click(activationButton()!);

    expect(window.confirm).toHaveBeenCalledWith(PROSPECT_ACTIVATION_CONFIRMATION_WARNING);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `/api/admin/athlete-membership-prospect-orders/${orderId}/activate`,
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId: "lina-morel" }),
    });
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/admin/athlete-membership-prospect-orders?status=pending_payment",
    );
    expect(membershipsRefreshMock).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Pass activé");
    expect(activationButton()).toBeUndefined();
  });

  it("does not activate when the explicit confirmation is cancelled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    fetchMock.mockResolvedValueOnce(response({ orders: [paidOrder] }));
    await mount();

    await click(activationButton()!);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(membershipsRefreshMock).not.toHaveBeenCalled();
  });

  it("blocks a double click and disables the canonical selection during activation", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [paidOrder] }));
    await mount();
    let resolveActivation!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveActivation = resolve; }));
    fetchMock.mockResolvedValueOnce(response({ orders: [] }));
    const button = activationButton()!;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.confirm).toHaveBeenCalledOnce();
    expect((container.querySelector('button[aria-busy="true"]') as HTMLButtonElement).disabled).toBe(true);
    expect(athleteSelect().disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Activation du Pass en cours");
    await act(async () => resolveActivation(response({
      order: { ...paidOrder, status: "activated" },
      membership: { athleteId: canonicalAthlete.key, status: "active" },
      alreadyActivated: false,
    })));
  });

  it("shows the business message returned by a 409 response", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [paidOrder] }));
    await mount();
    fetchMock.mockResolvedValueOnce(response({
      error: "L’accès plateforme existant est incompatible avec cet Athlete.",
    }, 409));

    await click(activationButton()!);

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "L’accès plateforme existant est incompatible avec cet Athlete.",
    );
    expect(membershipsRefreshMock).not.toHaveBeenCalled();
  });
});