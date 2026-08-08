import { google } from "googleapis";
import path from "path";
import type { Athlete, AthleteUpdate } from "@/types/athlete";
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

const GHOST_DATE_VALUES = new Set(["30.12.1899", "1899-12-30"]);

const cleanAthleteDateValue = (value: unknown): string => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (GHOST_DATE_VALUES.has(trimmed)) return "";
  return trimmed;
};

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

type FormEnrichment = {
  name: string;
  rawEmail: string;
  palmares: string;
  objective: string;
  longTerm: string;
  desiredAreas: string;
  heightWeight: string;
  birthDate: string;
  nationality: string;
  position: string;
  competitionPhoto: boolean;
  adhesionDate: string;
};

const formAdhesionColumns = (headers: string[]) => ({
  email:            findColumn(headers, ["email", "adresse e-mail", "adresse mail"], 1),
  name:             findColumn(headers, ["nom complet", "prénom et nom", "nom et prénom", "name", "nom"], -1),
  palmares:         findColumn(headers, ["palmares", "palmarès (si disponible)", "palmares (si disponible)"], -1),
  objective:        findColumn(headers, ["court terme"], -1),
  longTerm:         findColumn(headers, ["long terme"], -1),
  desiredAreas:     findColumn(headers, ["domaine", "klique développe", "klique developpe"], -1),
  heightWeight:     findColumn(headers, ["taille", "poids", "taille / poids"], -1),
  birthDate:        findColumn(headers, ["naissance", "date de naissance"], -1),
  nationality:      findColumn(headers, ["nationalite", "nationalité"], -1),
  position:         findColumn(headers, ["position", "specialite", "spécialité", "specialité"], -1),
  competitionPhoto: findColumn(headers, ["photo de competition", "photo de compétition", "photo disponible"], -1),
  adhesionDate:     findColumn(headers, ["horodateur", "timestamp", "date d'envoi"], 0),
});

async function buildFormAdhesionMap(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
): Promise<Map<string, FormEnrichment>> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Forms_Adhesion'!A1:Z500",
    });
    const rows = res.data.values ?? [];
    if (rows.length < 2) return new Map();
    const col = formAdhesionColumns(rows[0].map(String));
    const map = new Map<string, FormEnrichment>();
    for (const row of rows.slice(1)) {
      const email = normalize(String(row[col.email] ?? ""));
      if (!email) continue;
      const rawEmail = String(row[col.email] ?? "").trim();
      map.set(email, {
        name:             col.name             >= 0 ? String(row[col.name]             ?? "") : "",
        rawEmail,
        palmares:         col.palmares         >= 0 ? String(row[col.palmares]         ?? "") : "",
        objective:        col.objective        >= 0 ? String(row[col.objective]        ?? "") : "",
        longTerm:         col.longTerm         >= 0 ? String(row[col.longTerm]         ?? "") : "",
        desiredAreas:     col.desiredAreas     >= 0 ? String(row[col.desiredAreas]     ?? "") : "",
        heightWeight:     col.heightWeight     >= 0 ? String(row[col.heightWeight]     ?? "") : "",
        birthDate:        col.birthDate        >= 0 ? String(row[col.birthDate]        ?? "") : "",
        nationality:      col.nationality      >= 0 ? String(row[col.nationality]      ?? "") : "",
        position:         col.position         >= 0 ? String(row[col.position]         ?? "") : "",
        competitionPhoto: col.competitionPhoto >= 0 ? boolValue(row[col.competitionPhoto]) : false,
        adhesionDate:     col.adhesionDate     >= 0 ? String(row[col.adhesionDate]     ?? "") : "",
      });
    }
    return map;
   } catch (error) {
    console.error("Erreur lecture Form adhésion :", error);
    return new Map();
  }
}

const athleteColumns = (headers: string[]) => ({
  name: findColumn(headers, ["nom", "athlete"], 0),
  sport: findColumn(headers, ["sport"], 1),
  club: findColumn(headers, ["club"], 2),
  instagram: findColumn(headers, ["instagram"], 3),
  phone: findColumn(headers, ["telephone", "tel"], 4),
  email: findColumn(headers, ["email", "e-mail"], 5),
  status: findColumn(headers, ["statut"], 6),
  nextContact: findColumn(headers, ["prochain contact"], 7),
  notes: findColumn(headers, ["notes"], 8),
  palmares: findColumn(headers, ["palmarès", "palmares"], 9),
  objective: findColumn(headers, ["objectif court", "objectif actuel"], 10),
  longTerm: findColumn(headers, ["objectif long"], 11),
  desiredAreas: findColumn(headers, ["domaines souhaités", "domaines desires"], 12),
  lastContact: findColumn(headers, ["dernier contact"], 13),
  nextAction: findColumn(headers, ["prochaine action"], 14),
  followUpNotes: findColumn(headers, ["notes de suivi", "suivi"], 15),
  lastResponseMonthly: findColumn(headers, ["derniere réponse mensuelle", "derniere reponse mensuelle"], 16),
  lastResponseWeekly: findColumn(headers, ["derniere réponse hebdo", "derniere reponse hebdo"], 17),
  lastPublication: findColumn(headers, ["dernière publication", "derniere publication"], 18),
  titlesOfMonth: findColumn(headers, ["titres Athlète du mois", "titres athlete du mois"], 19),
  analysisItems: findColumn(headers, ["éléments à analyser", "elements a analyser"], 20),
  plannedContents: findColumn(headers, ["contenus planifiés", "contenus planifies"], 21),
  lastPost: findColumn(headers, ["dernier post"], 22),
  lastStory: findColumn(headers, ["dernière story", "derniere story"], 23),
  daysWithoutVisibility: findColumn(headers, ["jours sans visibilité", "jours sans visibilite"], 24),
  lastShoot: findColumn(headers, ["dernier shooting", "derniere seance"], 25),
  media: findColumn(headers, ["medias", "photos", "fichiers"], 26),
  premium: findColumn(headers, ["premium"], 27),
  coverage: findColumn(headers, ["couverture", "score media"], 28),
});

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

const parseServiceAccountCredentials = (): ServiceAccountCredentials | null => {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON invalide: JSON non parsable.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON invalide: objet attendu.");
  }

  const typed = parsed as Record<string, unknown>;
  const clientEmail = String(typed.client_email ?? "").trim();
  const privateKeyRaw = String(typed.private_key ?? "").trim();
  const projectId = String(typed.project_id ?? "").trim() || undefined;
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON invalide: client_email et private_key sont requis.");
  }

  return {
    client_email: clientEmail,
    private_key: privateKey,
    project_id: projectId,
  };
};

const getAuth = () => {
  const serviceAccount = parseServiceAccountCredentials();
  if (serviceAccount) {
    return new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error(
      "Configuration Google Sheets manquante: definir GOOGLE_SERVICE_ACCOUNT_JSON ou GOOGLE_APPLICATION_CREDENTIALS."
    );
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
  const spreadsheetId = getSpreadsheetId();

  const [response, formMap] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'02_Athlètes'!A3:AC200",
    }),
    buildFormAdhesionMap(sheets, spreadsheetId),
  ]);

  const rows = response.data.values ?? [];
  if (rows.length < 2) return [];
  const headers = rows[0].map(String);

  const column = athleteColumns(headers);

  const athletes = rows
    .slice(1)
    .map((row, index) => ({
      row,
      sheetRow: index + 4,
    }))
    .filter(({ row }) => {
      const name = String(row[column.name] ?? "").trim();
      const status = String(row[column.status] ?? "");
      return name && status !== "Refus\u00e9";
    })
    .map(({ row, sheetRow }) => {
      const name = String(row[column.name] ?? "").trim();
      const coverage =
        column.coverage >= 0 ? numberValue(row[column.coverage]) : 0;
      const athleteEmail = normalize(String(row[column.email] ?? ""));
      const form = formMap.get(athleteEmail);

      return {
        row: sheetRow,
        key: stableKey(name),
        name,
        initials: initials(name),
        sport: String(row[column.sport] ?? ""),
        club: String(row[column.club] ?? ""),
        status: String(row[column.status] ?? "Actif") || "Actif",
        instagram: String(row[column.instagram] ?? ""),
        phone: String(row[column.phone] ?? ""),
        email: String(row[column.email] ?? ""),
        nextContact: cleanAthleteDateValue(row[column.nextContact]),
        notes: String(row[column.notes] ?? ""),
        palmares: form?.palmares || String(row[column.palmares] ?? ""),
        objective: form?.objective ||
          (column.objective >= 0 ? String(row[column.objective] ?? "") : "À définir"),
        longTerm: form?.longTerm ||
          (column.longTerm >= 0 ? String(row[column.longTerm] ?? "") : "À définir"),
        desiredAreas: form?.desiredAreas || String(row[column.desiredAreas] ?? ""),
        lastContact: cleanAthleteDateValue(row[column.lastContact]),
        nextAction:
          column.nextAction >= 0
            ? String(row[column.nextAction] ?? "")
            : "À définir",
        followUpNotes: String(row[column.followUpNotes] ?? ""),
        lastResponseMonthly: String(row[column.lastResponseMonthly] ?? ""),
        lastResponseWeekly: String(row[column.lastResponseWeekly] ?? ""),
        lastPublication: cleanAthleteDateValue(row[column.lastPublication]),
        titlesOfMonth: String(row[column.titlesOfMonth] ?? ""),
        analysisItems: String(row[column.analysisItems] ?? ""),
        plannedContents: String(row[column.plannedContents] ?? ""),
        lastPost: cleanAthleteDateValue(row[column.lastPost]),
        lastStory: cleanAthleteDateValue(row[column.lastStory]),
        daysWithoutVisibility:
          column.daysWithoutVisibility >= 0
            ? numberValue(row[column.daysWithoutVisibility])
            : 0,
        lastShoot: cleanAthleteDateValue(row[column.lastShoot]),
        media: column.media >= 0 ? numberValue(row[column.media]) : 0,
        premium: column.premium >= 0 ? numberValue(row[column.premium]) : 0,
        coverage,
        tone: toneFromCoverage(coverage),
        heightWeight:     form?.heightWeight     ?? "",
        birthDate:        form?.birthDate        ?? "",
        nationality:      form?.nationality      ?? "",
        position:         form?.position         ?? "",
        competitionPhoto: form?.competitionPhoto ?? false,
        adhesionDate:     cleanAthleteDateValue(form?.adhesionDate),
      };
    });

  // Append form responses not yet matched to any athlete in 02_Athlètes
  const existingEmails = new Set(athletes.map((a) => normalize(a.email)));
  for (const [normalizedEmail, form] of formMap.entries()) {
    if (existingEmails.has(normalizedEmail)) continue;
    const name = form.name || form.rawEmail;
    athletes.push({
      row: 0,
      key: stableKey(name),
      name,
      initials: initials(name),
      sport: "",
      club: "",
      status: "\u00c0 valider",
      instagram: "",
      phone: "",
      email: form.rawEmail,
      nextContact: "",
      notes: "",
      palmares: form.palmares,
      objective: form.objective,
      longTerm: form.longTerm,
      desiredAreas: form.desiredAreas,
      lastContact: "",
      nextAction: "",
      followUpNotes: "",
      lastResponseMonthly: "",
      lastResponseWeekly: "",
      lastPublication: "",
      titlesOfMonth: "",
      analysisItems: "",
      plannedContents: "",
      lastPost: "",
      lastStory: "",
      daysWithoutVisibility: 0,
      lastShoot: "",
      media: 0,
      premium: 0,
      coverage: 0,
      tone: toneFromCoverage(0),
      heightWeight:     form.heightWeight,
      birthDate:        form.birthDate,
      nationality:      form.nationality,
      position:         form.position,
      competitionPhoto: form.competitionPhoto,
      adhesionDate:     cleanAthleteDateValue(form.adhesionDate),
    });
  }

  return athletes;
}

export async function rejectFormEntry(email: string): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const spreadsheetId = getSpreadsheetId();

  const sheetData = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'02_Athl\u00e8tes'!A3:AC200",
  });
  const rows = sheetData.data.values ?? [];
  if (rows.length < 1) throw new Error("Impossible de lire 02_Athl\u00e8tes.");
  const headers = rows[0].map(String);
  const column = athleteColumns(headers);

  const normalizedEmail = normalize(email);
  const isDuplicate = rows.slice(1).some(
    (row) => normalize(String(row[column.email] ?? "")) === normalizedEmail
  );
  if (isDuplicate) return;

  const newRow = Array.from({ length: 29 }, () => "");
  newRow[column.email]  = email;
  newRow[column.status] = "Refus\u00e9";

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'02_Athl\u00e8tes'!A:AC",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [newRow] },
  });
}

export async function addAthleteToGoogleSheets(athlete: Athlete): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const spreadsheetId = getSpreadsheetId();

  const sheetData = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'02_Athl\u00e8tes'!A3:AC200",
  });
  const rows = sheetData.data.values ?? [];
  if (rows.length < 1) throw new Error("Impossible de lire 02_Athl\u00e8tes.");
  const headers = rows[0].map(String);
  const column = athleteColumns(headers);

  const normalizedNew = normalize(athlete.email);
  const isDuplicate = rows.slice(1).some(
    (row) => normalize(String(row[column.email] ?? "")) === normalizedNew
  );
  if (isDuplicate) throw new Error("Cet e-mail est d\u00e9j\u00e0 enregistr\u00e9 dans 02_Athl\u00e8tes.");

  const newRow = Array.from({ length: 29 }, () => "");
  newRow[column.name]    = athlete.name;
  newRow[column.sport]   = athlete.sport;
  newRow[column.club]    = athlete.club;
  newRow[column.instagram] = athlete.instagram;
  newRow[column.phone]   = athlete.phone;
  newRow[column.email]   = athlete.email;
  newRow[column.status]  = "Actif";
  newRow[column.nextContact]  = athlete.nextContact;
  newRow[column.notes]        = athlete.notes;
  newRow[column.palmares]     = athlete.palmares;
  newRow[column.objective]    = athlete.objective;
  newRow[column.longTerm]     = athlete.longTerm;
  newRow[column.desiredAreas] = athlete.desiredAreas;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'02_Athl\u00e8tes'!A:AC",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [newRow] },
  });
}

export async function updateAthleteInGoogleSheets(
  update: AthleteUpdate
): Promise<void> {
  if (!update.row || update.row < 4) {
    throw new Error("Ligne Google Sheets invalide.");
  }

  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: "'02_Athlètes'!A3:AC3",
  });

  const headers = headerResponse.data.values?.[0]?.map(String) ?? [];
  if (!headers.length) {
    throw new Error("En-têtes Athlètes introuvables.");
  }

  const column = athleteColumns(headers);
  const currentResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'02_Athlètes'!A${update.row}:AC${update.row}`,
  });

  const current = currentResponse.data.values?.[0] ?? [];
  const next = Array.from({ length: 29 }, (_, index) => current[index] ?? "");

  if (update.name !== undefined) next[column.name] = update.name;
  if (update.sport !== undefined) next[column.sport] = update.sport;
  if (update.club !== undefined) next[column.club] = update.club;
  if (update.instagram !== undefined) next[column.instagram] = update.instagram;
  if (update.phone !== undefined) next[column.phone] = update.phone;
  if (update.email !== undefined) next[column.email] = update.email;
  if (update.status !== undefined) next[column.status] = update.status;
  if (update.nextContact !== undefined) next[column.nextContact] = update.nextContact;
  if (update.notes !== undefined) next[column.notes] = update.notes;
  if (update.palmares !== undefined) next[column.palmares] = update.palmares;
  if (update.objective !== undefined) next[column.objective] = update.objective;
  if (update.longTerm !== undefined) next[column.longTerm] = update.longTerm;
  if (update.desiredAreas !== undefined) next[column.desiredAreas] = update.desiredAreas;
  if (update.lastContact !== undefined) next[column.lastContact] = update.lastContact;
  if (update.nextAction !== undefined) next[column.nextAction] = update.nextAction;
  if (update.followUpNotes !== undefined) next[column.followUpNotes] = update.followUpNotes;
  if (update.lastResponseMonthly !== undefined) next[column.lastResponseMonthly] = update.lastResponseMonthly;
  if (update.lastResponseWeekly !== undefined) next[column.lastResponseWeekly] = update.lastResponseWeekly;
  if (update.lastPublication !== undefined) next[column.lastPublication] = update.lastPublication;
  if (update.titlesOfMonth !== undefined) next[column.titlesOfMonth] = update.titlesOfMonth;
  if (update.analysisItems !== undefined) next[column.analysisItems] = update.analysisItems;
  if (update.plannedContents !== undefined) next[column.plannedContents] = update.plannedContents;
  if (update.lastPost !== undefined) next[column.lastPost] = update.lastPost;
  if (update.lastStory !== undefined) next[column.lastStory] = update.lastStory;
  if (update.daysWithoutVisibility !== undefined)
    next[column.daysWithoutVisibility] = String(update.daysWithoutVisibility);
  if (update.lastShoot !== undefined) next[column.lastShoot] = update.lastShoot;
  if (update.media !== undefined) next[column.media] = String(update.media);
  if (update.premium !== undefined) next[column.premium] = String(update.premium);
  if (update.coverage !== undefined) next[column.coverage] = String(update.coverage);

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `'02_Athlètes'!A${update.row}:AC${update.row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [next] },
  });
}

export async function getShootingsFromGoogleSheets(): Promise<Shooting[]> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const spreadsheetId = getSpreadsheetId();
  const ranges = ["'GESTION DES SHOOTINGS'!A3:AG300", "'16_Shootings'!A3:AG300"];

  let rows: string[][] = [];
  for (const range of ranges) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      rows = (response.data.values ?? []) as string[][];
      if (rows.length >= 2) break;
    } catch {
      // Try next configured sheet alias.
    }
  }

  if (rows.length < 2) return [];

  return rows
    .slice(1)
    .map((row, index) => ({
      row: index + 4,
      date: String(row[0] ?? ""),
      athlete: String(row[1] ?? ""),
      sport: String(row[2] ?? ""),
      type: String(row[3] ?? ""),
      equipment: String(row[6] ?? ""),
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
      lightroomLink: String(row[18] ?? ""),
      driveLink: String(row[19] ?? ""),
      clientGalleryLink: String(row[20] ?? ""),
      instagramLink: String(row[21] ?? ""),
      shootingDone: boolValue(row[22]),
      backupDone: boolValue(row[23]),
      publishedInstagram: boolValue(row[24]),
      publishedFacebook: boolValue(row[25]),
      publishedLinkedIn: boolValue(row[26]),
      deliverableClub: boolValue(row[27]),
      deliverableAthlete: boolValue(row[28]),
      deliverableSponsor: boolValue(row[29]),
      deliverableMedia: boolValue(row[30]),
      deliverableAgency: boolValue(row[31]),
      deliverableOther: boolValue(row[32]),
    }))
    .filter((shooting) => shooting.athlete || shooting.date || shooting.type);
}

export async function addShootingToGoogleSheets(
  shooting: NewShooting
): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: "'16_Shootings'!A:AG",
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
        shooting.equipment ?? "",
        shooting.photographer,
        "Planifié",
        shooting.photos,
        shooting.videos,
        shooting.importDone ? "Oui" : "Non",
        shooting.sortDone ? "Oui" : "Non",
        shooting.retouchDone ? "Oui" : "Non",
        shooting.exportDone ? "Oui" : "Non",
        shooting.driveDone ? "Oui" : "Non",
        shooting.published ? "Oui" : "Non",
        shooting.notes,
        shooting.lightroomLink,
        shooting.driveLink,
        shooting.clientGalleryLink,
        shooting.instagramLink,
        shooting.shootingDone ? "Oui" : "Non",
        shooting.backupDone ? "Oui" : "Non",
        shooting.publishedInstagram ? "Oui" : "Non",
        shooting.publishedFacebook ? "Oui" : "Non",
        shooting.publishedLinkedIn ? "Oui" : "Non",
        shooting.deliverableClub ? "Oui" : "Non",
        shooting.deliverableAthlete ? "Oui" : "Non",
        shooting.deliverableSponsor ? "Oui" : "Non",
        shooting.deliverableMedia ? "Oui" : "Non",
        shooting.deliverableAgency ? "Oui" : "Non",
        shooting.deliverableOther ? "Oui" : "Non",
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
    range: `'16_Shootings'!A${row}:AG${row}`,
  });

  const current = currentResponse.data.values?.[0] ?? [];
  const next = Array.from({ length: 33 }, (_, index) => current[index] ?? "");

  if (update.date !== undefined) next[0] = update.date;
  if (update.athlete !== undefined) next[1] = update.athlete;
  if (update.sport !== undefined) next[2] = update.sport;
  if (update.type !== undefined) next[3] = update.type;
  if (update.equipment !== undefined) next[6] = update.equipment;
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
  if (update.lightroomLink !== undefined) next[18] = update.lightroomLink;
  if (update.driveLink !== undefined) next[19] = update.driveLink;
  if (update.clientGalleryLink !== undefined) next[20] = update.clientGalleryLink;
  if (update.instagramLink !== undefined) next[21] = update.instagramLink;
  if (update.shootingDone !== undefined) next[22] = update.shootingDone ? "Oui" : "Non";
  if (update.backupDone !== undefined) next[23] = update.backupDone ? "Oui" : "Non";
  if (update.publishedInstagram !== undefined) next[24] = update.publishedInstagram ? "Oui" : "Non";
  if (update.publishedFacebook !== undefined) next[25] = update.publishedFacebook ? "Oui" : "Non";
  if (update.publishedLinkedIn !== undefined) next[26] = update.publishedLinkedIn ? "Oui" : "Non";
  if (update.deliverableClub !== undefined) next[27] = update.deliverableClub ? "Oui" : "Non";
  if (update.deliverableAthlete !== undefined) next[28] = update.deliverableAthlete ? "Oui" : "Non";
  if (update.deliverableSponsor !== undefined) next[29] = update.deliverableSponsor ? "Oui" : "Non";
  if (update.deliverableMedia !== undefined) next[30] = update.deliverableMedia ? "Oui" : "Non";
  if (update.deliverableAgency !== undefined) next[31] = update.deliverableAgency ? "Oui" : "Non";
  if (update.deliverableOther !== undefined) next[32] = update.deliverableOther ? "Oui" : "Non";

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `'16_Shootings'!A${row}:AG${row}`,
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
  const normalizeHeader = (value: unknown) =>
    normalize(value)
      .replace(/[?]/g, "")
      .replace(/[()]/g, " ")
      .replace(/[\\/|]/g, " ")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const parseRows = (rows: string[][]): Partner[] => {
    if (rows.length < 4) return [];

    const headerRowIndex = rows.findIndex((row) => {
      const normalizedRow = row.map(normalizeHeader);
      return normalizedRow.some((cell) => cell === "nom" || cell.startsWith("nom "))
        && normalizedRow.some((cell) => cell.includes("contact principal") || cell.includes("statut") || cell.includes("categorie"));
    });

    if (headerRowIndex < 0) return [];

    const headers = (rows[headerRowIndex] ?? []).map((value) => String(value ?? ""));
    const normalizedHeaders = headers.map(normalizeHeader);

    const findPartnerColumn = (candidates: string[], fallback = -1): number => {
      const normalizedCandidates = candidates.map((item) => normalizeHeader(item));
      const index = normalizedHeaders.findIndex((header) =>
        normalizedCandidates.some((candidate) => header === candidate || header.includes(candidate))
      );
      return index >= 0 ? index : fallback;
    };

    const column = {
      id: findPartnerColumn(["id", "identifiant", "slug"], -1),
      name: findPartnerColumn(["nom", "nom partenaire"], 0),
      relationType: findPartnerColumn(["type de relation", "type"], -1),
      category: findPartnerColumn(["categorie"], -1),
      expert: findPartnerColumn(["expert klique", "expert"], -1),
      contact: findPartnerColumn(["contact principal", "contact"], -1),
      role: findPartnerColumn(["fonction", "role"], -1),
      email: findPartnerColumn(["e mail", "email"], -1),
      phone: findPartnerColumn(["telephone", "tel"], -1),
      siteInstagram: findPartnerColumn(["site instagram", "site", "instagram"], -1),
      website: findPartnerColumn(["site web", "site internet", "website"], -1),
      instagram: findPartnerColumn(["instagram"], -1),
      benefits: findPartnerColumn(["offre avantage membres", "offre", "avantage membres", "benefits"], -1),
      athletes: findPartnerColumn(["athletes concernes", "athletes"], -1),
      status: findPartnerColumn(["statut"], -1),
      firstContactDate: findPartnerColumn(["date premier contact", "premier contact"], -1),
      lastContact: findPartnerColumn(["dernier contact"], -1),
      nextFollowUp: findPartnerColumn(["prochaine relance", "relance"], -1),
      nextAction: findPartnerColumn(["prochaine action"], -1),
      estimatedValueChf: findPartnerColumn(["valeur estimee chf", "valeur estimee"], -1),
      contractSigned: findPartnerColumn(["contrat signe"], -1),
      collaborationStart: findPartnerColumn(["debut collaboration"], -1),
      collaborationEnd: findPartnerColumn(["fin collaboration"], -1),
      counterparts: findPartnerColumn(["contenus contreparties", "contreparties"], -1),
      notes: findPartnerColumn(["notes"], -1),
      strategicPriority: findPartnerColumn(["priorite strategique", "priorite"], -1),
      potential: findPartnerColumn(["potentiel"], -1),
      nextContactObjective: findPartnerColumn(["objectif du prochain contact", "objectif prochain contact"], -1),
    };

    const rowFromSheet = (sheetRow: unknown[], col: number) => {
      if (col < 0) return "";
      return String(sheetRow[col] ?? "").trim();
    };

    return rows
      .slice(headerRowIndex + 1)
      .map((sheetRow, index) => {
        const name = rowFromSheet(sheetRow, column.name);
        const relationType = rowFromSheet(sheetRow, column.relationType);
        const category = rowFromSheet(sheetRow, column.category);

        const combinedSiteInstagram = rowFromSheet(sheetRow, column.siteInstagram);
        const websiteRaw = rowFromSheet(sheetRow, column.website);
        const instagramRaw = rowFromSheet(sheetRow, column.instagram);

        const website = websiteRaw || (!combinedSiteInstagram.toLowerCase().includes("instagram") ? combinedSiteInstagram : "");
        const instagram = instagramRaw || (combinedSiteInstagram.toLowerCase().includes("instagram") ? combinedSiteInstagram : "");

        const explicitId = rowFromSheet(sheetRow, column.id);
        const resolvedId = explicitId || stableKey(name);

        const expertRaw = rowFromSheet(sheetRow, column.expert);
        const relationNormalized = normalize(relationType);
        const isExpert = expertRaw ? boolValue(expertRaw) : relationNormalized.includes("expert");

        return {
          row: headerRowIndex + 2 + index,
          id: resolvedId || `partner-${headerRowIndex + 2 + index}`,
          name,
          relationType,
          category: category || "Non renseigne",
          expertKlique: isExpert,
          contact: rowFromSheet(sheetRow, column.contact),
          contactRole: rowFromSheet(sheetRow, column.role),
          email: rowFromSheet(sheetRow, column.email),
          phone: rowFromSheet(sheetRow, column.phone),
          website,
          instagram,
          description: rowFromSheet(sheetRow, column.counterparts),
          benefits: rowFromSheet(sheetRow, column.benefits),
          firstContactDate: rowFromSheet(sheetRow, column.firstContactDate),
          lastContact: rowFromSheet(sheetRow, column.lastContact),
          nextFollowUp: rowFromSheet(sheetRow, column.nextFollowUp),
          nextAction: rowFromSheet(sheetRow, column.nextAction),
          estimatedValueChf: rowFromSheet(sheetRow, column.estimatedValueChf),
          contractSigned: rowFromSheet(sheetRow, column.contractSigned),
          collaborationStart: rowFromSheet(sheetRow, column.collaborationStart),
          collaborationEnd: rowFromSheet(sheetRow, column.collaborationEnd),
          counterparts: rowFromSheet(sheetRow, column.counterparts),
          notes: rowFromSheet(sheetRow, column.notes),
          status: (rowFromSheet(sheetRow, column.status) || "Actif") as Partner["status"],
          strategicPriority: rowFromSheet(sheetRow, column.strategicPriority),
          potential: rowFromSheet(sheetRow, column.potential),
          nextContactObjective: rowFromSheet(sheetRow, column.nextContactObjective),
          athletes: rowFromSheet(sheetRow, column.athletes),
        } satisfies Partner;
      })
      .filter((partner) => partner.name.trim().length > 0);
  };

  const sheetCandidates = ["20_Partenaires", "06_Partenaires", "10_Fiche Partenaire"];
  const diagnostics: string[] = [];

  for (const sheetName of sheetCandidates) {
    try {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: getSpreadsheetId(),
        range: `'${sheetName}'!A1:AZ300`,
      });
      const parsed = parseRows((result.data.values ?? []) as string[][]);
      diagnostics.push(`${sheetName}:${parsed.length}`);
      if (parsed.length > 0) return parsed;
    } catch {
      diagnostics.push(`${sheetName}:error`);
    }
  }

  console.warn(`[partners] Aucun partenaire trouve. Diagnostics: ${diagnostics.join(", ")}`);
  return [];
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
