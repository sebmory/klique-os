import { randomUUID } from "node:crypto";
import { google } from "googleapis";

export const CREATIVE_APPLICATIONS_SHEET_NAME = "Forms_Creatifs_Reponses";

export const creativeApplicationBusinessHeaders = {
  submittedAt: "Horodateur",
  fullName: "Prénom et nom",
  email: "Adresse e-mail",
  phone: "Numéro de téléphone",
  birthYear: "Année de naissance",
  city: "Localité de résidence",
  region: "Canton ou région",
  languages: "Langues utilisées",
  profile: "Quel est ton profil ?",
  experienceLevel: "Quel est ton niveau d’expérience ?",
  practiceDuration: "Depuis combien de temps pratiques-tu ?",
  background: "Présente-nous brièvement ton parcours",
  sportsExperience: "As-tu déjà travaillé dans le sport ?",
  previousProjectTypes: "Pour quels types de projets as-tu déjà travaillé ?",
  portfolioUrl: "Lien vers ton portfolio principal",
  websiteUrl: "Site internet",
  instagram: "Compte Instagram professionnel",
  otherReferences: "Autres liens ou références utiles",
  sportsToCover: "Quelles disciplines souhaites-tu couvrir ?",
  interestedMissionTypes: "Quels types de missions t’intéressent ?",
  accreditationsOrContacts: "Possèdes-tu déjà des accréditations ou des contacts dans certaines compétitions ?",
  accreditationDetails: "Si oui, précise les compétitions, clubs ou organisations concernés",
  travelRegions: "Dans quelles régions peux-tu te déplacer ?",
  drivingLicense: "Possèdes-tu un permis de conduire ?",
  vehicleAccess: "Disposes-tu généralement d’un véhicule ?",
  usualAvailability: "Quelles sont tes disponibilités habituelles ?",
  missionNotice: "Avec quel délai peux-tu généralement accepter une mission ?",
  equipment: "Décris brièvement ton matériel principal",
  software: "Quels logiciels maîtrises-tu ?",
  handlesPostproduction: "Peux-tu réaliser toi-même la sélection et la postproduction ?",
  fastDelivery: "Peux-tu livrer rapidement des contenus pendant ou après un événement ?",
  liabilityInsurance: "Disposes-tu d’une assurance responsabilité civile professionnelle ?",
  motivation: "Pourquoi souhaites-tu rejoindre le réseau créatif KLIQUE ?",
  collaborationExpectations: "Qu’attends-tu principalement de cette collaboration ?",
  availableForUnpaid: "Es-tu actuellement disponible pour des collaborations ponctuelles non rémunérées ?",
  interestedInPaidMandates: "Serais-tu intéressé par des mandats rémunérés réguliers dès 2027 ?",
  interestedInPartTime: "Serais-tu éventuellement intéressé par une collaboration à temps partiel avec KLIQUE courant 2027 ?",
  canInvoice: "Possèdes-tu un statut d’indépendant ou une structure permettant de facturer ?",
  specialConditions: "As-tu des attentes ou des conditions particulières ?",
  missionCommitment: "Engagement concernant les missions",
  currentCollaborationNature: "Nature actuelle des collaborations",
  contentUsage: "Utilisation des contenus",
  dataProtection: "Protection des données",
  contactAuthorization: "Autorisation de contact",
  additionalNotes: "Remarque ou information complémentaire",
} as const;

export const creativeApplicationTechnicalHeaders = {
  applicationId: "KLIQUE Application ID",
  moderationStatus: "Statut modération",
  creativeId: "Creative ID",
  moderatedAt: "Modéré le",
  moderatedBy: "Modéré par",
  moderationNotes: "Notes de modération",
} as const;

export const creativeApplicationModerationStatuses = [
  "pending",
  "approved",
  "rejected",
] as const;

export type CreativeApplicationField = keyof typeof creativeApplicationBusinessHeaders;
export type CreativeApplicationFields = Record<CreativeApplicationField, string>;
export type CreativeApplicationModerationStatus =
  typeof creativeApplicationModerationStatuses[number];

export type CreativeApplication = {
  applicationId: string;
  sourceRow: number;
  fields: CreativeApplicationFields;
  moderationStatus: CreativeApplicationModerationStatus;
  creativeId: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;
  moderationNotes: string | null;
};

export type UpdateCreativeApplicationModerationInput = {
  status: CreativeApplicationModerationStatus;
  creativeId?: string | null;
  moderatedAt?: string | null;
  moderatedBy?: string | null;
  notes?: string | null;
};

type SheetRow = {
  rowNumber: number;
  values: string[];
};

export type CreativeApplicationsSheetSnapshot = {
  headers: string[];
  rows: SheetRow[];
};

export type TechnicalCellWrite = {
  columnIndex: number;
  value: string;
};

export type CreativeApplicationsSheetRepository = {
  readSnapshot: () => Promise<CreativeApplicationsSheetSnapshot>;
  appendTechnicalHeaders: (startColumnIndex: number, headers: string[]) => Promise<void>;
  readCell: (rowNumber: number, columnIndex: number) => Promise<string>;
  writeTechnicalCells: (rowNumber: number, cells: TechnicalCellWrite[]) => Promise<void>;
};

export type CreativeApplicationsSheetDependencies = {
  repository: CreativeApplicationsSheetRepository;
  createUuid: () => string;
  now: () => Date;
};

export class CreativeApplicationsSheetError extends Error {
  constructor(
    public readonly code: "configuration" | "validation" | "not_found" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "CreativeApplicationsSheetError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const technicalHeaderSet = new Set<string>(Object.values(creativeApplicationTechnicalHeaders));

const normalizeCell = (value: unknown): string => String(value ?? "").trim();

const requireUuid = (value: unknown, field: string): string => {
  const normalized = normalizeCell(value).toLowerCase();
  if (!uuidPattern.test(normalized)) {
    throw new CreativeApplicationsSheetError("validation", `${field} doit être un UUID valide.`);
  }
  return normalized;
};

const normalizeModerationStatus = (value: unknown): CreativeApplicationModerationStatus => {
  if (
    typeof value !== "string"
    || !creativeApplicationModerationStatuses.includes(value as CreativeApplicationModerationStatus)
  ) {
    throw new CreativeApplicationsSheetError("validation", "Statut de modération invalide.");
  }
  return value as CreativeApplicationModerationStatus;
};

const nullableCell = (value: unknown): string | null => {
  const normalized = normalizeCell(value);
  return normalized || null;
};

const resolveHeaderIndex = (headers: string[], expected: string): number => {
  const matches = headers
    .map((header, index) => normalizeCell(header) === expected ? index : -1)
    .filter((index) => index >= 0);
  if (matches.length === 0) {
    throw new CreativeApplicationsSheetError("validation", `Colonne introuvable : ${expected}.`);
  }
  if (matches.length > 1) {
    throw new CreativeApplicationsSheetError("validation", `Colonne dupliquée : ${expected}.`);
  }
  return matches[0];
};

type HeaderIndexes = {
  business: Record<CreativeApplicationField, number>;
  technical: Record<keyof typeof creativeApplicationTechnicalHeaders, number>;
};

const resolveHeaderIndexes = (headers: string[]): HeaderIndexes => ({
  business: Object.fromEntries(
    Object.entries(creativeApplicationBusinessHeaders)
      .map(([field, header]) => [field, resolveHeaderIndex(headers, header)]),
  ) as Record<CreativeApplicationField, number>,
  technical: Object.fromEntries(
    Object.entries(creativeApplicationTechnicalHeaders)
      .map(([field, header]) => [field, resolveHeaderIndex(headers, header)]),
  ) as Record<keyof typeof creativeApplicationTechnicalHeaders, number>,
});

const rowContainsBusinessData = (
  row: SheetRow,
  indexes: Record<CreativeApplicationField, number>,
): boolean => Object.values(indexes).some((index) => normalizeCell(row.values[index]));

const parseFields = (
  values: string[],
  indexes: Record<CreativeApplicationField, number>,
): CreativeApplicationFields => Object.fromEntries(
  Object.entries(indexes).map(([field, index]) => [field, normalizeCell(values[index])]),
) as CreativeApplicationFields;

const neutralizeFormula = (value: string): string =>
  /^\s*[=+\-@]/.test(value) ? `'${value}` : value;

const validateRowNumber = (rowNumber: number): void => {
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 1_000_000) {
    throw new CreativeApplicationsSheetError("validation", "Ligne Google Sheets invalide.");
  }
};

const validateTechnicalWrites = (
  headers: string[],
  cells: TechnicalCellWrite[],
): TechnicalCellWrite[] => {
  if (cells.length === 0) {
    throw new CreativeApplicationsSheetError("validation", "Aucune cellule technique à écrire.");
  }
  const seen = new Set<number>();
  return cells.map((cell) => {
    if (
      !Number.isInteger(cell.columnIndex)
      || cell.columnIndex < 0
      || !technicalHeaderSet.has(normalizeCell(headers[cell.columnIndex]))
      || seen.has(cell.columnIndex)
    ) {
      throw new CreativeApplicationsSheetError("validation", "Écriture hors colonne technique refusée.");
    }
    seen.add(cell.columnIndex);
    return { columnIndex: cell.columnIndex, value: neutralizeFormula(String(cell.value ?? "")) };
  });
};

const ensureTechnicalHeaders = async (
  repository: CreativeApplicationsSheetRepository,
): Promise<CreativeApplicationsSheetSnapshot> => {
  let snapshot = await repository.readSnapshot();
  const normalizedHeaders = new Set(snapshot.headers.map(normalizeCell));
  const missing = Object.values(creativeApplicationTechnicalHeaders)
    .filter((header) => !normalizedHeaders.has(header));
  if (missing.length === 0) return snapshot;

  await repository.appendTechnicalHeaders(snapshot.headers.length, missing);
  snapshot = await repository.readSnapshot();

  for (const header of Object.values(creativeApplicationTechnicalHeaders)) {
    resolveHeaderIndex(snapshot.headers, header);
  }
  return snapshot;
};

const initializeTechnicalIdentity = async (
  row: SheetRow,
  headers: string[],
  indexes: HeaderIndexes,
  dependencies: CreativeApplicationsSheetDependencies,
): Promise<{ applicationId: string; moderationStatus: CreativeApplicationModerationStatus }> => {
  const { repository } = dependencies;
  const applicationIdIndex = indexes.technical.applicationId;
  const moderationStatusIndex = indexes.technical.moderationStatus;
  let applicationId = normalizeCell(row.values[applicationIdIndex]);
  let moderationStatus = normalizeCell(row.values[moderationStatusIndex]);

  if (!applicationId) {
    const currentApplicationId = normalizeCell(await repository.readCell(row.rowNumber, applicationIdIndex));
    applicationId = currentApplicationId;
    if (!applicationId) {
      const generatedId = dependencies.createUuid();
      requireUuid(generatedId, "UUID généré");
      const cells: TechnicalCellWrite[] = [{ columnIndex: applicationIdIndex, value: generatedId }];
      if (!moderationStatus) {
        cells.push({ columnIndex: moderationStatusIndex, value: "pending" });
      }
      await repository.writeTechnicalCells(
        row.rowNumber,
        validateTechnicalWrites(headers, cells),
      );
      applicationId = normalizeCell(await repository.readCell(row.rowNumber, applicationIdIndex));
      moderationStatus = normalizeCell(await repository.readCell(row.rowNumber, moderationStatusIndex));
    }
  }

  applicationId = requireUuid(applicationId, "KLIQUE Application ID");

  if (!moderationStatus) {
    moderationStatus = normalizeCell(await repository.readCell(row.rowNumber, moderationStatusIndex));
    if (!moderationStatus) {
      await repository.writeTechnicalCells(
        row.rowNumber,
        validateTechnicalWrites(headers, [
          { columnIndex: moderationStatusIndex, value: "pending" },
        ]),
      );
      moderationStatus = normalizeCell(await repository.readCell(row.rowNumber, moderationStatusIndex));
    }
  }

  return {
    applicationId,
    moderationStatus: normalizeModerationStatus(moderationStatus),
  };
};

const parseTechnicalFields = (
  row: SheetRow,
  indexes: HeaderIndexes,
  initialized: { applicationId: string; moderationStatus: CreativeApplicationModerationStatus },
): CreativeApplication => {
  const creativeIdValue = normalizeCell(row.values[indexes.technical.creativeId]);
  return {
    applicationId: initialized.applicationId,
    sourceRow: row.rowNumber,
    fields: parseFields(row.values, indexes.business),
    moderationStatus: initialized.moderationStatus,
    creativeId: creativeIdValue
      ? requireUuid(creativeIdValue, "Creative ID")
      : null,
    moderatedAt: nullableCell(row.values[indexes.technical.moderatedAt]),
    moderatedBy: nullableCell(row.values[indexes.technical.moderatedBy]),
    moderationNotes: nullableCell(row.values[indexes.technical.moderationNotes]),
  };
};

const resolveDependencies = (
  dependencies?: Partial<CreativeApplicationsSheetDependencies>,
): CreativeApplicationsSheetDependencies => ({
  repository: dependencies?.repository ?? createCreativeApplicationsGoogleSheetsRepository(),
  createUuid: dependencies?.createUuid ?? randomUUID,
  now: dependencies?.now ?? (() => new Date()),
});

export const readCreativeApplications = async (
  dependencies?: Partial<CreativeApplicationsSheetDependencies>,
): Promise<CreativeApplication[]> => {
  const resolved = resolveDependencies(dependencies);
  const snapshot = await ensureTechnicalHeaders(resolved.repository);
  const indexes = resolveHeaderIndexes(snapshot.headers);
  const applications: CreativeApplication[] = [];
  const seenApplicationIds = new Set<string>();

  for (const row of snapshot.rows) {
    validateRowNumber(row.rowNumber);
    if (!rowContainsBusinessData(row, indexes.business)) continue;
    const initialized = await initializeTechnicalIdentity(
      row,
      snapshot.headers,
      indexes,
      resolved,
    );
    if (seenApplicationIds.has(initialized.applicationId)) {
      throw new CreativeApplicationsSheetError(
        "conflict",
        "Plusieurs candidatures utilisent le même KLIQUE Application ID.",
      );
    }
    seenApplicationIds.add(initialized.applicationId);
    applications.push(parseTechnicalFields(row, indexes, initialized));
  }

  return applications;
};

export const findCreativeApplicationById = async (
  applicationId: string,
  dependencies?: Partial<CreativeApplicationsSheetDependencies>,
): Promise<CreativeApplication | null> => {
  const id = requireUuid(applicationId, "applicationId");
  const applications = await readCreativeApplications(dependencies);
  return applications.find((application) => application.applicationId === id) ?? null;
};

export const updateCreativeApplicationModeration = async (
  applicationId: string,
  input: UpdateCreativeApplicationModerationInput,
  dependencies?: Partial<CreativeApplicationsSheetDependencies>,
): Promise<CreativeApplication> => {
  const id = requireUuid(applicationId, "applicationId");
  const resolved = resolveDependencies(dependencies);
  const snapshot = await ensureTechnicalHeaders(resolved.repository);
  const indexes = resolveHeaderIndexes(snapshot.headers);
  const matchingRows = snapshot.rows.filter((row) =>
    normalizeCell(row.values[indexes.technical.applicationId]).toLowerCase() === id
  );
  if (matchingRows.length === 0) {
    throw new CreativeApplicationsSheetError("not_found", "Candidature créative introuvable.");
  }
  if (matchingRows.length > 1) {
    throw new CreativeApplicationsSheetError(
      "conflict",
      "Plusieurs candidatures utilisent le même KLIQUE Application ID.",
    );
  }

  const row = matchingRows[0];
  if (!rowContainsBusinessData(row, indexes.business)) {
    throw new CreativeApplicationsSheetError("not_found", "Candidature créative introuvable.");
  }
  const status = normalizeModerationStatus(input.status);
  const moderatedBy = nullableCell(input.moderatedBy);
  const notes = nullableCell(input.notes);
  let creativeId: string | null = null;
  let moderatedAt: string | null = null;

  if (status === "approved") {
    creativeId = requireUuid(input.creativeId, "creativeId");
  } else if (input.creativeId) {
    throw new CreativeApplicationsSheetError(
      "validation",
      "creativeId est réservé au statut approved.",
    );
  }

  if (status !== "pending") {
    if (!moderatedBy) {
      throw new CreativeApplicationsSheetError(
        "validation",
        "moderatedBy est requis pour une décision de modération.",
      );
    }
    const moderatedDate = input.moderatedAt === null || input.moderatedAt === undefined
      ? resolved.now()
      : new Date(input.moderatedAt);
    if (Number.isNaN(moderatedDate.getTime())) {
      throw new CreativeApplicationsSheetError("validation", "moderatedAt est invalide.");
    }
    moderatedAt = moderatedDate.toISOString();
  }

  const cells = validateTechnicalWrites(snapshot.headers, [
    { columnIndex: indexes.technical.moderationStatus, value: status },
    { columnIndex: indexes.technical.creativeId, value: creativeId ?? "" },
    { columnIndex: indexes.technical.moderatedAt, value: moderatedAt ?? "" },
    { columnIndex: indexes.technical.moderatedBy, value: moderatedBy ?? "" },
    { columnIndex: indexes.technical.moderationNotes, value: notes ?? "" },
  ]);
  await resolved.repository.writeTechnicalCells(row.rowNumber, cells);

  return {
    applicationId: id,
    sourceRow: row.rowNumber,
    fields: parseFields(row.values, indexes.business),
    moderationStatus: status,
    creativeId,
    moderatedAt,
    moderatedBy: status === "pending" ? null : moderatedBy,
    moderationNotes: notes ? neutralizeFormula(notes) : null,
  };
};

const getGoogleAuth = () => {
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawCredentials) {
    const credentials = JSON.parse(rawCredentials) as {
      client_email?: string;
      private_key?: string;
    };
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }

  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!keyFile) {
    throw new CreativeApplicationsSheetError(
      "configuration",
      "Authentification Google Sheets non configurée.",
    );
  }
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
};

const toColumnLetters = (zeroBasedColumn: number): string => {
  let current = zeroBasedColumn + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
};

export const createCreativeApplicationsGoogleSheetsRepository = (
): CreativeApplicationsSheetRepository => {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (!spreadsheetId) {
    throw new CreativeApplicationsSheetError("configuration", "GOOGLE_SHEET_ID manquant.");
  }
  const sheets = google.sheets({ version: "v4", auth: getGoogleAuth() });
  const rangeForCell = (rowNumber: number, columnIndex: number): string => {
    validateRowNumber(rowNumber);
    if (!Number.isInteger(columnIndex) || columnIndex < 0) {
      throw new CreativeApplicationsSheetError("validation", "Colonne Google Sheets invalide.");
    }
    const column = toColumnLetters(columnIndex);
    return `'${CREATIVE_APPLICATIONS_SHEET_NAME}'!${column}${rowNumber}`;
  };

  return {
    async readSnapshot() {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${CREATIVE_APPLICATIONS_SHEET_NAME}'!A1:ZZ`,
        valueRenderOption: "FORMULA",
      });
      const values = (response.data.values ?? [])
        .map((row) => row.map((value) => String(value ?? "")));
      return {
        headers: values[0] ?? [],
        rows: values.slice(1).map((row, index) => ({
          rowNumber: index + 2,
          values: row,
        })),
      };
    },

    async appendTechnicalHeaders(startColumnIndex, headers) {
      if (!Number.isInteger(startColumnIndex) || startColumnIndex < 0 || headers.length === 0) {
        throw new CreativeApplicationsSheetError("validation", "Ajout d’en-têtes invalide.");
      }
      if (headers.some((header) => !technicalHeaderSet.has(header))) {
        throw new CreativeApplicationsSheetError(
          "validation",
          "Seules les colonnes techniques Créatifs peuvent être ajoutées.",
        );
      }
      const endColumnIndex = startColumnIndex + headers.length - 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${CREATIVE_APPLICATIONS_SHEET_NAME}'!${toColumnLetters(startColumnIndex)}1:${toColumnLetters(endColumnIndex)}1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    },

    async readCell(rowNumber, columnIndex) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: rangeForCell(rowNumber, columnIndex),
        valueRenderOption: "FORMULA",
      });
      return String(response.data.values?.[0]?.[0] ?? "");
    },

    async writeTechnicalCells(rowNumber, cells) {
      if (cells.length === 0) {
        throw new CreativeApplicationsSheetError("validation", "Aucune cellule technique à écrire.");
      }
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: cells.map((cell) => ({
            range: rangeForCell(rowNumber, cell.columnIndex),
            values: [[neutralizeFormula(String(cell.value ?? ""))]],
          })),
        },
      });
    },
  };
};
