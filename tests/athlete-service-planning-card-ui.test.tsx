// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AthleteServicePlanningCard } from "@/components/app-shell/AthleteServicePlanningCard";

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("AthleteServicePlanningCard", () => {
  it("shows the Athlete, remaining services, deadline, level and direct profile link", async () => {
    await act(async () => root.render(
      <AthleteServicePlanningCard priorities={[
        {
          athleteId: "athlete/urgent",
          athleteName: "Alice Martin",
          membershipId: "membership-1",
          endsAt: "2026-10-28T00:00:00.000Z",
          daysRemaining: 20,
          level: "urgent",
          availableTotal: 3,
          remainingServices: [
            { creditType: "production", label: "Productions", available: 1 },
            { creditType: "custom_content", label: "Contenus personnalisés", available: 2 },
          ],
        },
        {
          athleteId: "athlete-plan",
          athleteName: "Benoît Dupont",
          membershipId: "membership-2",
          endsAt: "2026-12-01T00:00:00.000Z",
          daysRemaining: 54,
          level: "plan",
          availableTotal: 1,
          remainingServices: [
            { creditType: "production", label: "Productions", available: 1 },
          ],
        },
        {
          athleteId: "athlete-anticipate",
          athleteName: "Chloé Simon",
          membershipId: "membership-3",
          endsAt: "2027-03-01T00:00:00.000Z",
          daysRemaining: 144,
          level: "anticipate",
          availableTotal: 1,
          remainingServices: [
            { creditType: "custom_content", label: "Contenus personnalisés", available: 1 },
          ],
        },
        {
          athleteId: "athlete-future",
          athleteName: "David Robert",
          membershipId: "membership-4",
          endsAt: "2027-05-01T00:00:00.000Z",
          daysRemaining: 205,
          level: "future",
          availableTotal: 1,
          remainingServices: [
            { creditType: "production", label: "Productions", available: 1 },
          ],
        },
      ]} />,
    ));

    expect(container.textContent).toContain("Prestations à planifier");
    expect(container.textContent).toContain("Alice Martin");
    expect(container.textContent).toContain("1 productions · 2 contenus personnalisés");
    expect(container.textContent).toContain("Fin le 28.10.2026 · 20 jours");
    expect(container.textContent).toContain("Urgent");
    expect(container.textContent).toContain("À planifier");
    expect(container.textContent).toContain("À anticiper");
    expect(container.textContent).toContain("À venir");
    expect(container.querySelector<HTMLAnchorElement>('a[href="/crm/personnes/athlete%2Furgent"]')).toBeTruthy();
  });

  it("renders the read-only empty state", async () => {
    await act(async () => root.render(<AthleteServicePlanningCard priorities={[]} />));

    expect(container.textContent).toContain(
      "Aucune prestation incluse à planifier.",
    );
    expect(container.querySelector("button")).toBeNull();
  });
});
