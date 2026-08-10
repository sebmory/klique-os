import { clerkClient } from "@clerk/nextjs/server";
import { createContentStorageClient, getDefaultWorkspaceId } from "@/lib/content-storage/db";

const getBootstrapAdminEmail = (): string | null => {
  const configuredEmail = process.env.KLIQUE_BOOTSTRAP_ADMIN_EMAIL?.trim();
  return configuredEmail ? configuredEmail.toLowerCase() : null;
};

export type ClerkUserAccessRole = "admin" | "athlete" | "partner_expert" | "media";
export type ClerkUserAccessStatus = "invited" | "active" | "disabled";

export type ClerkUserAccessRecord = {
  clerkUserId: string;
  email: string;
  role: ClerkUserAccessRole;
  workspaceId: string;
  athleteId: string | null;
  partnerId: string | null;
  mediaId: string | null;
  status: ClerkUserAccessStatus;
  createdAt: string;
  updatedAt: string;
};

export type CurrentUserAccessProfile = {
  clerkUser: {
    id: string;
    email: string | null;
  };
  userAccess: ClerkUserAccessRecord | null;
};

const allowedRoles: ClerkUserAccessRole[] = ["admin", "athlete", "partner_expert", "media"];
const allowedStatuses: ClerkUserAccessStatus[] = ["invited", "active", "disabled"];

const ensureNodeRuntime = () => {
  if (typeof window !== "undefined") {
    throw new Error("Clerk access service is server-only.");
  }
};

const getSql = () => {
  ensureNodeRuntime();
  return createContentStorageClient();
};

const createUserAccessTable = async () => {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS user_access (
      clerk_user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'athlete', 'partner_expert', 'media')),
      workspace_id TEXT NOT NULL,
      athlete_id TEXT,
      partner_id TEXT,
      media_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'disabled')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
};

const normalizeRole = (value: unknown): ClerkUserAccessRole => {
  if (typeof value === "string" && allowedRoles.includes(value as ClerkUserAccessRole)) {
    return value as ClerkUserAccessRole;
  }
  return "admin";
};

const normalizeStatus = (value: unknown): ClerkUserAccessStatus => {
  if (typeof value === "string" && allowedStatuses.includes(value as ClerkUserAccessStatus)) {
    return value as ClerkUserAccessStatus;
  }
  return "invited";
};

const mapRow = (row: Record<string, unknown>): ClerkUserAccessRecord => ({
  clerkUserId: String(row.clerk_user_id ?? ""),
  email: String(row.email ?? ""),
  role: normalizeRole(row.role),
  workspaceId: String(row.workspace_id ?? ""),
  athleteId: typeof row.athlete_id === "string" ? row.athlete_id : null,
  partnerId: typeof row.partner_id === "string" ? row.partner_id : null,
  mediaId: typeof row.media_id === "string" ? row.media_id : null,
  status: normalizeStatus(row.status),
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
});

const getAuthenticatedClerkUser = async (request: Request) => {
  const client = await clerkClient();
  const authResult = await client.authenticateRequest(request, {
    authorizedParties: ["http://localhost:3000"],
  });

  if (!authResult.isAuthenticated) {
    return null;
  }

  const authData = authResult.toAuth();
  const userId = authData?.userId;
  if (!userId) {
    return null;
  }

  const clerkUser = await client.users.getUser(userId);
  return { userId, clerkUser };
};

export const getCurrentUserAccessProfile = async (request?: Request): Promise<CurrentUserAccessProfile | null> => {
  const currentRequest = request ?? new Request("http://localhost");
  const authResult = await getAuthenticatedClerkUser(currentRequest);
  if (!authResult) {
    return null;
  }

  const { userId, clerkUser } = authResult;
  await createUserAccessTable();

  const sql = getSql();
  const rows = await sql`SELECT clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at FROM user_access WHERE clerk_user_id = ${userId}`;

  return {
    clerkUser: {
      id: clerkUser.id,
      email: clerkUser.emailAddresses?.[0]?.emailAddress ?? null,
    },
    userAccess: rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null,
  };
};

export const bootstrapCurrentUserAsAdmin = async (request?: Request): Promise<ClerkUserAccessRecord | null> => {
  const currentRequest = request ?? new Request("http://localhost");
  const authResult = await getAuthenticatedClerkUser(currentRequest);
  if (!authResult) {
    return null;
  }

  const { userId, clerkUser } = authResult;
  const configuredEmail = getBootstrapAdminEmail();
  const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? `${clerkUser.id}@clerk.local`;
  if (!configuredEmail || email.toLowerCase() !== configuredEmail) {
    throw new Error("Forbidden");
  }

  const workspaceId = getDefaultWorkspaceId();

  await createUserAccessTable();

  const sql = getSql();
  const existingRows = await sql`SELECT clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at FROM user_access WHERE clerk_user_id = ${userId}`;
  if (existingRows[0]) {
    return mapRow(existingRows[0] as Record<string, unknown>);
  }

  const existingAdmins = await sql`SELECT clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at FROM user_access WHERE role = 'admin'`;
  if (existingAdmins[0]) {
    throw new Error("Forbidden");
  }

  const rows = await sql`
    INSERT INTO user_access (
      clerk_user_id,
      email,
      role,
      workspace_id,
      athlete_id,
      partner_id,
      media_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ${userId},
      ${email},
      'admin',
      ${workspaceId},
      NULL,
      NULL,
      NULL,
      'active',
      NOW(),
      NOW()
    )
    RETURNING clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at
  `;

  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
};
