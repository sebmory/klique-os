// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AthleteMembershipAdminCard } from "@/components/crm/AthleteMembershipAdminCard";
import type { AthleteAdminServiceRealization } from "@/lib/athlete-membership-service-realizations";

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

const realization: AthleteAdminServiceRealization = {
  realizationId: "15e7180d-fcd2-4bd8-914b-18856c120a4e",
  membershipId: "membership-1",
  creditType: "production",
  occurredAt: "2026-09-10T12:00:00.000Z",
  note: "Séance saisie par erreur",
  recordedAt: "2026-10-08T18:00:00.000Z",
  adminClerkUserId: "recording-admin",
  cancellation: null,
};
const cancellation = {
  movementId: "reversal-1",
  reason: "Erreur de saisie",
  cancelledAt: "2026-10-08T20:00:00.000Z",
  adminClerkUserId: "cancelling-admin",
};
const historyPayload = (cancelled = false, active = true, athleteId = "athlete-1") => ({
  membership: {
    origin: "neon",
    status: active ? "active" : "expired",
    isActive: active,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2027-01-01T00:00:00.000Z",
    membership: {
      id: "membership-1", workspaceId: "workspace-a", athleteId,
      membershipKind: "founder", planCode: null, status: active ? "active" : "expired",
      startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2027-01-01T00:00:00.000Z",
      autoRenew: false, paymentInstallments: null, source: "admin_manual",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
  plans: [],
  serviceSummary: active ? {
    membershipId: "membership-1",
    startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2027-01-01T00:00:00.000Z",
    expiresInDays: 85,
    included: [{
      creditType: "production", label: "Productions", quota: 1, reserved: 0,
      used: cancelled ? 0 : 1, available: cancelled ? 1 : 0, expiresAt: "2027-01-01T00:00:00.000Z",
    }],
    pendingRequests: { total: 0, received: 0, toConfirm: 0 }, purchases: [],
  } : null,
  realizations: [{ ...realization, cancellation: cancelled ? cancellation : null }],
});
const jsonResponse = (payload: unknown, ok = true) => ({ ok, json: async () => payload });
const openCancellation = async () => {
  const action = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent === "Annuler la réalisation");
  expect(action).toBeTruthy();
  await act(async () => action?.click());
};
const enterReason = async (reason: string) => {
  const textarea = container.querySelector<HTMLTextAreaElement>(".modal-form textarea");
  expect(textarea).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, reason);
    textarea?.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const submitCancellation = async (twice = false) => {
  const form = container.querySelector<HTMLFormElement>(".modal-form");
  expect(form).toBeTruthy();
  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    if (twice) form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

describe("AthleteMembershipAdminCard realization cancellation", () => {
  it("shows real date, note, registration time and original Admin", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(historyPayload()));
    await act(async () => root.render(<AthleteMembershipAdminCard athleteId="athlete-1" />));
    await flush();
    const section = container.querySelector('[aria-labelledby="athlete-realization-history-athlete-1"]');
    expect(section?.textContent).toContain("Historique des réalisations Admin");
    expect(section?.textContent).toContain("10/09/2026");
    expect(section?.textContent).toContain(realization.note);
    expect(section?.textContent).toContain("08/10/2026");
    expect(section?.textContent).toContain(
      new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(realization.recordedAt)),
    );
    expect(section?.textContent).toContain("recording-admin");
    expect(section?.textContent).toContain("Réalisée");
  });

  it("requires a non-blank reason and confirms one cancellation despite a double send", async () => {
    const refreshed = historyPayload(true);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(historyPayload()))
      .mockResolvedValueOnce(jsonResponse({
        requestId: realization.realizationId, cancellation,
        serviceSummary: refreshed.serviceSummary, realizations: refreshed.realizations,
      }))
      .mockResolvedValueOnce(jsonResponse(refreshed));
    await act(async () => root.render(<AthleteMembershipAdminCard athleteId="athlete-1" />));
    await flush();
    await openCancellation();
    expect(container.textContent).toContain("Un droit sera restitué");
    expect(container.querySelector("textarea")?.required).toBe(true);
    await enterReason("   ");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await submitCancellation();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    expect(container.textContent).toContain("Le motif est obligatoire.");
    await enterReason("  Erreur de saisie  ");
    await submitCancellation(true);
    await flush();
    const posts = fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe(`/api/admin/athletes/athlete-1/membership/realizations/${realization.realizationId}/cancel`);
    expect(JSON.parse(posts[0][1].body)).toEqual({ membershipId: "membership-1", reason: "Erreur de saisie" });
    expect(container.textContent).toContain("Annulée");
    expect(container.textContent).toContain("Erreur de saisie");
    expect(container.textContent).toContain("cancelling-admin");
    expect(container.textContent).toContain("recording-admin");
    expect(container.textContent).not.toContain("Annuler la réalisation");
    expect(container.textContent).toContain("Enregistrer une réalisation");
    const cells = [...container.querySelectorAll('[aria-labelledby="athlete-service-summary-athlete-1"] tbody tr:first-child td')]
      .slice(0, 4).map((cell) => cell.textContent);
    expect(cells).toEqual(["1", "0", "0", "1"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("updates counters from the POST immediately, before the background GET completes", async () => {
    const refreshed = historyPayload(true);
    let resolveRefresh: (value: ReturnType<typeof jsonResponse>) => void = () => { };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(historyPayload()))
      .mockResolvedValueOnce(jsonResponse({
        requestId: realization.realizationId, cancellation,
        serviceSummary: refreshed.serviceSummary, realizations: refreshed.realizations,
      }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    await act(async () => root.render(<AthleteMembershipAdminCard athleteId="athlete-1" />));
    await flush();
    await openCancellation();
    await enterReason(cancellation.reason);
    await submitCancellation();
    await flush();
    expect(container.textContent).toContain("Annulée");
    expect(container.textContent).toContain("Enregistrer une réalisation");
    expect(container.textContent).not.toContain("Chargement de l’adhésion");
    await act(async () => resolveRefresh(jsonResponse(refreshed)));
  });

  it("keeps the modal and counters unchanged on a conflict", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(historyPayload()))
      .mockResolvedValueOnce(jsonResponse({ error: "Cette réalisation est déjà annulée avec un autre motif." }, false));
    await act(async () => root.render(<AthleteMembershipAdminCard athleteId="athlete-1" />));
    await flush();
    await openCancellation();
    await enterReason(cancellation.reason);
    await submitCancellation();
    await flush();
    expect(container.querySelector(".modal-form")).toBeTruthy();
    expect(container.textContent).toContain("déjà annulée avec un autre motif");
    expect(container.textContent).not.toContain("Enregistrer une réalisation");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the confirmed audit and summary when the background refresh fails", async () => {
    const refreshed = historyPayload(true);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(historyPayload()))
      .mockResolvedValueOnce(jsonResponse({
        requestId: realization.realizationId, cancellation,
        serviceSummary: refreshed.serviceSummary, realizations: refreshed.realizations,
      }))
      .mockRejectedValueOnce(new Error("Offline"));
    await act(async () => root.render(<AthleteMembershipAdminCard athleteId="athlete-1" />));
    await flush();
    await openCancellation();
    await enterReason(cancellation.reason);
    await submitCancellation();
    await flush();
    expect(container.textContent).toContain("Annulation enregistrée, mais le rafraîchissement a échoué");
    expect(container.textContent).toContain("Annulée");
    expect(container.textContent).toContain("Enregistrer une réalisation");
    expect(container.querySelector(".modal-form")).toBeNull();
  });

  it("shows an expired membership history without allowing an initial cancellation", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(historyPayload(false, false)));
    await act(async () => root.render(<AthleteMembershipAdminCard athleteId="athlete-1" />));
    await flush();
    expect(container.textContent).toContain("Historique des réalisations Admin");
    expect(container.textContent).not.toContain("Suivi des prestations");
    const action = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Annuler la réalisation");
    expect(action?.disabled).toBe(true);
  });

  it("does not show stale usage counters after a committed cancellation with no refreshed summary", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(historyPayload()))
      .mockResolvedValueOnce(jsonResponse({
        requestId: realization.realizationId, cancellation,
        refreshError: "Annulation enregistrée, mais le rafraîchissement a échoué.",
      }))
      .mockRejectedValueOnce(new Error("Offline"));
    await act(async () => root.render(<AthleteMembershipAdminCard athleteId="athlete-1" />));
    await flush();
    await openCancellation();
    await enterReason(cancellation.reason);
    await submitCancellation();
    await flush();
    expect(container.textContent).toContain("Annulée");
    expect(container.textContent).toContain("Annulation enregistrée");
    expect(container.textContent).not.toContain("Prestations incluses");
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Rafraîchir l’adhésion");
    expect(retry).toBeTruthy();
    fetchMock.mockResolvedValueOnce(jsonResponse(historyPayload(true)));
    await act(async () => retry?.click());
    await flush();
    expect(container.textContent).toContain("Enregistrer une réalisation");
    expect(container.textContent).not.toContain("rafraîchissement a échoué");
  });

  it("does not apply a late cancellation response to another athlete", async () => {
    let resolveCancellation: (value: ReturnType<typeof jsonResponse>) => void = () => { };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(historyPayload()))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveCancellation = resolve; }))
      .mockResolvedValueOnce(jsonResponse({ ...historyPayload(false, true, "athlete-2"), realizations: [] }));
    await act(async () => root.render(<AthleteMembershipAdminCard athleteId="athlete-1" />));
    await flush();
    await openCancellation();
    await enterReason(cancellation.reason);
    await submitCancellation();
    await act(async () => root.render(<AthleteMembershipAdminCard athleteId="athlete-2" />));
    await flush();
    await act(async () => resolveCancellation(jsonResponse({
      requestId: realization.realizationId, cancellation,
      serviceSummary: historyPayload(true).serviceSummary, realizations: historyPayload(true).realizations,
    })));
    await flush();
    expect(container.textContent).not.toContain("cancelling-admin");
    expect(container.textContent).toContain("Aucune réalisation Admin sur cette adhésion.");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

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
