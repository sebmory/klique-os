import type { ContentAccessContext } from "@/lib/content-storage/access";
import { resolveEditorialContextSelection } from "@/services/context-intelligence/collection-service";
import { readEditorialAthleteProjection } from "@/services/context-intelligence/editorial-athlete-projection";
import type {
  ArticleAngleSuggestionsRequest,
  ArticleGenerationRequest,
  ContentContext,
} from "@/types/content-generation";
import { ContentGenerationError } from "@/services/content-generation/errors";
import type { ContextItem } from "@/types/context-intelligence";

const normalize = (value: unknown): string => String(value ?? "").trim();

const itemText = (item: ContextItem): string =>
  normalize(item.editedSummary) || normalize(item.factualStatement) || normalize(item.summary);

const classifyItems = (items: ContextItem[]) => ({
  internalFacts: items
    .filter((item) => item.sourceType === "internal" && item.statementType === "fact")
    .map(itemText)
    .filter(Boolean),
  externalVerifiedFacts: items
    .filter((item) =>
      item.verificationStatus === "verified"
      && item.statementType === "fact"
      && (item.sourceType === "official" || item.sourceType === "media" || item.sourceType === "external"))
    .map(itemText)
    .filter(Boolean),
  userProvidedContextItems: items
    .filter((item) => item.sourceType === "user" || item.verificationStatus === "user_provided")
    .map(itemText)
    .filter(Boolean),
  editorialLeads: items
    .filter((item) => item.statementType === "editorial_lead" || item.verificationStatus === "unverified")
    .map(itemText)
    .filter(Boolean),
});

export const secureGenerationContext = async (
  request: Pick<ArticleGenerationRequest, "context">,
  items: ContextItem[],
  access: ContentAccessContext,
): Promise<ContentContext> => {
  const classified = classifyItems(items);

  if (request.context.source === "crm") {
    const subjectId = normalize(request.context.subjectId);
    const athlete = subjectId
      ? await readEditorialAthleteProjection(subjectId, access)
      : null;
    if (!athlete) {
      throw new ContentGenerationError("MISSING_SUBJECT", "Sujet Athlete editorial introuvable.");
    }

    return {
      ...request.context,
      subjectId: athlete.id,
      displayName: athlete.displayName,
      sport: athlete.sport,
      disciplineOrPosition: athlete.position,
      clubOrOrganization: athlete.club,
      biography: athlete.biography,
      knownFacts: [
        athlete.palmares ? `Palmares: ${athlete.palmares}` : "",
        ...athlete.communicationObjectives.map((value) => `Objectif autorise a la communication: ${value}`),
        ...athlete.publishedFacts,
      ].filter(Boolean),
      manualContext: undefined,
      ...classified,
    };
  }

  const userProvidedContextItems = [
    normalize(request.context.biography),
    normalize(request.context.manualContext),
    ...(Array.isArray(request.context.knownFacts) ? request.context.knownFacts.map(normalize) : []),
    ...classified.userProvidedContextItems,
  ].filter(Boolean);

  return {
    ...request.context,
    subjectId: undefined,
    source: "temporary",
    knownFacts: [],
    internalFacts: [],
    externalVerifiedFacts: classified.externalVerifiedFacts,
    userProvidedContextItems,
    editorialLeads: classified.editorialLeads,
  };
};

export const secureArticleRequest = async <T extends ArticleGenerationRequest | ArticleAngleSuggestionsRequest>(
  request: T,
  access: ContentAccessContext,
): Promise<T> => {
  if (!request?.context || typeof request.context !== "object" || !request.brief || typeof request.brief !== "object") {
    throw new ContentGenerationError("INVALID_REQUEST", "Requete Article incomplete");
  }
  const selectedContextItems = await resolveEditorialContextSelection(
    {
      collectionId: request.contextSelection?.collectionId,
      selectedItemIds: request.contextSelection?.selectedItemIds ?? [],
      manualEdits: request.contextSelection?.manualEdits ?? [],
    },
    access,
  );
  const context = await secureGenerationContext(request, selectedContextItems, access);
  const externalVerifiedSources = selectedContextItems
    .filter((item) =>
      item.verificationStatus === "verified"
      && Boolean(item.sourceUrl)
      && (item.sourceType === "official" || item.sourceType === "media" || item.sourceType === "external"))
    .map((item) => ({ title: item.title, url: item.sourceUrl! }));

  return {
    ...request,
    context,
    selectedContextItems,
    brief: {
      ...request.brief,
      externalVerifiedSources,
      providedCitations: (Array.isArray(request.brief.providedCitations) ? request.brief.providedCitations : []).map((citation) => ({
        ...citation,
        source: "Fourni par l utilisateur (non verifie)",
      })),
    },
  };
};
