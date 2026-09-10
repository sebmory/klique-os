// @vitest-environment jsdom
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => createElement("a", null, children as never),
}));

vi.mock("@/components/media-desk/MediaDeskMediaScreen", () => ({
  SubjectCover: () => null,
}));

import { MediaSubjectDetailScreen } from "@/components/media-desk/MediaSubjectDetailScreen";
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

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response;

const postCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/media-requests");

const postBody = (index = 0) => JSON.parse(String((postCalls()[index]?.[1] as RequestInit).body));

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(MediaSubjectDetailScreen, { subjectId: "subject-1" }));
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
const typeInto = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const messageField = () => container.querySelector("textarea") as HTMLTextAreaElement;
const deadlineField = () => container.querySelector('input[type="date"]') as HTMLInputElement;
const athleteCheckbox = () => container.querySelector('input[type="checkbox"]') as HTMLInputElement;
const submitButton = () => container.querySelector('button[type="submit"]') as HTMLButtonElement;

beforeEach(async () => {
  vi.clearAllMocks();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/media-subjects/subject-1") return jsonResponse({ ok: true, subject });
    return jsonResponse({ ok: true, request: { id: "request-1" } }, 201);
  });
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

describe("MediaSubjectDetailScreen request form", () => {
  it("opens the form with the request type of the clicked button", async () => {
    expect(messageField()).toBeNull();

    await click(findButton("Demander une interview"));

    expect(messageField()).not.toBeNull();
    expect(container.textContent).toContain("Demander une interview");
    expect(container.textContent).toContain("Mila Benjak");
    expect(postCalls()).toHaveLength(0);
  });

  it("requires at least one athlete outside an images request", async () => {
    await click(findButton("Demander une interview"));
    await typeInto(messageField(), "Nous souhaitons une interview.");
    await click(submitButton());

    expect(container.textContent).toContain("Sélectionnez au moins un athlète");
    expect(postCalls()).toHaveLength(0);
  });

  it("accepts an images request without any athlete", async () => {
    await click(findButton("Demander des images"));
    await typeInto(messageField(), "Nous cherchons des images.");
    await click(submitButton());

    expect(postCalls()).toHaveLength(1);
    expect(postBody()).toMatchObject({ requestType: "images", athleteIds: [] });
  });

  it("sends the exact payload without any identity field", async () => {
    await click(findButton("Demander une interview"));
    await click(athleteCheckbox());
    await typeInto(messageField(), "  Nous souhaitons une interview.  ");
    await typeInto(deadlineField(), "2026-09-20");
    await click(submitButton());

    const [url, init] = postCalls()[0] as [string, RequestInit];
    expect(url).toBe("/api/media-requests");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(postBody()).toEqual({
      subjectId: "subject-1",
      requestType: "interview",
      message: "Nous souhaitons une interview.",
      deadline: "2026-09-20",
      athleteIds: ["athlete-1"],
    });
    expect(Object.keys(postBody())).not.toContain("requesterEmail");
    expect(Object.keys(postBody())).not.toContain("requestedByClerkUserId");
  });

  it("blocks a double submission while the request is in flight", async () => {
    let releasePost: (() => void) | null = null;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/media-subjects/subject-1") return jsonResponse({ ok: true, subject });
      await new Promise<void>((resolve) => {
        releasePost = resolve;
      });
      return jsonResponse({ ok: true, request: { id: "request-1" } }, 201);
    });

    await click(findButton("Demander des images"));
    await typeInto(messageField(), "Nous cherchons des images.");
    await click(submitButton());

    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toContain("Envoi en cours");

    await click(submitButton());
    expect(postCalls()).toHaveLength(1);

    await act(async () => {
      releasePost?.();
    });
    expect(postCalls()).toHaveLength(1);
  });

  it("shows the server error and keeps the form open", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/media-subjects/subject-1") return jsonResponse({ ok: true, subject });
      return jsonResponse({ ok: false, message: "Acces refuse." }, 403);
    });

    await click(findButton("Demander des images"));
    await typeInto(messageField(), "Nous cherchons des images.");
    await click(submitButton());

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Acces refuse.");
    expect(messageField()).not.toBeNull();
    expect(submitButton().disabled).toBe(false);
  });

  it("shows a success confirmation and closes the form", async () => {
    await click(findButton("Demander des images"));
    await typeInto(messageField(), "Nous cherchons des images.");
    await click(submitButton());

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Demande envoyée");
    expect(messageField()).toBeNull();
  });
});
