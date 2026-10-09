import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateFormApplicationCreativeProfileInput } from "@/types/creative";

const { sqlMock, createContentStorageClientMock } = vi.hoisted(() => ({
  sqlMock: { query: vi.fn() },
  createContentStorageClientMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
}));

import {
  CreativeProfileRepository,
  CreativeProfileValidationError,
} from "@/lib/creatives/repository";

const creativeId = "11111111-1111-4111-8111-111111111111";
const applicationId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "workspace-1";
const approvedAt = "2026-10-09T12:00:00.000Z";

const input: CreateFormApplicationCreativeProfileInput = {
  provenance: "form_application",
  applicationId,
  displayName: "Camille Martin",
  creativeType: "both",
  contactEmail: "camille@example.com",
  phone: "+41 79 000 00 00",
  websiteUrl: "https://example.com",
  portfolioUrl: "https://portfolio.example.com",
  instagram: "@camille",
  city: "Lausanne",
  country: "Suisse",
  coverageAreas: ["Vaud", "Fribourg"],
  specialties: ["Sport", "Portrait"],
  bio: "Photographe et videaste.",
  status: "active",
  sourceRow: 12,
  approvedByClerkUserId: "user-admin",
  approvedAt,
};

const row = {
  id: creativeId,
  workspace_id: workspaceId,
  provenance: input.provenance,
  application_id: applicationId,
  display_name: input.displayName,
  creative_type: input.creativeType,
  contact_email: input.contactEmail,
  phone: input.phone,
  website_url: "https://example.com/",
  portfolio_url: "https://portfolio.example.com/",
  instagram: input.instagram,
  city: input.city,
  country: input.country,
  coverage_areas: input.coverageAreas,
  specialties: input.specialties,
  bio: input.bio,
  status: input.status,
  source_row: input.sourceRow,
  approved_by_clerk_user_id: input.approvedByClerkUserId,
  approved_at: approvedAt,
  created_at: approvedAt,
  updated_at: approvedAt,
};

const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("CreativeProfileRepository", () => {
  beforeEach(() => {
    sqlMock.query.mockReset();
    createContentStorageClientMock.mockReset();
    createContentStorageClientMock.mockReturnValue(sqlMock);
  });

  it("counts only active profiles in the explicit workspace and safely returns zero", async () => {
    sqlMock.query.mockResolvedValueOnce([{ count: 3 }]).mockResolvedValueOnce([]);

    await expect(CreativeProfileRepository.countActive("klique-os")).resolves.toBe(3);
    await expect(CreativeProfileRepository.countActive("workspace-empty")).resolves.toBe(0);

    const [sql, values] = sqlMock.query.mock.calls[0] as [string, unknown[]];
    expect(normalizeSql(sql)).toContain("FROM creative_profiles");
    expect(normalizeSql(sql)).toContain("WHERE workspace_id = $1 AND status = 'active'");
    expect(values).toEqual(["klique-os"]);
    expect(sql).not.toMatch(/Forms_Creatifs_Reponses/i);
    expect(sql).not.toMatch(/display_name|contact_email|portfolio/i);
    expect(sql).not.toMatch(/provenance/i);
  });

  it("creates a manual profile with null application provenance fields and no matching lookup", async () => {
    sqlMock.query.mockResolvedValue([{
      ...row,
      provenance: "admin_manual",
      application_id: null,
      source_row: null,
    }]);

    const created = await CreativeProfileRepository.createManual(workspaceId, {
      ...input,
      provenance: "admin_manual",
      applicationId: null,
      sourceRow: null,
    });

    expect(created).toMatchObject({
      provenance: "admin_manual",
      applicationId: null,
      sourceRow: null,
      status: "active",
    });
    expect(sqlMock.query).toHaveBeenCalledOnce();
    const [sql, values] = sqlMock.query.mock.calls[0] as [string, unknown[]];
    expect(normalizeSql(sql)).toContain("INSERT INTO creative_profiles");
    expect(normalizeSql(sql)).toContain("provenance, application_id");
    expect(normalizeSql(sql)).toContain("$1::uuid, $2, $3, NULL");
    expect(normalizeSql(sql)).toContain("status, source_row");
    expect(sql).not.toMatch(/ON CONFLICT|SELECT/i);
    expect(values).toContain("admin_manual");
    expect(values).toContain(workspaceId);
  });

  it("rejects inconsistent manual provenance fields before querying", async () => {
    await expect(CreativeProfileRepository.createManual(workspaceId, {
      ...input,
      provenance: "admin_manual",
      applicationId,
      sourceRow: null,
    } as never)).rejects.toBeInstanceOf(CreativeProfileValidationError);
    expect(sqlMock.query).not.toHaveBeenCalled();
  });

  it("rejects inconsistent manual provenance returned by storage", async () => {
    sqlMock.query.mockResolvedValue([{
      ...row,
      provenance: "admin_manual",
      application_id: applicationId,
      source_row: null,
    }]);

    await expect(CreativeProfileRepository.createManual(workspaceId, {
      ...input,
      provenance: "admin_manual",
      applicationId: null,
      sourceRow: null,
    })).rejects.toBeInstanceOf(CreativeProfileValidationError);
  });

  it("creates idempotently on workspace and application id", async () => {
    sqlMock.query.mockResolvedValue([row]);

    const first = await CreativeProfileRepository.createIdempotent(workspaceId, input);
    const second = await CreativeProfileRepository.createIdempotent(workspaceId, input);

    expect(first.id).toBe(creativeId);
    expect(second.id).toBe(creativeId);
    expect(sqlMock.query).toHaveBeenCalledTimes(2);
    for (const [sql, values] of sqlMock.query.mock.calls as Array<[string, unknown[]]>) {
      expect(normalizeSql(sql)).toContain("ON CONFLICT (workspace_id, application_id)");
      expect(normalizeSql(sql)).toContain("DO UPDATE SET application_id = creative_profiles.application_id");
      expect(values).toContain(workspaceId);
      expect(values).toContain(applicationId);
    }
  });

  it("allows the same application id in distinct explicit workspaces", async () => {
    sqlMock.query
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ ...row, workspace_id: "workspace-2" }]);

    const first = await CreativeProfileRepository.createIdempotent(workspaceId, input);
    const second = await CreativeProfileRepository.createIdempotent("workspace-2", input);

    expect(first.workspaceId).toBe(workspaceId);
    expect(second.workspaceId).toBe("workspace-2");
    expect(sqlMock.query.mock.calls[0][1]).toContain(workspaceId);
    expect(sqlMock.query.mock.calls[1][1]).toContain("workspace-2");
  });

  it("scopes UUID lookup and list to the explicit workspace", async () => {
    sqlMock.query.mockResolvedValueOnce([row]).mockResolvedValueOnce([row]);

    await CreativeProfileRepository.getById(workspaceId, creativeId);
    await CreativeProfileRepository.list(workspaceId);

    const [getSql, getValues] = sqlMock.query.mock.calls[0] as [string, unknown[]];
    const [listSql, listValues] = sqlMock.query.mock.calls[1] as [string, unknown[]];
    expect(normalizeSql(getSql)).toContain("WHERE workspace_id = $1 AND id = $2::uuid");
    expect(getValues).toEqual([workspaceId, creativeId]);
    expect(normalizeSql(listSql)).toContain("WHERE workspace_id = $1");
    expect(listValues).toEqual([workspaceId]);
  });

  it("edits only the requested UUID inside its workspace", async () => {
    sqlMock.query
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ ...row, display_name: "Camille Studio", specialties: ["Sport"] }]);

    const updated = await CreativeProfileRepository.update(workspaceId, creativeId, {
      displayName: "Camille Studio",
      specialties: ["Sport"],
    });

    expect(updated?.displayName).toBe("Camille Studio");
    const [sql, values] = sqlMock.query.mock.calls[1] as [string, unknown[]];
    expect(normalizeSql(sql)).toContain("status = $13");
    expect(normalizeSql(sql)).toContain("WHERE workspace_id = $14 AND id = $15::uuid");
    expect(values.at(-2)).toBe(workspaceId);
    expect(values.at(-1)).toBe(creativeId);
    const updateClause = normalizeSql(sql).split(" SET ")[1]?.split(" WHERE ")[0] ?? "";
    expect(updateClause).not.toMatch(/application_id|source_row|approved_|created_at/);
  });

  it("updates fields and status atomically inside the workspace", async () => {
    sqlMock.query
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{
        ...row,
        display_name: "Camille Studio",
        status: "inactive",
      }]);

    const updated = await CreativeProfileRepository.update(workspaceId, creativeId, {
      displayName: "Camille Studio",
      status: "inactive",
    });

    expect(updated).toMatchObject({
      displayName: "Camille Studio",
      status: "inactive",
    });
    const [sql, values] = sqlMock.query.mock.calls[1] as [string, unknown[]];
    expect(normalizeSql(sql)).toContain("status = $13");
    expect(values).toContain("inactive");
    expect(values.at(-2)).toBe(workspaceId);
    expect(values.at(-1)).toBe(creativeId);
  });

  it("activates and deactivates with workspace-scoped updates", async () => {
    sqlMock.query
      .mockResolvedValueOnce([{ ...row, status: "active" }])
      .mockResolvedValueOnce([{ ...row, status: "inactive" }]);

    await expect(CreativeProfileRepository.activate(workspaceId, creativeId))
      .resolves.toMatchObject({ status: "active" });
    await expect(CreativeProfileRepository.deactivate(workspaceId, creativeId))
      .resolves.toMatchObject({ status: "inactive" });

    expect(sqlMock.query.mock.calls[0][1]).toEqual(["active", workspaceId, creativeId]);
    expect(sqlMock.query.mock.calls[1][1]).toEqual(["inactive", workspaceId, creativeId]);
    for (const [sql] of sqlMock.query.mock.calls as Array<[string, unknown[]]>) {
      expect(normalizeSql(sql)).toContain("WHERE workspace_id = $2 AND id = $3::uuid");
    }
  });

  it.each([
    ["missing workspace", "", input],
    ["invalid application UUID", workspaceId, { ...input, applicationId: "application-1" }],
    ["invalid email", workspaceId, { ...input, contactEmail: "invalid" }],
    ["invalid creative type", workspaceId, { ...input, creativeType: "designer" }],
    ["invalid status", workspaceId, { ...input, status: "pending" }],
    ["invalid source row", workspaceId, { ...input, sourceRow: 1 }],
  ])("rejects %s before querying", async (_label, workspace, invalidInput) => {
    await expect(CreativeProfileRepository.createIdempotent(
      workspace,
      invalidInput as CreateFormApplicationCreativeProfileInput,
    )).rejects.toBeInstanceOf(CreativeProfileValidationError);
    expect(sqlMock.query).not.toHaveBeenCalled();
  });

  it("rejects invalid creative UUIDs and statuses before querying", async () => {
    await expect(CreativeProfileRepository.getById(workspaceId, "not-a-uuid"))
      .rejects.toBeInstanceOf(CreativeProfileValidationError);
    await expect(CreativeProfileRepository.setStatus(
      workspaceId,
      creativeId,
      "pending" as "active",
    )).rejects.toBeInstanceOf(CreativeProfileValidationError);
    expect(sqlMock.query).not.toHaveBeenCalled();
  });
});
