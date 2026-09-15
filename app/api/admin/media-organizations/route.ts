import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  createMediaOrganization,
  linkExistingMediaAccess,
  listMediaOrganizationInvitations,
  listMediaOrganizations,
  MediaOrganizationError,
  type CreateMediaOrganizationInput,
  type LinkExistingMediaAccessInput,
  type LinkedMediaAccess,
  type MediaOrganization,
  type MediaOrganizationInvitationOverview,
} from "@/lib/media-organizations/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminAccess = {
  clerkUserId?: string | null;
  role?: string;
  status?: string;
  workspaceId?: string | null;
};

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<AdminAccess | null>;
  listOrganizations: (workspaceId: string) => Promise<MediaOrganization[]>;
  listInvitations?: (workspaceId: string) => Promise<MediaOrganizationInvitationOverview[]>;
  createOrganization: (
    workspaceId: string,
    input: CreateMediaOrganizationInput,
  ) => Promise<MediaOrganization>;
  linkExistingAccess: (
    workspaceId: string,
    input: LinkExistingMediaAccessInput,
  ) => Promise<LinkedMediaAccess>;
};

const defaultDependencies: HandlerDependencies = {
  async getAccess(request) {
    const profile = await getCurrentUserAccessProfile(request);
    if (!profile) return null;
    return {
      clerkUserId: profile.clerkUser.id,
      role: profile.userAccess?.role,
      status: profile.userAccess?.status,
      workspaceId: profile.userAccess?.workspaceId,
    };
  },
  listOrganizations: listMediaOrganizations,
  listInvitations: listMediaOrganizationInvitations,
  createOrganization: createMediaOrganization,
  linkExistingAccess: linkExistingMediaAccess,
};

type AdminContextResult =
  | { context: { workspaceId: string } }
  | { response: NextResponse };

const getAdminContext = async (
  request: Request,
  dependencies: HandlerDependencies,
): Promise<AdminContextResult> => {
  const access = await dependencies.getAccess(request);
  if (!access?.clerkUserId?.trim()) {
    return { response: NextResponse.json({ error: "Authentification requise." }, { status: 401 }) };
  }

  const workspaceId = access.workspaceId?.trim() ?? "";
  if (access.role !== "admin" || access.status !== "active" || !workspaceId) {
    return { response: NextResponse.json({ error: "Accès refusé." }, { status: 403 }) };
  }

  return { context: { workspaceId } };
};

const respondWithError = (error: unknown): NextResponse => {
  if (error instanceof MediaOrganizationError) {
    const status = error.code === "not_found" ? 404 : error.code === "conflict" || error.code === "invitation_pending" ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }

  return NextResponse.json(
    { error: "Impossible de gérer les organisations Média." },
    { status: 500 },
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const allowedPostFields = new Set(["name", "type", "contactEmail", "website", "status"]);
const allowedPatchFields = new Set(["mediaId", "email"]);

const parseCreateBody = (value: unknown): CreateMediaOrganizationInput => {
  if (!isRecord(value) || !Object.keys(value).every((key) => allowedPostFields.has(key))) {
    throw new MediaOrganizationError("validation", "Données d’organisation Média invalides.");
  }

  return {
    name: value.name,
    type: value.type,
    contactEmail: value.contactEmail,
    ...(Object.hasOwn(value, "website") ? { website: value.website } : {}),
    ...(Object.hasOwn(value, "status") ? { status: value.status } : {}),
  };
};

const parseLinkBody = (value: unknown): LinkExistingMediaAccessInput => {
  if (!isRecord(value) || Object.keys(value).length !== 2 || !Object.keys(value).every((key) => allowedPatchFields.has(key))) {
    throw new MediaOrganizationError("validation", "Donnees de rattachement Media invalides.");
  }

  return { mediaId: value.mediaId, email: value.email };
};

export const createAdminMediaOrganizationHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await getAdminContext(request, dependencies);
      if ("response" in access) return access.response;

      const organizations = await dependencies.listOrganizations(access.context.workspaceId);
      if (!dependencies.listInvitations) {
        return NextResponse.json({ organizations });
      }
      const invitations = await dependencies.listInvitations(access.context.workspaceId);
      return NextResponse.json({ organizations, invitations });
    } catch (error) {
      return respondWithError(error);
    }
  },

  async POST(request: Request) {
    try {
      const access = await getAdminContext(request, dependencies);
      if ("response" in access) return access.response;

      const body = await request.json().catch(() => null);
      const input = parseCreateBody(body);
      const organization = await dependencies.createOrganization(access.context.workspaceId, input);
      return NextResponse.json({ organization }, { status: 201 });
    } catch (error) {
      return respondWithError(error);
    }
  },

  async PATCH(request: Request) {
    try {
      const access = await getAdminContext(request, dependencies);
      if ("response" in access) return access.response;

      const body = await request.json().catch(() => null);
      const input = parseLinkBody(body);
      const linkedAccess = await dependencies.linkExistingAccess(access.context.workspaceId, input);
      return NextResponse.json({ linkedAccess });
    } catch (error) {
      return respondWithError(error);
    }
  },
});

const handlers = createAdminMediaOrganizationHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;