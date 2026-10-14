// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminCreativeMissionListItem,
  AdminCreativeMissionQueueStatus,
} from "@/lib/admin-creative-missions";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import {
  AdminMissionsScreen,
  filterAdminMissions,
} from "@/components/missions/AdminMissionsScreen";
import AdminMissionsPage from "@/app/missions/page";
import CrmContactRequestsPage from "@/app/crm/demandes/page";

const globalCss = readFileSync("app/globals.css", "utf8");

const cssRule = (selector: string): string => {
  const index = globalCss.indexOf(`\n${selector} {`);
  if (index === -1) return "";
  const start = globalCss.indexOf("{", index);
  const end = globalCss.indexOf("}", start);
  return globalCss.slice(start, end);
};

const mission = (
  requestId: string,
  queueStatus: AdminCreativeMissionQueueStatus,
  overrides: Partial<AdminCreativeMissionListItem> = {},
): AdminCreativeMissionListItem => ({
  requestId,
  athleteId: `athlete-${requestId}`,
  reference: `KLIQUE-${requestId.padStart(8, "0")}`,
  title: `Mission ${requestId}`,
  discipline: "Football",
  missionDate: "2026-10-25",
  startTime: "14:00",
  locationName: "Lausanne",
  creative: { id: `creative-${requestId}`, displayName: `Créatif ${requestId}` },
  missionStatus: "ready",
  responseStatus: "accepted",
  executionStatus: "in_progress",
  queueStatus,
  nextAction: queueStatus === "delivery_review" ? "Vérifier la livraison" : "Attendre la livraison",
  lastUpdatedAt: "2026-10-14T10:00:00.000Z",
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

describe("Admin missions UI", () => {
  it("wraps every filter on wide screens and reserves touch scrolling for small mobile", () => {
    const desktopRule = cssRule(".admin-missions-filters");
    const smallMobileCss = globalCss.slice(globalCss.indexOf("@media (max-width: 480px)"));

    expect(desktopRule).toContain("flex-wrap: wrap");
    expect(desktopRule).toContain("overflow-x: visible");
    expect(smallMobileCss).toContain("flex-wrap: nowrap");
    expect(smallMobileCss).toContain("overflow-x: auto");
    expect(smallMobileCss).toContain("touch-action: pan-x");
  });

  it("wires the Admin page and reuses the existing request panel deep link", async () => {
    expect(AdminMissionsPage().type).toBe(AdminMissionsScreen);
    const requestPage = await CrmContactRequestsPage({
      searchParams: Promise.resolve({ tab: "services", requestId: "request-1" }),
    });
    expect(requestPage.props).toMatchObject({
      initialView: "services",
      initialServiceRequestId: "request-1",
    });
  });

  it("renders counters, canonical athlete links and safe request deep links", async () => {
    const missions = [
      mission("1", "delivery_review", { athleteId: "athlete-1", creative: { id: "creative-1", displayName: "Alice Photo" } }),
      mission("2", "to_prepare", { athleteId: "athlete-2", reference: null, missionStatus: null, responseStatus: "pending", executionStatus: null }),
      mission("3", "completed", { athleteId: "athlete-3", executionStatus: "completed", nextAction: "Aucune action" }),
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes("/api/admin/missions")
        ? response({ missions })
        : response({
            athletes: [{ key: "athlete-1", name: "Léa Martin" }],
            source: "google-sheets",
          });
    }));

    await renderScreen();

    expect(container.textContent).toContain("Suivi centralisé des missions");
    expect(container.querySelectorAll(".admin-mission-card")).toHaveLength(3);
    expect(container.querySelector(".admin-mission-card")?.textContent).toContain("Vérifier la livraison");
    expect(container.querySelector('a[href="/crm/personnes/athlete-1"]')?.textContent).toBe("Léa Martin");
    expect(container.querySelector('a[href="/crm/personnes/athlete-2"]')).toBeNull();
    expect(container.querySelector(
      'a[href="/crm/demandes?tab=services&requestId=1"]',
    )).not.toBeNull();
    const deliveryFilter = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Livraison à vérifier"));
    expect(deliveryFilter?.textContent).toContain("1");
  });

  it("filters by state and searches reference, discipline, location and creative name", async () => {
    const missions = [
      mission("1", "delivery_review", { creative: { id: "creative-1", displayName: "Alice Photo" } }),
      mission("2", "to_prepare", { discipline: "Basketball", locationName: "Fribourg" }),
    ];
    expect(filterAdminMissions({ missions, filter: "delivery_review", query: "" })).toEqual([missions[0]]);
    expect(filterAdminMissions({ missions, filter: "all", query: "alice" })).toEqual([missions[0]]);
    expect(filterAdminMissions({ missions, filter: "all", query: "basketball" })).toEqual([missions[1]]);
    expect(filterAdminMissions({ missions, filter: "all", query: "fribourg" })).toEqual([missions[1]]);
    expect(filterAdminMissions({ missions, filter: "all", query: "KLIQUE-00000001" })).toEqual([missions[0]]);

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (
      String(input).includes("/api/admin/missions")
        ? response({ missions })
        : response({ athletes: [], source: "google-sheets" })
    )));
    await renderScreen();

    const prepareFilter = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("À préparer"));
    await act(async () => {
      prepareFilter?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelectorAll(".admin-mission-card")).toHaveLength(1);
    expect(container.textContent).toContain("Basketball");

    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "Alice");
      search?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Aucun résultat");
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
    expect(container.textContent).toContain("Réessayer");

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (
      String(input).includes("/api/admin/missions")
        ? response({ missions: [] })
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
