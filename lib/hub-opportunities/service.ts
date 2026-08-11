import { randomUUID } from "crypto";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { createContentStorageClient } from "@/lib/content-storage/db";

export type HubOpportunityStatus = "Ouverte" | "Bientôt" | "Fermée" | "Brouillon";
export type HubOpportunityCategory = "Collaboration" | "Shooting" | "Événement" | "Média" | "Casting" | "Partenariat" | "Sport" | "Autre";

export type HubOpportunityRecord = {
  id: string;
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
  await ensureHubOpportunityTables();
  const sql = getSql();

  const rows = await sql`
    SELECT id, title, type, organization, target_audience, sport_or_domain, location, date, deadline, description, requirements, practical_info, status, author_clerk_user_id, created_at, updated_at
    FROM hub_opportunities
    ORDER BY created_at DESC, id DESC
  `;

  const opportunities = rows.map((row) => mapOpportunityRow(row as Record<string, unknown>));

  let currentUserInterestIds: string[] = [];
  if (currentUserId) {
    const interestRows = await sql`
      SELECT opportunity_id
      FROM hub_opportunity_interests
      WHERE clerk_user_id = ${currentUserId}
    `;
    currentUserInterestIds = interestRows.map((row) => String(row.opportunity_id ?? ""));
  }

  return {
    opportunities,
    currentUserInterestIds,
  };
};

export const createHubOpportunity = async (request: Request, input: HubOpportunityCreateInput, currentUserId: string | null) => {
  const accessProfile = await getCurrentUserAccessProfile(request);
  const role = accessProfile?.userAccess?.role ?? null;

  if (!currentUserId || !accessProfile?.clerkUser?.id || role !== "admin") {
    throw new Error("Forbidden");
  }

  await ensureHubOpportunityTables();
  const sql = getSql();
  const now = new Date().toISOString();
  const id = randomUUID();

  const rows = await sql`
    INSERT INTO hub_opportunities (
      id,
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
      ${input.status},
      ${currentUserId},
      ${now},
      ${now}
    )
    RETURNING id, title, type, organization, target_audience, sport_or_domain, location, date, deadline, description, requirements, practical_info, status, author_clerk_user_id, created_at, updated_at
  `;

  return mapOpportunityRow(rows[0] as Record<string, unknown>);
};

export const toggleHubOpportunityInterest = async (request: Request, opportunityId: string, currentUserId: string | null) => {
  if (!currentUserId) {
    throw new Error("Unauthorized");
  }

  const accessProfile = await getCurrentUserAccessProfile(request);
  const role = accessProfile?.userAccess?.role ?? null;
  if (!accessProfile?.clerkUser?.id || !role || !["admin", "athlete", "partner_expert", "media"].includes(role)) {
    throw new Error("Forbidden");
  }

  await ensureHubOpportunityTables();
  const sql = getSql();

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

  const opportunityRows = await sql`
    SELECT id FROM hub_opportunities WHERE id = ${opportunityId}
  `;
  if (!opportunityRows[0]) {
    throw new Error("NotFound");
  }

  await sql`
    INSERT INTO hub_opportunity_interests (opportunity_id, clerk_user_id, created_at)
    VALUES (${opportunityId}, ${currentUserId}, NOW())
  `;

  return { opportunityId, interested: true };
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
