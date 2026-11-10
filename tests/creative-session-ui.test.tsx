// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AthleteSessionRequests } from "@/components/athlete/AthleteSessionRequests";
import { SessionRequestsAdminCockpit } from "@/components/app-shell/SessionRequestsAdminCockpit";
import { CreativeAvailabilityManager } from "@/components/creatives/CreativeAvailabilityManager";
import { ProductionCreativeSpace } from "@/components/creatives/ProductionCreativeSpace";

let container: HTMLElement;
let root: Root;

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("creative availability and session request UI", () => {
  it("renders the Athlete mobile-first request choice without Creative identities", async () => {
    const fetchMock = vi.fn((
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => json({ requests: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<AthleteSessionRequests />));
    await flush();
    const open = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Nouvelle demande")!;
    await act(async () => open.click());

    expect(container.textContent).toContain("Match ou compétition");
    expect(container.textContent).toContain("Media Day");
    expect(container.textContent).toContain("ne réserve aucun créatif");
    expect(container.textContent).not.toContain("Créatif Test");
    expect(container.querySelector('input[type="date"]')).not.toBeNull();
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("uses the unified Athlete status without exposing internal costs", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({
      requests: [{
        id: "request-1",
        athleteId: "athlete-1",
        athleteName: "Athlète 1",
        requestType: "match_competition",
        workflowStatus: "production_linked",
        sport: "Basketball",
        eventType: "Match",
        eventStartsAt: "2026-12-12T14:00:00.000Z",
        eventEndsAt: "2026-12-12T16:00:00.000Z",
        scheduleToConfirm: false,
        locationName: "Lausanne",
        region: "Vaud",
        clubOrTeam: null,
        opponentOrEvent: null,
        objective: "Couverture du match",
        deliverables: "20 photos",
        practicalInformation: null,
        desiredDurationMinutes: null,
        constraintsComment: null,
        productCode: null,
        commercialMode: "paid_extra",
        snapshotCreditType: null,
        snapshotCreditQuantity: null,
        snapshotPriceChf: 450,
        adminReason: null,
        athleteComplement: null,
        productionBriefId: "brief-1",
        productionStatus: "draft",
        assignedCreativeProfileId: null,
        assignedCreativeName: null,
        creativeConfirmationStatus: null,
        applications: [],
        finalConfirmedAt: null,
        cancelledAt: null,
        createdAt: "2026-11-09T12:00:00.000Z",
        updatedAt: "2026-11-09T12:00:00.000Z",
        periods: [],
        events: [],
        nextAction: "KLIQUE organise la mission.",
      }],
    })));

    await act(async () => root.render(<AthleteSessionRequests />));
    await flush();

    expect(container.textContent).toContain("À organiser");
    expect(container.textContent).not.toContain("Préparation Production");
    expect(container.textContent).not.toContain("Droit ou coût");
    expect(container.textContent).not.toContain("450");
    expect(container.textContent).toContain("Mission à organiser");
  });

  it("renders the Creative owner form, timezone and non-booking notice", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({
      rules: [],
      occurrences: [],
      conflicts: [],
    })));
    await act(async () => root.render(<CreativeAvailabilityManager />));
    await flush();

    expect(container.textContent).toContain("Mon calendrier");
    expect(container.textContent).toContain("Disponibilités des créatifs");
    expect(container.textContent).toContain("Europe/Zurich");
    expect(container.textContent).toContain("ni une réservation");
    expect(container.textContent).toContain("Match / compétition");
    expect(container.textContent).toContain("Media Day");
  });

  it("shows a Creative proposal with its place, deliverables and response deadline", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => (
      String(input).includes("/api/creative/profile")
        ? json({
            profile: {
              displayName: "Créatif Test",
              creativeType: "both",
              portfolioUrl: "https://example.test",
              coverageAreas: ["Vaud"],
              specialties: ["Basketball"],
              bio: "Photo et vidéo",
              generalAvailability: "Semaine",
              onboardingStatus: "active",
              onboardingMessage: null,
            },
            checklist: {
              displayName: true,
              creativeType: true,
              coverageAreas: true,
              specialties: true,
              portfolioUrl: true,
              bio: true,
              generalAvailability: true,
            },
          })
        : json({
            projects: [{
              id: "brief-1",
              title: "Media Day",
              creativeType: "photo_video",
              athletes: [{ id: "athlete-1", name: "Athlète 1" }],
              scheduledDate: "2026-12-12",
              dateToAgree: false,
              region: "Vaud",
              locationDetails: "Stade de Lausanne",
              objective: "Portraits",
              deliverables: "20 photos",
              deliveryDueDate: null,
              responseDeadline: "2026-12-01T17:00:00.000Z",
              compensation: {
                type: "unpaid_collaboration",
                amountMinor: null,
                currency: null,
              },
              expensesCovered: false,
              expenseTerms: "Frais non prévus",
              creditsAndUsage: "Web KLIQUE",
              status: "published",
              conditionsVersion: 1,
              applicationStatus: "none",
              applicationMessage: null,
              assignment: null,
            }],
          })
    )));

    await act(async () => root.render(<ProductionCreativeSpace />));
    await flush();

    expect(container.textContent).toContain("Stade de Lausanne");
    expect(container.textContent).toContain("20 photos");
    expect(container.textContent).toContain("Répondre avant");
    expect(container.textContent).toContain("1 déc. 2026");
    expect(container.textContent).toContain("Proposition reçue");
    expect(container.textContent).toContain("Répondre à la proposition");
    expect(container.textContent).not.toContain("confirmationStatus");
  });

  it("renders the Admin counter, filters and empty queue", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({
      requests: [],
      creatives: [],
      availability: { occurrences: [], conflicts: [] },
    })));
    await act(async () => root.render(<SessionRequestsAdminCockpit />));
    await flush();

    expect(container.textContent).toContain("Séances à examiner");
    expect(container.textContent).toContain("Statut");
    expect(container.textContent).toContain("Région");
    expect(container.textContent).toContain("Athlète");
    expect(container.textContent).toContain("Aucune demande");
  });
});
