import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { CreativeApplicationAdminError } from "@/lib/creatives/admin-application-service";
import { CreativeProfileAdminError } from "@/lib/creatives/admin-profile-service";

export type CreativeAdminAccess = {
  clerkUserId?: string | null;
  role?: string;
  status?: string;
  workspaceId?: string | null;
} | null;

export type CreativeAdminContext = {
  clerkUserId: string;
  workspaceId: string;
};

export type GetCreativeAdminAccess = (
  request: Request,
) => Promise<CreativeAdminAccess>;

export const getDefaultCreativeAdminAccess: GetCreativeAdminAccess = async (request) => {
  const profile = await getCurrentUserAccessProfile(request);
  if (!profile) return null;
  return {
    clerkUserId: profile.clerkUser.id,
    role: profile.userAccess?.role,
    status: profile.userAccess?.status,
    workspaceId: profile.userAccess?.workspaceId,
  };
};

export const requireCreativeAdminContext = async (
  request: Request,
  getAccess: GetCreativeAdminAccess,
): Promise<{ context: CreativeAdminContext } | { response: NextResponse }> => {
  const access = await getAccess(request);
  const clerkUserId = access?.clerkUserId?.trim() ?? "";
  if (!clerkUserId) {
    return {
      response: NextResponse.json(
        { error: "Authentification requise." },
        { status: 401 },
      ),
    };
  }

  const workspaceId = access?.workspaceId?.trim() ?? "";
  if (access?.role !== "admin" || access.status !== "active" || !workspaceId) {
    return {
      response: NextResponse.json({ error: "Accès refusé." }, { status: 403 }),
    };
  }
  return { context: { clerkUserId, workspaceId } };
};

export const rejectQueryParameters = (request: Request): void => {
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    throw new CreativeApplicationAdminError("validation", "Requête invalide.");
  }
};

export const requireApplicationId = (value: unknown): string => {
  if (
    typeof value !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
  ) {
    throw new CreativeApplicationAdminError("validation", "Requête invalide.");
  }
  return value.trim().toLowerCase();
};

const readJsonBody = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new CreativeApplicationAdminError("validation", "Requête invalide.");
  }
  try {
    return await request.json();
  } catch {
    throw new CreativeApplicationAdminError("validation", "Requête invalide.");
  }
};

export const parseEmptyJsonBody = async (request: Request): Promise<void> => {
  const body = await readJsonBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) {
    throw new CreativeApplicationAdminError("validation", "Requête invalide.");
  }
};

export const parseRejectJsonBody = async (request: Request): Promise<string> => {
  const body = await readJsonBody(request);
  if (
    !body
    || typeof body !== "object"
    || Array.isArray(body)
    || Object.keys(body).length !== 1
    || !Object.hasOwn(body, "reason")
    || typeof (body as Record<string, unknown>).reason !== "string"
    || !(body as { reason: string }).reason.trim()
  ) {
    throw new CreativeApplicationAdminError("validation", "Requête invalide.");
  }
  return (body as { reason: string }).reason;
};

export const creativeAdminErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof CreativeProfileAdminError) {
    const status = error.code === "validation"
      ? 400
      : error.code === "not_found"
        ? 404
        : 500;
    const message = status === 400
      ? "Requête invalide."
      : status === 404
        ? "Fiche créative introuvable."
        : "Une erreur interne est survenue.";
    return NextResponse.json({ error: message, code: error.code }, { status });
  }
  if (error instanceof CreativeApplicationAdminError) {
    const status = error.code === "validation"
      ? 400
      : error.code === "not_found"
        ? 404
        : error.code === "conflict"
          ? 409
          : 500;
    const message = status === 400
      ? "Requête invalide."
      : status === 404
        ? "Candidature créative introuvable."
        : status === 409
          ? "État de candidature incohérent."
          : "Une erreur interne est survenue.";
    return NextResponse.json({ error: message, code: error.code }, { status });
  }
  return NextResponse.json(
    { error: "Une erreur interne est survenue." },
    { status: 500 },
  );
};
