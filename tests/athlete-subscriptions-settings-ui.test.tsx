// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import AthleteSubscriptionsSettingsPage from "@/app/settings/athlete-subscriptions/page";

const subscription = {
  id: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
  workspaceId: "workspace-1",
  athleteId: "athlete-1",
  planCode: "impact",
  status: "active",
  startsOn: "2026-09-14",
  endsOn: "2027-09-14",
  isFounder: true,
  isComplimentary: true,
  priceChf: 549,
  discountPercent: 20,
  photoSessionsIncluded: 1,
  mediaDaysIncluded: 1,
  competitionSessionsIncluded: 0,
  customContentsIncluded: 4,
  createdByClerkUserId: "admin-1",
  createdAt: "2026-09-14T08:00:00.000Z",
  updatedAt: "2026-09-14T08:00:00.000Z",
};

const athlete = { key: "athlete-1", name: "Lina Morel" };
const contentRequest = (overrides: Record<string, unknown> = {}) => ({
  id: "91d272d1-1a5b-4486-bbc0-69b1ce747e4d",
  workspaceId: "workspace-1",
  subscriptionId: subscription.id,
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

const setValue = async (
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) => {
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

describe("Athlete subscriptions settings page", () => {
  it("loads athletes and subscriptions and displays all requested fields", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ athletes: [athlete], source: "google-sheets" }))
      .mockResolvedValueOnce(response({ subscriptions: [subscription] }))
      .mockResolvedValueOnce(response({ requests: [] }));

    await mount();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/athletes", { credentials: "include", cache: "no-store" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/athlete-subscriptions", { credentials: "include", cache: "no-store" });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/admin/athlete-subscription-content-requests", { credentials: "include", cache: "no-store" });
    expect(container.textContent).toContain("Lina Morel");
    expect(container.textContent).toContain("Impact");
    expect(container.textContent).toContain("Membre fondateur");
    expect(container.textContent).toContain("Offert");
    expect(container.textContent).toContain("CHF");
    expect(container.textContent).toContain("Actif");
  });

  it("shows an accessible loading state before responses resolve", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    await mount();

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Chargement");
  });

  it("shows the empty state", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ athletes: [athlete], source: "google-sheets" }))
      .mockResolvedValueOnce(response({ subscriptions: [] }))
      .mockResolvedValueOnce(response({ requests: [] }));

    await mount();

    expect(container.textContent).toContain("Aucun abonnement Athlète dans ce workspace.");
    expect(container.textContent).toContain("Aucune demande de contenu personnalisé dans ce workspace.");
  });

  it("prefills the end date to one year after the selected start date", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ athletes: [athlete], source: "google-sheets" }))
      .mockResolvedValueOnce(response({ subscriptions: [] }))
      .mockResolvedValueOnce(response({ requests: [] }));
    await mount();
    const dateInputs = container.querySelectorAll('input[type="date"]');

    await setValue(dateInputs[0] as HTMLInputElement, "2028-02-29");

    expect((dateInputs[1] as HTMLInputElement).value).toBe("2029-02-28");
  });

  it("posts the controlled assignment fields and reports success", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ athletes: [athlete], source: "google-sheets" }))
      .mockResolvedValueOnce(response({ subscriptions: [] }))
      .mockResolvedValueOnce(response({ requests: [] }))
      .mockResolvedValueOnce(response({ subscription }, 201));
    await mount();
    const selects = container.querySelectorAll("select");
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    await setValue(selects[0] as HTMLSelectElement, "athlete-1");
    await setValue(selects[1] as HTMLSelectElement, "impact");
    await click(checkboxes[0]);
    await click(checkboxes[1]);
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const request = fetchMock.mock.calls[3][1] as RequestInit;
    expect(fetchMock.mock.calls[3][0]).toBe("/api/admin/athlete-subscriptions");
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toMatchObject({
      athleteId: "athlete-1",
      planCode: "impact",
      isFounder: true,
      isComplimentary: true,
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("attribué avec succès");
  });

  it("presents Founder as internal access and forces its zero-valued terms", async () => {
    const founderSubscription = {
      ...subscription,
      planCode: "founder",
      priceChf: 0,
      discountPercent: 0,
      photoSessionsIncluded: 0,
      mediaDaysIncluded: 0,
      competitionSessionsIncluded: 0,
      customContentsIncluded: 0,
    };
    fetchMock
      .mockResolvedValueOnce(response({ athletes: [athlete], source: "google-sheets" }))
      .mockResolvedValueOnce(response({ subscriptions: [] }))
      .mockResolvedValueOnce(response({ requests: [] }))
      .mockResolvedValueOnce(response({ subscription: founderSubscription }, 201));
    await mount();
    const selects = container.querySelectorAll("select");
    const planSelect = selects[1] as HTMLSelectElement;

    expect(planSelect.querySelector('optgroup[label="Accès interne"] option')?.textContent).toBe("Membre fondateur");
    expect(planSelect.querySelector('optgroup[label="Offres commerciales"] option[value="founder"]')).toBeNull();

    await setValue(selects[0] as HTMLSelectElement, "athlete-1");
    await setValue(planSelect, "founder");

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[0] as HTMLInputElement).disabled).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).disabled).toBe(true);

    const terms = container.querySelector('[aria-label="Conditions Membre fondateur"]');
    expect(terms?.textContent).toContain("Prix");
    expect(terms?.textContent).toContain("Remise");
    expect(terms?.textContent).toContain("Séances photo");
    expect(terms?.textContent).toContain("Media Days");
    expect(terms?.textContent).toContain("Sessions compétition");
    expect(terms?.textContent).toContain("Contenus personnalisés");
    expect([...terms!.querySelectorAll("dd")].every((value) => value.textContent?.includes("0"))).toBe(true);

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body))).toMatchObject({
      athleteId: "athlete-1",
      planCode: "founder",
      isFounder: true,
      isComplimentary: true,
    });
  });

  it("confirms and patches cancellation", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ athletes: [athlete], source: "google-sheets" }))
      .mockResolvedValueOnce(response({ subscriptions: [subscription] }))
      .mockResolvedValueOnce(response({ requests: [] }))
      .mockResolvedValueOnce(response({ subscription: { ...subscription, status: "cancelled" } }));
    await mount();

    const cancelButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Annuler l’abonnement"));
    await click(cancelButton!);

    expect(window.confirm).toHaveBeenCalledWith("Annuler l’abonnement actif de Lina Morel ?");
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/admin/athlete-subscriptions", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ action: "cancel", subscriptionId: subscription.id }),
    }));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("annulé");
  });

  it("does not cancel when confirmation is refused", async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fetchMock
      .mockResolvedValueOnce(response({ athletes: [athlete], source: "google-sheets" }))
      .mockResolvedValueOnce(response({ subscriptions: [subscription] }))
      .mockResolvedValueOnce(response({ requests: [] }));
    await mount();

    const cancelButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Annuler l’abonnement"));
    await click(cancelButton!);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shows accessible load and action errors", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ error: "Accès refusé." }, 403))
      .mockResolvedValueOnce(response({ subscriptions: [] }))
      .mockResolvedValueOnce(response({ requests: [] }));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Accès refusé.");
  });

  it("announces an assignment API error", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ athletes: [athlete], source: "google-sheets" }))
      .mockResolvedValueOnce(response({ subscriptions: [] }))
      .mockResolvedValueOnce(response({ requests: [] }))
      .mockResolvedValueOnce(response({ error: "Un abonnement Athlète actif existe déjà." }, 409));
    await mount();
    await setValue(container.querySelectorAll("select")[0] as HTMLSelectElement, "athlete-1");

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Un abonnement Athlète actif existe déjà.",
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("displays content request details and only valid actions for each status", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ athletes: [athlete], source: "google-sheets" }))
      .mockResolvedValueOnce(response({ subscriptions: [] }))
      .mockResolvedValueOnce(response({ requests: [
        contentRequest(),
        contentRequest({ id: "accepted-request", status: "accepted", formatCode: "reel" }),
        contentRequest({ id: "progress-request", status: "in_progress", formatCode: "news" }),
        contentRequest({ id: "completed-request", status: "completed", formatCode: "performance" }),
      ] }));

    await mount();

    expect(container.textContent).toContain("Demandes de contenus personnalisés");
    expect(container.textContent).toContain("Lina Morel");
    expect(container.textContent).toContain("Portrait");
    expect(container.textContent).toContain("Portrait pour la nouvelle saison.");
    expect(container.textContent).toContain("02.10.2026");
    expect(container.textContent).toContain("14.09.2026");

    const cards = [...container.querySelectorAll('[data-ds="Card"]')];
    const requestedCard = cards.find((card) => card.textContent?.includes("Demandé"));
    const acceptedCard = cards.find((card) => card.textContent?.includes("Accepté"));
    const progressCard = cards.find((card) => card.textContent?.includes("En cours"));
    const completedCard = cards.find((card) => card.textContent?.includes("Terminé"));

    expect(requestedCard?.textContent).toContain("Accepter");
    expect(requestedCard?.textContent).toContain("Refuser");
    expect(requestedCard?.textContent).toContain("Annuler");
    expect(requestedCard?.textContent).not.toContain("Démarrer");
    expect(requestedCard?.textContent).not.toContain("Terminer");
    expect(acceptedCard?.textContent).toContain("Démarrer");
    expect(acceptedCard?.textContent).not.toContain("Accepter");
    expect(progressCard?.textContent).toContain("Terminer");
    expect(progressCard?.textContent).toContain("Annuler");
    expect(progressCard?.textContent).not.toContain("Refuser");
    expect(completedCard?.querySelector("button")).toBeNull();
    expect(completedCard?.querySelector("textarea")).toBeNull();
  });

  it("patches a valid action with the optional Admin note and updates locally", async () => {
    const updatedRequest = contentRequest({
      status: "accepted",
      adminNote: "Créneau confirmé",
      reservedAt: "2026-09-15T09:00:00.000Z",
    });
    fetchMock
      .mockResolvedValueOnce(response({ athletes: [athlete], source: "google-sheets" }))
      .mockResolvedValueOnce(response({ subscriptions: [] }))
      .mockResolvedValueOnce(response({ requests: [contentRequest()] }))
      .mockResolvedValueOnce(response({ request: updatedRequest }));
    await mount();

    const note = container.querySelector('textarea[aria-label="Note Admin pour Lina Morel"]') as HTMLTextAreaElement;
    await setValue(note, " Créneau confirmé ");
    const requestedCard = [...container.querySelectorAll('[data-ds="Card"]')]
      .find((card) => card.textContent?.includes("Demandé"));
    const acceptButton = [...requestedCard!.querySelectorAll("button")]
      .find((button) => button.textContent === "Accepter");
    await click(acceptButton!);

    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/admin/athlete-subscription-content-requests", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: contentRequest().id,
        status: "accepted",
        adminNote: "Créneau confirmé",
      }),
    });
    expect(container.textContent).toContain("Demande mise à jour : Accepté.");
    expect(container.textContent).toContain("Note Admin : Créneau confirmé");
    expect(container.textContent).not.toContain("Demandé");
  });

  it("announces a content request action error accessibly", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ athletes: [athlete], source: "google-sheets" }))
      .mockResolvedValueOnce(response({ subscriptions: [] }))
      .mockResolvedValueOnce(response({ requests: [contentRequest()] }))
      .mockResolvedValueOnce(response({ error: "Cette transition est interdite." }, 409));
    await mount();

    const requestedCard = [...container.querySelectorAll('[data-ds="Card"]')]
      .find((card) => card.textContent?.includes("Demandé"));
    const acceptButton = [...requestedCard!.querySelectorAll("button")]
      .find((button) => button.textContent === "Accepter");
    await click(acceptButton!);

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Cette transition est interdite.");
  });
});