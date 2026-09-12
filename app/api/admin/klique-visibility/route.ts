import { NextResponse } from "next/server";
import {
  KliqueVisibilityError,
  calculateVisibilityAudienceTrackingState,
  calculateVisibilityAudienceSummary,
  createKliqueVisibilityHistoryEntry,
  createKliqueVisibilityMetricSnapshot,
  createKliqueVisibilityPublication,
  deleteKliqueVisibilityHistoryEntry,
  deleteKliqueVisibilityPublication,
  getKliqueVisibilityRegistryOverview,
  listKliqueVisibilityMetricSnapshots,
  parseKliqueVisibilityHistoryEntryInput,
  parseKliqueVisibilityPublicationInput,
  parseVisibilityMetricSnapshotInput,
  parseVisibilityPublicationClassificationInput,
  setKliqueVisibilityTrackingStartDate,
  updateKliqueVisibilityHistoryEntry,
  updateKliqueVisibilityPublication,
  updateKliqueVisibilityPublicationClassification,
  type KliqueVisibilityHistoryEntry,
  type KliqueVisibilityPublication,
  type KliqueVisibilityPublicationInput,
  type KliqueVisibilityRegistryOverview,
  type KliqueVisibilityTrackingSettings,
  type VisibilityMetricSnapshot,
} from "@/lib/klique-visibility";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

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
  getOverview: (input: { workspaceId: string }) => Promise<KliqueVisibilityRegistryOverview>;
  setTrackingStartDate: (input: { workspaceId: string; trackingStartDate: string }) => Promise<KliqueVisibilityTrackingSettings>;
  createPublication: (input: { workspaceId: string; publication: KliqueVisibilityPublicationInput }) => Promise<KliqueVisibilityPublication>;
  createHistoryEntry: (input: { workspaceId: string; historyEntry: unknown }) => Promise<KliqueVisibilityHistoryEntry>;
  createMetricSnapshot: (input: {
    workspaceId: string;
    publicationId: string;
    createdByClerkUserId: string;
    snapshot: unknown;
  }) => Promise<VisibilityMetricSnapshot>;
  listMetricSnapshots: (input: { workspaceId: string; publicationId: string }) => Promise<VisibilityMetricSnapshot[]>;
  updatePublication: (input: { workspaceId: string; publicationId: string; publication: KliqueVisibilityPublicationInput }) => Promise<KliqueVisibilityPublication>;
  updateClassification: (input: {
    workspaceId: string;
    publicationId: string;
    classification: unknown;
  }) => Promise<KliqueVisibilityPublication>;
  deletePublication: (input: { workspaceId: string; publicationId: string }) => Promise<void>;
  updateHistoryEntry: (input: { workspaceId: string; historyEntryId: string; historyEntry: unknown }) => Promise<KliqueVisibilityHistoryEntry>;
  deleteHistoryEntry: (input: { workspaceId: string; historyEntryId: string }) => Promise<void>;
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
  async getOverview({ workspaceId }) {
    return getKliqueVisibilityRegistryOverview(workspaceId);
  },
  async setTrackingStartDate({ workspaceId, trackingStartDate }) {
    return setKliqueVisibilityTrackingStartDate(workspaceId, trackingStartDate);
  },
  async createPublication({ workspaceId, publication }) {
    return createKliqueVisibilityPublication(workspaceId, publication);
  },
  async createHistoryEntry({ workspaceId, historyEntry }) {
    return createKliqueVisibilityHistoryEntry(workspaceId, parseKliqueVisibilityHistoryEntryInput(historyEntry));
  },
  async createMetricSnapshot({ workspaceId, publicationId, createdByClerkUserId, snapshot }) {
    return createKliqueVisibilityMetricSnapshot(
      workspaceId,
      publicationId,
      createdByClerkUserId,
      parseVisibilityMetricSnapshotInput(snapshot),
    );
  },
  async listMetricSnapshots({ workspaceId, publicationId }) {
    return listKliqueVisibilityMetricSnapshots(workspaceId, publicationId);
  },
  async updatePublication({ workspaceId, publicationId, publication }) {
    return updateKliqueVisibilityPublication(workspaceId, publicationId, publication);
  },
  async updateClassification({ workspaceId, publicationId, classification }) {
    return updateKliqueVisibilityPublicationClassification(
      workspaceId,
      publicationId,
      parseVisibilityPublicationClassificationInput(classification),
    );
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
      const accessResult = await getAdminContext(request, dependencies);
      if ("response" in accessResult) return accessResult.response;
      const { workspaceId } = accessResult.context;
      const overview = await dependencies.getOverview({ workspaceId });
      const currentDate = new Date();
      const publications = overview.publications.map((publication) => ({
        ...publication,
        audienceTracking: calculateVisibilityAudienceTrackingState(publication.publishedAt, currentDate),
      }));
      const metricSnapshots = (await Promise.all(
        overview.publications.map((publication) => dependencies.listMetricSnapshots({
          workspaceId,
          publicationId: publication.id,
        })),
      )).flat();
      return NextResponse.json({
        ...overview,
        publications,
        metricSnapshots,
        audienceSummary: calculateVisibilityAudienceSummary(overview.publications, metricSnapshots),
      });
    } catch (error) {
      return respondWithError(error, "Impossible de charger le registre de visibilité.");
    }
  },
  async POST(request: Request) {
    try {
      const accessResult = await getAdminContext(request, dependencies);
      if ("response" in accessResult) return accessResult.response;
      const { workspaceId, clerkUserId } = accessResult.context;

      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const action = body?.action;

      if (action === "set_tracking_start_date") {
        const trackingStartDate = typeof body?.trackingStartDate === "string" ? body.trackingStartDate.trim() : "";
        const settings = await dependencies.setTrackingStartDate({ workspaceId, trackingStartDate });
        return NextResponse.json({ trackingSettings: settings });
      }
      if (action === "create_publication") {
        const publicationInput = parseKliqueVisibilityPublicationInput(body?.publication);
        const publication = await dependencies.createPublication({ workspaceId, publication: publicationInput });
        return NextResponse.json({ publication });
      }
      if (action === "create_history_entry") {
        const historyEntry = await dependencies.createHistoryEntry({ workspaceId, historyEntry: body?.historyEntry });
        return NextResponse.json({ historyEntry });
      }
      if (action === "metric_snapshot") {
        const publicationId = typeof body?.publicationId === "string" ? body.publicationId.trim() : "";
        if (!idPattern.test(publicationId)) {
          return NextResponse.json({ error: "Publication invalide." }, { status: 400 });
        }
        const metricSnapshot = await dependencies.createMetricSnapshot({
          workspaceId,
          publicationId,
          createdByClerkUserId: clerkUserId,
          snapshot: {
            observedAt: body?.observedAt,
            views: body?.views,
            reach: body?.reach,
            impressions: body?.impressions,
            source: "manual",
          },
        });
        return NextResponse.json({ metricSnapshot });
      }
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    } catch (error) {
      return respondWithError(error, "Impossible d’enregistrer les données de visibilité.");
    }
  },
  async PATCH(request: Request) {
    try {
      const accessResult = await getAdminContext(request, dependencies);
      if ("response" in accessResult) return accessResult.response;
      const { workspaceId } = accessResult.context;

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
        const publicationInput = parseKliqueVisibilityPublicationInput(body?.publication);
        const publication = await dependencies.updatePublication({ workspaceId, publicationId, publication: publicationInput });
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

      if (action === "classification") {
        const publicationId = typeof body?.publicationId === "string" ? body.publicationId.trim() : "";
        if (!idPattern.test(publicationId)) {
          return NextResponse.json({ error: "Publication invalide." }, { status: 400 });
        }
        const publication = await dependencies.updateClassification({
          workspaceId,
          publicationId,
          classification: {
            origin: body?.origin,
            publisherName: body?.publisherName,
            externalPostId: body?.externalPostId,
          },
        });
        return NextResponse.json({ publication });
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
