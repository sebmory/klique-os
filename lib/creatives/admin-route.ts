import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { CreativeApplicationAdminError } from "@/lib/creatives/admin-application-service";
import {
  parseCreativeApplicationApproveBody,
  parseCreativeApplicationRejectBody,
  type CreativeApplicationAdminErrorCode,
  type CreativeApplicationApproveBody,
  type CreativeApplicationRejectBody,
} from "@/lib/creatives/admin-application-contract";
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

export const getDefaultCreativeAdminAccess: GetCreativeAdminAccess = async () => {
  const { userId } = await auth();
  if (!userId) return null;

  const sql = createContentStorageClient();
  const rows = await sql`
    SELECT role, status, workspace_id
    FROM user_access
    WHERE clerk_user_id = ${userId}
    LIMIT 1
  `;

  const row = rows[0] as { role?: string | null; status?: string | null; workspace_id?: string | null } | undefined;

  return {
    clerkUserId: userId,
    role: row?.role ?? undefined,
    status: row?.status ?? undefined,
    workspaceId: row?.workspace_id ?? null,
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
        {
          error: "Votre session Admin a expiré. Reconnectez-vous.",
          code: "UNAUTHENTICATED" satisfies CreativeApplicationAdminErrorCode,
        },
        { status: 401 },
      ),
    };
  }

  const workspaceId = access?.workspaceId?.trim() ?? "";
  if (access?.role !== "admin" || access.status !== "active" || !workspaceId) {
    return {
      response: NextResponse.json({
        error: "Cette action est réservée aux Administrateurs.",
        code: "FORBIDDEN" satisfies CreativeApplicationAdminErrorCode,
      }, { status: 403 }),
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

export const parseApproveJsonBody = async (
  request: Request,
): Promise<CreativeApplicationApproveBody> => {
  const body = await readJsonBody(request);
  const parsed = parseCreativeApplicationApproveBody(body);
  if (!parsed) {
    throw new CreativeApplicationAdminError("validation", "Requête invalide.");
  }
  return parsed;
};

export const parseRejectJsonBody = async (
  request: Request,
): Promise<CreativeApplicationRejectBody> => {
  const body = await readJsonBody(request);
  const parsed = parseCreativeApplicationRejectBody(body);
  if (!parsed) {
    throw new CreativeApplicationAdminError("validation", "Requête invalide.");
  }
  return parsed;
};

export const creativeAdminErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof CreativeProfileAdminError) {
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
        ? "Fiche créative introuvable."
        : status === 409
          ? "Plusieurs fiches créatives correspondent à cette identité."
        : "Une erreur interne est survenue.";
    return NextResponse.json({ error: message, code: error.code }, { status });
  }
  if (error instanceof CreativeApplicationAdminError) {
    const response = error.code === "validation"
      ? {
          status: 400,
          code: "INVALID_PAYLOAD" as const,
          message: "Le format de la requête est invalide.",
        }
      : error.code === "missing_required_field"
        ? {
            status: 400,
            code: "MISSING_REQUIRED_FIELD" as const,
            message: `Une information obligatoire manque ou doit être corrigée : ${error.field ?? "candidature"}.`,
          }
        : error.code === "not_found"
          ? {
              status: 404,
              code: "APPLICATION_NOT_FOUND" as const,
              message: "Cette candidature n’existe plus.",
            }
          : error.code === "version_conflict"
            ? {
                status: 409,
                code: "VERSION_CONFLICT" as const,
                message: "La candidature a été modifiée. Actualisez avant de réessayer.",
              }
            : error.code === "conflict"
              ? {
                  status: 409,
                  code: "ALREADY_PROCESSED" as const,
                  message: "Cette candidature a déjà été traitée.",
                }
              : {
                  status: 500,
                  code: "INTERNAL_ERROR" as const,
                  message: "L’approbation n’a pas pu être enregistrée. Réessayez.",
                };
    if (response.status === 500) {
      console.error("Creative application moderation failed", {
        code: error.code,
        name: error.name,
      });
    }
    return NextResponse.json({
      error: response.message,
      code: response.code,
      ...(error.field ? { field: error.field } : {}),
    }, { status: response.status });
  }
  console.error("Creative application moderation failed", {
    code: "unexpected",
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return NextResponse.json(
    {
      error: "L’approbation n’a pas pu être enregistrée. Réessayez.",
      code: "INTERNAL_ERROR" satisfies CreativeApplicationAdminErrorCode,
    },
    { status: 500 },
  );
};
