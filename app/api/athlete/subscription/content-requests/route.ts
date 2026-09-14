import { NextResponse } from "next/server";
import type { AthleteContentFormatCode } from "@/lib/athlete-subscription-catalog";
import {
  AthleteSubscriptionContentRequestError,
  createAthleteSubscriptionContentRequest,
  listAthleteSubscriptionContentRequestsForAthlete,
  type AthleteSubscriptionContentRequest,
  type CreateAthleteSubscriptionContentRequestInput,
} from "@/lib/athlete-subscription-content-requests/service";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AthleteAccess = {
  clerkUserId?: string | null;
  role?: string;
  status?: string;
  workspaceId?: string | null;
  athleteId?: string | null;
} | null;

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<AthleteAccess>;
  listRequests: (
    workspaceId: string,
    athleteId: string,
  ) => Promise<AthleteSubscriptionContentRequest[]>;
  createRequest: (
    input: CreateAthleteSubscriptionContentRequestInput,
  ) => Promise<AthleteSubscriptionContentRequest>;
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
      athleteId: profile.userAccess?.athleteId,
    };
  },
  listRequests: listAthleteSubscriptionContentRequestsForAthlete,
  createRequest: createAthleteSubscriptionContentRequest,
};

type AthleteContextResult =
  | { context: { workspaceId: string; athleteId: string } }
  | { response: NextResponse };

const getAthleteContext = async (
  request: Request,
  dependencies: HandlerDependencies,
): Promise<AthleteContextResult> => {
  const access = await dependencies.getAccess(request);
  if (!access?.clerkUserId?.trim()) {
    return { response: NextResponse.json({ error: "Authentification requise." }, { status: 401 }) };
  }

  const workspaceId = access.workspaceId?.trim() ?? "";
  const athleteId = access.athleteId?.trim() ?? "";
  if (access.role !== "athlete" || access.status !== "active" || !workspaceId || !athleteId) {
    return { response: NextResponse.json({ error: "Accès refusé." }, { status: 403 }) };
  }
  return { context: { workspaceId, athleteId } };
};

const respondWithError = (error: unknown): NextResponse => {
  if (error instanceof AthleteSubscriptionContentRequestError) {
    const status = error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json(
    { error: "Impossible de traiter les demandes de contenus personnalisés." },
    { status: 500 },
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const hasOnlyKeys = (body: Record<string, unknown>, allowedKeys: readonly string[]): boolean => {
  const allowed = new Set(allowedKeys);
  return Object.keys(body).every((key) => allowed.has(key));
};

const parseCreateBody = (
  value: unknown,
): Omit<CreateAthleteSubscriptionContentRequestInput, "workspaceId" | "athleteId"> => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["formatCode", "athleteNote", "preferredDate"])) {
    throw new AthleteSubscriptionContentRequestError("validation", "Données de demande invalides.");
  }
  if (typeof value.formatCode !== "string" || !value.formatCode.trim()) {
    throw new AthleteSubscriptionContentRequestError("validation", "formatCode est requis.");
  }
  if (value.athleteNote !== undefined
    && value.athleteNote !== null
    && typeof value.athleteNote !== "string") {
    throw new AthleteSubscriptionContentRequestError("validation", "athleteNote est invalide.");
  }
  if (value.preferredDate !== undefined
    && value.preferredDate !== null
    && typeof value.preferredDate !== "string") {
    throw new AthleteSubscriptionContentRequestError("validation", "preferredDate est invalide.");
  }

  return {
    formatCode: value.formatCode.trim() as AthleteContentFormatCode,
    ...(value.athleteNote !== undefined ? { athleteNote: value.athleteNote } : {}),
    ...(value.preferredDate !== undefined ? { preferredDate: value.preferredDate } : {}),
  };
};

const toPublicRequest = (request: AthleteSubscriptionContentRequest) => ({
  id: request.id,
  subscriptionId: request.subscriptionId,
  formatCode: request.formatCode,
  status: request.status,
  athleteNote: request.athleteNote,
  preferredDate: request.preferredDate,
  adminNote: request.adminNote,
  reservedAt: request.reservedAt,
  completedAt: request.completedAt,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

export const createAthleteSubscriptionContentRequestHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await getAthleteContext(request, dependencies);
      if ("response" in access) return access.response;
      const requests = await dependencies.listRequests(
        access.context.workspaceId,
        access.context.athleteId,
      );
      return NextResponse.json({ requests: requests.map(toPublicRequest) });
    } catch (error) {
      return respondWithError(error);
    }
  },

  async POST(request: Request) {
    try {
      const access = await getAthleteContext(request, dependencies);
      if ("response" in access) return access.response;
      const body = await request.json().catch(() => null);
      const input = parseCreateBody(body);
      const contentRequest = await dependencies.createRequest({
        ...input,
        workspaceId: access.context.workspaceId,
        athleteId: access.context.athleteId,
      });
      return NextResponse.json({ request: toPublicRequest(contentRequest) }, { status: 201 });
    } catch (error) {
      return respondWithError(error);
    }
  },
});

const handlers = createAthleteSubscriptionContentRequestHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;