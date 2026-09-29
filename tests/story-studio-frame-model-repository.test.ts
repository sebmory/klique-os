import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentAccessContext } from "@/lib/content-storage/access";

const { sqlMock, createContentStorageClientMock } = vi.hoisted(() => ({
  sqlMock: { query: vi.fn() },
  createContentStorageClientMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({ createContentStorageClient: createContentStorageClientMock }));

import {
  StoryStudioFrameModelBrandKitError,
  StoryStudioFrameModelRepository,
} from "@/lib/story-studio/frame-model-repository";

const access: ContentAccessContext = {
  clerkUserId: "user-1",
  workspaceId: "workspace-1",
  mediaId: "11111111-1111-4111-8111-111111111111",
  role: "media",
  isAdmin: false,
};
const content = {
  schemaVersion: 1 as const,
  canvasFormat: "1080x1350" as const,
  templateKey: "editorial_klique" as const,
  brandKitId: null,
  brandKitSnapshot: null,
  frame: {
    text: { eyebrow: "Finale", headline: "Victoire", body: "Texte", interaction: "" },
    elements: { athleteName: true, score: true, competition: true, logo: true, signature: false, interactionZone: false },
  },
};
const row = {
  id: "22222222-2222-4222-8222-222222222222",
  workspace_id: access.workspaceId,
  created_by_user_id: access.clerkUserId,
  name: "Score premium",
  brand_kit_id: null,
  content_json: content,
  created_at: new Date("2026-09-29T10:00:00.000Z"),
  updated_at: new Date("2026-09-29T10:00:00.000Z"),
};
const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("StoryStudioFrameModelRepository", () => {
  beforeEach(() => {
    sqlMock.query.mockReset();
    createContentStorageClientMock.mockReset();
    createContentStorageClientMock.mockReturnValue(sqlMock);
  });

  it("lists models only inside the active workspace", async () => {
    sqlMock.query.mockResolvedValueOnce([row]);
    const models = await StoryStudioFrameModelRepository.list(access);
    const [sql, values] = sqlMock.query.mock.calls[0] as [string, unknown[]];
    expect(normalizeSql(sql)).toContain("WHERE workspace_id = $1");
    expect(values).toEqual([access.workspaceId]);
    expect(models[0]).toMatchObject({ name: row.name, workspaceId: access.workspaceId });
  });

  it("creates a model with the session workspace and user", async () => {
    sqlMock.query.mockResolvedValueOnce([{ ...row, name: "Nouveau" }]);
    const model = await StoryStudioFrameModelRepository.create({ name: "Nouveau", content }, access);
    const [sql, values] = sqlMock.query.mock.calls[0] as [string, unknown[]];
    expect(normalizeSql(sql)).toContain("INSERT INTO story_studio_frame_models");
    expect(values).toContain(access.workspaceId);
    expect(values).toContain(access.clerkUserId);
    expect(model.name).toBe("Nouveau");
  });

  it("rejects a Brand Kit outside the active workspace", async () => {
    sqlMock.query.mockResolvedValueOnce([]);
    await expect(StoryStudioFrameModelRepository.create({
      name: "Interdit",
      content: {
        ...content,
        brandKitId: "33333333-3333-4333-8333-333333333333",
        brandKitSnapshot: {
          name: "Autre club",
          primaryColor: "#000000",
          secondaryColor: "#FFFFFF",
          accentColor: "#F2B800",
          textColor: "#FFFFFF",
          mutedTextColor: "#CCCCCC",
          lightLogoPhotoId: null,
          darkLogoPhotoId: null,
          lightLogoUrl: null,
          darkLogoUrl: null,
          fontFamily: "Georgia",
          signatureMode: "visible",
        },
      },
    }, access)).rejects.toBeInstanceOf(StoryStudioFrameModelBrandKitError);
    const [sql, values] = sqlMock.query.mock.calls[0] as [string, unknown[]];
    expect(normalizeSql(sql)).toContain("WHERE workspace_id = $1");
    expect(values[0]).toBe(access.workspaceId);
  });

  it("rejects snapshot logo assets outside the active workspace", async () => {
    sqlMock.query.mockResolvedValueOnce([{ id: "33333333-3333-4333-8333-333333333333" }]).mockResolvedValueOnce([]);
    await expect(StoryStudioFrameModelRepository.create({
      name: "Logo interdit",
      content: {
        ...content,
        brandKitId: "33333333-3333-4333-8333-333333333333",
        brandKitSnapshot: {
          name: "Club",
          primaryColor: "#000000",
          secondaryColor: "#FFFFFF",
          accentColor: "#F2B800",
          textColor: "#FFFFFF",
          mutedTextColor: "#CCCCCC",
          lightLogoPhotoId: "44444444-4444-4444-8444-444444444444",
          darkLogoPhotoId: null,
          lightLogoUrl: "https://studio.public.blob.vercel-storage.com/story-studio/brand-kit-logos/logo.png",
          darkLogoUrl: null,
          fontFamily: "Georgia",
          signatureMode: "visible",
        },
      },
    }, access)).rejects.toBeInstanceOf(StoryStudioFrameModelBrandKitError);
    const [sql, values] = sqlMock.query.mock.calls[1] as [string, unknown[]];
    expect(normalizeSql(sql)).toContain("FROM story_studio_photos");
    expect(values[0]).toBe(access.workspaceId);
  });
});