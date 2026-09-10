// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AthleteMediaBankPage from "@/app/athlete/media-bank/page";

const tennisLot = {
  id: "lot-4",
  date: "18.03.2026",
  sport: "Tennis",
  mediaType: "Photos",
  event: "Portrait KLIQUE",
  place: "Bulle",
  totalFiles: 286,
  orientations: { vertical: 154, horizontal: 132, square: 0 },
  videos: 0,
  galleryUrl: "https://klique.photodeck.com/gallery/portrait-klique",
};

const badmintonLot = {
  id: "lot-5",
  date: "02.08.2026",
  sport: "Badminton",
  mediaType: "Photos + vidéos",
  event: "Camp intensif",
  place: "Fribourg",
  totalFiles: 128,
  orientations: { vertical: 0, horizontal: 68, square: 8 },
  videos: 8,
  galleryUrl: "https://klique.photodeck.com/gallery/camp-intensif",
};

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response;

const setResponse = (payload: unknown, status = 200) => {
  fetchMock.mockImplementation(async () => jsonResponse(payload, status));
};

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(AthleteMediaBankPage));
  });
};

// React suit sa propre valeur interne : on passe par le setter natif pour simuler une saisie.
const setFieldValue = async (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const searchInput = () => container.querySelector('input[type="search"]') as HTMLInputElement;
const selects = () => [...container.querySelectorAll("select")] as HTMLSelectElement[];

beforeEach(() => {
  vi.clearAllMocks();
  setResponse({ ok: true, lots: [tennisLot, badmintonLot] });
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

describe("Athlete media bank page", () => {
  it("loads the lots and renders their fields", async () => {
    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/athlete-media-bank", {
      credentials: "include",
      cache: "no-store",
    });
    expect(container.textContent).toContain("Mes médias");
    expect(container.textContent).toContain("Tennis");
    expect(container.textContent).toContain("Photos");
    expect(container.textContent).toContain("18.03.2026");
    expect(container.textContent).toContain("Portrait KLIQUE");
    expect(container.textContent).toContain("Bulle");
    expect(container.textContent).toContain("286 fichiers");
    expect(container.textContent).toContain("154 V");
    expect(container.textContent).toContain("132 H");
    expect(container.textContent).toContain("8 vidéos");
  });

  it("opens the gallery in a safe new tab", async () => {
    await mount();

    const link = container.querySelector('a[href="https://klique.photodeck.com/gallery/portrait-klique"]');
    expect(link?.textContent).toContain("Accéder à la galerie");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("filters the lots with the search field", async () => {
    await mount();

    await setFieldValue(searchInput(), "fribourg");
    expect(container.textContent).toContain("Camp intensif");
    expect(container.textContent).not.toContain("Portrait KLIQUE");

    await setFieldValue(searchInput(), "portrait");
    expect(container.textContent).toContain("Portrait KLIQUE");
    expect(container.textContent).not.toContain("Camp intensif");
  });

  it("filters by sport and by media type", async () => {
    await mount();
    const [sportSelect, mediaTypeSelect] = selects();

    await setFieldValue(sportSelect, "Tennis");
    expect(container.textContent).toContain("Portrait KLIQUE");
    expect(container.textContent).not.toContain("Camp intensif");

    await setFieldValue(sportSelect, "all");
    await setFieldValue(mediaTypeSelect, "Photos + vidéos");
    expect(container.textContent).toContain("Camp intensif");
    expect(container.textContent).not.toContain("Portrait KLIQUE");
  });

  it("shows the empty state when no lot matches", async () => {
    setResponse({ ok: true, lots: [] });
    await mount();

    expect(container.textContent).toContain("Aucun lot média ne correspond à cette recherche pour le moment.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows the server error", async () => {
    setResponse({ ok: false, message: "Acces refuse." }, 403);
    await mount();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Acces refuse.");
    expect(container.textContent).not.toContain("Aucun lot média ne correspond");
  });

  it("shows the loading state before the lots arrive", async () => {
    let releaseLoad: (() => void) | null = null;
    fetchMock.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        releaseLoad = resolve;
      });
      return jsonResponse({ ok: true, lots: [tennisLot] });
    });

    await mount();
    expect(container.textContent).toContain("Chargement de vos médias…");

    await act(async () => {
      releaseLoad?.();
    });
    expect(container.textContent).toContain("Portrait KLIQUE");
  });
});
