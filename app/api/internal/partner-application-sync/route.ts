import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getContentStorageServerConfig } from "@/lib/content-storage/config";
import {
  PartnerApplicationSyncError,
  syncPartnerApplicationRow,
  type PartnerApplicationSyncResult,
} from "@/lib/partners/application-sync-service";
import {
  createNotificationsForRecipients,
  findActiveAdminClerkUserIds,
} from "@/lib/notifications/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  sync: (rowNumber: number) => Promise<PartnerApplicationSyncResult>;
  findAdminIds: (workspaceId: string) => Promise<string[]>;
  notifyAdmins: typeof createNotificationsForRecipients;
  getWorkspaceId: () => string;
  getSecret: () => string;
  now: () => Date;
};

const defaultDependencies: HandlerDependencies = {
  sync: syncPartnerApplicationRow,
  findAdminIds: findActiveAdminClerkUserIds,
  notifyAdmins: createNotificationsForRecipients,
  getWorkspaceId: () => getContentStorageServerConfig().defaultWorkspaceId,
  getSecret: () => process.env.PARTNER_APPLICATION_SYNC_HMAC_SECRET?.trim() ?? "",
  now: () => new Date(),
};

const SIGNATURE_HEADER = "x-klique-signature";
const TIMESTAMP_HEADER = "x-klique-timestamp";
const MAX_CLOCK_SKEW_SECONDS = 300;

export const createPartnerApplicationSyncSignature = (
  rawBody: string,
  timestamp: string,
  secret: string,
): string => `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;

const hasValidSignature = (
  request: Request,
  rawBody: string,
  dependencies: HandlerDependencies,
): boolean => {
  const secret = dependencies.getSecret();
  if (secret.length < 32) throw new Error("PARTNER_APPLICATION_SYNC_HMAC_SECRET doit contenir au moins 32 caractères.");
  const timestamp = request.headers.get(TIMESTAMP_HEADER)?.trim() ?? "";
  const timestampSeconds = Number(timestamp);
  if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(timestampSeconds)) return false;
  const nowSeconds = Math.floor(dependencies.now().getTime() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  const supplied = request.headers.get(SIGNATURE_HEADER)?.trim() ?? "";
  const expected = createPartnerApplicationSyncSignature(rawBody, timestamp, secret);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
};

const parseRowNumber = (rawBody: string): number => {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new PartnerApplicationSyncError("validation", "Payload JSON invalide.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PartnerApplicationSyncError("validation", "Payload JSON invalide.");
  }
  const record = payload as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !("rowNumber" in record)) {
    throw new PartnerApplicationSyncError("validation", "Seul rowNumber est autorisé.");
  }
  if (!Number.isInteger(record.rowNumber) || Number(record.rowNumber) < 2 || Number(record.rowNumber) > 1_000_000) {
    throw new PartnerApplicationSyncError("validation", "rowNumber est invalide.");
  }
  return Number(record.rowNumber);
};

const errorResponse = (error: unknown): NextResponse => {
  if (error instanceof PartnerApplicationSyncError) {
    const status = error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : 400;
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status });
  }
  console.error(`[partner_application_sync] ${error instanceof Error ? error.message : String(error)}`);
  return NextResponse.json({ ok: false, error: "Synchronisation partenaire indisponible." }, { status: 500 });
};

export const createPartnerApplicationSyncHandler = (
  dependencies: HandlerDependencies = defaultDependencies,
) => async (request: Request): Promise<NextResponse> => {
  try {
    const rawBody = await request.text();
    if (!hasValidSignature(request, rawBody, dependencies)) {
      return NextResponse.json({ ok: false, error: "Signature invalide." }, { status: 401 });
    }
    const rowNumber = parseRowNumber(rawBody);
    const result = await dependencies.sync(rowNumber);
    const workspaceId = dependencies.getWorkspaceId().trim();
    if (!workspaceId) throw new Error("Workspace serveur manquant.");
    const recipientClerkUserIds = [
      ...new Set((await dependencies.findAdminIds(workspaceId)).map((id) => id.trim()).filter(Boolean)),
    ];
    if (recipientClerkUserIds.length > 0) {
      await dependencies.notifyAdmins({
        workspaceId,
        recipientClerkUserIds,
        type: "partner_application.synced",
        title: "Réponse partenaire synchronisée",
        body: result.partnerName,
        actionHref: "/crm/demandes?tab=partners",
        sourceType: "partner_application.sync",
        sourceId: String(rowNumber),
      });
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      canonicalRow: result.canonicalRow,
    });
  } catch (error) {
    return errorResponse(error);
  }
};

export const POST = createPartnerApplicationSyncHandler();