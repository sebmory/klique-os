import { randomUUID } from "crypto";
import { createContentStorageClient, getDefaultWorkspaceId } from "@/lib/content-storage/db";

export const contactRequestCategories = [
  "content_photo",
  "support",
  "partner_benefit",
  "technical",
  "other",
] as const;

export const contactRequestStatuses = ["open", "in_progress", "resolved"] as const;

export type ContactRequestCategory = (typeof contactRequestCategories)[number];
export type ContactRequestStatus = (typeof contactRequestStatuses)[number];

export const contactRequestSubjectMaxLength = 150;
export const contactRequestMessageMaxLength = 3000;

export type ContactRequestRecord = {
  id: string;
  workspaceId: string;
  athleteId: string;
  category: ContactRequestCategory;
  subject: string;
  message: string;
  status: ContactRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateContactRequestInput = {
  workspaceId?: string;
  athleteId: string;
  category: ContactRequestCategory;
  subject: string;
  message: string;
  id?: string;
};

const getSql = () => createContentStorageClient();

const normalize = (value: unknown): string => String(value ?? "").trim();

const resolveWorkspaceId = (workspaceId?: string): string => {
  const normalized = normalize(workspaceId);
  if (normalized) return normalized;
  return getDefaultWorkspaceId();
};

export const isContactRequestCategory = (value: unknown): value is ContactRequestCategory =>
  typeof value === "string" && contactRequestCategories.includes(value as ContactRequestCategory);

export const isContactRequestStatus = (value: unknown): value is ContactRequestStatus =>
  typeof value === "string" && contactRequestStatuses.includes(value as ContactRequestStatus);

const mapRow = (row: Record<string, unknown>): ContactRequestRecord => ({
  id: String(row.id ?? ""),
  workspaceId: String(row.workspace_id ?? ""),
  athleteId: String(row.athlete_id ?? ""),
  category: String(row.category ?? "other") as ContactRequestCategory,
  subject: String(row.subject ?? ""),
  message: String(row.message ?? ""),
  status: String(row.status ?? "open") as ContactRequestStatus,
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
});

export const createContactRequest = async (input: CreateContactRequestInput): Promise<ContactRequestRecord> => {
  const sql = getSql();
  const resolvedWorkspaceId = resolveWorkspaceId(input.workspaceId);
  const now = new Date().toISOString();
  const id = normalize(input.id) || randomUUID();

  const rows = await sql`
    INSERT INTO contact_requests (
      id,
      workspace_id,
      athlete_id,
      category,
      subject,
      message,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ${id},
      ${resolvedWorkspaceId},
      ${normalize(input.athleteId)},
      ${input.category},
      ${normalize(input.subject)},
      ${normalize(input.message)},
      'open',
      ${now},
      ${now}
    )
    RETURNING id, workspace_id, athlete_id, category, subject, message, status, created_at, updated_at
  `;

  return mapRow(rows[0] as Record<string, unknown>);
};

export const listContactRequests = async (workspaceId?: string): Promise<ContactRequestRecord[]> => {
  const sql = getSql();
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);

  const rows = await sql`
    SELECT id, workspace_id, athlete_id, category, subject, message, status, created_at, updated_at
    FROM contact_requests
    WHERE workspace_id = ${resolvedWorkspaceId}
    ORDER BY created_at DESC
  `;

  return rows.map((row) => mapRow(row as Record<string, unknown>));
};

export const updateContactRequestStatus = async (
  contactRequestId: string,
  status: ContactRequestStatus,
  workspaceId?: string,
): Promise<ContactRequestRecord | null> => {
  const id = normalize(contactRequestId);
  if (!id) return null;

  const sql = getSql();
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const now = new Date().toISOString();

  const rows = await sql`
    UPDATE contact_requests
    SET status = ${status}, updated_at = ${now}
    WHERE workspace_id = ${resolvedWorkspaceId} AND id = ${id}
    RETURNING id, workspace_id, athlete_id, category, subject, message, status, created_at, updated_at
  `;

  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
};
