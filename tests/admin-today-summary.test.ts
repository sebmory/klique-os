import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  queryMock,
  applicationSummaryMock,
  sportsCountMock,
  sportsOldestMock,
  athleteMonthReminderMock,
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  applicationSummaryMock: vi.fn(),
  sportsCountMock: vi.fn(),
  sportsOldestMock: vi.fn(),
  athleteMonthReminderMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  getDefaultWorkspaceId: () => "workspace-a",
  createContentStorageClient: () => ({ query: queryMock }),
}));

vi.mock("@/lib/creatives/applications-sheet", () => ({
  summarizeCreativeApplicationsModeration: applicationSummaryMock,
}));

vi.mock("@/lib/sports-watch/repository", () => ({
  PostgresSportsWatchRepository: {
    countCandidates: sportsCountMock,
    getOldestActiveCandidateAt: sportsOldestMock,
  },
}));

vi.mock("@/lib/athlete-month-reminder", () => ({
  loadAthleteMonthReminder: athleteMonthReminderMock,
}));

import {
  getTodayActionsSummary,
  getTodayDeadlines,
} from "@/lib/admin-today-summary";

describe("résumés du cockpit Admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applicationSummaryMock.mockResolvedValue({
      counts: { pending: 3, approved: 4, rejected: 2 },
      oldestPendingAt: "2026-11-01T10:00:00.000Z",
    });
    sportsOldestMock.mockResolvedValue("2026-11-02T10:00:00.000Z");
    sportsCountMock.mockResolvedValue({
      pending: 5,
      validated: 7,
      exploited: 1,
      rejected: 2,
      dismissed: 3,
      superseded: 0,
      supersededPending: 1,
      supersededValidated: 2,
    });
    athleteMonthReminderMock.mockResolvedValue(null);
    queryMock.mockImplementation(async (query: string) => {
      if (query.includes("athlete_service_requests")) {
        return [{ count: 2, oldest_at: "2026-11-03T10:00:00.000Z" }];
      }
      if (query.includes("athlete_session_requests") && !query.includes("UNION ALL")) {
        return [{ count: 4, oldest_at: "2026-11-04T10:00:00.000Z" }];
      }
      if (query.includes("creative_missions") && !query.includes("UNION ALL")) {
        return [{ count: 6, oldest_at: "2026-11-05T10:00:00.000Z" }];
      }
      if (query.includes("contact_requests")) {
        return [{
          awaiting: 2,
          stale: 1,
          reported: 1,
          suspended: 1,
          count: 3,
          oldest_at: "2026-11-06T10:00:00.000Z",
        }];
      }
      if (query.includes("UNION ALL")) {
        return Array.from({ length: 5 }, (_, index) => ({
          id: String(index),
          label: `Échéance ${index}`,
          due_at: new Date(`2026-11-${11 + index}T10:00:00.000Z`),
          kind: index % 2 ? "Mission" : "Séance",
        }));
      }
      return [{ count: 0 }];
    });
  });

  it("retourne les catégories non nulles, les deux totaux Sports Watch et isole le workspace", async () => {
    const result = await getTodayActionsSummary("workspace-a");

    expect(result.errors).toEqual([]);
    expect(result.items.map((item) => item.count)).toEqual([3, 2, 4, 6, 3, 9]);
    expect(result.items.find((item) => item.id === "sports-watch")?.details).toEqual([
      { label: "À examiner", count: 4 },
      { label: "À exploiter", count: 5 },
    ]);
    expect(result.items.every((item) => item.priority && item.oldestAt && item.ageLabel)).toBe(true);
    expect(result.items.find((item) => item.id === "introductions")?.priority).toBe("urgente");
    expect(queryMock.mock.calls.every(([, parameters]) => parameters[0] === "workspace-a")).toBe(true);
    expect(sportsCountMock).toHaveBeenCalledWith("workspace-a");
    expect(sportsOldestMock).toHaveBeenCalledWith("workspace-a");
  });

  it("conserve les autres sources quand Sports Watch échoue", async () => {
    sportsCountMock.mockRejectedValueOnce(new Error("indisponible"));
    const result = await getTodayActionsSummary("workspace-a");

    expect(result.items).toHaveLength(5);
    expect(result.errors).toEqual([{
      source: "Sports Watch",
      message: "Ce résumé est momentanément indisponible.",
    }]);
  });

  it("limite les échéances aux cinq dates fiables renvoyées", async () => {
    const result = await getTodayDeadlines("workspace-a");
    expect(result).toHaveLength(5);
    expect(result.every((item) => item.date.endsWith("Z"))).toBe(true);
    expect(queryMock.mock.calls[0][1]).toEqual(["workspace-a"]);
  });

  it("ajoute au plus une carte de vote et transmet le workspace et la date", async () => {
    athleteMonthReminderMock.mockResolvedValueOnce({
      status: "overdue",
      rewardMonth: 10,
      rewardYear: 2026,
      label: "Annoncer l’Athlète du mois d’octobre",
      timingLabel: "À annoncer avant le 5 novembre",
      priority: "urgente",
      actionCount: 1,
    });
    const now = new Date("2026-11-06T00:00:00.000+01:00");

    const result = await getTodayActionsSummary("workspace-a", now);
    const reminders = result.items.filter((item) => item.id === "athlete-month-vote");

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      count: 1,
      status: "overdue",
      href: "/ai-studio#athlete-of-the-month",
    });
    expect(athleteMonthReminderMock).toHaveBeenCalledWith("workspace-a", now);
  });
});
