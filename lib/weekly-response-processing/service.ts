import { createContentStorageClient, getDefaultWorkspaceId } from "@/lib/content-storage/db";

export type WeeklyResponseProcessingRecord = {
  workspaceId: string;
  athleteId: string;
  responseTimestamp: string;
  processedByClerkUserId: string;
  processedAt: string;
};

export type MonthlyResponseProcessingRecord = WeeklyResponseProcessingRecord;

type MarkWeeklyResponseProcessedInput = {
  workspaceId?: string;
  athleteId: string;
  responseTimestamp: string;
  processedByClerkUserId: string;
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const resolveWorkspaceId = (workspaceId?: string): string => normalize(workspaceId) || getDefaultWorkspaceId();

const mapRow = (row: Record<string, unknown>): WeeklyResponseProcessingRecord => ({
  workspaceId: String(row.workspace_id ?? ""),
  athleteId: String(row.athlete_id ?? ""),
  responseTimestamp: String(row.response_timestamp ?? ""),
  processedByClerkUserId: String(row.processed_by_clerk_user_id ?? ""),
  processedAt: String(row.processed_at ?? ""),
});

export const listProcessedWeeklyResponses = async (workspaceId?: string): Promise<WeeklyResponseProcessingRecord[]> => {
  const sql = createContentStorageClient();
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const rows = await sql`
    SELECT workspace_id, athlete_id, response_timestamp, processed_by_clerk_user_id, processed_at
    FROM weekly_response_processing
    WHERE workspace_id = ${resolvedWorkspaceId}
    ORDER BY processed_at DESC
  `;

  return rows.map((row) => mapRow(row as Record<string, unknown>));
};

export const markWeeklyResponseProcessed = async (
  input: MarkWeeklyResponseProcessedInput,
): Promise<WeeklyResponseProcessingRecord> => {
  const sql = createContentStorageClient();
  const workspaceId = resolveWorkspaceId(input.workspaceId);
  const athleteId = normalize(input.athleteId);
  const responseTimestamp = normalize(input.responseTimestamp);
  const processedByClerkUserId = normalize(input.processedByClerkUserId);
  const processedAt = new Date().toISOString();

  const rows = await sql`
    INSERT INTO weekly_response_processing (
      workspace_id,
      athlete_id,
      response_timestamp,
      processed_by_clerk_user_id,
      processed_at
    )
    VALUES (${workspaceId}, ${athleteId}, ${responseTimestamp}, ${processedByClerkUserId}, ${processedAt})
    ON CONFLICT (workspace_id, athlete_id, response_timestamp)
    DO UPDATE SET
      processed_by_clerk_user_id = EXCLUDED.processed_by_clerk_user_id,
      processed_at = EXCLUDED.processed_at
    RETURNING workspace_id, athlete_id, response_timestamp, processed_by_clerk_user_id, processed_at
  `;

  return mapRow(rows[0] as Record<string, unknown>);
};

export const listProcessedMonthlyResponses = async (workspaceId?: string): Promise<MonthlyResponseProcessingRecord[]> => {
  const sql = createContentStorageClient();
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const rows = await sql`
    SELECT workspace_id, athlete_id, response_timestamp, processed_by_clerk_user_id, processed_at
    FROM monthly_response_processing
    WHERE workspace_id = ${resolvedWorkspaceId}
    ORDER BY processed_at DESC
  `;

  return rows.map((row) => mapRow(row as Record<string, unknown>));
};

export const markMonthlyResponseProcessed = async (
  input: MarkWeeklyResponseProcessedInput,
): Promise<MonthlyResponseProcessingRecord> => {
  const sql = createContentStorageClient();
  const workspaceId = resolveWorkspaceId(input.workspaceId);
  const athleteId = normalize(input.athleteId);
  const responseTimestamp = normalize(input.responseTimestamp);
  const processedByClerkUserId = normalize(input.processedByClerkUserId);
  const processedAt = new Date().toISOString();

  const rows = await sql`
    INSERT INTO monthly_response_processing (
      workspace_id,
      athlete_id,
      response_timestamp,
      processed_by_clerk_user_id,
      processed_at
    )
    VALUES (${workspaceId}, ${athleteId}, ${responseTimestamp}, ${processedByClerkUserId}, ${processedAt})
    ON CONFLICT (workspace_id, athlete_id, response_timestamp)
    DO UPDATE SET
      processed_by_clerk_user_id = EXCLUDED.processed_by_clerk_user_id,
      processed_at = EXCLUDED.processed_at
    RETURNING workspace_id, athlete_id, response_timestamp, processed_by_clerk_user_id, processed_at
  `;

  return mapRow(rows[0] as Record<string, unknown>);
};