import {
  listAdminCreativeMissions,
  type AdminCreativeMissionListItem,
  type AdminCreativeMissionQueueStatus,
} from "@/lib/admin-creative-missions";
import {
  listMediaDaysReadOnly,
  type MediaDayRecord,
  type MediaDayStatus,
} from "@/lib/media-days/service";
import {
  getCalendarEventsFromGoogleSheets,
  getPlanningFromGoogleSheets,
  getShootingsFromGoogleSheets,
} from "@/lib/google-sheets";
import {
  getProductionWorkflow,
  isProductionClosed,
} from "@/services/production-workflow";
import { mapShootingToProduction } from "@/services/production.service";
import type { CalendarEvent } from "@/types/calendar";
import type { ShootingPlanning } from "@/types/planning";
import type { Shooting } from "@/types/shooting";

export type AdminCalendarEventType =
  | "mission"
  | "service_request"
  | "production"
  | "media_day"
  | "calendar";

export type AdminCalendarEvent = {
  id: string;
  type: AdminCalendarEventType;
  sourceLabel: string;
  title: string;
  date: string | null;
  time: string | null;
  entityLabel: string | null;
  location: string | null;
  status: string;
  nextAction: string | null;
  href: string;
};

export type AdminOperationalCalendar = {
  dated: AdminCalendarEvent[];
  unscheduled: AdminCalendarEvent[];
};

type AdminOperationalCalendarDependencies = {
  listMissions: (input: { workspaceId: string }) => Promise<AdminCreativeMissionListItem[]>;
  listMediaDays: (input: {
    clerkUserId: string;
    workspaceId: string;
    role: "admin";
    isAdmin: true;
  }) => Promise<MediaDayRecord[]>;
  listShootings: () => Promise<Shooting[]>;
  listPlanning: () => Promise<ShootingPlanning[]>;
  listCalendarEvents: () => Promise<CalendarEvent[]>;
};

const defaultDependencies: AdminOperationalCalendarDependencies = {
  listMissions: listAdminCreativeMissions,
  listMediaDays: listMediaDaysReadOnly,
  listShootings: getShootingsFromGoogleSheets,
  listPlanning: getPlanningFromGoogleSheets,
  listCalendarEvents: getCalendarEventsFromGoogleSheets,
};

const queueLabels: Record<AdminCreativeMissionQueueStatus, string> = {
  to_prepare: "À préparer",
  to_assign: "À affecter",
  awaiting_creative: "En attente du créatif",
  in_progress: "En cours",
  delivery_review: "Livraison à vérifier",
  changes_requested: "Modifications demandées",
  completed: "Terminée",
  cancelled: "Annulée",
};

const requestLabels: Record<AdminCreativeMissionListItem["requestStatus"], string> = {
  received: "Reçue",
  to_confirm: "À confirmer",
  scheduled: "Planifiée",
  in_progress: "En cours",
  completed: "Terminée",
  refused: "Refusée",
};

const mediaDayLabels: Record<MediaDayStatus, string> = {
  draft: "Brouillon",
  open: "Ouverte",
  completed: "Terminée",
  cancelled: "Annulée",
};

const isValidCivilDate = (year: number, month: number, day: number): boolean => {
  if (year < 1900 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
};

const civilDate = (year: number, month: number, day: number): string | null => (
  isValidCivilDate(year, month, day)
    ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null
);

const zurichParts = (value: string): { date: string; time: string } | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const date = civilDate(Number(get("year")), Number(get("month")), Number(get("day")));
  return date ? { date, time: `${get("hour")}:${get("minute")}` } : null;
};

export const normalizeOperationalCivilDate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (iso) {
    return civilDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const swiss = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(normalized);
  if (swiss) {
    return civilDate(Number(swiss[3]), Number(swiss[2]), Number(swiss[1]));
  }
  return zurichParts(normalized)?.date ?? null;
};

const normalizeTime = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
};

const requestDeepLink = (requestId: string) =>
  `/crm/demandes?tab=services&requestId=${encodeURIComponent(requestId)}`;

const isMissionOrRequestActionable = (mission: AdminCreativeMissionListItem): boolean => (
  mission.missionStatus !== null
    ? mission.queueStatus !== "completed" && mission.queueStatus !== "cancelled"
    : mission.requestStatus !== "completed" && mission.requestStatus !== "refused"
);

const normalizeLegacyStatus = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase();

const isLegacyStatusClosed = (value: string): boolean => {
  const status = normalizeLegacyStatus(value);
  return status.includes("termine")
    || status.includes("completed")
    || status === "done"
    || status.includes("archive")
    || status.includes("annul")
    || status.includes("cancel")
    || status === "publie"
    || status === "published";
};

const missionEvent = (mission: AdminCreativeMissionListItem): AdminCalendarEvent => {
  const scheduled = mission.scheduledAt ? zurichParts(mission.scheduledAt) : null;
  const date = normalizeOperationalCivilDate(mission.missionDate)
    ?? scheduled?.date
    ?? normalizeOperationalCivilDate(mission.preferredDate);
  const isMission = mission.missionStatus !== null;
  return {
    id: `${isMission ? "mission" : "request"}:${mission.requestId}`,
    type: isMission ? "mission" : "service_request",
    sourceLabel: isMission ? "Mission créative" : "Demande de prestation",
    title: mission.title,
    date,
    time: normalizeTime(mission.startTime) ?? scheduled?.time ?? null,
    entityLabel: mission.creative?.displayName ?? null,
    location: mission.locationName,
    status: isMission ? queueLabels[mission.queueStatus] : requestLabels[mission.requestStatus],
    nextAction: isMission ? mission.nextAction : null,
    href: requestDeepLink(mission.requestId),
  };
};

const mediaDayEvent = (mediaDay: MediaDayRecord): AdminCalendarEvent => ({
  id: `media-day:${mediaDay.id}`,
  type: "media_day",
  sourceLabel: "Journée média",
  title: mediaDay.title,
  date: normalizeOperationalCivilDate(mediaDay.date),
  time: normalizeTime(mediaDay.startTime),
  entityLabel: null,
  location: mediaDay.location,
  status: mediaDayLabels[mediaDay.status],
  nextAction: mediaDay.status === "draft"
    ? "Compléter la journée média"
    : mediaDay.status === "open"
      ? "Suivre les réponses"
      : null,
  href: "/media-days",
});

const buildProductionEvents = ({
  shootings,
  planning,
  calendarEvents,
}: {
  shootings: Shooting[];
  planning: ShootingPlanning[];
  calendarEvents: CalendarEvent[];
}): {
  events: AdminCalendarEvent[];
  actionableUnscheduledIds: Set<string>;
} => {
  const planningByShootingRow = new Map(
    planning
      .filter((item) => item.shootingRow)
      .map((item) => [item.shootingRow as number, item]),
  );
  const calendarByShootingRow = new Map(
    calendarEvents
      .filter((item) => item.shootingRow)
      .map((item) => [item.shootingRow as number, item]),
  );
  const consumedPlanning = new Set<string>();
  const consumedCalendar = new Set<string>();
  const actionableUnscheduledIds = new Set<string>();

  const productionEvents = shootings.map((shooting) => {
    const production = mapShootingToProduction(shooting);
    const linkedPlanning = shooting.row ? planningByShootingRow.get(shooting.row) : undefined;
    const linkedCalendar = shooting.row ? calendarByShootingRow.get(shooting.row) : undefined;
    if (linkedPlanning) consumedPlanning.add(linkedPlanning.id);
    if (linkedCalendar) consumedCalendar.add(linkedCalendar.id);
    const workflow = getProductionWorkflow(production);
    const event = {
      id: `production:${production.id}`,
      type: "production",
      sourceLabel: "Production",
      title: `${production.type} — ${production.athlete}`,
      date: normalizeOperationalCivilDate(production.date)
        ?? normalizeOperationalCivilDate(linkedPlanning?.date)
        ?? normalizeOperationalCivilDate(linkedCalendar?.date),
      time: normalizeTime(linkedPlanning?.shootingTime) ?? normalizeTime(linkedCalendar?.time),
      entityLabel: production.athlete === "—" ? null : production.athlete,
      location: production.lieu === "—" ? null : production.lieu,
      status: workflow.statusLabel,
      nextAction: workflow.nextStep ? `Poursuivre : ${workflow.nextStep.label}` : null,
      href: `/production/${encodeURIComponent(production.id)}`,
    } satisfies AdminCalendarEvent;
    if (!event.date && !isProductionClosed(production, workflow)) {
      actionableUnscheduledIds.add(event.id);
    }
    return event;
  });

  const planningEvents = planning
    .filter((item) => !consumedPlanning.has(item.id))
    .map((item) => {
      const linkedCalendar = item.shootingRow
        ? calendarByShootingRow.get(item.shootingRow)
        : undefined;
      if (linkedCalendar) consumedCalendar.add(linkedCalendar.id);
      const event = {
        id: `planning:${item.id}`,
        type: "production",
        sourceLabel: "Planning",
        title: item.title || `Shooting — ${item.athlete}`,
        date: normalizeOperationalCivilDate(item.date)
          ?? normalizeOperationalCivilDate(linkedCalendar?.date),
        time: normalizeTime(item.shootingTime) ?? normalizeTime(linkedCalendar?.time),
        entityLabel: item.athlete || null,
        location: item.place || linkedCalendar?.place || null,
        status: item.status || linkedCalendar?.status || "Planifié",
        nextAction: null,
        href: item.shootingRow
          ? `/production/production-${item.shootingRow}`
          : "/production",
      } satisfies AdminCalendarEvent;
      if (
        !event.date
        && !item.publicationDone
        && !isLegacyStatusClosed(item.status)
      ) {
        actionableUnscheduledIds.add(event.id);
      }
      return event;
    });

  const standaloneCalendarEvents = calendarEvents
    .filter((item) => !consumedCalendar.has(item.id))
    .map((item) => {
      const event = {
        id: `calendar:${item.id}`,
        type: "calendar" as const,
        sourceLabel: "Calendrier",
        title: item.title || "Événement",
        date: normalizeOperationalCivilDate(item.date),
        time: normalizeTime(item.time),
        entityLabel: item.athlete || null,
        location: item.place || null,
        status: item.status || "Planifié",
        nextAction: null,
        href: item.shootingRow
          ? `/production/production-${item.shootingRow}`
          : "/calendar",
      };
      if (!event.date && !isLegacyStatusClosed(event.status)) {
        actionableUnscheduledIds.add(event.id);
      }
      return event;
    });

  return {
    events: [...productionEvents, ...planningEvents, ...standaloneCalendarEvents],
    actionableUnscheduledIds,
  };
};

export const buildAdminOperationalCalendar = ({
  missions,
  mediaDays,
  shootings,
  planning,
  calendarEvents,
}: {
  missions: AdminCreativeMissionListItem[];
  mediaDays: MediaDayRecord[];
  shootings: Shooting[];
  planning: ShootingPlanning[];
  calendarEvents: CalendarEvent[];
}): AdminOperationalCalendar => {
  const missionEvents = missions.map((mission) => ({
    event: missionEvent(mission),
    actionable: isMissionOrRequestActionable(mission),
  }));
  const mediaDayEvents = mediaDays.map((mediaDay) => ({
    event: mediaDayEvent(mediaDay),
    actionable: mediaDay.status === "draft" || mediaDay.status === "open",
  }));
  const productionResult = buildProductionEvents({ shootings, planning, calendarEvents });
  const events = [
    ...missionEvents.map(({ event }) => event),
    ...mediaDayEvents.map(({ event }) => event),
    ...productionResult.events,
  ];
  const actionableUnscheduledIds = new Set([
    ...missionEvents
      .filter(({ event, actionable }) => !event.date && actionable)
      .map(({ event }) => event.id),
    ...mediaDayEvents
      .filter(({ event, actionable }) => !event.date && actionable)
      .map(({ event }) => event.id),
    ...productionResult.actionableUnscheduledIds,
  ]);
  const byDateThenTime = (left: AdminCalendarEvent, right: AdminCalendarEvent) =>
    (left.date ?? "").localeCompare(right.date ?? "")
    || (left.time ?? "99:99").localeCompare(right.time ?? "99:99")
    || left.title.localeCompare(right.title, "fr");

  return {
    dated: events.filter((event) => event.date !== null).sort(byDateThenTime),
    unscheduled: events
      .filter((event) => event.date === null && actionableUnscheduledIds.has(event.id))
      .sort((left, right) => left.title.localeCompare(right.title, "fr")),
  };
};

export const listAdminOperationalCalendar = async ({
  clerkUserId,
  workspaceId,
  dependencies = defaultDependencies,
}: {
  clerkUserId: string;
  workspaceId: string;
  dependencies?: AdminOperationalCalendarDependencies;
}): Promise<AdminOperationalCalendar> => {
  const normalizedWorkspaceId = workspaceId.trim();
  const normalizedClerkUserId = clerkUserId.trim();
  if (!normalizedWorkspaceId || !normalizedClerkUserId) {
    throw new Error("Contexte Admin incomplet.");
  }
  const [missions, mediaDays, shootings, planning, calendarEvents] = await Promise.all([
    dependencies.listMissions({ workspaceId: normalizedWorkspaceId }),
    dependencies.listMediaDays({
      clerkUserId: normalizedClerkUserId,
      workspaceId: normalizedWorkspaceId,
      role: "admin",
      isAdmin: true,
    }),
    dependencies.listShootings(),
    dependencies.listPlanning(),
    dependencies.listCalendarEvents(),
  ]);
  return buildAdminOperationalCalendar({
    missions,
    mediaDays,
    shootings,
    planning,
    calendarEvents,
  });
};
