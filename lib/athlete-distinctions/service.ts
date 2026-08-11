import { randomUUID } from "crypto";
import { createContentStorageClient, getDefaultWorkspaceId } from "@/lib/content-storage/db";

export type AthleteDistinctionRecord = {
  id: string;
  workspaceId: string;
  athleteId: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  awardedAt: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAthleteDistinctionInput = {
  workspaceId?: string;
  athleteId: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  awardedAt: string;
  description?: string | null;
  id?: string;
};

export type AthleteDistinctionNominationRecord = {
  id: string;
  workspaceId: string;
  athleteId: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  nominatedAt: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAthleteDistinctionNominationInput = {
  workspaceId?: string;
  athleteId: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  nominatedAt: string;
  reason?: string | null;
  id?: string;
};

const getSql = () => createContentStorageClient();

const normalize = (value: unknown): string => String(value ?? "").trim();

const normalizeNullable = (value: unknown): string | null => {
  const normalized = normalize(value);
  return normalized || null;
};

const resolveWorkspaceId = (workspaceId?: string): string => {
  const normalized = normalize(workspaceId);
  if (normalized) return normalized;
  return getDefaultWorkspaceId();
};

const mapDistinctionRow = (row: Record<string, unknown>): AthleteDistinctionRecord => ({
  id: String(row.id ?? ""),
  workspaceId: String(row.workspace_id ?? ""),
  athleteId: String(row.athlete_id ?? ""),
  type: String(row.type ?? ""),
  awardMonth: Number(row.award_month ?? 0),
  awardYear: Number(row.award_year ?? 0),
  awardedAt: String(row.awarded_at ?? ""),
  description: typeof row.description === "string" ? row.description : null,
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
});

const mapNominationRow = (row: Record<string, unknown>): AthleteDistinctionNominationRecord => ({
  id: String(row.id ?? ""),
  workspaceId: String(row.workspace_id ?? ""),
  athleteId: String(row.athlete_id ?? ""),
  type: String(row.type ?? ""),
  awardMonth: Number(row.award_month ?? 0),
  awardYear: Number(row.award_year ?? 0),
  nominatedAt: String(row.nominated_at ?? ""),
  reason: typeof row.reason === "string" ? row.reason : null,
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
});

export const listAthleteDistinctions = async (athleteId: string, workspaceId?: string): Promise<AthleteDistinctionRecord[]> => {
  const athleteIdValue = normalize(athleteId);
  if (!athleteIdValue) return [];

  const sql = getSql();
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const rows = await sql`
    SELECT id, workspace_id, athlete_id, type, award_month, award_year, awarded_at, description, created_at, updated_at
    FROM athlete_distinctions
    WHERE workspace_id = ${resolvedWorkspaceId} AND athlete_id = ${athleteIdValue}
    ORDER BY award_year DESC, award_month DESC, awarded_at DESC, created_at DESC
  `;

  return rows.map((row) => mapDistinctionRow(row as Record<string, unknown>));
};

export const createAthleteDistinction = async (input: CreateAthleteDistinctionInput): Promise<AthleteDistinctionRecord> => {
  const sql = getSql();
  const resolvedWorkspaceId = resolveWorkspaceId(input.workspaceId);
  const now = new Date().toISOString();
  const id = normalize(input.id) || randomUUID();

  const rows = await sql`
    INSERT INTO athlete_distinctions (
      id,
      workspace_id,
      athlete_id,
      type,
      award_month,
      award_year,
      awarded_at,
      description,
      created_at,
      updated_at
    )
    VALUES (
      ${id},
      ${resolvedWorkspaceId},
      ${normalize(input.athleteId)},
      ${normalize(input.type)},
      ${input.awardMonth},
      ${input.awardYear},
      ${input.awardedAt},
      ${normalizeNullable(input.description)},
      ${now},
      ${now}
    )
    RETURNING id, workspace_id, athlete_id, type, award_month, award_year, awarded_at, description, created_at, updated_at
  `;

  return mapDistinctionRow(rows[0] as Record<string, unknown>);
};

export const deleteAthleteDistinction = async (
  distinctionId: string,
  workspaceId?: string,
): Promise<AthleteDistinctionRecord | null> => {
  const id = normalize(distinctionId);
  if (!id) return null;

  const sql = getSql();
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const rows = await sql`
    DELETE FROM athlete_distinctions
    WHERE workspace_id = ${resolvedWorkspaceId} AND id = ${id}
    RETURNING id, workspace_id, athlete_id, type, award_month, award_year, awarded_at, description, created_at, updated_at
  `;

  if (!rows[0]) {
    return null;
  }

  return mapDistinctionRow(rows[0] as Record<string, unknown>);
};

export const listAthleteDistinctionNominations = async (
  athleteId: string,
  workspaceId?: string,
): Promise<AthleteDistinctionNominationRecord[]> => {
  const athleteIdValue = normalize(athleteId);
  if (!athleteIdValue) return [];

  const sql = getSql();
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const rows = await sql`
    SELECT id, workspace_id, athlete_id, type, award_month, award_year, nominated_at, reason, created_at, updated_at
    FROM athlete_distinction_nominations
    WHERE workspace_id = ${resolvedWorkspaceId} AND athlete_id = ${athleteIdValue}
    ORDER BY award_year DESC, award_month DESC, nominated_at DESC, created_at DESC
  `;

  return rows.map((row) => mapNominationRow(row as Record<string, unknown>));
};

export const createAthleteDistinctionNomination = async (
  input: CreateAthleteDistinctionNominationInput,
): Promise<AthleteDistinctionNominationRecord> => {
  const sql = getSql();
  const resolvedWorkspaceId = resolveWorkspaceId(input.workspaceId);
  const now = new Date().toISOString();
  const id = normalize(input.id) || randomUUID();

  const rows = await sql`
    INSERT INTO athlete_distinction_nominations (
      id,
      workspace_id,
      athlete_id,
      type,
      award_month,
      award_year,
      nominated_at,
      reason,
      created_at,
      updated_at
    )
    VALUES (
      ${id},
      ${resolvedWorkspaceId},
      ${normalize(input.athleteId)},
      ${normalize(input.type)},
      ${input.awardMonth},
      ${input.awardYear},
      ${input.nominatedAt},
      ${normalizeNullable(input.reason)},
      ${now},
      ${now}
    )
    RETURNING id, workspace_id, athlete_id, type, award_month, award_year, nominated_at, reason, created_at, updated_at
  `;

  return mapNominationRow(rows[0] as Record<string, unknown>);
};

export const deleteAthleteDistinctionNomination = async (
  nominationId: string,
  workspaceId?: string,
): Promise<AthleteDistinctionNominationRecord | null> => {
  const id = normalize(nominationId);
  if (!id) return null;

  const sql = getSql();
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const rows = await sql`
    DELETE FROM athlete_distinction_nominations
    WHERE workspace_id = ${resolvedWorkspaceId} AND id = ${id}
    RETURNING id, workspace_id, athlete_id, type, award_month, award_year, nominated_at, reason, created_at, updated_at
  `;

  if (!rows[0]) {
    return null;
  }

  return mapNominationRow(rows[0] as Record<string, unknown>);
};

export const listDistinctionNominationsByPeriod = async (
  type: string,
  awardMonth: number,
  awardYear: number,
  workspaceId?: string,
): Promise<AthleteDistinctionNominationRecord[]> => {
  const normalizedType = normalize(type);
  if (!normalizedType || !Number.isInteger(awardMonth) || !Number.isInteger(awardYear)) {
    return [];
  }

  const sql = getSql();
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const rows = await sql`
    SELECT id, workspace_id, athlete_id, type, award_month, award_year, nominated_at, reason, created_at, updated_at
    FROM athlete_distinction_nominations
    WHERE workspace_id = ${resolvedWorkspaceId}
      AND type = ${normalizedType}
      AND award_month = ${awardMonth}
      AND award_year = ${awardYear}
    ORDER BY nominated_at ASC, created_at ASC
  `;

  return rows.map((row) => mapNominationRow(row as Record<string, unknown>));
};

export const getDistinctionByPeriod = async (
  type: string,
  awardMonth: number,
  awardYear: number,
  workspaceId?: string,
): Promise<AthleteDistinctionRecord | null> => {
  const normalizedType = normalize(type);
  if (!normalizedType || !Number.isInteger(awardMonth) || !Number.isInteger(awardYear)) {
    return null;
  }

  const sql = getSql();
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const rows = await sql`
    SELECT id, workspace_id, athlete_id, type, award_month, award_year, awarded_at, description, created_at, updated_at
    FROM athlete_distinctions
    WHERE workspace_id = ${resolvedWorkspaceId}
      AND type = ${normalizedType}
      AND award_month = ${awardMonth}
      AND award_year = ${awardYear}
    ORDER BY awarded_at DESC, created_at DESC
    LIMIT 1
  `;

  if (!rows[0]) {
    return null;
  }

  return mapDistinctionRow(rows[0] as Record<string, unknown>);
};
