import { describe, expect, it } from "vitest";
import {
  formatPostgresTargetSummary,
  resolvePostgresTarget,
} from "@/lib/postgres-config";

const testEnv = (
  values: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv => ({
  ...values,
  NODE_ENV: "test",
}) as NodeJS.ProcessEnv;

const productionEnv = (
  values: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv => ({
  ...values,
  NODE_ENV: "production",
}) as NodeJS.ProcessEnv;

describe("PostgreSQL canonical configuration", () => {
  it("prefers DATABASE_URL and only exposes a masked summary", () => {
    const target = resolvePostgresTarget(testEnv({
      DATABASE_URL: "postgresql://secret:user@ep-production-123.eu.neon.tech/neondb?sslmode=require",
      POSTGRES_DATABASE_URL: "postgresql://other@ep-alias.eu.neon.tech/alias",
      VERCEL_ENV: "preview",
    }));

    expect(target.databaseUrl).toContain("secret:user");
    expect(target.summary).toEqual({
      source: "DATABASE_URL",
      hostname: "ep-***.eu.neon.tech",
      database: "neondb",
      environment: "preview",
      branch: null,
    });
    expect(formatPostgresTargetSummary(target.summary)).not.toContain("secret");
    expect(formatPostgresTargetSummary(target.summary)).not.toContain("production-123");
  });

  it("keeps aliases compatible when the canonical variable is absent", () => {
    expect(resolvePostgresTarget(testEnv({
      POSTGRES_DATABASE_URL: "postgres://user:pass@localhost:5432/test",
      POSTGRES_URL: "postgres://fallback@localhost:5432/test",
    })).summary.source).toBe("POSTGRES_DATABASE_URL");
  });

  it("accepts a coherent Neon production target", () => {
    const target = resolvePostgresTarget(productionEnv({
      DATABASE_URL: "postgres://user:pass@ep-main.eu.neon.tech/neondb",
      POSTGRES_URL: "postgres://user:other@ep-main-pooler.eu.neon.tech/neondb?sslmode=require",
      KLIQUE_POSTGRES_EXPECTED_BRANCH: "production",
      NEON_BRANCH_NAME: "production",
      KLIQUE_POSTGRES_EXPECTED_ENVIRONMENT: "production",
    }));

    expect(target.summary.database).toBe("neondb");
  });

  it.each([
    ["non-Neon host", { DATABASE_URL: "postgres://user:pass@db.example.com/neondb" }],
    ["wrong database", { DATABASE_URL: "postgres://user:pass@ep-main.eu.neon.tech/staging" }],
    ["wrong branch", {
      DATABASE_URL: "postgres://user:pass@ep-main.eu.neon.tech/neondb",
      KLIQUE_POSTGRES_EXPECTED_BRANCH: "production",
      NEON_BRANCH_NAME: "preview",
    }],
    ["missing branch metadata", {
      DATABASE_URL: "postgresql://user:password@ep-main.eu.neon.tech/neondb",
      KLIQUE_POSTGRES_EXPECTED_BRANCH: "production",
    }],
    ["incoherent aliases", {
      DATABASE_URL: "postgres://user:pass@ep-main.eu.neon.tech/neondb",
      POSTGRES_URL: "postgres://user:pass@ep-preview.eu.neon.tech/neondb",
    }],
    ["wrong environment", {
      DATABASE_URL: "postgres://user:pass@ep-main.eu.neon.tech/neondb",
      KLIQUE_POSTGRES_EXPECTED_ENVIRONMENT: "preview",
    }],
  ])("refuses a production mismatch: %s", (_label, values) => {
    expect(() => resolvePostgresTarget(productionEnv(values))).toThrow(
      "Cible PostgreSQL refusee en Production",
    );
  });

  it("supports explicit production hostname and database expectations", () => {
    expect(() => resolvePostgresTarget(productionEnv({
      DATABASE_URL: "postgres://user:pass@custom.internal/klique",
      KLIQUE_POSTGRES_EXPECTED_HOSTNAME: "custom.internal",
      KLIQUE_POSTGRES_EXPECTED_DATABASE: "klique",
    }))).not.toThrow();
  });
});
