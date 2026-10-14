import { describe, expect, it, vi } from "vitest";
import {
  buildAdminOperationalCalendar,
  listAdminOperationalCalendar,
  normalizeOperationalCivilDate,
  type AdminOperationalCalendar,
} from "@/lib/admin-operational-calendar";
import type { AdminCreativeMissionListItem } from "@/lib/admin-creative-missions";
import type { MediaDayRecord } from "@/lib/media-days/service";
import type { Shooting } from "@/types/shooting";
import type { ShootingPlanning } from "@/types/planning";
import type { CalendarEvent } from "@/types/calendar";
import { createAdminCalendarHandler } from "@/app/api/admin/calendar/route";

const mission = (
  id: string,
  overrides: Partial<AdminCreativeMissionListItem> = {},
): AdminCreativeMissionListItem => ({
  requestId: id,
  athleteId: `athlete-${id}`,
  reference: `KLIQUE-${id}`,
  title: `Mission ${id}`,
  discipline: "Football",
  missionDate: "2026-10-20",
  deliveryDueDate: "2026-10-22",
  startTime: "14:00",
  locationName: "Lausanne",
  requestStatus: "scheduled",
  preferredDate: null,
  scheduledAt: "2026-10-20T12:00:00.000Z",
  creative: { id: "creative-1", displayName: "Alice Photo" },
  missionStatus: "ready",
  responseStatus: "accepted",
  executionStatus: "in_progress",
  queueStatus: "in_progress",
  nextAction: "Attendre la livraison",
  lastUpdatedAt: "2026-10-10T10:00:00.000Z",
  ...overrides,
});

const mediaDay = (overrides: Partial<MediaDayRecord> = {}): MediaDayRecord => ({
  id: "media-day-1",
  workspaceId: "workspace-a",
  title: "Journée média Basket",
  description: "Privé",
  date: "2026-10-21",
  startTime: "09:30",
  endTime: "17:00",
  location: "Fribourg",
  capacity: 10,
  status: "open",
  athleteIds: ["athlete-1"],
  athletes: [],
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-02T10:00:00.000Z",
  ...overrides,
});

const shooting = (overrides: Partial<Shooting> = {}): Shooting => ({
  row: 12,
  date: "22.10.2026",
  athlete: "Léa Martin",
  sport: "Basketball",
  type: "Portrait",
  place: "Genève",
  objective: "Campagne",
  photographer: "Alice",
  status: "Planifié",
  photos: 0,
  videos: 0,
  lightroomLink: "",
  driveLink: "",
  clientGalleryLink: "",
  instagramLink: "",
  shootingDone: false,
  importDone: false,
  backupDone: false,
  sortDone: false,
  retouchDone: false,
  exportDone: false,
  driveDone: false,
  publishedInstagram: false,
  publishedFacebook: false,
  publishedLinkedIn: false,
  published: false,
  deliverableClub: false,
  deliverableAthlete: false,
  deliverableSponsor: false,
  deliverableMedia: false,
  deliverableAgency: false,
  deliverableOther: false,
  notes: "Ne doit pas sortir",
  ...overrides,
});

const planning = (): ShootingPlanning => ({
  id: "plan-12",
  shootingRow: 12,
  athlete: "Léa Martin",
  sport: "Basketball",
  title: "Portrait Léa",
  date: "2026-10-22",
  shootingTime: "10:30",
  place: "Genève",
  travelMinutes: 0,
  setupMinutes: 0,
  shootingMinutes: 60,
  selectionMinutes: 0,
  editingMinutes: 0,
  exportMinutes: 0,
  uploadMinutes: 0,
  publicationTime: "",
  status: "Planifié",
  notes: "Privé",
  departureDone: false,
  arrivalDone: false,
  setupDone: false,
  shootingDone: false,
  selectionDone: false,
  editingDone: false,
  exportDone: false,
  uploadDone: false,
  publicationDone: false,
});

const calendarEvent = (
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id: "calendar-12",
  source: "shooting",
  title: "Shooting Léa",
  athlete: "Léa Martin",
  date: "2026-10-22",
  time: "10:30",
  place: "Genève",
  status: "Planifié",
  priority: "Haute",
  notes: "Privé",
  shootingRow: 12,
  ...overrides,
});

describe("Admin operational calendar read model", () => {
  it("preserves civil dates and converts actual timestamps in Europe/Zurich", () => {
    expect(normalizeOperationalCivilDate("2026-03-29")).toBe("2026-03-29");
    expect(normalizeOperationalCivilDate("29.03.2026")).toBe("2026-03-29");
    expect(normalizeOperationalCivilDate("2026-03-29T23:30:00.000Z")).toBe("2026-03-30");
    expect(normalizeOperationalCivilDate("31.02.2026")).toBeNull();
  });

  it("composes dated and undated sources, orders them and deduplicates shared shootings", () => {
    const result = buildAdminOperationalCalendar({
      missions: [
        mission("mission-1"),
        mission("request-1", {
          missionStatus: null,
          missionDate: null,
          startTime: null,
          scheduledAt: null,
          preferredDate: null,
          creative: null,
          queueStatus: "to_prepare",
          nextAction: "Préparer la mission",
        }),
      ],
      mediaDays: [mediaDay()],
      shootings: [shooting()],
      planning: [planning()],
      calendarEvents: [
        calendarEvent(),
        calendarEvent({
          id: "manual-1",
          shootingRow: undefined,
          source: "meeting",
          title: "Réunion équipe",
          athlete: "",
          date: "2026-10-19",
          time: "08:00",
        }),
      ],
    });

    expect(result.dated.map((event) => event.id)).toEqual([
      "calendar:manual-1",
      "mission:mission-1",
      "media-day:media-day-1",
      "production:production-12",
    ]);
    expect(result.dated.filter((event) => event.type === "production")).toHaveLength(1);
    expect(result.dated.at(-1)).toMatchObject({
      time: "10:30",
      href: "/production/production-12",
      entityLabel: "Léa Martin",
    });
    expect(result.unscheduled).toEqual([
      expect.objectContaining({
        id: "request:request-1",
        type: "service_request",
        href: "/crm/demandes?tab=services&requestId=request-1",
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("Privé");
  });

  it("keeps only active actionable items in the unscheduled section", () => {
    const result = buildAdminOperationalCalendar({
      missions: [
        mission("active-request", {
          missionStatus: null,
          missionDate: null,
          scheduledAt: null,
          preferredDate: null,
          requestStatus: "received",
        }),
        mission("refused-request", {
          missionStatus: null,
          missionDate: null,
          scheduledAt: null,
          preferredDate: null,
          requestStatus: "refused",
        }),
        mission("completed-mission", {
          missionDate: null,
          scheduledAt: null,
          preferredDate: null,
          missionStatus: "ready",
          queueStatus: "completed",
          executionStatus: "completed",
          nextAction: "Aucune action",
        }),
        mission("cancelled-mission", {
          missionDate: null,
          scheduledAt: null,
          preferredDate: null,
          missionStatus: "cancelled",
          queueStatus: "cancelled",
          nextAction: "Aucune action",
        }),
      ],
      mediaDays: [
        mediaDay({ id: "draft-day", date: null, status: "draft" }),
        mediaDay({ id: "completed-day", date: null, status: "completed" }),
        mediaDay({ id: "cancelled-day", date: null, status: "cancelled" }),
      ],
      shootings: [
        shooting({ row: 20, date: "", status: "Planifié" }),
        shooting({ row: 21, date: "", status: "Terminé" }),
        shooting({ row: 22, date: "", status: "Archivé" }),
        shooting({ row: 23, date: "", status: "Annulé" }),
        shooting({ row: 24, date: "", status: "Planifié", published: true }),
      ],
      planning: [],
      calendarEvents: [],
    });

    expect(result.unscheduled.map((event) => event.id)).toEqual([
      "media-day:draft-day",
      "request:active-request",
      "production:production-20",
    ]);
    const excludedIds = [
      "request:refused-request",
      "mission:completed-mission",
      "mission:cancelled-mission",
      "production:production-21",
      "production:production-22",
      "production:production-23",
      "production:production-24",
    ];
    for (const excludedId of excludedIds) {
      expect(result.unscheduled.map((event) => event.id)).not.toContain(excludedId);
    }
  });

  it("scopes Neon sources to the server workspace and keeps Sheets access read-only", async () => {
    const dependencies = {
      listMissions: vi.fn().mockResolvedValue([]),
      listMediaDays: vi.fn().mockResolvedValue([]),
      listShootings: vi.fn().mockResolvedValue([]),
      listPlanning: vi.fn().mockResolvedValue([]),
      listCalendarEvents: vi.fn().mockResolvedValue([]),
    };

    await expect(listAdminOperationalCalendar({
      clerkUserId: "admin-1",
      workspaceId: "workspace-a",
      dependencies,
    })).resolves.toEqual({ dated: [], unscheduled: [] });
    expect(dependencies.listMissions).toHaveBeenCalledWith({ workspaceId: "workspace-a" });
    expect(dependencies.listMediaDays).toHaveBeenCalledWith({
      clerkUserId: "admin-1",
      workspaceId: "workspace-a",
      role: "admin",
      isAdmin: true,
    });
    expect(dependencies.listShootings).toHaveBeenCalledWith();
  });
});

describe("Admin operational calendar API", () => {
  const emptyCalendar: AdminOperationalCalendar = { dated: [], unscheduled: [] };

  it("requires an active Admin and derives workspace from server access", async () => {
    const listCalendar = vi.fn().mockResolvedValue(emptyCalendar);
    const handler = createAdminCalendarHandler({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: "admin-1",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
      }),
      listCalendar,
    });
    const response = await handler(new Request("http://localhost/api/admin/calendar"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(listCalendar).toHaveBeenCalledWith({
      clerkUserId: "admin-1",
      workspaceId: "workspace-a",
    });
  });

  it.each([
    [null, 401],
    [{ clerkUserId: "athlete-1", role: "athlete", status: "active", workspaceId: "workspace-a" }, 403],
    [{ clerkUserId: "admin-1", role: "admin", status: "inactive", workspaceId: "workspace-a" }, 403],
  ])("rejects unauthorized access %#", async (access, expectedStatus) => {
    const handler = createAdminCalendarHandler({
      getAccess: vi.fn().mockResolvedValue(access),
      listCalendar: vi.fn(),
    });
    expect((await handler(new Request("http://localhost/api/admin/calendar"))).status).toBe(expectedStatus);
  });

  it("rejects browser-supplied workspace filters", async () => {
    const listCalendar = vi.fn();
    const handler = createAdminCalendarHandler({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: "admin-1",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
      }),
      listCalendar,
    });
    const response = await handler(new Request("http://localhost/api/admin/calendar?workspaceId=other"));
    expect(response.status).toBe(400);
    expect(listCalendar).not.toHaveBeenCalled();
  });
});
