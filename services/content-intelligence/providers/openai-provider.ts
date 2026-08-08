import { ContentGenerationError } from "@/services/content-generation/errors";
import { contentIntelligenceConfig } from "@/services/content-intelligence/config";
import { buildInterviewGenerationJsonSchema } from "@/services/content-intelligence/interview-schema";
import {
  buildPublicationAnglesJsonSchema,
  buildPublicationGenerationJsonSchema,
  buildPublicationSingleProposalJsonSchema,
} from "@/services/content-intelligence/publication-schema";
import { buildReelGenerationJsonSchema } from "@/services/content-intelligence/reel-schema";
import type { ContentGenerationProvider, ProviderGenerateArgs } from "@/services/content-intelligence/provider";
import { validateContentGenerationJson } from "@/services/content-intelligence/json-validator";
import {
  validatePublicationAnglesJson,
  validatePublicationGenerationJson,
  validatePublicationSingleProposalJson,
} from "@/services/content-intelligence/publication-validator";
import { validateReelGenerationJson } from "@/services/content-intelligence/reel-validator";
import type {
  AnyContentGenerationResult,
  PublicationAngleSuggestion,
  PublicationGenerationRequest,
  PublicationGenerationResult,
  PublicationRegenerateOneResult,
} from "@/types/content-generation";
import OpenAI from "openai";
import type { Response } from "openai/resources/responses/responses";

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

const systemInstructions = [
  "Tu es le Content Intelligence Engine de KLIQUE OS.",
  "N invente jamais un fait absent.",
  "N invente jamais de statistiques, clubs, resultats, partenaires, citations, actualites, blessures ou transferts.",
  "Si une information est absente, pose une question generique et prudente.",
].join(" ");

const isDevelopment = process.env.NODE_ENV !== "production";

const extractRefusal = (response: Response): string | null => {
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type === "refusal" && part.refusal.trim()) {
        return part.refusal.trim();
      }
    }
  }
  return null;
};

const buildDiagnostics = (response: Response, outputText: string) => {
  const refusal = extractRefusal(response);
  return {
    responseId: response.id,
    status: response.status,
    hasOutputText: outputText.length > 0,
    outputTextLength: outputText.length,
    outputItemsCount: Array.isArray(response.output) ? response.output.length : 0,
    hasRefusal: Boolean(refusal),
    hasIncompleteDetails: Boolean(response.incomplete_details),
    incompleteReason: response.incomplete_details?.reason ?? null,
  };
};

const buildValidationDiagnostics = (responseId: string, parsed: unknown, outputText: string) => {
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const questions = obj?.questions;
  const missingFields: string[] = [];

  if (!obj || !String(obj.title ?? "").trim()) missingFields.push("title");
  if (!obj || !String(obj.editorialAngle ?? "").trim()) missingFields.push("editorialAngle");
  if (!obj || !String(obj.introduction ?? "").trim()) missingFields.push("introduction");
  if (!Array.isArray(questions)) missingFields.push("questions");
  if (!obj || !String(obj.conclusion ?? "").trim()) missingFields.push("conclusion");

  return {
    responseId,
    hasOutputText: outputText.length > 0,
    outputTextLength: outputText.length,
    parsed: Boolean(obj),
    questionsIsArray: Array.isArray(questions),
    questionCount: Array.isArray(questions) ? questions.length : 0,
    missingFields,
  };
};

const classifyPublicationInvalidResponse = (message: string): {
  stage: "parsing" | "schema" | "publication-validator" | "unknown";
  rule: string;
} => {
  if (message.includes("Reponse structuree impossible a parser")) {
    return { stage: "parsing", rule: "OpenAIProvider.generateJson.JSON.parse" };
  }

  if (message.includes("Structure JSON invalide")) {
    return { stage: "schema", rule: "publication-validator.parseProviderJson/object-shape" };
  }

  if (message.includes("Champs publication essentiels vides")) {
    return { stage: "schema", rule: "publication-validator.required.title+selectedAngle" };
  }

  if (message.includes("Nombre de propositions invalide")) {
    return { stage: "schema", rule: "publication-validator.required.proposals-count" };
  }

  if (message.includes("Metadata template incoherentes")) {
    return { stage: "schema", rule: "publication-validator.required.metadata" };
  }

  if (message.includes("Proposition de publication invalide")) {
    return { stage: "schema", rule: "publication-validator.normalizeProposal.required-fields" };
  }

  if (message.includes("Longueur invalide")) {
    return { stage: "publication-validator", rule: "publication-validator.validateLength" };
  }

  if (message.includes("Traitement editorial invalide")) {
    return { stage: "publication-validator", rule: "publication-validator.validateTreatmentTag" };
  }

  if (message.includes("trop similaires editorialement") || message.includes("meme ouverture")) {
    return { stage: "publication-validator", rule: "publication-validator.validateDistinctTreatments" };
  }

  if (
    message.includes("Version social/impact") ||
    message.includes("Instagram exige") ||
    message.includes("Emojis non autorises") ||
    message.includes("Version storytelling/humaine") ||
    message.includes("Version editoriale/factuelle")
  ) {
    return { stage: "publication-validator", rule: "publication-validator.validateTreatmentStructure" };
  }

  if (
    message.includes("Formulation generique") ||
    message.includes("formulee comme une interview") ||
    message.includes("Questions rhetoriques") ||
    message.includes("Rythme artificiel") ||
    message.includes("Texte trop repetitif") ||
    message.includes("Texte trop generique")
  ) {
    return { stage: "publication-validator", rule: "publication-validator.validateNonGenericQuality" };
  }

  return { stage: "unknown", rule: "unknown" };
};

const buildPublicationValidationDiagnostics = (args: {
  responseId: string;
  parsed: unknown;
  outputText: string;
  error: ContentGenerationError;
}) => {
  const classification = classifyPublicationInvalidResponse(args.error.message);
  const obj = args.parsed && typeof args.parsed === "object" ? (args.parsed as Record<string, unknown>) : null;
  const rawProposals = Array.isArray(obj?.proposals) ? (obj?.proposals as unknown[]) : [];

  const proposalFieldsPresence = rawProposals.slice(0, 3).map((proposal, index) => {
    const item = proposal && typeof proposal === "object" ? (proposal as Record<string, unknown>) : null;
    return {
      index,
      hasHook: Boolean(String(item?.hook ?? "").trim()),
      hasText: Boolean(String(item?.text ?? "").trim()),
      hasCtaField: item ? Object.prototype.hasOwnProperty.call(item, "cta") : false,
      hasHashtagsField: item ? Object.prototype.hasOwnProperty.call(item, "hashtags") : false,
      hasVisualSuggestion: Boolean(String(item?.visualSuggestion ?? "").trim()),
      hasEditorialNote: Boolean(String(item?.editorialNote ?? "").trim()),
    };
  });

  return {
    errorName: args.error.name,
    errorMessage: args.error.message,
    errorCode: args.error.code,
    stage: classification.stage,
    rejectedByRule: classification.rule,
    responseId: args.responseId,
    outputTextLength: args.outputText.length,
    parsedIsObject: Boolean(obj),
    topLevelKeys: obj ? Object.keys(obj).slice(0, 20) : [],
    rawProposalsCount: rawProposals.length,
    proposalFieldsPresence,
  };
};

const attachPublicationDiagnosticsToError = (
  error: ContentGenerationError,
  diagnostics: PublicationInvalidResponseDiagnostics
): ContentGenerationError => {
  const enriched = error as ContentGenerationErrorWithPublicationDiagnostics;
  enriched.publicationInvalidResponseDiagnostics = diagnostics;
  return enriched;
};

export class OpenAIProvider implements ContentGenerationProvider {
  id = "openai";
  model: string;
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY || "";
    const configuredBaseUrl = process.env.OPENAI_API_URL
      ? process.env.OPENAI_API_URL.replace(/\/chat\/completions\/?$/i, "")
      : undefined;
    this.model = contentIntelligenceConfig.defaultModel;

    if (!apiKey) {
      throw new ContentGenerationError("PROVIDER_NOT_CONFIGURED", "La generation intelligente n est pas encore configuree");
    }

    this.client = new OpenAI({
      apiKey,
      ...(configuredBaseUrl ? { baseURL: configuredBaseUrl } : {}),
    });
  }

  async generateJson(args: ProviderGenerateArgs): Promise<AnyContentGenerationResult> {
    const requestStartedAt = Date.now();

    try {
      const response = await this.client.responses.create({
        model: this.model,
        instructions: systemInstructions,
        input: args.correctionFeedback
          ? `${args.prompt}\n\nCorrection obligatoire:\n${args.correctionFeedback}`
          : args.prompt,
        text: {
          format: {
            type: "json_schema",
            name:
              args.request.requestType === "publication"
                ? "publication_generation_result"
                : args.request.requestType === "reel"
                  ? "reel_generation_result"
                  : "interview_generation_result",
            strict: true,
            schema: (() => {
              if (args.request.requestType === "publication") return buildPublicationGenerationJsonSchema();
              if (args.request.requestType === "reel") return buildReelGenerationJsonSchema();
              return buildInterviewGenerationJsonSchema(args.request.brief.questionCount);
            })(),
          },
        },
      });

      const outputText = typeof response.output_text === "string" ? response.output_text.trim() : "";
      const diagnostics = buildDiagnostics(response, outputText);

      if (isDevelopment) {
        console.info("CIE provider diagnostics", diagnostics);
      }

      const refusal = extractRefusal(response);
      if (refusal) {
        throw new ContentGenerationError("PROVIDER_REFUSAL", "Le modele a refuse de generer ce contenu");
      }

      if (response.status === "incomplete") {
        const reason = response.incomplete_details?.reason ? ` (${response.incomplete_details.reason})` : "";
        throw new ContentGenerationError("INCOMPLETE_PROVIDER_RESPONSE", `Sortie incomplete du fournisseur${reason}`);
      }

      if (!outputText) {
        throw new ContentGenerationError("EMPTY_PROVIDER_RESPONSE", "Sortie texte vide du fournisseur");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(outputText);
      } catch {
        const invalidError = new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Reponse structuree impossible a parser");
        const diagnostics: PublicationInvalidResponseDiagnostics = {
          errorMessage: invalidError.message,
          errorCode: invalidError.code,
          stage: "parsing",
          rejectedByRule: "OpenAIProvider.generateJson.JSON.parse",
          outputTextLength: outputText.length,
          parsedIsObject: false,
          rawProposalsCount: 0,
          proposalFieldsPresence: [],
        };

        const enrichedError =
          args.request.requestType === "publication"
            ? attachPublicationDiagnosticsToError(invalidError, diagnostics)
            : invalidError;

        if (isDevelopment && args.request.requestType === "publication") {
          console.info("CIE publication invalid response diagnostics", {
            errorName: invalidError.name,
            responseId: response.id,
            ...diagnostics,
          });
        }
        throw enrichedError;
      }

      try {
        if (args.request.requestType === "publication") {
          return validatePublicationGenerationJson({
            parsedContent: parsed,
            requestStartedAt,
            provider: this.id,
            model: this.model,
            templateKey: "publication:v1",
            templateVersion: "v1",
            promptVersion: contentIntelligenceConfig.promptVersion,
            brief: {
              length: args.request.brief.length,
              specialInstructions: args.request.brief.specialInstructions,
              platform: args.request.brief.platform,
              tone: args.request.brief.tone,
              useEmojis: args.request.brief.useEmojis,
            },
            selectedContextItems: args.request.selectedContextItems,
            contextResearchedAt: args.request.contextSelection.researchedAt,
            contextDateRange: args.request.contextSelection.dateRange,
          });
        }

        if (args.request.requestType === "reel") {
          return validateReelGenerationJson({
            parsedContent: parsed,
            requestStartedAt,
            provider: this.id,
            model: this.model,
            templateKey: "reel:v1",
            templateVersion: "v1",
            promptVersion: contentIntelligenceConfig.promptVersion,
            brief: {
              duration: args.request.brief.duration,
              format: args.request.brief.format,
            },
            selectedContextItems: args.request.selectedContextItems,
            contextResearchedAt: args.request.contextSelection.researchedAt,
            contextDateRange: args.request.contextSelection.dateRange,
          });
        }

        if (args.request.requestType === "interview") {
          return validateContentGenerationJson({
            parsedContent: parsed,
            requestStartedAt,
            provider: this.id,
            model: this.model,
            templateKey: args.request.template.key,
            templateVersion: args.request.template.version,
            promptVersion: contentIntelligenceConfig.promptVersion,
            questionCount: args.request.brief.questionCount,
            missingInformation: [],
            selectedContextItems: args.request.selectedContextItems,
            contextResearchedAt: args.request.contextSelection.researchedAt,
            contextDateRange: args.request.contextSelection.dateRange,
          });
        }

        throw new ContentGenerationError("INVALID_REQUEST", "Type de generation non supporte");
      } catch (error) {
        if (isDevelopment && error instanceof ContentGenerationError && error.code === "INVALID_PROVIDER_RESPONSE") {
          if (args.request.requestType === "publication") {
            const diagnostics = buildPublicationValidationDiagnostics({
              responseId: response.id,
              parsed,
              outputText,
              error,
            });

            console.info(
              "CIE publication invalid response diagnostics",
              diagnostics
            );

            throw attachPublicationDiagnosticsToError(error, {
              errorMessage: diagnostics.errorMessage,
              errorCode: diagnostics.errorCode,
              stage: diagnostics.stage,
              rejectedByRule: diagnostics.rejectedByRule,
              outputTextLength: diagnostics.outputTextLength,
              parsedIsObject: diagnostics.parsedIsObject,
              rawProposalsCount: diagnostics.rawProposalsCount,
              proposalFieldsPresence: diagnostics.proposalFieldsPresence,
            });
          } else {
            console.info("CIE validation diagnostics", buildValidationDiagnostics(response.id, parsed, outputText));
          }
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof ContentGenerationError) throw error;

      const maybeError = error as {
        status?: number;
        code?: string;
        message?: string;
        name?: string;
      };

      if (maybeError?.name === "AbortError") {
        throw new ContentGenerationError("GENERATION_FAILED", "Le delai de generation est depasse");
      }

      if (maybeError?.status === 429) {
        throw new ContentGenerationError("RATE_LIMITED", "Limite de generation atteinte");
      }

      if (maybeError?.status === 401 || maybeError?.status === 403) {
        throw new ContentGenerationError("PROVIDER_NOT_CONFIGURED", "Configuration OpenAI invalide");
      }

      if (maybeError?.status && maybeError.status >= 400) {
        throw new ContentGenerationError("GENERATION_FAILED", `Echec de generation (OpenAI HTTP ${maybeError.status})`);
      }

      throw new ContentGenerationError("GENERATION_FAILED", "Impossible de generer le contenu");
    }
  }

  async generatePublicationAngles(args: { request: PublicationGenerationRequest; prompt: string }): Promise<PublicationAngleSuggestion[]> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: systemInstructions,
      input: args.prompt,
      text: {
        format: {
          type: "json_schema",
          name: "publication_angles_suggestions",
          strict: true,
          schema: buildPublicationAnglesJsonSchema(),
        },
      },
    });

    const outputText = typeof response.output_text === "string" ? response.output_text.trim() : "";
    if (!outputText) {
      throw new ContentGenerationError("EMPTY_PROVIDER_RESPONSE", "Sortie texte vide du fournisseur");
    }

    return validatePublicationAnglesJson(outputText);
  }

  async regeneratePublicationProposal(args: {
    request: PublicationGenerationRequest;
    result: PublicationGenerationResult;
    proposalId: string;
  }): Promise<PublicationRegenerateOneResult> {
    const target = args.result.proposals.find((proposal) => proposal.id === args.proposalId);
    if (!target) {
      throw new ContentGenerationError("INVALID_REQUEST", "Proposition introuvable");
    }

    const treatmentByProposalId: Record<string, string> = {
      "proposal-1": "direct / informationnel",
      "proposal-2": "storytelling / humain",
      "proposal-3": "social / impact",
    };

    const treatmentTagByProposalId = {
      "proposal-1": "editorial_factuel",
      "proposal-2": "storytelling_humain",
      "proposal-3": "social_impact",
    } as const;

    const expectedTreatment = treatmentByProposalId[args.proposalId] ?? "distinct et adapte au contexte";
    const expectedTreatmentTag = treatmentTagByProposalId[args.proposalId as keyof typeof treatmentTagByProposalId];

    const input = [
      "Mission: regenerer uniquement une proposition de publication.",
      "Conserver strictement le meme angle editorial et les memes faits verifies.",
      "Conserver la plateforme, le ton, la longueur, l audience, le CTA et les contraintes.",
      `Conserver le traitement editorial attendu pour ce slot: ${expectedTreatment}.`,
      expectedTreatmentTag ? `editorialNote doit commencer par: [TRAITEMENT: ${expectedTreatmentTag}].` : "",
      "Retourner une version vraiment differente du texte precedent.",
      "Ne jamais ecrire comme une introduction d interview.",
      "Ne pas inventer de faits, dates, chiffres, citations ou annonces.",
      "Eviter les formulations generiques ou cliches.",
      "Interdire explicitement les tics suivants: 'une histoire a ecrire', 'bien plus qu un', 'passion et determination', 'repousser ses limites', 'pret pour la suite'.",
      "Eviter les questions rhetoriques inutiles et les successions artificielles de phrases tres courtes.",
      "Le CTA est facultatif: si aucun CTA pertinent, utiliser une cloture neutre et sobre.",
      "Hashtags sobres et pertinents, relies au texte genere.",
      "Suggestion visuelle coherente avec les faits et le contenu effectivement ecrit.",
      "Ne regenerer qu une seule proposition au format schema impose.",
      "Contexte de demande:",
      JSON.stringify({ request: args.request, currentProposal: target }, null, 2),
    ].join("\n\n");

    const response = await this.client.responses.create({
      model: this.model,
      instructions: systemInstructions,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "publication_single_regeneration",
          strict: true,
          schema: buildPublicationSingleProposalJsonSchema(),
        },
      },
    });

    const outputText = typeof response.output_text === "string" ? response.output_text.trim() : "";
    if (!outputText) {
      throw new ContentGenerationError("EMPTY_PROVIDER_RESPONSE", "Sortie texte vide du fournisseur");
    }

    return validatePublicationSingleProposalJson({
      rawContent: outputText,
      brief: {
        length: args.request.brief.length,
        specialInstructions: args.request.brief.specialInstructions,
        platform: args.request.brief.platform,
        tone: args.request.brief.tone,
        useEmojis: args.request.brief.useEmojis,
      },
      selectedContextItems: args.request.selectedContextItems,
      expectedTreatmentTag,
    });
  }
}
