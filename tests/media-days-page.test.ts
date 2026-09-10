// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MediaDaysPage from "@/app/media-days/page";
import { mainNavigation } from "@/components/app-shell/data";

const openDay = {
  id: "day-1",
  title: "Media Day Fribourg",
  description: "Journée média KLIQUE",
  date: "2026-10-02",
  startTime: "09:00",
  endTime: "17:00",
  location: "Fribourg",
  capacity: 12,
  status: "open",
  athleteIds: ["athlete-1"],
  athletes: [
    { athleteId: "athlete-1", status: "confirmed", slotStart: "09:30", slotEnd: "10:00", respondedAt: null, adminNote: "Maillot" },
  ],
};

const draftDay = {
  ...openDay,
  id: "day-2",
  title: "Media Day Bulle",
  status: "draft",
  athleteIds: [],
  athletes: [],
};

const athletes = [
  { key: "athlete-1", name: "Loan Cueto", sport: "Tennis" },
  { key: "athlete-2", name: "Mila Benjak", sport: "Basketball" },
];

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root | null = null;

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response;

const setResponses = (options: { mediaDays?: unknown[]; payload?: unknown; status?: number } = {}) => {
  const { mediaDays = [openDay, draftDay], payload, status = 200 } = options;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/athletes") return jsonResponse({ athletes });
    if (init?.method && init.method !== "GET") return jsonResponse({ ok: true });
    return jsonResponse(payload ?? { ok: status < 400, mediaDays }, status);
  });
};

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  const created = createRoot(container);
  root = created;
  await act(async () => {
    created.render(createElement(MediaDaysPage));
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
const setFieldValue = async (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) => {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const labelledControl = (label: string) => {
  const field = [...container.querySelectorAll("label")].find(
    (node) => node.querySelector("span")?.textContent?.trim() === label,
  );
  return field?.querySelector("input, select, textarea") as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
};

const writeCalls = () => fetchMock.mock.calls.filter(([, init]) => Boolean((init as RequestInit | undefined)?.method));

const writeBody = (index = 0) => JSON.parse(String((writeCalls()[index]?.[1] as RequestInit).body));

beforeEach(() => {
  vi.clearAllMocks();
  setResponses();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => {
      current.unmount();
    });
    container.remove();
    root = null;
  }
  vi.unstubAllGlobals();
});

describe("Media Days admin page", () => {
  it("is reachable from the admin navigation", () => {
    expect(mainNavigation.find((item) => item.href === "/media-days")).toMatchObject({ label: "Media Days" });
  });

  it("loads the media days and renders their details", async () => {
    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/media-days", { credentials: "include", cache: "no-store" });
    expect(container.textContent).toContain("Media Day Fribourg");
    expect(container.textContent).toContain("02.10.2026");
    expect(container.textContent).toContain("09:00 – 17:00");
    expect(container.textContent).toContain("Fribourg");
    expect(container.textContent).toContain("12 athlètes");
    expect(container.textContent).toContain("Loan Cueto (confirmé) 09:30–10:00");
  });

  it("filters the media days by status", async () => {
    await mount();

    expect(findButton("Toutes (2)")).toBeDefined();
    await click(findButton("Brouillons (1)"));
    expect(container.textContent).toContain("Media Day Bulle");
    expect(container.textContent).not.toContain("Media Day Fribourg");

    await click(findButton("Annulées (0)"));
    expect(container.textContent).toContain("Aucune journée média dans cette vue pour le moment.");
  });

  it("creates a media day with its athletes, slots and admin notes", async () => {
    await mount();
    await click(findButton("+ Nouvelle journée"));

    await setFieldValue(labelledControl("Titre"), "Media Day Bulle");
    await setFieldValue(labelledControl("Description"), "Shooting collectif");
    await setFieldValue(labelledControl("Date"), "2026-11-05");
    await setFieldValue(labelledControl("Heure de début"), "09:00");
    await setFieldValue(labelledControl("Heure de fin"), "12:00");
    await setFieldValue(labelledControl("Lieu"), "Bulle");
    await setFieldValue(labelledControl("Capacité"), "8");
    await setFieldValue(labelledControl("Statut"), "open");

    await click([...container.querySelectorAll("button")].find((button) => button.textContent?.trim().startsWith("+ Mila Benjak")));
    await setFieldValue(labelledControl("Créneau début"), "10:00");
    await setFieldValue(labelledControl("Créneau fin"), "10:30");
    await setFieldValue(labelledControl("Note admin"), "Prévoir tenue club");

    await click(findButton("Créer la journée"));

    const [url, init] = writeCalls()[0] as [string, RequestInit];
    expect(url).toBe("/api/media-days");
    expect(init.method).toBe("POST");
    expect(writeBody()).toEqual({
      title: "Media Day Bulle",
      description: "Shooting collectif",
      date: "2026-11-05",
      startTime: "09:00",
      endTime: "12:00",
      location: "Bulle",
      capacity: 8,
      status: "open",
      athletes: [{ athleteId: "athlete-2", slotStart: "10:00", slotEnd: "10:30", adminNote: "Prévoir tenue club" }],
    });
  });

  it("refuses an incomplete media day before any call", async () => {
    await mount();
    await click(findButton("+ Nouvelle journée"));
    await click(findButton("Créer la journée"));

    expect(writeCalls()).toHaveLength(0);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Titre, description et date sont obligatoires.",
    );
  });

  it("prefills the composer when editing an existing media day", async () => {
    await mount();
    await click(findButton("Modifier"));

    expect((labelledControl("Titre") as HTMLInputElement).value).toBe("Media Day Fribourg");
    expect((labelledControl("Capacité") as HTMLInputElement).value).toBe("12");
    expect((labelledControl("Créneau début") as HTMLInputElement).value).toBe("09:30");
    expect((labelledControl("Note admin") as HTMLInputElement).value).toBe("Maillot");

    await click(findButton("Enregistrer les modifications"));

    const [, init] = writeCalls()[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(writeBody()).toMatchObject({ mediaDayId: "day-1", title: "Media Day Fribourg", status: "open" });
  });

  it("changes the status with the open, complete and cancel actions", async () => {
    await mount();

    await click(findButton("Terminer"));
    expect(writeBody()).toMatchObject({ mediaDayId: "day-1", status: "completed" });

    await click(findButton("Annuler la journée"));
    expect(writeBody(1)).toMatchObject({ mediaDayId: "day-1", status: "cancelled" });

    await click([...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Ouvrir"));
    expect(writeBody(2)).toMatchObject({ mediaDayId: "day-2", status: "open" });
  });

  it("deletes a media day only after confirmation", async () => {
    const confirmMock = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmMock);

    await mount();
    await click(findButton("Supprimer"));
    expect(writeCalls()).toHaveLength(0);

    confirmMock.mockReturnValue(true);
    await click(findButton("Supprimer"));

    const [url, init] = writeCalls()[0] as [string, RequestInit];
    expect(url).toBe("/api/media-days?mediaDayId=day-1");
    expect(init.method).toBe("DELETE");
  });

  it("shows the loading, error and empty states", async () => {
    let releaseLoad: (() => void) | null = null;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/athletes") return jsonResponse({ athletes });
      await new Promise<void>((resolve) => {
        releaseLoad = resolve;
      });
      return jsonResponse({ ok: true, mediaDays: [] });
    });

    await mount();
    expect(container.textContent).toContain("Chargement des journées média…");

    await act(async () => {
      releaseLoad?.();
    });
    expect(container.textContent).toContain("Aucune journée média dans cette vue pour le moment.");

    const mounted = root;
    await act(async () => {
      mounted?.unmount();
    });
    container.remove();
    root = null;

    setResponses({ payload: { ok: false, message: "Acces refuse." }, status: 403 });
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Acces refuse.");
  });

  it("shows the server error returned by a status change", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/athletes") return jsonResponse({ athletes });
      if (init?.method === "PATCH") return jsonResponse({ ok: false, message: "Journee media introuvable." }, 404);
      return jsonResponse({ ok: true, mediaDays: [openDay] });
    });

    await mount();
    await click(findButton("Terminer"));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Journee media introuvable.");
  });
});
