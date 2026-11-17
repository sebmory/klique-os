import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type {
  ContextCollectionResponse,
  ManualEditorialMaterial,
} from "@/types/context-intelligence";
import { collectContextIntelligence, toContextCollectionErrorResponse } from "@/services/context-intelligence/collector";
import { validateContextCollectionRequest } from "@/services/context-intelligence/request-validation";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import {
  createEditorialContextCollection,
  projectEditorialCollectionForAccess,
} from "@/services/context-intelligence/collection-service";
import { ContextCollectionError } from "@/services/context-intelligence/errors";
import { PostgresSportsWatchRepository } from "@/lib/sports-watch/repository";
import {
  buildCandidateProvenance,
  buildSportsWatchArticleMaterials,
} from "@/lib/sports-watch/service";
import { buildSportsWatchTournamentGroups } from "@/lib/sports-watch/presentation";
import { buildTournamentInterviewMaterials } from "@/services/tournament-interview";
import type {
  SportsWatchCandidate,
  SportsWatchInterviewTournament,
} from "@/types/sports-watch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const buildTrustedSportsWatchMaterials = (
  candidates: SportsWatchCandidate[],
  candidateIds: string[],
): ManualEditorialMaterial[] => {
  const selectedIds = new Set(candidateIds);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const tournamentMaterials = buildSportsWatchTournamentGroups(candidates)
    .flatMap((group): ManualEditorialMaterial[] => {
      const matches = group.disciplines.flatMap((discipline) =>
        discipline.matches.filter((match) => match.countedInSummary));
      const selectedMatchIds = matches
        .map((match) => match.candidate.id)
        .filter((candidateId) => selectedIds.has(candidateId));
      if (selectedMatchIds.length === 0) return [];

      const firstMatch = matches[0];
      const tournamentId = firstMatch
        ? new URL(firstMatch.candidate.articleUrl).searchParams.get("id")
        : null;
      const tournament: SportsWatchInterviewTournament = {
        id: group.key,
        tournamentId,
        title: group.competitionName,
        sourceName: group.sourceName,
        sourceUrl: group.sourceUrl,
        eventDateFrom: group.eventDateFrom,
        eventDateTo: group.eventDateTo,
        coveragePartial: group.unstructuredCount > 0,
        coverageNote: null,
        allCandidateIds: matches.map((match) => match.candidate.id),
        disciplines: group.disciplines.map((discipline) => ({
          discipline: discipline.discipline,
          matches: discipline.matches
            .filter((match) => match.countedInSummary)
            .map((match) => ({
              candidateId: match.candidate.id,
              title: match.candidate.title,
              discipline: match.discipline,
              tableau: match.eventCode,
              round: match.round,
              partner: match.partner,
              opponents: match.opponents,
              outcome: match.outcome,
              outcomeLabel: match.outcomeLabel,
              athleteScore: match.athleteScore,
              eventDate: match.candidate.eventDateFrom,
              sourceName: match.candidate.sourceName,
              sourceUrl: match.candidate.articleUrl,
              verificationStatus: match.candidate.verificationStatus,
              materials: [],
            })),
        })),
      };
      selectedMatchIds.forEach((candidateId) => selectedIds.delete(candidateId));
      return buildTournamentInterviewMaterials(tournament, selectedMatchIds);
    });
  const otherMaterials = Array.from(selectedIds).flatMap((candidateId) => {
    const candidate = candidatesById.get(candidateId);
    if (!candidate) {
      throw new ContextCollectionError(
        "INVALID_CONTEXT_REQUEST",
        "Un match Sports Watch n’est pas accessible pour ce profil dans cet espace.",
      );
    }
    const sourceDate = candidate.eventDateFrom
      ?? candidate.publicationDate?.slice(0, 10)
      ?? candidate.collectedAt.slice(0, 10);
    return buildSportsWatchArticleMaterials(
      candidate,
      buildCandidateProvenance(candidate),
      sourceDate,
      [
        `Athlète associé : ${candidate.athleteName}.`,
        candidate.resultKind === "collective_result"
          ? "Résultat collectif, sans participation individuelle déduite."
          : "",
        `Actualité : ${candidate.title}.`,
        candidate.excerpt,
      ].filter(Boolean).join(" "),
    );
  });
  return [...tournamentMaterials, ...otherMaterials];
};

export async function POST(request: Request) {
  try {
    const accessContext = await requireContentAccess(request);
    const body = await request.json() as Record<string, unknown>;
    const validatedPayload = validateContextCollectionRequest(body);
    const sportsWatchCandidateIds = body.sportsWatchCandidateIds;
    if (
      sportsWatchCandidateIds !== undefined
      && (
        !Array.isArray(sportsWatchCandidateIds)
        || sportsWatchCandidateIds.length > 12
        || sportsWatchCandidateIds.some((id) =>
          typeof id !== "string"
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
      )
    ) {
      throw new ContextCollectionError(
        "INVALID_CONTEXT_REQUEST",
        "La sélection Sports Watch est invalide.",
      );
    }
    const trustedSportsWatchMaterials: ManualEditorialMaterial[] = [];
    if (Array.isArray(sportsWatchCandidateIds) && sportsWatchCandidateIds.length > 0) {
      if (!validatedPayload.subject.id) {
        throw new ContextCollectionError(
          "INVALID_CONTEXT_REQUEST",
          "Un profil CRM est requis pour utiliser le contexte Sports Watch.",
        );
      }
      const candidates = await PostgresSportsWatchRepository.getInterviewCandidates(
        accessContext.workspaceId,
        validatedPayload.subject.id,
        sportsWatchCandidateIds[0],
      );
      const accessibleIds = new Set(candidates.map((candidate) => candidate.id));
      if (sportsWatchCandidateIds.some((candidateId) => !accessibleIds.has(candidateId))) {
        throw new ContextCollectionError(
          "INVALID_CONTEXT_REQUEST",
          "Un match Sports Watch n’est pas accessible pour ce profil dans cet espace.",
        );
      }
      trustedSportsWatchMaterials.push(
        ...buildTrustedSportsWatchMaterials(candidates, sportsWatchCandidateIds),
      );
    }
    const payload = {
      ...validatedPayload,
      manualEditorialMaterials: [
        ...(validatedPayload.manualEditorialMaterials ?? []).filter(
          (material) => !material.id.startsWith("sports-watch-"),
        ),
        ...trustedSportsWatchMaterials,
      ],
      workspaceId: accessContext.workspaceId,
      subject: {
        ...validatedPayload.subject,
        workspaceId: accessContext.workspaceId,
      },
    };
    const usageContext = {
      workspaceId: accessContext.workspaceId,
      clerkUserId: accessContext.clerkUserId,
      role: accessContext.role,
      mediaId: accessContext.mediaId,
      requestGroupId: randomUUID(),
    };
    const response = await collectContextIntelligence(payload, usageContext);

    if (!response.ok) {
      return NextResponse.json(response satisfies ContextCollectionResponse, {
        status:
          response.code === "INVALID_CONTEXT_REQUEST"
            ? 400
            : response.code === "AI_CREDIT_INSUFFICIENT" || response.code === "AI_CREDIT_NO_ACTIVE_PERIOD"
              ? 402
              : 502,
      });
    }

    const securedResponse = projectEditorialCollectionForAccess(response, accessContext);
    const collection = await createEditorialContextCollection(securedResponse, accessContext);
    return NextResponse.json({
      ...securedResponse,
      collectionId: collection.id,
      expiresAt: collection.expiresAt,
    } satisfies ContextCollectionResponse);
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    const response = toContextCollectionErrorResponse(error);
    return NextResponse.json(response satisfies ContextCollectionResponse, {
      status:
        response.code === "INVALID_CONTEXT_REQUEST"
          ? 400
          : response.code === "AI_CREDIT_INSUFFICIENT" || response.code === "AI_CREDIT_NO_ACTIVE_PERIOD"
            ? 402
            : 500,
    });
  }
}
