import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GenerateContentApiError, GenerateContentApiRequest, GenerateContentApiSuccess } from "@/types/content-generation";
import { ContentGenerationError } from "@/services/content-generation/errors";
import {
  runContentIntelligenceEngine,
  mapContentGenerationErrorToStatus,
  runPublicationAngleSuggestionsEngine,
  runPublicationRegenerateOneEngine,
} from "@/services/content-intelligence/engine";
import { validateCreationPayload } from "@/services/content-generation/validation";
import { buildContentGenerationRequest } from "@/services/content-intelligence/context-builder";
import { runContentVariationEngine } from "@/services/content-intelligence/variation-engine";
import { validateVariationRequest } from "@/services/content-variants/request-validation";
import type { PublicationGenerationRequest, PublicationGenerationResult } from "@/types/content-generation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PublicationInvalidResponseDiagnostics = {
  errorMessage: string;
  errorCode: string;
  stage: "parsing" | "schema" | "publication-validator" | "unknown";
  rejectedByRule: string;
  outputTextLength: number;
  parsedIsObject: boolean;
  rawProposalsCount: number;
  proposalFieldsPresence: Array<{
    index: number;
    hasHook: boolean;
    hasText: boolean;
    hasCtaField: boolean;
    hasHashtagsField: boolean;
    hasVisualSuggestion: boolean;
    hasEditorialNote: boolean;
  }>;
};

type ContentGenerationErrorWithPublicationDiagnostics = ContentGenerationError & {
  publicationInvalidResponseDiagnostics?: PublicationInvalidResponseDiagnostics;
};

const isDevelopment = process.env.NODE_ENV !== "production";

const inferPublicationDiagnosticStage = (message: string): PublicationInvalidResponseDiagnostics["stage"] => {
  if (message.includes("Reponse structuree impossible a parser")) return "parsing";
  if (
    message.includes("Structure JSON invalide") ||
    message.includes("Champs publication essentiels vides") ||
    message.includes("Nombre de propositions invalide") ||
    message.includes("Metadata template incoherentes") ||
    message.includes("Proposition de publication invalide")
  ) {
    return "schema";
  }
  if (
    message.includes("Longueur invalide") ||
    message.includes("Traitement editorial invalide") ||
    message.includes("Version social/impact") ||
    message.includes("Version storytelling/humaine") ||
    message.includes("Version editoriale/factuelle") ||
    message.includes("trop similaires editorialement") ||
    message.includes("meme ouverture") ||
    message.includes("Formulation generique") ||
    message.includes("formulee comme une interview") ||
    message.includes("Questions rhetoriques") ||
    message.includes("Rythme artificiel") ||
    message.includes("Texte trop repetitif") ||
    message.includes("Texte trop generique")
  ) {
    return "publication-validator";
  }
  return "unknown";
};

const inferPublicationRejectedRule = (message: string): string => {
  if (message.includes("Reponse structuree impossible a parser")) return "OpenAIProvider.generateJson.JSON.parse";
  if (message.includes("Longueur invalide")) return "publication-validator.validateLength";
  if (message.includes("Traitement editorial invalide")) return "publication-validator.validateTreatmentTag";
  if (message.includes("trop similaires editorialement") || message.includes("meme ouverture")) {
    return "publication-validator.validateDistinctTreatments";
  }
  if (
    message.includes("Version social/impact") ||
    message.includes("Version storytelling/humaine") ||
    message.includes("Version editoriale/factuelle")
  ) {
    return "publication-validator.validateTreatmentStructure";
  }
  if (
    message.includes("Formulation generique") ||
    message.includes("formulee comme une interview") ||
    message.includes("Questions rhetoriques") ||
    message.includes("Rythme artificiel") ||
    message.includes("Texte trop repetitif") ||
    message.includes("Texte trop generique")
  ) {
    return "publication-validator.validateNonGenericQuality";
  }
  if (message.includes("Proposition de publication invalide")) {
    return "publication-validator.normalizeProposal.required-fields";
  }
  return "unknown";
};

const resolvePublicationDiagnostics = (error: ContentGenerationError): PublicationInvalidResponseDiagnostics => {
  const enriched = error as ContentGenerationErrorWithPublicationDiagnostics;
  if (enriched.publicationInvalidResponseDiagnostics) {
    return enriched.publicationInvalidResponseDiagnostics;
  }

  return {
    errorMessage: error.message,
    errorCode: error.code,
    stage: inferPublicationDiagnosticStage(error.message),
    rejectedByRule: inferPublicationRejectedRule(error.message),
    outputTextLength: 0,
    parsedIsObject: false,
    rawProposalsCount: 0,
    proposalFieldsPresence: [],
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateContentApiRequest;

    if (body?.operation === "publication_angles") {
      const payload = validateCreationPayload(body?.payload);
      const { request: generationRequest } = await buildContentGenerationRequest(payload);
      if (generationRequest.requestType !== "publication") {
        throw new ContentGenerationError("INVALID_REQUEST", "Operation reservee aux publications");
      }

      const suggestions = await runPublicationAngleSuggestionsEngine(generationRequest as PublicationGenerationRequest);
      return NextResponse.json({
        ok: true,
        operation: "publication_angles",
        result: { suggestions },
      });
    }

    if (body?.operation === "publication_regenerate_one") {
      const publicationRequest = body.publication?.request;
      const publicationResult = body.publication?.result;
      const proposalId = String(body.publication?.proposalId ?? "").trim();

      if (!publicationRequest || publicationRequest.requestType !== "publication") {
        throw new ContentGenerationError("INVALID_REQUEST", "Requete publication invalide");
      }
      if (!publicationResult || !Array.isArray(publicationResult.proposals)) {
        throw new ContentGenerationError("INVALID_REQUEST", "Resultat publication invalide");
      }
      if (!proposalId) {
        throw new ContentGenerationError("INVALID_REQUEST", "Proposition cible manquante");
      }

      const regenerated = await runPublicationRegenerateOneEngine({
        request: publicationRequest as PublicationGenerationRequest,
        result: publicationResult as PublicationGenerationResult,
        proposalId,
      });

      return NextResponse.json({
        ok: true,
        operation: "publication_regenerate_one",
        result: regenerated,
      });
    }

    if (body?.operation === "variation") {
      const variation = validateVariationRequest(body?.variation);
      const result = await runContentVariationEngine(variation);

      return NextResponse.json({
        ok: true,
        operation: "variation",
        result,
      });
    }

    const payload = validateCreationPayload(body?.payload);

    const output = await runContentIntelligenceEngine(payload);

    const response: GenerateContentApiSuccess = {
      ok: true,
      request: output.request,
      result: output.result,
    };

    return NextResponse.json(response);
  } catch (error) {
    const normalized =
      error instanceof ContentGenerationError
        ? error
        : new ContentGenerationError("GENERATION_FAILED", "Impossible de generer le contenu");

    if (isDevelopment && normalized.code === "INVALID_PROVIDER_RESPONSE") {
      const diagnostics = resolvePublicationDiagnostics(normalized);
      const outputPath = path.join(process.cwd(), "tests", "debug", "publication-invalid-response.json");
      try {
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, `${JSON.stringify(diagnostics, null, 2)}\n`, "utf-8");
      } catch (writeError) {
        console.error("CIE publication diagnostics write failure", {
          message: writeError instanceof Error ? writeError.message : "Echec ecriture fichier diagnostic",
        });
      }
    }

    console.error("CIE route failure", {
      code: normalized.code,
      message: normalized.message,
    });

    const response: GenerateContentApiError = {
      ok: false,
      code: normalized.code,
      message:
        normalized.code === "INVALID_VARIATION_REQUEST"
          ? "La requete de declinaison est invalide."
          : normalized.code === "SOURCE_DOCUMENT_MISSING"
            ? "Le document source est introuvable ou incomplet."
            : normalized.code === "VARIATION_TEMPLATE_NOT_FOUND"
              ? "Le type de declinaison n est pas supporte."
              : normalized.code === "INVALID_VARIATION_RESPONSE"
                ? "Le moteur a renvoye une declinaison invalide."
                : normalized.code === "VARIATION_GENERATION_FAILED"
                  ? normalized.message || "Le moteur n a pas pu produire la declinaison demandee."
                  : normalized.code === "QUOTE_NOT_FOUND"
                    ? "Aucune citation directe exploitable n a ete trouvee dans ce document."
                    : normalized.code === "PROVIDER_NOT_AVAILABLE"
                      ? "Le fournisseur de declinaisons n est pas disponible."
                      :
        normalized.code === "PROVIDER_NOT_CONFIGURED"
          ? "La generation intelligente n est pas encore configuree"
          : normalized.code === "RATE_LIMITED"
            ? "Limite atteinte. Reessayez dans quelques instants."
            : normalized.code === "PROVIDER_REFUSAL"
              ? "Le modele a refuse de generer ce contenu."
              : normalized.code === "EMPTY_PROVIDER_RESPONSE"
                ? "Le fournisseur a renvoye une sortie vide."
                : normalized.code === "INCOMPLETE_PROVIDER_RESPONSE"
                  ? "Le fournisseur a renvoye une sortie incomplete."
            : normalized.code === "INVALID_PROVIDER_RESPONSE"
              ? "Le moteur a renvoye une reponse invalide."
              : normalized.message,
    };

    return NextResponse.json(response, { status: mapContentGenerationErrorToStatus(normalized) });
  }
}