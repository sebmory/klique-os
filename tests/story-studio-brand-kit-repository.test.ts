import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentAccessContext } from "@/lib/content-storage/access";

const { sqlMock, createContentStorageClientMock } = vi.hoisted(() => ({
  sqlMock: Object.assign(vi.fn(), { query: vi.fn() }),
  createContentStorageClientMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({ createContentStorageClient: createContentStorageClientMock }));

import {
  StoryStudioBrandKitAssetError,
  StoryStudioBrandKitRepository,
} from "@/lib/story-studio/brand-kit-repository";

const access: ContentAccessContext = {
  clerkUserId: "user-1",
  workspaceId: "workspace-1",
  mediaId: "11111111-1111-4111-8111-111111111111",
  role: "media",
  isAdmin: false,
};

const row = {
  id: "22222222-2222-4222-8222-222222222222",
  workspace_id: access.workspaceId,
  name: "KLIQUE",
  primary_color: "#000000",
  secondary_color: "#FFFFFF",
  accent_color: "#F2B800",
  text_color: "#FFFFFF",
  muted_text_color: "#D9D9D9",
  light_logo_photo_id: null,
  dark_logo_photo_id: null,
  font_family: "Georgia",
  signature_mode: "visible",
  is_default: true,
  created_at: new Date("2026-09-28T10:00:00.000Z"),
  updated_at: new Date("2026-09-28T10:00:00.000Z"),
};

const input = {
  name: "Club Nord",
  primaryColor: "#101010",
  secondaryColor: "#FFFFFF",
  accentColor: "#F2B800",
  textColor: "#FFFFFF",
  mutedTextColor: "#CCCCCC",
  lightLogoPhotoId: null,
  darkLogoPhotoId: null,
  fontFamily: "Arial" as const,
  signatureMode: "discreet" as const,
};

const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("StoryStudioBrandKitRepository", () => {
  beforeEach(() => {
    sqlMock.query.mockReset();
    createContentStorageClientMock.mockReset();
    createContentStorageClientMock.mockReturnValue(sqlMock);
  });

  it("ensures and lists the default KLIQUE kit inside the active workspace", async () => {
    sqlMock.query.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
    const kits = await StoryStudioBrandKitRepository.list(access);

    const [defaultSql, defaultValues] = sqlMock.query.mock.calls[0] as [string, unknown[]];
    const [listSql, listValues] = sqlMock.query.mock.calls[1] as [string, unknown[]];
    expect(normalizeSql(defaultSql)).toContain("ON CONFLICT DO NOTHING");
    expect(defaultValues).toContain(access.workspaceId);
    expect(defaultValues).toContain("KLIQUE");
    expect(normalizeSql(listSql)).toContain("WHERE brand_kit.workspace_id = $1");
    expect(normalizeSql(listSql)).toContain("light_logo.blob_url AS light_logo_url");
    expect(listValues).toEqual([access.workspaceId]);
    expect(kits[0]).toMatchObject({ name: "KLIQUE", isDefault: true, accentColor: "#F2B800" });
  });

  it("creates multiple workspace kits after ensuring the default", async () => {
    sqlMock.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...row, name: input.name, is_default: false }]);
    const kit = await StoryStudioBrandKitRepository.create(input, access);
    const [insertSql, values] = sqlMock.query.mock.calls[1] as [string, unknown[]];

    expect(normalizeSql(insertSql)).toContain("INSERT INTO story_studio_brand_kits");
    expect(values).toContain(access.workspaceId);
    expect(kit.name).toBe("Club Nord");
    expect(kit.isDefault).toBe(false);
  });

  it("rejects a logo asset that is absent from the active workspace", async () => {
    sqlMock.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(StoryStudioBrandKitRepository.create({
      ...input,
      lightLogoPhotoId: "33333333-3333-4333-8333-333333333333",
    }, access)).rejects.toBeInstanceOf(StoryStudioBrandKitAssetError);

    const [assetSql, values] = sqlMock.query.mock.calls[1] as [string, unknown[]];
    expect(normalizeSql(assetSql)).toContain("WHERE workspace_id = $1");
    expect(values[0]).toBe(access.workspaceId);
    expect(sqlMock.query).toHaveBeenCalledTimes(2);
  });

  it("protects the default kit from deletion", async () => {
    sqlMock.query.mockResolvedValueOnce([row]);
    await expect(StoryStudioBrandKitRepository.remove(row.id, access)).resolves.toBe("default_protected");
    expect(sqlMock.query).toHaveBeenCalledTimes(1);
  });
});