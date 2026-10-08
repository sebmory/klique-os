import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";
import {
  listAthleteServicePlanningPriorities,
  type AthleteServicePlanningPriority,
} from "@/lib/athlete-service-planning-priorities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminAccess = {
  clerkUserId?: string | null;
  role?: string;
  status?: string;
  workspaceId?: string | null;
};

type AthleteIdentity = {
  key: string;
  name: string;
};

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<AdminAccess | null>;
  listPriorities: (input: {
    workspaceId: string;
    limit: number;
  }) => Promise<AthleteServicePlanningPriority[]>;
  listAthletes: () => Promise<AthleteIdentity[]>;
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
  listPriorities: listAthleteServicePlanningPriorities,
  listAthletes: getAthletesFromGoogleSheets,
};

export const createAdminAthleteServicePlanningPriorityHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await dependencies.getAccess(request);
      const clerkUserId = access?.clerkUserId?.trim() ?? "";
      if (!clerkUserId) {
        return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
      }

      const workspaceId = access?.workspaceId?.trim() ?? "";
      if (access?.role !== "admin" || access.status !== "active" || !workspaceId) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }

      const [priorities, athletes] = await Promise.all([
        dependencies.listPriorities({ workspaceId, limit: 8 }),
        dependencies.listAthletes(),
      ]);
      const athleteNames = new Map(athletes.map((athlete) => [athlete.key, athlete.name]));

      return NextResponse.json({
        priorities: priorities.map((priority) => ({
          ...priority,
          athleteName: athleteNames.get(priority.athleteId) ?? priority.athleteId,
        })),
      });
    } catch {
      return NextResponse.json(
        { error: "Impossible de charger les prestations à planifier." },
        { status: 500 },
      );
    }
  },
});

const handlers = createAdminAthleteServicePlanningPriorityHandlers();
export const GET = handlers.GET;
