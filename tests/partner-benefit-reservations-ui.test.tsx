// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PartnerBenefitReservationsPage from "@/app/partner/benefit-reservations/page";
import type {
  PartnerBenefitReservation,
  PartnerBenefitReservationGroups,
  PartnerBenefitReservationStatus,
} from "@/lib/partner-benefits/partner-reservation-service";

const reservationId = "bc38cd69-3112-4273-9ba5-86d9ef6e91ba";

const reservation = (
  status: PartnerBenefitReservationStatus,
  overrides: Partial<PartnerBenefitReservation> = {},
): PartnerBenefitReservation => ({
  id: reservationId,
  benefitId: "a4ed0d44-36d6-48e3-b399-28f6ac9e2538",
  partnerId: "512c0349-236a-4f07-b099-4e6c29e22241",
  athleteId: `athlete-${status}`,
  membershipId: "membership-session",
  benefitTitle: `Avantage ${status}`,
  benefitDetails: `Détails ${status}`,
  usagePolicy: "once_per_membership",
  status,
  reservedAt: "2026-09-20T10:00:00.000Z",
  usedAt: status === "used" ? "2026-09-22T10:00:00.000Z" : null,
  cancelledAt: status === "cancelled" ? "2026-09-22T10:00:00.000Z" : null,
  expiresAt: "2027-01-15T00:00:00.000Z",
  ...overrides,
});

const groups = (overrides: Partial<PartnerBenefitReservationGroups> = {}): PartnerBenefitReservationGroups => ({
  reserved: [reservation("reserved")],
  used: [reservation("used", { id: "dde28b59-f093-42ab-9786-a7fd6b6e84fe" })],
  cancelled: [reservation("cancelled", { id: "e20281ae-975b-44e8-9386-129ef33b7a25" })],
  expired: [reservation("expired", { id: "3aaa67b0-a041-4268-9c19-747b9c4ed6ee" })],
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

const mount = async () => {
  await act(async () => {
    root.render(<PartnerBenefitReservationsPage />);
    await Promise.resolve();
    await Promise.resolve();
  });
};

const click = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "confirm").mockReturnValue(true);
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

describe("Partner benefit reservations page", () => {
  it("loads only the Partner reservations API and shows the mandatory validation guidance", async () => {
    fetchMock.mockResolvedValueOnce(response({ reservations: groups() }));

    await mount();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/benefit-reservations", {
      credentials: "include",
      cache: "no-store",
    });
    expect(container.textContent).toContain("Validation après prestation");
    expect(container.textContent).toContain("uniquement après la réalisation effective de la prestation");
    expect(container.textContent).toContain("Cette validation est définitive");
  });

  it("shows the four tabs and reservation fields without private Athlete data", async () => {
    const privateRow = {
      ...reservation("reserved"),
      athleteName: "Nom privé",
      athleteEmail: "private@example.test",
      athletePhone: "+41 00 000 00 00",
    };
    fetchMock.mockResolvedValueOnce(response({ reservations: groups({ reserved: [privateRow] }) }));

    await mount();

    for (const label of ["En attente", "Utilisées", "Annulées", "Expirées"]) {
      expect(container.textContent).toContain(label);
    }
    expect(container.textContent).toContain("athlete-reserved");
    expect(container.textContent).toContain("Avantage reserved");
    expect(container.textContent).toContain("20.09.2026");
    expect(container.textContent).toContain("15.01.2027");
    expect(container.textContent).not.toContain("Nom privé");
    expect(container.textContent).not.toContain("private@example.test");
    expect(container.textContent).not.toContain("+41 00 000 00 00");
  });

  it.each([
    ["Utilisées", "Avantage used"],
    ["Annulées", "Avantage cancelled"],
    ["Expirées", "Avantage expired"],
  ])("switches to the %s tab", async (tabLabel, expectedTitle) => {
    fetchMock.mockResolvedValueOnce(response({ reservations: groups() }));
    await mount();

    const tab = Array.from(container.querySelectorAll('[role="tab"]'))
      .find((item) => item.textContent?.includes(tabLabel)) as HTMLButtonElement;
    await click(tab);

    expect(container.textContent).toContain(expectedTitle);
    expect(container.textContent).not.toContain("Confirmer comme utilisée");
    expect(container.textContent).not.toContain("Refuser / Annuler");
  });

  it("confirms mark_used and moves the reservation to Utilisées", async () => {
    const used = reservation("used");
    fetchMock
      .mockResolvedValueOnce(response({ reservations: groups() }))
      .mockResolvedValueOnce(response({ reservation: used }));
    await mount();

    const button = Array.from(container.querySelectorAll("button"))
      .find((item) => item.textContent?.includes("Confirmer comme utilisée"))!;
    await click(button);

    expect(window.confirm).toHaveBeenCalledWith(
      "Confirmer que l’avantage « Avantage reserved » a été utilisé après prestation ?",
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/partner/benefit-reservations/${reservationId}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_used" }),
      },
    );
    expect(container.textContent).toContain("L’avantage a été confirmé comme utilisé.");
    expect(container.textContent).toContain("Aucune réservation en attente.");
  });

  it("confirms cancellation with the strict cancel action", async () => {
    const cancelled = reservation("cancelled");
    fetchMock
      .mockResolvedValueOnce(response({ reservations: groups() }))
      .mockResolvedValueOnce(response({ reservation: cancelled }));
    await mount();

    const button = Array.from(container.querySelectorAll("button"))
      .find((item) => item.textContent?.includes("Refuser / Annuler"))!;
    await click(button);

    expect(window.confirm).toHaveBeenCalledWith(
      "Refuser ou annuler la réservation pour « Avantage reserved » ?",
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/partner/benefit-reservations/${reservationId}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" }),
      }),
    );
    expect(container.textContent).toContain("La réservation a été annulée.");
  });

  it("does not mutate when confirmation is refused", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    fetchMock.mockResolvedValueOnce(response({ reservations: groups() }));
    await mount();

    const button = Array.from(container.querySelectorAll("button"))
      .find((item) => item.textContent?.includes("Confirmer comme utilisée"))!;
    await click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders loading, empty and error states", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await mount();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Chargement");

    await act(async () => root.unmount());
    root = createRoot(container);
    fetchMock.mockResolvedValueOnce(response({ reservations: groups({ reserved: [] }) }));
    await mount();
    expect(container.textContent).toContain("Aucune réservation en attente.");

    await act(async () => root.unmount());
    root = createRoot(container);
    fetchMock.mockResolvedValueOnce(response({ error: "Accès Partenaire requis." }, 403));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Accès Partenaire requis.");
  });
});