// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminMissionsScreen } from "@/components/missions/AdminMissionsScreen";
import {
  planMissionOperationalReminders,
  reconcileMissionOperationalReminders,
} from "@/lib/mission-operational-reminders";

const alanId = "11111111-1111-4111-8111-111111111111";
const unknownId = "22222222-2222-4222-8222-222222222222";
const unavailableId = "33333333-3333-4333-8333-333333333333";
const availabilityRule = (creativeProfileId: string) => ({
  id: `${creativeProfileId.slice(0, -1)}4`,
  creativeProfileId,
  creativeDisplayName: creativeProfileId === alanId ? "Alan Jeanbourquin" : "Créatif indisponible",
  availabilityDate: "2026-12-04",
  startTime: "18:00",
  endTime: "23:30",
  allDay: false,
  recurrence: "none",
  recurrenceUntil: null,
  exceptionDates: [],
  regions: ["Fribourg"],
  missionTypes: ["match_competition"],
  internalComment: null,
  planningTimezone: "Europe/Zurich",
  createdAt: "2026-11-17T14:00:00.000Z",
  updatedAt: "2026-11-17T14:00:00.000Z",
});

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("mission availability and operational reminders", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "44444444-4444-4444-8444-444444444444"),
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("targets Alan for Liban and reconciles both dated reminders and messages", async () => {
    let createdPayload: Record<string, unknown> | null = null;
    const candidates = [{
      id: alanId,
      displayName: "Alan Jeanbourquin",
      creativeType: "photographer",
      coverageAreas: ["Fribourg"],
      specialties: ["Football"],
      generalAvailability: null,
      availabilityRules: [],
      availability: [],
      conflicts: [],
    }, {
      id: unknownId,
      displayName: "Créatif sans disponibilité",
      creativeType: "photographer",
      coverageAreas: ["Fribourg"],
      specialties: ["Football"],
      generalAvailability: null,
      availabilityRules: [],
      availability: [],
      conflicts: [],
    }, {
      id: unavailableId,
      displayName: "Créatif indisponible",
      creativeType: "photographer",
      coverageAreas: ["Fribourg"],
      specialties: ["Football"],
      generalAvailability: null,
      availabilityRules: [],
      availability: [],
      conflicts: [],
    }];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/admin/missions" && init?.method === "POST") {
        createdPayload = JSON.parse(String(init.body));
        return response({ missionId: "55555555-5555-4555-8555-555555555555", outcome: "changed" }, 201);
      }
      if (url === "/api/admin/missions") {
        return response({
          missions: [],
          counts: { to_process: 0, to_organize: 0, in_progress: 0, history: 0 },
          candidates,
        });
      }
      if (url === "/api/athletes") {
        return response({
          athletes: [{ key: "liban-maxamed", name: "Liban Maxamed" }],
          source: "google-sheets",
        });
      }
      if (url.startsWith("/api/admin/creative-availability?")) {
        return response({
          rules: [availabilityRule(alanId), availabilityRule(unavailableId)],
          occurrences: [{
            ruleId: availabilityRule(alanId).id,
            creativeProfileId: alanId,
            creativeDisplayName: "Alan Jeanbourquin",
            date: "2026-12-04",
            startTime: "18:00",
            endTime: "23:30",
            allDay: false,
            regions: ["Fribourg"],
            missionTypes: ["match_competition"],
            internalComment: null,
          }, {
            ruleId: availabilityRule(unavailableId).id,
            creativeProfileId: unavailableId,
            creativeDisplayName: "Créatif indisponible",
            date: "2026-12-04",
            startTime: "09:00",
            endTime: "17:00",
            allDay: false,
            regions: ["Fribourg"],
            missionTypes: ["match_competition"],
            internalComment: null,
          }],
          conflicts: [],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    await act(async () => root.render(<AdminMissionsScreen />));
    await flush();
    const button = (label: string) => [...container.querySelectorAll("button")]
      .find((candidate) => candidate.textContent?.includes(label))!;
    await act(async () => button("Créer une mission").click());

    const setControl = async (label: string, value: string) => {
      const wrapper = [...container.querySelectorAll("label")]
        .find((candidate) => candidate.firstChild?.textContent?.includes(label));
      const control = wrapper?.querySelector("input, select, textarea") as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const prototype = control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : control instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
      await act(async () => control.dispatchEvent(new Event(
        control instanceof HTMLSelectElement ? "change" : "input",
        { bubbles: true },
      )));
    };

    await setControl("Titre", "Match Liban Maxamed");
    await setControl("Type", "match_competition");
    await setControl("Athlètes facultatifs", "liban-maxamed");
    await setControl("Début", "2026-12-04T20:45");
    await setControl("Fin de période", "2026-12-04T22:30");
    await setControl("Lieu", "Stade du Lussy");
    await setControl("Région", "Fribourg");
    await flush();

    const candidateLabels = [...container.querySelectorAll(".admin-mission-form-availability label")];
    expect(candidateLabels.find((label) => label.textContent?.includes("Alan Jeanbourquin"))?.textContent)
      .toContain("Disponible");
    expect(candidateLabels.find((label) => label.textContent?.includes("Créatif indisponible"))?.textContent)
      .toContain("Indisponible");
    expect(candidateLabels.find((label) => label.textContent?.includes("Créatif sans disponibilité"))?.textContent)
      .toContain("Disponibilité non renseignée");
    const alanCheckbox = candidateLabels
      .find((label) => label.textContent?.includes("Alan Jeanbourquin"))
      ?.querySelector("input") as HTMLInputElement;
    const unknownCheckbox = candidateLabels
      .find((label) => label.textContent?.includes("Créatif sans disponibilité"))
      ?.querySelector("input") as HTMLInputElement;
    expect(alanCheckbox.disabled).toBe(false);
    expect(unknownCheckbox.disabled).toBe(true);
    await act(async () => alanCheckbox.click());
    await act(async () => container.querySelector<HTMLFormElement>(".admin-mission-form")!
      .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true })));
    await flush();
    expect(createdPayload).toMatchObject({
      athletes: [{ id: "liban-maxamed", name: "Liban Maxamed" }],
      targetedCreativeProfileIds: [alanId],
    });

    const mission = {
      missionId: "55555555-5555-4555-8555-555555555555",
      state: "confirmed",
      missionTitle: "Match Liban Maxamed",
      scheduledAt: "2026-12-04T19:45:00.000Z",
      location: "Stade du Lussy, Fribourg",
      confirmedInformation: "Rendez-vous à l’entrée principale",
      athleteName: "Liban Maxamed",
      creativeName: "Alan Jeanbourquin",
    };
    const reminders = planMissionOperationalReminders(mission);
    expect(reminders.map((reminder) => reminder.dueAt)).toEqual([
      "2026-12-02T08:00:00.000Z",
      "2026-12-03T08:00:00.000Z",
    ]);
    for (const reminder of reminders) {
      expect(reminder.copyMessage).toContain("Liban Maxamed");
      expect(reminder.copyMessage).toContain("04.12.2026");
      expect(reminder.copyMessage).toContain("20:45");
      expect(reminder.copyMessage).toContain("Stade du Lussy, Fribourg");
      expect(reminder.copyMessage).not.toMatch(/undefined|\{[^}]+\}/);
    }
    expect(reminders[0].copyMessage).toContain("Salut Liban");
    expect(reminders[1].copyMessage).toContain("Salut Alan");

    const rescheduled = reconcileMissionOperationalReminders(reminders, {
      ...mission,
      scheduledAt: "2026-12-06T19:45:00.000Z",
    });
    expect(rescheduled.map((reminder) => reminder.dueAt)).toEqual([
      "2026-12-04T08:00:00.000Z",
      "2026-12-05T08:00:00.000Z",
    ]);
    const completedHistory = {
      ...rescheduled[0],
      completedAt: "2026-12-04T09:05:00.000Z",
    };
    const cancelled = reconcileMissionOperationalReminders(
      [completedHistory, rescheduled[1]],
      { ...mission, state: "cancelled" },
    );
    expect(cancelled.filter((reminder) => !reminder.completedAt && !reminder.cancelledAt))
      .toHaveLength(0);
    expect(cancelled[0]).toMatchObject({
      completedAt: "2026-12-04T09:05:00.000Z",
      cancelledAt: null,
    });

    const migration = readFileSync(
      "db/migrations/20261117_mission_availability_reminders.sql",
      "utf8",
    );
    expect(migration).toContain("source_type = 'creative_mission_reminder'");
    expect(migration).toContain("WHERE notifications.completed_at IS NULL");
    expect(migration).toContain("cancelled_at = COALESCE(cancelled_at, NOW())");
    expect(migration).not.toMatch(/CREATE TABLE|cron/i);
  });
});
