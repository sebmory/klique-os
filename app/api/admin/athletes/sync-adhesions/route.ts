import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  syncAthleteAdhesionsToGoogleSheets,
  type AthleteAdhesionSyncResult,
} from "@/lib/google-sheets";

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
  syncAdhesions: () => Promise<AthleteAdhesionSyncResult>;
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
  syncAdhesions: syncAthleteAdhesionsToGoogleSheets,
};

export const createAdminAthleteAdhesionSyncHandler = (
  dependencies: HandlerDependencies = defaultDependencies,
) => async (request: Request) => {
  try {
    const access = await dependencies.getAccess(request);
    if (!access?.clerkUserId?.trim()) {
      return NextResponse.json({ ok: false, error: "Authentification requise." }, { status: 401 });
    }

    const workspaceId = access.workspaceId?.trim() ?? "";
    if (access.role !== "admin" || access.status !== "active" || !workspaceId) {
      return NextResponse.json({ ok: false, error: "Accès refusé." }, { status: 403 });
    }

    const result = await dependencies.syncAdhesions();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Impossible de synchroniser les adhésions Athlètes." },
      { status: 500 },
    );
  }
};

export const POST = createAdminAthleteAdhesionSyncHandler();