import { google } from "googleapis";
import path from "path";
import type { Athlete } from "@/types/athlete";
import type { NewShooting, Shooting, ShootingUpdate } from "@/types/shooting";
import type { NewMediaLot, MediaLot } from "@/types/media";

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const boolValue = (value: unknown) =>
  ["oui", "yes", "true", "1", "x", "✓"].includes(normalize(value));

const toneFromCoverage = (coverage: number): Athlete["tone"] => {
  if (coverage >= 75) return "solid";
  if (coverage >= 55) return "correct";
  if (coverage >= 35) return "fragile";
  return "critical";
};

const findColumn = (
  headers: string[],
  candidates: string[],
  fallback: number
) => {
  const normalizedHeaders = headers.map(normalize);
  const index = normalizedHeaders.findIndex((header) =>
    candidates.some((candidate) => header.includes(normalize(candidate)))
  );
  return index >= 0 ? index : fallback;
};

const getAuth = () => {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS manquant.");
  }

  const absoluteCredentialsPath = path.resolve(
    process.cwd(),
    credentialsPath.replace(/^\.\//, "")
  );

  return new google.auth.GoogleAuth({
    keyFile: absoluteCredentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
};

const getSpreadsheetId = () => {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID manquant.");
  return spreadsheetId;
};

export async function getAthletesFromGoogleSheets(): Promise<Athlete[]> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: "'02_Athlètes'!A3:Q200",
  });

  const rows = response.data.values ?? [];
  if (rows.length < 2) return [];
  const headers = rows[0].map(String);

  const column = {
    name: findColumn(headers, ["nom", "athlete"], 0),
    sport: findColumn(headers, ["sport"], 1),
    club: findColumn(headers, ["club"], 2),
    instagram: findColumn(headers, ["instagram"], 3),
    phone: findColumn(headers, ["telephone", "tel"], 4),
    email: findColumn(headers, ["email", "e-mail"], 5),
    status: findColumn(headers, ["statut"], 6),
    lastShoot: findColumn(headers, ["dernier shooting", "derniere seance"], 13),
    media: findColumn(headers, ["medias", "photos", "fichiers"], -1),
    premium: findColumn(headers, ["premium"], -1),
    coverage: findColumn(headers, ["couverture", "score media"], -1),
    nextAction: findColumn(headers, ["prochaine action"], -1),
    objective: findColumn(headers, ["objectif court", "objectif actuel"], -1),
    longTerm: findColumn(headers, ["objectif long"], -1),
  };

  return rows
    .slice(1)
    .filter((row) => String(row[column.name] ?? "").trim())
    .map((row) => {
      const name = String(row[column.name] ?? "").trim();
      const coverage =
        column.coverage >= 0 ? numberValue(row[column.coverage]) : 0;

      return {
        name,
        initials: initials(name),
        sport: String(row[column.sport] ?? ""),
        club: String(row[column.club] ?? ""),
        status: String(row[column.status] ?? "Actif") || "Actif",
        lastShoot: String(row[column.lastShoot] ?? "").trim() || "Jamais",
        media: column.media >= 0 ? numberValue(row[column.media]) : 0,
        premium: column.premium >= 0 ? numberValue(row[column.premium]) : 0,
        coverage,
        tone: toneFromCoverage(coverage),
        instagram: String(row[column.instagram] ?? ""),
        email: String(row[column.email] ?? ""),
        phone: String(row[column.phone] ?? ""),
        nextAction:
          column.nextAction >= 0
            ? String(row[column.nextAction] ?? "")
            : "À définir",
        objective:
          column.objective >= 0
            ? String(row[column.objective] ?? "")
            : "À définir",
        longTerm:
          column.longTerm >= 0
            ? String(row[column.longTerm] ?? "")
            : "À définir",
      };
    });
}

export async function getShootingsFromGoogleSheets(): Promise<Shooting[]> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: "'16_Shootings'!A3:R300",
  });

  const rows = response.data.values ?? [];
  if (rows.length < 2) return [];

  return rows
    .slice(1)
    .map((row, index) => ({
      row: index + 4,
      date: String(row[0] ?? ""),
      athlete: String(row[1] ?? ""),
      sport: String(row[2] ?? ""),
      type: String(row[3] ?? ""),
      place: String(row[4] ?? ""),
      objective: String(row[5] ?? ""),
      photographer: String(row[7] ?? ""),
      status: String(row[8] ?? "Planifié") || "Planifié",
      photos: numberValue(row[9]),
      videos: numberValue(row[10]),
      importDone: boolValue(row[11]),
      sortDone: boolValue(row[12]),
      retouchDone: boolValue(row[13]),
      exportDone: boolValue(row[14]),
      driveDone: boolValue(row[15]),
      published: boolValue(row[16]),
      notes: String(row[17] ?? ""),
    }))
    .filter((shooting) => shooting.athlete || shooting.date || shooting.type);
}

export async function addShootingToGoogleSheets(
  shooting: NewShooting
): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: "'16_Shootings'!A:R",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        shooting.date,
        shooting.athlete,
        shooting.sport,
        shooting.type,
        shooting.place,
        shooting.objective,
        "",
        shooting.photographer,
        "Planifié",
        0,
        0,
        "Non",
        "Non",
        "Non",
        "Non",
        "Non",
        "Non",
        "",
      ]],
    },
  });
}
export async function getMediaFromGoogleSheets(): Promise<MediaLot[]> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: "'13_Banque Médias'!A3:W300",
  });

  const rows = response.data.values ?? [];
  if (rows.length < 2) return [];

  return rows
    .slice(1)
    .map((row, index) => {
      const totalFiles = numberValue(row[6]);
      const filesUsed = numberValue(row[11]);
      const premiumTotal = numberValue(row[10]);
      const premiumUsed = numberValue(row[13]);

      return {
        row: index + 4,
        date: String(row[0] ?? ""),
        athlete: String(row[1] ?? ""),
        sport: String(row[2] ?? ""),
        mediaType: String(row[3] ?? ""),
        event: String(row[4] ?? ""),
        place: String(row[5] ?? ""),
        totalFiles,
        vertical: numberValue(row[7]),
        horizontal: numberValue(row[8]),
        square: numberValue(row[9]),
        premiumTotal,
        filesUsed,
        filesRemaining:
          row[12] !== undefined && row[12] !== ""
            ? numberValue(row[12])
            : Math.max(0, totalFiles - filesUsed),
        premiumUsed,
        premiumRemaining:
          row[14] !== undefined && row[14] !== ""
            ? numberValue(row[14])
            : Math.max(0, premiumTotal - premiumUsed),
        favorites: numberValue(row[15]),
        videos: numberValue(row[16]),
        source: String(row[17] ?? ""),
        driveLink: String(row[18] ?? ""),
        lastUse: String(row[19] ?? ""),
        associatedContent: String(row[20] ?? ""),
        rights: String(row[21] ?? ""),
        notes: String(row[22] ?? ""),
      };
    })
    .filter((lot) => lot.athlete || lot.event || lot.totalFiles > 0);
}

export async function addMediaToGoogleSheets(
  media: NewMediaLot
): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: "'13_Banque Médias'!A:W",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        media.date,
        media.athlete,
        media.sport,
        media.mediaType,
        media.event,
        media.place,
        media.totalFiles,
        media.vertical,
        media.horizontal,
        media.square,
        media.premiumTotal,
        media.filesUsed,
        Math.max(0, media.totalFiles - media.filesUsed),
        media.premiumUsed,
        Math.max(0, media.premiumTotal - media.premiumUsed),
        media.favorites,
        media.videos,
        media.source,
        media.driveLink,
        media.lastUse,
        media.associatedContent,
        media.rights,
        media.notes,
      ]],
    },
  });
}
export async function updateShootingInGoogleSheets(
  update: ShootingUpdate
): Promise<void> {
  if (!update.row || update.row < 4) {
    throw new Error("Ligne Google Sheets invalide.");
  }

  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const row = update.row;

  const currentResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'16_Shootings'!A${row}:R${row}`,
  });

  const current = currentResponse.data.values?.[0] ?? [];
  const next = Array.from({ length: 18 }, (_, index) => current[index] ?? "");

  if (update.status !== undefined) next[8] = update.status;
  if (update.photos !== undefined) next[9] = update.photos;
  if (update.videos !== undefined) next[10] = update.videos;
  if (update.importDone !== undefined) next[11] = update.importDone ? "Oui" : "Non";
  if (update.sortDone !== undefined) next[12] = update.sortDone ? "Oui" : "Non";
  if (update.retouchDone !== undefined) next[13] = update.retouchDone ? "Oui" : "Non";
  if (update.exportDone !== undefined) next[14] = update.exportDone ? "Oui" : "Non";
  if (update.driveDone !== undefined) next[15] = update.driveDone ? "Oui" : "Non";
  if (update.published !== undefined) next[16] = update.published ? "Oui" : "Non";
  if (update.notes !== undefined) next[17] = update.notes;

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `'16_Shootings'!A${row}:R${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [next] },
  });
}
