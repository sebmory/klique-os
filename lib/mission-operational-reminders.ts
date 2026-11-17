import { createContentStorageClient } from "@/lib/content-storage/db";

export type MissionOperationalReminderKind = "athlete_j2" | "creative_j1";

export type MissionOperationalReminder = {
  id: string;
  sourceId: string;
  kind: MissionOperationalReminderKind;
  title: string;
  dueAt: string;
  athleteName: string;
  creativeName: string;
  missionTitle: string;
  scheduledAt: string;
  location: string | null;
  confirmedInformation: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  copyMessage: string;
};

export type MissionReminderPlanInput = {
  missionId: string;
  state: string;
  missionTitle: string;
  scheduledAt: string | null;
  location: string | null;
  confirmedInformation: string | null;
  athleteName: string | null;
  creativeName: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("fr-CH", {
  timeZone: "Europe/Zurich",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("fr-CH", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const firstName = (value: string): string => value.trim().split(/\s+/u)[0] ?? value.trim();

const localDateParts = (value: string): { year: number; month: number; day: number } => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
};

const zurichNineUtc = (
  scheduledAt: string,
  daysBefore: number,
): string => {
  const local = localDateParts(scheduledAt);
  const targetCivil = new Date(Date.UTC(local.year, local.month - 1, local.day - daysBefore));
  const year = targetCivil.getUTCFullYear();
  const month = targetCivil.getUTCMonth() + 1;
  const day = targetCivil.getUTCDate();
  let candidate = new Date(Date.UTC(year, month - 1, day, 8));
  const renderedHour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(candidate));
  candidate = new Date(candidate.getTime() + (9 - renderedHour) * 3_600_000);
  return candidate.toISOString();
};

export const buildMissionReminderMessage = (
  reminder: Pick<
    MissionOperationalReminder,
    | "kind"
    | "athleteName"
    | "creativeName"
    | "missionTitle"
    | "scheduledAt"
    | "location"
    | "confirmedInformation"
  >,
): string => {
  const date = dateFormatter.format(new Date(reminder.scheduledAt));
  const time = timeFormatter.format(new Date(reminder.scheduledAt));
  const location = reminder.location?.trim() ? `, à ${reminder.location.trim()}` : "";
  if (reminder.kind === "athlete_j2") {
    return `Salut ${firstName(reminder.athleteName)}, j’espère que tu vas bien ! Petit point avant ${reminder.missionTitle} prévu le ${date} à ${time}${location}. Est-ce que tout est toujours confirmé de ton côté : horaire, lieu et participation ? Dis-moi également s’il y a eu un report, une blessure, une non-sélection ou un autre changement, afin que le photographe ne se déplace pas inutilement. Merci !`;
  }
  const confirmedInformation = reminder.confirmedInformation?.trim()
    ? ` Voici les dernières informations : ${reminder.confirmedInformation.trim()}.`
    : "";
  return `Salut ${firstName(reminder.creativeName)}, la mission concernant ${reminder.athleteName} est confirmée pour le ${date} à ${time}${location}.${confirmedInformation} Dis-moi si tu as encore besoin de quelque chose avant le déplacement.`;
};

export const planMissionOperationalReminders = (
  input: MissionReminderPlanInput,
): MissionOperationalReminder[] => {
  if (
    input.state !== "confirmed"
    || !input.scheduledAt
    || !input.athleteName?.trim()
    || !input.creativeName?.trim()
  ) {
    return [];
  }
  return ([
    { kind: "athlete_j2" as const, daysBefore: 2, title: "Rappel J-2 — Athlète" },
    { kind: "creative_j1" as const, daysBefore: 1, title: "Rappel J-1 — Créatif" },
  ]).map(({ kind, daysBefore, title }) => {
    const reminder = {
      id: `${input.missionId}:${kind}`,
      sourceId: `${input.missionId}:${kind}`,
      kind,
      title,
      dueAt: zurichNineUtc(input.scheduledAt!, daysBefore),
      athleteName: input.athleteName!.trim(),
      creativeName: input.creativeName!.trim(),
      missionTitle: input.missionTitle.trim(),
      scheduledAt: new Date(input.scheduledAt!).toISOString(),
      location: input.location?.trim() || null,
      confirmedInformation: input.confirmedInformation?.trim() || null,
      completedAt: null,
      cancelledAt: null,
      copyMessage: "",
    };
    return { ...reminder, copyMessage: buildMissionReminderMessage(reminder) };
  });
};

export const reconcileMissionOperationalReminders = (
  existing: MissionOperationalReminder[],
  input: MissionReminderPlanInput,
): MissionOperationalReminder[] => {
  const planned = planMissionOperationalReminders(input);
  if (planned.length === 0) {
    return existing.map((reminder) => reminder.completedAt
      ? reminder
      : { ...reminder, cancelledAt: reminder.cancelledAt ?? new Date().toISOString() });
  }
  const plannedByKind = new Map(planned.map((reminder) => [reminder.kind, reminder]));
  const reconciled = existing.map((reminder) => {
    if (reminder.completedAt) return reminder;
    return plannedByKind.get(reminder.kind) ?? reminder;
  });
  for (const reminder of planned) {
    if (!existing.some((candidate) => candidate.kind === reminder.kind)) {
      reconciled.push(reminder);
    }
  }
  return reconciled;
};

type ReminderRow = {
  id: string;
  source_id: string;
  title: string;
  scheduled_for: string | Date;
  completed_at: string | Date | null;
  cancelled_at: string | Date | null;
  metadata: Record<string, unknown>;
};

const mapReminder = (row: ReminderRow): MissionOperationalReminder => {
  const metadata = row.metadata;
  const reminder = {
    id: row.id,
    sourceId: row.source_id,
    kind: String(metadata.kind) as MissionOperationalReminderKind,
    title: row.title,
    dueAt: new Date(row.scheduled_for).toISOString(),
    athleteName: String(metadata.athleteName ?? ""),
    creativeName: String(metadata.creativeName ?? ""),
    missionTitle: String(metadata.missionTitle ?? ""),
    scheduledAt: new Date(String(metadata.scheduledAt)).toISOString(),
    location: typeof metadata.location === "string" && metadata.location.trim()
      ? metadata.location.trim()
      : null,
    confirmedInformation: typeof metadata.confirmedInformation === "string"
      && metadata.confirmedInformation.trim()
      ? metadata.confirmedInformation.trim()
      : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
    copyMessage: "",
  };
  return { ...reminder, copyMessage: buildMissionReminderMessage(reminder) };
};

export const listDueMissionOperationalReminders = async (
  workspaceId: string,
  now = new Date(),
): Promise<MissionOperationalReminder[]> => {
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    SELECT DISTINCT ON (source_id)
      id, source_id, title, scheduled_for, completed_at, cancelled_at, metadata
    FROM notifications
    WHERE workspace_id = $1
      AND source_type = 'creative_mission_reminder'
      AND scheduled_for <= $2::timestamptz
      AND completed_at IS NULL
      AND cancelled_at IS NULL
    ORDER BY source_id, created_at ASC
  `, [workspaceId, now.toISOString()]) as ReminderRow[];
  return rows.map(mapReminder).sort((left, right) => left.dueAt.localeCompare(right.dueAt));
};

export const completeMissionOperationalReminder = async ({
  workspaceId,
  sourceId,
}: {
  workspaceId: string;
  sourceId: string;
}): Promise<boolean> => {
  const normalizedSourceId = sourceId.trim();
  if (!normalizedSourceId) throw new Error("Rappel invalide.");
  const rows = await createContentStorageClient().query(`
    UPDATE notifications
    SET completed_at = COALESCE(completed_at, NOW()),
        read_at = COALESCE(read_at, NOW())
    WHERE workspace_id = $1
      AND source_type = 'creative_mission_reminder'
      AND source_id = $2
      AND completed_at IS NULL
      AND cancelled_at IS NULL
    RETURNING id
  `, [workspaceId, normalizedSourceId]);
  return rows.length > 0;
};
