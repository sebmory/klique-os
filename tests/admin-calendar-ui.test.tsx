// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOperationalCalendar } from "@/lib/admin-operational-calendar";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import {
  AdminCalendarScreen,
  filterCalendarEvents,
  getCalendarTypeCounts,
  scopeCalendarDatedEvents,
} from "@/components/calendar/AdminCalendarScreen";
import CalendarPage from "@/app/calendar/page";
import { adminNavigationGroups, commandEntries } from "@/components/app-shell/data";
import { resolveModuleGuide } from "@/components/app-shell/module-guide-config";

const calendar: AdminOperationalCalendar = {
  dated: [
    {
      id: "production:past",
      type: "production",
      sourceLabel: "Production",
      title: "Production historique",
      date: "2026-09-15",
      time: "10:00",
      entityLabel: "Léa Martin",
      location: "Genève",
      status: "Terminée",
      nextAction: null,
      href: "/production/production-past",
    },
    {
      id: "mission:1",
      type: "mission",
      sourceLabel: "Mission créative",
      title: "Portrait Léa",
      date: "2026-10-20",
      time: "14:00",
      entityLabel: "Alice Photo",
      location: "Lausanne",
      status: "Livraison à vérifier",
      nextAction: "Vérifier la livraison",
      href: "/crm/demandes?tab=services&requestId=1",
    },
    {
      id: "media-day:1",
      type: "media_day",
      sourceLabel: "Journée média",
      title: "Journée média Basket",
      date: "2026-11-02",
      time: "09:00",
      entityLabel: null,
      location: "Fribourg",
      status: "Ouverte",
      nextAction: "Suivre les réponses",
      href: "/media-days",
    },
  ],
  unscheduled: [
    {
      id: "request:2",
      type: "service_request",
      sourceLabel: "Demande de prestation",
      title: "Session photo",
      date: null,
      time: null,
      entityLabel: null,
      location: null,
      status: "Reçue",
      nextAction: null,
      href: "/crm/demandes?tab=services&requestId=2",
    },
  ],
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T10:00:00.000Z"));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const renderCalendar = async (payload: AdminOperationalCalendar = calendar) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
  await act(async () => {
    root.render(createElement(AdminCalendarScreen));
  });
};

describe("Admin operational calendar UI", () => {
  it("wires the page, Admin-only navigation, search and module guide", () => {
    expect(CalendarPage().type).toBe(AdminCalendarScreen);
    expect(adminNavigationGroups.find((group) => group.id === "pilotage")?.items)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "Calendrier", href: "/calendar" }),
      ]));
    expect(commandEntries).toContainEqual(expect.objectContaining({
      label: "Calendrier opérationnel",
      href: "/calendar",
    }));
    expect(resolveModuleGuide("/calendar", "admin")?.name).toBe("Calendrier opérationnel");
    expect(resolveModuleGuide("/calendar", "media")).toBeNull();
  });

  it("shows upcoming events, canonical links and a separate unscheduled section", async () => {
    await renderCalendar();

    expect(container.textContent).toContain("Calendrier opérationnel");
    expect(container.textContent).toContain("Portrait Léa");
    expect(container.textContent).toContain("Journée média Basket");
    expect(container.textContent).not.toContain("Production historique");
    expect(container.textContent).toContain("À planifier");
    expect(container.querySelector(".admin-calendar-unscheduled-count")?.textContent).toContain("1");
    const allFilter = Array.from(container.querySelectorAll(".admin-calendar-filters button"))
      .find((button) => button.textContent?.includes("Tous"));
    expect(allFilter?.textContent).toContain("2");
    expect(container.querySelector(
      'a[href="/crm/demandes?tab=services&requestId=1"]',
    )?.getAttribute("aria-label")).toContain("Portrait Léa");
    expect(container.querySelector(
      'a[href="/crm/demandes?tab=services&requestId=2"]',
    )).not.toBeNull();
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toContain("À venir");
  });

  it("scopes counters to upcoming events and preserves past events in their historical month", async () => {
    const upcoming = scopeCalendarDatedEvents({
      events: calendar.dated,
      view: "upcoming",
      today: "2026-10-10",
      monthKey: "2026-10",
    });
    expect(upcoming.map((event) => event.id)).toEqual(["mission:1", "media-day:1"]);
    expect(getCalendarTypeCounts(upcoming)).toMatchObject({
      all: 2,
      mission: 1,
      production: 0,
      media_day: 1,
    });
    const historicalMonth = scopeCalendarDatedEvents({
      events: calendar.dated,
      view: "month",
      today: "2026-10-10",
      monthKey: "2026-09",
    });
    expect(historicalMonth.map((event) => event.id)).toEqual(["production:past"]);

    await renderCalendar();
    const monthButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Mois");
    await act(async () => monthButton?.click());
    const previousButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Mois précédent"));
    await act(async () => previousButton?.click());

    expect(container.textContent).toContain("septembre 2026");
    expect(container.textContent).toContain("Production historique");
    const allFilter = Array.from(container.querySelectorAll(".admin-calendar-filters button"))
      .find((button) => button.textContent?.includes("Tous"));
    expect(allFilter?.textContent).toContain("1");
  });

  it("filters, searches and navigates the monthly view with keyboard buttons", async () => {
    expect(filterCalendarEvents({
      events: calendar.dated,
      type: "media_day",
      query: "fribourg",
    })).toEqual([calendar.dated[2]]);

    await renderCalendar();
    const monthButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Mois");
    await act(async () => monthButton?.click());

    expect(container.textContent).toContain("octobre 2026");
    expect(container.querySelector('[aria-label^="Calendrier de"]')).not.toBeNull();
    const nextButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Mois suivant"));
    await act(async () => nextButton?.click());
    expect(container.textContent).toContain("novembre 2026");
    expect(container.textContent).toContain("Journée média Basket");

    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    await act(async () => {
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(search, "inexistant");
        search.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    expect(container.textContent).toContain("Aucun événement pour ce mois");
  });

  it("keeps the wide layout readable and stacks the monthly grid on mobile", () => {
    const css = readFileSync("app/globals.css", "utf8").replace(/\r\n/g, "\n");
    expect(css).toContain(".admin-calendar-filters {\n  grid-column: 1 / -1;\n  display: flex;\n  flex-wrap: wrap;");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain(".admin-calendar-month-grid {\n    grid-template-columns: 1fr;");
    expect(css).toContain("touch-action: pan-x");
  });
});
