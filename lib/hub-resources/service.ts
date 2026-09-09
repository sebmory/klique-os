import { randomUUID } from "crypto";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { createContentStorageClient } from "@/lib/content-storage/db";

export type HubResourceStatus = "draft" | "published";

export type HubResourceRecord = {
  id: string;
  title: string;
  category: string;
  author: string;
  type: string;
  description: string;
  content: string;
  url: string | null;
  coverImageUrl: string | null;
  status: HubResourceStatus;
  date: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HubResourceCreateInput = {
  title: string;
  category: string;
  author: string;
  type: string;
  description: string;
  content: string;
  status: string;
  date: string;
  coverImageUrl?: string | null;
};

const getSql = () => createContentStorageClient();

const normalizeStatus = (value: unknown): HubResourceStatus => {
  if (value === "published" || value === "draft") {
    return value;
  }
  if (value === "Publié" || value === "published") {
    return "published";
  }
  return "draft";
};

// Une date de ressource est une date civile : jamais une date locale type "Tue Sep 08 2026" ni un horodatage.
export const normalizeResourceDate = (value: unknown): string | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isoPrefix = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (isoPrefix) return isoPrefix[1];
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  // Une date locale designe un jour calendaire local : la convertir en UTC decalerait la veille.
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const todayDate = (): string => new Date().toISOString().slice(0, 10);

const isUrlLike = (value: string): boolean => /^https?:\/\//i.test(value.trim());

// La couverture est facultative : seule une URL https est acceptee, tout le reste devient NULL.
export const normalizeCoverImageUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const initialSeedResources: HubResourceCreateInput[] = [
  {
    title: "Guide mental : retrouver un rythme stable avant une saison",
    category: "Mental",
    author: "Dr. Anaïs Laurent, psychologue du sport",
    type: "Guide",
    description: "Un mini guide pratique pour structurer son énergie mentale et préserver sa concentration sur la période pré-compétition.",
    content: "Ce guide propose une méthode simple pour préparer sa concentration avant une compétition : respiration, cadrage du jour, puis priorités claires.",
    status: "published",
    date: new Date().toISOString().slice(0, 10),
  },
  {
    title: "Routine nutrition pour garder de l’énergie toute la semaine",
    category: "Nutrition",
    author: "Mina, diététicienne sportive",
    type: "Article",
    description: "Des repères concrets pour mieux répartir l’énergie, éviter les pics de fatigue et maintenir une récupération stable.",
    content: "L’article détaille une routine simple de nutrition avant et après l’entraînement pour préserver l’énergie sur la semaine.",
    status: "published",
    date: new Date().toISOString().slice(0, 10),
  },
];

const ensureHubResourceTables = async () => {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS hub_resources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      author TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      content TEXT NOT NULL,
      url TEXT,
      cover_image_url TEXT,
      status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
      published_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`ALTER TABLE hub_resources ADD COLUMN IF NOT EXISTS cover_image_url TEXT`;
};

const seedHubResourcesIfEmpty = async (sql: ReturnType<typeof getSql>) => {
  const existingRows = await sql`SELECT id FROM hub_resources LIMIT 1`;
  if (existingRows[0]) {
    return;
  }

  const now = new Date().toISOString();
  for (const seed of initialSeedResources) {
    const normalizedStatus = normalizeStatus(seed.status);
    const seedId = randomUUID();
    const resolvedUrl = isUrlLike(seed.content) ? seed.content : null;
    const resolvedContent = resolvedUrl ? "" : seed.content;

    await sql`
      INSERT INTO hub_resources (
        id,
        title,
        category,
        author,
        type,
        description,
        content,
        url,
        status,
        published_at,
        created_at,
        updated_at
      )
      VALUES (
        ${seedId},
        ${seed.title},
        ${seed.category},
        ${seed.author},
        ${seed.type},
        ${seed.description},
        ${resolvedContent},
        ${resolvedUrl},
        ${normalizedStatus},
        ${normalizedStatus === "published" ? now.slice(0, 10) : null},
        ${now},
        ${now}
      )
    `;
  }
};

const mapResourceRow = (row: Record<string, unknown>): HubResourceRecord => ({
  id: String(row.id ?? ""),
  title: String(row.title ?? ""),
  category: String(row.category ?? "Autre"),
  author: String(row.author ?? "KLIQUE"),
  type: String(row.type ?? "Article"),
  description: String(row.description ?? ""),
  content: String(row.content ?? ""),
  url: typeof row.url === "string" ? row.url : null,
  coverImageUrl: normalizeCoverImageUrl(row.cover_image_url),
  status: normalizeStatus(row.status),
  date: normalizeResourceDate(row.published_at) ?? todayDate(),
  publishedAt: normalizeResourceDate(row.published_at),
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
});

export const filterResourcesForAccess = (resources: Array<{ id: string; status: string }>, isAdmin: boolean) => {
  if (isAdmin) {
    return resources;
  }
  return resources.filter((resource) => resource.status === "published" || resource.status === "Publié");
};

export const loadHubResources = async (request: Request, currentUserId: string | null) => {
  await ensureHubResourceTables();
  const sql = getSql();
  await seedHubResourcesIfEmpty(sql);

  const accessProfile = await getCurrentUserAccessProfile(request);
  const isAdmin = accessProfile?.userAccess?.role === "admin";

  const rows = await sql`
    SELECT id, title, category, author, type, description, content, url, cover_image_url, status, published_at, created_at, updated_at
    FROM hub_resources
    ORDER BY created_at DESC, id DESC
  `;

  const resources = rows.map((row) => mapResourceRow(row as Record<string, unknown>));
  return {
    resources: filterResourcesForAccess(
      resources.map((resource) => ({ id: resource.id, status: resource.status === "published" ? "published" : "draft" })),
      isAdmin
    ).map((resource) => resources.find((item) => item.id === resource.id)).filter(Boolean) as HubResourceRecord[],
  };
};

export const getHubResourceById = async (request: Request, resourceId: string, currentUserId: string | null) => {
  await ensureHubResourceTables();
  const sql = getSql();
  await seedHubResourcesIfEmpty(sql);

  const accessProfile = await getCurrentUserAccessProfile(request);
  const isAdmin = accessProfile?.userAccess?.role === "admin";

  const rows = await sql`
    SELECT id, title, category, author, type, description, content, url, cover_image_url, status, published_at, created_at, updated_at
    FROM hub_resources
    WHERE id = ${resourceId}
    LIMIT 1
  `;

  if (!rows[0]) {
    return null;
  }

  const resource = mapResourceRow(rows[0] as Record<string, unknown>);
  if (!isAdmin && resource.status !== "published") {
    return null;
  }

  return resource;
};

export const createHubResource = async (request: Request, input: HubResourceCreateInput, currentUserId: string | null) => {
  const accessProfile = await getCurrentUserAccessProfile(request);
  const role = accessProfile?.userAccess?.role ?? null;

  if (!currentUserId || !accessProfile?.clerkUser?.id || role !== "admin") {
    throw new Error("Forbidden");
  }

  await ensureHubResourceTables();
  const sql = getSql();
  const now = new Date().toISOString();
  const id = randomUUID();
  const normalizedStatus = normalizeStatus(input.status);
  const resolvedUrl = isUrlLike(input.content) ? input.content : null;
  const resolvedContent = resolvedUrl ? "" : input.content;
  const publishedAt = normalizedStatus === "published" ? normalizeResourceDate(input.date) ?? todayDate() : null;
  const coverImageUrl = normalizeCoverImageUrl(input.coverImageUrl);

  const rows = await sql`
    INSERT INTO hub_resources (
      id,
      title,
      category,
      author,
      type,
      description,
      content,
      url,
      cover_image_url,
      status,
      published_at,
      created_at,
      updated_at
    )
    VALUES (
      ${id},
      ${input.title},
      ${input.category},
      ${input.author},
      ${input.type},
      ${input.description},
      ${resolvedContent},
      ${resolvedUrl},
      ${coverImageUrl},
      ${normalizedStatus},
      ${publishedAt},
      ${now},
      ${now}
    )
    RETURNING id, title, category, author, type, description, content, url, cover_image_url, status, published_at, created_at, updated_at
  `;

  return mapResourceRow(rows[0] as Record<string, unknown>);
};

export const updateHubResource = async (request: Request, resourceId: string, input: HubResourceCreateInput, currentUserId: string | null) => {
  const accessProfile = await getCurrentUserAccessProfile(request);
  const role = accessProfile?.userAccess?.role ?? null;

  if (!currentUserId || !accessProfile?.clerkUser?.id || role !== "admin") {
    throw new Error("Forbidden");
  }

  await ensureHubResourceTables();
  const sql = getSql();
  const normalizedStatus = normalizeStatus(input.status);
  const now = new Date().toISOString();
  const resolvedUrl = isUrlLike(input.content) ? input.content : null;
  const resolvedContent = resolvedUrl ? "" : input.content;
  const publishedAt = normalizedStatus === "published" ? normalizeResourceDate(input.date) ?? todayDate() : null;
  const coverImageUrl = normalizeCoverImageUrl(input.coverImageUrl);

  const rows = await sql`
    UPDATE hub_resources
    SET title = ${input.title},
        category = ${input.category},
        author = ${input.author},
        type = ${input.type},
        description = ${input.description},
        content = ${resolvedContent},
        url = ${resolvedUrl},
        cover_image_url = ${coverImageUrl},
        status = ${normalizedStatus},
        published_at = ${publishedAt},
        updated_at = ${now}
    WHERE id = ${resourceId}
    RETURNING id, title, category, author, type, description, content, url, cover_image_url, status, published_at, created_at, updated_at
  `;

  if (!rows[0]) {
    throw new Error("NotFound");
  }

  return mapResourceRow(rows[0] as Record<string, unknown>);
};

export const deleteHubResource = async (request: Request, resourceId: string, currentUserId: string | null) => {
  const accessProfile = await getCurrentUserAccessProfile(request);
  const role = accessProfile?.userAccess?.role ?? null;

  if (!currentUserId || !accessProfile?.clerkUser?.id || role !== "admin") {
    throw new Error("Forbidden");
  }

  await ensureHubResourceTables();
  const sql = getSql();
  await sql`DELETE FROM hub_resources WHERE id = ${resourceId}`;
  return { success: true };
};
