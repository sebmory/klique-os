import { NextResponse } from "next/server";
import {
  calculateKliqueVisibilityFormatBreakdown,
  listKliqueVisibilityHistoryEntries,
  listKliqueVisibilityPublications,
} from "@/lib/klique-visibility";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const profile = await getCurrentUserAccessProfile(request);
    const access = profile?.userAccess ?? null;
    const workspaceId = access?.workspaceId?.trim() ?? "";
    const athleteId = access?.athleteId?.trim() ?? "";

    if (access?.role !== "athlete" || access.status !== "active" || !workspaceId || !athleteId) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const [allPublications, allHistoryEntries] = await Promise.all([
      listKliqueVisibilityPublications(workspaceId),
      listKliqueVisibilityHistoryEntries(workspaceId),
    ]);

    // Ne jamais exposer les statistiques ou l'identite d'un autre athlete: filtrage strict sur athleteId propre.
    const ownPublications = allPublications
      .filter((publication) => publication.athleteIds.includes(athleteId))
      .map((publication) => ({
        id: publication.id,
        format: publication.format,
        network: publication.network,
        publishedAt: publication.publishedAt,
        link: publication.link,
      }));
    const ownHistoryEntries = allHistoryEntries.filter(
      (entry) => entry.scope === "athlete" && entry.athleteId === athleteId,
    );

    const formatBreakdown = calculateKliqueVisibilityFormatBreakdown(ownPublications, ownHistoryEntries);
    const totalTracked = ownPublications.length;
    const totalHistorical = ownHistoryEntries.reduce((sum, entry) => sum + entry.quantity, 0);

    return NextResponse.json({
      publications: ownPublications,
      totals: { totalTracked, totalHistorical, combinedTotal: totalTracked + totalHistorical },
      formatBreakdown,
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de charger votre visibilité pour le moment." },
      { status: 500 },
    );
  }
}
