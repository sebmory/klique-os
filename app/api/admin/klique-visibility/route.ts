import { NextResponse } from "next/server";
import {
  KliqueVisibilityError,
  createKliqueVisibilityHistoryEntry,
  createKliqueVisibilityPublication,
  deleteKliqueVisibilityHistoryEntry,
  deleteKliqueVisibilityPublication,
  getKliqueVisibilityRegistryOverview,
  parseKliqueVisibilityHistoryEntryInput,
  parseKliqueVisibilityPublicationInput,
  setKliqueVisibilityTrackingStartDate,
  updateKliqueVisibilityHistoryEntry,
  updateKliqueVisibilityPublication,
  type KliqueVisibilityHistoryEntry,
  type KliqueVisibilityPublication,
  type KliqueVisibilityRegistryOverview,
  type KliqueVisibilityTrackingSettings,
} from "@/lib/klique-visibility";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminAccess = {
  role?: string;
  status?: string;
  workspaceId?: string | null;
};

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<AdminAccess | null>;
  getOverview: (input: { workspaceId: string }) => Promise<KliqueVisibilityRegistryOverview>;
  setTrackingStartDate: (input: { workspaceId: string; trackingStartDate: string }) => Promise<KliqueVisibilityTrackingSettings>;
  createPublication: (input: { workspaceId: string; publication: unknown }) => Promise<KliqueVisibilityPublication>;
  createHistoryEntry: (input: { workspaceId: string; historyEntry: unknown }) => Promise<KliqueVisibilityHistoryEntry>;
  updatePublication: (input: { workspaceId: string; publicationId: string; publication: unknown }) => Promise<KliqueVisibilityPublication>;
  deletePublication: (input: { workspaceId: string; publicationId: string }) => Promise<void>;
  updateHistoryEntry: (input: { workspaceId: string; historyEntryId: string; historyEntry: unknown }) => Promise<KliqueVisibilityHistoryEntry>;
  deleteHistoryEntry: (input: { workspaceId: string; historyEntryId: string }) => Promise<void>;
};

const defaultDependencies: HandlerDependencies = {
  async getAccess(request) {
    const profile = await getCurrentUserAccessProfile(request);
    return profile?.userAccess ?? null;
  },
  async getOverview({ workspaceId }) {
    return getKliqueVisibilityRegistryOverview(workspaceId);
  },
  async setTrackingStartDate({ workspaceId, trackingStartDate }) {
    return setKliqueVisibilityTrackingStartDate(workspaceId, trackingStartDate);
  },
  async createPublication({ workspaceId, publication }) {
    return createKliqueVisibilityPublication(workspaceId, parseKliqueVisibilityPublicationInput(publication));
  },
  async createHistoryEntry({ workspaceId, historyEntry }) {
    return createKliqueVisibilityHistoryEntry(workspaceId, parseKliqueVisibilityHistoryEntryInput(historyEntry));
  },
  async updatePublication({ workspaceId, publicationId, publication }) {
    return updateKliqueVisibilityPublication(workspaceId, publicationId, parseKliqueVisibilityPublicationInput(publication));
  },
  async deletePublication({ workspaceId, publicationId }) {
    return deleteKliqueVisibilityPublication(workspaceId, publicationId);
  },
  async updateHistoryEntry({ workspaceId, historyEntryId, historyEntry }) {
    return updateKliqueVisibilityHistoryEntry(workspaceId, historyEntryId, parseKliqueVisibilityHistoryEntryInput(historyEntry));
  },
  async deleteHistoryEntry({ workspaceId, historyEntryId }) {
    return deleteKliqueVisibilityHistoryEntry(workspaceId, historyEntryId);
  },
};

const getAdminWorkspace = async (request: Request, dependencies: HandlerDependencies) => {
  const access = await dependencies.getAccess(request);
  const workspaceId = access?.workspaceId?.trim() ?? "";
  if (access?.role !== "admin" || access.status !== "active" || !workspaceId) return null;
  return workspaceId;
};

const errorStatusByCode: Record<string, number> = {
  tracking_start_missing: 409,
  tracking_start_locked: 409,
  publication_before_tracking_start: 409,
  history_period_not_before_tracking_start: 409,
  history_period_overlap: 409,
  publication_not_found: 404,
  history_entry_not_found: 404,
};

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isExclusionViolation = (error: unknown): boolean =>
  Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23P01");

// Filet de sécurité: les triggers de début de suivi lèvent un RAISE EXCEPTION brut (code P0001) si un décalage
// (ex. cache obsolète) laisse passer côté JS une date pourtant refusée par la base, source de vérité.
const isTrackingStartTriggerViolation = (error: unknown): boolean =>
  Boolean(
    error
      && typeof error === "object"
      && (error as { code?: string }).code === "P0001"
      && /debut du suivi/i.test((error as { message?: string }).message ?? ""),
  );

const respondWithError = (error: unknown, fallbackMessage: string) => {
  if (error instanceof KliqueVisibilityError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: errorStatusByCode[error.code] ?? 400 });
  }
  if (isExclusionViolation(error)) {
    return NextResponse.json(
      { error: "Cette période chevauche une reprise historique déjà enregistrée pour la même catégorie.", code: "history_period_overlap" },
      { status: 409 },
    );
  }
  if (isTrackingStartTriggerViolation(error)) {
    return NextResponse.json(
      { error: "La date est incompatible avec le début du suivi configuré pour ce workspace.", code: "tracking_start_missing" },
      { status: 409 },
    );
  }
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
};

export const createAdminKliqueVisibilityHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const workspaceId = await getAdminWorkspace(request, dependencies);
      if (!workspaceId) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      return NextResponse.json(await dependencies.getOverview({ workspaceId }));
    } catch (error) {
      return respondWithError(error, "Impossible de charger le registre de visibilité.");
    }
  },
  async POST(request: Request) {
    try {
      const workspaceId = await getAdminWorkspace(request, dependencies);
      if (!workspaceId) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const action = body?.action;

      if (action === "set_tracking_start_date") {
        const trackingStartDate = typeof body?.trackingStartDate === "string" ? body.trackingStartDate.trim() : "";
        const settings = await dependencies.setTrackingStartDate({ workspaceId, trackingStartDate });
        return NextResponse.json({ trackingSettings: settings });
      }
      if (action === "create_publication") {
        const publication = await dependencies.createPublication({ workspaceId, publication: body?.publication });
        return NextResponse.json({ publication });
      }
      if (action === "create_history_entry") {
        const historyEntry = await dependencies.createHistoryEntry({ workspaceId, historyEntry: body?.historyEntry });
        return NextResponse.json({ historyEntry });
      }
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    } catch (error) {
      return respondWithError(error, "Impossible d’enregistrer les données de visibilité.");
    }
  },
  async PATCH(request: Request) {
    try {
      const workspaceId = await getAdminWorkspace(request, dependencies);
      if (!workspaceId) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const action = body?.action;

      if (action === "update_publication" || action === "delete_publication") {
        const publicationId = typeof body?.publicationId === "string" ? body.publicationId.trim() : "";
        if (!idPattern.test(publicationId)) {
          return NextResponse.json({ error: "Publication invalide." }, { status: 400 });
        }
        if (action === "delete_publication") {
          await dependencies.deletePublication({ workspaceId, publicationId });
          return NextResponse.json({ deleted: true });
        }
        const publication = await dependencies.updatePublication({ workspaceId, publicationId, publication: body?.publication });
        return NextResponse.json({ publication });
      }

      if (action === "update_history_entry" || action === "delete_history_entry") {
        const historyEntryId = typeof body?.historyEntryId === "string" ? body.historyEntryId.trim() : "";
        if (!idPattern.test(historyEntryId)) {
          return NextResponse.json({ error: "Reprise historique invalide." }, { status: 400 });
        }
        if (action === "delete_history_entry") {
          await dependencies.deleteHistoryEntry({ workspaceId, historyEntryId });
          return NextResponse.json({ deleted: true });
        }
        const historyEntry = await dependencies.updateHistoryEntry({ workspaceId, historyEntryId, historyEntry: body?.historyEntry });
        return NextResponse.json({ historyEntry });
      }

      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    } catch (error) {
      return respondWithError(error, "Impossible de modifier les données de visibilité.");
    }
  },
});

const handlers = createAdminKliqueVisibilityHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
