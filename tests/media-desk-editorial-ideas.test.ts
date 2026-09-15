// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/media-desk/MediaDeskMediaScreen", () => ({
  MediaDeskMediaScreen: () => createElement("div", { "data-testid": "media-portal" }, "Portail Média"),
}));

vi.mock("@/components/media-desk/MediaRequestsAdminSection", () => ({
  MediaRequestsAdminSection: () => null,
}));

import MediaDeskPage from "@/app/media-desk/page";

const IDEA_TITLES = [
  "À 11 ans, Giuliano Muret vise les Mondiaux de wakesurf 2028.",
  "Une nouvelle génération veut bousculer le basket suisse.",
  "Du centre de formation du FC Nantes à un nouveau projet en Suisse.",
  "Armand Angha franchit une nouvelle étape dans sa carrière.",
  "Antoine Majeux, jeune visage du badminton fribourgeois.",
  "Comment les jeunes athlètes apprennent à gérer la pression.",
  "Revenir à la compétition après une blessure.",
  "Dans les coulisses d’un Media Day KLIQUE.",
];

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response;

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(MediaDeskPage));
    await Promise.resolve();
    await Promise.resolve();
  });
};

const click = async (element: Element | undefined) => {
  expect(element).toBeDefined();
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const useIdeaButtons = () =>
  [...container.querySelectorAll("button")].filter((button) => button.textContent?.trim() === "Utiliser cette idée");

const installAccess = (role: "admin" | "media") => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/clerk/access") {
      return jsonResponse({
        permissions: {
          isAdmin: role === "admin",
          isMedia: role === "media",
          isActive: true,
        },
      });
    }
    if (url === "/api/media-subjects" && !init?.method) {
      return jsonResponse({ ok: true, subjects: [] });
    }
    if (url === "/api/athletes") {
      return jsonResponse({
        athletes: [
          { key: "giuliano-muret", name: "Giuliano Muret", sport: "Wakesurf" },
          { key: "armand-angha", name: "Armand Angha", sport: "Football" },
          { key: "antoine-majeux", name: "Antoine Majeux", sport: "Badminton" },
        ],
      });
    }
    return jsonResponse({ ok: false, message: "Unexpected request" }, 500);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

describe("Media Desk editorial ideas", () => {
  it("does not render admin ideas before access is resolved", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    await mount();

    expect(container.textContent).toContain("Chargement du Media Desk");
    expect(container.textContent).not.toContain("Boîte à idées éditoriales");
  });

  it("shows the eight fully described ideas to an active admin", async () => {
    installAccess("admin");
    await mount();

    expect(container.textContent).toContain("Boîte à idées éditoriales");
    expect(useIdeaButtons()).toHaveLength(8);
    for (const title of IDEA_TITLES) expect(container.textContent).toContain(title);
    for (const label of ["Angle journalistique", "Pourquoi maintenant", "Profils concernés", "Formats possibles"]) {
      expect(container.textContent).toContain(label);
    }
  });

  it("prefills the existing composer as a draft without saving or publishing", async () => {
    installAccess("admin");
    await mount();

    await click(useIdeaButtons()[0]);

    expect((container.querySelector('input[placeholder="Titre"]') as HTMLInputElement).value).toBe(IDEA_TITLES[0]);
    expect((container.querySelector('textarea[placeholder="Résumé du sujet"]') as HTMLTextAreaElement).value)
      .toContain("La trajectoire vers 2028 commence aujourd’hui");
    expect((container.querySelector('textarea[placeholder="Angle éditorial proposé"]') as HTMLTextAreaElement).value)
      .toContain("objectif mondial à hauteur d’enfant");
    expect((container.querySelector("select") as HTMLSelectElement).value).toBe("draft");
    expect(container.textContent).toContain("Giuliano Muret");

    const checkedFormats = [...container.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => input.parentElement?.textContent?.trim());
    expect(checkedFormats).toEqual(expect.arrayContaining(["Interview", "Reportage", "Images"]));

    const writes = fetchMock.mock.calls.filter(([, init]) => ["POST", "PATCH", "DELETE"].includes(init?.method ?? ""));
    expect(writes).toHaveLength(0);
    expect(container.textContent).toContain("Créer le sujet");
  });

  it("never renders the editorial ideas in the Media portal", async () => {
    installAccess("media");
    await mount();

    expect(container.querySelector('[data-testid="media-portal"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Boîte à idées éditoriales");
    expect(useIdeaButtons()).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/media-subjects" || url === "/api/athletes")).toBe(false);
  });
});