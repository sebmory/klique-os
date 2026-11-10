// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CanonicalCreativeMission,
  CanonicalCreativeMissionState,
  CanonicalCreativeMissionView,
} from "@/lib/canonical-creative-missions";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
  }) => createElement("a", { href, ...props }, children),
}));

import {
  AdminMissionsScreen,
  filterCanonicalMissions,
} from "@/components/missions/AdminMissionsScreen";
import AdminMissionsPage from "@/app/missions/page";

const globalCss = readFileSync("app/globals.css", "utf8");

const mission = (
  id: string,
  state: CanonicalCreativeMissionState,
  view: CanonicalCreativeMissionView,
  overrides: Partial<CanonicalCreativeMission> = {},
): CanonicalCreativeMission => ({
  id,
  recordKind: "mission",
  originKind: "athlete_request",
  state,
  view,
  title: `Mission ${id}`,
  missionType: "production",
  scheduledAt: "2026-12-10T09:00:00.000Z",
  periodEndsAt: null,
  locationName: null,
  region: null,
  deliverables: null,
  contextNotes: null,
  usageRights: null,
  budgetAmountMinor: null,
  expensesCovered: null,
  expenseTerms: null,
  responseDeadline: null,
  searchMode: null,
  blockingReason: null,
  occurredAt: null,
  occurredAtSource: null,
  regularizationStatus: "none",
  regularizationNote: null,
  athletes: [{ id: `athlete-${id}`, name: `Athlète ${id}` }],
  services: [],
  sources: [{
    type: "athlete_session_request",
    relation: "origin",
    id: `request-${id}`,
    snapshot: { workflowStatus: state },
  }],
  creative: null,
  nextAction: state === "review" ? "Examiner la demande" : "Organiser la mission",
  nextActor: "Admin",
  events: [{
    action: "projection_updated",
    fromState: null,
    toState: state,
    actor: "system",
    note: null,
    createdAt: "2026-11-09T12:00:00.000Z",
  }],
  updatedAt: "2026-11-09T12:00:00.000Z",
  ...overrides,
});

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let container: HTMLElement;
let root: Root;

const renderScreen = async () => {
  await act(async () => {
    root.render(createElement(AdminMissionsScreen));
  });
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("canonical Admin missions UI", () => {
  it("wires the page to the canonical cockpit", () => {
    expect(AdminMissionsPage().type).toBe(AdminMissionsScreen);
  });

  it("renders four server-counted views and a multi-athlete historical mission", async () => {
    const historical = mission("history-1", "completed", "history", {
      title: "Media Day — Armand Angha & Raphaël Monty",
      missionType: "media_day",
      occurredAt: "2026-07-11T12:00:00.000Z",
      regularizationStatus: "historical_completed",
      regularizationNote: "Terminée — historique régularisé.",
      athletes: [
        { id: "armand-angha", name: "Armand Angha" },
        { id: "raphael-monty", name: "Raphaël Monty" },
      ],
      services: [
        {
          requestId: "service-1",
          productName: "Session photo KLIQUE",
          status: "completed",
          requestedDetails: {},
        },
        {
          requestId: "service-2",
          productName: "Contenu personnalisé",
          status: "completed",
          requestedDetails: {},
        },
      ],
      sources: [{
        type: "production_sheet",
        relation: "production",
        id: "google_sheets:fingerprint",
        snapshot: { shootingDone: false, published: true },
      }],
      creative: {
        kind: "historical",
        name: "Sébastien Mory",
        profileId: "profile-1",
      },
      nextAction: "Aucune action",
    });
    const missions = [
      mission("review-1", "review", "to_process"),
      mission("organize-1", "organize", "to_organize"),
      mission("confirmed-1", "confirmed", "in_progress"),
      historical,
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (
      String(input).includes("/api/admin/missions")
        ? response({
            missions,
            counts: {
              to_process: 1,
              to_organize: 1,
              in_progress: 1,
              history: 1,
            },
          })
        : response({ athletes: [], source: "google-sheets" })
    )));

    await renderScreen();

    expect(container.textContent).toContain("Pilotage unifié des missions");
    for (const label of ["À traiter", "À organiser", "En cours", "Historique"]) {
      expect(Array.from(container.querySelectorAll("button")).some(
        (button) => button.textContent?.includes(label),
      )).toBe(true);
    }

    const historyButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Historique"));
    await act(async () => {
      historyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelectorAll(".admin-mission-card")).toHaveLength(1);
    expect(container.textContent).toContain("Media Day — Armand Angha & Raphaël Monty");
    expect(container.textContent).toContain("Terminée — historique régularisé");
    expect(container.textContent).toContain("Sébastien Mory — créatif historique déclaré");
    expect(container.textContent).toContain("Voir le parcours");
    expect(container.textContent).toContain("Régularisation historique");
    expect(container.textContent).toContain("Réalisation connue");
    expect(container.textContent).toContain("Détails techniques");
    expect(container.querySelector('a[href="/crm/personnes/armand-angha"]')).not.toBeNull();
    expect(container.querySelector('a[href="/crm/personnes/raphael-monty"]')).not.toBeNull();
    expect(container.querySelector("details")).not.toBeNull();
    expect(container.querySelector("pre")?.textContent).toContain('"shootingDone": false');
  });

  it("filters within one view across athletes, services and creatives", () => {
    const missions = [
      mission("1", "completed", "history", {
        athletes: [{ id: "athlete-1", name: "Chiona Kapinga" }],
        services: [{
          requestId: "service-1",
          productName: "Contenu personnalisé",
          status: "completed",
          requestedDetails: {},
        }],
      }),
      mission("2", "completed", "history", {
        creative: { kind: "historical", name: "Alan Jeanbourquin", profileId: null },
      }),
      mission("3", "review", "to_process"),
    ];

    expect(filterCanonicalMissions({
      missions,
      view: "history",
      query: "chiona",
    })).toEqual([missions[0]]);
    expect(filterCanonicalMissions({
      missions,
      view: "history",
      query: "contenu personnalise",
    })).toEqual([missions[0]]);
    expect(filterCanonicalMissions({
      missions,
      view: "history",
      query: "alan",
    })).toEqual([missions[1]]);
    expect(filterCanonicalMissions({
      missions,
      view: "history",
      query: "",
    })).toEqual([missions[0], missions[1]]);
  });

  it("uses profile compatibility and shows missing availability without blocking", async () => {
    const organized = mission("organize-1", "organize", "to_organize", {
      originKind: "admin",
      title: "Media Day Basketball",
      missionType: "media_day",
      region: "Vaud",
      contextNotes: "Portraits Basketball",
      deliverables: "20 photos",
      usageRights: "Web KLIQUE",
      expenseTerms: "Frais non prévus",
      sources: [],
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (
      String(input).includes("/api/admin/missions")
        ? response({
            missions: [organized],
            counts: {
              to_process: 0,
              to_organize: 1,
              in_progress: 0,
              history: 0,
            },
            candidates: [{
              id: "11111111-1111-4111-8111-111111111111",
              displayName: "Photo Vaud",
              creativeType: "photographer",
              coverageAreas: ["Vaud"],
              specialties: ["Basketball"],
              generalAvailability: null,
              availability: [],
              conflicts: [],
            }, {
              id: "22222222-2222-4222-8222-222222222222",
              displayName: "Vidéo Genève",
              creativeType: "videographer",
              coverageAreas: ["Genève"],
              specialties: ["Football"],
              generalAvailability: "Le week-end",
              availability: [],
              conflicts: [],
            }],
          })
        : response({ athletes: [], source: "google-sheets" })
    )));

    await renderScreen();
    const organizeButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("À organiser"));
    await act(async () => organizeButton?.click());

    expect(container.textContent).toContain("Photo Vaud");
    expect(container.textContent).toContain("Disponibilité non renseignée");
    expect(container.querySelector(".admin-mission-candidates .is-compatible")?.textContent)
      .toContain("Photo Vaud");
    const compatibleCheckbox = container.querySelector<HTMLInputElement>(
      ".admin-mission-candidates .is-compatible input",
    );
    await act(async () => compatibleCheckbox?.click());
    expect(Array.from(container.querySelectorAll("button")).some(
      (button) => button.textContent === "Proposer la mission" && !button.disabled,
    )).toBe(true);
    expect(container.textContent).toContain("Créer une mission");
  });

  it("keeps the 390px mobile layout bounded and details wrappable", () => {
    const mobileCss = globalCss.slice(globalCss.indexOf("@media (max-width: 480px)"));
    expect(mobileCss).toContain(".admin-missions-screen");
    expect(mobileCss).toContain("min-width: 0");
    expect(mobileCss).toContain("grid-template-columns: 1fr");
    expect(globalCss).toContain(".admin-mission-details pre");
    expect(globalCss).toContain("white-space: pre-wrap");
    expect(globalCss).toContain("overflow-wrap: anywhere");
  });

  it("shows loading, recoverable error and empty states", async () => {
    let resolveMissions: ((value: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveMissions = resolve;
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => (
      String(input).includes("/api/admin/missions")
        ? pending
        : Promise.resolve(response({ athletes: [], source: "google-sheets" }))
    )));
    await renderScreen();
    expect(container.textContent).toContain("Chargement des missions créatives");

    await act(async () => {
      resolveMissions?.(response({ error: "Service indisponible." }, 500));
      await pending;
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Service indisponible");

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (
      String(input).includes("/api/admin/missions")
        ? response({ missions: [], counts: emptyCountsForTest })
        : response({ athletes: [], source: "google-sheets" })
    )));
    const retry = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Réessayer");
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Aucune mission créative");
  });
});

const emptyCountsForTest = {
  to_process: 0,
  to_organize: 0,
  in_progress: 0,
  history: 0,
};
