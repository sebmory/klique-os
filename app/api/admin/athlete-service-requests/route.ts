import { NextResponse } from "next/server";
import {
  listAdminAthleteServiceRequests,
  transitionAdminAthleteServiceRequest,
  type AdminAthleteServiceRequest,
  type AdminAthleteServiceRequestTransition,
} from "@/lib/athlete-service-requests";
import { evaluateBusinessAccess, getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminAccess = {
  role?: string;
  status?: string;
  workspaceId?: string | null;
};

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<AdminAccess | null>;
  hasCrmAccess: (request: Request) => Promise<boolean>;
  listRequests: (input: { workspaceId: string }) => Promise<AdminAthleteServiceRequest[]>;
  transitionRequest: (input: {
    workspaceId: string;
    requestId: string;
    nextStatus: "to_confirm" | "refused";
    refusalReason?: string;
  }) => Promise<AdminAthleteServiceRequestTransition>;
};

const defaultDependencies: HandlerDependencies = {
  async getAccess(request) {
    const profile = await getCurrentUserAccessProfile(request);
    return profile?.userAccess ?? null;
  },
  async hasCrmAccess(request) {
    return (await evaluateBusinessAccess(request, { action: "write:crm" })).allowed;
  },
  listRequests: listAdminAthleteServiceRequests,
  transitionRequest: transitionAdminAthleteServiceRequest,
};

const getAdminWorkspace = async (request: Request, dependencies: HandlerDependencies) => {
  const [access, hasCrmAccess] = await Promise.all([
    dependencies.getAccess(request),
    dependencies.hasCrmAccess(request),
  ]);
  const workspaceId = access?.workspaceId?.trim() ?? "";
  if (!hasCrmAccess || access?.role !== "admin" || access.status !== "active" || !workspaceId) return null;
  return workspaceId;
};

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createAdminAthleteServiceRequestHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const workspaceId = await getAdminWorkspace(request, dependencies);
      if (!workspaceId) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      return NextResponse.json({ requests: await dependencies.listRequests({ workspaceId }) });
    } catch {
      return NextResponse.json({ error: "Impossible de charger les demandes de services." }, { status: 500 });
    }
  },
  async PATCH(request: Request) {
    try {
      const workspaceId = await getAdminWorkspace(request, dependencies);
      if (!workspaceId) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
      const action = body?.action;
      if (!requestIdPattern.test(requestId)) {
        return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
      }
      if (action !== "take_over" && action !== "refuse") {
        return NextResponse.json({ error: "Action invalide." }, { status: 400 });
      }

      const refusalReason = typeof body?.refusalReason === "string" ? body.refusalReason.trim() : "";
      if (action === "refuse" && !refusalReason) {
        return NextResponse.json({ error: "Le motif du refus est obligatoire." }, { status: 400 });
      }
      if (refusalReason.length > 2000) {
        return NextResponse.json({ error: "Le motif du refus ne peut pas dépasser 2000 caractères." }, { status: 400 });
      }

      const result = await dependencies.transitionRequest({
        workspaceId,
        requestId,
        nextStatus: action === "take_over" ? "to_confirm" : "refused",
        ...(action === "refuse" ? { refusalReason } : {}),
      });
      if (result.outcome === "missing") {
        return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
      }
      if (result.outcome === "conflict") {
        return NextResponse.json({ error: "Cette demande a déjà changé d’état." }, { status: 409 });
      }
      return NextResponse.json({ request: result.request, unchanged: result.outcome === "unchanged" });
    } catch {
      return NextResponse.json({ error: "Impossible de mettre à jour la demande de service." }, { status: 500 });
    }
  },
});

const handlers = createAdminAthleteServiceRequestHandlers();
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;