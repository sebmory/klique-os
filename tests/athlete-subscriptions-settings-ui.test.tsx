// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAthleteMembership, AthleteMembershipPlatformAccessStatus } from "@/lib/athlete-memberships";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import AthleteSubscriptionsSettingsPage from "@/app/settings/athlete-subscriptions/page";

const plan = {
  code: "impact",
  name: "Impact",
  active: true,
  durationMonths: 12,
  annualPriceChf: 549,
  monthlyInstallmentChf: null,
  productionCredits: 1,
  customContentCredits: 4,
  videoAllowed: true,
  metadata: {},
};

const membership = (overrides: Partial<AdminAthleteMembership> = {}): AdminAthleteMembership => ({
  id: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
  workspaceId: "workspace-1",
  athleteId: "athlete-1",
  membershipKind: "subscription",
  planCode: "impact",
  status: "active",
  effectiveStatus: "active",
  isActive: true,
  startsAt: "2026-09-14T00:00:00.000Z",
  endsAt: "2027-09-14T00:00:00.000Z",
  autoRenew: false,
  paymentInstallments: 1,
  source: "admin_manual",
  createdAt: "2026-09-14T08:00:00.000Z",
  updatedAt: "2026-09-14T08:00:00.000Z",
  plan,
  balance: { production: 1, customContent: 3 },
  platformAccess: null,
  ...overrides,
});

const founderMembership = (status: AthleteMembershipPlatformAccessStatus, email: string | null) => membership({
  membershipKind: "founder",
  planCode: null,
  plan: null,
  paymentInstallments: null,
  balance: { production: 0, customContent: 0 },
  platformAccess: { status, email },
});

const athlete = { key: "athlete-1", name: "Lina Morel", adhesionDate: "14.09.2026" };
const contentRequest = (overrides: Record<string, unknown> = {}) => ({
  id: "91d272d1-1a5b-4486-bbc0-69b1ce747e4d",
  workspaceId: "workspace-1",
  subscriptionId: "historical-subscription-id",
  athleteId: "athlete-1",
  formatCode: "portrait",
  status: "requested",
  athleteNote: "Portrait pour la nouvelle saison.",
  preferredDate: "2026-10-02",
  adminNote: null,
  reservedAt: null,
  completedAt: null,
  createdAt: "2026-09-14T08:30:00.000Z",
  updatedAt: "2026-09-14T08:30:00.000Z",
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
    root.render(<AthleteSubscriptionsSettingsPage />);
    await Promise.resolve();
  });
};

const setValue = async (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) => {
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
};

const initialResponses = (memberships: AdminAthleteMembership[] = [], requests: unknown[] = []) => {
  fetchMock
    .mockResolvedValueOnce(response({ athletes: [athlete], source: "google-sheets" }))
    .mockResolvedValueOnce(response({ memberships, plans: [plan] }))
    .mockResolvedValueOnce(response({ requests }));
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
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("Athlete memberships settings page", () => {
  it("renders canonical plan, effective status, dates and ledger balances", async () => {
    initialResponses([membership()]);

    await mount();

    expect(container.textContent).toContain("Lina Morel");
    expect(container.textContent).toContain("Impact");
    expect(container.textContent).toContain("Actif");
    expect(container.textContent).toContain("Solde production1");
    expect(container.textContent).toContain("Solde contenus3");
    expect(container.textContent).toContain("CHF");
  });

  it("creates a canonical membership for the selected athlete and refreshes the projection", async () => {
    initialResponses();
    fetchMock
      .mockResolvedValueOnce(response({ membership: membership() }, 201))
      .mockResolvedValueOnce(response({ memberships: [membership()], plans: [plan] }));
    await mount();

    const selects = container.querySelectorAll("select");
    await setValue(selects[0] as HTMLSelectElement, "athlete-1");
    await setValue(selects[1] as HTMLSelectElement, "impact");
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls[3][0]).toBe("/api/admin/athletes/athlete-1/membership");
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body))).toMatchObject({
      membershipKind: "subscription",
      planCode: "impact",
      status: "active",
      paymentMode: "annual",
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("attribuée avec succès");
  });

  it("invites a Founder by athleteId and refreshes access state", async () => {
    initialResponses([founderMembership("not_invited", null)]);
    fetchMock
      .mockResolvedValueOnce(response({ invitation: { athleteId: "athlete-1" } }))
      .mockResolvedValueOnce(response({ memberships: [founderMembership("invited", "lina@example.com")], plans: [plan] }));
    await mount();

    await click([...container.querySelectorAll("button")].find((button) => button.textContent === "Inviter")!);

    expect(JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body))).toEqual({
      athleteId: "athlete-1",
      resend: false,
    });
    expect(container.textContent).toContain("Invitation envoyée à Lina Morel.");
    expect(container.textContent).toContain("lina@example.com");
  });

  it("cancels through the athlete membership endpoint", async () => {
    initialResponses([membership()]);
    fetchMock
      .mockResolvedValueOnce(response({ membership: membership({ status: "cancelled" }) }))
      .mockResolvedValueOnce(response({ memberships: [membership({ status: "cancelled", effectiveStatus: "cancelled", isActive: false })], plans: [plan] }));
    await mount();

    await click([...container.querySelectorAll("button")].find((button) => button.textContent === "Annuler l’adhésion")!);

    expect(window.confirm).toHaveBeenCalledWith("Annuler l’adhésion active de Lina Morel ?");
    expect(fetchMock.mock.calls[3][0]).toBe("/api/admin/athletes/athlete-1/membership");
    expect(JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body))).toMatchObject({
      membershipId: membership().id,
      status: "cancelled",
    });
  });

  it("keeps the historical content request workflow operational", async () => {
    const updatedRequest = contentRequest({ status: "accepted", adminNote: "Créneau confirmé" });
    initialResponses([], [contentRequest()]);
    fetchMock.mockResolvedValueOnce(response({ request: updatedRequest }));
    await mount();

    await setValue(container.querySelector("textarea")!, "Créneau confirmé");
    await click([...container.querySelectorAll("button")].find((button) => button.textContent === "Accepter")!);

    expect(fetchMock.mock.calls[3][0]).toBe("/api/admin/athlete-subscription-content-requests");
    expect(JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body))).toMatchObject({
      requestId: contentRequest().id,
      status: "accepted",
      adminNote: "Créneau confirmé",
    });
    expect(container.textContent).toContain("Demande mise à jour : Accepté.");
  });
});