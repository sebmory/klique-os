// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@/services/media.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/media.service")>();
  return {
    MediaService: { ...actual.MediaService, create: createMock },
  };
});

import { MediaCenterModule } from "@/components/media/MediaCenterModule";
import type { Athlete } from "@/types/athlete";
import type { MediaLot } from "@/types/media";

const athletes = [
  { key: "athlete-1", name: "Loan Cueto", sport: "Tennis" },
  { key: "athlete-2", name: "Mila Benjak", sport: "Basketball" },
] as unknown as Athlete[];

const onRefresh = vi.fn(async () => {});
let container: HTMLElement;
let root: Root;

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(MediaCenterModule, {
        athletes,
        media: [] as MediaLot[],
        source: "google-sheets" as const,
        message: "",
        onRefresh,
      }),
    );
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
const setInputValue = async (element: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const selectAthletes = async (names: string[]) => {
  for (const name of names) {
    const suggestion = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.trim().startsWith(`+ ${name}`),
    );
    await click(suggestion);
  }
};

const labelledInput = (label: string) => {
  const field = [...container.querySelectorAll("label")].find((node) =>
    node.querySelector("span")?.textContent?.trim() === label,
  );
  return field?.querySelector("input") as HTMLInputElement;
};

const labelledSelect = (label: string) => {
  const field = [...container.querySelectorAll("label")].find((node) =>
    node.querySelector("span")?.textContent?.trim() === label,
  );
  return field?.querySelector("select") as HTMLSelectElement;
};

const setSelectValue = async (element: HTMLSelectElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const openComposer = async () => {
  await mount();
  await click(findButton("+ Ajouter un lot"));
};

const fillRequiredFields = async () => {
  await selectAthletes(["Loan Cueto"]);
  await setInputValue(labelledInput("Date"), "2026-03-18");
  await setInputValue(labelledInput("Événement"), "Portrait KLIQUE");
};

const submit = async () => {
  const form = container.querySelector("form") as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockResolvedValue(undefined);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe("MediaCenterModule creation form", () => {
  it("replaces the Drive field by the PhotoDeck gallery url", async () => {
    await openComposer();

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("Galerie PhotoDeck");
    expect(container.textContent).not.toContain("Lien Google Drive");

    const galleryInput = labelledInput("Galerie PhotoDeck");
    expect(galleryInput.getAttribute("type")).toBe("url");
    expect(galleryInput.getAttribute("placeholder")).toContain("https://");
  });

  it("offers an athlete search with suggestions and chips", async () => {
    await openComposer();

    expect(container.querySelector("select[multiple]")).toBeNull();
    expect(container.textContent).toContain("Aucun athlète associé pour l’instant.");

    const search = container.querySelector('input[placeholder="Rechercher un athlète…"]') as HTMLInputElement;
    expect(search).not.toBeNull();

    await setInputValue(search, "mila");
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    const suggestions = [...dialog.querySelectorAll("button")].filter((button) =>
      button.textContent?.trim().startsWith("+ "),
    );
    expect(suggestions.map((button) => button.textContent?.trim())).toEqual(["+ Mila Benjak · Basketball"]);

    await click(suggestions[0]);
    expect(container.textContent).toContain("Mila Benjak");
    expect(container.querySelector('button[aria-label="Retirer Mila Benjak"]')).not.toBeNull();
    expect((container.querySelector('input[placeholder="Rechercher un athlète…"]') as HTMLInputElement).value).toBe("");
  });

  it("removes an athlete from the chips", async () => {
    await openComposer();
    await selectAthletes(["Loan Cueto", "Mila Benjak"]);

    await click(container.querySelector('button[aria-label="Retirer Loan Cueto"]') ?? undefined);
    await fillRequiredFields();
    await submit();

    expect(createMock.mock.calls[0][0]).toMatchObject({
      athlete: "Mila Benjak, Loan Cueto",
      athleteIds: ["athlete-2", "athlete-1"],
      sport: "Basketball",
    });
  });

  it("refuses a lot without any athlete", async () => {
    await openComposer();
    await setInputValue(labelledInput("Date"), "2026-03-18");
    await setInputValue(labelledInput("Événement"), "Portrait KLIQUE");
    await submit();

    expect(createMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Sélectionnez au moins un athlète.");
  });

  it("sends the selected names, their real ids and the gallery url", async () => {
    await openComposer();
    await selectAthletes(["Loan Cueto", "Mila Benjak"]);
    await setInputValue(labelledInput("Date"), "2026-03-18");
    await setInputValue(labelledInput("Événement"), "Portrait KLIQUE");
    await setInputValue(labelledInput("Galerie PhotoDeck"), "https://klique.photodeck.com/gallery/portrait");
    await submit();

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      athlete: "Loan Cueto, Mila Benjak",
      athleteIds: ["athlete-1", "athlete-2"],
      sport: "Tennis",
      rights: "KLIQUE + athlète",
      galleryUrl: "https://klique.photodeck.com/gallery/portrait",
      driveLink: "https://klique.photodeck.com/gallery/portrait",
      date: "2026-03-18",
      event: "Portrait KLIQUE",
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("refuses a non https gallery url without calling the API", async () => {
    await openComposer();
    await fillRequiredFields();
    await setInputValue(labelledInput("Galerie PhotoDeck"), "http://klique.photodeck.com/gallery/portrait");
    await submit();

    expect(createMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("La galerie PhotoDeck doit être une URL https.");
  });

  it("accepts a lot without any gallery url", async () => {
    await openComposer();
    await fillRequiredFields();
    await submit();

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      athleteIds: ["athlete-1"],
      galleryUrl: "",
      driveLink: "",
    });
  });

  it("offers the two usage rights with KLIQUE + athlete as default", async () => {
    await openComposer();

    const rightsSelect = labelledSelect("Droits d’utilisation");
    expect(rightsSelect.required).toBe(true);
    expect([...rightsSelect.options].map((option) => option.value)).toEqual([
      "KLIQUE + athlète",
      "KLIQUE + athlète + médias",
    ]);
    expect(rightsSelect.value).toBe("KLIQUE + athlète");
  });

  it("sends the selected usage rights", async () => {
    await openComposer();
    await fillRequiredFields();
    await setSelectValue(labelledSelect("Droits d’utilisation"), "KLIQUE + athlète + médias");
    await submit();

    expect(createMock.mock.calls[0][0]).toMatchObject({ rights: "KLIQUE + athlète + médias" });
  });

  it("keeps the other module features untouched", async () => {
    await mount();

    expect(container.textContent).toContain("Media Center");
    expect(container.textContent).toContain("Fichiers disponibles");
    expect(container.textContent).toContain("Premium restants");
    expect(findButton("Réinitialiser")).toBeDefined();
  });
});
