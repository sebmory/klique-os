import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { Response } from "openai/resources/responses/responses";
import { recordAiUsageEvent } from "@/lib/ai-usage/repository";
import type { SportsWatchImportExtraction, SportsWatchResultKind } from "@/types/sports-watch";

export const SPORTS_WATCH_IMPORT_PROVIDER = "openai";
export const SPORTS_WATCH_IMPORT_MODEL = "gpt-4.1";

const resultKinds = [
  "individual_result",
  "collective_result",
  "participation",
] satisfies SportsWatchResultKind[];

const isImportResultKind = (
  value: unknown,
): value is (typeof resultKinds)[number] =>
  typeof value === "string" && resultKinds.some((kind) => kind === value);

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourceName: { type: ["string", "null"] },
    documentDate: { type: ["string", "null"], description: "Date visible du document au format YYYY-MM-DD." },
    matchDate: { type: ["string", "null"], description: "Date explicite du match au format YYYY-MM-DD." },
    competition: { type: ["string", "null"] },
    participantA: { type: ["string", "null"] },
    participantB: { type: ["string", "null"] },
    score: { type: ["string", "null"] },
    resultKind: {
      anyOf: [
        { type: "string", enum: resultKinds },
        { type: "null" },
      ],
    },
    individualParticipationExplicit: { type: "boolean" },
    individualEvidence: { type: ["string", "null"] },
    individualStatistics: {
      type: "array",
      items: { type: "string" },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "sourceName",
    "documentDate",
    "matchDate",
    "competition",
    "participantA",
    "participantB",
    "score",
    "resultKind",
    "individualParticipationExplicit",
    "individualEvidence",
    "individualStatistics",
    "warnings",
  ],
} as const;

type ProviderCall = (input: {
  contentType: string;
  filename: string;
  bytes: Uint8Array;
  athlete: { name: string; sport: string; club: string };
}) => Promise<Response>;

const defaultProviderCall: ProviderCall = async (input) => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Le fournisseur d’extraction n’est pas configuré.");
  const configuredBaseUrl = process.env.OPENAI_API_URL
    ? process.env.OPENAI_API_URL.replace(/\/chat\/completions\/?$/i, "")
    : undefined;
  const client = new OpenAI({
    apiKey,
    ...(configuredBaseUrl ? { baseURL: configuredBaseUrl } : {}),
  });
  const encoded = Buffer.from(input.bytes).toString("base64");
  const filePart = input.contentType === "application/pdf"
    ? {
        type: "input_file" as const,
        filename: input.filename,
        file_data: `data:application/pdf;base64,${encoded}`,
        detail: "high" as const,
      }
    : {
        type: "input_image" as const,
        image_url: `data:${input.contentType};base64,${encoded}`,
        detail: "high" as const,
      };
  return client.responses.create({
    model: SPORTS_WATCH_IMPORT_MODEL,
    instructions: [
      "Extrais uniquement les informations explicitement lisibles dans le document sportif fourni.",
      "N’invente aucune valeur et utilise null lorsqu’une valeur est absente, ambiguë ou illisible.",
      "Distingue la date du document de la date du match.",
      "Un résultat d’équipe ne prouve jamais la participation individuelle.",
      "Ne marque la participation individuelle comme explicite que si le nom complet de l’athlète ou un identifiant concordant apparaît dans une ligne de participation ou de statistiques.",
      "Ne déduis aucun temps de jeu, poste, classement ou statistique.",
      "Ajoute un avertissement pour toute ambiguïté utile à la vérification humaine.",
    ].join(" "),
    input: [{
      role: "user",
      content: [
        filePart,
        {
          type: "input_text",
          text: [
            `Athlète CRM à rechercher : ${input.athlete.name}.`,
            `Sport CRM : ${input.athlete.sport || "non indiqué"}.`,
            `Club CRM : ${input.athlete.club || "non indiqué"}.`,
            "Retourne les participants dans l’ordre du document et conserve le score tel qu’affiché.",
          ].join("\n"),
        },
      ],
    }],
    text: {
      format: {
        type: "json_schema",
        name: "sports_watch_result_import",
        strict: true,
        schema: extractionSchema,
      },
    },
  });
};

const nullableText = (value: unknown, limit = 500): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, limit) : null;
};

const date = (value: unknown): string | null => {
  const text = nullableText(value, 10);
  if (!text) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(text)
    && !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === text
    ? text
    : null;
};

const stringArray = (value: unknown, maxItems: number): string[] =>
  Array.isArray(value)
    ? value
      .map((item) => String(item ?? "").trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, maxItems)
    : [];

export const validateSportsWatchImportExtraction = (
  value: unknown,
): SportsWatchImportExtraction => {
  if (typeof value !== "object" || value === null) {
    throw new Error("La réponse structurée du fournisseur est invalide.");
  }
  const record = value as Record<string, unknown>;
  const resultKind = isImportResultKind(record.resultKind)
    ? record.resultKind
    : null;
  const individualParticipationExplicit = record.individualParticipationExplicit === true;
  const individualEvidence = individualParticipationExplicit
    ? nullableText(record.individualEvidence)
    : null;
  const warnings = stringArray(record.warnings, 20);
  if (individualParticipationExplicit && !individualEvidence) {
    warnings.push("La participation individuelle annoncée n’est pas accompagnée d’une preuve lisible.");
  }
  return {
    sourceName: nullableText(record.sourceName, 160),
    documentDate: date(record.documentDate),
    matchDate: date(record.matchDate),
    competition: nullableText(record.competition, 160),
    participantA: nullableText(record.participantA, 200),
    participantB: nullableText(record.participantB, 200),
    score: nullableText(record.score, 120),
    resultKind,
    individualParticipationExplicit: individualParticipationExplicit && Boolean(individualEvidence),
    individualEvidence,
    individualStatistics: individualParticipationExplicit
      ? stringArray(record.individualStatistics, 30)
      : [],
    warnings,
  };
};

const recordUsage = async (input: {
  workspaceId: string;
  clerkUserId: string;
  requestGroupId: string;
  contentType: string;
  status: "succeeded" | "failed";
  response?: Response;
  durationMs: number;
  errorCode?: string;
}): Promise<void> => {
  try {
    await recordAiUsageEvent({
      requestGroupId: input.requestGroupId,
      workspaceId: input.workspaceId,
      clerkUserId: input.clerkUserId,
      role: "admin",
      feature: "sports_watch",
      operation: "sports_watch_import_extract",
      contentType: input.contentType,
      provider: SPORTS_WATCH_IMPORT_PROVIDER,
      model: SPORTS_WATCH_IMPORT_MODEL,
      providerResponseId: input.response?.id ?? null,
      inputTokens: input.response?.usage?.input_tokens ?? 0,
      cachedInputTokens: input.response?.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: input.response?.usage?.output_tokens ?? 0,
      totalTokens: input.response?.usage?.total_tokens ?? 0,
      toolCalls: 0,
      retryNumber: 0,
      status: input.status,
      errorCode: input.errorCode ?? null,
      durationMs: input.durationMs,
      usageJson: input.response?.usage
        ? input.response.usage as unknown as Record<string, unknown>
        : null,
      estimatedCostMicroUsd: null,
      pricingVersion: null,
    });
  } catch (error) {
    console.error("[sports_watch_import] Impossible de journaliser l’usage fournisseur.", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
};

export const extractSportsWatchImport = async (input: {
  workspaceId: string;
  clerkUserId: string;
  contentType: string;
  filename: string;
  bytes: Uint8Array;
  athlete: { name: string; sport: string; club: string };
}, dependencies: { callProvider?: ProviderCall } = {}): Promise<{
  extraction: SportsWatchImportExtraction;
  provider: string;
  model: string;
  providerResponseId: string | null;
}> => {
  const startedAt = Date.now();
  const requestGroupId = randomUUID();
  let response: Response | undefined;
  try {
    response = await (dependencies.callProvider ?? defaultProviderCall)(input);
    if (response.status === "incomplete" || !response.output_text?.trim()) {
      throw new Error("Le fournisseur a retourné une extraction incomplète.");
    }
    const extraction = validateSportsWatchImportExtraction(JSON.parse(response.output_text));
    await recordUsage({
      workspaceId: input.workspaceId,
      clerkUserId: input.clerkUserId,
      requestGroupId,
      contentType: input.contentType,
      status: "succeeded",
      response,
      durationMs: Date.now() - startedAt,
    });
    return {
      extraction,
      provider: SPORTS_WATCH_IMPORT_PROVIDER,
      model: SPORTS_WATCH_IMPORT_MODEL,
      providerResponseId: response.id ?? null,
    };
  } catch (error) {
    await recordUsage({
      workspaceId: input.workspaceId,
      clerkUserId: input.clerkUserId,
      requestGroupId,
      contentType: input.contentType,
      status: "failed",
      response,
      durationMs: Date.now() - startedAt,
      errorCode: "SPORTS_WATCH_IMPORT_EXTRACTION_FAILED",
    });
    throw new Error(
      error instanceof SyntaxError
        ? "La réponse structurée du fournisseur est invalide."
        : error instanceof Error ? error.message : "L’extraction du résultat a échoué.",
    );
  }
};
