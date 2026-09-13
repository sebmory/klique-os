import { NextResponse } from "next/server";
import {
  calculateVisibilityAudienceTrackingState,
  calculateVisibilityAudienceSummary,
  calculateKliqueVisibilityFormatBreakdown,
  listKliqueVisibilityHistoryEntries,
  listKliqueVisibilityMetricSnapshots,
  listKliqueVisibilityPublications,
  type KliqueVisibilityHistoryEntry,
  type KliqueVisibilityPublication,
  type VisibilityMetricSnapshot,
} from "@/lib/klique-visibility";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AthleteAccess = {
  role?: string;
  status?: string;
  workspaceId?: string | null;
  athleteId?: string | null;
};

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<AthleteAccess | null>;
  listPublications: (workspaceId: string) => Promise<KliqueVisibilityPublication[]>;
  listHistoryEntries: (workspaceId: string) => Promise<KliqueVisibilityHistoryEntry[]>;
  listMetricSnapshots: (workspaceId: string, publicationId: string) => Promise<VisibilityMetricSnapshot[]>;
};

const defaultDependencies: HandlerDependencies = {
  async getAccess(request) {
    const profile = await getCurrentUserAccessProfile(request);
    return profile?.userAccess ?? null;
  },
  listPublications: listKliqueVisibilityPublications,
  listHistoryEntries: listKliqueVisibilityHistoryEntries,
  listMetricSnapshots: listKliqueVisibilityMetricSnapshots,
};

export const createAthleteKliqueVisibilityHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await dependencies.getAccess(request);
      const workspaceId = access?.workspaceId?.trim() ?? "";
      const athleteId = access?.athleteId?.trim() ?? "";

      if (access?.role !== "athlete" || access.status !== "active" || !workspaceId || !athleteId) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }

      const [allPublications, allHistoryEntries] = await Promise.all([
        dependencies.listPublications(workspaceId),
        dependencies.listHistoryEntries(workspaceId),
      ]);

      // Le filtrage athlete precede tout chargement et tout calcul d audience.
      const ownDetailedPublications = allPublications.filter(
        (publication) => publication.athleteIds.includes(athleteId),
      );
      const ownPublicationIds = new Set(ownDetailedPublications.map((publication) => publication.id));
      const ownMetricSnapshots = (await Promise.all(
        ownDetailedPublications.map((publication) => (
          dependencies.listMetricSnapshots(workspaceId, publication.id)
        )),
      )).flat().filter((snapshot) => ownPublicationIds.has(snapshot.publicationId));

      // Projection publique: ne jamais exposer le workspace, l auteur, la source ou les autres athletes.
      const currentDate = new Date();
      const ownPublications = ownDetailedPublications.map((publication) => ({
        id: publication.id,
        format: publication.format,
        network: publication.network,
        publishedAt: publication.publishedAt,
        link: publication.link,
        title: publication.title,
        editorialCategory: publication.editorialCategory,
        isCollaborator: publication.collaboratorAthleteIds.includes(athleteId),
        audienceTracking: calculateVisibilityAudienceTrackingState(
          publication.publishedAt,
          publication.format,
          currentDate,
        ),
      }));
      const ownHistoryEntries = allHistoryEntries.filter(
        (entry) => entry.scope === "athlete" && entry.athleteId === athleteId,
      );

      const latestByPublication = new Map<string, VisibilityMetricSnapshot>();
      for (const snapshot of ownMetricSnapshots) {
        const current = latestByPublication.get(snapshot.publicationId);
        if (!current || new Date(snapshot.observedAt).getTime() > new Date(current.observedAt).getTime()) {
          latestByPublication.set(snapshot.publicationId, snapshot);
        }
      }
      const latestMetrics = ownDetailedPublications.flatMap((publication) => {
        const snapshot = latestByPublication.get(publication.id);
        return snapshot ? [{
          publicationId: snapshot.publicationId,
          observedAt: snapshot.observedAt,
          views: snapshot.views,
          reach: snapshot.reach,
          impressions: snapshot.impressions,
        }] : [];
      });

      const formatBreakdown = calculateKliqueVisibilityFormatBreakdown(ownPublications, ownHistoryEntries);
      const totalTracked = ownPublications.length;
      const totalHistorical = ownHistoryEntries.reduce((sum, entry) => sum + entry.quantity, 0);

      return NextResponse.json({
        publications: ownPublications,
        totals: { totalTracked, totalHistorical, combinedTotal: totalTracked + totalHistorical },
        formatBreakdown,
        audienceSummary: calculateVisibilityAudienceSummary(ownDetailedPublications, ownMetricSnapshots),
        latestMetrics,
      });
    } catch {
      return NextResponse.json(
        { error: "Impossible de charger votre visibilité pour le moment." },
        { status: 500 },
      );
    }
  },
});

const handlers = createAthleteKliqueVisibilityHandlers();
export const GET = handlers.GET;
