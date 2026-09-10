// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AthleteMediaRequestsPage from "@/app/athlete/media-requests/page";

const awaitingRequest = {
  id: "request-1",
  subjectId: "subject-1",
  subjectTitle: "Retour de blessure",
  requesterEmail: "media@example.com",
  mediaId: "media-1",
  requestType: "interview",
  message: "Nous souhaitons une interview.",
  deadline: "2026-09-20",
  status: "awaiting_athlete",
  athletes: [
    { athleteId: "athlete-1", consentStatus: "pending", respondedAt: null },
    { athleteId: "athlete-2", consentStatus: "approved", respondedAt: "2026-09-10T09:00:00.000Z" },
  ],
  createdAt: "2026-09-10T09:00:00.000Z",
};

const acceptedRequest = {
  ...awaitingRequest,
  id: "request-2",
  subjectTitle: "Portrait de rentrée",
  status: "accepted",
  athletes: [{ athleteId: "athlete-1", consentStatus: "approved", respondedAt: "2026-09-09T09:00:00.000Z" }],
};

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response;

const patchCalls = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");

const patchBody = (index = 0) => JSON.parse(String((patchCalls()[index]?.[1] as RequestInit).body));

const setResponses = (
  options: { requests?: unknown[]; status?: number; payload?: unknown; athleteId?: string | null } = {},
) => {
  const { requests = [awaitingRequest], status = 200, payload, athleteId = "athlete-1" } = options;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/clerk/access") return jsonResponse({ ok: true, userAccess: { athleteId } });
    if (init?.method === "PATCH") return jsonResponse({ ok: true, request: awaitingRequest });
    return jsonResponse(payload ?? { ok: status < 400, requests }, status);
  });
};

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(AthleteMediaRequestsPage));
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
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("Athlete media requests page", () => {
  it("loads the requests and shows their essential information", async () => {
    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/media-requests", { credentials: "include", cache: "no-store" });
    expect(container.textContent).toContain("Retour de blessure");
    expect(container.textContent).toContain("Interview");
    expect(container.textContent).toContain("Nous souhaitons une interview.");
    expect(container.textContent).toContain("media@example.com");
    expect(container.textContent).toContain("20 septembre 2026");
  });

  it("shows the consent of the signed-in athlete only", async () => {
    setResponses({ requests: [awaitingRequest, acceptedRequest] });
    await mount();

    expect(container.textContent).toContain("En attente de votre réponse");
    expect(container.textContent).toContain("Vous avez accepté");
    expect(container.textContent).not.toContain("athlete-2");
  });

  it("shows the answer buttons only for an awaiting_athlete request", async () => {
    setResponses({ requests: [acceptedRequest] });
    await mount();
    expect(findButton("Accepter")).toBeUndefined();
    expect(findButton("Refuser")).toBeUndefined();

    await act(async () => {
      root.unmount();
    });
    container.remove();

    setResponses({ requests: [awaitingRequest] });
    await mount();
    expect(findButton("Accepter")).toBeDefined();
    expect(findButton("Refuser")).toBeDefined();
  });

  it("sends the exact consent payload for an approval and a refusal", async () => {
    await mount();
    await click(findButton("Accepter"));

    const [url, init] = patchCalls()[0] as [string, RequestInit];
    expect(url).toBe("/api/media-requests");
    expect(init.method).toBe("PATCH");
    expect(init.credentials).toBe("include");
    expect(patchBody()).toEqual({ action: "athlete_consent", requestId: "request-1", consent: "approved" });

    await click(findButton("Refuser"));
    expect(patchBody(1)).toEqual({ action: "athlete_consent", requestId: "request-1", consent: "declined" });
  });

  it("blocks a double submission while the answer is in flight", async () => {
    let releasePatch: (() => void) | null = null;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/clerk/access") return jsonResponse({ ok: true, userAccess: { athleteId: "athlete-1" } });
      if (init?.method === "PATCH") {
        await new Promise<void>((resolve) => {
          releasePatch = resolve;
        });
        return jsonResponse({ ok: true, request: awaitingRequest });
      }
      return jsonResponse({ ok: true, requests: [awaitingRequest] });
    });

    await mount();
    await click(findButton("Accepter"));

    expect(findButton("Envoi…")).toBeDefined();
    expect(findButton("Refuser")?.hasAttribute("disabled")).toBe(true);

    await click(findButton("Refuser"));
    expect(patchCalls()).toHaveLength(1);

    await act(async () => {
      releasePatch?.();
    });
    expect(patchCalls()).toHaveLength(1);
  });

  it("refreshes the request locally and confirms the answer", async () => {
    const updated = {
      ...awaitingRequest,
      status: "accepted",
      athletes: [{ athleteId: "athlete-1", consentStatus: "approved", respondedAt: "2026-09-10T10:00:00.000Z" }],
    };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/clerk/access") return jsonResponse({ ok: true, userAccess: { athleteId: "athlete-1" } });
      if (init?.method === "PATCH") return jsonResponse({ ok: true, request: updated });
      return jsonResponse({ ok: true, requests: [awaitingRequest] });
    });

    await mount();
    await click(findButton("Accepter"));

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Votre accord a été enregistré.");
    expect(container.textContent).toContain("Vous avez accepté");
    expect(container.textContent).toContain("Acceptée");
    expect(findButton("Accepter")).toBeUndefined();
  });

  it("shows the server error and keeps the buttons available", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/clerk/access") return jsonResponse({ ok: true, userAccess: { athleteId: "athlete-1" } });
      if (init?.method === "PATCH") return jsonResponse({ ok: false, message: "Acces refuse." }, 403);
      return jsonResponse({ ok: true, requests: [awaitingRequest] });
    });

    await mount();
    await click(findButton("Accepter"));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Acces refuse.");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(findButton("Accepter")).toBeDefined();
  });

  it("shows the load error when the list cannot be read", async () => {
    setResponses({ payload: { ok: false, message: "Acces refuse." }, status: 403 });
    await mount();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Acces refuse.");
  });

  it("shows the empty state when no request targets the athlete", async () => {
    setResponses({ requests: [] });
    await mount();

    expect(container.textContent).toContain("Aucune demande média ne vous concerne pour le moment.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows the loading state before the requests arrive", async () => {
    let releaseList: (() => void) | null = null;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/clerk/access") return jsonResponse({ ok: true, userAccess: { athleteId: "athlete-1" } });
      await new Promise<void>((resolve) => {
        releaseList = resolve;
      });
      return jsonResponse({ ok: true, requests: [awaitingRequest] });
    });

    await mount();
    expect(container.textContent).toContain("Chargement de vos demandes médias…");

    await act(async () => {
      releaseList?.();
    });
    expect(container.textContent).toContain("Retour de blessure");
  });
});
