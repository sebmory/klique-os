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
    ...selection.modelContext.editorialLeads.map((lead, index): ContextItem => ({
      id: `editorial-lead-${index + 1}`,
      connectorId: "manual",
      category: "user_note",
      title: "Piste editoriale",
      summary: lead.text,
      factualStatement: lead.text,
      statementType: "editorial_lead",
      sourceType: lead.verificationStatus === "user_provided" ? "user" : "internal",
      sourceName: lead.verificationStatus === "user_provided" ? "Information fournie par l utilisateur" : "Dossier editorial",
      retrievedAt,
      confidence: lead.confidence,
      verificationStatus: lead.verificationStatus as ContextItem["verificationStatus"],
      isSelected: true,
      isEditable: false,
      metadata: {},
    })),
  ];
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
