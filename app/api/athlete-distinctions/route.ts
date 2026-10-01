import { NextRequest, NextResponse } from "next/server";
import {
  createAthleteDistinction,
  createAthleteDistinctionNomination,
  deleteAthleteDistinction,
  deleteAthleteDistinctionNomination,
  getDistinctionByPeriod,
  listAthleteDistinctionNominations,
  listAthleteDistinctions,
  listDistinctionNominationsByPeriod,
} from "@/lib/athlete-distinctions/service";
import { evaluateBusinessAccess, getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ATHLETE_OF_THE_MONTH_TYPE = "athlete_of_the_month";

const isValidAwardPeriod = (awardMonth: number, awardYear: number): boolean =>
  Number.isInteger(awardMonth)
  && awardMonth >= 1
  && awardMonth <= 12
  && Number.isInteger(awardYear)
  && awardYear >= 2000;

const isCompletedAwardPeriod = (awardMonth: number, awardYear: number, now = new Date()): boolean =>
  isValidAwardPeriod(awardMonth, awardYear)
  && awardYear * 12 + awardMonth < now.getFullYear() * 12 + now.getMonth() + 1;

const isAllowedAwardPeriod = (type: string, awardMonth: number, awardYear: number): boolean =>
  type === ATHLETE_OF_THE_MONTH_TYPE
    ? isCompletedAwardPeriod(awardMonth, awardYear)
    : isValidAwardPeriod(awardMonth, awardYear);

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type")?.trim() ?? "";
    const awardMonth = Number(request.nextUrl.searchParams.get("awardMonth"));
    const awardYear = Number(request.nextUrl.searchParams.get("awardYear"));
    const hasPeriodQuery = Boolean(type)
      || request.nextUrl.searchParams.has("awardMonth")
      || request.nextUrl.searchParams.has("awardYear");

    if (hasPeriodQuery) {
      const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
      if (!accessCheck.allowed) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }

      if (!type || !isAllowedAwardPeriod(type, awardMonth, awardYear)) {
        return NextResponse.json({ error: "Période invalide ou non terminée." }, { status: 400 });
      }

      const nominations = await listDistinctionNominationsByPeriod(type, awardMonth, awardYear);
      const winner = await getDistinctionByPeriod(type, awardMonth, awardYear);
      return NextResponse.json({ nominations, winner });
    }

    const athleteId = request.nextUrl.searchParams.get("athleteId")?.trim() ?? "";
    const includeNominations = request.nextUrl.searchParams.get("includeNominations") === "1";

    if (!athleteId) {
      return NextResponse.json({ error: "athleteId est obligatoire." }, { status: 400 });
    }

    const profile = await getCurrentUserAccessProfile(request);
    const role = profile?.userAccess?.role ?? null;
    const ownAthleteId = profile?.userAccess?.athleteId?.trim() ?? "";
    const effectiveAthleteId = role === "athlete" && ownAthleteId ? ownAthleteId : athleteId;

    const accessCheck = await evaluateBusinessAccess(request, {
      action: role === "athlete" ? "read:own-profile" : "read:athlete-record",
      targetAthleteId: effectiveAthleteId,
    });

    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const distinctions = await listAthleteDistinctions(effectiveAthleteId);
    if (includeNominations) {
      const nominations = await listAthleteDistinctionNominations(effectiveAthleteId);
      return NextResponse.json({ distinctions, nominations });
    }

    return NextResponse.json({ distinctions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de récupérer les distinctions." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const body = (await request.json()) as {
      action?: string;
      athleteId?: string;
      type?: string;
      awardMonth?: number | string;
      awardYear?: number | string;
      description?: string;
      reason?: string;
    };

    const action = String(body.action ?? "create-distinction").trim();

    if (action === "nominate") {
      const athleteId = String(body.athleteId ?? "").trim();
      const type = String(body.type ?? "").trim();
      const awardMonth = Number(body.awardMonth);
      const awardYear = Number(body.awardYear);
      const reason = String(body.reason ?? "").trim();

      if (!athleteId || !type || !isAllowedAwardPeriod(type, awardMonth, awardYear)) {
        return NextResponse.json({ error: "Données invalides." }, { status: 400 });
      }

      const winner = await getDistinctionByPeriod(type, awardMonth, awardYear);
      if (winner) {
        return NextResponse.json({ error: "Le vainqueur est déjà désigné pour cette période." }, { status: 409 });
      }

      const nominations = await listDistinctionNominationsByPeriod(type, awardMonth, awardYear);
      if (nominations.length >= 3) {
        return NextResponse.json({ error: "3 nominés sont déjà sélectionnés." }, { status: 409 });
      }

      const alreadyNominated = nominations.some((nomination) => nomination.athleteId === athleteId);
      if (alreadyNominated) {
        return NextResponse.json({ error: "Cet athlète est déjà nominé." }, { status: 409 });
      }

      const nomination = await createAthleteDistinctionNomination({
        athleteId,
        type,
        awardMonth,
        awardYear,
        nominatedAt: new Date().toISOString(),
        reason,
      });

      const nextNominations = await listDistinctionNominationsByPeriod(type, awardMonth, awardYear);
      return NextResponse.json({ nomination, nominations: nextNominations }, { status: 201 });
    }

    if (action === "designate-winner") {
      const athleteId = String(body.athleteId ?? "").trim();
      const type = String(body.type ?? "").trim();
      const awardMonth = Number(body.awardMonth);
      const awardYear = Number(body.awardYear);
      const description = String(body.description ?? "").trim();

      if (!athleteId || !type || !isAllowedAwardPeriod(type, awardMonth, awardYear)) {
        return NextResponse.json({ error: "Données invalides." }, { status: 400 });
      }

      const existingWinner = await getDistinctionByPeriod(type, awardMonth, awardYear);
      if (existingWinner) {
        return NextResponse.json({ error: "Le vainqueur est déjà désigné pour cette période." }, { status: 409 });
      }

      const nominations = await listDistinctionNominationsByPeriod(type, awardMonth, awardYear);
      if (nominations.length !== 3) {
        return NextResponse.json({ error: "Le vainqueur peut être désigné uniquement avec 3 nominés." }, { status: 409 });
      }

      const isAmongNominees = nominations.some((nomination) => nomination.athleteId === athleteId);
      if (!isAmongNominees) {
        return NextResponse.json({ error: "Le vainqueur doit être l’un des 3 nominés." }, { status: 400 });
      }

      const distinction = await createAthleteDistinction({
        athleteId,
        type,
        awardMonth,
        awardYear,
        awardedAt: new Date(awardYear, awardMonth - 1, 1).toISOString(),
        description,
      });

      return NextResponse.json({ distinction }, { status: 201 });
    }

    const athleteId = String(body.athleteId ?? "").trim();
    const type = String(body.type ?? "").trim();
    const awardMonth = Number(body.awardMonth);
    const awardYear = Number(body.awardYear);
    const description = String(body.description ?? "").trim();

    if (!athleteId || !type || !isAllowedAwardPeriod(type, awardMonth, awardYear)) {
      return NextResponse.json({ error: "Données invalides." }, { status: 400 });
    }

    const distinction = await createAthleteDistinction({
      athleteId,
      type,
      awardMonth,
      awardYear,
      awardedAt: new Date(awardYear, awardMonth - 1, 1).toISOString(),
      description,
    });

    return NextResponse.json({ distinction }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible d'ajouter la distinction." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const body = (await request.json()) as {
      action?: string;
      distinctionId?: string;
      nominationId?: string;
      type?: string;
      awardMonth?: number | string;
      awardYear?: number | string;
    };

    const action = String(body.action ?? "delete-distinction").trim();

    if (action === "delete-nomination") {
      const nominationId = String(body.nominationId ?? "").trim();
      const type = String(body.type ?? "").trim();
      const awardMonth = Number(body.awardMonth);
      const awardYear = Number(body.awardYear);

      if (!nominationId || !type || !isAllowedAwardPeriod(type, awardMonth, awardYear)) {
        return NextResponse.json({ error: "Données invalides." }, { status: 400 });
      }

      const winner = await getDistinctionByPeriod(type, awardMonth, awardYear);
      if (winner) {
        return NextResponse.json({ error: "Impossible de modifier les nominés après désignation du vainqueur." }, { status: 409 });
      }

      const nominations = await listDistinctionNominationsByPeriod(type, awardMonth, awardYear);
      if (!nominations.some((nomination) => nomination.id === nominationId)) {
        return NextResponse.json({ error: "Nomination introuvable pour cette période." }, { status: 404 });
      }

      const removedNomination = await deleteAthleteDistinctionNomination(nominationId);
      if (!removedNomination) {
        return NextResponse.json({ error: "Nomination introuvable." }, { status: 404 });
      }

      return NextResponse.json({ ok: true, nomination: removedNomination });
    }

    const distinctionId = String(body.distinctionId ?? "").trim();
    if (!distinctionId) {
      return NextResponse.json({ error: "distinctionId est obligatoire." }, { status: 400 });
    }

    const removed = await deleteAthleteDistinction(distinctionId);
    if (!removed) {
      return NextResponse.json({ error: "Distinction introuvable." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, distinction: removed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de supprimer la distinction." },
      { status: 500 },
    );
  }
}
