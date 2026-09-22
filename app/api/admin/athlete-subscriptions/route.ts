import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  listAdminAthleteMemberships,
  type AdminAthleteMembership,
} from "@/lib/athlete-memberships";
import { listActiveAthleteMembershipPlans, type AthleteMembershipPlan } from "@/lib/athlete-credits";

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
  listMemberships: (workspaceId: string) => Promise<AdminAthleteMembership[]>;
  listPlans: () => Promise<AthleteMembershipPlan[]>;
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
  listMemberships: listAdminAthleteMemberships,
  listPlans: listActiveAthleteMembershipPlans,
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

const retiredWriteResponse = () => NextResponse.json({
  error: "Les attributions historiques sont désactivées. Utilisez l’adhésion Athlète canonique.",
  code: "historical_subscription_write_disabled",
}, { status: 409 });

export const createAdminAthleteSubscriptionHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await getAdminContext(request, dependencies);
      if ("response" in access) return access.response;
      const [memberships, plans] = await Promise.all([
        dependencies.listMemberships(access.context.workspaceId),
        dependencies.listPlans(),
      ]);
      return NextResponse.json({ memberships, plans });
    } catch {
      return NextResponse.json({ error: "Impossible de charger les adhésions Athlètes." }, { status: 500 });
    }
  },

  async POST(request: Request) {
    try {
      const access = await getAdminContext(request, dependencies);
      if ("response" in access) return access.response;
      return retiredWriteResponse();
    } catch {
      return NextResponse.json({ error: "Impossible de vérifier les droits Admin." }, { status: 500 });
    }
  },

  async PATCH(request: Request) {
    try {
      const access = await getAdminContext(request, dependencies);
      if ("response" in access) return access.response;
      return retiredWriteResponse();
    } catch {
      return NextResponse.json({ error: "Impossible de vérifier les droits Admin." }, { status: 500 });
    }
  },
});

const handlers = createAdminAthleteSubscriptionHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;