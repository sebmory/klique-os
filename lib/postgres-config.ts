export type PostgresUrlSource = "DATABASE_URL" | "POSTGRES_DATABASE_URL" | "POSTGRES_URL";

export type PostgresTargetSummary = {
  source: PostgresUrlSource;
  hostname: string;
  database: string;
  environment: string;
  branch: string | null;
};

export type ResolvedPostgresTarget = {
  databaseUrl: string;
  summary: PostgresTargetSummary;
};

const URL_SOURCES: PostgresUrlSource[] = [
  "DATABASE_URL",
  "POSTGRES_DATABASE_URL",
  "POSTGRES_URL",
];

const normalize = (value: unknown): string => String(value ?? "").trim();

const parseTarget = (databaseUrl: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Configuration PostgreSQL invalide: URL illisible.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("Configuration PostgreSQL invalide: cible PostgreSQL attendue.");
  }
  return parsed;
};

const databaseName = (target: URL): string => decodeURIComponent(target.pathname.replace(/^\/+/, ""));

const comparableNeonHostname = (hostname: string): string => {
  const [endpoint, ...suffix] = hostname.toLowerCase().split(".");
  return [endpoint.replace(/-pooler$/, ""), ...suffix].join(".");
};

export const maskPostgresHostname = (hostname: string): string => {
  const parts = hostname.split(".");
  if (parts.length < 2) return "***";
  const first = parts[0];
  const visiblePrefix = first.includes("-") ? `${first.split("-")[0]}-` : "";
  return `${visiblePrefix}***.${parts.slice(1).join(".")}`;
};

const isProduction = (env: NodeJS.ProcessEnv): boolean =>
  normalize(env.VERCEL_ENV) === "production" || normalize(env.NODE_ENV) === "production";

const validateProductionTarget = (
  selected: URL,
  env: NodeJS.ProcessEnv,
  configuredUrls: Array<{ source: PostgresUrlSource; target: URL }>,
) => {
  if (!isProduction(env)) return;

  const expectedHostname = normalize(env.KLIQUE_POSTGRES_EXPECTED_HOSTNAME).toLowerCase();
  const expectedDatabase = normalize(env.KLIQUE_POSTGRES_EXPECTED_DATABASE) || "neondb";
  const expectedBranch = normalize(env.KLIQUE_POSTGRES_EXPECTED_BRANCH);
  const expectedEnvironment = normalize(env.KLIQUE_POSTGRES_EXPECTED_ENVIRONMENT);
  const actualBranch = normalize(env.NEON_BRANCH_NAME);
  const actualEnvironment = normalize(env.VERCEL_ENV) || normalize(env.NODE_ENV);
  const selectedHostname = selected.hostname.toLowerCase();
  const selectedDatabase = databaseName(selected);
  const mismatches: string[] = [];

  if (expectedHostname) {
    if (selectedHostname !== expectedHostname) mismatches.push("hostname inattendu");
  } else if (!selectedHostname.endsWith(".neon.tech")) {
    mismatches.push("hostname Neon attendu");
  }
  if (selectedDatabase !== expectedDatabase) mismatches.push("base inattendue");
  if (expectedBranch && expectedBranch !== actualBranch) {
    mismatches.push("branche Neon inattendue");
  }
  if (expectedEnvironment && actualEnvironment && expectedEnvironment !== actualEnvironment) {
    mismatches.push("environnement inattendu");
  }

  for (const { target } of configuredUrls) {
    if (
      comparableNeonHostname(target.hostname) !== comparableNeonHostname(selectedHostname)
      || databaseName(target) !== selectedDatabase
    ) {
      mismatches.push("aliases PostgreSQL incoherents");
      break;
    }
  }

  if (mismatches.length) {
    throw new Error(`Cible PostgreSQL refusee en Production: ${[...new Set(mismatches)].join(", ")}.`);
  }
};

export const resolvePostgresTarget = (
  env: NodeJS.ProcessEnv = process.env,
): ResolvedPostgresTarget => {
  const configured = URL_SOURCES
    .map((source) => ({ source, value: normalize(env[source]) }))
    .filter((entry) => Boolean(entry.value));

  if (!configured.length) {
    throw new Error(
      "Base non configuree: definir DATABASE_URL (ou POSTGRES_DATABASE_URL/POSTGRES_URL).",
    );
  }

  const selected = configured[0];
  const selectedTarget = parseTarget(selected.value);
  const configuredTargets = configured.map(({ source, value }) => ({
    source,
    target: parseTarget(value),
  }));
  validateProductionTarget(selectedTarget, env, configuredTargets);

  return {
    databaseUrl: selected.value,
    summary: {
      source: selected.source,
      hostname: maskPostgresHostname(selectedTarget.hostname),
      database: databaseName(selectedTarget),
      environment: normalize(env.VERCEL_ENV) || normalize(env.NODE_ENV) || "unknown",
      branch: normalize(env.NEON_BRANCH_NAME) || null,
    },
  };
};

export const formatPostgresTargetSummary = (summary: PostgresTargetSummary): string =>
  `source=${summary.source} host=${summary.hostname} base=${summary.database || "(vide)"} env=${summary.environment}`
  + (summary.branch ? ` branche=${summary.branch}` : "");
