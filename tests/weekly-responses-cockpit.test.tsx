// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeeklyResponsesCockpit } from "@/components/app-shell/WeeklyResponsesCockpit";
import { selectWeeklyResponses } from "@/lib/weekly-responses";
import type { Athlete, WeeklyFormResponse } from "@/types/athlete";

const response: WeeklyFormResponse = {
  timestamp: "16/10/2026 10:00:00",
  competitionParticipation: "Oui",
  competition: "Coupe suisse",
  result: "Win avec un bon apport défensif",
  notableEvent: "",
  notableEventExplanation: "",
  media: "Photos",
  mediaLink: "https://example.com/resultats",
  appointment: "Match de championnat vs Sarine",
  quickContact: "Non",
  quickContactReason: "",
  contactRequested: false,
  firstAppointmentDate: "20/10/2026",
  secondAppointmentDate: "",
  thirdAppointmentDate: "",
};

const athlete: Athlete = {
  key: "liban-maxamed",
  athleteId: "liban-maxamed",
  name: "Liban Maxamed",
  initials: "LM",
  sport: "Basketball",
  club: "",
  status: "Actif",
  instagram: "",
  phone: "",
  email: "",
  nextContact: "",
  notes: "",
  palmares: "",
  objective: "",
  longTerm: "",
  desiredAreas: "",
  lastContact: "",
  nextAction: "",
  followUpNotes: "",
  lastResponseMonthly: "",
  lastResponseWeekly: response.timestamp,
  weeklyFormResponse: response,
  lastPublication: "",
  titlesOfMonth: "",
  analysisItems: "",
  plannedContents: "",
  lastPost: "",
  lastStory: "",
  daysWithoutVisibility: 0,
  lastShoot: "",
  media: 0,
  premium: 0,
  coverage: 0,
  tone: "solid",
  heightWeight: "",
  birthDate: "",
  nationality: "",
  position: "",
  competitionPhoto: false,
  adhesionDate: "",
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("WeeklyResponsesCockpit", () => {
  it("shows the real count and every item when more than four responses are available", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const athletes = Array.from({ length: 6 }, (_, index) => ({
      ...athlete,
      key: `athlete-${index}`,
      athleteId: `athlete-${index}`,
      name: `Athlète ${index}`,
      weeklyFormResponse: {
        ...response,
        timestamp: `${10 + index}/10/2026 10:00:00`,
      },
    }));
    const items = selectWeeklyResponses(
      athletes,
      new Set(),
      new Date(2026, 9, 17, 14, 0, 0).getTime(),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(WeeklyResponsesCockpit, {
        items,
        processingResponseKeys: new Set<string>(),
        error: null,
        onMarkProcessed: vi.fn(),
      }));
    });

    expect(container.textContent).toContain("6 athlètes");
    expect(container.querySelectorAll(".weekly-cockpit-table tbody > tr:not(.weekly-cockpit-expanded-row)")).toHaveLength(6);
    expect(container.querySelectorAll(".weekly-cockpit-mobile-card")).toHaveLength(6);

    await act(async () => root.unmount());
  });

  it("renders a desktop table and responsive mobile cards with accessible expandable details", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onMarkProcessed = vi.fn();
    const items = selectWeeklyResponses(
      [athlete],
      new Set(),
      new Date(2026, 9, 17, 14, 0, 0).getTime(),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(WeeklyResponsesCockpit, {
        items,
        processingResponseKeys: new Set<string>(),
        error: null,
        onMarkProcessed,
      }));
    });

    expect(container.querySelector(".weekly-cockpit-table")).not.toBeNull();
    expect(container.querySelector(".weekly-cockpit-mobile-card")).not.toBeNull();
    expect(container.textContent).toContain("1 athlète");
    expect(container.textContent).toContain("Victoire en Coupe suisse");
    expect(container.textContent).toContain("Win avec un bon apport défensif");
    expect(container.textContent).toContain("Match de championnat vs Sarine");
    expect(container.querySelector(".weekly-priority-success")).not.toBeNull();

    const toggle = container.querySelector<HTMLButtonElement>(".weekly-cockpit-desktop .weekly-details-toggle");
    expect(toggle?.tagName).toBe("BUTTON");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("aria-controls")).toBeTruthy();

    await act(async () => {
      toggle?.focus();
      toggle?.click();
    });

    expect(document.activeElement).toBe(toggle);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    const detailsId = toggle?.getAttribute("aria-controls") ?? "";
    const details = document.getElementById(detailsId);
    expect(details?.getAttribute("role")).toBe("region");
    expect(details?.textContent).toContain("Événement ou compétition");
    const safeLink = details?.querySelector<HTMLAnchorElement>("a[href='https://example.com/resultats']");
    expect(safeLink?.target).toBe("_blank");
    expect(safeLink?.rel).toBe("noopener noreferrer");

    const checkbox = container.querySelector<HTMLInputElement>(".weekly-cockpit-desktop input[type='checkbox']");
    await act(async () => checkbox?.click());
    expect(onMarkProcessed).toHaveBeenCalledTimes(1);
    expect(onMarkProcessed).toHaveBeenCalledWith("liban-maxamed", response.timestamp);

    await act(async () => root.unmount());
  });

  it("visually attenuates a response while its treated status is being persisted", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const items = selectWeeklyResponses(
      [athlete],
      new Set(),
      new Date(2026, 9, 17, 14, 0, 0).getTime(),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(WeeklyResponsesCockpit, {
        items,
        processingResponseKeys: new Set([items[0]!.responseKey]),
        error: null,
        onMarkProcessed: vi.fn(),
      }));
    });

    expect(container.querySelector(".weekly-cockpit-table tr.is-processing")).not.toBeNull();
    expect(container.querySelector(".weekly-cockpit-mobile-card.is-processing")).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>(".weekly-cockpit-desktop input[type='checkbox']")?.checked).toBe(true);

    await act(async () => root.unmount());
  });
});
