// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));

import { MediaDeskMediaScreen } from "@/components/media-desk/MediaDeskMediaScreen";
import type { MediaSubject } from "@/components/media-desk/media-subject-presentation";

const subject: MediaSubject = {
  id: "subject-1",
  title: "Retour de blessure",
  summary: "Resume du sujet",
  angle: "Angle editorial",
  sport: "Tennis",
  location: "Fribourg",
  date: "2026-09-08",
  coverImageUrl: null,
  availableRequestTypes: ["interview", "images"],
  athleteIds: ["athlete-1"],
  athletes: [{ id: "athlete-1", name: "Mila Benjak" }],
  status: "published",
  publishedAt: "2026-09-08T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

const mediaRequest = {
  id: "request-1",
  subjectId: "subject-1",
  subjectTitle: "Retour de blessure",
  requestType: "interview",
  message: "Nous souhaitons une interview.",
  deadline: "2026-09-20",
  status: "awaiting_athlete",
  createdAt: "2026-09-10T09:00:00.000Z",
};

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response;

const requestCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/media-requests");

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(MediaDeskMediaScreen));
  });
};

const tab = (label: string) =>
  [...container.querySelectorAll('button[role="tab"]')].find((button) => button.textContent?.trim() === label);

const click = async (element: Element | undefined) => {
  expect(element).toBeDefined();
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const setRequestsResponse = (payload: unknown, status = 200) => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/media-subjects") return jsonResponse({ ok: true, subjects: [subject] });
    return jsonResponse(payload, status);
  });
};

beforeEach(async () => {
  vi.clearAllMocks();
  setRequestsResponse({ ok: true, requests: [mediaRequest] });
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await mount();
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("MediaDeskMediaScreen requests tab", () => {
  it("never calls the requests API before the first click on the tab", async () => {
    expect(requestCalls()).toHaveLength(0);
    expect(container.textContent).toContain("Sujets disponibles");
  });

  it("loads the requests once even after several tab switches", async () => {
    await click(tab("Mes demandes"));
    expect(requestCalls()).toHaveLength(1);

    await click(tab("Sujets"));
    await click(tab("Mes demandes"));
    await click(tab("Sujets"));
    await click(tab("Mes demandes"));

    expect(requestCalls()).toHaveLength(1);
    expect(requestCalls()[0]?.[1]).toMatchObject({ credentials: "include", cache: "no-store" });
  });

  it("shows the request with its french status and a link to the subject", async () => {
    await click(tab("Mes demandes"));

    expect(container.textContent).toContain("Interview");
    expect(container.textContent).toContain("En attente de l’athlète");
    expect(container.textContent).toContain("Nous souhaitons une interview.");
    expect(container.textContent).toContain("20.09.2026");
    expect(container.textContent).toContain("10.09.2026");

    const link = container.querySelector('a[href="/media-desk/subject-1"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Retour de blessure");
  });

  it("keeps the subjects tab untouched", async () => {
    await click(tab("Mes demandes"));
    await click(tab("Sujets"));

    expect(container.textContent).toContain("Sujets disponibles");
    expect(container.textContent).toContain("Retour de blessure");
    expect(container.textContent).not.toContain("En attente de l’athlète");
  });

  it("shows an empty state when the media user has no request", async () => {
    setRequestsResponse({ ok: true, requests: [] });

    await click(tab("Mes demandes"));

    expect(container.textContent).toContain("Vous n’avez encore envoyé aucune demande.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows the server error returned by the API", async () => {
    setRequestsResponse({ ok: false, message: "Acces refuse." }, 403);

    await click(tab("Mes demandes"));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Acces refuse.");
    expect(container.textContent).not.toContain("Vous n’avez encore envoyé aucune demande.");
  });

  it("retries the load after a failed attempt", async () => {
    setRequestsResponse({ ok: false, message: "Acces refuse." }, 403);
    await click(tab("Mes demandes"));
    expect(requestCalls()).toHaveLength(1);

    setRequestsResponse({ ok: true, requests: [mediaRequest] });
    await click(tab("Sujets"));
    await click(tab("Mes demandes"));

    expect(requestCalls()).toHaveLength(2);
    expect(container.textContent).toContain("Nous souhaitons une interview.");
  });
});
