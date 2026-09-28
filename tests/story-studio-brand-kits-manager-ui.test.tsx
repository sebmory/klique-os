// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoryStudioBrandKitsManager } from "@/components/contents/story-studio/StoryStudioBrandKitsManager";
import type { StoryStudioBrandKit } from "@/types/story-studio-brand-kit";
import type { StoryStudioPhoto } from "@/types/story-studio-photo";

const defaultKit: StoryStudioBrandKit = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "workspace-1",
  name: "KLIQUE",
  primaryColor: "#000000",
  secondaryColor: "#FFFFFF",
  accentColor: "#F2B800",
  textColor: "#FFFFFF",
  mutedTextColor: "#D9D9D9",
  lightLogoPhotoId: null,
  darkLogoPhotoId: null,
  lightLogoUrl: null,
  darkLogoUrl: null,
  fontFamily: "Georgia",
  signatureMode: "visible",
  isDefault: true,
  createdAt: "2026-09-28T10:00:00.000Z",
  updatedAt: "2026-09-28T10:00:00.000Z",
};

const customKit: StoryStudioBrandKit = {
  ...defaultKit,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Club Nord",
  primaryColor: "#123456",
  fontFamily: "Arial",
  signatureMode: "discreet",
  isDefault: false,
};

const photo: StoryStudioPhoto = {
  id: "33333333-3333-4333-8333-333333333333",
  workspaceId: "workspace-1",
  userId: "user-1",
  mediaId: null,
  athleteId: null,
  blobUrl: "https://studio.public.blob.vercel-storage.com/logo-light.png",
  blobPathname: "story-studio/photos/logo-light.png",
  contentType: "image/png",
  width: 800,
  height: 800,
  sizeBytes: 2048,
  createdAt: "2026-09-28T10:00:00.000Z",
};

const importedPhoto: StoryStudioPhoto = {
  ...photo,
  id: "44444444-4444-4444-8444-444444444444",
  blobUrl: "https://studio.public.blob.vercel-storage.com/logo-imported.png",
};

const jsonResponse = (payload: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
}) as Response;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

let container: HTMLElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

const setControlValue = async (selector: string, value: string) => {
  const control = container.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
  await act(async () => {
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    await flush();
  });
};

beforeEach(async () => {
  vi.clearAllMocks();
  fetchMock = vi.fn((url: string, options?: RequestInit) => {
    if (options?.method === "POST" && url.endsWith("/photos")) {
      return Promise.resolve(jsonResponse({ photo: importedPhoto }, 201));
    }
    if (options?.method === "POST" && url.endsWith("/brand-kits")) {
      const body = JSON.parse(String(options.body));
      return Promise.resolve(jsonResponse({ brandKit: { ...customKit, ...body, id: "55555555-5555-4555-8555-555555555555" } }, 201));
    }
    if (options?.method === "PATCH") {
      const body = JSON.parse(String(options.body));
      return Promise.resolve(jsonResponse({ brandKit: { ...customKit, ...body } }));
    }
    if (url.endsWith("/photos")) return Promise.resolve(jsonResponse({ photos: [photo] }));
    return Promise.resolve(jsonResponse({ brandKits: [defaultKit, customKit] }));
  });
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<StoryStudioBrandKitsManager />);
    await flush();
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Story Studio Brand Kits manager", () => {
  it("lists workspace kits and protects the default KLIQUE name", async () => {
    expect(container.querySelectorAll('nav[aria-label="Brand Kits du workspace"] button')).toHaveLength(2);
    const nameInput = container.querySelector('[aria-label="Nom du Brand Kit"]') as HTMLInputElement;
    expect(nameInput.value).toBe("KLIQUE");
    expect(nameInput.disabled).toBe(true);
    expect(container.textContent).toContain("Le nom KLIQUE est protégé.");

    const clubButton = [...container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Brand Kits du workspace"] button')]
      .find((button) => button.textContent?.includes("Club Nord"));
    await act(async () => clubButton?.click());
    expect(nameInput.value).toBe("Club Nord");
    expect(nameInput.disabled).toBe(false);
  });

  it("creates a complete kit and updates the compact preview", async () => {
    const newButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Nouveau kit"));
    await act(async () => newButton?.click());
    await setControlValue('[aria-label="Nom du Brand Kit"]', "Équipe Sud");
    await setControlValue('[aria-label="Couleur Principale"]', "#224466");
    await setControlValue('[aria-label="Police du Brand Kit"]', "Impact");
    const hiddenMode = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Masquée");
    await act(async () => hiddenMode?.click());

    expect(container.querySelector('[aria-label="Aperçu du Brand Kit"]')?.textContent).toContain("Équipe Sud");
    const createButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Créer le kit"));
    await act(async () => {
      createButton?.click();
      await flush();
    });

    const postCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith("/brand-kits") && (options as RequestInit | undefined)?.method === "POST");
    const body = JSON.parse(String((postCall?.[1] as RequestInit).body));
    expect(body).toMatchObject({ name: "Équipe Sud", primaryColor: "#224466", fontFamily: "Impact", signatureMode: "hidden" });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Brand Kit créé.");
  });

  it("imports a Blob logo, selects it and updates the custom kit", async () => {
    const clubButton = [...container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Brand Kits du workspace"] button')]
      .find((button) => button.textContent?.includes("Club Nord"));
    await act(async () => clubButton?.click());

    const lightLogoInput = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[0];
    Object.defineProperty(lightLogoInput, "files", {
      configurable: true,
      value: [new File(["logo"], "logo.png", { type: "image/png" })],
    });
    await act(async () => {
      lightLogoInput.dispatchEvent(new Event("change", { bubbles: true }));
      await flush();
    });
    expect(container.querySelector(`[aria-label="Logo clair · ${importedPhoto.id}"]`)?.getAttribute("aria-pressed")).toBe("true");

    const saveButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Enregistrer le kit"));
    await act(async () => {
      saveButton?.click();
      await flush();
    });

    const uploadCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith("/photos") && (options as RequestInit | undefined)?.method === "POST");
    expect(uploadCall?.[1]?.body).toBeInstanceOf(FormData);
    const patchCall = fetchMock.mock.calls.find(([, options]) => (options as RequestInit | undefined)?.method === "PATCH");
    expect(JSON.parse(String((patchCall?.[1] as RequestInit).body))).toMatchObject({ lightLogoPhotoId: importedPhoto.id });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Brand Kit enregistré.");
  });
});