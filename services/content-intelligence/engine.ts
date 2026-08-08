import type { CreationPreparationPayload } from "@/services/content-creation-assistant";
import { ContentGenerationError, toContentGenerationError } from "@/services/content-generation/errors";
import { contentIntelligenceConfig } from "@/services/content-intelligence/config";
import { buildContentGenerationRequest } from "@/services/content-intelligence/context-builder";
import { buildContentPrompt } from "@/services/content-intelligence/prompt-builder";
import { OpenAIProvider } from "@/services/content-intelligence/providers/openai-provider";
import type { ContentGenerationProvider } from "@/services/content-intelligence/provider";
import { resolveTemplate } from "@/services/content-intelligence/templates";
import type {
  AnyContentGenerationRequest,
  AnyContentGenerationResult,
  InterviewGenerationRequest,
  InterviewGenerationResult,
  PublicationAngleSuggestion,
  PublicationGenerationRequest,
  PublicationGenerationResult,
  PublicationRegenerateOneResult,
  ReelGenerationRequest,
  ReelGenerationResult,
} from "@/types/content-generation";

const resolveProvider = (): ContentGenerationProvider => {
  if (contentIntelligenceConfig.defaultProvider === "openai") {
    return new OpenAIProvider();
  }
  throw new ContentGenerationError("PROVIDER_NOT_CONFIGURED", "Aucun provider configure");
};

const mergeMissingInformation = (result: AnyContentGenerationResult, missingInformation: string[]): AnyContentGenerationResult => {
  return {
    ...result,
    metadata: {
      ...result.metadata,
      missingInformation: Array.from(new Set([...result.metadata.missingInformation, ...missingInformation])),
    },
  };
};

const attemptGenerate = async (
  provider: ContentGenerationProvider,
  request: AnyContentGenerationRequest,
  missingInformation: string[],
  correctionFeedback?: string
) => {
  const template = resolveTemplate(request.template.key);
  if (!template) {
    throw new ContentGenerationError("INVALID_REQUEST", "Template introuvable");
  }

  const prompt = buildContentPrompt({
    request,
    template,
    promptVersion: contentIntelligenceConfig.promptVersion,
  });

  const result = await provider.generateJson({ request, prompt, correctionFeedback });
  return mergeMissingInformation(result, missingInformation);
};

export const shouldRetryGenerationError = (error: ContentGenerationError): boolean => {
  if (error.code === "INVALID_PROVIDER_RESPONSE") return true;
  if (error.code === "INCOMPLETE_PROVIDER_RESPONSE") return true;
  return false;
};

const buildCorrectionFeedback = (error: ContentGenerationError, questionCount: number): string => {
  return [
    "La sortie precedente ne respecte pas les contraintes requises.",
    questionCount > 0 ? `Nombre de questions attendu: ${questionCount}.` : "Nombre de propositions attendu: 3.",
    `Erreur detectee: ${error.message}`,
    "Corrige uniquement ces erreurs et renvoie strictement une sortie valide selon le schema fourni.",
  ].join(" ");
};

export function runContentIntelligenceEngine(payload: CreationPreparationPayload & { objective: { id: "interview" } }): Promise<{
  request: InterviewGenerationRequest;
  result: InterviewGenerationResult;
}>;
export function runContentIntelligenceEngine(payload: CreationPreparationPayload & { objective: { id: "publication" } }): Promise<{
  request: PublicationGenerationRequest;
  result: PublicationGenerationResult;
}>;
export function runContentIntelligenceEngine(payload: CreationPreparationPayload & { objective: { id: "reel" } }): Promise<{
  request: ReelGenerationRequest;
  result: ReelGenerationResult;
}>;
export function runContentIntelligenceEngine(payload: CreationPreparationPayload): Promise<{
  request: AnyContentGenerationRequest;
  result: AnyContentGenerationResult;
}>;
export async function runContentIntelligenceEngine(payload: CreationPreparationPayload): Promise<{
  request: AnyContentGenerationRequest;
  result: AnyContentGenerationResult;
}> {
  try {
    const { request, missingInformation } = await buildContentGenerationRequest(payload);
    const provider = resolveProvider();

    let lastError: unknown = null;
    let correctionFeedback: string | undefined;
    for (let attempt = 0; attempt <= contentIntelligenceConfig.maxInvalidJsonRetries; attempt += 1) {
      try {
        const result = await attemptGenerate(provider, request, missingInformation, correctionFeedback);
        return { request, result };
      } catch (error) {
        lastError = error;
        if (!(error instanceof ContentGenerationError) || !shouldRetryGenerationError(error)) {
          throw error;
        }
        if (attempt >= contentIntelligenceConfig.maxInvalidJsonRetries) {
          throw error;
        }
        correctionFeedback = buildCorrectionFeedback(error, request.requestType === "interview" ? request.brief.questionCount : 0);
      }
    }

    throw lastError instanceof Error ? lastError : new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Reponse invalide du fournisseur");
  } catch (error) {
    throw toContentGenerationError(error);
  }
}

export const runPublicationAngleSuggestionsEngine = async (request: PublicationGenerationRequest): Promise<PublicationAngleSuggestion[]> => {
  try {
    const provider = resolveProvider();
    const angleContext = {
      contentType: "publication",
      subject: {
        displayName: request.context.displayName,
        subjectType: request.context.subjectType,
        sport: request.context.sport,
        disciplineOrPosition: request.context.disciplineOrPosition,
        clubOrOrganization: request.context.clubOrOrganization,
      },
      objective: {
        id: request.brief.objective,
        customObjective: request.brief.customObjective,
      },
      context: {
        knownFacts: request.context.knownFacts,
        internalFacts: request.context.internalFacts,
        externalVerifiedFacts: request.context.externalVerifiedFacts,
        userProvidedContextItems: request.context.userProvidedContextItems,
        editorialLeads: request.context.editorialLeads,
        selectedContextItems: request.selectedContextItems,
      },
    };

    const prompt = [
      "Mission: proposer 3 a 5 angles editoriaux contextualises.",
      "Contraintes:",
      "- Utiliser uniquement le sujet, sport/secteur, objectif et faits disponibles.",
      "- Eviter toute invention de faits.",
      "- Chaque angle doit etre concret, actionnable et distinct.",
      "- Eviter les angles vagues, creux ou interchangeables.",
      "- Eviter les formulations de type introduction d interview.",
      "- Prioriser les faits reels disponibles et l enjeu editorial du moment.",
      "- Adapter les angles a la plateforme cible, au ton et au public vise.",
      "- Varier les traitements: informationnel, storytelling humain, social engageant.",
      "- Repondre strictement au schema JSON impose.",
      "Contexte:",
      JSON.stringify(angleContext, null, 2),
    ].join("\n\n");

    return await provider.generatePublicationAngles({ request, prompt });
  } catch (error) {
    throw toContentGenerationError(error);
  }
};

export const runPublicationRegenerateOneEngine = async (args: {
  request: PublicationGenerationRequest;
  result: PublicationGenerationResult;
  proposalId: string;
}): Promise<PublicationRegenerateOneResult> => {
  try {
    const provider = resolveProvider();
    return await provider.regeneratePublicationProposal(args);
  } catch (error) {
    throw toContentGenerationError(error);
  }
};

export const mapContentGenerationErrorToStatus = (error: ContentGenerationError): number => {
  if (error.code === "INVALID_REQUEST") return 400;
  if (error.code === "INVALID_VARIATION_REQUEST") return 400;
  if (error.code === "MISSING_SUBJECT") return 400;
  if (error.code === "SOURCE_DOCUMENT_MISSING") return 400;
  if (error.code === "VARIATION_TEMPLATE_NOT_FOUND") return 400;
  if (error.code === "PROVIDER_NOT_CONFIGURED") return 503;
  if (error.code === "PROVIDER_NOT_AVAILABLE") return 503;
  if (error.code === "RATE_LIMITED") return 429;
  if (error.code === "PROVIDER_REFUSAL") return 422;
  if (error.code === "EMPTY_PROVIDER_RESPONSE") return 502;
  if (error.code === "INCOMPLETE_PROVIDER_RESPONSE") return 502;
  if (error.code === "INVALID_PROVIDER_RESPONSE") return 502;
  if (error.code === "INVALID_VARIATION_RESPONSE") return 502;
  if (error.code === "VARIATION_GENERATION_FAILED") return 502;
  if (error.code === "QUOTE_NOT_FOUND") return 422;
  return 500;
};
