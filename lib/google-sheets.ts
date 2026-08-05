import { google } from "googleapis";
import path from "path";
import type { Athlete } from "@/types/athlete";
import type { NewShooting, Shooting, ShootingUpdate } from "@/types/shooting";
import type { NewMediaLot, MediaLot } from "@/types/media";
import type { CalendarEvent, NewCalendarEvent } from "@/types/calendar";
import type { NewShootingPlanning, PlanningUpdate, ShootingPlanning } from "@/types/planning";
import type { NewShotListItem, ShotListItem, ShotListUpdate } from "@/types/shotlist";
import type { NewPartner, Partner, PartnerUpdate } from "@/types/partner";

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");


const stableKey = (value: string) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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
        key: stableKey(name),
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

  if (update.date !== undefined) next[0] = update.date;
  if (update.athlete !== undefined) next[1] = update.athlete;
  if (update.sport !== undefined) next[2] = update.sport;
  if (update.type !== undefined) next[3] = update.type;
  if (update.place !== undefined) next[4] = update.place;
  if (update.objective !== undefined) next[5] = update.objective;
  if (update.photographer !== undefined) next[7] = update.photographer;
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


export async function deleteShootingFromGoogleSheets(row: number): Promise<void> {
  if (!row || row < 4) {
    throw new Error("Ligne shooting invalide.");
  }

  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: getSpreadsheetId(),
    fields: "sheets.properties",
  });

  const sheet = metadata.data.sheets?.find(
    (item) => item.properties?.title === "16_Shootings"
  );
  const sheetId = sheet?.properties?.sheetId;

  if (sheetId === undefined) {
    throw new Error("Onglet 16_Shootings introuvable.");
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSpreadsheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: row - 1,
              endIndex: row,
            },
          },
        },
      ],
    },
  });
}

export async function getCalendarEventsFromGoogleSheets(): Promise<CalendarEvent[]> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: "'17_Calendrier'!A3:K300",
  });

  const rows = response.data.values ?? [];
  if (rows.length < 2) return [];

  return rows
    .slice(1)
    .map((row, index) => ({
      id: String(row[0] ?? `calendar-${index + 4}`),
      source: (String(row[1] ?? "task") || "task") as CalendarEvent["source"],
      title: String(row[2] ?? ""),
      athlete: String(row[3] ?? ""),
      date: String(row[4] ?? ""),
      time: String(row[5] ?? ""),
      place: String(row[6] ?? ""),
      status: String(row[7] ?? "Planifié"),
      priority: (String(row[8] ?? "Moyenne") || "Moyenne") as CalendarEvent["priority"],
      notes: String(row[9] ?? ""),
      shootingRow: numberValue(row[10]) || undefined,
    }))
    .filter((event) => event.title || event.date);
}

export async function addCalendarEventToGoogleSheets(
  event: NewCalendarEvent
): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const id = `evt-${Date.now()}`;

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: "'17_Calendrier'!A:K",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        id,
        event.source,
        event.title,
        event.athlete,
        event.date,
        event.time,
        event.place,
        event.status,
        event.priority,
        event.notes,
        event.shootingRow ?? "",
      ]],
    },
  });
}
export async function getPlanningFromGoogleSheets(): Promise<ShootingPlanning[]> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: "'18_Planning'!A3:AA300",
  });

  const rows = response.data.values ?? [];
  if (rows.length < 2) return [];

  return rows
    .slice(1)
    .map((row, index) => ({
      row: index + 4,
      id: String(row[0] ?? `plan-${index + 4}`),
      shootingRow: numberValue(row[1]) || undefined,
      athlete: String(row[2] ?? ""),
      sport: String(row[3] ?? ""),
      title: String(row[4] ?? ""),
      date: String(row[5] ?? ""),
      shootingTime: String(row[6] ?? ""),
      place: String(row[7] ?? ""),
      travelMinutes: numberValue(row[8]),
      setupMinutes: numberValue(row[9]),
      shootingMinutes: numberValue(row[10]),
      selectionMinutes: numberValue(row[11]),
      editingMinutes: numberValue(row[12]),
      exportMinutes: numberValue(row[13]),
      uploadMinutes: numberValue(row[14]),
      publicationTime: String(row[15] ?? ""),
      status: String(row[16] ?? "Planifié"),
      notes: String(row[17] ?? ""),
      departureDone: boolValue(row[18]),
      arrivalDone: boolValue(row[19]),
      setupDone: boolValue(row[20]),
      shootingDone: boolValue(row[21]),
      selectionDone: boolValue(row[22]),
      editingDone: boolValue(row[23]),
      exportDone: boolValue(row[24]),
      uploadDone: boolValue(row[25]),
      publicationDone: boolValue(row[26]),
    }))
    .filter((planning) => planning.athlete || planning.title || planning.date);
}

export async function addPlanningToGoogleSheets(
  planning: NewShootingPlanning
): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: "'18_Planning'!A:AA",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        `plan-${Date.now()}`,
        planning.shootingRow ?? "",
        planning.athlete,
        planning.sport,
        planning.title,
        planning.date,
        planning.shootingTime,
        planning.place,
        planning.travelMinutes,
        planning.setupMinutes,
        planning.shootingMinutes,
        planning.selectionMinutes,
        planning.editingMinutes,
        planning.exportMinutes,
        planning.uploadMinutes,
        planning.publicationTime,
        planning.status,
        planning.notes,
        planning.departureDone ? "Oui" : "Non",
        planning.arrivalDone ? "Oui" : "Non",
        planning.setupDone ? "Oui" : "Non",
        planning.shootingDone ? "Oui" : "Non",
        planning.selectionDone ? "Oui" : "Non",
        planning.editingDone ? "Oui" : "Non",
        planning.exportDone ? "Oui" : "Non",
        planning.uploadDone ? "Oui" : "Non",
        planning.publicationDone ? "Oui" : "Non",
      ]],
    },
  });
}

export async function updatePlanningInGoogleSheets(
  update: PlanningUpdate
): Promise<void> {
  if (!update.row || update.row < 4) {
    throw new Error("Ligne Planning invalide.");
  }

  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const row = update.row;

  const currentResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'18_Planning'!A${row}:AA${row}`,
  });

  const current = currentResponse.data.values?.[0] ?? [];
  const next = Array.from({ length: 27 }, (_, index) => current[index] ?? "");

  if (update.status !== undefined) next[16] = update.status;
  if (update.notes !== undefined) next[17] = update.notes;
  if (update.departureDone !== undefined) next[18] = update.departureDone ? "Oui" : "Non";
  if (update.arrivalDone !== undefined) next[19] = update.arrivalDone ? "Oui" : "Non";
  if (update.setupDone !== undefined) next[20] = update.setupDone ? "Oui" : "Non";
  if (update.shootingDone !== undefined) next[21] = update.shootingDone ? "Oui" : "Non";
  if (update.selectionDone !== undefined) next[22] = update.selectionDone ? "Oui" : "Non";
  if (update.editingDone !== undefined) next[23] = update.editingDone ? "Oui" : "Non";
  if (update.exportDone !== undefined) next[24] = update.exportDone ? "Oui" : "Non";
  if (update.uploadDone !== undefined) next[25] = update.uploadDone ? "Oui" : "Non";
  if (update.publicationDone !== undefined) next[26] = update.publicationDone ? "Oui" : "Non";

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `'18_Planning'!A${row}:AA${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [next] },
  });
}
export async function getShotListItemsFromGoogleSheets(): Promise<ShotListItem[]> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: "'19_ShotLists'!A3:L500",
  });

  const rows = response.data.values ?? [];
  if (rows.length < 2) return [];

  return rows
    .slice(1)
    .map((row, index) => ({
      row: index + 4,
      id: String(row[0] ?? `shot-${index + 4}`),
      shootingRow: numberValue(row[1]) || undefined,
      athlete: String(row[2] ?? ""),
      sport: String(row[3] ?? ""),
      shootingTitle: String(row[4] ?? ""),
      category: String(row[5] ?? "Autre"),
      title: String(row[6] ?? ""),
      priority: (String(row[7] ?? "Moyenne") || "Moyenne") as ShotListItem["priority"],
      done: boolValue(row[8]),
      notes: String(row[9] ?? ""),
      order: numberValue(row[10], index + 1),
    }))
    .filter((item) => item.title || item.athlete || item.shootingTitle);
}

export async function addShotListItemToGoogleSheets(
  item: NewShotListItem
): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: "'19_ShotLists'!A:L",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        `shot-${Date.now()}`,
        item.shootingRow ?? "",
        item.athlete,
        item.sport,
        item.shootingTitle,
        item.category,
        item.title,
        item.priority,
        item.done ? "Oui" : "Non",
        item.notes,
        item.order,
        "",
      ]],
    },
  });
}

export async function updateShotListItemInGoogleSheets(
  update: ShotListUpdate
): Promise<void> {
  if (!update.row || update.row < 4) throw new Error("Ligne Shot List invalide.");

  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const row = update.row;

  const currentResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'19_ShotLists'!A${row}:L${row}`,
  });

  const current = currentResponse.data.values?.[0] ?? [];
  const next = Array.from({ length: 12 }, (_, index) => current[index] ?? "");

  if (update.category !== undefined) next[5] = update.category;
  if (update.title !== undefined) next[6] = update.title;
  if (update.priority !== undefined) next[7] = update.priority;
  if (update.done !== undefined) next[8] = update.done ? "Oui" : "Non";
  if (update.notes !== undefined) next[9] = update.notes;
  if (update.order !== undefined) next[10] = update.order;

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `'19_ShotLists'!A${row}:L${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [next] },
  });
}
export async function getPartnersFromGoogleSheets(): Promise<Partner[]> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: "'20_Partenaires'!A3:N300",
  });

  const rows = response.data.values ?? [];
  if (rows.length < 2) return [];

  return rows
    .slice(1)
    .map((row, index) => ({
      row: index + 4,
      id: String(row[0] ?? `partner-${index + 4}`),
      name: String(row[1] ?? ""),
      category: String(row[2] ?? "Autre"),
      expertKlique: boolValue(row[3]),
      contact: String(row[4] ?? ""),
      email: String(row[5] ?? ""),
      phone: String(row[6] ?? ""),
      website: String(row[7] ?? ""),
      instagram: String(row[8] ?? ""),
      description: String(row[9] ?? ""),
      benefits: String(row[10] ?? ""),
      notes: String(row[11] ?? ""),
      status: (String(row[12] ?? "Actif") || "Actif") as Partner["status"],
      athletes: String(row[13] ?? ""),
    }))
    .filter((partner) => partner.name);
}

export async function addPartnerToGoogleSheets(
  partner: NewPartner
): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: "'20_Partenaires'!A:N",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        `partner-${Date.now()}`,
        partner.name,
        partner.category,
        partner.expertKlique ? "Oui" : "Non",
        partner.contact,
        partner.email,
        partner.phone,
        partner.website,
        partner.instagram,
        partner.description,
        partner.benefits,
        partner.notes,
        partner.status,
        partner.athletes,
      ]],
    },
  });
}

export async function updatePartnerInGoogleSheets(
  update: PartnerUpdate
): Promise<void> {
  if (!update.row || update.row < 4) {
    throw new Error("Ligne partenaire invalide.");
  }

  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const row = update.row;

  const currentResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'20_Partenaires'!A${row}:N${row}`,
  });

  const current = currentResponse.data.values?.[0] ?? [];
  const next = Array.from({ length: 14 }, (_, index) => current[index] ?? "");

  if (update.name !== undefined) next[1] = update.name;
  if (update.category !== undefined) next[2] = update.category;
  if (update.expertKlique !== undefined) next[3] = update.expertKlique ? "Oui" : "Non";
  if (update.contact !== undefined) next[4] = update.contact;
  if (update.email !== undefined) next[5] = update.email;
  if (update.phone !== undefined) next[6] = update.phone;
  if (update.website !== undefined) next[7] = update.website;
  if (update.instagram !== undefined) next[8] = update.instagram;
  if (update.description !== undefined) next[9] = update.description;
  if (update.benefits !== undefined) next[10] = update.benefits;
  if (update.notes !== undefined) next[11] = update.notes;
  if (update.status !== undefined) next[12] = update.status;
  if (update.athletes !== undefined) next[13] = update.athletes;

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `'20_Partenaires'!A${row}:N${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [next] },
  });
}

export async function deletePartnerFromGoogleSheets(
  row: number
): Promise<void> {
  if (!row || row < 4) {
    throw new Error("Ligne partenaire invalide.");
  }

  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: getSpreadsheetId(),
    fields: "sheets.properties",
  });

  const sheet = metadata.data.sheets?.find(
    (item) => item.properties?.title === "20_Partenaires"
  );

  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined) {
    throw new Error("Onglet 20_Partenaires introuvable.");
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSpreadsheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: row - 1,
              endIndex: row,
            },
          },
        },
      ],
    },
  });
}
