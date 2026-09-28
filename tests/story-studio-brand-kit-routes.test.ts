import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentAccessError } from "@/lib/content-storage/access";
import { GET as listKits, POST as createKit } from "@/app/api/contents/storage/story-studio/brand-kits/route";
import {
  DELETE as deleteKit,
  GET as getKit,
  PATCH as updateKit,
} from "@/app/api/contents/storage/story-studio/brand-kits/[brandKitId]/route";

const { repositoryMock, requireContentAccessMock } = vi.hoisted(() => ({
  repositoryMock: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  requireContentAccessMock: vi.fn(),
}));

vi.mock("@/lib/story-studio/brand-kit-repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/story-studio/brand-kit-repository")>(),
  StoryStudioBrandKitRepository: repositoryMock,
}));
vi.mock("@/lib/content-storage/access", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/content-storage/access")>(),
  requireContentAccess: requireContentAccessMock,
}));

const access = { clerkUserId: "user-1", workspaceId: "workspace-1", mediaId: null, role: "admin" as const, isAdmin: true };
const id = "22222222-2222-4222-8222-222222222222";
const kit = { id, workspaceId: access.workspaceId, name: "KLIQUE", isDefault: true };
const input = {
  name: "Club Nord",
  primaryColor: "#000000",
  secondaryColor: "#FFFFFF",
  accentColor: "#F2B800",
  textColor: "#FFFFFF",
  mutedTextColor: "#CCCCCC",
  lightLogoPhotoId: null,
  darkLogoPhotoId: null,
  fontFamily: "Georgia",
  signatureMode: "visible",
};
const params = { params: Promise.resolve({ brandKitId: id }) };
const request = (method = "GET", body?: unknown) => new Request("http://localhost", {
  method,
  headers: body ? { "content-type": "application/json" } : undefined,
  body: body ? JSON.stringify(body) : undefined,
});

describe("Story Studio Brand Kit routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireContentAccessMock.mockResolvedValue(access);
    repositoryMock.list.mockResolvedValue([kit]);
    repositoryMock.getById.mockResolvedValue(kit);
    repositoryMock.create.mockResolvedValue({ ...kit, ...input, isDefault: false });
    repositoryMock.update.mockResolvedValue({ ...kit, accentColor: "#ABCDEF" });
    repositoryMock.remove.mockResolvedValue("deleted");
  });

  it("lists and creates kits through the authenticated workspace repository", async () => {
    const listResponse = await listKits(request());
    expect(listResponse.status).toBe(200);
    expect(repositoryMock.list).toHaveBeenCalledWith(access);

    const createResponse = await createKit(request("POST", input));
    expect(createResponse.status).toBe(201);
    expect(repositoryMock.create).toHaveBeenCalledWith(input, access);
  });

  it("rejects invalid colors before persistence", async () => {
    const response = await createKit(request("POST", { ...input, accentColor: "yellow" }));
    expect(response.status).toBe(400);
    expect(repositoryMock.create).not.toHaveBeenCalled();
  });

  it("reads and partially updates one workspace kit", async () => {
    expect((await getKit(request(), params)).status).toBe(200);
    const response = await updateKit(request("PATCH", { accentColor: "#abcdef" }), params);
    expect(response.status).toBe(200);
    expect(repositoryMock.update).toHaveBeenCalledWith(id, { accentColor: "#ABCDEF" }, access);
  });

  it("returns 409 when deleting the default KLIQUE kit", async () => {
    repositoryMock.remove.mockResolvedValueOnce("default_protected");
    const response = await deleteKit(request("DELETE"), params);
    expect(response.status).toBe(409);
  });

  it("maps access failures before repository calls", async () => {
    requireContentAccessMock.mockRejectedValueOnce(new ContentAccessError("FORBIDDEN"));
    const response = await listKits(request());
    expect(response.status).toBe(403);
    expect(repositoryMock.list).not.toHaveBeenCalled();
  });

  it("rejects malformed resource IDs", async () => {
    const response = await getKit(request(), { params: Promise.resolve({ brandKitId: "not-a-uuid" }) });
    expect(response.status).toBe(400);
    expect(repositoryMock.getById).not.toHaveBeenCalled();
  });
});