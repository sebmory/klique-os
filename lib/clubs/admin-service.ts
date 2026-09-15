import { randomUUID } from "node:crypto";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { createContentStorageClient } from "@/lib/content-storage/db";

export type ClubStatus = "active" | "inactive";

export type ProvisionClubInput = {
  workspaceId?: unknown;
  clubName?: unknown;
  teamName?: unknown;
  season?: unknown;
};

export type ProvisionedClub = {
  workspaceId: string;
  name: string;
  status: ClubStatus;
  createdAt: string;
  updatedAt: string;
  teamCount: number;
};

export type ProvisionedClubWithInitialTeam = ProvisionedClub & {
  profileCreatedAt: string;
  team: {
    id: string;
    name: string;
    season: string;
    status: ClubStatus;
    createdAt: string;
    updatedAt: string;
  };
};

export type ClubProvisionRecord = {
  workspaceId: string;
  clubName: string;
  teamId: string;
  teamName: string;
  season: string;
};

type ClubRow = Record<string, unknown>;

export type ClubAdminRepository = {
  createAtomic: (record: ClubProvisionRecord) => Promise<ClubRow | null>;
  list: () => Promise<ClubRow[]>;
};

export type ClubAdminErrorCode = "forbidden" | "validation" | "conflict";

export class ClubAdminError extends Error {
  constructor(
    public readonly code: ClubAdminErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ClubAdminError";
  }
}

export class ClubAdminForbiddenError extends ClubAdminError {
  constructor() {
    super("forbidden", "Un acces Admin actif est requis.");
    this.name = "ClubAdminForbiddenError";
  }
}

export class ClubAdminValidationError extends ClubAdminError {
  constructor(message: string) {
    super("validation", message);
    this.name = "ClubAdminValidationError";
  }
}

export class ClubAdminConflictError extends ClubAdminError {
  constructor() {
    super("conflict", "Un workspace ou un club utilise deja cet identifiant ou ce nom.");
    this.name = "ClubAdminConflictError";
  }
}

const normalizeText = (value: unknown): string => String(value ?? "").trim().replace(/\s+/g, " ");

const requireText = (value: unknown, fieldName: string, maximumLength: number): string => {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new ClubAdminValidationError(`${fieldName} est requis.`);
  }
  if (normalized.length > maximumLength) {
    throw new ClubAdminValidationError(`${fieldName} est trop long.`);
  }
  return normalized;
};

export const normalizeClubWorkspaceId = (value: unknown): string => {
  const workspaceId = requireText(value, "workspaceId", 80).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workspaceId)) {
    throw new ClubAdminValidationError("workspaceId est invalide.");
  }
  return workspaceId;
};

export const normalizeClubName = (value: unknown): string => requireText(value, "clubName", 160);

export const normalizeClubTeamName = (value: unknown): string => requireText(value, "teamName", 120);

export const normalizeClubSeason = (value: unknown): string => requireText(value, "season", 40);

const normalizeStatus = (value: unknown): ClubStatus => {
  const status = normalizeText(value).toLowerCase();
  if (status !== "active" && status !== "inactive") {
    throw new ClubAdminValidationError("status Neon est invalide.");
  }
  return status;
};

const normalizeTimestamp = (value: unknown, fieldName: string): string => {
  const parsed = value instanceof Date ? value : new Date(requireText(value, fieldName, 100));
  if (Number.isNaN(parsed.getTime())) {
    throw new ClubAdminValidationError(`${fieldName} Neon est invalide.`);
  }
  return parsed.toISOString();
};

const normalizeUuid = (value: unknown, fieldName: string): string => {
  const normalized = requireText(value, fieldName, 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new ClubAdminValidationError(`${fieldName} Neon est invalide.`);
  }
  return normalized;
};

const normalizeTeamCount = (value: unknown): number => {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new ClubAdminValidationError("teamCount Neon est invalide.");
  }
  return count;
};

const mapClubRow = (row: ClubRow): ProvisionedClub => ({
  workspaceId: normalizeClubWorkspaceId(row.workspace_id),
  name: normalizeClubName(row.workspace_name),
  status: normalizeStatus(row.workspace_status),
  createdAt: normalizeTimestamp(row.workspace_created_at, "workspace_created_at"),
  updatedAt: normalizeTimestamp(row.workspace_updated_at, "workspace_updated_at"),
  teamCount: normalizeTeamCount(row.team_count),
});

const mapCreatedClubRow = (row: ClubRow): ProvisionedClubWithInitialTeam => ({
  ...mapClubRow({ ...row, team_count: 1 }),
  profileCreatedAt: normalizeTimestamp(row.profile_created_at, "profile_created_at"),
  team: {
    id: normalizeUuid(row.team_id, "team_id"),
    name: normalizeClubTeamName(row.team_name),
    season: normalizeClubSeason(row.team_season),
    status: normalizeStatus(row.team_status),
    createdAt: normalizeTimestamp(row.team_created_at, "team_created_at"),
    updatedAt: normalizeTimestamp(row.team_updated_at, "team_updated_at"),
  },
});

const isConflictError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? error.code : null;
  if (code === "23505" || code === "40001") return true;
  return "cause" in error
    && typeof error.cause === "object"
    && error.cause !== null
    && "code" in error.cause
    && (error.cause.code === "23505" || error.cause.code === "40001");
};

const createRepository = (): ClubAdminRepository => {
  const sql = createContentStorageClient();

  return {
    async createAtomic(record) {
      const createQuery = sql`
        WITH created_workspace AS (
          INSERT INTO workspaces (id, name, type, status, created_at, updated_at)
          SELECT ${record.workspaceId}, ${record.clubName}, 'club', 'active', NOW(), NOW()
          WHERE NOT EXISTS (
            SELECT 1
            FROM workspaces
            WHERE lower(btrim(name)) = lower(btrim(${record.clubName}))
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING id, name, status, created_at, updated_at
        ),
        created_profile AS (
          INSERT INTO club_profiles (workspace_id, workspace_type, created_at, updated_at)
          SELECT id, 'club', NOW(), NOW()
          FROM created_workspace
          RETURNING workspace_id, created_at
        ),
        created_team AS (
          INSERT INTO club_teams (id, workspace_id, name, season, status, created_at, updated_at)
          SELECT ${record.teamId}::uuid, workspace_id, ${record.teamName}, ${record.season}, 'active', NOW(), NOW()
          FROM created_profile
          RETURNING id, workspace_id, name, season, status, created_at, updated_at
        )
        SELECT
          workspace.id AS workspace_id,
          workspace.name AS workspace_name,
          workspace.status AS workspace_status,
          workspace.created_at AS workspace_created_at,
          workspace.updated_at AS workspace_updated_at,
          profile.created_at AS profile_created_at,
          team.id AS team_id,
          team.name AS team_name,
          team.season AS team_season,
          team.status AS team_status,
          team.created_at AS team_created_at,
          team.updated_at AS team_updated_at
        FROM created_workspace workspace
        JOIN created_profile profile ON profile.workspace_id = workspace.id
        JOIN created_team team ON team.workspace_id = workspace.id
      `;
      const results = await sql.transaction([createQuery], { isolationLevel: "Serializable" });
      const rows = results[0] as ClubRow[];
      return rows[0] ?? null;
    },

    async list() {
      return await sql`
        SELECT
          workspace.id AS workspace_id,
          workspace.name AS workspace_name,
          workspace.status AS workspace_status,
          workspace.created_at AS workspace_created_at,
          workspace.updated_at AS workspace_updated_at,
          COUNT(team.id)::integer AS team_count
        FROM workspaces workspace
        JOIN club_profiles profile
          ON profile.workspace_id = workspace.id
          AND profile.workspace_type = workspace.type
        LEFT JOIN club_teams team
          ON team.workspace_id = workspace.id
        WHERE workspace.type = 'club'
        GROUP BY workspace.id, workspace.name, workspace.status, workspace.created_at, workspace.updated_at
        ORDER BY lower(btrim(workspace.name)), workspace.id
      ` as ClubRow[];
    },
  };
};

const requireActiveAdmin = async (request: Request): Promise<void> => {
  const profile = await getCurrentUserAccessProfile(request);
  const clerkUserId = profile?.clerkUser?.id?.trim() ?? "";
  const access = profile?.userAccess ?? null;
  if (!clerkUserId || access?.role !== "admin" || access.status !== "active" || !access.workspaceId?.trim()) {
    throw new ClubAdminForbiddenError();
  }
};

export const provisionClub = async (
  request: Request,
  input: ProvisionClubInput,
  repository: ClubAdminRepository = createRepository(),
): Promise<ProvisionedClubWithInitialTeam> => {
  await requireActiveAdmin(request);

  const record: ClubProvisionRecord = {
    workspaceId: normalizeClubWorkspaceId(input.workspaceId),
    clubName: normalizeClubName(input.clubName),
    teamId: randomUUID(),
    teamName: normalizeClubTeamName(input.teamName),
    season: normalizeClubSeason(input.season),
  };

  try {
    const row = await repository.createAtomic(record);
    if (!row) throw new ClubAdminConflictError();
    return mapCreatedClubRow(row);
  } catch (error) {
    if (error instanceof ClubAdminError) throw error;
    if (isConflictError(error)) throw new ClubAdminConflictError();
    throw error;
  }
};

export const listProvisionedClubs = async (
  request: Request,
  repository: ClubAdminRepository = createRepository(),
): Promise<ProvisionedClub[]> => {
  await requireActiveAdmin(request);
  return (await repository.list()).map(mapClubRow);
};