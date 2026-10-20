import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import type { IntroductionActor } from "@/lib/partner-athlete-introductions/contracts";
import {
  PartnerAthleteIntroductionConflictError,
  PartnerAthleteIntroductionForbiddenError,
  PartnerAthleteIntroductionNotFoundError,
  PartnerAthleteIntroductionValidationError,
} from "@/lib/partner-athlete-introductions/service";

export const getServerIntroductionActor = async (
  request: Request,
): Promise<IntroductionActor | null> => {
  const profile = await getCurrentUserAccessProfile(request);
  const access = profile?.userAccess;
  const clerkUserId = profile?.clerkUser.id?.trim() ?? "";
  const workspaceId = access?.workspaceId?.trim() ?? "";
  if (!access || !clerkUserId || !workspaceId) return null;
  return {
    clerkUserId,
    role: access.role,
    status: access.status,
    workspaceId,
    athleteId: access.athleteId?.trim() || null,
    partnerId: access.partnerId?.trim() || null,
  };
};

export const introductionErrorResponse = (error: unknown) => {
  if (error instanceof PartnerAthleteIntroductionValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof PartnerAthleteIntroductionForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof PartnerAthleteIntroductionNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof PartnerAthleteIntroductionConflictError) {
    return NextResponse.json(
      { error: error.message, conflict: error.outcome },
      { status: 409 },
    );
  }
  console.error(
    `[partner_athlete_introduction] ${error instanceof Error ? error.message : String(error)}`,
  );
  return NextResponse.json(
    { error: "Impossible de traiter la mise en relation pour le moment." },
    { status: 500 },
  );
};

export const readIdempotencyKey = (request: Request): string =>
  request.headers.get("Idempotency-Key")?.trim() ?? "";
