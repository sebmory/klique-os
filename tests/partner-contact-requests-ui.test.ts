// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PartnerContactRequestsPage from "@/app/partner/contact-requests/page";

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(PartnerContactRequestsPage));
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("PartnerContactRequestsPage", () => {
  it("shows the loading state while the personal list is pending", async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));

    await mount();

    expect(container.textContent).toContain("Chargement de vos demandes…");
  });

  it("shows the athlete, request details, translated status and available response", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        contactRequests: [{
          id: "request-1",
          athleteId: "athlete-1",
          athleteName: "Mila Martin",
          subject: "Sponsoring",
          message: "Échange autour du projet.",
          status: "in_progress",
          createdAt: "2026-09-15T10:00:00.000Z",
          response: "L’équipe KLIQUE revient vers vous.",
        }],
      }),
    });

    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/partner/contact-requests", {
      credentials: "include",
      cache: "no-store",
    });
    expect(container.textContent).toContain("Mila Martin");
    expect(container.textContent).toContain("Sponsoring");
    expect(container.textContent).toContain("Échange autour du projet.");
    expect(container.textContent).toContain("En cours");
    expect(container.textContent).toContain("L’équipe KLIQUE revient vers vous.");
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-15T10:00:00.000Z");
  });

  it("shows the empty state", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ contactRequests: [] }) });

    await mount();

    expect(container.textContent).toContain("Vous n’avez encore aucune demande de mise en relation.");
  });

  it("shows the API error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Accès refusé." }),
    });

    await mount();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Accès refusé.");
  });
});