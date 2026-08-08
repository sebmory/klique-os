export type ContentStorageServerConfig = {
  databaseUrl: string;
  defaultWorkspaceId: string;
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const ensureServerRuntime = () => {
  if (typeof window !== "undefined") {
    throw new Error("Content storage config est reserve au serveur.");
  }
};

const resolveDatabaseUrl = (): string => {
  const postgresDatabaseUrl = normalize(process.env.POSTGRES_DATABASE_URL);
  if (postgresDatabaseUrl) return postgresDatabaseUrl;

  const databaseUrl = normalize(process.env.DATABASE_URL);
  if (databaseUrl) return databaseUrl;

  const postgresUrl = normalize(process.env.POSTGRES_URL);
  if (postgresUrl) return postgresUrl;

  throw new Error("Content storage DB non configuree: definir POSTGRES_DATABASE_URL, DATABASE_URL ou POSTGRES_URL.");
};

const resolveDefaultWorkspaceId = (): string => {
  const workspaceId = normalize(process.env.KLIQUE_DEFAULT_WORKSPACE_ID);
  if (!workspaceId) {
    throw new Error("Workspace par defaut non configure: definir KLIQUE_DEFAULT_WORKSPACE_ID.");
  }
  return workspaceId;
};

export const getContentStorageServerConfig = (): ContentStorageServerConfig => {
  ensureServerRuntime();
  return {
    databaseUrl: resolveDatabaseUrl(),
    defaultWorkspaceId: resolveDefaultWorkspaceId(),
  };
};

export const isContentStorageConfigured = (): boolean => {
  ensureServerRuntime();
  return Boolean(
    normalize(process.env.POSTGRES_DATABASE_URL) ||
      normalize(process.env.DATABASE_URL) ||
      normalize(process.env.POSTGRES_URL)
  ) &&
    Boolean(normalize(process.env.KLIQUE_DEFAULT_WORKSPACE_ID));
};
