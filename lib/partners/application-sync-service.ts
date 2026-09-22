import { createHash } from "node:crypto";
import { google } from "googleapis";

type SheetRow = { rowNumber: number; values: string[] };

type FormApplication = {
  rowNumber: number;
  timestamp: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  facebook: string;
  description: string;
  proposedBenefitType: string;
  proposedBenefitDetails: string;
  collaboration: string;
  communicationConsent: string;
  logoUrl: string;
};

export type PartnerApplicationSyncResult = {
  status: "created" | "updated" | "unchanged";
  sourceRow: number;
  canonicalRow: number;
  partnerId: string;
  partnerName: string;
};

export type PartnerApplicationSyncRepository = {
  readFormRow: (rowNumber: number) => Promise<{ headers: string[]; values: string[] } | null>;
  readCanonicalSheet: () => Promise<{ headerRowNumber: number; headers: string[]; rows: SheetRow[] }>;
  readCanonicalSheetProperties: () => Promise<{ sheetId: unknown; columnCount: unknown }>;
  appendCanonicalColumns: (sheetId: number, columnCount: number) => Promise<void>;
  updateCanonicalHeaders: (headerRowNumber: number, startColumn: number, headers: string[]) => Promise<void>;
  repairCanonicalPartnerId: (rowNumber: number, partnerId: string) => Promise<void>;
  updateCanonicalRow: (rowNumber: number, values: string[]) => Promise<void>;
  appendCanonicalRow: (values: string[]) => Promise<number>;
};

export type PartnerApplicationSyncDependencies = {
  repository: PartnerApplicationSyncRepository;
  now: () => Date;
};

export class PartnerApplicationSyncError extends Error {
  constructor(
    public readonly code: "validation" | "not_found" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "PartnerApplicationSyncError";
  }
}

type CanonicalField =
  | "name"
  | "relationType"
  | "category"
  | "contact"
  | "email"
  | "phone"
  | "website"
  | "status"
  | "firstContactDate"
  | "partnerId"
  | "instagram"
  | "facebook"
  | "description"
  | "proposedBenefitType"
  | "proposedBenefitDetails"
  | "collaboration"
  | "communicationConsent"
  | "logoUrl"
  | "sourceRow"
  | "syncedAt";

const canonicalHeaders: Record<CanonicalField, { name: string; aliases: string[] }> = {
  name: { name: "Nom", aliases: ["Nom", "Nom partenaire"] },
  relationType: { name: "Type de relation", aliases: ["Type de relation", "Type"] },
  category: { name: "Catégorie", aliases: ["Catégorie"] },
  contact: { name: "Contact principal", aliases: ["Contact principal", "Contact"] },
  email: { name: "E-mail", aliases: ["E-mail", "Email"] },
  phone: { name: "Téléphone", aliases: ["Téléphone", "Telephone", "Tél"] },
  website: { name: "Site", aliases: ["Site", "Site internet", "Site web", "Website"] },
  status: { name: "Statut", aliases: ["Statut"] },
  firstContactDate: { name: "Date premier contact", aliases: ["Date premier contact"] },
  partnerId: { name: "Partner ID", aliases: ["Partner ID", "ID partenaire", "Partner UUID"] },
  instagram: { name: "Instagram", aliases: ["Instagram"] },
  facebook: { name: "Facebook", aliases: ["Facebook"] },
  description: { name: "Description", aliases: ["Description", "Présentation"] },
  proposedBenefitType: { name: "Type d’avantage proposé", aliases: ["Type d’avantage proposé"] },
  proposedBenefitDetails: { name: "Détails de l’avantage proposé", aliases: ["Détails de l’avantage proposé"] },
  collaboration: { name: "Collaborations proposées", aliases: ["Collaborations proposées"] },
  communicationConsent: { name: "Consentement communication", aliases: ["Consentement communication"] },
  logoUrl: { name: "Logo partenaire", aliases: ["Logo partenaire"] },
  sourceRow: { name: "Ligne formulaire source", aliases: ["Ligne formulaire source"] },
  syncedAt: { name: "Synchronisé le", aliases: ["Synchronisé le"] },
};

const formHeaders = {
  timestamp: ["Horodateur", "Timestamp"],
  name: ["Nom de l'entreprise"],
  contact: ["Personne de contact"],
  email: ["E-mail de contact"],
  phone: ["Téléphone"],
  website: ["Site internet"],
  instagram: ["Instagram"],
  facebook: ["Facebook"],
  description: ["Présentez votre activité en quelques mots / lignes"],
  proposedBenefitType: ["Quels avantages souhaiteriez-vous proposer aux membres Klique (la liste est évolutive) ?"],
  proposedBenefitDetails: ["Merci de préciser les détails des avantages sélectionnés (% de réduction, nature de l'offre / cadeau /produits à tester / etc.)"],
  collaboration: ["Quels types de collaborations vous intéressent pour votre entreprise (la liste est évolutive) ?"],
  communicationConsent: ["Communication - Acceptez-vous que Klique utilise votre logo et vos visuels pour présenter le partenariat ?"],
  logoUrl: ["Logo - Disposez-vous d'un logo HD pour la communication de Klique ?"],
} as const;

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizeKey = (value: unknown): string => normalizeText(value)
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const normalizeEmail = (value: unknown): string => normalizeText(value).toLowerCase();

const resolveHeader = (headers: string[], aliases: readonly string[]): number => {
  const candidates = new Set(aliases.map(normalizeKey));
  const matches = headers
    .map((header, index) => candidates.has(normalizeKey(header)) ? index : -1)
    .filter((index) => index >= 0);
  if (matches.length !== 1) {
    throw new PartnerApplicationSyncError(
      "validation",
      matches.length === 0
        ? `Colonne introuvable : ${aliases[0]}.`
        : `Colonne dupliquée : ${aliases[0]}.`,
    );
  }
  return matches[0];
};

const parseFormApplication = (
  rowNumber: number,
  headers: string[],
  values: string[],
): FormApplication => {
  const read = (aliases: readonly string[]): string => normalizeText(values[resolveHeader(headers, aliases)]);
  const application = {
    rowNumber,
    timestamp: read(formHeaders.timestamp),
    name: read(formHeaders.name),
    contact: read(formHeaders.contact),
    email: read(formHeaders.email),
    phone: read(formHeaders.phone),
    website: read(formHeaders.website),
    instagram: read(formHeaders.instagram),
    facebook: read(formHeaders.facebook),
    description: read(formHeaders.description),
    proposedBenefitType: read(formHeaders.proposedBenefitType),
    proposedBenefitDetails: read(formHeaders.proposedBenefitDetails),
    collaboration: read(formHeaders.collaboration),
    communicationConsent: read(formHeaders.communicationConsent),
    logoUrl: read(formHeaders.logoUrl),
  };
  if (!application.name) {
    throw new PartnerApplicationSyncError("validation", "Le nom d’entreprise du formulaire est requis.");
  }
  return application;
};

const namespaceBytes = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

export const createStablePartnerUuid = (email: string, companyName: string): string => {
  const identity = normalizeEmail(email) || normalizeKey(companyName);
  if (!identity) throw new PartnerApplicationSyncError("validation", "Identité partenaire introuvable.");
  const bytes = createHash("sha1")
    .update(namespaceBytes)
    .update(`klique-partner:${identity}`, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANONICAL_COLUMN_COUNT = 37;
const PARTNER_ID_COLUMN_INDEX = 25;
const SHIFTED_PARTNER_ID_COLUMN_INDEX = 26;
const additionalCanonicalFields: CanonicalField[] = [
  "instagram",
  "facebook",
  "description",
  "proposedBenefitType",
  "proposedBenefitDetails",
  "collaboration",
  "communicationConsent",
  "logoUrl",
  "sourceRow",
  "syncedAt",
];

const resolveCanonicalIndexes = (headers: string[]): Record<CanonicalField, number> =>
  Object.fromEntries(
    (Object.keys(canonicalHeaders) as CanonicalField[]).map((field) => [
      field,
      resolveHeader(headers, canonicalHeaders[field].aliases),
    ]),
  ) as Record<CanonicalField, number>;

const ensureCanonicalHeaders = async (
  snapshot: Awaited<ReturnType<PartnerApplicationSyncRepository["readCanonicalSheet"]>>,
  repository: PartnerApplicationSyncRepository,
): Promise<string[]> => {
  const headers = [...snapshot.headers];
  const canonicalTailHeaders = [
    canonicalHeaders.partnerId.name,
    ...additionalCanonicalFields.map((field) => canonicalHeaders[field].name),
    "",
  ];
  const currentTailHeaders = canonicalTailHeaders.map((_, offset) => headers[PARTNER_ID_COLUMN_INDEX + offset] ?? "");
  const hasCanonicalLayout = currentTailHeaders.every(
    (header, index) => normalizeKey(header) === normalizeKey(canonicalTailHeaders[index]),
  );
  if (!hasCanonicalLayout) {
    await repository.updateCanonicalHeaders(snapshot.headerRowNumber, PARTNER_ID_COLUMN_INDEX, canonicalTailHeaders);
  }
  while (headers.length < PARTNER_ID_COLUMN_INDEX) headers.push("");
  headers.splice(PARTNER_ID_COLUMN_INDEX, canonicalTailHeaders.length, ...canonicalTailHeaders);
  return headers;
};

const repairShiftedPartnerIds = async (
  rows: SheetRow[],
  repository: PartnerApplicationSyncRepository,
): Promise<void> => {
  for (const row of rows) {
    const canonicalPartnerId = normalizeText(row.values[PARTNER_ID_COLUMN_INDEX]);
    const shiftedPartnerId = normalizeText(row.values[SHIFTED_PARTNER_ID_COLUMN_INDEX]);
    if (canonicalPartnerId || !UUID_PATTERN.test(shiftedPartnerId)) continue;
    await repository.repairCanonicalPartnerId(row.rowNumber, shiftedPartnerId);
    row.values[PARTNER_ID_COLUMN_INDEX] = shiftedPartnerId;
    row.values[SHIFTED_PARTNER_ID_COLUMN_INDEX] = "";
  }
};

const selectCanonicalMatch = (
  rows: SheetRow[],
  indexes: Record<CanonicalField, number>,
  application: FormApplication,
): SheetRow | null => {
  const emailKey = normalizeEmail(application.email);
  const nameKey = normalizeKey(application.name);
  const emailMatches = emailKey
    ? rows.filter((row) => normalizeEmail(row.values[indexes.email]) === emailKey)
    : [];
  const nameMatches = nameKey
    ? rows.filter((row) => normalizeKey(row.values[indexes.name]) === nameKey)
    : [];
  const candidates = new Map<number, SheetRow>();
  for (const row of [...emailMatches, ...nameMatches]) candidates.set(row.rowNumber, row);
  if (emailMatches.length > 1 || (emailMatches.length === 0 && nameMatches.length > 1) || candidates.size > 1) {
    throw new PartnerApplicationSyncError("conflict", "Plusieurs fiches canoniques correspondent à cette réponse.");
  }
  return emailMatches[0] ?? nameMatches[0] ?? null;
};

const valuesFromApplication = (
  application: FormApplication,
  partnerId: string,
  now: Date,
): Record<CanonicalField, string> => ({
  name: application.name,
  relationType: "Partenaire",
  category: "Non renseigne",
  contact: application.contact,
  email: application.email,
  phone: application.phone,
  website: application.website,
  status: "Prospect",
  firstContactDate: application.timestamp,
  partnerId,
  instagram: application.instagram,
  facebook: application.facebook,
  description: application.description,
  proposedBenefitType: application.proposedBenefitType,
  proposedBenefitDetails: application.proposedBenefitDetails,
  collaboration: application.collaboration,
  communicationConsent: application.communicationConsent,
  logoUrl: application.logoUrl,
  sourceRow: String(application.rowNumber),
  syncedAt: now.toISOString(),
});

const getGoogleAuth = () => {
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawCredentials) {
    const credentials = JSON.parse(rawCredentials) as { client_email?: string; private_key?: string };
    if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!keyFile) throw new Error("Authentification Google Sheets non configurée.");
  return new google.auth.GoogleAuth({ keyFile, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
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

const createRepository = (): PartnerApplicationSyncRepository => {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID manquant.");
  const sheets = google.sheets({ version: "v4", auth: getGoogleAuth() });
  return {
    async readFormRow(rowNumber) {
      const [headerResponse, rowResponse] = await Promise.all([
        sheets.spreadsheets.values.get({ spreadsheetId, range: "'Forms_Partenaires_Responses'!A1:ZZ1" }),
        sheets.spreadsheets.values.get({ spreadsheetId, range: `'Forms_Partenaires_Responses'!A${rowNumber}:ZZ${rowNumber}` }),
      ]);
      const values = (rowResponse.data.values?.[0] ?? []).map((value) => String(value ?? ""));
      if (values.every((value) => !value.trim())) return null;
      return {
        headers: (headerResponse.data.values?.[0] ?? []).map((value) => String(value ?? "")),
        values,
      };
    },
    async readCanonicalSheet() {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: "'06_Partenaires'!A1:ZZ500" });
      const allRows = (response.data.values ?? []).map((row) => row.map((value) => String(value ?? "")));
      const headerIndex = allRows.findIndex((row) => row.some((value) => normalizeKey(value) === "nom")
        && row.some((value) => normalizeKey(value) === "statut"));
      if (headerIndex < 0) throw new PartnerApplicationSyncError("validation", "En-têtes de 06_Partenaires introuvables.");
      return {
        headerRowNumber: headerIndex + 1,
        headers: allRows[headerIndex],
        rows: allRows.slice(headerIndex + 1)
          .map((values, index) => ({ rowNumber: headerIndex + index + 2, values }))
          .filter((row) => row.values.some((value) => value.trim())),
      };
    },
    async readCanonicalSheetProperties() {
      const response = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets(properties(sheetId,title,gridProperties(columnCount)))",
      });
      const properties = response.data.sheets?.find((sheet) => sheet.properties?.title === "06_Partenaires")?.properties;
      const sheetId = properties?.sheetId;
      const columnCount = properties?.gridProperties?.columnCount;
      return { sheetId, columnCount };
    },
    async appendCanonicalColumns(sheetId, columnCount) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            appendDimension: {
              sheetId,
              dimension: "COLUMNS",
              length: columnCount,
            },
          }],
        },
      });
    },
    async updateCanonicalHeaders(headerRowNumber, startColumn, headers) {
      const endColumn = startColumn + headers.length - 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'06_Partenaires'!${toColumnLetters(startColumn)}${headerRowNumber}:${toColumnLetters(endColumn)}${headerRowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headers] },
      });
    },
    async repairCanonicalPartnerId(rowNumber, partnerId) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'06_Partenaires'!Z${rowNumber}:AA${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[partnerId, ""]] },
      });
    },
    async updateCanonicalRow(rowNumber, values) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'06_Partenaires'!A${rowNumber}:${toColumnLetters(values.length - 1)}${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [values] },
      });
    },
    async appendCanonicalRow(values) {
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "'06_Partenaires'!A:ZZ",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [values] },
      });
      const updatedRange = response.data.updates?.updatedRange ?? "";
      const match = updatedRange.match(/(\d+)(?::[A-Z]+\d+)?$/i);
      const rowNumber = match ? Number(match[1]) : 0;
      if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("Ligne canonique créée introuvable.");
      return rowNumber;
    },
  };
};

const defaultDependencies = (): PartnerApplicationSyncDependencies => ({
  repository: createRepository(),
  now: () => new Date(),
});

export const syncPartnerApplicationRow = async (
  rowNumber: number,
  dependencies?: PartnerApplicationSyncDependencies,
): Promise<PartnerApplicationSyncResult> => {
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 1_000_000) {
    throw new PartnerApplicationSyncError("validation", "rowNumber est invalide.");
  }
  const resolvedDependencies = dependencies ?? defaultDependencies();
  const formRow = await resolvedDependencies.repository.readFormRow(rowNumber);
  if (!formRow) throw new PartnerApplicationSyncError("not_found", "Réponse partenaire introuvable.");
  const application = parseFormApplication(rowNumber, formRow.headers, formRow.values);
  const snapshot = await resolvedDependencies.repository.readCanonicalSheet();
  const sheetProperties = await resolvedDependencies.repository.readCanonicalSheetProperties();
  const { sheetId, columnCount } = sheetProperties;
  if (
    typeof sheetId !== "number"
    || !Number.isInteger(sheetId)
    || sheetId < 0
    || typeof columnCount !== "number"
    || !Number.isInteger(columnCount)
    || columnCount < 1
  ) {
    throw new PartnerApplicationSyncError(
      "validation",
      "Métadonnées de la feuille 06_Partenaires absentes ou invalides.",
    );
  }
  if (columnCount < CANONICAL_COLUMN_COUNT) {
    await resolvedDependencies.repository.appendCanonicalColumns(
      sheetId,
      CANONICAL_COLUMN_COUNT - columnCount,
    );
  }
  await repairShiftedPartnerIds(snapshot.rows, resolvedDependencies.repository);
  const headers = await ensureCanonicalHeaders(snapshot, resolvedDependencies.repository);
  const indexes = resolveCanonicalIndexes(headers);
  const existing = selectCanonicalMatch(snapshot.rows, indexes, application);
  const existingPartnerId = existing ? normalizeText(existing.values[indexes.partnerId]) : "";
  if (existingPartnerId && !UUID_PATTERN.test(existingPartnerId)) {
    throw new PartnerApplicationSyncError("conflict", "La fiche canonique contient un Partner ID invalide.");
  }
  const partnerId = existingPartnerId || createStablePartnerUuid(application.email, application.name);
  const incoming = valuesFromApplication(application, partnerId, resolvedDependencies.now());

  if (!existing) {
    const values = Array.from({ length: headers.length }, () => "");
    for (const field of Object.keys(incoming) as CanonicalField[]) values[indexes[field]] = incoming[field];
    const canonicalRow = await resolvedDependencies.repository.appendCanonicalRow(values);
    return { status: "created", sourceRow: rowNumber, canonicalRow, partnerId, partnerName: application.name };
  }

  const values = Array.from({ length: headers.length }, (_, index) => normalizeText(existing.values[index]));
  let changed = false;
  for (const field of Object.keys(incoming) as CanonicalField[]) {
    if (!values[indexes[field]] && incoming[field]) {
      values[indexes[field]] = incoming[field];
      changed = true;
    }
  }
  if (changed) await resolvedDependencies.repository.updateCanonicalRow(existing.rowNumber, values);
  return {
    status: changed ? "updated" : "unchanged",
    sourceRow: rowNumber,
    canonicalRow: existing.rowNumber,
    partnerId,
    partnerName: application.name,
  };
};