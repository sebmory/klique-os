import type { ContentAccessContext } from "@/lib/content-storage/access";
import { prepareEditorialGeneration } from "@/services/editorial-generation/server-context";
import { readEditorialAthleteProjection } from "@/services/context-intelligence/editorial-athlete-projection";
import type {
  ArticleAngleSuggestionsRequest,
  ArticleGenerationRequest,
  ContentContext,
} from "@/types/content-generation";
import { ContentGenerationError } from "@/services/content-generation/errors";
const normalize = (value: unknown): string => String(value ?? "").trim();

const documentaryAbsencePattern =
  /\b(?:aucun|aucune|absence de)\b.{0,80}\b(?:trace|resultats?|participations?|apparitions?|buts?)\b|\bn a pas ete\b.{0,60}\b(?:retrouve|documente)\b/iu;
const lineupSourcePattern = /\b(?:matchcenter|transfermarkt|feuille de match|composition)\b/iu;
const lineupRolePattern = /\ba d[eé]but[eé] comme [^,.]+ avec\b/iu;

const normalizeForEditorialDetection = (value: string): string =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’']/g, " ").toLowerCase();

export const isDocumentaryAbsenceText = (value: string): boolean =>
  documentaryAbsencePattern.test(normalizeForEditorialDetection(value));

export const sanitizeLineupDerivedRole = (value: string, sourceNames: string[]): string =>
  sourceNames.some((sourceName) => lineupSourcePattern.test(sourceName))
    ? value.replace(lineupRolePattern, "a débuté la rencontre avec")
    : value;

export const secureGenerationContext = async (
  request: Pick<ArticleGenerationRequest, "context">,
  items: ArticleGenerationRequest["selectedContextItems"],
  access: ContentAccessContext,
): Promise<ContentContext> => {
  const internalFacts = items
    .filter((item) => item.sourceType === "internal" && item.statementType === "fact")
    .map((item) => normalize(item.factualStatement || item.summary))
    .filter(Boolean);
  const externalVerifiedFacts = items
    .filter((item) =>
      item.verificationStatus === "verified"
      && item.statementType === "fact"
      && (item.sourceType === "official" || item.sourceType === "media" || item.sourceType === "external"))
    .map((item) => normalize(item.factualStatement || item.summary))
    .filter(Boolean);
  const editorialLeads = items
    .filter((item) => item.statementType === "editorial_lead" || item.verificationStatus === "unverified")
    .map((item) => normalize(item.factualStatement || item.summary))
    .filter(Boolean);

  if (request.context.source === "crm") {
    const subjectId = normalize(request.context.subjectId);
    const athlete = subjectId ? await readEditorialAthleteProjection(subjectId, access) : null;
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
      internalFacts,
      externalVerifiedFacts,
      userProvidedContextItems: [],
      editorialLeads,
    };
  }

  return {
    ...request.context,
    subjectId: undefined,
    source: "temporary",
    knownFacts: [],
    internalFacts: [],
    externalVerifiedFacts,
    userProvidedContextItems: items
      .filter((item) => item.sourceType === "user" || item.verificationStatus === "user_provided")
      .map((item) => normalize(item.factualStatement || item.summary))
      .filter(Boolean),
    editorialLeads,
  };
};

export const secureArticleRequest = async <T extends ArticleGenerationRequest | ArticleAngleSuggestionsRequest>(
  request: T,
  access: ContentAccessContext,
): Promise<T> => {
  if (!request?.context || typeof request.context !== "object" || !request.brief || typeof request.brief !== "object") {
    throw new ContentGenerationError("INVALID_REQUEST", "Requete Article incomplete");
  }
  const prepared = await prepareEditorialGeneration({
    contextSelection: {
      collectionId: request.contextSelection?.collectionId,
      selectedItemIds: request.contextSelection?.selectedItemIds ?? [],
      manualEdits: request.contextSelection?.manualEdits ?? [],
    },
    subject: {
      id: request.context.subjectId,
      type: request.context.subjectType,
      source: request.context.source,
      displayName: request.context.displayName,
      sport: request.context.sport,
      disciplineOrPosition: request.context.disciplineOrPosition,
      clubOrOrganization: request.context.clubOrOrganization,
    },
    target: {
      type: "article",
      articleType: request.brief.articleType,
    },
    access,
  });
  const hasDocumentaryAbsence = prepared.selection.modelContext.facts.some((fact) =>
    isDocumentaryAbsenceText(fact.text));
  const editorial = {
    ...prepared.selection.modelContext,
    facts: prepared.selection.modelContext.facts
      .filter((fact) => !isDocumentaryAbsenceText(fact.text))
      .map((fact) => ({
        ...fact,
        text: sanitizeLineupDerivedRole(fact.text, fact.sourceNames),
      })),
  };
  const angleWasReframed = prepared.selection.metadata.generationMode === "limited"
    && "selectedAngle" in request.brief;
  const editorialGeneration = {
    ...prepared.selection.metadata,
    warnings: Array.from(new Set([
      ...prepared.selection.metadata.warnings,
      ...(hasDocumentaryAbsence
        ? ["L’absence de résultat dans les sources consultées est une limite documentaire et ne prouve pas l’inactivité du sujet."]
        : []),
      ...(angleWasReframed
        ? ["Angle recadré côté serveur : présentation factuelle limitée aux éléments documentés."]
        : []),
    ])),
  };
  const context: ContentContext = {
    source: request.context.source,
    subjectType: editorial.subject.type,
    displayName: editorial.subject.displayName,
    sport: editorial.subject.sport,
    disciplineOrPosition: editorial.subject.publicRoleOrPosition,
    clubOrOrganization: editorial.subject.clubOrOrganization,
    knownFacts: editorial.facts.map((fact) => fact.text),
    objective: "article",
    audience: request.brief.audience,
    templateKey: "article:v1",
    contentType: "article",
    format: request.context.format,
    tone: request.brief.tone,
    internalFacts: [],
    externalVerifiedFacts: editorial.facts
      .filter((fact) => fact.verificationStatus === "verified")
      .map((fact) => fact.text),
    userProvidedContextItems: editorial.editorialLeads
      .filter((lead) => lead.verificationStatus === "user_provided")
      .map((lead) => lead.text),
    editorialLeads: editorial.editorialLeads.map((lead) => lead.text),
    excludedContext: [],
    constraints: {
      requiredTopics: request.brief.requiredTopics,
      avoidedTopics: [],
      questionCount: 0,
    },
  };
  const externalVerifiedSources = editorialGeneration.usedSources
    .filter((source) => Boolean(source.url))
    .map((source) => ({ title: source.name, url: source.url! }));
  const providedCitations = editorial.citations
    .filter((citation) => citation.verificationStatus === "verified" || citation.verificationStatus === "reported")
    .map((citation) => ({
      text: citation.text,
      author: citation.author || "Auteur non precise",
      source: citation.sourceNames.join(", ") || "Source non precisee",
    }));

  return {
    ...request,
    context,
    selectedContextItems: prepared.selectedItems,
    editorialContext: editorial,
    editorialGeneration,
    brief: {
      ...request.brief,
      additionalContext: "",
      externalVerifiedSources,
      providedCitations,
    },
  };
};
