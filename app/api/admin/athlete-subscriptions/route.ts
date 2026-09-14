import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  assignAthleteSubscription,
  AthleteSubscriptionError,
  cancelAthleteSubscription,
  listAthleteSubscriptions,
  type AssignAthleteSubscriptionInput,
  type AthleteSubscription,
  type AthleteSubscriptionAssignmentPlanCode,
  type CancelAthleteSubscriptionInput,
} from "@/lib/athlete-subscriptions/service";

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
  listSubscriptions: (workspaceId: string) => Promise<AthleteSubscription[]>;
  assignSubscription: (input: AssignAthleteSubscriptionInput) => Promise<AthleteSubscription>;
  cancelSubscription: (input: CancelAthleteSubscriptionInput) => Promise<AthleteSubscription>;
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
  listSubscriptions: listAthleteSubscriptions,
  assignSubscription: assignAthleteSubscription,
  cancelSubscription: cancelAthleteSubscription,
};

type AdminContextResult =
  | { context: { workspaceId: string; clerkUserId: string } }
  | { response: NextResponse };

const getAdminContext = async (
  request: Request,
  dependencies: HandlerDependencies,
): Promise<AdminContextResult> => {
  const access = await dependencies.getAccess(request);
  const clerkUserId = access?.clerkUserId?.trim() ?? "";
  if (!clerkUserId) {
    return { response: NextResponse.json({ error: "Authentification requise." }, { status: 401 }) };
  }

  const workspaceId = access?.workspaceId?.trim() ?? "";
  if (access?.role !== "admin" || access.status !== "active" || !workspaceId) {
    return { response: NextResponse.json({ error: "Accès refusé." }, { status: 403 }) };
  }
  return { context: { workspaceId, clerkUserId } };
};

const respondWithError = (error: unknown): NextResponse => {
  if (error instanceof AthleteSubscriptionError) {
    const status = error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: "Impossible de gérer les abonnements Athlètes." }, { status: 500 });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const hasOnlyKeys = (body: Record<string, unknown>, allowedKeys: readonly string[]): boolean => {
  const allowed = new Set(allowedKeys);
  return Object.keys(body).every((key) => allowed.has(key));
};

const planCodes: readonly AthleteSubscriptionAssignmentPlanCode[] = [
  "essential",
  "impact",
  "signature",
  "founder",
];

const parseAssignmentBody = (value: unknown): Omit<AssignAthleteSubscriptionInput, "workspaceId" | "createdByClerkUserId"> => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "athleteId",
    "planCode",
    "startsOn",
    "endsOn",
    "isFounder",
    "isComplimentary",
  ])) {
    throw new AthleteSubscriptionError("validation", "Données d’attribution invalides.");
  }

  const athleteId = typeof value.athleteId === "string" ? value.athleteId.trim() : "";
  const startsOn = typeof value.startsOn === "string" ? value.startsOn.trim() : "";
  const endsOn = typeof value.endsOn === "string" ? value.endsOn.trim() : "";
  if (!athleteId || !startsOn || !endsOn || !planCodes.includes(value.planCode as AthleteSubscriptionAssignmentPlanCode)) {
    throw new AthleteSubscriptionError("validation", "Données d’attribution invalides.");
  }
  if (typeof value.isFounder !== "boolean" || typeof value.isComplimentary !== "boolean") {
    throw new AthleteSubscriptionError("validation", "Les indicateurs d’abonnement sont invalides.");
  }

  return {
    athleteId,
    planCode: value.planCode as AthleteSubscriptionAssignmentPlanCode,
    startsOn,
    endsOn,
    isFounder: value.isFounder,
    isComplimentary: value.isComplimentary,
  };
};

const parseCancellationBody = (value: unknown): { subscriptionId: string } => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["action", "subscriptionId"])) {
    throw new AthleteSubscriptionError("validation", "Données d’annulation invalides.");
  }
  const subscriptionId = typeof value.subscriptionId === "string" ? value.subscriptionId.trim() : "";
  if (value.action !== "cancel" || !subscriptionId) {
    throw new AthleteSubscriptionError("validation", "Action d’annulation invalide.");
  }
  return { subscriptionId };
};

export const createAdminAthleteSubscriptionHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await getAdminContext(request, dependencies);
      if ("response" in access) return access.response;
      const subscriptions = await dependencies.listSubscriptions(access.context.workspaceId);
      return NextResponse.json({ subscriptions });
    } catch (error) {
      return respondWithError(error);
    }
  },

  async POST(request: Request) {
    try {
      const access = await getAdminContext(request, dependencies);
      if ("response" in access) return access.response;
      const body = await request.json().catch(() => null);
      const input = parseAssignmentBody(body);
      const subscription = await dependencies.assignSubscription({
        ...input,
        workspaceId: access.context.workspaceId,
        createdByClerkUserId: access.context.clerkUserId,
      });
      return NextResponse.json({ subscription }, { status: 201 });
    } catch (error) {
      return respondWithError(error);
    }
  },

  async PATCH(request: Request) {
    try {
      const access = await getAdminContext(request, dependencies);
      if ("response" in access) return access.response;
      const body = await request.json().catch(() => null);
      const { subscriptionId } = parseCancellationBody(body);
      const subscription = await dependencies.cancelSubscription({
        workspaceId: access.context.workspaceId,
        subscriptionId,
      });
      return NextResponse.json({ subscription });
    } catch (error) {
      return respondWithError(error);
    }
  },
});

const handlers = createAdminAthleteSubscriptionHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;