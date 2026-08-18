import { randomUUID } from "crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";

export type CommunityRole = "admin" | "athlete" | "partner_expert" | "media";

type CurrentAccessProfile = Awaited<ReturnType<typeof getCurrentUserAccessProfile>>;

type ClerkUserMiniProfile = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

type AuthorProfile = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type CommunityCommentRecord = {
  id: string;
  publicationId: string;
  clerkUserId: string;
  authorName: string;
  authorRole: CommunityRole;
  authorSpecialty?: string | null;
  authorProfilePath?: string | null;
  text: string;
  createdAt: string;
};

export type CommunityPublicationRecord = {
  id: string;
  authorClerkUserId: string;
  authorRole: CommunityRole;
  authorSpecialty?: string | null;
  authorProfilePath?: string | null;
  type: string;
  title: string | null;
  content: string;
  createdAt: string;
  authorDisplayName: string;
  reactions: number;
  reactedByCurrentUser: boolean;
  comments: CommunityCommentRecord[];
};

const getSql = () => createContentStorageClient();

const createCommunityTables = async () => {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS community_publications (
      id TEXT PRIMARY KEY,
      author_clerk_user_id TEXT NOT NULL,
      author_role TEXT NOT NULL CHECK (author_role IN ('admin', 'athlete', 'partner_expert', 'media')),
      type TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_reactions (
      id TEXT PRIMARY KEY,
      publication_id TEXT NOT NULL REFERENCES community_publications(id) ON DELETE CASCADE,
      clerk_user_id TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (publication_id, clerk_user_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_comments (
      id TEXT PRIMARY KEY,
      publication_id TEXT NOT NULL REFERENCES community_publications(id) ON DELETE CASCADE,
      clerk_user_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`ALTER TABLE community_publications ADD COLUMN IF NOT EXISTS author_name TEXT`;
  await sql`ALTER TABLE community_publications ADD COLUMN IF NOT EXISTS author_role TEXT`;
  await sql`ALTER TABLE community_publications ADD COLUMN IF NOT EXISTS author_specialty TEXT`;
  await sql`ALTER TABLE community_comments ADD COLUMN IF NOT EXISTS author_name TEXT`;
  await sql`ALTER TABLE community_comments ADD COLUMN IF NOT EXISTS author_role TEXT`;
  await sql`ALTER TABLE community_comments ADD COLUMN IF NOT EXISTS author_specialty TEXT`;
};

const normalizeRole = (value: unknown): CommunityRole => {
  if (value === "admin" || value === "athlete" || value === "partner_expert" || value === "media") {
    return value;
  }
  return "athlete";
};

const getAuthorDisplayName = (profile: { clerkUser?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null } | null | undefined): string => {
  const firstName = profile?.clerkUser?.firstName?.trim();
  const lastName = profile?.clerkUser?.lastName?.trim();
  if (firstName && lastName) return `${firstName} ${lastName}`;
  if (firstName) return firstName;
  if (lastName) return lastName;
  return profile?.clerkUser?.email?.split("@")[0] ?? "KLIQUE OS";
};

const getAuthorProfile = async (profile: CurrentAccessProfile | null | undefined): Promise<AuthorProfile> => {
  if (!profile?.clerkUser?.id) {
    return { id: "", email: null, firstName: null, lastName: null };
  }

  const clerkUserProfile = await getClerkUserMiniProfile(profile.clerkUser.id);
  return {
    id: profile.clerkUser.id,
    email: profile.clerkUser.email ?? clerkUserProfile?.email ?? null,
    firstName: clerkUserProfile?.firstName ?? null,
    lastName: clerkUserProfile?.lastName ?? null,
  };
};

const getClerkUserMiniProfile = async (userId: string): Promise<ClerkUserMiniProfile | null> => {
  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    return {
      id: clerkUser.id,
      email: clerkUser.emailAddresses?.[0]?.emailAddress ?? null,
      firstName: clerkUser.firstName ?? null,
      lastName: clerkUser.lastName ?? null,
    };
  } catch {
    return null;
  }
};

const resolveAuthorSpecialty = async (
  sql: ReturnType<typeof getSql>,
  authorClerkUserId: string,
  authorRole: CommunityRole,
  fallbackSpecialty: string | null
): Promise<string | null> => {
  if (fallbackSpecialty) {
    return fallbackSpecialty;
  }

  if (authorRole === "athlete") {
    try {
      const accessRows = await sql`SELECT athlete_id FROM user_access WHERE clerk_user_id = ${authorClerkUserId}`;
      const athleteId = typeof accessRows[0]?.athlete_id === "string" ? accessRows[0].athlete_id : null;
      if (!athleteId) {
        return "Athlète";
      }

      const athletes = await getAthletesFromGoogleSheets();
      const matchedAthlete = athletes.find((athlete) => athlete.key === athleteId);
      const sport = matchedAthlete?.sport?.trim();
      return sport || "Athlète";
    } catch {
      return "Athlète";
    }
  }

  if (authorRole === "partner_expert") {
    return "Expert / partenaire";
  }

  return null;
};

const resolveAuthorProfilePath = async (
  sql: ReturnType<typeof getSql>,
  currentProfile: CurrentAccessProfile,
  authorClerkUserId: string,
  authorRole: CommunityRole
): Promise<string | null> => {
  if (!currentProfile?.clerkUser?.id) {
    return null;
  }

  const isOwnProfile = currentProfile.clerkUser.id === authorClerkUserId;
  if (isOwnProfile && authorRole === "athlete") {
    return "/athlete/profile";
  }

  if (isOwnProfile && authorRole === "partner_expert") {
    return "/ecosysteme";
  }

  if (currentProfile.userAccess?.role === "admin") {
    const accessRows = await sql`SELECT athlete_id, partner_id FROM user_access WHERE clerk_user_id = ${authorClerkUserId}`;
    const authorAthleteId = typeof accessRows[0]?.athlete_id === "string" ? accessRows[0].athlete_id : null;
    const authorPartnerId = typeof accessRows[0]?.partner_id === "string" ? accessRows[0].partner_id : null;

    if (authorRole === "athlete" && authorAthleteId) {
      return `/crm/personnes/${encodeURIComponent(authorAthleteId)}`;
    }

    if (authorRole === "partner_expert" && authorPartnerId) {
      return `/ecosysteme/${encodeURIComponent(authorPartnerId)}`;
    }
  }

  return null;
};

const mapCommentRow = async (
  sql: ReturnType<typeof getSql>,
  row: Record<string, unknown>,
  currentProfile: CurrentAccessProfile,
  currentUserId: string | null
): Promise<CommunityCommentRecord> => {
  const authorRole = normalizeRole(row.author_role);
  const authorClerkUserId = String(row.clerk_user_id ?? "");
  const authorSpecialty = typeof row.author_specialty === "string" ? row.author_specialty : null;
  const authorProfilePath = currentProfile?.clerkUser?.id
    ? await resolveAuthorProfilePath(sql, currentProfile, authorClerkUserId, authorRole)
    : null;

  return {
    id: String(row.id ?? ""),
    publicationId: String(row.publication_id ?? ""),
    clerkUserId: authorClerkUserId,
    authorName: String(row.author_name ?? "KLIQUE"),
    authorRole,
    authorSpecialty,
    authorProfilePath,
    text: String(row.text ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
};

const mapPublicationRow = async (
  row: Record<string, unknown>,
  currentUserId: string | null,
  currentProfile: CurrentAccessProfile
): Promise<CommunityPublicationRecord> => {
  const sql = getSql();
  const publicationId = String(row.id ?? "");
  const authorClerkUserId = String(row.author_clerk_user_id ?? "");
  const authorRole = normalizeRole(row.author_role);
  const authorDisplayName = String(row.author_name ?? "KLIQUE OS");
  const authorSpecialty = typeof row.author_specialty === "string" ? row.author_specialty : null;

  const reactionRows = await sql`SELECT COUNT(*)::int AS count FROM community_reactions WHERE publication_id = ${publicationId}`;
  const reactedRows = currentUserId
    ? await sql`SELECT 1 FROM community_reactions WHERE publication_id = ${publicationId} AND clerk_user_id = ${currentUserId}`
    : [];
  const commentRows = await sql`SELECT id, publication_id, clerk_user_id, author_name, author_role, author_specialty, text, created_at FROM community_comments WHERE publication_id = ${publicationId} ORDER BY created_at ASC, id ASC`;

  const resolvedSpecialty = await resolveAuthorSpecialty(sql, authorClerkUserId, authorRole, authorSpecialty);
  const authorProfilePath = currentProfile?.clerkUser?.id
    ? await resolveAuthorProfilePath(sql, currentProfile, authorClerkUserId, authorRole)
    : null;

  return {
    id: publicationId,
    authorClerkUserId,
    authorRole,
    authorSpecialty: resolvedSpecialty,
    authorProfilePath,
    type: String(row.type ?? "publication"),
    title: typeof row.title === "string" ? row.title : null,
    content: String(row.content ?? ""),
    createdAt: String(row.created_at ?? ""),
    authorDisplayName,
    reactions: Number(reactionRows[0]?.count ?? 0),
    reactedByCurrentUser: currentUserId ? reactedRows.length > 0 : false,
    comments: await Promise.all(commentRows.map((commentRow) => mapCommentRow(sql, commentRow as Record<string, unknown>, currentProfile, currentUserId))),
  };
};

export const loadCommunityPublications = async (currentUserId: string | null, request?: Request): Promise<CommunityPublicationRecord[]> => {
  const currentProfile = request ? await getCurrentUserAccessProfile(request) : null;
  const access = currentProfile?.userAccess ?? null;

  if (!currentProfile?.clerkUser?.id) {
    throw new Error("Unauthorized");
  }

  const hasActiveAccess =
    access?.status === "active" &&
    Boolean(access.workspaceId?.trim()) &&
    ["admin", "athlete", "partner_expert", "media"].includes(access.role);

  if (!hasActiveAccess) {
    throw new Error("Forbidden");
  }

  await createCommunityTables();
  const sql = getSql();
  const rows = await sql`SELECT id, author_clerk_user_id, author_role, author_name, author_specialty, type, title, content, created_at FROM community_publications ORDER BY created_at DESC, id DESC`;

  const publications = [] as CommunityPublicationRecord[];
  for (const row of rows) {
    publications.push(await mapPublicationRow(row as Record<string, unknown>, currentUserId, currentProfile));
  }

  return publications;
};

export const createCommunityPublication = async (
  request: Request,
  payload: { title?: string; content?: string; type?: string }
): Promise<CommunityPublicationRecord> => {
  const profile = await getCurrentUserAccessProfile(request);
  if (!profile?.clerkUser?.id) {
    throw new Error("Unauthorized");
  }

  const access = profile.userAccess ?? null;
  if (access?.role !== "admin" || access.status !== "active" || !access.workspaceId?.trim()) {
    throw new Error("Forbidden");
  }

  await createCommunityTables();
  const sql = getSql();
  const publicationId = randomUUID();
  const title = payload.title?.trim() ?? "";
  const content = payload.content?.trim() ?? "";
  const resolvedType = payload.type?.trim() || "publication";
  const role = normalizeRole(profile.userAccess?.role ?? "athlete");
  const authorProfile = await getAuthorProfile(profile);
  const authorName = getAuthorDisplayName({ clerkUser: { firstName: authorProfile.firstName, lastName: authorProfile.lastName, email: authorProfile.email } });
  const authorSpecialty = await resolveAuthorSpecialty(sql, profile.clerkUser.id, role, null);

  await sql`
    INSERT INTO community_publications (
      id,
      author_clerk_user_id,
      author_name,
      author_role,
      author_specialty,
      type,
      title,
      content,
      created_at
    )
    VALUES (
      ${publicationId},
      ${profile.clerkUser.id},
      ${authorName},
      ${role},
      ${authorSpecialty},
      ${resolvedType},
      ${title || null},
      ${content},
      NOW()
    )
  `;

  return mapPublicationRow(
    {
      id: publicationId,
      author_clerk_user_id: profile.clerkUser.id,
      author_name: authorName,
      author_role: role,
      author_specialty: authorSpecialty,
      type: resolvedType,
      title: title || null,
      content,
      created_at: new Date().toISOString(),
    },
    profile.clerkUser.id,
    profile
  );
};

// Le workspace est resolu via user_access : community_publications ne porte pas encore de colonne workspace_id.
const requireActiveAdmin = async (request: Request) => {
  const profile = await getCurrentUserAccessProfile(request);
  if (!profile?.clerkUser?.id) {
    throw new Error("Unauthorized");
  }

  const access = profile.userAccess ?? null;
  if (access?.role !== "admin" || access.status !== "active" || !access.workspaceId?.trim()) {
    throw new Error("Forbidden");
  }

  return profile;
};

export const updateCommunityPublication = async (
  request: Request,
  publicationId: string,
  payload: { title?: string; content?: string }
): Promise<CommunityPublicationRecord> => {
  const profile = await requireActiveAdmin(request);

  const id = String(publicationId ?? "").trim();
  const title = payload.title?.trim() ?? "";
  const content = payload.content?.trim() ?? "";

  if (!id || !content) {
    throw new Error("InvalidInput");
  }

  await createCommunityTables();
  const sql = getSql();

  const rows = await sql`
    UPDATE community_publications
    SET title = ${title || null}, content = ${content}
    WHERE id = ${id}
    RETURNING id, author_clerk_user_id, author_role, author_name, author_specialty, type, title, content, created_at
  `;

  if (!rows[0]) {
    throw new Error("NotFound");
  }

  return mapPublicationRow(rows[0] as Record<string, unknown>, profile.clerkUser.id, profile);
};

export const deleteCommunityPublication = async (request: Request, publicationId: string): Promise<{ id: string }> => {
  await requireActiveAdmin(request);

  const id = String(publicationId ?? "").trim();
  if (!id) {
    throw new Error("InvalidInput");
  }

  await createCommunityTables();
  const sql = getSql();

  const rows = await sql`
    DELETE FROM community_publications
    WHERE id = ${id}
    RETURNING id
  `;

  if (!rows[0]) {
    throw new Error("NotFound");
  }

  return { id: String((rows[0] as Record<string, unknown>).id ?? "") };
};

export const toggleCommunityReaction = async (publicationId: string, request: Request): Promise<CommunityPublicationRecord> => {
  const profile = await getCurrentUserAccessProfile(request);
  if (!profile?.clerkUser?.id) {
    throw new Error("Unauthorized");
  }

  await createCommunityTables();
  const sql = getSql();
  const existingRows = await sql`SELECT id FROM community_reactions WHERE publication_id = ${publicationId} AND clerk_user_id = ${profile.clerkUser.id}`;

  if (existingRows[0]) {
    await sql`DELETE FROM community_reactions WHERE publication_id = ${publicationId} AND clerk_user_id = ${profile.clerkUser.id}`;
  } else {
    await sql`
      INSERT INTO community_reactions (
        id,
        publication_id,
        clerk_user_id,
        created_at
      )
      VALUES (
        ${randomUUID()},
        ${publicationId},
        ${profile.clerkUser.id},
        NOW()
      )
    `;
  }

  const publicationRows = await sql`SELECT id, author_clerk_user_id, author_name, author_role, author_specialty, type, title, content, created_at FROM community_publications WHERE id = ${publicationId}`;
  if (!publicationRows[0]) {
    throw new Error("Publication not found");
  }

  return mapPublicationRow(publicationRows[0] as Record<string, unknown>, profile.clerkUser.id, profile);
};

export const addCommunityComment = async (publicationId: string, request: Request, text: string): Promise<CommunityPublicationRecord> => {
  const profile = await getCurrentUserAccessProfile(request);
  if (!profile?.clerkUser?.id) {
    throw new Error("Unauthorized");
  }

  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error("Comment is empty");
  }

  await createCommunityTables();
  const sql = getSql();
  const authorProfile = await getAuthorProfile(profile);
  const authorName = getAuthorDisplayName({ clerkUser: { firstName: authorProfile.firstName, lastName: authorProfile.lastName, email: authorProfile.email } });
  const authorRole = normalizeRole(profile.userAccess?.role ?? "athlete");
  const authorSpecialty = await resolveAuthorSpecialty(sql, profile.clerkUser.id, authorRole, null);

  await sql`
    INSERT INTO community_comments (
      id,
      publication_id,
      clerk_user_id,
      author_name,
      author_role,
      author_specialty,
      text,
      created_at
    )
    VALUES (
      ${randomUUID()},
      ${publicationId},
      ${profile.clerkUser.id},
      ${authorName},
      ${authorRole},
      ${authorSpecialty},
      ${trimmedText},
      NOW()
    )
  `;

  const publicationRows = await sql`SELECT id, author_clerk_user_id, author_name, author_role, author_specialty, type, title, content, created_at FROM community_publications WHERE id = ${publicationId}`;
  if (!publicationRows[0]) {
    throw new Error("Publication not found");
  }

  return mapPublicationRow(publicationRows[0] as Record<string, unknown>, profile.clerkUser.id, profile);
};
