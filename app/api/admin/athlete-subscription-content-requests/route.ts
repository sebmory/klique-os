import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  AthleteSubscriptionContentRequestError,
  changeAthleteSubscriptionContentRequestStatus,
  listAthleteSubscriptionContentRequestsForAdmin,
  type AthleteSubscriptionContentRequest,
  type AthleteSubscriptionContentRequestStatus,
  type ChangeAthleteSubscriptionContentRequestStatusInput,
} from "@/lib/athlete-subscription-content-requests/service";

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
  listRequests: (workspaceId: string) => Promise<AthleteSubscriptionContentRequest[]>;
  changeStatus: (
    input: ChangeAthleteSubscriptionContentRequestStatusInput,
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
    };
  },
  listRequests: listAthleteSubscriptionContentRequestsForAdmin,
  changeStatus: changeAthleteSubscriptionContentRequestStatus,
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
  if (error instanceof AthleteSubscriptionContentRequestError) {
    const status = error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json(
    { error: "Impossible de gérer les demandes de contenus personnalisés." },
    { status: 500 },
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const hasOnlyKeys = (body: Record<string, unknown>, allowedKeys: readonly string[]): boolean => {
  const allowed = new Set(allowedKeys);
  return Object.keys(body).every((key) => allowed.has(key));
};

const statuses: readonly AthleteSubscriptionContentRequestStatus[] = [
  "requested",
  "accepted",
  "in_progress",
  "completed",
  "declined",
  "cancelled",
];

const parseStatusBody = (
  value: unknown,
): Omit<ChangeAthleteSubscriptionContentRequestStatusInput, "workspaceId"> => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["requestId", "status", "adminNote"])) {
    throw new AthleteSubscriptionContentRequestError("validation", "Données de transition invalides.");
  }

  const requestId = typeof value.requestId === "string" ? value.requestId.trim() : "";
  if (!requestId || !statuses.includes(value.status as AthleteSubscriptionContentRequestStatus)) {
    throw new AthleteSubscriptionContentRequestError("validation", "Transition de statut invalide.");
  }
  if (value.adminNote !== undefined
    && value.adminNote !== null
    && typeof value.adminNote !== "string") {
    throw new AthleteSubscriptionContentRequestError("validation", "adminNote est invalide.");
  }

  return {
    requestId,
    status: value.status as AthleteSubscriptionContentRequestStatus,
    ...(value.adminNote !== undefined ? { adminNote: value.adminNote } : {}),
  };
};

export const createAdminAthleteSubscriptionContentRequestHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await getAdminContext(request, dependencies);
      if ("response" in access) return access.response;
      const requests = await dependencies.listRequests(access.context.workspaceId);
      return NextResponse.json({ requests });
    } catch (error) {
      return respondWithError(error);
    }
  },

  async PATCH(request: Request) {
    try {
      const access = await getAdminContext(request, dependencies);
      if ("response" in access) return access.response;
      const body = await request.json().catch(() => null);
      const input = parseStatusBody(body);
      const contentRequest = await dependencies.changeStatus({
        ...input,
        workspaceId: access.context.workspaceId,
      });
      return NextResponse.json({ request: contentRequest });
    } catch (error) {
      return respondWithError(error);
    }
  },
});

const handlers = createAdminAthleteSubscriptionContentRequestHandlers();
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;