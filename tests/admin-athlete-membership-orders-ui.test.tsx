// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Athlete } from "@/types/athlete";
import AthleteMembershipOrdersAdminSection, {
  TWINT_CONFIRMATION_WARNING,
} from "@/components/settings/AthleteMembershipOrdersAdminSection";

const orderId = "11111111-1111-4111-8111-111111111111";
const athlete: Athlete = {
  key: "athlete-1",
  name: "Lina Morel",
  initials: "LM",
  sport: "Athlétisme",
  club: "KLIQUE Club",
  status: "Actif",
  instagram: "",
  phone: "",
  email: "athlete-1@example.com",
  nextContact: "",
  notes: "",
  palmares: "",
  objective: "",
  longTerm: "",
  desiredAreas: "",
  lastContact: "",
  nextAction: "",
  followUpNotes: "",
  lastResponseMonthly: "",
  lastResponseWeekly: "",
  lastPublication: "",
  titlesOfMonth: "",
  analysisItems: "",
  plannedContents: "",
  lastPost: "",
  lastStory: "",
  daysWithoutVisibility: 0,
  lastShoot: "",
  media: 0,
  premium: 0,
  coverage: 0,
  tone: "solid",
  heightWeight: "",
  birthDate: "",
  nationality: "",
  position: "",
  competitionPhoto: false,
  adhesionDate: "14.09.2026",
};
const pendingOrder = {
  id: orderId,
  publicReference: "KQ-ABCDEF123456",
  athleteId: athlete.key,
  athleteName: athlete.name,
  planCode: "impact",
  planName: "Impact",
  annualPriceChf: 549,
  durationMonths: 12,
  productionCredits: 2,
  customContentCredits: 4,
  videoAllowed: true,
  paymentMethod: "twint_business",
  status: "pending",
  membershipId: null,
  expiresAt: "2026-09-30T10:00:00.000Z",
  paidAt: null,
  cancelledAt: null,
  createdAt: "2026-09-23T10:00:00.000Z",
  updatedAt: "2026-09-23T10:00:00.000Z",
};

const response = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
}) as unknown as Response;

const fetchMock = vi.fn();
const refreshMemberships = vi.fn().mockResolvedValue(undefined);
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
    root.render(
      <AthleteMembershipOrdersAdminSection
        athletes={[athlete]}
        onMembershipsRefresh={refreshMemberships}
      />,
    );
  });
  await flush();
};

const setSelect = async (label: string, value: string) => {
  const select = [...container.querySelectorAll("label")]
    .find((element) => element.textContent?.includes(label))
    ?.querySelector("select") as HTMLSelectElement;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  await act(async () => {
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
};

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
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

describe("Athlete membership orders Admin section", () => {
  it("shows an accessible loading state and loads pending orders by default", async () => {
    let resolveLoad!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveLoad = resolve; }));

    await act(async () => {
      root.render(
        <AthleteMembershipOrdersAdminSection
          athletes={[athlete]}
          onMembershipsRefresh={refreshMemberships}
        />,
      );
    });

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Chargement des commandes TWINT");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/athlete-membership-orders?status=pending",
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );

    await act(async () => resolveLoad(response({ orders: [] })));
  });

  it("shows the empty state", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [] }));

    await mount();

    expect(container.textContent).toContain("Aucune commande ne correspond à ces filtres.");
  });

  it("shows an accessible API error", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "File TWINT indisponible." }, 500));

    await mount();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("File TWINT indisponible.");
  });

  it("displays the complete order information and credits", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [pendingOrder] }));

    await mount();

    expect(container.textContent).toContain("Lina Morel");
    expect(container.textContent).toContain("Impact");
    expect(container.textContent).toContain("549.00");
    expect(container.textContent).toContain("KQ-ABCDEF123456");
    expect(container.textContent).toContain("Créée le");
    expect(container.textContent).toContain("Expire le");
    expect(container.textContent).toContain("En attente");
    expect(container.textContent).toContain("Crédits production2");
    expect(container.textContent).toContain("Crédits contenus4");
  });

  it("reloads through the collection endpoint with status, plan and athlete filters", async () => {
    fetchMock.mockResolvedValue(response({ orders: [] }));
    await mount();

    await setSelect("Statut", "paid");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/athlete-membership-orders?status=paid",
      expect.any(Object),
    );

    await setSelect("Offre", "impact");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/athlete-membership-orders?status=paid&planCode=impact",
      expect.any(Object),
    );

    await setSelect("Athlète", "athlete-1");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/athlete-membership-orders?status=paid&planCode=impact&athleteId=athlete-1",
      expect.any(Object),
    );
  });

  it("shows the exact TWINT warning before confirming and permits cancellation", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [pendingOrder] }));
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await mount();

    await click([...container.querySelectorAll("button")].find((button) => button.textContent === "Confirmer le paiement")!);

    expect(window.confirm).toHaveBeenCalledWith(TWINT_CONFIRMATION_WARNING);
    expect(TWINT_CONFIRMATION_WARNING).toBe("Confirmez uniquement après avoir vérifié dans TWINT Business que le montant et la référence correspondent à cette commande. Cette action active immédiatement le Pass et attribue les crédits.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("confirms once, disables the action and prevents a double click", async () => {
    fetchMock.mockResolvedValueOnce(response({ orders: [pendingOrder] }));
    await mount();

    let resolveConfirmation!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveConfirmation = resolve; }));
    const button = [...container.querySelectorAll("button")]
      .find((element) => element.textContent === "Confirmer le paiement")! as HTMLButtonElement;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(button.disabled).toBe(true);
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/admin/athlete-membership-orders/${orderId}/confirm`);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", body: "{}" });

    fetchMock.mockResolvedValueOnce(response({ orders: [] }));
    await act(async () => resolveConfirmation(response({
      order: { ...pendingOrder, status: "paid" },
      membershipId: "22222222-2222-4222-8222-222222222222",
      alreadyPaid: false,
    })));
    await flush();
  });

  it("refreshes orders and canonical memberships after success and names the athlete and offer", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ orders: [pendingOrder] }))
      .mockResolvedValueOnce(response({ order: { ...pendingOrder, status: "paid" } }))
      .mockResolvedValueOnce(response({ orders: [] }));
    await mount();

    await click([...container.querySelectorAll("button")].find((button) => button.textContent === "Confirmer le paiement")!);

    expect(fetchMock.mock.calls[1][0]).toBe(`/api/admin/athlete-membership-orders/${orderId}/confirm`);
    expect(fetchMock.mock.calls[2][0]).toBe("/api/admin/athlete-membership-orders?status=pending");
    expect(refreshMemberships).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Paiement confirmé pour Lina Morel · Impact.");
  });

  it("keeps the order and displays the API message when confirmation fails", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ orders: [pendingOrder] }))
      .mockResolvedValueOnce(response({ error: "Commande déjà annulée." }, 409));
    await mount();

    await click([...container.querySelectorAll("button")].find((button) => button.textContent === "Confirmer le paiement")!);

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Commande déjà annulée.");
    expect(container.textContent).toContain("KQ-ABCDEF123456");
    expect(refreshMemberships).not.toHaveBeenCalled();
  });

  it.each(["paid", "cancelled", "expired"] as const)(
    "does not render confirmation or other actions for a %s order",
    async (status) => {
      fetchMock.mockResolvedValueOnce(response({ orders: [{ ...pendingOrder, status }] }));

      await mount();

      expect(container.querySelectorAll("button")).toHaveLength(0);
      expect(container.textContent).not.toContain("Confirmer le paiement");
      expect(container.textContent).not.toContain("Annuler");
      expect(container.textContent).not.toContain("Supprimer");
      expect(container.textContent).not.toContain("Modifier");
    },
  );
});
