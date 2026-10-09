import { NextResponse } from "next/server";
import { loadCachedPublicKliqueStats, type PublicKliqueStats } from "@/lib/public-klique-stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  loadStats: () => Promise<PublicKliqueStats>;
};

const defaultDependencies: HandlerDependencies = {
  loadStats: loadCachedPublicKliqueStats,
};

export const createPublicKliqueStatsHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    if (request.method !== "GET") {
      return NextResponse.json(
        { error: "Méthode non autorisée." },
        { status: 405, headers: { Allow: "GET" } },
      );
    }
    if ([...new URL(request.url).searchParams.keys()].length > 0) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }

    try {
      const stats = await dependencies.loadStats();
      const response: PublicKliqueStats = {
        athleteCount: stats.athleteCount,
        partnerExpertCount: stats.partnerExpertCount,
        sportCount: stats.sportCount,
        creativeCount: stats.creativeCount,
      };
      if (Object.values(response).some((value) => !Number.isSafeInteger(value) || value < 0)) {
        throw new Error("Compteurs publics invalides.");
      }
      return NextResponse.json(response, {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      });
    } catch {
      return NextResponse.json(
        { error: "Une erreur interne est survenue." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
});

const handlers = createPublicKliqueStatsHandlers();
export const GET = handlers.GET;