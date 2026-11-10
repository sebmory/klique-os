import { beforeEach, describe, expect, it } from "vitest";
import { getContentStorageServerConfig, isContentStorageConfigured } from "@/lib/content-storage/config";

const ORIGINAL_ENV = { ...process.env };

describe("content storage server config", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.POSTGRES_DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL;
    delete process.env.KLIQUE_DEFAULT_WORKSPACE_ID;
  });

  it("uses DATABASE_URL as canonical connection url", () => {
    process.env.POSTGRES_DATABASE_URL = "postgres://postgres-database-url";
    process.env.POSTGRES_URL = "postgres://postgres-url";
    process.env.DATABASE_URL = "postgres://database-url";
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = "klique-main";

    expect(getContentStorageServerConfig()).toEqual({
      databaseUrl: "postgres://database-url",
      defaultWorkspaceId: "klique-main",
    });
  });

  it("uses POSTGRES_URL with default workspace", () => {
    process.env.POSTGRES_URL = "postgres://postgres-url";
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = "klique-main";

    expect(getContentStorageServerConfig()).toEqual({
      databaseUrl: "postgres://postgres-url",
      defaultWorkspaceId: "klique-main",
    });
    expect(isContentStorageConfigured()).toBe(true);
  });

  it("falls back to POSTGRES_DATABASE_URL when DATABASE_URL is absent", () => {
    process.env.POSTGRES_DATABASE_URL = "postgres://postgres-database-url";
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = "klique-main";

    expect(getContentStorageServerConfig()).toEqual({
      databaseUrl: "postgres://postgres-database-url",
      defaultWorkspaceId: "klique-main",
    });
  });

  it("throws when DB url is missing", () => {
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = "klique-main";

    expect(() => getContentStorageServerConfig()).toThrow(
      "Base non configuree: definir DATABASE_URL (ou POSTGRES_DATABASE_URL/POSTGRES_URL)."
    );
    expect(isContentStorageConfigured()).toBe(false);
  });

  it("throws when default workspace id is missing", () => {
    process.env.POSTGRES_URL = "postgres://postgres-url";

    expect(() => getContentStorageServerConfig()).toThrow(
      "Workspace par defaut non configure: definir KLIQUE_DEFAULT_WORKSPACE_ID."
    );
    expect(isContentStorageConfigured()).toBe(false);
  });
});
