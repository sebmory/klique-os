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
  origin: "klique_proposal",
  subjectId: "subject-1",
  title: "Retour de blessure",
  subjectTitle: "Retour de blessure",
  requestType: "interview",
  message: "Nous souhaitons une interview.",
  deadline: "2026-09-20",
  status: "awaiting_athlete",
  createdAt: "2026-09-10T09:00:00.000Z",
};

const freeMediaRequest = {
  id: "request-free-1",
  origin: "free",
  subjectId: null,
  title: "Portrait de la relève",
  subjectTitle: null,
  requestType: "interview",
  message: "Nous préparons un portrait.",
  deadline: null,
  status: "submitted",
  createdAt: "2026-09-15T09:00:00.000Z",
};

const directoryAthlete = {
  athleteId: "aggee-wenzi",
  name: "Aggee Wenzi",
  sport: "Football",
  club: "FC Breitenrain",
  portraitUrl: "",
};

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response;

const requestCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/media-requests");
const athleteCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/media/athletes");

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

const findButton = (label: string) =>
  [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === label);

const typeInto = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const selectOption = async (element: HTMLSelectElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const submitForm = async () => {
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

const fillFreeRequest = async () => {
  await typeInto(container.querySelector("#free-request-title") as HTMLInputElement, "  Portrait de la relève  ");
  await typeInto(container.querySelector("#free-request-message") as HTMLTextAreaElement, "  Nous préparons un portrait.  ");
  await click(container.querySelector('input[type="checkbox"]') ?? undefined);
};

const setRequestsResponse = (payload: unknown, status = 200) => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/media-subjects") return jsonResponse({ ok: true, subjects: [subject] });
    if (url === "/api/media/athletes") return jsonResponse({ athletes: [directoryAthlete], source: "google-sheets" });
    if (url === "/api/media-requests" && init?.method === "POST") {
      return jsonResponse({ ok: true, request: freeMediaRequest }, 201);
    }
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
    expect(container.textContent).toContain("Propositions de sujets KLIQUE");
    expect(container.textContent).toContain("sans engagement pour les médias");
    expect(container.textContent).toContain("transmettez votre propre demande libre");
    expect(container.textContent).toContain("Proposé par KLIQUE");
    expect(container.textContent).toContain("Découvrir le sujet");
    expect(findButton("Faire une demande libre")).toBeDefined();
  });

  it("loads the requests once even after several tab switches", async () => {
    await click(tab("Mes demandes"));
    expect(requestCalls()).toHaveLength(1);

    await click(tab("Propositions KLIQUE"));
    await click(tab("Mes demandes"));
    await click(tab("Propositions KLIQUE"));
    await click(tab("Mes demandes"));

    expect(requestCalls()).toHaveLength(1);
    expect(requestCalls()[0]?.[1]).toMatchObject({ credentials: "include", cache: "no-store" });
  });

  it("shows the request with its french status and a link to the subject", async () => {
    await click(tab("Mes demandes"));

    expect(container.textContent).toContain("Interview");
    expect(container.textContent).toContain("Proposition KLIQUE");
    expect(container.textContent).toContain("En attente de l’athlète");
    expect(container.textContent).toContain("Nous souhaitons une interview.");
    expect(container.textContent).toContain("20.09.2026");
    expect(container.textContent).toContain("10.09.2026");

    const link = container.querySelector('a[href="/media-desk/subject-1"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Retour de blessure");
  });

  it("opens an accessible free-request form and enforces the athlete rule", async () => {
    await click(findButton("Faire une demande libre"));

    expect(athleteCalls()).toHaveLength(1);
    expect(container.querySelector("#free-media-request-form")).not.toBeNull();
    expect(container.textContent).toContain("Aggee Wenzi");

    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await typeInto(container.querySelector("#free-request-title") as HTMLInputElement, "Portrait");
    await typeInto(container.querySelector("#free-request-message") as HTMLTextAreaElement, "Message");
    expect(submit.disabled).toBe(true);

    await selectOption(container.querySelector("#free-request-type") as HTMLSelectElement, "images");
    expect(submit.disabled).toBe(false);

    await selectOption(container.querySelector("#free-request-type") as HTMLSelectElement, "interview");
    expect(submit.disabled).toBe(true);
    await click(container.querySelector('input[type="checkbox"]') ?? undefined);
    expect(submit.disabled).toBe(false);
  });

  it("posts a free request without subjectId and adds it immediately to Mes demandes", async () => {
    await click(findButton("Faire une demande libre"));
    await fillFreeRequest();
    await submitForm();

    const postCall = requestCalls().find(([, init]) => init?.method === "POST");
    expect(postCall).toBeDefined();
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      origin: "free",
      title: "Portrait de la relève",
      requestType: "interview",
      athleteIds: ["aggee-wenzi"],
      message: "Nous préparons un portrait.",
      deadline: null,
    });
    expect(JSON.parse(String(postCall?.[1]?.body))).not.toHaveProperty("subjectId");
    expect(container.textContent).toContain("Votre demande libre a été envoyée.");
    expect(container.textContent).toContain("Demande libre");
    expect(container.textContent).toContain("Portrait de la relève");
    expect(container.querySelector('a[href="/media-desk/null"]')).toBeNull();
  });

  it("announces submission loading and server errors", async () => {
    await click(findButton("Faire une demande libre"));
    await fillFreeRequest();

    let resolvePost: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/media-subjects") return jsonResponse({ ok: true, subjects: [subject] });
      if (url === "/api/media/athletes") return jsonResponse({ athletes: [directoryAthlete] });
      if (url === "/api/media-requests" && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolvePost = resolve;
        });
      }
      return jsonResponse({ ok: true, requests: [mediaRequest] });
    });

    await submitForm();
    expect(container.querySelector('form[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Envoi de la demande");

    await act(async () => {
      resolvePost?.(jsonResponse({ ok: false, message: "Demande refusée." }, 400));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Demande refusée.");
  });

  it("keeps the subjects tab untouched", async () => {
    await click(tab("Mes demandes"));
    await click(tab("Propositions KLIQUE"));

    expect(container.textContent).toContain("Propositions de sujets KLIQUE");
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
    await click(tab("Propositions KLIQUE"));
    await click(tab("Mes demandes"));

    expect(requestCalls()).toHaveLength(2);
    expect(container.textContent).toContain("Nous souhaitons une interview.");
  });
});
