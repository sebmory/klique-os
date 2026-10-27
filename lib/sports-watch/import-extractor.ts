import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { Response } from "openai/resources/responses/responses";
import { recordAiUsageEvent } from "@/lib/ai-usage/repository";
import type {
  SportsWatchImportExtraction,
  SportsWatchIndividualStatistic,
  SportsWatchResultKind,
} from "@/types/sports-watch";

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
    documentDateEvidence: {
      type: ["string", "null"],
      description: "Texte exact qui prouve distinctement la date de création ou publication du document.",
    },
    matchDate: { type: ["string", "null"], description: "Date explicite du match au format YYYY-MM-DD." },
    matchDateEvidence: {
      type: ["string", "null"],
      description: "Texte exact qui prouve distinctement la date du match.",
    },
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
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          value: { type: ["string", "null"] },
          evidence: { type: ["string", "null"] },
        },
        required: ["label", "value", "evidence"],
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "sourceName",
    "documentDate",
    "documentDateEvidence",
    "matchDate",
    "matchDateEvidence",
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
      "Ne copie jamais la date du match dans la date du document.",
      "Une date du document exige une mention distincte de création ou publication du document.",
      "Pour chaque date, cite le texte exact qui la prouve. Si le format admet plusieurs interprétations calendaires ou si le rôle de la date est ambigu, retourne null et ajoute un avertissement.",
      "Un résultat d’équipe ne prouve jamais la participation individuelle.",
      "Ne marque la participation individuelle comme explicite que si le nom complet de l’athlète ou un identifiant concordant apparaît dans une ligne de participation ou de statistiques.",
      "Ne déduis aucun temps de jeu, poste, classement ou statistique.",
      "Pour chaque statistique individuelle, retourne un libellé, sa valeur et la ligne exacte du document qui la prouve.",
      "Une cellule vide ou absente reste null et ne devient jamais 0.",
      "Un total isolé, par exemple 71 dans une colonne de total d’équipe, n’est jamais un score final de rencontre.",
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

const dateWithEvidence = (
  value: unknown,
  evidenceValue: unknown,
  label: string,
  warnings: string[],
): { value: string | null; evidence: string | null } => {
  const parsedDate = date(value);
  const evidence = nullableText(evidenceValue, 600);
  if (!parsedDate) return { value: null, evidence };
  if (!evidence) {
    warnings.push(`${label} ignorée : aucune preuve textuelle distincte n’est fournie.`);
    return { value: null, evidence: null };
  }
  const isoMatch = evidence.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  const localMatch = evidence.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
  let evidenceDate: string | null = null;
  if (isoMatch) {
    evidenceDate = date(
      `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`,
    );
  } else if (localMatch) {
    const day = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    if (day <= 12 && month <= 12) {
      warnings.push(`${label} ignorée : la preuve « ${evidence} » admet plusieurs lectures calendaires.`);
      return { value: null, evidence };
    }
    const year = localMatch[3].length === 2 ? `20${localMatch[3]}` : localMatch[3];
    evidenceDate = date(
      `${year}-${localMatch[2].padStart(2, "0")}-${localMatch[1].padStart(2, "0")}`,
    );
  }
  if (!evidenceDate) {
    warnings.push(
      `${label} ignorée : la preuve « ${evidence} » ne contient pas de date calendaire non ambiguë.`,
    );
    return { value: null, evidence };
  }
  if (parsedDate !== evidenceDate) {
    warnings.push(
      `${label} corrigée : la valeur structurée ${parsedDate} contredit la date lisible ${evidenceDate} dans le document.`,
    );
  }
  return { value: evidenceDate, evidence };
};

const stringArray = (value: unknown, maxItems: number): string[] =>
  Array.isArray(value)
    ? value
      .map((item) => String(item ?? "").trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, maxItems)
    : [];

const statistics = (
  value: unknown,
  warnings: string[],
): SportsWatchIndividualStatistic[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        if (typeof item === "string") {
          const text = nullableText(item, 300);
          return text ? [{ label: "Statistique", value: text, evidence: null }] : [];
        }
        if (typeof item !== "object" || item === null) return [];
        const record = item as Record<string, unknown>;
        const label = nullableText(record.label, 120);
        const statisticValue = nullableText(record.value, 120);
        if (!label) return [];
        if (!statisticValue) {
          warnings.push(
            `Statistique « ${label} » non retenue : la valeur est absente et aucun zéro n’est déduit.`,
          );
          return [];
        }
        return [{
          label,
          value: statisticValue,
          evidence: nullableText(record.evidence, 600),
        }];
      }).slice(0, 30)
    : [];

const normalizeIdentityText = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const containsFullAthleteName = (
  athleteName: string,
  evidence: Array<string | null>,
): boolean => {
  const normalizedName = normalizeIdentityText(athleteName);
  if (!normalizedName.includes(" ")) return false;
  return evidence.some((item) => {
    if (!item) return false;
    return ` ${normalizeIdentityText(item)} `.includes(` ${normalizedName} `);
  });
};

const finalScore = (
  value: unknown,
  warnings: string[],
): string | null => {
  const score = nullableText(value, 120);
  if (!score) return null;
  if (/\d+\s*(?:[-–—:]\s*|\bà\b)\d+/i.test(score)) return score;
  warnings.push(
    `La valeur « ${score} » n’est pas retenue comme score final : deux scores opposés ne sont pas explicitement visibles.`,
  );
  return null;
};

export const validateSportsWatchImportExtraction = (
  value: unknown,
  athlete: { name: string },
): SportsWatchImportExtraction => {
  if (typeof value !== "object" || value === null) {
    throw new Error("La réponse structurée du fournisseur est invalide.");
  }
  const record = value as Record<string, unknown>;
  let resultKind = isImportResultKind(record.resultKind)
    ? record.resultKind
    : null;
  const warnings = stringArray(record.warnings, 20);
  const documentDate = dateWithEvidence(
    record.documentDate,
    record.documentDateEvidence,
    "Date du document",
    warnings,
  );
  const matchDate = dateWithEvidence(
    record.matchDate,
    record.matchDateEvidence,
    "Date du match",
    warnings,
  );
  if (
    documentDate.value
    && matchDate.value
    && documentDate.evidence === matchDate.evidence
  ) {
    documentDate.value = null;
    warnings.push(
      "Date du document ignorée : sa preuve est identique à celle du match et ne démontre pas une date documentaire distincte.",
    );
  }
  const individualEvidence = nullableText(record.individualEvidence, 600);
  const individualStatistics = statistics(record.individualStatistics, warnings);
  const individualParticipationExplicit = containsFullAthleteName(
    athlete.name,
    [
      individualEvidence,
      ...individualStatistics.map((statistic) => statistic.evidence),
    ],
  );
  if (individualStatistics.length > 0 && !individualParticipationExplicit) {
    warnings.push(
      `Statistiques conservées comme proposition à confirmer : la preuve ne contient pas le nom complet « ${athlete.name} ».`,
    );
  }
  if (individualParticipationExplicit && resultKind === "collective_result") {
    resultKind = "participation";
  }
  return {
    sourceName: nullableText(record.sourceName, 160),
    documentDate: documentDate.value,
    documentDateEvidence: documentDate.evidence,
    matchDate: matchDate.value,
    matchDateEvidence: matchDate.evidence,
    competition: nullableText(record.competition, 160),
    participantA: nullableText(record.participantA, 200),
    participantB: nullableText(record.participantB, 200),
    score: finalScore(record.score, warnings),
    resultKind,
    individualParticipationExplicit,
    individualEvidence,
    individualStatistics,
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
    const extraction = validateSportsWatchImportExtraction(
      JSON.parse(response.output_text),
      input.athlete,
    );
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
