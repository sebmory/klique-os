// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClubRosterAdmin } from "@/components/settings/ClubRosterAdmin";

const fetchMock = vi.fn();
const confirmMock = vi.fn();
let container: HTMLElement;
let root: Root;

const teamOne = {
  id: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
  workspaceId: "elfic-fribourg",
  name: "Équipe première",
  season: "2026-2027",
  status: "active",
};

const teamTwo = {
  ...teamOne,
  id: "3a04e11e-4f64-4fa8-833f-87504c850bd1",
  name: "U18",
};

const member = {
  id: "927f53ef-6d5e-46cc-8891-411bd904f4fc",
  workspaceId: "elfic-fribourg",
  teamId: teamOne.id,
  athleteId: "athlete-1",
  athleteName: "Mila Benjak",
  sport: "Basketball",
  joinedOn: "2026-09-15",
};

const availableAthlete = {
  athleteId: "athlete-2",
  name: "Zoé Dupont",
  sport: "Basketball",
  status: "Actif",
};

const clubs = [{ workspaceId: "elfic-fribourg", name: "Elfic Fribourg" }];

const jsonResponse = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
}) as unknown as Response;

const mount = async (clubOptions = clubs) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ClubRosterAdmin clubs={clubOptions} />);
    await Promise.resolve();
    await Promise.resolve();
  });
};

const changeControl = async (name: string, value: string) => {
  const control = container.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
  await act(async () => {
    control.dispatchEvent(new Event("change", { bubbles: true }));
    control.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
};

const click = async (selector: string) => {
  await act(async () => {
    (container.querySelector(selector) as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", confirmMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  container?.remove();
  vi.unstubAllGlobals();
});

describe("Club roster Admin UI", () => {
  it("loads teams, selects the first active team and displays its roster", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne, teamTwo], roster: [], availableAthletes: [] }))
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne, teamTwo], roster: [member], availableAthletes: [availableAthlete] }));

    await mount();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/admin/clubs/roster?workspaceId=elfic-fribourg", {
      credentials: "include",
      cache: "no-store",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/admin/clubs/roster?workspaceId=elfic-fribourg&teamId=${teamOne.id}`,
      { credentials: "include", cache: "no-store" },
    );
    expect((container.querySelector('[name="rosterTeamId"]') as HTMLSelectElement).value).toBe(teamOne.id);
    expect(container.querySelector('[data-roster-member="athlete-1"]')?.textContent).toContain("Mila Benjak");
    expect(container.querySelector('[data-available-athlete="athlete-2"]')?.textContent).toContain("Zoé Dupont");
  });

  it("loads the selected team and filters available KLIQUE Athletes", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne, teamTwo], roster: [], availableAthletes: [] }))
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne, teamTwo], roster: [], availableAthletes: [availableAthlete] }))
      .mockResolvedValueOnce(jsonResponse({
        teams: [teamOne, teamTwo],
        roster: [],
        availableAthletes: [availableAthlete, { ...availableAthlete, athleteId: "athlete-3", name: "Lina Martin", sport: "Volleyball" }],
      }));
    await mount();

    await changeControl("rosterTeamId", teamTwo.id);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/admin/clubs/roster?workspaceId=elfic-fribourg&teamId=${teamTwo.id}`,
      { credentials: "include", cache: "no-store" },
    );

    await changeControl("rosterAthleteSearch", "volley");
    expect(container.querySelector('[data-available-athlete="athlete-2"]')).toBeNull();
    expect(container.querySelector('[data-available-athlete="athlete-3"]')?.textContent).toContain("Lina Martin");
  });

  it("adds an Athlete with the strict payload and refreshes both lists", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne], roster: [], availableAthletes: [] }))
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne], roster: [], availableAthletes: [availableAthlete] }))
      .mockResolvedValueOnce(jsonResponse({ member }, 201))
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne], roster: [{ ...member, athleteId: "athlete-2", athleteName: "Zoé Dupont" }], availableAthletes: [] }));
    await mount();

    await click('[aria-label="Ajouter Zoé Dupont"]');

    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/admin/clubs/roster", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "elfic-fribourg", teamId: teamOne.id, athleteId: "athlete-2" }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(container.querySelector('[data-roster-member="athlete-2"]')?.textContent).toContain("Zoé Dupont");
    expect(container.querySelector('[data-roster-state="success"]')?.textContent).toContain("a été ajouté");
  });

  it("removes an Athlete after confirmation and refreshes both lists", async () => {
    confirmMock.mockReturnValue(true);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne], roster: [], availableAthletes: [] }))
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne], roster: [member], availableAthletes: [] }))
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => null } as Response)
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne], roster: [], availableAthletes: [availableAthlete] }));
    await mount();

    await click('[aria-label="Retirer Mila Benjak"]');

    expect(confirmMock).toHaveBeenCalledWith("Retirer Mila Benjak de Équipe première ?");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/admin/clubs/roster", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "elfic-fribourg", teamId: teamOne.id, athleteId: "athlete-1" }),
    });
    expect(container.querySelector('[data-roster-member="athlete-1"]')).toBeNull();
    expect(container.querySelector('[data-roster-state="success"]')?.textContent).toContain("a été retiré");
  });

  it("does not remove an Athlete when confirmation is cancelled", async () => {
    confirmMock.mockReturnValue(false);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne], roster: [], availableAthletes: [] }))
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne], roster: [member], availableAthletes: [] }));
    await mount();

    await click('[aria-label="Retirer Mila Benjak"]');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-roster-member="athlete-1"]')).not.toBeNull();
  });

  it("shows loading, empty and error states", async () => {
    let resolveTeams: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveTeams = resolve; }));
    await mount([
      ...clubs,
      { workspaceId: "club-b", name: "Club B" },
    ]);
    expect(container.querySelector('[data-roster-state="loading-teams"]')).not.toBeNull();

    await act(async () => {
      resolveTeams?.(jsonResponse({ teams: [], roster: [], availableAthletes: [] }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-roster-empty="teams"]')?.textContent).toContain("Aucune équipe");

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Accès refusé." }, 403));
    await changeControl("rosterWorkspaceId", "club-b");
    expect(container.querySelector('[data-roster-state="error"]')?.textContent).toBe("Accès refusé.");
  });

  it("shows empty roster lists and mutation errors", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne], roster: [], availableAthletes: [] }))
      .mockResolvedValueOnce(jsonResponse({ teams: [teamOne], roster: [], availableAthletes: [availableAthlete] }))
      .mockResolvedValueOnce(jsonResponse({ error: "Cet Athlète est déjà membre." }, 409));
    await mount();

    expect(container.querySelector('[data-roster-empty="members"]')).not.toBeNull();
    await click('[aria-label="Ajouter Zoé Dupont"]');
    expect(container.querySelector('[data-roster-state="error"]')?.textContent).toBe("Cet Athlète est déjà membre.");
  });
});