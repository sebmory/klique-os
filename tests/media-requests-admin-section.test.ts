// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));

import { MediaRequestsAdminSection } from "@/components/media-desk/MediaRequestsAdminSection";

const submittedRequest = {
  id: "request-1",
  subjectId: "subject-1",
  subjectTitle: "Retour de blessure",
  requestedByClerkUserId: "user_media",
  requesterEmail: "media@example.com",
  mediaId: "media-1",
  requestType: "interview",
  message: "Nous souhaitons une interview.",
  deadline: "2026-09-20",
  status: "submitted",
  adminNote: null,
  athleteIds: ["athlete-1"],
  athletes: [{ athleteId: "athlete-1", consentStatus: "pending", respondedAt: null }],
  createdAt: "2026-09-10T09:00:00.000Z",
  updatedAt: "2026-09-10T09:00:00.000Z",
};

const acceptedRequest = {
  ...submittedRequest,
  id: "request-2",
  subjectId: "subject-2",
  subjectTitle: "Portrait de rentrée",
  requesterEmail: "autre@example.com",
  requestType: "images",
  message: "Nous cherchons des images.",
  deadline: null,
  status: "accepted",
  athleteIds: [],
  athletes: [],
};

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response;

const patchCalls = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");

const patchBody = (index = 0) => JSON.parse(String((patchCalls()[index]?.[1] as RequestInit).body));

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(MediaRequestsAdminSection));
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

// React suit sa propre valeur interne : on passe par le setter natif pour simuler une saisie.
const setFieldValue = async (element: HTMLSelectElement | HTMLTextAreaElement, value: string) => {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const statusSelect = () => container.querySelector("select") as HTMLSelectElement;
const noteField = () => container.querySelector("textarea") as HTMLTextAreaElement;
const saveButton = () =>
  [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.trim().startsWith("Enregistr"),
  ) as HTMLButtonElement;

const setListResponse = (payload: unknown, status = 200) => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return jsonResponse({ ok: true, request: submittedRequest });
    return jsonResponse(payload, status);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  setListResponse({ ok: true, requests: [submittedRequest, acceptedRequest] });
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

describe("MediaRequestsAdminSection", () => {
  it("loads the requests on mount", async () => {
    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/media-requests", {
      credentials: "include",
      cache: "no-store",
    });
    expect(container.textContent).toContain("Demandes reçues");
  });

  it("shows the essential information of a request", async () => {
    await mount();

    expect(container.textContent).toContain("media@example.com");
    expect(container.textContent).toContain("media-1");
    expect(container.textContent).toContain("Interview");
    expect(container.textContent).toContain("Nous souhaitons une interview.");
    expect(container.textContent).toContain("20.09.2026");
    expect(container.textContent).toContain("10.09.2026");
    expect(container.textContent).toContain("athlete-1 (en attente)");
    expect(container.querySelector('a[href="/media-desk/subject-1"]')?.textContent).toContain("Retour de blessure");
  });

  it("filters by status and shows the counters", async () => {
    await mount();

    expect(findButton("Toutes (2)")).toBeDefined();
    expect(findButton("Envoyée (1)")).toBeDefined();
    expect(findButton("Acceptée (1)")).toBeDefined();
    expect(findButton("Refusée (0)")).toBeDefined();

    await click(findButton("Acceptée (1)"));
    expect(container.textContent).toContain("Nous cherchons des images.");
    expect(container.textContent).not.toContain("Nous souhaitons une interview.");

    await click(findButton("Refusée (0)"));
    expect(container.textContent).toContain("Aucune demande dans cette vue pour le moment.");
  });

  it("sends the exact PATCH payload and refreshes the request locally", async () => {
    const updated = { ...submittedRequest, status: "reviewing", adminNote: "Prise en charge" };
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return jsonResponse({ ok: true, request: updated });
      return jsonResponse({ ok: true, requests: [submittedRequest] });
    });

    await mount();
    await setFieldValue(statusSelect(), "reviewing");
    await setFieldValue(noteField(), "  Prise en charge  ");
    await click(saveButton());

    const [url, init] = patchCalls()[0] as [string, RequestInit];
    expect(url).toBe("/api/media-requests");
    expect(init.method).toBe("PATCH");
    expect(init.credentials).toBe("include");
    expect(patchBody()).toEqual({
      requestId: "request-1",
      status: "reviewing",
      adminNote: "Prise en charge",
    });

    expect(container.querySelector('[role="status"]')?.textContent).toContain("En cours d’examen");
    expect(container.textContent).toContain("Envoyée (0)");
    expect(container.textContent).toContain("En cours d’examen (1)");
    expect(noteField().value).toBe("Prise en charge");
    expect(fetchMock.mock.calls.filter(([, requestInit]) => (requestInit as RequestInit | undefined)?.method !== "PATCH")).toHaveLength(1);
  });

  it("blocks the button while the update is in flight", async () => {
    let releasePatch: (() => void) | null = null;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        await new Promise<void>((resolve) => {
          releasePatch = resolve;
        });
        return jsonResponse({ ok: true, request: { ...submittedRequest, status: "reviewing" } });
      }
      return jsonResponse({ ok: true, requests: [submittedRequest] });
    });

    await mount();
    await click(saveButton());

    expect(saveButton().disabled).toBe(true);
    expect(saveButton().textContent).toContain("Enregistrement");

    await click(saveButton());
    expect(patchCalls()).toHaveLength(1);

    await act(async () => {
      releasePatch?.();
    });
    expect(patchCalls()).toHaveLength(1);
    expect(saveButton().disabled).toBe(false);
  });

  it("shows the empty state when no request exists", async () => {
    setListResponse({ ok: true, requests: [] });
    await mount();

    expect(container.textContent).toContain("Aucune demande dans cette vue pour le moment.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows the load error returned by the API", async () => {
    setListResponse({ ok: false, message: "Acces refuse." }, 403);
    await mount();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Acces refuse.");
  });

  it("shows the update error and keeps the request unchanged", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return jsonResponse({ ok: false, message: "Demande introuvable." }, 404);
      return jsonResponse({ ok: true, requests: [submittedRequest] });
    });

    await mount();
    await setFieldValue(statusSelect(), "completed");
    await click(saveButton());

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Demande introuvable.");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toContain("Envoyée (1)");
    expect(statusSelect().value).toBe("completed");
  });
});
