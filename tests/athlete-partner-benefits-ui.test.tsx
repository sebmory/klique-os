// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AthletePartnerBenefits } from "@/components/ecosystem/AthletePartnerBenefits";
import type {
  AthletePartnerBenefit,
  AthletePartnerBenefitPersonalStatus,
  AthletePartnerBenefitReservation,
} from "@/lib/partner-benefits/athlete-service";

const partnerId = "512c0349-236a-4f07-b099-4e6c29e22241";
const otherPartnerId = "c54c63e1-9ad3-475b-a526-568c6f1fcbbc";
const reservationId = "bc38cd69-3112-4273-9ba5-86d9ef6e91ba";

const benefit = (
  id: string,
  personalStatus: AthletePartnerBenefitPersonalStatus,
  overrides: Partial<AthletePartnerBenefit> = {},
): AthletePartnerBenefit => ({
  id,
  partnerId,
  title: `Avantage ${personalStatus}`,
  details: `Détails ${personalStatus}`,
  usagePolicy: "once_per_membership",
  validFrom: "2026-09-01T00:00:00.000Z",
  expiresAt: "2027-01-15T00:00:00.000Z",
  availability: personalStatus === "reserved" ? "already_reserved" : "available",
  personalStatus,
  available: personalStatus === "available" || personalStatus === "cancelled",
  activeReservationId: personalStatus === "reserved" ? reservationId : null,
  ...overrides,
});

const reservation = (status: "reserved" | "cancelled"): AthletePartnerBenefitReservation => ({
  id: reservationId,
  workspaceId: "workspace-session",
  benefitId: "a4ed0d44-36d6-48e3-b399-28f6ac9e2538",
  partnerId,
  athleteId: "athlete-session",
  membershipId: "membership-session",
  membershipStartsAt: "2026-01-01T00:00:00.000Z",
  membershipEndsAt: "2027-01-01T00:00:00.000Z",
  usagePolicy: "once_per_membership",
  usageScopeKey: "membership-session",
  status,
  reservedAt: "2026-09-22T10:00:00.000Z",
  cancelledAt: status === "cancelled" ? "2026-09-22T11:00:00.000Z" : null,
  expiresAt: "2027-01-01T00:00:00.000Z",
});

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const response = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
}) as unknown as Response;

const mount = async (element: React.ReactNode) => {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
    await Promise.resolve();
  });
};

const click = async (button: HTMLButtonElement) => {
  await act(async () => {
    button.click();
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
  await act(async () => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Athlete partner benefits detail", () => {
  it("shows this partner structured benefits, personal statuses, rules and deadlines", async () => {
    const benefits = [
      benefit("10000000-0000-4000-8000-000000000001", "available", { usagePolicy: "once_lifetime" }),
      benefit("10000000-0000-4000-8000-000000000002", "reserved", { usagePolicy: "once_per_membership" }),
      benefit("10000000-0000-4000-8000-000000000003", "used", { usagePolicy: "unlimited", available: false }),
      benefit("10000000-0000-4000-8000-000000000004", "cancelled"),
      benefit("10000000-0000-4000-8000-000000000005", "expired", { available: false }),
      benefit("10000000-0000-4000-8000-000000000006", "available", { partnerId: otherPartnerId, title: "Autre partenaire" }),
    ];
    fetchMock.mockResolvedValueOnce(response({ benefits }));

    await mount(<AthletePartnerBenefits mode="partner" partnerId={partnerId} />);

    expect(fetchMock).toHaveBeenCalledWith("/api/athlete/partner-benefits", {
      credentials: "include",
      cache: "no-store",
    });
    for (const label of ["Disponible", "Réservé", "Utilisé", "Annulé", "Expiré"]) {
      expect(container.textContent).toContain(label);
    }
    expect(container.textContent).toContain("Une fois pendant votre parcours KLIQUE");
    expect(container.textContent).toContain("Une fois par adhésion");
    expect(container.textContent).toContain("Utilisation illimitée");
    expect(container.textContent).toContain("15 janvier 2027");
    expect(container.textContent).not.toContain("Autre partenaire");
    expect(container.textContent).toContain("Réserver cet avantage");
    expect(container.textContent).toContain("Annuler ma réservation");
    expect(container.textContent).not.toContain("Valider l’utilisation");
  });

  it("asks for confirmation then reserves with benefitId only", async () => {
    const currentBenefit = benefit("a4ed0d44-36d6-48e3-b399-28f6ac9e2538", "available");
    fetchMock
      .mockResolvedValueOnce(response({ benefits: [currentBenefit] }))
      .mockResolvedValueOnce(response({ reservation: reservation("reserved") }, 201));
    await mount(<AthletePartnerBenefits mode="partner" partnerId={partnerId} />);

    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Réserver cet avantage"))!;
    await click(button);

    expect(window.confirm).toHaveBeenCalledWith("Réserver l’avantage « Avantage available » ?");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/athlete/partner-benefits", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ benefitId: currentBenefit.id }),
    });
    expect(container.textContent).toContain("Avantage réservé avec succès.");
    expect(container.textContent).toContain("Annuler ma réservation");
  });

  it("asks for confirmation then cancels through the reservation endpoint", async () => {
    const currentBenefit = benefit("a4ed0d44-36d6-48e3-b399-28f6ac9e2538", "reserved");
    fetchMock
      .mockResolvedValueOnce(response({ benefits: [currentBenefit] }))
      .mockResolvedValueOnce(response({ reservation: reservation("cancelled") }));
    await mount(<AthletePartnerBenefits mode="partner" partnerId={partnerId} />);

    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Annuler ma réservation"))!;
    await click(button);

    expect(window.confirm).toHaveBeenCalledWith("Annuler votre réservation pour « Avantage reserved » ?");
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/athlete/partner-benefit-reservations/${reservationId}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      },
    );
    expect(container.textContent).toContain("Réservation annulée avec succès.");
    expect(container.textContent).toContain("Annulé");
  });

  it("does not mutate when confirmation is refused", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    fetchMock.mockResolvedValueOnce(response({ benefits: [
      benefit("a4ed0d44-36d6-48e3-b399-28f6ac9e2538", "available"),
    ] }));
    await mount(<AthletePartnerBenefits mode="partner" partnerId={partnerId} />);

    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Réserver cet avantage"))!;
    await click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows an action error without hiding the benefit", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ benefits: [
        benefit("a4ed0d44-36d6-48e3-b399-28f6ac9e2538", "available"),
      ] }))
      .mockResolvedValueOnce(response({ error: "Avantage déjà réservé." }, 409));
    await mount(<AthletePartnerBenefits mode="partner" partnerId={partnerId} />);

    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Réserver cet avantage"))!;
    await click(button);

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Avantage déjà réservé.");
    expect(container.textContent).toContain("Avantage available");
    expect(container.textContent).toContain("Réserver cet avantage");
  });

  it("exposes loading and API error states", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await mount(<AthletePartnerBenefits mode="partner" partnerId={partnerId} />);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Chargement");

    await act(async () => { root.unmount(); });
    root = createRoot(container);
    fetchMock.mockResolvedValueOnce(response({ error: "Adhésion active requise." }, 403));
    await mount(<AthletePartnerBenefits mode="partner" partnerId={partnerId} />);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Adhésion active requise.");
  });
});

describe("Athlete Pass partner benefits summary", () => {
  it("summarizes available and reserved benefits and links to the Ecosystem", async () => {
    fetchMock.mockResolvedValueOnce(response({ benefits: [
      benefit("10000000-0000-4000-8000-000000000001", "available"),
      benefit("10000000-0000-4000-8000-000000000002", "reserved"),
      benefit("10000000-0000-4000-8000-000000000003", "used", { available: false }),
    ] }));

    await mount(<AthletePartnerBenefits mode="summary" />);

    const summary = container.querySelector('[aria-label="Synthèse des avantages partenaires"]');
    expect(summary?.textContent).toContain("1Disponibles");
    expect(summary?.textContent).toContain("1Réservés");
    expect(container.textContent).toContain("Avantage available · Disponible");
    expect(container.textContent).toContain("Avantage reserved · Réservé");
    expect(container.textContent).not.toContain("Avantage used");
    expect(container.querySelector('a[href="/athlete/ecosysteme"]')?.textContent).toContain("Voir l’Écosystème");
  });
});