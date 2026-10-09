import { beforeEach, describe, expect, it, vi } from "vitest";

const { valuesGetMock, valuesUpdateMock, valuesBatchUpdateMock } = vi.hoisted(() => ({
  valuesGetMock: vi.fn(),
  valuesUpdateMock: vi.fn(),
  valuesBatchUpdateMock: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(function GoogleAuth() {
        return {};
      }),
    },
    sheets: vi.fn(() => ({
      spreadsheets: {
        values: {
          get: valuesGetMock,
          update: valuesUpdateMock,
          batchUpdate: valuesBatchUpdateMock,
        },
      },
    })),
  },
}));

import {
  createCreativeApplicationsGoogleSheetsRepository,
  creativeApplicationBusinessHeaders,
  creativeApplicationTechnicalHeaders,
  CreativeApplicationsSheetError,
  findCreativeApplicationById,
  readCreativeApplications,
  updateCreativeApplicationModeration,
  type CreativeApplicationsSheetRepository,
  type CreativeApplicationsSheetSnapshot,
  type TechnicalCellWrite,
} from "@/lib/creatives/applications-sheet";

const applicationId = "11111111-1111-4111-8111-111111111111";
const generatedApplicationId = "22222222-2222-4222-8222-222222222222";
const concurrentApplicationId = "33333333-3333-4333-8333-333333333333";
const creativeId = "44444444-4444-4444-8444-444444444444";

const businessHeaders = Object.values(creativeApplicationBusinessHeaders);
const technicalHeaders = Object.values(creativeApplicationTechnicalHeaders);
const allHeaders = [...businessHeaders, ...technicalHeaders];

const businessValues = Object.fromEntries(
  Object.keys(creativeApplicationBusinessHeaders).map((field) => [field, `${field}-value`]),
) as Record<keyof typeof creativeApplicationBusinessHeaders, string>;

const rowFrom = (
  headers: string[],
  technical?: Partial<Record<keyof typeof creativeApplicationTechnicalHeaders, string>>,
): string[] => headers.map((header) => {
  const businessEntry = Object.entries(creativeApplicationBusinessHeaders)
    .find(([, expected]) => expected === header);
  if (businessEntry) {
    return businessValues[businessEntry[0] as keyof typeof businessValues];
  }
  const technicalEntry = Object.entries(creativeApplicationTechnicalHeaders)
    .find(([, expected]) => expected === header);
  if (technicalEntry) {
    return technical?.[technicalEntry[0] as keyof typeof creativeApplicationTechnicalHeaders] ?? "";
  }
  return "";
});

type MutableRepository = CreativeApplicationsSheetRepository & {
  headers: string[];
  rows: Array<{ rowNumber: number; values: string[] }>;
  appendedHeaders: string[][];
  writes: Array<{ rowNumber: number; cells: TechnicalCellWrite[] }>;
  readCellOverride?: (
    rowNumber: number,
    columnIndex: number,
    currentValue: string,
  ) => string | undefined;
};

const createRepository = (
  headers: string[] = allHeaders,
  rows: Array<{ rowNumber: number; values: string[] }> = [{
    rowNumber: 2,
    values: rowFrom(headers, { applicationId, moderationStatus: "pending" }),
  }],
): MutableRepository => {
  const repository: MutableRepository = {
    headers: [...headers],
    rows: rows.map((row) => ({ rowNumber: row.rowNumber, values: [...row.values] })),
    appendedHeaders: [],
    writes: [],
    async readSnapshot(): Promise<CreativeApplicationsSheetSnapshot> {
      return {
        headers: [...repository.headers],
        rows: repository.rows.map((row) => ({
          rowNumber: row.rowNumber,
          values: [...row.values],
        })),
      };
    },
    async appendTechnicalHeaders(_startColumnIndex, missingHeaders) {
      repository.appendedHeaders.push([...missingHeaders]);
      repository.headers.push(...missingHeaders);
      for (const row of repository.rows) {
        row.values.push(...missingHeaders.map(() => ""));
      }
    },
    async readCell(rowNumber, columnIndex) {
      const row = repository.rows.find((candidate) => candidate.rowNumber === rowNumber);
      const current = row?.values[columnIndex] ?? "";
      return repository.readCellOverride?.(rowNumber, columnIndex, current) ?? current;
    },
    async writeTechnicalCells(rowNumber, cells) {
      repository.writes.push({
        rowNumber,
        cells: cells.map((cell) => ({ ...cell })),
      });
      const row = repository.rows.find((candidate) => candidate.rowNumber === rowNumber);
      if (!row) throw new Error("missing test row");
      for (const cell of cells) row.values[cell.columnIndex] = cell.value;
    },
  };
  return repository;
};

const dependencies = (repository: CreativeApplicationsSheetRepository) => ({
  repository,
  createUuid: () => generatedApplicationId,
  now: () => new Date("2026-10-09T15:00:00.000Z"),
});

describe("creative applications sheet adapter", () => {
  beforeEach(() => {
    valuesGetMock.mockReset();
    valuesUpdateMock.mockReset();
    valuesBatchUpdateMock.mockReset();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";
  });

  it("resolves strictly recognized business fields after headers move", async () => {
    const movedHeaders = [
      creativeApplicationTechnicalHeaders.moderationStatus,
      ...businessHeaders.slice().reverse(),
      creativeApplicationTechnicalHeaders.applicationId,
      ...technicalHeaders.filter((header) =>
        header !== creativeApplicationTechnicalHeaders.applicationId
        && header !== creativeApplicationTechnicalHeaders.moderationStatus
      ),
    ];
    const repository = createRepository(movedHeaders, [{
      rowNumber: 2,
      values: rowFrom(movedHeaders, { applicationId, moderationStatus: "approved", creativeId }),
    }]);

    const [application] = await readCreativeApplications(dependencies(repository));

    expect(application.fields.fullName).toBe("fullName-value");
    expect(application.fields.portfolioUrl).toBe("portfolioUrl-value");
    expect(application.applicationId).toBe(applicationId);
    expect(application.creativeId).toBe(creativeId);
  });

  it("adds only missing technical columns and rereads the snapshot", async () => {
    const headers = [
      ...businessHeaders,
      creativeApplicationTechnicalHeaders.applicationId,
      creativeApplicationTechnicalHeaders.moderationStatus,
    ];
    const repository = createRepository(headers, [{
      rowNumber: 2,
      values: rowFrom(headers, { applicationId, moderationStatus: "pending" }),
    }]);
    const readSnapshot = vi.spyOn(repository, "readSnapshot");

    await readCreativeApplications(dependencies(repository));

    expect(repository.appendedHeaders).toEqual([[
      creativeApplicationTechnicalHeaders.creativeId,
      creativeApplicationTechnicalHeaders.moderatedAt,
      creativeApplicationTechnicalHeaders.moderatedBy,
      creativeApplicationTechnicalHeaders.moderationNotes,
    ]]);
    expect(readSnapshot).toHaveBeenCalledTimes(2);
  });

  it("rejects a missing, renamed, or duplicated business header", async () => {
    const missing = businessHeaders.filter((header) => header !== creativeApplicationBusinessHeaders.email);
    const renamed = businessHeaders.map((header) =>
      header === creativeApplicationBusinessHeaders.email ? "Email" : header
    );
    const duplicated = [...businessHeaders, creativeApplicationBusinessHeaders.email];

    for (const headers of [missing, renamed, duplicated]) {
      const repository = createRepository([...headers, ...technicalHeaders], []);
      await expect(readCreativeApplications(dependencies(repository)))
        .rejects.toBeInstanceOf(CreativeApplicationsSheetError);
    }
  });

  it("ignores a completely empty response row", async () => {
    const repository = createRepository(allHeaders, [{
      rowNumber: 2,
      values: allHeaders.map(() => ""),
    }]);

    await expect(readCreativeApplications(dependencies(repository))).resolves.toEqual([]);
    expect(repository.writes).toEqual([]);
  });

  it("assigns a missing UUID, defaults to pending, and rereads written cells", async () => {
    const repository = createRepository(allHeaders, [{
      rowNumber: 2,
      values: rowFrom(allHeaders),
    }]);

    const [application] = await readCreativeApplications(dependencies(repository));

    expect(application.applicationId).toBe(generatedApplicationId);
    expect(application.moderationStatus).toBe("pending");
    expect(repository.writes).toHaveLength(1);
    expect(repository.writes[0].cells).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: generatedApplicationId }),
      expect.objectContaining({ value: "pending" }),
    ]));
  });

  it("uses the reread UUID as the concurrent winner", async () => {
    const repository = createRepository(allHeaders, [{
      rowNumber: 2,
      values: rowFrom(allHeaders),
    }]);
    const applicationIndex = allHeaders.indexOf(creativeApplicationTechnicalHeaders.applicationId);
    let applicationReads = 0;
    repository.readCellOverride = (_rowNumber, columnIndex, current) => {
      if (columnIndex !== applicationIndex) return current;
      applicationReads += 1;
      return applicationReads === 1 ? "" : concurrentApplicationId;
    };

    const [application] = await readCreativeApplications(dependencies(repository));

    expect(application.applicationId).toBe(concurrentApplicationId);
    expect(repository.writes[0].cells).toContainEqual(expect.objectContaining({
      value: generatedApplicationId,
    }));
  });

  it("is idempotent when the application UUID and status already exist", async () => {
    const repository = createRepository();

    const first = await readCreativeApplications(dependencies(repository));
    const second = await readCreativeApplications(dependencies(repository));

    expect(first).toEqual(second);
    expect(repository.writes).toEqual([]);
  });

  it.each([
    ["invalid UUID", { applicationId: "not-a-uuid", moderationStatus: "pending" }],
    ["invalid status", { applicationId, moderationStatus: "new" }],
  ])("rejects %s from technical columns", async (_label, technical) => {
    const repository = createRepository(allHeaders, [{
      rowNumber: 2,
      values: rowFrom(allHeaders, technical),
    }]);

    await expect(readCreativeApplications(dependencies(repository)))
      .rejects.toBeInstanceOf(CreativeApplicationsSheetError);
  });

  it("finds applications only by application_id", async () => {
    const repository = createRepository();

    await expect(findCreativeApplicationById(applicationId, dependencies(repository)))
      .resolves.toMatchObject({ applicationId });
    await expect(findCreativeApplicationById(
      "99999999-9999-4999-8999-999999999999",
      dependencies(repository),
    )).resolves.toBeNull();
  });

  it.each(["pending", "approved", "rejected"] as const)(
    "writes the allowed %s status only to technical columns",
    async (status) => {
      const repository = createRepository();
      const result = await updateCreativeApplicationModeration(applicationId, {
        status,
        ...(status === "approved" ? { creativeId } : {}),
        ...(status !== "pending" ? { moderatedBy: "user-admin" } : {}),
      }, dependencies(repository));

      expect(result.moderationStatus).toBe(status);
      expect(repository.writes).toHaveLength(1);
      expect(repository.writes[0].rowNumber).toBe(2);
      for (const cell of repository.writes[0].cells) {
        expect(technicalHeaders).toContain(repository.headers[cell.columnIndex]);
      }
    },
  );

  it("rejects inconsistent statuses before writing", async () => {
    const repository = createRepository();

    await expect(updateCreativeApplicationModeration(applicationId, {
      status: "approved",
      moderatedBy: "user-admin",
    }, dependencies(repository))).rejects.toBeInstanceOf(CreativeApplicationsSheetError);
    await expect(updateCreativeApplicationModeration(applicationId, {
      status: "rejected",
      creativeId,
      moderatedBy: "user-admin",
    }, dependencies(repository))).rejects.toBeInstanceOf(CreativeApplicationsSheetError);
    expect(repository.writes).toEqual([]);
  });

  it("neutralizes formula-like moderation values", async () => {
    const repository = createRepository();

    const result = await updateCreativeApplicationModeration(applicationId, {
      status: "rejected",
      moderatedBy: "@admin",
      notes: "=IMPORTDATA(\"https://example.test\")",
    }, dependencies(repository));

    const values = repository.writes[0].cells.map((cell) => cell.value);
    expect(values).toContain("'@admin");
    expect(values).toContain("'=IMPORTDATA(\"https://example.test\")");
    expect(result.moderationNotes).toBe("'=IMPORTDATA(\"https://example.test\")");
  });

  it("uses RAW and single-cell ranges in the Google repository", async () => {
    valuesUpdateMock.mockResolvedValue({});
    valuesBatchUpdateMock.mockResolvedValue({});
    const repository = createCreativeApplicationsGoogleSheetsRepository();

    await repository.appendTechnicalHeaders(45, technicalHeaders);
    await repository.writeTechnicalCells(7, [
      { columnIndex: 45, value: applicationId },
      { columnIndex: 50, value: "=formula" },
    ]);

    expect(valuesUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      valueInputOption: "RAW",
      requestBody: { values: [technicalHeaders] },
    }));
    expect(valuesBatchUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        valueInputOption: "RAW",
        data: [
          expect.objectContaining({
            range: "'Forms_Creatifs_Reponses'!AT7",
            values: [[applicationId]],
          }),
          expect.objectContaining({
            range: "'Forms_Creatifs_Reponses'!AY7",
            values: [["'=formula"]],
          }),
        ],
      }),
    }));
  });
});
