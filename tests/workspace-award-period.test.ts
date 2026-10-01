// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLastCompletedAwardPeriod, WorkspaceLanding } from "@/components/app-shell/WorkspaceLanding";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("Athlète KLIQUE du mois period", () => {
  it("defaults to September 2026 on October 1, 2026", () => {
    expect(getLastCompletedAwardPeriod(new Date(2026, 9, 1))).toBe("2026-09");
  });

  it("rolls back to December of the previous year in January", () => {
    expect(getLastCompletedAwardPeriod(new Date(2026, 0, 15))).toBe("2025-12");
  });

  it("keeps the monthly award usable when an unrelated dashboard source fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/athletes?")) {
        return Response.json({
          source: "google-sheets",
          athletes: [{
            key: "athlete-1",
            name: "Alice Martin",
            status: "Actif",
            adhesionDate: "",
            lastResponseMonthly: "",
            lastResponseWeekly: "",
            weeklyFormResponse: null,
            monthlyFormResponse: null,
          }],
        });
      }
      if (url.startsWith("/api/athlete-distinctions?")) {
        return Response.json({ nominations: [], winner: null });
      }
      if (url === "/api/hub-opportunities") {
        throw new Error("Unrelated source unavailable");
      }
      return Response.json({ source: "google-sheets", shootings: [], processedResponses: [], slots: [], requests: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(WorkspaceLanding));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const awardCard = container.querySelector(".dashboard-award-card");
    expect(awardCard?.textContent).toContain("Athlete KLIQUE du mois");
    expect(awardCard?.querySelector<HTMLInputElement>("#athlete-award-period")?.disabled).toBe(false);
    expect(awardCard?.textContent).toContain("Alice Martin");

    await act(async () => root.unmount());
  });
});
