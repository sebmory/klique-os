// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));

import { MediaDeskMediaScreen } from "@/components/media-desk/MediaDeskMediaScreen";

const tennisLot = {
  id: "lot-4",
  row: 4,
  date: "18.03.2026",
  athlete: "Loan Cueto",
  sport: "Tennis",
  mediaType: "Photos",
  event: "Portrait KLIQUE",
  place: "Bulle",
  totalFiles: 286,
  orientations: { vertical: 154, horizontal: 132, square: 0 },
  videos: 0,
  rights: "KLIQUE + athlète + médias",
  galleryUrl: "https://klique.photodeck.com/gallery/portrait-klique",
};

const badmintonLot = {
  id: "lot-5",
  row: 5,
  date: "02.08.2026",
  athlete: "Anastacia Fischer",
  sport: "Badminton",
  mediaType: "Photos + vidéos",
  event: "Camp intensif",
  place: "Fribourg",
  totalFiles: 128,
  orientations: { vertical: 0, horizontal: 68, square: 8 },
  videos: 8,
  rights: "Presse suisse",
  galleryUrl: "https://klique.photodeck.com/gallery/camp-intensif",
};

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response;

const bankCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/media-bank");

const setBankResponse = (payload: unknown, status = 200) => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/media-subjects") return jsonResponse({ ok: true, subjects: [] });
    if (url === "/api/media-requests") return jsonResponse({ ok: true, requests: [] });
    return jsonResponse(payload, status);
  });
};

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

// React suit sa propre valeur interne : on passe par le setter natif pour simuler une saisie.
const setFieldValue = async (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const bankPanel = () => container.querySelector('a[href^="https://klique.photodeck.com"]')?.closest("div");

const bankText = () => {
  const panel = [...container.querySelectorAll("div")].find((node) =>
    node.textContent?.includes("Banque d’images") && node.querySelector("select"),
  );
  return panel?.textContent ?? container.textContent ?? "";
};

const bankSearchInput = () =>
  [...container.querySelectorAll("input")].find((input) =>
    input.getAttribute("placeholder")?.includes("un lieu"),
  ) as HTMLInputElement;

const bankSelects = () => {
  const selects = [...container.querySelectorAll("select")];
  return selects.slice(selects.length - 3);
};

beforeEach(() => {
  vi.clearAllMocks();
  setBankResponse({ ok: true, lots: [tennisLot, badmintonLot] });
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

describe("Media bank tab", () => {
  it("never calls the media bank API before the tab is opened", async () => {
    await mount();

    expect(bankCalls()).toHaveLength(0);
    expect(container.querySelector('a[href^="https://klique.photodeck.com"]')).toBeNull();
  });

  it("loads the lots once even after several tab switches", async () => {
    await mount();
    await click(tab("Banque d’images"));
    expect(bankCalls()).toHaveLength(1);
    expect(bankCalls()[0]?.[1]).toMatchObject({ credentials: "include", cache: "no-store" });

    await click(tab("Sujets"));
    await click(tab("Banque d’images"));
    await click(tab("Mes demandes"));
    await click(tab("Banque d’images"));

    expect(bankCalls()).toHaveLength(1);
  });

  it("renders the lot fields and a safe gallery link", async () => {
    await mount();
    await click(tab("Banque d’images"));

    const text = bankText();
    expect(text).toContain("18.03.2026");
    expect(text).toContain("Loan Cueto");
    expect(text).toContain("Portrait KLIQUE");
    expect(text).toContain("Bulle");
    expect(text).toContain("286 fichiers");
    expect(text).toContain("154 V");
    expect(text).toContain("132 H");
    expect(text).toContain("8 vidéos");
    expect(text).toContain("KLIQUE + athlète + médias");

    const link = container.querySelector('a[href="https://klique.photodeck.com/gallery/portrait-klique"]');
    expect(link?.textContent).toContain("Accéder au lot");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(bankPanel()).not.toBeNull();
  });

  it("filters the lots with the search field", async () => {
    await mount();
    await click(tab("Banque d’images"));

    await setFieldValue(bankSearchInput(), "fribourg");
    expect(bankText()).toContain("Camp intensif");
    expect(bankText()).not.toContain("Portrait KLIQUE");

    await setFieldValue(bankSearchInput(), "loan");
    expect(bankText()).toContain("Portrait KLIQUE");
    expect(bankText()).not.toContain("Camp intensif");
  });

  it("filters by sport, media type and orientation", async () => {
    await mount();
    await click(tab("Banque d’images"));

    const [sportSelect, mediaTypeSelect, orientationSelect] = bankSelects();

    await setFieldValue(sportSelect as HTMLSelectElement, "Tennis");
    expect(bankText()).toContain("Portrait KLIQUE");
    expect(bankText()).not.toContain("Camp intensif");

    await setFieldValue(sportSelect as HTMLSelectElement, "all");
    await setFieldValue(mediaTypeSelect as HTMLSelectElement, "Photos + vidéos");
    expect(bankText()).toContain("Camp intensif");
    expect(bankText()).not.toContain("Portrait KLIQUE");

    await setFieldValue(mediaTypeSelect as HTMLSelectElement, "all");
    await setFieldValue(orientationSelect as HTMLSelectElement, "vertical");
    expect(bankText()).toContain("Portrait KLIQUE");
    expect(bankText()).not.toContain("Camp intensif");

    await setFieldValue(orientationSelect as HTMLSelectElement, "video");
    expect(bankText()).toContain("Camp intensif");
    expect(bankText()).not.toContain("Portrait KLIQUE");
  });

  it("shows the empty state when no lot matches", async () => {
    setBankResponse({ ok: true, lots: [] });
    await mount();
    await click(tab("Banque d’images"));

    expect(bankText()).toContain("Aucun lot ne correspond à cette recherche pour le moment.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows the server error returned by the API", async () => {
    setBankResponse({ ok: false, message: "Acces refuse." }, 403);
    await mount();
    await click(tab("Banque d’images"));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Acces refuse.");
    expect(bankText()).not.toContain("Aucun lot ne correspond");
  });

  it("never renders internal fields even when the API returns them", async () => {
    setBankResponse({
      ok: true,
      lots: [
        {
          ...tennisLot,
          notes: "Note interne confidentielle",
          source: "Sébastien Mory",
          premiumRemaining: 4,
          filesUsed: 248,
          favorites: 16,
        },
      ],
    });
    await mount();
    await click(tab("Banque d’images"));

    const text = bankText();
    expect(text).not.toContain("Note interne confidentielle");
    expect(text).not.toContain("Sébastien Mory");
    expect(text).not.toContain("248");
    expect(text).not.toContain("favoris");
  });
});
