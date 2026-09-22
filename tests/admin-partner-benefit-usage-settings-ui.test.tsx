// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartnerBenefitUsageSection } from "@/components/settings/PartnerBenefitUsageSection";

const reservation = {
  id: "34526bf7-ca5a-43c3-a379-29153678e987",
  partnerId: "512c0349-236a-4f07-b099-4e6c29e22241",
  partnerName: "Studio Horizon",
  athleteId: "athlete-1",
  athleteName: "Lina Morel",
  benefit: {
    id: "a4ed0d44-36d6-48e3-b399-28f6ac9e2538",
    title: "Bilan personnalisé",
    details: "Une séance individuelle.",
    usagePolicy: "once_per_membership",
  },
  status: "used",
  reservedAt: "2026-09-22T10:00:00.000Z",
  usedAt: "2026-09-23T11:00:00.000Z",
  cancelledAt: null,
  expiresAt: "2027-09-22T10:00:00.000Z",
  history: [
    {
      id: "6f3f632b-4a86-4862-a87f-ff767e2f2a26",
      actorClerkUserId: "user_athlete",
      actorRole: "athlete",
      previousStatus: null,
      newStatus: "reserved",
      occurredAt: "2026-09-22T10:00:00.000Z",
    },
    {
      id: "f7963501-9e89-4e50-9e2b-a004bb131d22",
      actorClerkUserId: "user_partner",
      actorRole: "partner_expert",
      previousStatus: "reserved",
      newStatus: "used",
      occurredAt: "2026-09-23T11:00:00.000Z",
    },
  ],
} as const;

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const response = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
}) as Response;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const mount = async () => {
  await act(async () => {
    root.render(<PartnerBenefitUsageSection />);
  });
  await flush();
};

const setSelect = async (label: string, value: string) => {
  const select = container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  await act(async () => {
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
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

describe("Partner benefit usage settings section", () => {
  it("shows the loading state while the audit is pending", async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));

    await act(async () => { root.render(<PartnerBenefitUsageSection />); });

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Chargement des réservations");
  });

  it("renders the requested columns, readable identities and transition history", async () => {
    fetchMock.mockResolvedValue(response({ reservations: [reservation] }));

    await mount();

    for (const heading of ["Partenaire", "Athlète", "Avantage", "Statut", "Réservation", "Échéance", "Utilisation", "Historique"]) {
      expect([...container.querySelectorAll("th")].some((cell) => cell.textContent === heading)).toBe(true);
    }
    expect(container.textContent).toContain("Studio Horizon");
    expect(container.textContent).toContain("Lina Morel");
    expect(container.textContent).toContain("Bilan personnalisé");
    expect(container.textContent).toContain("Utilisé");
    expect(container.querySelector("summary")?.textContent).toContain("2 transitions");
    expect(container.querySelector("details")?.textContent).toContain("Partenaire/Expert");
  });

  it("combines partner, Athlete and status filters through GET on the audit endpoint", async () => {
    fetchMock.mockResolvedValue(response({ reservations: [reservation] }));
    await mount();

    await setSelect("Filtrer par partenaire", reservation.partnerId);
    await setSelect("Filtrer par Athlète", reservation.athleteId);
    await setSelect("Filtrer par statut", "used");

    const [url, options] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    const parsed = new URL(url, "http://localhost");
    expect(parsed.pathname).toBe("/api/admin/partner-benefit-reservations");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      partnerId: reservation.partnerId,
      athleteId: reservation.athleteId,
      status: "used",
    });
    expect(options.method).toBe("GET");
  });

  it("renders the empty state", async () => {
    fetchMock.mockResolvedValue(response({ reservations: [] }));

    await mount();

    expect(container.textContent).toContain("Aucune réservation ne correspond aux filtres sélectionnés.");
  });

  it("renders the API error state", async () => {
    fetchMock.mockResolvedValue(response({ error: "Audit indisponible." }, 500));

    await mount();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Audit indisponible.");
  });

  it("exposes no validation, cancellation or modification action", async () => {
    fetchMock.mockResolvedValue(response({ reservations: [reservation] }));

    await mount();

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelector("form")).toBeNull();
  });
});