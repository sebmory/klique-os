import { NextResponse } from "next/server";
import {
  assumeNoChargeAdminAthleteServiceRequest,
  completeAdminAthleteServiceRequest,
  confirmAdminAthleteServiceRequestPayment,
  listAdminAthleteServiceRequests,
  scheduleAdminAthleteServiceRequest,
  startAdminAthleteServiceRequest,
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
  scheduleRequest: (input: {
    workspaceId: string;
    requestId: string;
    scheduledAt: string;
  }) => Promise<AdminAthleteServiceRequestTransition>;
  startRequest: (input: {
    workspaceId: string;
    requestId: string;
  }) => Promise<AdminAthleteServiceRequestTransition>;
  completeRequest: (input: {
    workspaceId: string;
    requestId: string;
    deliveryKey: string;
  }) => Promise<AdminAthleteServiceRequestTransition>;
  confirmPaymentRequest: (input: {
    workspaceId: string;
    requestId: string;
    paymentReference: string;
  }) => Promise<AdminAthleteServiceRequestTransition>;
  assumeNoChargeRequest: (input: {
    workspaceId: string;
    requestId: string;
    reason: string;
  }) => Promise<AdminAthleteServiceRequestTransition>;
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
  scheduleRequest: scheduleAdminAthleteServiceRequest,
  startRequest: startAdminAthleteServiceRequest,
  completeRequest: completeAdminAthleteServiceRequest,
  confirmPaymentRequest: confirmAdminAthleteServiceRequestPayment,
  assumeNoChargeRequest: assumeNoChargeAdminAthleteServiceRequest,
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
      if (action !== "take_over" && action !== "schedule" && action !== "start" && action !== "complete" && action !== "confirm_payment" && action !== "assume_no_charge" && action !== "refuse") {
        return NextResponse.json({ error: "Action invalide." }, { status: 400 });
      }

      const rawScheduledAt = typeof body?.scheduledAt === "string" ? body.scheduledAt.trim() : "";
      const parsedScheduledAt = rawScheduledAt ? new Date(rawScheduledAt) : null;
      if (action === "schedule" && (!parsedScheduledAt || Number.isNaN(parsedScheduledAt.getTime()))) {
        return NextResponse.json({ error: "La date et l’heure de planification sont obligatoires." }, { status: 400 });
      }
      if (action === "schedule" && parsedScheduledAt!.getTime() <= Date.now()) {
        return NextResponse.json({ error: "La planification doit être située dans le futur." }, { status: 400 });
      }

      const refusalReason = typeof body?.refusalReason === "string" ? body.refusalReason.trim() : "";
      if (action === "refuse" && !refusalReason) {
        return NextResponse.json({ error: "Le motif du refus est obligatoire." }, { status: 400 });
      }
      if (refusalReason.length > 2000) {
        return NextResponse.json({ error: "Le motif du refus ne peut pas dépasser 2000 caractères." }, { status: 400 });
      }

      const paymentReference = typeof body?.paymentReference === "string" ? body.paymentReference.trim() : "";
      if (action === "confirm_payment" && body?.paymentReceived !== true) {
        return NextResponse.json({ error: "La réception du paiement doit être confirmée explicitement." }, { status: 400 });
      }
      if (action === "confirm_payment" && !paymentReference) {
        return NextResponse.json({ error: "La référence de paiement est obligatoire." }, { status: 400 });
      }
      if (paymentReference.length > 200) {
        return NextResponse.json({ error: "La référence de paiement ne peut pas dépasser 200 caractères." }, { status: 400 });
      }

      const deliveryKey = typeof body?.deliveryKey === "string" ? body.deliveryKey.trim() : "";
      if (action === "complete" && (!deliveryKey || deliveryKey.length > 128)) {
        return NextResponse.json({ error: "Un identifiant de livraison stable est obligatoire." }, { status: 400 });
      }

      const noChargeReason = typeof body?.reason === "string" ? body.reason.trim() : "";
      if (action === "assume_no_charge" && !noChargeReason) {
        return NextResponse.json({ error: "Le motif de la prise en charge par KLIQUE est obligatoire." }, { status: 400 });
      }
      if (noChargeReason.length > 2000) {
        return NextResponse.json({ error: "Le motif ne peut pas dépasser 2000 caractères." }, { status: 400 });
      }

      const result = action === "schedule"
        ? await dependencies.scheduleRequest({
            workspaceId,
            requestId,
            scheduledAt: parsedScheduledAt!.toISOString(),
          })
        : action === "start"
          ? await dependencies.startRequest({ workspaceId, requestId })
          : action === "complete"
            ? await dependencies.completeRequest({ workspaceId, requestId, deliveryKey })
          : action === "confirm_payment"
            ? await dependencies.confirmPaymentRequest({ workspaceId, requestId, paymentReference })
          : action === "assume_no_charge"
            ? await dependencies.assumeNoChargeRequest({ workspaceId, requestId, reason: noChargeReason })
        : await dependencies.transitionRequest({
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
      if (result.outcome === "insufficient_rights") {
        return NextResponse.json({ error: "Les droits disponibles sont insuffisants pour planifier cette demande." }, { status: 409 });
      }
      if (result.outcome === "ineligible") {
        return NextResponse.json({ error: "L’adhésion ou le plan ne permet plus de planifier cette demande." }, { status: 409 });
      }
      if (result.outcome === "paid_purchase") {
        return NextResponse.json({ error: "Un paiement reçu ne peut pas être refusé simplement. Le remboursement est hors périmètre." }, { status: 409 });
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