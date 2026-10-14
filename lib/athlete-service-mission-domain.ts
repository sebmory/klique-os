export const missionTypes = ["photo", "video", "photo_video"] as const;
export const missionContexts = [
  "match",
  "competition",
  "training",
  "posed_portraits",
  "event",
  "other",
] as const;
export const missionCompensationTypes = [
  "unpaid_collaboration",
  "expenses_only",
  "paid_mandate",
  "internal_klique",
] as const;
export const missionStatuses = ["draft", "ready", "cancelled"] as const;

export type AthleteServiceMissionType = typeof missionTypes[number];
export type AthleteServiceMissionContext = typeof missionContexts[number];
export type AthleteServiceMissionCompensationType = typeof missionCompensationTypes[number];
export type AthleteServiceMissionStatus = typeof missionStatuses[number];

export type AthleteServiceMissionInput = {
  title: string;
  brief: string;
  sportDiscipline: string;
  missionType: AthleteServiceMissionType;
  missionContext: AthleteServiceMissionContext;
  locationName: string;
  locationDetails: string | null;
  missionDate: string;
  startTime: string | null;
  endTime: string | null;
  deliveryDueDate: string | null;
  deliverables: string;
  compensationType: AthleteServiceMissionCompensationType;
  compensationAmountChfCents: number | null;
  expenseDetails: string | null;
  internalAdminNotes: string | null;
  status: Exclude<AthleteServiceMissionStatus, "cancelled">;
};

export type AthleteServiceMission = Omit<AthleteServiceMissionInput, "status"> & {
  id: string;
  requestId: string;
  referenceCode: string;
  status: AthleteServiceMissionStatus;
  createdByClerkUserId: string;
  updatedByClerkUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type AthleteServiceMissionEvent = {
  id: string;
  action: "created" | "updated" | "cancelled";
  changedFields: string[];
  snapshot: Record<string, unknown>;
  authoredByClerkUserId: string;
  createdAt: string;
};

export type AthleteServiceMissionRecord = {
  requestId: string;
  athleteId: string;
  productName: string;
  assignedCreativeProfileId: string | null;
  mission: AthleteServiceMission | null;
  history: AthleteServiceMissionEvent[];
  creativeResponse?: import("@/lib/creative-missions").CreativeMissionResponse;
  creativeExecution?: import("@/lib/creative-mission-execution").CreativeMissionExecution | null;
};

export class AthleteServiceMissionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AthleteServiceMissionValidationError";
  }
}

const limits = {
  title: 120,
  brief: 5000,
  sportDiscipline: 100,
  locationName: 180,
  locationDetails: 1500,
  deliverables: 3000,
  expenseDetails: 1500,
  internalAdminNotes: 4000,
} as const;

const normalizeText = (
  value: unknown,
  field: keyof typeof limits,
  required: boolean,
): string | null => {
  if (value === null && !required) return null;
  if (typeof value !== "string") {
    throw new AthleteServiceMissionValidationError(`${field} est invalide.`);
  }
  const normalized = value.trim().replace(/\r\n/g, "\n");
  if (required && !normalized) {
    throw new AthleteServiceMissionValidationError(`${field} est requis.`);
  }
  if (normalized.length > limits[field]) {
    throw new AthleteServiceMissionValidationError(`${field} est trop long.`);
  }
  return normalized || null;
};

const normalizeEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T => {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new AthleteServiceMissionValidationError(`${field} est invalide.`);
  }
  return value as T;
};

const normalizeDate = (value: unknown, field: string, required: boolean): string | null => {
  if ((value === null || value === "") && !required) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AthleteServiceMissionValidationError(`${field} doit être une date YYYY-MM-DD.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new AthleteServiceMissionValidationError(`${field} est invalide.`);
  }
  return value;
};

const normalizeTime = (value: unknown, field: string): string | null => {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new AthleteServiceMissionValidationError(`${field} doit être une heure HH:mm.`);
  }
  return value;
};

export const parseAthleteServiceMissionInput = (value: unknown): AthleteServiceMissionInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AthleteServiceMissionValidationError("Fiche mission invalide.");
  }
  const record = value as Record<string, unknown>;
  const allowedFields = new Set([
    "title",
    "brief",
    "sportDiscipline",
    "missionType",
    "missionContext",
    "locationName",
    "locationDetails",
    "missionDate",
    "startTime",
    "endTime",
    "deliveryDueDate",
    "deliverables",
    "compensationType",
    "compensationAmountChfCents",
    "expenseDetails",
    "internalAdminNotes",
    "status",
  ]);
  if (!Object.keys(record).every((field) => allowedFields.has(field))) {
    throw new AthleteServiceMissionValidationError("Fiche mission invalide.");
  }

  const missionDate = normalizeDate(record.missionDate, "missionDate", true)!;
  const deliveryDueDate = normalizeDate(record.deliveryDueDate, "deliveryDueDate", false);
  const startTime = normalizeTime(record.startTime, "startTime");
  const endTime = normalizeTime(record.endTime, "endTime");
  if (endTime && (!startTime || endTime <= startTime)) {
    throw new AthleteServiceMissionValidationError("endTime doit être postérieure à startTime.");
  }
  if (deliveryDueDate && deliveryDueDate < missionDate) {
    throw new AthleteServiceMissionValidationError(
      "deliveryDueDate ne peut pas précéder missionDate.",
    );
  }

  const compensationType = normalizeEnum(
    record.compensationType,
    missionCompensationTypes,
    "compensationType",
  );
  const amount = record.compensationAmountChfCents;
  if (
    compensationType === "paid_mandate"
    && (!Number.isSafeInteger(amount) || Number(amount) <= 0 || Number(amount) > 100_000_000)
  ) {
    throw new AthleteServiceMissionValidationError(
      "compensationAmountChfCents doit être un montant positif en centimes.",
    );
  }
  if (compensationType !== "paid_mandate" && amount !== null) {
    throw new AthleteServiceMissionValidationError(
      "Un montant est autorisé uniquement pour un mandat rémunéré.",
    );
  }

  return {
    title: normalizeText(record.title, "title", true)!,
    brief: normalizeText(record.brief, "brief", true)!,
    sportDiscipline: normalizeText(record.sportDiscipline, "sportDiscipline", true)!,
    missionType: normalizeEnum(record.missionType, missionTypes, "missionType"),
    missionContext: normalizeEnum(record.missionContext, missionContexts, "missionContext"),
    locationName: normalizeText(record.locationName, "locationName", true)!,
    locationDetails: normalizeText(record.locationDetails, "locationDetails", false),
    missionDate,
    startTime,
    endTime,
    deliveryDueDate,
    deliverables: normalizeText(record.deliverables, "deliverables", true)!,
    compensationType,
    compensationAmountChfCents: compensationType === "paid_mandate" ? Number(amount) : null,
    expenseDetails: normalizeText(record.expenseDetails, "expenseDetails", false),
    internalAdminNotes: normalizeText(
      record.internalAdminNotes,
      "internalAdminNotes",
      false,
    ),
    status: normalizeEnum(record.status, ["draft", "ready"] as const, "status"),
  };
};

export const formatMissionDateZurich = (date: string): string => {
  const normalized = normalizeDate(date, "date", true)!;
  const [year, month, day] = normalized.split("-");
  return `${day}.${month}.${year}`;
};

const typeLabels: Record<AthleteServiceMissionType, string> = {
  photo: "Photo",
  video: "Vidéo",
  photo_video: "Photo + vidéo",
};

const compensationLabels: Record<AthleteServiceMissionCompensationType, string> = {
  unpaid_collaboration: "Collaboration non rémunérée",
  expenses_only: "Défraiement uniquement",
  paid_mandate: "Mandat rémunéré",
  internal_klique: "Mission interne KLIQUE",
};

export const buildMissionWhatsAppAnnouncement = (mission: AthleteServiceMission): string => {
  const schedule = mission.startTime
    ? `${mission.startTime}${mission.endTime ? `–${mission.endTime}` : ""}`
    : "horaire à convenir";
  const compensation = mission.compensationType === "paid_mandate"
    ? `${compensationLabels[mission.compensationType]} · CHF ${(mission.compensationAmountChfCents! / 100).toFixed(2)}`
    : compensationLabels[mission.compensationType];
  return [
    `Mission ${typeLabels[mission.missionType]}`,
    `Discipline : ${mission.sportDiscipline}`,
    `Date : ${formatMissionDateZurich(mission.missionDate)} · ${schedule}`,
    `Lieu : ${mission.locationName}`,
    `Livrables : ${mission.deliverables}`,
    `Conditions : ${compensation}`,
    `Référence : ${mission.referenceCode}`,
  ].join("\n");
};
