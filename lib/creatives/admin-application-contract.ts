import type { CreativeApplication } from "@/lib/creatives/applications-sheet";

export const creativeApplicationAdminErrorCodes = [
  "INVALID_PAYLOAD",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "APPLICATION_NOT_FOUND",
  "VERSION_CONFLICT",
  "MISSING_REQUIRED_FIELD",
  "ALREADY_PROCESSED",
  "INTERNAL_ERROR",
] as const;

export type CreativeApplicationAdminErrorCode =
  typeof creativeApplicationAdminErrorCodes[number];

export type CreativeApplicationAdminErrorResponse = {
  error: string;
  code: CreativeApplicationAdminErrorCode;
  field?: string;
};

export type CreativeApplicationModerationSnapshot = Pick<
  CreativeApplication,
  "applicationId"
  | "moderationStatus"
  | "creativeId"
  | "moderatedAt"
  | "moderatedBy"
  | "moderationNotes"
  | "version"
>;

export type CreativeApplicationApproveResponse = {
  application: CreativeApplicationModerationSnapshot;
  alreadyApproved: boolean;
  sheetSynchronized: boolean;
};

export type CreativeApplicationRejectResponse = {
  application: CreativeApplicationModerationSnapshot;
  alreadyRejected: boolean;
};

export type CreativeApplicationApproveBody = {
  version: string;
};

export type CreativeApplicationRejectBody = {
  version: string;
  reason: string;
};

const isStrictObject = (
  value: unknown,
  keys: string[],
): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
};

const isVersion = (value: unknown): value is string =>
  typeof value === "string" && /^v1:[0-9a-f]{64}$/.test(value);

export const parseCreativeApplicationApproveBody = (
  value: unknown,
): CreativeApplicationApproveBody | null => {
  if (!isStrictObject(value, ["version"]) || !isVersion(value.version)) return null;
  return { version: value.version };
};

export const parseCreativeApplicationRejectBody = (
  value: unknown,
): CreativeApplicationRejectBody | null => {
  if (
    !isStrictObject(value, ["version", "reason"])
    || !isVersion(value.version)
    || typeof value.reason !== "string"
    || !value.reason.trim()
  ) {
    return null;
  }
  return { version: value.version, reason: value.reason };
};

const actionUrl = (
  applicationId: string,
  action: "approve" | "reject",
): string =>
  `/api/admin/creatives/applications/${encodeURIComponent(applicationId)}/${action}`;

export const createApproveCreativeApplicationRequest = (
  application: Pick<CreativeApplication, "applicationId" | "version">,
): { url: string; init: RequestInit } => ({
  url: actionUrl(application.applicationId, "approve"),
  init: {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: application.version } satisfies CreativeApplicationApproveBody),
  },
});

export const createRejectCreativeApplicationRequest = (
  application: Pick<CreativeApplication, "applicationId" | "version">,
  reason: string,
): { url: string; init: RequestInit } => ({
  url: actionUrl(application.applicationId, "reject"),
  init: {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      version: application.version,
      reason,
    } satisfies CreativeApplicationRejectBody),
  },
});

export const isCreativeApplicationAdminErrorResponse = (
  value: unknown,
): value is CreativeApplicationAdminErrorResponse => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.error === "string"
    && typeof record.code === "string"
    && creativeApplicationAdminErrorCodes.includes(
      record.code as CreativeApplicationAdminErrorCode,
    )
    && (record.field === undefined || typeof record.field === "string");
};

export const userMessageForCreativeApplicationResponse = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return [401, 403, 404].includes(response.status)
      ? "Votre session Admin a expiré. Reconnectez-vous."
      : fallback;
  }
  const payload = await response.json().catch(() => null);
  return isCreativeApplicationAdminErrorResponse(payload)
    ? payload.error
    : fallback;
};
