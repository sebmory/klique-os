import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  createNotificationsForRecipients,
  findActiveAdminClerkUserIds,
} from "@/lib/notifications/service";
import type {
  AthleteNewsArticlePrefill,
  AthleteNewsReport,
  AthleteNewsReportStatus,
} from "@/types/athlete-news-report";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES = new Set<AthleteNewsReportStatus>(["new", "preparing", "processed"]);
const MESSAGE_LIMIT = 600;

type AthleteIdentity = {
  workspaceId: string;
  clerkUserId: string;
  athleteId: string;
};

type AdminIdentity = {
  workspaceId: string;
  clerkUserId: string;
};

type PhotoInput = {
  url: string;
  pathname: string;
  contentType: string;
  sizeBytes: number;
} | null;

type ReportRow = {
  id: string;
  athlete_id: string;
  message: string;
  event_date: string | Date;
  external_url: string | null;
  photo_blob_pathname: string | null;
  status: AthleteNewsReportStatus;
  version: number | string;
  created_at: string | Date;
  updated_at: string | Date;
};

type PhotoRow = {
  photo_blob_pathname: string;
  photo_content_type: string;
};

export class AthleteNewsReportError extends Error {
  constructor(
    public readonly code: "forbidden" | "validation" | "not_found" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "AthleteNewsReportError";
  }
}

const normalize = (value: unknown) => String(value ?? "").trim();

const normalizeDate = (value: string | Date, field: string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Date invalide pour ${field}.`);
  return date.toISOString();
};

const normalizeEventDate = (value: unknown): string => {
  const eventDate = normalize(value);
  const parsed = new Date(`${eventDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== eventDate
  ) {
    throw new AthleteNewsReportError("validation", "La date de l’événement est obligatoire.");
  }
  return eventDate;
};

const normalizeMessage = (value: unknown): string => {
  const message = normalize(value);
  if (!message) throw new AthleteNewsReportError("validation", "Le message est obligatoire.");
  if (message.length > MESSAGE_LIMIT) {
    throw new AthleteNewsReportError("validation", `Le message ne peut pas dépasser ${MESSAGE_LIMIT} caractères.`);
  }
  return message;
};

const normalizeExternalUrl = (value: unknown): string | null => {
  const raw = normalize(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new Error("protocol");
    return url.toString();
  } catch {
    throw new AthleteNewsReportError("validation", "Le lien doit être une adresse HTTPS valide.");
  }
};

const requireUuid = (value: unknown, label: string): string => {
  const id = normalize(value);
  if (!UUID_PATTERN.test(id)) throw new AthleteNewsReportError("validation", `${label} est invalide.`);
  return id;
};

const mapReport = (row: ReportRow): AthleteNewsReport => ({
  id: row.id,
  athleteId: row.athlete_id,
  message: row.message,
  eventDate: row.event_date instanceof Date
    ? row.event_date.toISOString().slice(0, 10)
    : String(row.event_date).slice(0, 10),
  externalUrl: row.external_url,
  photoHref: row.photo_blob_pathname ? `/api/athlete-news-reports/${row.id}/photo` : null,
  status: row.status,
  version: Number(row.version),
  createdAt: normalizeDate(row.created_at, "created_at"),
  updatedAt: normalizeDate(row.updated_at, "updated_at"),
});

export const requireAthleteNewsIdentity = async (request: Request): Promise<AthleteIdentity> => {
  const profile = await getCurrentUserAccessProfile(request);
  const access = profile?.userAccess;
  const identity = {
    workspaceId: normalize(access?.workspaceId),
    clerkUserId: normalize(profile?.clerkUser.id),
    athleteId: normalize(access?.athleteId),
  };
  if (
    !identity.workspaceId
    || !identity.clerkUserId
    || !identity.athleteId
    || access?.role !== "athlete"
    || access.status !== "active"
  ) {
    throw new AthleteNewsReportError("forbidden", "Un accès Athlète actif est requis.");
  }
  return identity;
};

export const requireAthleteNewsAdmin = async (request: Request): Promise<AdminIdentity> => {
  const profile = await getCurrentUserAccessProfile(request);
  const access = profile?.userAccess;
  const identity = {
    workspaceId: normalize(access?.workspaceId),
    clerkUserId: normalize(profile?.clerkUser.id),
  };
  if (!identity.workspaceId || !identity.clerkUserId || access?.role !== "admin" || access.status !== "active") {
    throw new AthleteNewsReportError("forbidden", "Un accès Admin actif est requis.");
  }
  return identity;
};

const selectColumns = `
  id, athlete_id, message, event_date::text AS event_date, external_url, photo_blob_pathname,
  status, version, created_at, updated_at
`;

export const AthleteNewsReportService = {
  async findByClientRequestId(clientRequestIdValue: unknown, identity: AthleteIdentity): Promise<AthleteNewsReport | null> {
    const clientRequestId = requireUuid(clientRequestIdValue, "clientRequestId");
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${selectColumns}
      FROM athlete_news_reports
      WHERE workspace_id = $1
        AND submitted_by_clerk_user_id = $2
        AND athlete_id = $3
        AND client_request_id = $4::uuid
      LIMIT 1
    `, [identity.workspaceId, identity.clerkUserId, identity.athleteId, clientRequestId]) as ReportRow[];
    return rows[0] ? mapReport(rows[0]) : null;
  },

  async create(input: {
    clientRequestId: unknown;
    message: unknown;
    eventDate: unknown;
    externalUrl: unknown;
    photo: PhotoInput;
  }, identity: AthleteIdentity): Promise<{ report: AthleteNewsReport; created: boolean }> {
    const clientRequestId = requireUuid(input.clientRequestId, "clientRequestId");
    const message = normalizeMessage(input.message);
    const eventDate = normalizeEventDate(input.eventDate);
    const externalUrl = normalizeExternalUrl(input.externalUrl);
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      INSERT INTO athlete_news_reports (
        id, client_request_id, workspace_id, athlete_id, submitted_by_clerk_user_id,
        message, event_date, external_url, photo_blob_url, photo_blob_pathname,
        photo_content_type, photo_size_bytes, status_updated_by_clerk_user_id
      ) VALUES (
        $1::uuid, $2::uuid, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12, $5
      )
      ON CONFLICT (workspace_id, submitted_by_clerk_user_id, client_request_id)
      DO NOTHING
      RETURNING ${selectColumns}
    `, [
      randomUUID(),
      clientRequestId,
      identity.workspaceId,
      identity.athleteId,
      identity.clerkUserId,
      message,
      eventDate,
      externalUrl,
      input.photo?.url ?? null,
      input.photo?.pathname ?? null,
      input.photo?.contentType ?? null,
      input.photo?.sizeBytes ?? null,
    ]) as ReportRow[];

    const report = rows[0]
      ? mapReport(rows[0])
      : await this.findByClientRequestId(clientRequestId, identity);
    if (!report) throw new Error("Le signalement n’a pas pu être enregistré.");
    return { report, created: Boolean(rows[0]) };
  },

  async notifyAdmins(report: AthleteNewsReport, identity: AthleteIdentity): Promise<void> {
    const adminIds = await findActiveAdminClerkUserIds(identity.workspaceId);
    if (adminIds.length > 0) {
      await createNotificationsForRecipients({
        workspaceId: identity.workspaceId,
        recipientClerkUserIds: adminIds,
        type: "athlete_news_report",
        title: "Nouvelle actualité Athlète",
        body: "Un signalement Athlète attend un examen éditorial.",
        actionHref: "/today",
        sourceType: "athlete_news_report",
        sourceId: report.id,
      });
    }
  },

  async listOwn(identity: AthleteIdentity): Promise<AthleteNewsReport[]> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${selectColumns}
      FROM athlete_news_reports
      WHERE workspace_id = $1
        AND submitted_by_clerk_user_id = $2
        AND athlete_id = $3
      ORDER BY created_at DESC
    `, [identity.workspaceId, identity.clerkUserId, identity.athleteId]) as ReportRow[];
    return rows.map(mapReport);
  },

  async listAdmin(identity: AdminIdentity): Promise<AthleteNewsReport[]> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${selectColumns}
      FROM athlete_news_reports
      WHERE workspace_id = $1
      ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'preparing' THEN 1 ELSE 2 END, created_at DESC
    `, [identity.workspaceId]) as ReportRow[];
    return rows.map(mapReport);
  },

  async getAdmin(reportIdValue: unknown, identity: AdminIdentity): Promise<AthleteNewsReport> {
    const reportId = requireUuid(reportIdValue, "reportId");
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${selectColumns}
      FROM athlete_news_reports
      WHERE workspace_id = $1 AND id = $2::uuid
      LIMIT 1
    `, [identity.workspaceId, reportId]) as ReportRow[];
    if (!rows[0]) throw new AthleteNewsReportError("not_found", "Signalement introuvable.");
    return mapReport(rows[0]);
  },

  async updateStatus(
    reportIdValue: unknown,
    statusValue: unknown,
    versionValue: unknown,
    identity: AdminIdentity,
  ): Promise<AthleteNewsReport> {
    const reportId = requireUuid(reportIdValue, "reportId");
    const status = normalize(statusValue) as AthleteNewsReportStatus;
    const version = Number(versionValue);
    if (!ALLOWED_STATUSES.has(status) || !Number.isInteger(version) || version < 1) {
      throw new AthleteNewsReportError("validation", "Statut ou version invalide.");
    }
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE athlete_news_reports
      SET status = $3,
          version = version + 1,
          status_updated_by_clerk_user_id = $4,
          status_updated_at = NOW(),
          updated_at = NOW()
      WHERE workspace_id = $1
        AND id = $2::uuid
        AND version = $5
      RETURNING ${selectColumns}
    `, [identity.workspaceId, reportId, status, identity.clerkUserId, version]) as ReportRow[];
    if (rows[0]) return mapReport(rows[0]);
    const existing = await this.getAdmin(reportId, identity);
    if (existing.version !== version) {
      throw new AthleteNewsReportError("conflict", "Le signalement a été modifié. Rechargez la liste.");
    }
    throw new AthleteNewsReportError("not_found", "Signalement introuvable.");
  },

  async buildArticlePrefill(reportIdValue: unknown, identity: AdminIdentity): Promise<AthleteNewsArticlePrefill> {
    const report = await this.getAdmin(reportIdValue, identity);
    return {
      reportId: report.id,
      athleteId: report.athleteId,
      message: report.message,
      eventDate: report.eventDate,
      externalUrl: report.externalUrl,
      photoHref: report.photoHref,
      provenance: "Déclaration directe de l’athlète — non vérifiée indépendamment.",
    };
  },
};

export const getAccessibleAthleteNewsPhoto = async (
  reportIdValue: unknown,
  request: Request,
): Promise<{ pathname: string; contentType: string }> => {
  const reportId = requireUuid(reportIdValue, "reportId");
  const profile = await getCurrentUserAccessProfile(request);
  const access = profile?.userAccess;
  const workspaceId = normalize(access?.workspaceId);
  const clerkUserId = normalize(profile?.clerkUser.id);
  if (!workspaceId || !clerkUserId || access?.status !== "active") {
    throw new AthleteNewsReportError("forbidden", "Accès refusé.");
  }

  const sql = createContentStorageClient();
  const rows = await sql.query(`
    SELECT photo_blob_pathname, photo_content_type
    FROM athlete_news_reports
    WHERE workspace_id = $1
      AND id = $2::uuid
      AND photo_blob_pathname IS NOT NULL
      AND (
        $3 = 'admin'
        OR (
          $3 = 'athlete'
          AND submitted_by_clerk_user_id = $4
          AND athlete_id = $5
        )
      )
    LIMIT 1
  `, [
    workspaceId,
    reportId,
    access.role,
    clerkUserId,
    access.athleteId ?? "",
  ]) as PhotoRow[];
  if (!rows[0]) throw new AthleteNewsReportError("not_found", "Photo introuvable.");
  return {
    pathname: rows[0].photo_blob_pathname,
    contentType: rows[0].photo_content_type,
  };
};

export const athleteNewsErrorStatus = (error: unknown): number => {
  if (!(error instanceof AthleteNewsReportError)) return 500;
  if (error.code === "forbidden") return 403;
  if (error.code === "not_found") return 404;
  if (error.code === "conflict") return 409;
  return 400;
};
