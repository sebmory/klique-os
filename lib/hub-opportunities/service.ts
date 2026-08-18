import { randomUUID } from "crypto";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { createContentStorageClient, getDefaultWorkspaceId } from "@/lib/content-storage/db";

export type HubOpportunityStatus = "Ouverte" | "Bientôt" | "Fermée" | "Brouillon";
export type HubOpportunityCategory = "Collaboration" | "Shooting" | "Événement" | "Média" | "Casting" | "Partenariat" | "Sport" | "Autre";

export type HubOpportunityRecord = {
  id: string;
  workspaceId: string;
  title: string;
  type: HubOpportunityCategory | string;
  organization: string;
  targetAudience: string;
  sportOrDomain: string;
  location: string;
  date: string;
  deadline: string;
  description: string;
  requirements: string;
  practicalInfo: string;
  status: HubOpportunityStatus;
  authorClerkUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type HubOpportunityInterestRecord = {
  opportunityId: string;
  clerkUserId: string;
  createdAt: string;
};

export type HubOpportunityCreateInput = {
  title: string;
  type: string;
  organization: string;
  targetAudience: string;
  sportOrDomain: string;
  location: string;
  date: string;
  deadline: string;
  description: string;
  requirements: string;
  practicalInfo: string;
  status: string;
};

const getSql = () => createContentStorageClient();

// Toute valeur de statut differente de "Brouillon" est consideree comme publiee.
const publishedStatuses: HubOpportunityStatus[] = ["Ouverte", "Bientôt", "Fermée"];

type ActiveAccess = {
  role: string;
  workspaceId: string;
  athleteId: string | null;
};

export const resolveActiveAccess = async (request: Request): Promise<ActiveAccess> => {
  const profile = await getCurrentUserAccessProfile(request);
  const access = profile?.userAccess ?? null;

  if (!profile?.clerkUser?.id) {
    throw new Error("Unauthorized");
  }

  const workspaceId = access?.workspaceId?.trim() ?? "";
  const role = access?.role ?? "";
  const isKnownRole = ["admin", "athlete", "partner_expert", "media"].includes(role);

  if (access?.status !== "active" || !workspaceId || !isKnownRole) {
    throw new Error("Forbidden");
  }

  return { role, workspaceId, athleteId: access?.athleteId?.trim() || null };
};

const normalizeStatus = (value: unknown): HubOpportunityStatus => {
  if (value === "Ouverte" || value === "Bientôt" || value === "Fermée" || value === "Brouillon") {
    return value;
  }
  return "Brouillon";
};

const normalizeCategory = (value: unknown): HubOpportunityCategory | string => {
  if (typeof value === "string") {
    return value;
  }
  return "Autre";
};

const ensureHubOpportunityTables = async () => {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS hub_opportunities (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'klique-os',
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      organization TEXT NOT NULL,
      target_audience TEXT NOT NULL,
      sport_or_domain TEXT NOT NULL,
      location TEXT NOT NULL,
      date TEXT NOT NULL,
      deadline TEXT NOT NULL,
      description TEXT NOT NULL,
      requirements TEXT NOT NULL,
      practical_info TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Ouverte', 'Bientôt', 'Fermée', 'Brouillon')),
      author_clerk_user_id TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS hub_opportunities_workspace_status_created_at_idx
      ON hub_opportunities (workspace_id, status, created_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS hub_opportunity_interests (
      opportunity_id TEXT NOT NULL REFERENCES hub_opportunities(id) ON DELETE CASCADE,
      clerk_user_id TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      PRIMARY KEY (opportunity_id, clerk_user_id)
    )
  `;
};

const mapOpportunityRow = (row: Record<string, unknown>): HubOpportunityRecord => ({
  id: String(row.id ?? ""),
  workspaceId: String(row.workspace_id ?? ""),
  title: String(row.title ?? ""),
  type: normalizeCategory(row.type),
  organization: String(row.organization ?? ""),
  targetAudience: String(row.target_audience ?? ""),
  sportOrDomain: String(row.sport_or_domain ?? ""),
  location: String(row.location ?? ""),
  date: String(row.date ?? ""),
  deadline: String(row.deadline ?? ""),
  description: String(row.description ?? ""),
  requirements: String(row.requirements ?? ""),
  practicalInfo: String(row.practical_info ?? ""),
  status: normalizeStatus(row.status),
  authorClerkUserId: String(row.author_clerk_user_id ?? ""),
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
});

const mapInterestRow = (row: Record<string, unknown>): HubOpportunityInterestRecord => ({
  opportunityId: String(row.opportunity_id ?? ""),
  clerkUserId: String(row.clerk_user_id ?? ""),
  createdAt: String(row.created_at ?? ""),
});

export const loadHubOpportunities = async (request: Request, currentUserId: string | null) => {
  const access = await resolveActiveAccess(request);
  await ensureHubOpportunityTables();
  const sql = getSql();

  const rows = access.role === "admin"
    ? await sql`
        SELECT id, workspace_id, title, type, organization, target_audience, sport_or_domain, location, date, deadline, description, requirements, practical_info, status, author_clerk_user_id, created_at, updated_at
        FROM hub_opportunities
        WHERE workspace_id = ${access.workspaceId}
        ORDER BY created_at DESC, id DESC
      `
    : await sql`
        SELECT id, workspace_id, title, type, organization, target_audience, sport_or_domain, location, date, deadline, description, requirements, practical_info, status, author_clerk_user_id, created_at, updated_at
        FROM hub_opportunities
        WHERE workspace_id = ${access.workspaceId} AND status = ANY(${publishedStatuses})
        ORDER BY created_at DESC, id DESC
      `;

  const opportunities = rows.map((row) => mapOpportunityRow(row as Record<string, unknown>));

  let currentUserInterestIds: string[] = [];
  if (currentUserId && opportunities.length > 0) {
    const visibleIds = opportunities.map((opportunity) => opportunity.id);
    const interestRows = await sql`
      SELECT opportunity_id
      FROM hub_opportunity_interests
      WHERE clerk_user_id = ${currentUserId} AND opportunity_id = ANY(${visibleIds})
    `;
    currentUserInterestIds = interestRows.map((row) => String(row.opportunity_id ?? ""));
  }

  return {
    opportunities,
    currentUserInterestIds,
  };
};

export const createHubOpportunity = async (request: Request, input: HubOpportunityCreateInput, currentUserId: string | null) => {
  const access = await resolveActiveAccess(request);

  if (!currentUserId || access.role !== "admin") {
    throw new Error("Forbidden");
  }

  await ensureHubOpportunityTables();
  const sql = getSql();
  const now = new Date().toISOString();
  const id = randomUUID();
  const workspaceId = access.workspaceId || getDefaultWorkspaceId();

  const rows = await sql`
    INSERT INTO hub_opportunities (
      id,
      workspace_id,
      title,
      type,
      organization,
      target_audience,
      sport_or_domain,
      location,
      date,
      deadline,
      description,
      requirements,
      practical_info,
      status,
      author_clerk_user_id,
      created_at,
      updated_at
    )
    VALUES (
      ${id},
      ${workspaceId},
      ${input.title},
      ${input.type},
      ${input.organization},
      ${input.targetAudience},
      ${input.sportOrDomain},
      ${input.location},
      ${input.date},
      ${input.deadline},
      ${input.description},
      ${input.requirements},
      ${input.practicalInfo},
      ${normalizeStatus(input.status)},
      ${currentUserId},
      ${now},
      ${now}
    )
    RETURNING id, workspace_id, title, type, organization, target_audience, sport_or_domain, location, date, deadline, description, requirements, practical_info, status, author_clerk_user_id, created_at, updated_at
  `;

  return mapOpportunityRow(rows[0] as Record<string, unknown>);
};

export const toggleHubOpportunityInterest = async (request: Request, opportunityId: string, currentUserId: string | null) => {
  if (!currentUserId) {
    throw new Error("Unauthorized");
  }

  const access = await resolveActiveAccess(request);

  await ensureHubOpportunityTables();
  const sql = getSql();

  const opportunityRows = await sql`
    SELECT id FROM hub_opportunities
    WHERE id = ${opportunityId}
      AND workspace_id = ${access.workspaceId}
      AND status = ANY(${publishedStatuses})
  `;
  if (!opportunityRows[0]) {
    throw new Error("NotFound");
  }

  const existingRows = await sql`
    SELECT opportunity_id
    FROM hub_opportunity_interests
    WHERE opportunity_id = ${opportunityId} AND clerk_user_id = ${currentUserId}
  `;

  if (existingRows[0]) {
    await sql`
      DELETE FROM hub_opportunity_interests
      WHERE opportunity_id = ${opportunityId} AND clerk_user_id = ${currentUserId}
    `;
    return { opportunityId, interested: false };
  }

  await sql`
    INSERT INTO hub_opportunity_interests (opportunity_id, clerk_user_id, created_at)
    VALUES (${opportunityId}, ${currentUserId}, NOW())
  `;

  return { opportunityId, interested: true };
};

export const updateHubOpportunity = async (
  request: Request,
  opportunityId: string,
  input: HubOpportunityCreateInput,
) => {
  const access = await resolveActiveAccess(request);
  if (access.role !== "admin") {
    throw new Error("Forbidden");
  }

  const id = String(opportunityId ?? "").trim();
  const title = String(input.title ?? "").trim();
  const type = String(input.type ?? "").trim();
  const description = String(input.description ?? "").trim();

  if (!id || !title || !type || !description) {
    throw new Error("InvalidInput");
  }

  await ensureHubOpportunityTables();
  const sql = getSql();

  const rows = await sql`
    UPDATE hub_opportunities
    SET
      title = ${title},
      type = ${type},
      organization = ${input.organization},
      target_audience = ${input.targetAudience},
      sport_or_domain = ${input.sportOrDomain},
      location = ${input.location},
      date = ${input.date},
      deadline = ${input.deadline},
      description = ${description},
      requirements = ${input.requirements},
      practical_info = ${input.practicalInfo},
      status = ${normalizeStatus(input.status)},
      updated_at = NOW()
    WHERE id = ${id} AND workspace_id = ${access.workspaceId}
    RETURNING id, workspace_id, title, type, organization, target_audience, sport_or_domain, location, date, deadline, description, requirements, practical_info, status, author_clerk_user_id, created_at, updated_at
  `;

  if (!rows[0]) {
    throw new Error("NotFound");
  }

  return mapOpportunityRow(rows[0] as Record<string, unknown>);
};

// Les interets, creneaux et demandes sont supprimes par les contraintes ON DELETE CASCADE.
export const deleteHubOpportunity = async (request: Request, opportunityId: string) => {
  const access = await resolveActiveAccess(request);
  if (access.role !== "admin") {
    throw new Error("Forbidden");
  }

  const id = String(opportunityId ?? "").trim();
  if (!id) {
    throw new Error("InvalidInput");
  }

  await ensureHubOpportunityTables();
  const sql = getSql();

  const rows = await sql`
    DELETE FROM hub_opportunities
    WHERE id = ${id} AND workspace_id = ${access.workspaceId}
    RETURNING id
  `;

  if (!rows[0]) {
    throw new Error("NotFound");
  }

  return { id: String((rows[0] as Record<string, unknown>).id ?? "") };
};

export const listHubOpportunityInterests = async (request: Request, currentUserId: string | null) => {
  if (!currentUserId) {
    return [];
  }

  await ensureHubOpportunityTables();
  const sql = getSql();
  const rows = await sql`
    SELECT opportunity_id, clerk_user_id, created_at
    FROM hub_opportunity_interests
    WHERE clerk_user_id = ${currentUserId}
  `;

  return rows.map((row) => mapInterestRow(row as Record<string, unknown>));
};
