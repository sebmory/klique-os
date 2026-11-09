import { createHash, randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { getAthleteServiceRequestCreationContext } from "@/lib/athlete-service-requests";
import { parseCompensation } from "@/lib/production-creative-validation";

export type AthleteSessionRequestType = "match_competition" | "media_day";
export type AthleteSessionRequestStatus =
  | "draft"
  | "submitted"
  | "admin_review"
  | "accepted"
  | "refused"
  | "changes_requested"
  | "production_linked"
  | "proposed_to_creatives"
  | "candidate_received"
  | "assigned"
  | "creative_agreed"
  | "confirmed"
  | "completed"
  | "cancelled";

export type AthleteSessionCommercialMode =
  | "included_right"
  | "paid_extra"
  | "admin_decision";

export type AthleteSessionPeriod = {
  id: string;
  startsAt: string;
  endsAt: string;
  preferenceOrder: number;
  planningTimezone: "Europe/Zurich";
};

export type AthleteSessionEvent = {
  id: string;
  fromStatus: AthleteSessionRequestStatus | null;
  toStatus: AthleteSessionRequestStatus;
  action: string;
  actorRole: "athlete" | "admin" | "creative" | "system";
  details: Record<string, unknown>;
  createdAt: string;
};

export type AthleteSessionRequest = {
  id: string;
  athleteId: string;
  athleteName: string | null;
  requestType: AthleteSessionRequestType;
  workflowStatus: AthleteSessionRequestStatus;
  sport: string | null;
  eventType: string | null;
  eventStartsAt: string | null;
  eventEndsAt: string | null;
  scheduleToConfirm: boolean;
  locationName: string | null;
  region: string;
  clubOrTeam: string | null;
  opponentOrEvent: string | null;
  objective: string;
  deliverables: string;
  practicalInformation: string | null;
  desiredDurationMinutes: number | null;
  constraintsComment: string | null;
  productCode: string | null;
  commercialMode: AthleteSessionCommercialMode;
  snapshotCreditType: "production" | "custom_content" | null;
  snapshotCreditQuantity: number | null;
  snapshotPriceChf: number | null;
  adminReason: string | null;
  athleteComplement: string | null;
  productionBriefId: string | null;
  productionStatus: "draft" | "published" | "assigned" | "cancelled" | null;
  assignedCreativeProfileId: string | null;
  assignedCreativeName: string | null;
  creativeConfirmationStatus: "pending" | "confirmed" | "confirmation_required" | null;
  applications: Array<{
    creativeProfileId: string;
    displayName: string;
    status: "interested" | "withdrawn" | "selected" | "not_selected";
    message: string | null;
  }>;
  finalConfirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  periods: AthleteSessionPeriod[];
  events: AthleteSessionEvent[];
  nextAction: string;
};

export type AthleteSessionRequestInput = {
  idempotencyKey: string;
  requestType: AthleteSessionRequestType;
  sport: string | null;
  eventType: string | null;
  eventStartsAt: string | null;
  eventEndsAt: string | null;
  scheduleToConfirm: boolean;
  locationName: string | null;
  region: string;
  clubOrTeam: string | null;
  opponentOrEvent: string | null;
  objective: string;
  deliverables: string;
  practicalInformation: string | null;
  desiredDurationMinutes: number | null;
  constraintsComment: string | null;
  periods: Array<{ startsAt: string; endsAt: string; preferenceOrder: number }>;
};

type RequestRow = {
  id: string;
  athlete_id: string;
  request_type: AthleteSessionRequestType;
  workflow_status: AthleteSessionRequestStatus;
  sport: string | null;
  event_type: string | null;
  event_starts_at: string | Date | null;
  event_ends_at: string | Date | null;
  schedule_to_confirm: boolean;
  location_name: string | null;
  region: string;
  club_or_team: string | null;
  opponent_or_event: string | null;
  objective: string;
  deliverables: string;
  practical_information: string | null;
  desired_duration_minutes: number | string | null;
  constraints_comment: string | null;
  product_code: string | null;
  commercial_mode: AthleteSessionCommercialMode;
  snapshot_credit_type: "production" | "custom_content" | null;
  snapshot_credit_quantity: number | string | null;
  snapshot_price_chf: number | string | null;
  admin_reason: string | null;
  athlete_complement: string | null;
  production_brief_id: string | null;
  production_status: AthleteSessionRequest["productionStatus"];
  assigned_creative_profile_id: string | null;
  assigned_creative_name: string | null;
  creative_confirmation_status: AthleteSessionRequest["creativeConfirmationStatus"];
  applications: AthleteSessionRequest["applications"];
  final_confirmed_at: string | Date | null;
  cancelled_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  periods: AthleteSessionPeriod[];
  events: Array<{
    id: string;
    fromStatus: AthleteSessionRequestStatus | null;
    toStatus: AthleteSessionRequestStatus;
    action: string;
    actorRole: AthleteSessionEvent["actorRole"];
    details: Record<string, unknown>;
    createdAt: string;
  }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const text = (value: unknown, field: string, max = 2000): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`${field} invalide.`);
  }
  return value.trim();
};

const nullableText = (value: unknown, max = 2000): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new Error("Champ invalide.");
  }
  return value.trim() || null;
};

const isCivilDate = (value: string): boolean => {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};

const zurichFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zurich",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const zonedParts = (timestamp: number) => {
  const parts = zurichFormatter.formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
};

export const zurichLocalDateTimeToIso = (date: string, time: string): string => {
  if (!isCivilDate(date) || !timePattern.test(time)) throw new Error("Date ou horaire invalide.");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const expectedAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = expectedAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = zonedParts(guess);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    guess += expectedAsUtc - actualAsUtc;
  }
  const verified = zonedParts(guess);
  if (
    verified.year !== year
    || verified.month !== month
    || verified.day !== day
    || verified.hour !== hour
    || verified.minute !== minute
  ) {
    throw new Error("Cet horaire n’existe pas dans le fuseau Europe/Zurich.");
  }
  return new Date(guess).toISOString();
};

const parseLocalPeriod = (value: unknown, preferenceOrder: number) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Période souhaitée invalide.");
  }
  const period = value as Record<string, unknown>;
  if (!Object.keys(period).every((key) => ["date", "startTime", "endTime"].includes(key))) {
    throw new Error("Période souhaitée invalide.");
  }
  const date = String(period.date ?? "").trim();
  const startTime = String(period.startTime ?? "").trim();
  const endTime = String(period.endTime ?? "").trim();
  const startsAt = zurichLocalDateTimeToIso(date, startTime);
  const endsAt = zurichLocalDateTimeToIso(date, endTime);
  if (endsAt <= startsAt) throw new Error("La fin doit être postérieure au début.");
  return { startsAt, endsAt, preferenceOrder };
};

export const parseAthleteSessionRequestInput = (value: unknown): AthleteSessionRequestInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Requête invalide.");
  }
  const input = value as Record<string, unknown>;
  const allowed = [
    "idempotencyKey",
    "requestType",
    "sport",
    "eventType",
    "date",
    "startTime",
    "endTime",
    "scheduleToConfirm",
    "locationName",
    "region",
    "clubOrTeam",
    "opponentOrEvent",
    "objective",
    "deliverables",
    "practicalInformation",
    "desiredDurationMinutes",
    "constraintsComment",
    "periods",
  ];
  if (!Object.keys(input).every((key) => allowed.includes(key))) {
    throw new Error("Requête invalide.");
  }
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  if (!uuidPattern.test(idempotencyKey)) throw new Error("Clé d’envoi invalide.");
  const requestType = input.requestType === "match_competition" || input.requestType === "media_day"
    ? input.requestType
    : null;
  if (!requestType) throw new Error("Type de demande invalide.");
  const common = {
    idempotencyKey,
    requestType: requestType as AthleteSessionRequestType,
    locationName: nullableText(input.locationName, 500),
    region: text(input.region, "Région", 200),
    objective: text(input.objective, "Objectif", 2000),
    deliverables: text(input.deliverables, "Livrables", 2000),
    practicalInformation: nullableText(input.practicalInformation, 2000),
    constraintsComment: nullableText(input.constraintsComment, 2000),
  };
  if (requestType === "match_competition") {
    const date = String(input.date ?? "").trim();
    const startTime = String(input.startTime ?? "").trim();
    const endTime = String(input.endTime ?? "").trim();
    const eventStartsAt = zurichLocalDateTimeToIso(date, startTime);
    const eventEndsAt = zurichLocalDateTimeToIso(date, endTime);
    if (eventEndsAt <= eventStartsAt) throw new Error("La fin doit être postérieure au début.");
    return {
      ...common,
      sport: text(input.sport, "Sport", 200),
      eventType: text(input.eventType, "Type d’événement", 200),
      eventStartsAt,
      eventEndsAt,
      scheduleToConfirm: input.scheduleToConfirm === true,
      clubOrTeam: nullableText(input.clubOrTeam, 300),
      opponentOrEvent: nullableText(input.opponentOrEvent, 500),
      desiredDurationMinutes: null,
      periods: [],
    };
  }
  const duration = Number(input.desiredDurationMinutes);
  if (!Number.isInteger(duration) || duration < 30 || duration > 720) {
    throw new Error("La durée souhaitée doit être comprise entre 30 minutes et 12 heures.");
  }
  if (!Array.isArray(input.periods) || input.periods.length < 2 || input.periods.length > 10) {
    throw new Error("Proposez au moins deux dates ou périodes.");
  }
  const periods = input.periods.map((period, index) => parseLocalPeriod(period, index + 1));
  if (new Set(periods.map((period) => `${period.startsAt}/${period.endsAt}`)).size !== periods.length) {
    throw new Error("Les périodes proposées doivent être distinctes.");
  }
  return {
    ...common,
    sport: null,
    eventType: null,
    eventStartsAt: null,
    eventEndsAt: null,
    scheduleToConfirm: false,
    clubOrTeam: null,
    opponentOrEvent: null,
    desiredDurationMinutes: duration,
    periods,
  };
};

const nextActionByStatus: Record<AthleteSessionRequestStatus, string> = {
  draft: "Compléter et envoyer la demande",
  submitted: "KLIQUE doit examiner la demande",
  admin_review: "Revue en cours par KLIQUE",
  accepted: "KLIQUE doit préparer la proposition Production",
  refused: "Consulter le motif",
  changes_requested: "Répondre à la demande de complément",
  production_linked: "KLIQUE prépare la proposition aux créatifs",
  proposed_to_creatives: "Attendre les réponses des créatifs",
  candidate_received: "KLIQUE étudie les candidatures",
  assigned: "Le créatif doit accepter les conditions",
  creative_agreed: "KLIQUE doit confirmer définitivement la séance",
  confirmed: "La séance est confirmée",
  completed: "La mission est terminée",
  cancelled: "Demande annulée",
};

const mapRequest = (row: RequestRow, athleteName: string | null = null): AthleteSessionRequest => ({
  id: row.id,
  athleteId: row.athlete_id,
  athleteName,
  requestType: row.request_type,
  workflowStatus: row.workflow_status,
  sport: row.sport,
  eventType: row.event_type,
  eventStartsAt: row.event_starts_at ? new Date(row.event_starts_at).toISOString() : null,
  eventEndsAt: row.event_ends_at ? new Date(row.event_ends_at).toISOString() : null,
  scheduleToConfirm: row.schedule_to_confirm,
  locationName: row.location_name,
  region: row.region,
  clubOrTeam: row.club_or_team,
  opponentOrEvent: row.opponent_or_event,
  objective: row.objective,
  deliverables: row.deliverables,
  practicalInformation: row.practical_information,
  desiredDurationMinutes: row.desired_duration_minutes === null ? null : Number(row.desired_duration_minutes),
  constraintsComment: row.constraints_comment,
  productCode: row.product_code,
  commercialMode: row.commercial_mode,
  snapshotCreditType: row.snapshot_credit_type,
  snapshotCreditQuantity: row.snapshot_credit_quantity === null
    ? null
    : Number(row.snapshot_credit_quantity),
  snapshotPriceChf: row.snapshot_price_chf === null ? null : Number(row.snapshot_price_chf),
  adminReason: row.admin_reason,
  athleteComplement: row.athlete_complement,
  productionBriefId: row.production_brief_id,
  productionStatus: row.production_status,
  assignedCreativeProfileId: row.assigned_creative_profile_id,
  assignedCreativeName: row.assigned_creative_name,
  creativeConfirmationStatus: row.creative_confirmation_status,
  applications: Array.isArray(row.applications) ? row.applications : [],
  finalConfirmedAt: row.final_confirmed_at ? new Date(row.final_confirmed_at).toISOString() : null,
  cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
  periods: Array.isArray(row.periods) ? row.periods : [],
  events: Array.isArray(row.events) ? row.events : [],
  nextAction: nextActionByStatus[row.workflow_status],
});

const requestSelect = `
  SELECT request.*,
         brief.status AS production_status,
         brief.assigned_creative_profile_id,
         creative.display_name AS assigned_creative_name,
         assignment.confirmation_status AS creative_confirmation_status,
         COALESCE(applications.items, '[]'::jsonb) AS applications,
         COALESCE(periods.items, '[]'::jsonb) AS periods,
         COALESCE(events.items, '[]'::jsonb) AS events
  FROM athlete_session_requests request
  LEFT JOIN production_creative_briefs brief
    ON brief.workspace_id = request.workspace_id
   AND brief.id = request.production_brief_id
  LEFT JOIN creative_profiles creative
    ON creative.workspace_id = brief.workspace_id
   AND creative.id = brief.assigned_creative_profile_id
  LEFT JOIN production_creative_assignments assignment
    ON assignment.workspace_id = brief.workspace_id
   AND assignment.brief_id = brief.id
   AND assignment.status = 'active'
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'creativeProfileId', application.creative_profile_id,
      'displayName', profile.display_name,
      'status', application.status,
      'message', application.message
    ) ORDER BY application.updated_at DESC) AS items
    FROM production_creative_applications application
    JOIN creative_profiles profile
      ON profile.workspace_id = application.workspace_id
     AND profile.id = application.creative_profile_id
    WHERE application.workspace_id = request.workspace_id
      AND application.brief_id = request.production_brief_id
  ) applications ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', period.id,
      'startsAt', period.starts_at,
      'endsAt', period.ends_at,
      'preferenceOrder', period.preference_order,
      'planningTimezone', period.planning_timezone
    ) ORDER BY period.preference_order) AS items
    FROM athlete_session_request_periods period
    WHERE period.workspace_id = request.workspace_id
      AND period.request_id = request.id
  ) periods ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', event.id,
      'fromStatus', event.from_status,
      'toStatus', event.to_status,
      'action', event.action,
      'actorRole', event.actor_role,
      'details', event.details,
      'createdAt', event.created_at
    ) ORDER BY event.created_at, event.id) AS items
    FROM athlete_session_request_events event
    WHERE event.workspace_id = request.workspace_id
      AND event.request_id = request.id
  ) events ON TRUE
`;

const loadCommercialDecision = async (
  workspaceId: string,
  athleteId: string,
  requestType: AthleteSessionRequestType,
): Promise<{
  productCode: string | null;
  commercialMode: AthleteSessionCommercialMode;
  creditType: "production" | null;
  creditQuantity: number | null;
  priceChf: number | null;
}> => {
  if (requestType === "media_day") {
    return {
      productCode: null,
      commercialMode: "admin_decision",
      creditType: null,
      creditQuantity: null,
      priceChf: null,
    };
  }
  const productCode = "match_coverage_individual";
  const context = await getAthleteServiceRequestCreationContext(
    workspaceId,
    athleteId,
    productCode,
  );
  const product = context.product;
  const planAllowed = Boolean(
    product
    && context.membershipActive
    && (!product.allowedPlanCodes || (context.plan && product.allowedPlanCodes.includes(context.plan.code))),
  );
  if (!product || !planAllowed) {
    return {
      productCode: product?.code ?? null,
      commercialMode: "admin_decision",
      creditType: null,
      creditQuantity: null,
      priceChf: null,
    };
  }
  const required = product.requiredProductionCredits;
  const available = Math.max(0, context.balance.production - context.reserved.production);
  if (required > 0 && available >= required) {
    return {
      productCode,
      commercialMode: "included_right",
      creditType: "production",
      creditQuantity: required,
      priceChf: null,
    };
  }
  if (product.priceChf > 0) {
    return {
      productCode,
      commercialMode: "paid_extra",
      creditType: null,
      creditQuantity: null,
      priceChf: product.priceChf,
    };
  }
  return {
    productCode,
    commercialMode: "admin_decision",
    creditType: null,
    creditQuantity: null,
    priceChf: null,
  };
};

export const listAthleteSessionRequests = async ({
  workspaceId,
  athleteId,
  clerkUserId,
}: {
  workspaceId: string;
  athleteId: string;
  clerkUserId: string;
}): Promise<AthleteSessionRequest[]> => {
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    ${requestSelect}
    WHERE request.workspace_id = $1
      AND request.athlete_id = $2
      AND request.athlete_clerk_user_id = $3
    ORDER BY request.created_at DESC
  `, [workspaceId, athleteId, clerkUserId]) as RequestRow[];
  return rows.map((row) => ({
    ...mapRequest(row),
    assignedCreativeProfileId: null,
    assignedCreativeName: null,
    applications: [],
  }));
};

export const listAdminAthleteSessionRequests = async ({
  workspaceId,
  athleteNames = new Map<string, string>(),
}: {
  workspaceId: string;
  athleteNames?: Map<string, string>;
}): Promise<AthleteSessionRequest[]> => {
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    ${requestSelect}
    WHERE request.workspace_id = $1
    ORDER BY
      CASE request.workflow_status
        WHEN 'submitted' THEN 0
        WHEN 'admin_review' THEN 1
        WHEN 'changes_requested' THEN 2
        WHEN 'creative_agreed' THEN 3
        ELSE 4
      END,
      request.created_at DESC
  `, [workspaceId]) as RequestRow[];
  return rows.map((row) => mapRequest(row, athleteNames.get(row.athlete_id) ?? null));
};

export const createAthleteSessionRequest = async ({
  workspaceId,
  athleteId,
  clerkUserId,
  input,
}: {
  workspaceId: string;
  athleteId: string;
  clerkUserId: string;
  input: AthleteSessionRequestInput;
}): Promise<AthleteSessionRequest> => {
  const sql = createContentStorageClient();
  const requestId = randomUUID();
  const commercial = await loadCommercialDecision(workspaceId, athleteId, input.requestType);
  await sql.transaction([
    sql.query(`
      INSERT INTO athlete_session_requests (
        id, workspace_id, athlete_id, athlete_clerk_user_id,
        submission_idempotency_key, request_type, workflow_status,
        sport, event_type, event_starts_at, event_ends_at, schedule_to_confirm,
        location_name, region, club_or_team, opponent_or_event, objective,
        deliverables, practical_information, desired_duration_minutes,
        constraints_comment, product_code, commercial_mode,
        snapshot_credit_type, snapshot_credit_quantity, snapshot_price_chf
      ) VALUES (
        $1::uuid, $2, $3, $4, $5::uuid, $6, 'submitted',
        $7, $8, $9::timestamptz, $10::timestamptz, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25
      )
      ON CONFLICT (workspace_id, athlete_clerk_user_id, submission_idempotency_key)
      DO NOTHING
    `, [
      requestId,
      workspaceId,
      athleteId,
      clerkUserId,
      input.idempotencyKey,
      input.requestType,
      input.sport,
      input.eventType,
      input.eventStartsAt,
      input.eventEndsAt,
      input.scheduleToConfirm,
      input.locationName,
      input.region,
      input.clubOrTeam,
      input.opponentOrEvent,
      input.objective,
      input.deliverables,
      input.practicalInformation,
      input.desiredDurationMinutes,
      input.constraintsComment,
      commercial.productCode,
      commercial.commercialMode,
      commercial.creditType,
      commercial.creditQuantity,
      commercial.priceChf,
    ]),
    ...input.periods.map((period) => sql.query(`
      INSERT INTO athlete_session_request_periods (
        workspace_id, request_id, starts_at, ends_at, preference_order
      )
      SELECT $1, request.id, $4::timestamptz, $5::timestamptz, $6
      FROM athlete_session_requests request
      WHERE request.workspace_id = $1
        AND request.athlete_clerk_user_id = $2
        AND request.submission_idempotency_key = $3::uuid
      ON CONFLICT DO NOTHING
    `, [
      workspaceId,
      clerkUserId,
      input.idempotencyKey,
      period.startsAt,
      period.endsAt,
      period.preferenceOrder,
    ])),
    sql.query(`
      INSERT INTO athlete_session_request_events (
        workspace_id, request_id, from_status, to_status, action,
        actor_clerk_user_id, actor_role, details, idempotency_key
      )
      SELECT $1, request.id, NULL, 'submitted', 'submitted',
             $2, 'athlete', jsonb_build_object('requestType', request.request_type),
             'submit:' || $3
      FROM athlete_session_requests request
      WHERE request.workspace_id = $1
        AND request.athlete_clerk_user_id = $2
        AND request.submission_idempotency_key = $3::uuid
      ON CONFLICT DO NOTHING
    `, [workspaceId, clerkUserId, input.idempotencyKey]),
  ]);
  const requests = await listAthleteSessionRequests({ workspaceId, athleteId, clerkUserId });
  const created = requests.find((request) =>
    request.events.some((event) => event.action === "submitted"
      && event.details.requestType === input.requestType)
  );
  const exact = await sql.query(`
    ${requestSelect}
    WHERE request.workspace_id = $1
      AND request.athlete_clerk_user_id = $2
      AND request.submission_idempotency_key = $3::uuid
    LIMIT 1
  `, [workspaceId, clerkUserId, input.idempotencyKey]) as RequestRow[];
  return exact[0] ? mapRequest(exact[0]) : created!;
};

export const mutateAthleteSessionRequest = async ({
  workspaceId,
  athleteId,
  clerkUserId,
  requestId,
  action,
  complement,
  idempotencyKey,
}: {
  workspaceId: string;
  athleteId: string;
  clerkUserId: string;
  requestId: string;
  action: "cancel" | "respond_complement";
  complement?: string;
  idempotencyKey: string;
}): Promise<"changed" | "unchanged" | "not_found" | "conflict"> => {
  if (!uuidPattern.test(requestId) || !uuidPattern.test(idempotencyKey)) throw new Error("Requête invalide.");
  const normalizedComplement = action === "respond_complement"
    ? text(complement, "Complément", 2000)
    : null;
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    WITH target AS (
      SELECT *
      FROM athlete_session_requests
      WHERE workspace_id = $1 AND id = $2::uuid
        AND athlete_id = $3 AND athlete_clerk_user_id = $4
      FOR UPDATE
    ), changed AS (
      UPDATE athlete_session_requests request
      SET workflow_status = CASE WHEN $5 = 'cancel' THEN 'cancelled' ELSE 'submitted' END,
          cancelled_at = CASE WHEN $5 = 'cancel' THEN NOW() ELSE NULL END,
          athlete_complement = CASE WHEN $5 = 'respond_complement' THEN $6 ELSE request.athlete_complement END,
          admin_reason = CASE WHEN $5 = 'respond_complement' THEN NULL ELSE request.admin_reason END,
          updated_at = NOW()
      FROM target
      WHERE request.id = target.id
        AND (
          ($5 = 'cancel' AND target.workflow_status NOT IN ('confirmed', 'completed', 'cancelled', 'refused'))
          OR
          ($5 = 'respond_complement' AND target.workflow_status = 'changes_requested')
        )
      RETURNING request.id, target.workflow_status AS previous_status, request.workflow_status
    ), event AS (
      INSERT INTO athlete_session_request_events (
        workspace_id, request_id, from_status, to_status, action,
        actor_clerk_user_id, actor_role, details, idempotency_key
      )
      SELECT $1, changed.id, changed.previous_status, changed.workflow_status,
             $5, $4, 'athlete', jsonb_build_object('complement', $6), $7
      FROM changed
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM event) THEN 'changed'
      WHEN EXISTS (
        SELECT 1 FROM athlete_session_request_events
        WHERE workspace_id = $1 AND request_id = $2::uuid AND idempotency_key = $7
      ) THEN 'unchanged'
      WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
      ELSE 'conflict'
    END AS outcome
  `, [
    workspaceId,
    requestId,
    athleteId,
    clerkUserId,
    action,
    normalizedComplement,
    idempotencyKey,
  ]) as Array<{ outcome: "changed" | "unchanged" | "not_found" | "conflict" }>;
  return rows[0]?.outcome ?? "conflict";
};

export const transitionAthleteSessionRequestAsAdmin = async ({
  workspaceId,
  clerkUserId,
  requestId,
  action,
  reason,
  idempotencyKey,
}: {
  workspaceId: string;
  clerkUserId: string;
  requestId: string;
  action: "start_review" | "accept" | "refuse" | "request_changes";
  reason?: string;
  idempotencyKey: string;
}): Promise<"changed" | "unchanged" | "not_found" | "conflict"> => {
  if (!uuidPattern.test(requestId) || !uuidPattern.test(idempotencyKey)) throw new Error("Requête invalide.");
  const normalizedReason = action === "refuse" || action === "request_changes"
    ? text(reason, "Motif", 2000)
    : null;
  const nextStatus: AthleteSessionRequestStatus = action === "start_review"
    ? "admin_review"
    : action === "accept"
      ? "accepted"
      : action === "refuse"
        ? "refused"
        : "changes_requested";
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    WITH target AS (
      SELECT *
      FROM athlete_session_requests
      WHERE workspace_id = $1 AND id = $2::uuid
      FOR UPDATE
    ), changed AS (
      UPDATE athlete_session_requests request
      SET workflow_status = $3,
          admin_reason = $4,
          updated_at = NOW()
      FROM target
      WHERE request.id = target.id
        AND (
          ($5 = 'start_review' AND target.workflow_status = 'submitted')
          OR
          ($5 IN ('accept', 'refuse', 'request_changes')
            AND target.workflow_status IN ('submitted', 'admin_review'))
        )
      RETURNING request.id, target.workflow_status AS previous_status
    ), event AS (
      INSERT INTO athlete_session_request_events (
        workspace_id, request_id, from_status, to_status, action,
        actor_clerk_user_id, actor_role, details, idempotency_key
      )
      SELECT $1, changed.id, changed.previous_status, $3, $5,
             $6, 'admin', jsonb_build_object('reason', $4), $7
      FROM changed
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM event) THEN 'changed'
      WHEN EXISTS (
        SELECT 1 FROM athlete_session_request_events
        WHERE workspace_id = $1 AND request_id = $2::uuid AND idempotency_key = $7
      ) THEN 'unchanged'
      WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
      ELSE 'conflict'
    END AS outcome
  `, [
    workspaceId,
    requestId,
    nextStatus,
    normalizedReason,
    action,
    clerkUserId,
    idempotencyKey,
  ]) as Array<{ outcome: "changed" | "unchanged" | "not_found" | "conflict" }>;
  return rows[0]?.outcome ?? "conflict";
};

export type AthleteSessionProductionInput = {
  idempotencyKey: string;
  creativeType: "photo" | "video" | "photo_video";
  selectedPeriodStart: string | null;
  deliveryDueDate: string | null;
  compensation: ReturnType<typeof parseCompensation>;
  expensesCovered: boolean;
  expenseTerms: string;
  creditsAndUsage: string;
  necessaryContactDetails: string | null;
  recipientIds: string[];
};

export const parseAthleteSessionProductionInput = (
  value: unknown,
): AthleteSessionProductionInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Requête invalide.");
  }
  const input = value as Record<string, unknown>;
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  if (!uuidPattern.test(idempotencyKey)) throw new Error("Clé d’action invalide.");
  const creativeType = String(input.creativeType ?? "");
  if (!["photo", "video", "photo_video"].includes(creativeType)) {
    throw new Error("Type créatif invalide.");
  }
  const deliveryDueDate = input.deliveryDueDate
    ? String(input.deliveryDueDate).trim()
    : null;
  if (deliveryDueDate && !isCivilDate(deliveryDueDate)) throw new Error("Échéance invalide.");
  const selectedPeriodStart = input.selectedPeriodStart
    ? String(input.selectedPeriodStart).trim()
    : null;
  if (selectedPeriodStart && Number.isNaN(new Date(selectedPeriodStart).getTime())) {
    throw new Error("Période Media Day invalide.");
  }
  if (!Array.isArray(input.recipientIds)) throw new Error("Destinataires invalides.");
  const recipientIds = [...new Set(input.recipientIds.map((id) => String(id).trim()))];
  if (recipientIds.length === 0 || !recipientIds.every((id) => uuidPattern.test(id))) {
    throw new Error("Sélectionnez au moins un créatif compatible.");
  }
  return {
    idempotencyKey,
    creativeType: creativeType as AthleteSessionProductionInput["creativeType"],
    selectedPeriodStart,
    deliveryDueDate,
    compensation: parseCompensation(input.compensation),
    expensesCovered: input.expensesCovered === true,
    expenseTerms: text(input.expenseTerms, "Conditions de frais", 1000),
    creditsAndUsage: text(input.creditsAndUsage, "Crédits et utilisation", 2000),
    necessaryContactDetails: nullableText(input.necessaryContactDetails, 1000),
    recipientIds,
  };
};

export const createProductionBriefFromAthleteSession = async ({
  workspaceId,
  clerkUserId,
  requestId,
  athleteName,
  input,
}: {
  workspaceId: string;
  clerkUserId: string;
  requestId: string;
  athleteName: string;
  input: AthleteSessionProductionInput;
}): Promise<{ outcome: "changed" | "unchanged" | "not_found" | "conflict"; briefId: string | null }> => {
  if (!uuidPattern.test(requestId)) throw new Error("Demande invalide.");
  const sql = createContentStorageClient();
  const fingerprint = createHash("sha256")
    .update(`athlete-session-request:${workspaceId}:${requestId}`)
    .digest("hex");
  const rows = await sql.query(`
    WITH target AS (
      SELECT request.*
      FROM athlete_session_requests request
      WHERE request.workspace_id = $1 AND request.id = $2::uuid
      FOR UPDATE
    ), valid_recipients AS (
      SELECT profile.id
      FROM creative_profiles profile
      WHERE profile.workspace_id = $1
        AND profile.status = 'active'
        AND profile.id = ANY($17::uuid[])
    ), inserted AS (
      INSERT INTO production_creative_briefs (
        workspace_id, production_source, production_source_row,
        production_source_fingerprint, production_snapshot,
        origin_type, origin_request_id, planning_timezone,
        title, creative_type, athlete_refs, scheduled_date, date_to_agree,
        region, location_details, objective, deliverables, delivery_due_date,
        compensation_type, compensation_amount_minor, compensation_currency,
        expenses_covered, expense_terms, credits_and_usage,
        necessary_contact_details, created_by_clerk_user_id
      )
      SELECT $1, 'athlete_session_request', NULL, $3,
             jsonb_build_object(
               'requestId', target.id,
               'requestType', target.request_type,
               'sport', target.sport,
               'eventType', target.event_type,
               'eventStartsAt', target.event_starts_at,
               'eventEndsAt', target.event_ends_at,
               'scheduleToConfirm', target.schedule_to_confirm,
               'periods', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                   'startsAt', period.starts_at,
                   'endsAt', period.ends_at,
                   'preferenceOrder', period.preference_order
                 ) ORDER BY period.preference_order)
                 FROM athlete_session_request_periods period
                 WHERE period.workspace_id = target.workspace_id
                   AND period.request_id = target.id
               ), '[]'::jsonb)
             ),
             'athlete_session_request', target.id, 'Europe/Zurich',
             CASE
               WHEN target.request_type = 'match_competition'
                 THEN 'Couverture ' || target.event_type || ' — ' || $4
               ELSE 'Media Day — ' || $4
             END,
             $5, jsonb_build_array(jsonb_build_object('id', target.athlete_id, 'name', $4)),
             CASE WHEN target.request_type = 'match_competition'
               THEN (target.event_starts_at AT TIME ZONE 'Europe/Zurich')::date
               ELSE ($6::timestamptz AT TIME ZONE 'Europe/Zurich')::date END,
             FALSE,
             target.region, target.location_name, target.objective, target.deliverables,
             $7::date, $8, $9, $10, $11, $12, $13, $14, $15
      FROM target
      WHERE target.workflow_status = 'accepted'
        AND target.production_brief_id IS NULL
        AND (SELECT count(*) FROM valid_recipients) = cardinality($17::uuid[])
        AND (
          target.request_type = 'match_competition'
          OR EXISTS (
            SELECT 1
            FROM athlete_session_request_periods selected_period
            WHERE selected_period.workspace_id = target.workspace_id
              AND selected_period.request_id = target.id
              AND selected_period.starts_at = $6::timestamptz
          )
        )
      ON CONFLICT (workspace_id, origin_type, origin_request_id)
        WHERE origin_type = 'athlete_session_request' AND origin_request_id IS NOT NULL
      DO NOTHING
      RETURNING *
    ), recipients AS (
      INSERT INTO production_creative_recipients (
        workspace_id, brief_id, creative_profile_id
      )
      SELECT $1, inserted.id, valid_recipients.id
      FROM inserted CROSS JOIN valid_recipients
    ), conditions AS (
      INSERT INTO production_creative_condition_versions (
        workspace_id, brief_id, version, conditions_snapshot, created_by_clerk_user_id
      )
      SELECT $1, inserted.id, inserted.conditions_version,
             jsonb_build_object(
               'version', inserted.conditions_version,
               'compensationType', inserted.compensation_type,
               'amountMinor', inserted.compensation_amount_minor,
               'currency', inserted.compensation_currency,
               'expensesCovered', inserted.expenses_covered,
               'expenseTerms', inserted.expense_terms,
               'deliverables', inserted.deliverables,
               'creditsAndUsage', inserted.credits_and_usage,
               'scheduledDate', inserted.scheduled_date,
               'dateToAgree', inserted.date_to_agree,
               'region', inserted.region,
               'locationDetails', inserted.location_details,
               'deliveryDueDate', inserted.delivery_due_date
             ),
             $15
      FROM inserted
    ), production_event AS (
      INSERT INTO production_creative_events (
        workspace_id, brief_id, action, actor_clerk_user_id, details
      )
      SELECT $1, inserted.id, 'brief_created', $15,
             jsonb_build_object(
               'originType', 'athlete_session_request',
               'originRequestId', $2,
               'recipientCount', cardinality($17::uuid[])
             )
      FROM inserted
    ), request_change AS (
      UPDATE athlete_session_requests request
      SET workflow_status = 'production_linked',
          production_brief_id = inserted.id,
          updated_at = NOW()
      FROM inserted
      WHERE request.workspace_id = $1 AND request.id = $2::uuid
      RETURNING request.id, inserted.id AS brief_id
    ), request_event AS (
      INSERT INTO athlete_session_request_events (
        workspace_id, request_id, from_status, to_status, action,
        actor_clerk_user_id, actor_role, details, idempotency_key
      )
      SELECT $1, request_change.id, 'accepted', 'production_linked',
             'production_linked', $15, 'admin',
             jsonb_build_object('briefId', request_change.brief_id),
             $16
      FROM request_change
      ON CONFLICT DO NOTHING
      RETURNING request_id
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM request_event) THEN 'changed'
      WHEN EXISTS (
        SELECT 1 FROM target WHERE production_brief_id IS NOT NULL
      ) THEN 'unchanged'
      WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
      ELSE 'conflict'
    END AS outcome,
    COALESCE(
      (SELECT brief_id FROM request_change),
      (SELECT production_brief_id FROM target)
    ) AS brief_id
  `, [
    workspaceId,
    requestId,
    fingerprint,
    athleteName,
    input.creativeType,
    input.selectedPeriodStart,
    input.deliveryDueDate,
    input.compensation.type,
    input.compensation.amountMinor,
    input.compensation.currency,
    input.expensesCovered,
    input.expenseTerms,
    input.creditsAndUsage,
    input.necessaryContactDetails,
    clerkUserId,
    input.idempotencyKey,
    input.recipientIds,
  ]) as Array<{
    outcome: "changed" | "unchanged" | "not_found" | "conflict";
    brief_id: string | null;
  }>;
  return {
    outcome: rows[0]?.outcome ?? "conflict",
    briefId: rows[0]?.brief_id ?? null,
  };
};

export const confirmAthleteSessionFinally = async ({
  workspaceId,
  clerkUserId,
  requestId,
  idempotencyKey,
}: {
  workspaceId: string;
  clerkUserId: string;
  requestId: string;
  idempotencyKey: string;
}): Promise<"changed" | "unchanged" | "not_found" | "conflict" | "creative_pending" | "date_required"> => {
  if (!uuidPattern.test(requestId) || !uuidPattern.test(idempotencyKey)) {
    throw new Error("Requête invalide.");
  }
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    WITH target AS (
      SELECT request.id, request.workflow_status, request.production_brief_id,
             brief.scheduled_date, brief.assigned_creative_profile_id,
             assignment.confirmation_status
      FROM athlete_session_requests request
      JOIN production_creative_briefs brief
        ON brief.workspace_id = request.workspace_id
       AND brief.id = request.production_brief_id
      JOIN production_creative_assignments assignment
        ON assignment.workspace_id = brief.workspace_id
       AND assignment.brief_id = brief.id
       AND assignment.status = 'active'
      WHERE request.workspace_id = $1 AND request.id = $2::uuid
      FOR UPDATE OF request, brief, assignment
    ), lock_key AS (
      SELECT pg_advisory_xact_lock(hashtextextended(
        $1 || ':' || assigned_creative_profile_id::text || ':' || scheduled_date::text,
        0
      ))
      FROM target
      WHERE assigned_creative_profile_id IS NOT NULL AND scheduled_date IS NOT NULL
    ), conflicting AS (
      SELECT other_brief.id
      FROM target
      CROSS JOIN lock_key
      JOIN production_creative_assignments other_assignment
        ON other_assignment.workspace_id = $1
       AND other_assignment.creative_profile_id = target.assigned_creative_profile_id
       AND other_assignment.status = 'active'
       AND other_assignment.confirmation_status = 'confirmed'
      JOIN production_creative_briefs other_brief
        ON other_brief.workspace_id = other_assignment.workspace_id
       AND other_brief.id = other_assignment.brief_id
       AND other_brief.scheduled_date = target.scheduled_date
       AND other_brief.id <> target.production_brief_id
      LEFT JOIN athlete_session_requests other_request
        ON other_request.workspace_id = other_brief.workspace_id
       AND other_request.id = other_brief.origin_request_id
       AND other_brief.origin_type = 'athlete_session_request'
      WHERE other_brief.origin_type <> 'athlete_session_request'
         OR other_request.workflow_status IN ('confirmed', 'completed')
      LIMIT 1
    ), reserved_slot AS (
      INSERT INTO athlete_session_confirmed_creative_slots (
        workspace_id, creative_profile_id, mission_date, request_id, brief_id
      )
      SELECT $1, target.assigned_creative_profile_id, target.scheduled_date,
             target.id, target.production_brief_id
      FROM target
      CROSS JOIN lock_key
      WHERE target.workflow_status = 'creative_agreed'
        AND target.confirmation_status = 'confirmed'
        AND target.scheduled_date IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM conflicting)
      ON CONFLICT DO NOTHING
      RETURNING request_id
    ), changed AS (
      UPDATE athlete_session_requests request
      SET workflow_status = 'confirmed',
          final_confirmed_at = NOW(),
          updated_at = NOW()
      FROM target
      WHERE request.id = target.id
        AND target.workflow_status = 'creative_agreed'
        AND target.confirmation_status = 'confirmed'
        AND target.scheduled_date IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM conflicting)
        AND EXISTS (SELECT 1 FROM reserved_slot WHERE request_id = target.id)
      RETURNING request.id
    ), event AS (
      INSERT INTO athlete_session_request_events (
        workspace_id, request_id, from_status, to_status, action,
        actor_clerk_user_id, actor_role, details, idempotency_key
      )
      SELECT $1, changed.id, 'creative_agreed', 'confirmed',
             'final_confirmation', $3, 'admin', '{}'::jsonb, $4
      FROM changed
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM event) THEN 'changed'
      WHEN EXISTS (
        SELECT 1 FROM athlete_session_request_events
        WHERE workspace_id = $1 AND request_id = $2::uuid AND idempotency_key = $4
      ) OR EXISTS (SELECT 1 FROM target WHERE workflow_status = 'confirmed') THEN 'unchanged'
      WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
      WHEN EXISTS (SELECT 1 FROM target WHERE confirmation_status <> 'confirmed') THEN 'creative_pending'
      WHEN EXISTS (SELECT 1 FROM target WHERE scheduled_date IS NULL) THEN 'date_required'
      ELSE 'conflict'
    END AS outcome
  `, [workspaceId, requestId, clerkUserId, idempotencyKey]) as Array<{
    outcome: "changed" | "unchanged" | "not_found" | "conflict" | "creative_pending" | "date_required";
  }>;
  return rows[0]?.outcome ?? "conflict";
};
