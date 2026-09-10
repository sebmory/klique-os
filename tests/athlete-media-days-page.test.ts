// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AthleteMediaDaysPage from "@/app/athlete/media-days/page";

const openDay = {
  id: "day-1",
  title: "Media Day Fribourg",
  description: "Journée média KLIQUE",
  date: "2026-10-02",
  startTime: "09:00",
  endTime: "17:00",
  location: "Fribourg",
  capacity: 12,
  status: "open",
  athleteIds: ["athlete-1", "athlete-2"],
  athletes: [
    { athleteId: "athlete-1", status: "invited", slotStart: "09:30", slotEnd: "10:00", respondedAt: null, adminNote: null },
    { athleteId: "athlete-2", status: "confirmed", slotStart: "10:00", slotEnd: "10:30", respondedAt: "2026-09-10T09:00:00.000Z", adminNote: null },
  ],
};

const completedDay = {
  ...openDay,
  id: "day-2",
  title: "Media Day Bulle",
  status: "completed",
  athletes: [
    { athleteId: "athlete-1", status: "confirmed", slotStart: null, slotEnd: null, respondedAt: "2026-09-01T09:00:00.000Z", adminNote: null },
  ],
};

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root | null = null;

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response;

const patchCalls = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");

const patchBody = (index = 0) => JSON.parse(String((patchCalls()[index]?.[1] as RequestInit).body));

const setResponses = (
  options: { mediaDays?: unknown[]; payload?: unknown; status?: number; athleteId?: string | null } = {},
) => {
  const { mediaDays = [openDay], payload, status = 200, athleteId = "athlete-1" } = options;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/clerk/access") return jsonResponse({ ok: true, userAccess: { athleteId } });
    if (init?.method === "PATCH") return jsonResponse({ ok: true, mediaDay: openDay });
    return jsonResponse(payload ?? { ok: status < 400, mediaDays }, status);
  });
};

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  const created = createRoot(container);
  root = created;
  await act(async () => {
    created.render(createElement(AthleteMediaDaysPage));
  });
};

const findButton = (label: string) =>
  [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === label);

const click = async (element: Element | undefined) => {
  expect(element).toBeDefined();
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  setResponses();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => {
      current.unmount();
    });
    container.remove();
    root = null;
  }
  vi.unstubAllGlobals();
});

describe("Athlete media days page", () => {
  it("loads the media days and renders their details", async () => {
    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/media-days", { credentials: "include", cache: "no-store" });
    expect(container.textContent).toContain("Media Day Fribourg");
    expect(container.textContent).toContain("Journée média KLIQUE");
    expect(container.textContent).toContain("02 octobre 2026");
    expect(container.textContent).toContain("09:00 – 17:00");
    expect(container.textContent).toContain("Fribourg");
    expect(container.textContent).toContain("Ouverte");
  });

  it("shows the personal slot and answer of the signed-in athlete only", async () => {
    await mount();

    expect(container.textContent).toContain("Votre créneau : 09:30 – 10:00");
    expect(container.textContent).toContain("Votre réponse est attendue");
    expect(container.textContent).not.toContain("10:00 – 10:30");
    expect(container.textContent).not.toContain("athlete-2");
  });

  it("shows the answer buttons only for an open media day still invited", async () => {
    setResponses({ mediaDays: [completedDay] });
    await mount();

    expect(findButton("Confirmer")).toBeUndefined();
    expect(findButton("Refuser")).toBeUndefined();
    expect(container.textContent).toContain("Vous avez confirmé");
    expect(container.textContent).toContain("Terminée");
  });

  it("sends the exact payload for a confirmation and a refusal", async () => {
    await mount();
    await click(findButton("Confirmer"));

    const [url, init] = patchCalls()[0] as [string, RequestInit];
    expect(url).toBe("/api/media-days");
    expect(init.method).toBe("PATCH");
    expect(init.credentials).toBe("include");
    expect(patchBody()).toEqual({ action: "athlete_response", mediaDayId: "day-1", response: "confirmed" });

    await click(findButton("Refuser"));
    expect(patchBody(1)).toEqual({ action: "athlete_response", mediaDayId: "day-1", response: "declined" });
  });

  it("blocks a double submission while the answer is in flight", async () => {
    let releasePatch: (() => void) | null = null;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/clerk/access") return jsonResponse({ ok: true, userAccess: { athleteId: "athlete-1" } });
      if (init?.method === "PATCH") {
        await new Promise<void>((resolve) => {
          releasePatch = resolve;
        });
        return jsonResponse({ ok: true, mediaDay: openDay });
      }
      return jsonResponse({ ok: true, mediaDays: [openDay] });
    });

    await mount();
    await click(findButton("Confirmer"));

    expect(findButton("Envoi…")).toBeDefined();
    expect(findButton("Refuser")?.hasAttribute("disabled")).toBe(true);

    await click(findButton("Refuser"));
    expect(patchCalls()).toHaveLength(1);

    await act(async () => {
      releasePatch?.();
    });
    expect(patchCalls()).toHaveLength(1);
  });

  it("refreshes the media day locally and confirms the answer", async () => {
    const updated = {
      ...openDay,
      athletes: [
        { athleteId: "athlete-1", status: "confirmed", slotStart: "09:30", slotEnd: "10:00", respondedAt: "2026-09-10T10:00:00.000Z", adminNote: null },
      ],
    };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/clerk/access") return jsonResponse({ ok: true, userAccess: { athleteId: "athlete-1" } });
      if (init?.method === "PATCH") return jsonResponse({ ok: true, mediaDay: updated });
      return jsonResponse({ ok: true, mediaDays: [openDay] });
    });

    await mount();
    await click(findButton("Confirmer"));

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Votre participation est confirmée.");
    expect(container.textContent).toContain("Vous avez confirmé");
    expect(findButton("Confirmer")).toBeUndefined();
  });

  it("shows the server error and keeps the buttons available", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/clerk/access") return jsonResponse({ ok: true, userAccess: { athleteId: "athlete-1" } });
      if (init?.method === "PATCH") return jsonResponse({ ok: false, message: "Acces refuse." }, 403);
      return jsonResponse({ ok: true, mediaDays: [openDay] });
    });

    await mount();
    await click(findButton("Confirmer"));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Acces refuse.");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(findButton("Confirmer")).toBeDefined();
  });

  it("shows the load error, the empty state and the loading state", async () => {
    setResponses({ payload: { ok: false, message: "Acces refuse." }, status: 403 });
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Acces refuse.");

    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;

    setResponses({ mediaDays: [] });
    await mount();
    expect(container.textContent).toContain("Aucune journée média ne vous concerne pour le moment.");

    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;

    let releaseLoad: (() => void) | null = null;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/clerk/access") return jsonResponse({ ok: true, userAccess: { athleteId: "athlete-1" } });
      await new Promise<void>((resolve) => {
        releaseLoad = resolve;
      });
      return jsonResponse({ ok: true, mediaDays: [openDay] });
    });

    await mount();
    expect(container.textContent).toContain("Chargement de vos journées média…");

    await act(async () => {
      releaseLoad?.();
    });
    expect(container.textContent).toContain("Media Day Fribourg");
  });
});
