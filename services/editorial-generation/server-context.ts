import type { ContentAccessContext } from "@/lib/content-storage/access";
import type { EditorialContextCollectionStore } from "@/services/context-intelligence/collection-service";
import {
  resolveEditorialContextCollectionSelection,
} from "@/services/context-intelligence/collection-service";
import { EditorialContextCollectionRepository } from "@/lib/context-collections/repository";
import { buildEditorialDossier } from "@/services/editorial-dossier/builder";
import {
  evaluateEditorialGenerationEligibility,
  type EditorialGenerationEligibility,
  type EditorialGenerationTarget,
} from "@/services/editorial-generation/policy";
import {
  selectEditorialGenerationContext,
  type EditorialGenerationSelection,
} from "@/services/editorial-generation/selector";
import { ContentGenerationError } from "@/services/content-generation/errors";
import type {
  ContextItemCategory,
  ContextItem,
  ContextSelectionReference,
  ContextSubject,
} from "@/types/context-intelligence";

export class EditorialGenerationBlockedError extends ContentGenerationError {
  constructor(public readonly eligibility: EditorialGenerationEligibility) {
    super("EDITORIAL_GENERATION_BLOCKED", eligibility.reasons.join(" "));
    this.name = "EditorialGenerationBlockedError";
  }
}

export type PreparedEditorialGeneration = {
  selectedItems: ContextItem[];
  eligibility: Exclude<EditorialGenerationEligibility, { status: "blocked" }>;
  selection: EditorialGenerationSelection;
};

const toContextCategory = (category: string): ContextItemCategory => {
  if (category === "sports_result") return "result";
  if (category === "news") return "recent_news";
  if (category === "club_position") return "club_or_organization";
  if (category === "historical_record") return "performance";
  if (category === "generated_reference") return "previous_content";
  if (category === "schedule") return "schedule";
  if (category === "production") return "production";
  return "other";
};

const buildSanitizedContextItems = (
  selection: EditorialGenerationSelection,
  retrievedAt: string,
): ContextItem[] => {
  const sourceByName = new Map(selection.metadata.usedSources.map((source) => [source.name, source]));
  const sourceData = (names: string[]) => {
    const source = names.map((name) => sourceByName.get(name)).find(Boolean);
    return {
      sourceType: source?.official ? "official" as const : "external" as const,
      sourceName: source?.name ?? "Dossier editorial",
      ...(source?.url ? { sourceUrl: source.url } : {}),
      ...(source?.publishedAt ? { publishedAt: source.publishedAt } : {}),
    };
  };

  return [
    ...selection.modelContext.facts.map((fact, index): ContextItem => ({
      id: `editorial-fact-${index + 1}`,
      connectorId: "documents",
      category: toContextCategory(fact.category),
      title: "Fait editorial",
      summary: fact.text,
      factualStatement: fact.text,
      statementType: "fact",
      ...sourceData(fact.sourceNames),
      retrievedAt,
      confidence: fact.confidence,
      verificationStatus: fact.verificationStatus as ContextItem["verificationStatus"],
      isSelected: true,
      isEditable: false,
      metadata: {},
    })),
    ...selection.modelContext.editorialLeads.map((lead, index): ContextItem => {
      const category = toContextCategory(lead.category ?? "other");
      const preservesResultSource = category === "result";
      return {
        id: `editorial-lead-${index + 1}`,
        connectorId: "manual",
        category: preservesResultSource ? "result" : "user_note",
        title: "Piste editoriale",
        summary: lead.text,
        factualStatement: lead.text,
        statementType: "editorial_lead",
        ...(preservesResultSource
          ? sourceData(lead.sourceNames ?? [])
          : {
              sourceType: lead.verificationStatus === "user_provided" ? "user" as const : "internal" as const,
              sourceName: lead.verificationStatus === "user_provided"
                ? "Information fournie par l utilisateur"
                : "Dossier editorial",
            }),
        retrievedAt,
        confidence: lead.confidence,
        verificationStatus: lead.verificationStatus as ContextItem["verificationStatus"],
        isSelected: true,
        isEditable: false,
        metadata: {},
      };
    }),
  ];
};

const normalizeFactText = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[’']/g, " ")
  .replace(/[–—]/g, "-")
  .toLocaleLowerCase("fr");

const scoreValues = (value: string): Set<string> => new Set(
  Array.from(normalizeFactText(value).matchAll(/\b(\d{1,3})\s*-\s*(\d{1,3})\b/g))
    .map((match) => [Number(match[1]), Number(match[2])].sort((a, b) => a - b).join("-")),
);

const rankingValues = (value: string): Set<string> => new Set(
  Array.from(normalizeFactText(value).matchAll(/\b(\d{1,3})(?:er|re|e|eme)\b/g))
    .map((match) => match[1]),
);

const participationPolarity = (value: string): "positive" | "negative" | null => {
  const text = normalizeFactText(value);
  if (/\b(?:n est pas entre en jeu|n a pas participe|joueur absent|participation\s*:\s*(?:non|aucune))\b/.test(text)) {
    return "negative";
  }
  if (/\b(?:est entre en jeu|a participe|participation (?:etablie|confirmee)|a dispute \d+ minutes?)\b/.test(text)) {
    return "positive";
  }
  return null;
};

const setsConflict = (left: Set<string>, right: Set<string>): boolean =>
  left.size > 0
  && right.size > 0
  && !Array.from(left).some((value) => right.has(value));

const assertNoOfficialWriterContradiction = (
  items: ContextItem[],
  target: EditorialGenerationTarget,
): void => {
  if (target.type !== "interview" || target.interviewType !== "after_match") return;
  const writerFacts = items.filter((item) =>
    item.statementType === "fact"
    && item.verificationStatus === "verified"
    && item.sourceName === "Saisie du rédacteur");
  const officialFacts = items.filter((item) =>
    item.statementType === "fact"
    && item.verificationStatus === "verified"
    && item.sourceType === "official");

  for (const writerFact of writerFacts) {
    const writerText = writerFact.factualStatement || writerFact.summary;
    for (const officialFact of officialFacts) {
      const officialText = officialFact.factualStatement || officialFact.summary;
      const writerParticipation = participationPolarity(writerText);
      const officialParticipation = participationPolarity(officialText);
      const contradiction =
        setsConflict(scoreValues(writerText), scoreValues(officialText))
        || setsConflict(rankingValues(writerText), rankingValues(officialText))
        || (
          writerParticipation !== null
          && officialParticipation !== null
          && writerParticipation !== officialParticipation
        );
      if (contradiction) {
        throw new ContentGenerationError(
          "INVALID_REQUEST",
          `Écart entre la Saisie du rédacteur et une source officielle. Saisie : « ${writerText.slice(0, 180)} ». Source officielle : « ${officialText.slice(0, 180)} ». Corrigez ou retirez la saisie avant la génération.`,
        );
      }
    }
  }
};

export const prepareEditorialGeneration = async (args: {
  contextSelection: ContextSelectionReference;
  subject: ContextSubject;
  target: EditorialGenerationTarget;
  access: ContentAccessContext;
  store?: EditorialContextCollectionStore;
  now?: Date;
}): Promise<PreparedEditorialGeneration> => {
  const resolved = await resolveEditorialContextCollectionSelection(
    args.contextSelection,
    args.access,
    args.store ?? EditorialContextCollectionRepository,
    args.now,
  );
  assertNoOfficialWriterContradiction(resolved.items, args.target);
  const dossier = buildEditorialDossier({
    collection: {
      id: resolved.collection.id,
      workspaceId: resolved.collection.workspaceId,
      items: resolved.items,
      createdAt: resolved.collection.createdAt,
    },
    authenticatedWorkspaceId: args.access.workspaceId,
    subject: args.subject,
    role: args.access.role,
  });
  const eligibility = evaluateEditorialGenerationEligibility(dossier, args.target);
  if (eligibility.status === "blocked") {
    throw new EditorialGenerationBlockedError(eligibility);
  }
  const selection = selectEditorialGenerationContext(dossier, eligibility, args.target);

  return {
    selectedItems: buildSanitizedContextItems(
      selection,
      resolved.collection.createdAt,
    ),
    eligibility,
    selection,
  };
};
