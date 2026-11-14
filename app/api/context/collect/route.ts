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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

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
      for (const candidateId of sportsWatchCandidateIds) {
        const candidates = await PostgresSportsWatchRepository.getInterviewCandidates(
          accessContext.workspaceId,
          validatedPayload.subject.id,
          candidateId,
        );
        const candidate = candidates[0];
        if (!candidate || candidate.id !== candidateId) {
          throw new ContextCollectionError(
            "INVALID_CONTEXT_REQUEST",
            "Un match Sports Watch n’est pas accessible pour ce profil dans cet espace.",
          );
        }
        const sourceDate = candidate.eventDateFrom
          ?? candidate.publicationDate?.slice(0, 10)
          ?? candidate.collectedAt.slice(0, 10);
        trustedSportsWatchMaterials.push(...buildSportsWatchArticleMaterials(
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
        ));
      }
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
