// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AthleteMembershipAdminCard } from "@/components/crm/AthleteMembershipAdminCard";

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
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
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("AthleteMembershipAdminCard service summary", () => {
  it("renders active dates, included rights, pending requests and purchased services", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        membership: {
          origin: "neon",
          status: "active",
          isActive: true,
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2027-01-01T00:00:00.000Z",
          membership: {
            id: "membership-1",
            workspaceId: "workspace-a",
            athleteId: "athlete-1",
            membershipKind: "subscription",
            planCode: "impact",
            status: "active",
            startsAt: "2026-01-01T00:00:00.000Z",
            endsAt: "2027-01-01T00:00:00.000Z",
            autoRenew: false,
            paymentInstallments: 1,
            source: "twint_manual_order",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        plans: [{
          code: "impact",
          name: "Impact",
          active: true,
          durationMonths: 12,
          annualPriceChf: 549,
          monthlyInstallmentChf: 46,
          productionCredits: 2,
          customContentCredits: 6,
          videoAllowed: true,
          metadata: {},
        }],
        serviceSummary: {
          membershipId: "membership-1",
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2027-01-01T00:00:00.000Z",
          expiresInDays: 85,
          included: [
            { creditType: "production", label: "Productions", quota: 2, reserved: 1, used: 0, available: 1, expiresAt: "2027-01-01T00:00:00.000Z" },
            { creditType: "custom_content", label: "Contenus personnalisés", quota: 6, reserved: 1, used: 2, available: 3, expiresAt: "2027-01-01T00:00:00.000Z" },
          ],
          pendingRequests: { total: 2, received: 1, toConfirm: 1 },
          purchases: [{
            purchaseId: "purchase-1",
            productCode: "custom_content_pack_5",
            productName: "Pack de 5 contenus",
            paid: 5,
            delivered: 2,
            remaining: 3,
            expiresAt: "2026-12-01T00:00:00.000Z",
            expired: false,
          }],
        },
      }),
    });

    await act(async () => root.render(<AthleteMembershipAdminCard athleteId="athlete-1" />));
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/athletes/athlete-1/membership",
      { credentials: "include", cache: "no-store" },
    );
    expect(container.textContent).toContain("Suivi des prestations");
    expect(container.textContent).toContain("Expire dans 85 jours");
    expect(container.textContent).toContain("Prestations incluses");
    expect(container.textContent).toContain("Contenus personnalisés");
    expect(container.textContent).toContain("2 au total · 1 reçue(s) · 1 à confirmer");
    expect(container.textContent).toContain("Pack de 5 contenus");

    const rows = [...container.querySelectorAll("tbody tr")].map((row) => row.textContent);
    expect(rows.some((row) => row?.startsWith("Productions210101/01/2027"))).toBe(true);
    expect(rows.some((row) => row?.startsWith("Contenus personnalisés612301/01/2027"))).toBe(true);
    expect(rows).toContain("Pack de 5 contenus52301/12/2026");
  });

  it("records an available included right once and refreshes the summary", async () => {
    const initialPayload = {
      membership: {
        origin: "neon",
        status: "active",
        isActive: true,
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: "2027-01-01T00:00:00.000Z",
        membership: {
          id: "membership-1",
          workspaceId: "workspace-a",
          athleteId: "athlete-1",
          membershipKind: "founder",
          planCode: null,
          status: "active",
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2027-01-01T00:00:00.000Z",
          autoRenew: false,
          paymentInstallments: null,
          source: "legacy_founder_migration",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      plans: [],
      serviceSummary: {
        membershipId: "membership-1",
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: "2027-01-01T00:00:00.000Z",
        expiresInDays: 85,
        included: [
          { creditType: "production", label: "Productions", quota: 1, reserved: 0, used: 0, available: 1, expiresAt: "2027-01-01T00:00:00.000Z" },
          { creditType: "custom_content", label: "Contenus personnalisés", quota: 1, reserved: 0, used: 1, available: 0, expiresAt: "2027-01-01T00:00:00.000Z" },
        ],
        pendingRequests: { total: 0, received: 0, toConfirm: 0 },
        purchases: [],
      },
    };
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => initialPayload })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ requestId: "15e7180d-fcd2-4bd8-914b-18856c120a4e", unchanged: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...initialPayload,
          serviceSummary: {
            ...initialPayload.serviceSummary,
            included: initialPayload.serviceSummary.included.map((right) => (
              right.creditType === "production"
                ? { ...right, used: 1, available: 0 }
                : right
            )),
          },
        }),
      });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("15e7180d-fcd2-4bd8-914b-18856c120a4e");

    await act(async () => root.render(<AthleteMembershipAdminCard athleteId="athlete-1" />));
    await flush();
    const action = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Enregistrer une réalisation"));
    expect(action).toBeTruthy();
    await act(async () => action?.click());

    const form = container.querySelector<HTMLFormElement>(".modal-form");
    const dateInput = form?.querySelector<HTMLInputElement>('input[type="date"]');
    const note = form?.querySelector<HTMLTextAreaElement>("textarea");
    expect(form).toBeTruthy();
    expect(dateInput).toBeTruthy();
    expect(note).toBeTruthy();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(dateInput, "2026-09-10");
      dateInput?.dispatchEvent(new Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(note, "Séance historique");
      note?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();

    const postCalls = fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(postCalls).toHaveLength(1);
    const [url, options] = postCalls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/athletes/athlete-1/membership/realizations");
    expect(JSON.parse(String(options.body))).toEqual({
      realizationId: "15e7180d-fcd2-4bd8-914b-18856c120a4e",
      membershipId: "membership-1",
      creditType: "production",
      occurredAt: "2026-09-10T12:00:00.000Z",
      note: "Séance historique",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).not.toContain("Enregistrer une réalisation");
  });
});
