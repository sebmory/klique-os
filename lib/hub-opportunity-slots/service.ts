import { randomUUID } from "crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { resolveActiveAccess } from "@/lib/hub-opportunities/service";

export type HubOpportunitySlotStatus = "open" | "closed" | "cancelled";
export type HubOpportunitySlotRequestStatus = "requested" | "confirmed" | "declined" | "cancelled";

export type HubOpportunitySlotRecord = {
  id: string;
  opportunityId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: HubOpportunitySlotStatus;
  createdAt: string;
  updatedAt: string;
};

export type HubOpportunitySlotRequestRecord = {
  id: string;
  slotId: string;
  opportunityId: string;
  workspaceId: string;
  athleteId: string;
  clerkUserId: string;
  status: HubOpportunitySlotRequestStatus;
  athleteSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateHubOpportunitySlotInput = {
  opportunityId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
};

const slotStatuses: HubOpportunitySlotStatus[] = ["open", "closed", "cancelled"];
const requestStatuses: HubOpportunitySlotRequestStatus[] = ["requested", "confirmed", "declined", "cancelled"];
const publishedStatuses = ["Ouverte", "Bientôt", "Fermée"];
const shootingCategory = "Shooting";

const getSql = () => createContentStorageClient();

const normalize = (value: unknown): string => String(value ?? "").trim();

export const isSlotStatus = (value: unknown): value is HubOpportunitySlotStatus =>
  typeof value === "string" && slotStatuses.includes(value as HubOpportunitySlotStatus);

export const isSlotRequestStatus = (value: unknown): value is HubOpportunitySlotRequestStatus =>
  typeof value === "string" && requestStatuses.includes(value as HubOpportunitySlotRequestStatus);

const mapSlotRow = (row: Record<string, unknown>): HubOpportunitySlotRecord => ({
  id: String(row.id ?? ""),
  opportunityId: String(row.opportunity_id ?? ""),
  startsAt: String(row.starts_at ?? ""),
  endsAt: String(row.ends_at ?? ""),
  capacity: Number(row.capacity ?? 0),
  status: String(row.status ?? "open") as HubOpportunitySlotStatus,
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
});

const mapRequestRow = (row: Record<string, unknown>): HubOpportunitySlotRequestRecord => ({
  id: String(row.id ?? ""),
  slotId: String(row.slot_id ?? ""),
  opportunityId: String(row.opportunity_id ?? ""),
  workspaceId: String(row.workspace_id ?? ""),
  athleteId: String(row.athlete_id ?? ""),
  clerkUserId: String(row.clerk_user_id ?? ""),
  status: String(row.status ?? "requested") as HubOpportunitySlotRequestStatus,
  athleteSeenAt: row.athlete_seen_at ? String(row.athlete_seen_at) : null,
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
});

const parseTimestamp = (value: string): number => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.NaN : parsed.getTime();
};

export const loadHubOpportunitySlots = async (request: Request, opportunityId?: string | null) => {
  const access = await resolveActiveAccess(request);
  const sql = getSql();
  const filterId = normalize(opportunityId);

  if (access.role === "admin") {
    const slotRows = await sql`
      SELECT s.id, s.opportunity_id, s.starts_at, s.ends_at, s.capacity, s.status, s.created_at, s.updated_at
      FROM hub_opportunity_slots s
      JOIN hub_opportunities o ON o.id = s.opportunity_id
      WHERE o.workspace_id = ${access.workspaceId}
        AND (${filterId} = '' OR s.opportunity_id = ${filterId})
      ORDER BY s.starts_at ASC
    `;

    const requestRows = await sql`
      SELECT r.id, r.slot_id, r.opportunity_id, r.workspace_id, r.athlete_id, r.clerk_user_id, r.status, r.athlete_seen_at, r.created_at, r.updated_at
      FROM hub_opportunity_slot_requests r
      WHERE r.workspace_id = ${access.workspaceId}
        AND (${filterId} = '' OR r.opportunity_id = ${filterId})
      ORDER BY r.created_at DESC
    `;

    return {
      slots: slotRows.map((row) => mapSlotRow(row as Record<string, unknown>)),
      requests: requestRows.map((row) => mapRequestRow(row as Record<string, unknown>)),
    };
  }

  const slotRows = await sql`
    SELECT s.id, s.opportunity_id, s.starts_at, s.ends_at, s.capacity, s.status, s.created_at, s.updated_at
    FROM hub_opportunity_slots s
    JOIN hub_opportunities o ON o.id = s.opportunity_id
    WHERE o.workspace_id = ${access.workspaceId}
      AND o.status = ANY(${publishedStatuses})
      AND (${filterId} = '' OR s.opportunity_id = ${filterId})
    ORDER BY s.starts_at ASC
  `;

  const athleteId = access.athleteId ?? "";
  const requestRows = athleteId
    ? await sql`
        SELECT r.id, r.slot_id, r.opportunity_id, r.workspace_id, r.athlete_id, r.clerk_user_id, r.status, r.athlete_seen_at, r.created_at, r.updated_at
        FROM hub_opportunity_slot_requests r
        WHERE r.workspace_id = ${access.workspaceId}
          AND r.athlete_id = ${athleteId}
          AND (${filterId} = '' OR r.opportunity_id = ${filterId})
        ORDER BY r.created_at DESC
      `
    : [];

  return {
    slots: slotRows.map((row) => mapSlotRow(row as Record<string, unknown>)),
    requests: requestRows.map((row) => mapRequestRow(row as Record<string, unknown>)),
  };
};

export const createHubOpportunitySlot = async (request: Request, input: CreateHubOpportunitySlotInput) => {
  const access = await resolveActiveAccess(request);
  if (access.role !== "admin") {
    throw new Error("Forbidden");
  }

  const opportunityId = normalize(input.opportunityId);
  if (!opportunityId) {
    throw new Error("InvalidInput");
  }

  const startsAt = parseTimestamp(input.startsAt);
  const endsAt = parseTimestamp(input.endsAt);
  if (Number.isNaN(startsAt) || Number.isNaN(endsAt) || endsAt <= startsAt) {
    throw new Error("InvalidInput");
  }

  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 20) {
    throw new Error("InvalidInput");
  }

  const sql = getSql();
  const opportunityRows = await sql`
    SELECT id FROM hub_opportunities
    WHERE id = ${opportunityId}
      AND workspace_id = ${access.workspaceId}
      AND type = ${shootingCategory}
  `;
  if (!opportunityRows[0]) {
    throw new Error("NotFound");
  }

  const id = randomUUID();
  const rows = await sql`
    INSERT INTO hub_opportunity_slots (
      id,
      opportunity_id,
      starts_at,
      ends_at,
      capacity,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ${id},
      ${opportunityId},
      ${new Date(startsAt).toISOString()},
      ${new Date(endsAt).toISOString()},
      ${input.capacity},
      'open',
      NOW(),
      NOW()
    )
    RETURNING id, opportunity_id, starts_at, ends_at, capacity, status, created_at, updated_at
  `;

  return mapSlotRow(rows[0] as Record<string, unknown>);
};

export const requestHubOpportunitySlot = async (request: Request, slotId: string, clerkUserId: string | null) => {
  if (!clerkUserId) {
    throw new Error("Unauthorized");
  }

  const access = await resolveActiveAccess(request);
  const athleteId = access.athleteId ?? "";
  if (access.role !== "athlete" || !athleteId) {
    throw new Error("Forbidden");
  }

  const normalizedSlotId = normalize(slotId);
  if (!normalizedSlotId) {
    throw new Error("InvalidInput");
  }

  const sql = getSql();
  const slotRows = await sql`
    SELECT s.id, s.opportunity_id
    FROM hub_opportunity_slots s
    JOIN hub_opportunities o ON o.id = s.opportunity_id
    WHERE s.id = ${normalizedSlotId}
      AND s.status = 'open'
      AND o.workspace_id = ${access.workspaceId}
      AND o.status = ANY(${publishedStatuses})
  `;
  const slot = slotRows[0] as Record<string, unknown> | undefined;
  if (!slot) {
    throw new Error("NotFound");
  }

  const id = randomUUID();
  const rows = await sql`
    INSERT INTO hub_opportunity_slot_requests (
      id,
      slot_id,
      opportunity_id,
      workspace_id,
      athlete_id,
      clerk_user_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ${id},
      ${normalizedSlotId},
      ${String(slot.opportunity_id ?? "")},
      ${access.workspaceId},
      ${athleteId},
      ${clerkUserId},
      'requested',
      NOW(),
      NOW()
    )
    ON CONFLICT (opportunity_id, athlete_id) DO UPDATE SET
      slot_id = EXCLUDED.slot_id,
      clerk_user_id = EXCLUDED.clerk_user_id,
      status = 'requested',
      athlete_seen_at = NULL,
      updated_at = NOW()
    WHERE hub_opportunity_slot_requests.status <> 'confirmed'
    RETURNING id, slot_id, opportunity_id, workspace_id, athlete_id, clerk_user_id, status, athlete_seen_at, created_at, updated_at
  `;

  if (!rows[0]) {
    throw new Error("Conflict");
  }

  return mapRequestRow(rows[0] as Record<string, unknown>);
};

export const updateHubOpportunitySlotStatus = async (
  request: Request,
  slotId: string,
  status: HubOpportunitySlotStatus,
) => {
  const access = await resolveActiveAccess(request);
  if (access.role !== "admin") {
    throw new Error("Forbidden");
  }

  const normalizedSlotId = normalize(slotId);
  if (!normalizedSlotId) {
    throw new Error("InvalidInput");
  }

  const sql = getSql();
  const rows = await sql`
    UPDATE hub_opportunity_slots s
    SET status = ${status}, updated_at = NOW()
    FROM hub_opportunities o
    WHERE s.id = ${normalizedSlotId}
      AND o.id = s.opportunity_id
      AND o.workspace_id = ${access.workspaceId}
    RETURNING s.id, s.opportunity_id, s.starts_at, s.ends_at, s.capacity, s.status, s.created_at, s.updated_at
  `;

  if (!rows[0]) {
    throw new Error("NotFound");
  }

  return mapSlotRow(rows[0] as Record<string, unknown>);
};

export const markHubOpportunitySlotRequestSeen = async (request: Request, requestId: string) => {
  const access = await resolveActiveAccess(request);
  const athleteId = access.athleteId ?? "";
  if (access.role !== "athlete" || !athleteId) {
    throw new Error("Forbidden");
  }

  const normalizedRequestId = normalize(requestId);
  if (!normalizedRequestId) {
    throw new Error("InvalidInput");
  }

  const sql = getSql();
  const rows = await sql`
    UPDATE hub_opportunity_slot_requests
    SET athlete_seen_at = NOW(), updated_at = updated_at
    WHERE id = ${normalizedRequestId}
      AND workspace_id = ${access.workspaceId}
      AND athlete_id = ${athleteId}
    RETURNING id, slot_id, opportunity_id, workspace_id, athlete_id, clerk_user_id, status, athlete_seen_at, created_at, updated_at
  `;

  if (!rows[0]) {
    throw new Error("NotFound");
  }

  return mapRequestRow(rows[0] as Record<string, unknown>);
};

export const updateHubOpportunitySlotRequestStatus = async (
  request: Request,
  requestId: string,
  status: Exclude<HubOpportunitySlotRequestStatus, "requested">,
) => {
  const access = await resolveActiveAccess(request);
  if (access.role !== "admin") {
    throw new Error("Forbidden");
  }

  const normalizedRequestId = normalize(requestId);
  if (!normalizedRequestId) {
    throw new Error("InvalidInput");
  }

  const sql = getSql();

  if (status !== "confirmed") {
    const rows = await sql`
      UPDATE hub_opportunity_slot_requests
      SET status = ${status}, athlete_seen_at = NULL, updated_at = NOW()
      WHERE id = ${normalizedRequestId} AND workspace_id = ${access.workspaceId}
      RETURNING id, slot_id, opportunity_id, workspace_id, athlete_id, clerk_user_id, status, athlete_seen_at, created_at, updated_at
    `;

    if (!rows[0]) {
      throw new Error("NotFound");
    }

    return mapRequestRow(rows[0] as Record<string, unknown>);
  }

  // Le verrou sur le creneau serialise les confirmations concurrentes et empeche la surreservation.
  const results = await sql.transaction([
    sql`
      SELECT s.id
      FROM hub_opportunity_slots s
      JOIN hub_opportunity_slot_requests r ON r.slot_id = s.id
      WHERE r.id = ${normalizedRequestId} AND r.workspace_id = ${access.workspaceId}
      FOR UPDATE OF s
    `,
    sql`
      UPDATE hub_opportunity_slot_requests r
      SET status = 'confirmed', athlete_seen_at = NULL, updated_at = NOW()
      WHERE r.id = ${normalizedRequestId}
        AND r.workspace_id = ${access.workspaceId}
        AND r.status <> 'confirmed'
        AND (
          SELECT COUNT(*)
          FROM hub_opportunity_slot_requests c
          WHERE c.slot_id = r.slot_id AND c.status = 'confirmed'
        ) < (
          SELECT s.capacity FROM hub_opportunity_slots s WHERE s.id = r.slot_id
        )
      RETURNING r.id, r.slot_id, r.opportunity_id, r.workspace_id, r.athlete_id, r.clerk_user_id, r.status, r.created_at, r.updated_at
    `,
  ]);

  const lockedRows = (results[0] ?? []) as Record<string, unknown>[];
  if (!lockedRows[0]) {
    throw new Error("NotFound");
  }

  const updatedRows = (results[1] ?? []) as Record<string, unknown>[];
  if (!updatedRows[0]) {
    throw new Error("SlotFull");
  }

  return mapRequestRow(updatedRows[0]);
};
