import { randomUUID } from "node:crypto";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";
import type { Athlete } from "@/types/athlete";

export type ClubTeamStatus = "active" | "inactive";

export type ClubTeam = {
  id: string;
  workspaceId: string;
  name: string;
  season: string;
  status: ClubTeamStatus;
};

export type ClubRosterMember = {
  id: string;
  workspaceId: string;
  teamId: string;
  athleteId: string;
  athleteName: string;
  sport: string;
  joinedOn: string;
};

export type AvailableKliqueAthlete = {
  athleteId: string;
  name: string;
  sport: string;
  status: string;
};

export type AddTeamAthleteInput = {
  workspaceId?: unknown;
  teamId?: unknown;
  athleteId?: unknown;
  joinedOn?: unknown;
};

export type RemoveTeamAthleteInput = {
  workspaceId?: unknown;
  teamId?: unknown;
  athleteId?: unknown;
  leftOn?: unknown;
};

type RosterRow = Record<string, unknown>;

export type ClubRosterRepository = {
  getClub: (workspaceId: string) => Promise<RosterRow | null>;
  listTeams: (workspaceId: string) => Promise<RosterRow[]>;
  getTeam: (workspaceId: string, teamId: string) => Promise<RosterRow | null>;
  listActiveRoster: (workspaceId: string, teamId: string) => Promise<RosterRow[]>;
  listActiveAthleteIds: (workspaceId: string, teamId: string) => Promise<RosterRow[]>;
  addActive: (record: {
    id: string;
    workspaceId: string;
    teamId: string;
    athleteId: string;
    joinedOn: string;
  }) => Promise<RosterRow | null>;
  removeActive: (record: {
    workspaceId: string;
    teamId: string;
    athleteId: string;
    leftOn: string;
  }) => Promise<RosterRow | null>;
};

export type ClubRosterDependencies = {
  repository: ClubRosterRepository;
  listKliqueAthletes: () => Promise<Athlete[]>;
  today: () => string;
};

export type ClubRosterErrorCode = "forbidden" | "validation" | "not_found" | "conflict";

export class ClubRosterError extends Error {
  constructor(
    public readonly code: ClubRosterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ClubRosterError";
  }
}

export class ClubRosterForbiddenError extends ClubRosterError {
  constructor() {
    super("forbidden", "Un acces Admin actif est requis.");
    this.name = "ClubRosterForbiddenError";
  }
}

export class ClubRosterValidationError extends ClubRosterError {
  constructor(message: string) {
    super("validation", message);
    this.name = "ClubRosterValidationError";
  }
}

export class ClubRosterNotFoundError extends ClubRosterError {
  constructor(message: string) {
    super("not_found", message);
    this.name = "ClubRosterNotFoundError";
  }
}

export class ClubRosterConflictError extends ClubRosterError {
  constructor(message = "Cet athlete appartient deja activement a cette equipe.") {
    super("conflict", message);
    this.name = "ClubRosterConflictError";
  }
}

const normalizeText = (value: unknown): string => String(value ?? "").trim().replace(/\s+/g, " ");

const requireText = (value: unknown, fieldName: string, maximumLength: number): string => {
  const normalized = normalizeText(value);
  if (!normalized) throw new ClubRosterValidationError(`${fieldName} est requis.`);
  if (normalized.length > maximumLength) throw new ClubRosterValidationError(`${fieldName} est trop long.`);
  return normalized;
};

export const normalizeRosterWorkspaceId = (value: unknown): string => {
  const workspaceId = requireText(value, "workspaceId", 80).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workspaceId)) {
    throw new ClubRosterValidationError("workspaceId est invalide.");
  }
  return workspaceId;
};

export const normalizeRosterTeamId = (value: unknown): string => {
  const teamId = requireText(value, "teamId", 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(teamId)) {
    throw new ClubRosterValidationError("teamId est invalide.");
  }
  return teamId;
};

export const normalizeRosterAthleteId = (value: unknown): string => requireText(value, "athleteId", 160);

const normalizeDate = (value: unknown, fieldName: string): string => {
  const normalized = requireText(value, fieldName, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ClubRosterValidationError(`${fieldName} est invalide.`);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new ClubRosterValidationError(`${fieldName} est invalide.`);
  }
  return normalized;
};

const normalizeSqlDate = (value: unknown, fieldName: string): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ClubRosterValidationError(`${fieldName} Neon est invalide.`);
    }
    return value.toISOString().slice(0, 10);
  }

  const normalized = normalizeText(value);
  const date = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/)?.[1];
  if (!date) throw new ClubRosterValidationError(`${fieldName} Neon est invalide.`);
  return normalizeDate(date, `${fieldName} Neon`);
};

const normalizeTeamStatus = (value: unknown): ClubTeamStatus => {
  const status = normalizeText(value).toLowerCase();
  if (status !== "active" && status !== "inactive") {
    throw new ClubRosterValidationError("status Neon est invalide.");
  }
  return status;
};

const mapTeam = (row: RosterRow): ClubTeam => ({
  id: normalizeRosterTeamId(row.id),
  workspaceId: normalizeRosterWorkspaceId(row.workspace_id),
  name: requireText(row.name, "name", 120),
  season: requireText(row.season, "season", 40),
  status: normalizeTeamStatus(row.status),
});

const mapRosterRow = (
  row: RosterRow,
  athleteById: Map<string, AvailableKliqueAthlete>,
): ClubRosterMember => {
  const athleteId = normalizeRosterAthleteId(row.athlete_id);
  const athlete = athleteById.get(athleteId);
  if (!athlete) {
    throw new ClubRosterNotFoundError(`Athlete KLIQUE introuvable pour athleteId ${athleteId}.`);
  }
  return {
    id: normalizeRosterTeamId(row.id),
    workspaceId: normalizeRosterWorkspaceId(row.workspace_id),
    teamId: normalizeRosterTeamId(row.team_id),
    athleteId,
    athleteName: athlete.name,
    sport: athlete.sport,
    joinedOn: normalizeSqlDate(row.joined_on, "joined_on"),
  };
};

const mapCanonicalAthletes = (athletes: Athlete[]): AvailableKliqueAthlete[] => {
  const athleteById = new Map<string, AvailableKliqueAthlete>();
  for (const athlete of athletes) {
    const athleteId = normalizeText(athlete.athleteId || athlete.key);
    const name = normalizeText(athlete.name);
    if (!athleteId || !name) continue;
    athleteById.set(athleteId, {
      athleteId,
      name,
      sport: normalizeText(athlete.sport),
      status: normalizeText(athlete.status),
    });
  }
  return [...athleteById.values()].sort((left, right) => left.name.localeCompare(right.name, "fr"));
};

const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error
    && typeof error.cause === "object"
    && error.cause !== null
    && "code" in error.cause
    && error.cause.code === "23505";
};

const createRepository = (): ClubRosterRepository => {
  const sql = createContentStorageClient();
  return {
    async getClub(workspaceId) {
      const rows = await sql`
        SELECT profile.workspace_id
        FROM club_profiles profile
        JOIN workspaces workspace
          ON workspace.id = profile.workspace_id
          AND workspace.type = profile.workspace_type
        WHERE profile.workspace_id = ${workspaceId}
          AND profile.workspace_type = 'club'
        LIMIT 1
      `;
      return (rows[0] as RosterRow | undefined) ?? null;
    },

    async listTeams(workspaceId) {
      return await sql`
        SELECT id, workspace_id, name, season, status
        FROM club_teams
        WHERE workspace_id = ${workspaceId}
        ORDER BY season DESC, lower(btrim(name)), id
      ` as RosterRow[];
    },

    async getTeam(workspaceId, teamId) {
      const rows = await sql`
        SELECT team.id, team.workspace_id, team.name, team.season, team.status
        FROM club_teams team
        JOIN club_profiles profile ON profile.workspace_id = team.workspace_id
        WHERE team.workspace_id = ${workspaceId}
          AND team.id = ${teamId}::uuid
        LIMIT 1
      `;
      return (rows[0] as RosterRow | undefined) ?? null;
    },

    async listActiveRoster(workspaceId, teamId) {
      return await sql`
        SELECT id, workspace_id, team_id, athlete_id, joined_on::text AS joined_on
        FROM team_athletes
        WHERE workspace_id = ${workspaceId}
          AND team_id = ${teamId}::uuid
          AND status = 'active'
        ORDER BY joined_on, athlete_id, id
      ` as RosterRow[];
    },

    async listActiveAthleteIds(workspaceId, teamId) {
      return await sql`
        SELECT athlete_id
        FROM team_athletes
        WHERE workspace_id = ${workspaceId}
          AND team_id = ${teamId}::uuid
          AND status = 'active'
        ORDER BY athlete_id
      ` as RosterRow[];
    },

    async addActive(record) {
      const teamQuery = sql`
        SELECT team.id
        FROM club_teams team
        JOIN club_profiles profile ON profile.workspace_id = team.workspace_id
        WHERE team.workspace_id = ${record.workspaceId}
          AND team.id = ${record.teamId}::uuid
          AND team.status = 'active'
        FOR UPDATE
      `;
      const insertQuery = sql`
        INSERT INTO team_athletes (
          id, workspace_id, team_id, athlete_id, status, joined_on, left_on, created_at, updated_at
        )
        SELECT
          ${record.id}::uuid,
          ${record.workspaceId},
          ${record.teamId}::uuid,
          ${record.athleteId},
          'active',
          ${record.joinedOn}::date,
          NULL,
          NOW(),
          NOW()
        WHERE EXISTS (
          SELECT 1
          FROM club_teams team
          JOIN club_profiles profile ON profile.workspace_id = team.workspace_id
          WHERE team.workspace_id = ${record.workspaceId}
            AND team.id = ${record.teamId}::uuid
            AND team.status = 'active'
        )
        ON CONFLICT (workspace_id, team_id, athlete_id) WHERE status = 'active'
        DO NOTHING
        RETURNING id, workspace_id, team_id, athlete_id, joined_on::text AS joined_on
      `;
      const results = await sql.transaction([teamQuery, insertQuery], { isolationLevel: "Serializable" });
      const teamRows = results[0] as RosterRow[];
      const insertedRows = results[1] as RosterRow[];
      if (teamRows.length === 0) throw new ClubRosterNotFoundError("Equipe Club active introuvable.");
      return insertedRows[0] ?? null;
    },

    async removeActive(record) {
      const teamQuery = sql`
        SELECT team.id
        FROM club_teams team
        JOIN club_profiles profile ON profile.workspace_id = team.workspace_id
        WHERE team.workspace_id = ${record.workspaceId}
          AND team.id = ${record.teamId}::uuid
        FOR UPDATE
      `;
      const updateQuery = sql`
        UPDATE team_athletes
        SET status = 'inactive', left_on = ${record.leftOn}::date, updated_at = NOW()
        WHERE workspace_id = ${record.workspaceId}
          AND team_id = ${record.teamId}::uuid
          AND athlete_id = ${record.athleteId}
          AND status = 'active'
          AND joined_on <= ${record.leftOn}::date
        RETURNING id, workspace_id, team_id, athlete_id,
          joined_on::text AS joined_on, left_on::text AS left_on, status
      `;
      const results = await sql.transaction([teamQuery, updateQuery], { isolationLevel: "Serializable" });
      const teamRows = results[0] as RosterRow[];
      const updatedRows = results[1] as RosterRow[];
      if (teamRows.length === 0) throw new ClubRosterNotFoundError("Equipe Club introuvable.");
      return updatedRows[0] ?? null;
    },
  };
};

const defaultDependencies = (): ClubRosterDependencies => ({
  repository: createRepository(),
  listKliqueAthletes: getAthletesFromGoogleSheets,
  today: () => new Date().toISOString().slice(0, 10),
});

const requireActiveAdmin = async (request: Request): Promise<void> => {
  const profile = await getCurrentUserAccessProfile(request);
  const clerkUserId = profile?.clerkUser?.id?.trim() ?? "";
  const access = profile?.userAccess ?? null;
  if (!clerkUserId || access?.role !== "admin" || access.status !== "active" || !access.workspaceId?.trim()) {
    throw new ClubRosterForbiddenError();
  }
};

const requireClub = async (workspaceId: string, repository: ClubRosterRepository): Promise<void> => {
  if (!await repository.getClub(workspaceId)) {
    throw new ClubRosterNotFoundError("Workspace Club introuvable.");
  }
};

const requireTeam = async (
  workspaceId: string,
  teamId: string,
  repository: ClubRosterRepository,
  options: { active?: boolean } = {},
): Promise<ClubTeam> => {
  const row = await repository.getTeam(workspaceId, teamId);
  if (!row) throw new ClubRosterNotFoundError("Equipe Club introuvable.");
  const team = mapTeam(row);
  if (options.active && team.status !== "active") {
    throw new ClubRosterNotFoundError("Equipe Club active introuvable.");
  }
  return team;
};

const loadCanonicalAthletes = async (dependencies: ClubRosterDependencies): Promise<AvailableKliqueAthlete[]> =>
  mapCanonicalAthletes(await dependencies.listKliqueAthletes());

export const listClubTeams = async (
  request: Request,
  workspaceIdInput: unknown,
  dependencies: ClubRosterDependencies = defaultDependencies(),
): Promise<ClubTeam[]> => {
  await requireActiveAdmin(request);
  const workspaceId = normalizeRosterWorkspaceId(workspaceIdInput);
  await requireClub(workspaceId, dependencies.repository);
  return (await dependencies.repository.listTeams(workspaceId)).map(mapTeam);
};

export const listActiveTeamRoster = async (
  request: Request,
  workspaceIdInput: unknown,
  teamIdInput: unknown,
  dependencies: ClubRosterDependencies = defaultDependencies(),
): Promise<ClubRosterMember[]> => {
  await requireActiveAdmin(request);
  const workspaceId = normalizeRosterWorkspaceId(workspaceIdInput);
  const teamId = normalizeRosterTeamId(teamIdInput);
  await requireClub(workspaceId, dependencies.repository);
  await requireTeam(workspaceId, teamId, dependencies.repository);
  const athletes = await loadCanonicalAthletes(dependencies);
  const athleteById = new Map(athletes.map((athlete) => [athlete.athleteId, athlete]));
  return (await dependencies.repository.listActiveRoster(workspaceId, teamId))
    .map((row) => mapRosterRow(row, athleteById));
};

export const listAvailableKliqueAthletes = async (
  request: Request,
  workspaceIdInput: unknown,
  teamIdInput: unknown,
  dependencies: ClubRosterDependencies = defaultDependencies(),
): Promise<AvailableKliqueAthlete[]> => {
  await requireActiveAdmin(request);
  const workspaceId = normalizeRosterWorkspaceId(workspaceIdInput);
  const teamId = normalizeRosterTeamId(teamIdInput);
  await requireClub(workspaceId, dependencies.repository);
  await requireTeam(workspaceId, teamId, dependencies.repository, { active: true });
  const activeRows = await dependencies.repository.listActiveAthleteIds(workspaceId, teamId);
  const activeAthleteIds = new Set(activeRows.map((row) => normalizeRosterAthleteId(row.athlete_id)));
  return (await loadCanonicalAthletes(dependencies))
    .filter((athlete) => !activeAthleteIds.has(athlete.athleteId));
};

export const addAthleteToTeam = async (
  request: Request,
  input: AddTeamAthleteInput,
  dependencies: ClubRosterDependencies = defaultDependencies(),
): Promise<ClubRosterMember> => {
  await requireActiveAdmin(request);
  const workspaceId = normalizeRosterWorkspaceId(input.workspaceId);
  const teamId = normalizeRosterTeamId(input.teamId);
  const athleteId = normalizeRosterAthleteId(input.athleteId);
  const joinedOn = normalizeDate(input.joinedOn ?? dependencies.today(), "joinedOn");
  await requireClub(workspaceId, dependencies.repository);
  await requireTeam(workspaceId, teamId, dependencies.repository, { active: true });

  const athletes = await loadCanonicalAthletes(dependencies);
  const athleteById = new Map(athletes.map((athlete) => [athlete.athleteId, athlete]));
  if (!athleteById.has(athleteId)) {
    throw new ClubRosterNotFoundError("Athlete KLIQUE introuvable.");
  }

  try {
    const row = await dependencies.repository.addActive({
      id: randomUUID(),
      workspaceId,
      teamId,
      athleteId,
      joinedOn,
    });
    if (!row) throw new ClubRosterConflictError();
    return mapRosterRow(row, athleteById);
  } catch (error) {
    if (error instanceof ClubRosterError) throw error;
    if (isUniqueViolation(error)) throw new ClubRosterConflictError();
    throw error;
  }
};

export const removeAthleteFromTeam = async (
  request: Request,
  input: RemoveTeamAthleteInput,
  dependencies: ClubRosterDependencies = defaultDependencies(),
): Promise<void> => {
  await requireActiveAdmin(request);
  const workspaceId = normalizeRosterWorkspaceId(input.workspaceId);
  const teamId = normalizeRosterTeamId(input.teamId);
  const athleteId = normalizeRosterAthleteId(input.athleteId);
  const leftOn = normalizeDate(input.leftOn ?? dependencies.today(), "leftOn");
  await requireClub(workspaceId, dependencies.repository);
  await requireTeam(workspaceId, teamId, dependencies.repository);

  const athletes = await loadCanonicalAthletes(dependencies);
  if (!athletes.some((athlete) => athlete.athleteId === athleteId)) {
    throw new ClubRosterNotFoundError("Athlete KLIQUE introuvable.");
  }

  const row = await dependencies.repository.removeActive({ workspaceId, teamId, athleteId, leftOn });
  if (!row) {
    throw new ClubRosterNotFoundError("Appartenance active introuvable ou date de sortie invalide.");
  }
  normalizeSqlDate(row.joined_on, "joined_on");
  normalizeSqlDate(row.left_on, "left_on");
};