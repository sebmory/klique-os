// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Athlete } from "@/types/athlete";

vi.mock("next/navigation", () => ({
  usePathname: () => "/crm/personnes",
}));

import { PeopleCrmScreen } from "@/components/crm/PeopleCrmScreen";

const athlete = (key: string, name: string): Athlete => ({
  key,
  name,
  initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2),
  sport: "Athlétisme",
  club: "KLIQUE Club",
  status: "Actif",
  instagram: "",
  phone: "",
  email: `${key}@example.com`,
  nextContact: "",
  notes: "",
  palmares: "",
  objective: "",
  longTerm: "",
  desiredAreas: "",
  lastContact: "",
  nextAction: "",
  followUpNotes: "",
  lastResponseMonthly: "",
  lastResponseWeekly: "",
  lastPublication: "",
  titlesOfMonth: "",
  analysisItems: "",
  plannedContents: "",
  lastPost: "",
  lastStory: "",
  daysWithoutVisibility: 0,
  lastShoot: "",
  media: 0,
  premium: 0,
  coverage: 0,
  tone: "solid",
  heightWeight: "",
  birthDate: "",
  nationality: "",
  position: "",
  competitionPhoto: false,
  adhesionDate: "",
});

const initialAthletes = [athlete("athlete-1", "Aline Martin")];
const refreshedAthletes = [...initialAthletes, athlete("athlete-2", "Benoît Dupont")];
const jsonResponse = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
}) as Response;

let container: HTMLElement;
let root: Root | null = null;
const fetchMock = vi.fn();

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(PeopleCrmScreen));
  });
};

const syncButton = () => [...container.querySelectorAll("button")]
  .find((button) => button.textContent?.includes("Synchroniser les adhésions"));

const clickSync = async () => {
  const button = await vi.waitFor(() => {
    const renderedButton = syncButton();
    expect(renderedButton).toBeDefined();
    return renderedButton;
  });
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({ athletes: initialAthletes, source: "google-sheets" }));
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  vi.unstubAllGlobals();
});

describe("PeopleCrmScreen adhesion synchronization", () => {
  it("never starts synchronization when the athlete list loads", async () => {
    await mount();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/athletes", { cache: "no-store" });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/admin/athletes/sync-adhesions",
      expect.anything(),
    );
  });

  it("disables the button while synchronization is pending", async () => {
    let resolveSync: ((response: Response) => void) | undefined;
    const pendingSync = new Promise<Response>((resolve) => {
      resolveSync = resolve;
    });
    fetchMock.mockImplementation((input: RequestInfo | URL) => String(input).includes("sync-adhesions")
      ? pendingSync
      : Promise.resolve(jsonResponse({ athletes: initialAthletes, source: "google-sheets" })));
    await mount();

    await clickSync();

    const pendingButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Synchronisation"));
    expect(pendingButton?.disabled).toBe(true);

    await act(async () => {
      resolveSync?.(jsonResponse({ ok: true, created: 0, skipped: 1, errors: [] }));
      await pendingSync;
    });
    await vi.waitFor(() => {
      expect(syncButton()?.disabled).toBe(false);
    });
  });

  it("shows the result and reloads the athlete list when records were created", async () => {
    let athleteLoads = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/admin/athletes/sync-adhesions") {
        expect(init).toEqual({ method: "POST", credentials: "include" });
        return Promise.resolve(jsonResponse({
          ok: true,
          created: 1,
          skipped: 2,
          errors: [{ sourceRow: 8, message: "Adresse e-mail invalide." }],
        }));
      }

      athleteLoads += 1;
      return Promise.resolve(jsonResponse({
        athletes: athleteLoads === 1 ? initialAthletes : refreshedAthletes,
        source: "google-sheets",
      }));
    });
    await mount();

    await clickSync();

    expect(athleteLoads).toBe(2);
    expect(container.textContent).toContain("1 créé(s)");
    expect(container.textContent).toContain("2 ignoré(s)");
    expect(container.textContent).toContain("1 erreur(s)");
    expect(container.textContent).toContain("Benoît Dupont");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Ligne 8 : Adresse e-mail invalide.");
  });

  it("does not reload the list when no record was created", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ athletes: initialAthletes, source: "google-sheets" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, created: 0, skipped: 4, errors: [] }));
    await mount();

    await clickSync();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("0 créé(s)");
    expect(container.textContent).toContain("4 ignoré(s)");
  });

  it("renders a failed synchronization as an alert", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ athletes: initialAthletes, source: "google-sheets" }))
      .mockResolvedValueOnce(jsonResponse({ error: "Synchronisation indisponible." }, 500));
    await mount();

    await clickSync();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Synchronisation indisponible.");
    expect(syncButton()?.disabled).toBe(false);
  });
});