import type { ContentAccessContext } from "@/lib/content-storage/access";
import type { CreationPreparationPayload } from "@/services/content-creation-assistant";
import { ContentGenerationError } from "@/services/content-generation/errors";
import { activeTemplateByFamily } from "@/services/content-intelligence/templates";
import type {
  AnyContentGenerationRequest,
  ContentContext,
  InterviewGenerationRequest,
  PublicationGenerationRequest,
  ReelGenerationRequest,
  StoryGenerationRequest,
} from "@/types/content-generation";
import type { ContextItem } from "@/types/context-intelligence";
import { readEditorialAthleteProjection } from "@/services/context-intelligence/editorial-athlete-projection";
import type { EditorialAthleteProjection } from "@/types/editorial-athlete";

const normalize = (value: unknown): string => String(value ?? "").trim();

const compact = (items: Array<string | undefined>): string[] => {
  return items.map((item) => normalize(item)).filter(Boolean);
};

const resolveTemplateKeyForObjective = (objectiveId: CreationPreparationPayload["objective"]["id"]) => {
  if (objectiveId === "publication") return activeTemplateByFamily.publication;
  if (objectiveId === "reel") return activeTemplateByFamily.reel;
  if (objectiveId === "story") return activeTemplateByFamily.story;
  return activeTemplateByFamily.interview;
};

const buildKnownFacts = (athlete: EditorialAthleteProjection): string[] => {
  return compact([
    athlete.sport ? `Sport: ${athlete.sport}` : undefined,
    athlete.club ? `Organisation: ${athlete.club}` : undefined,
    athlete.position ? `Discipline ou poste: ${athlete.position}` : undefined,
    athlete.palmares ? `Palmares: ${athlete.palmares}` : undefined,
    ...athlete.communicationObjectives.map((objective) => `Objectif autorise a la communication: ${objective}`),
    ...athlete.publishedFacts.map((fact) => `Fait publie ou valide pour les medias: ${fact}`),
  ]);
};

const buildContextSelection = (payload: CreationPreparationPayload) => ({
  collectionId: payload.parameters.contextIntelligence.collectionId,
  selectedItemIds: payload.parameters.contextIntelligence.selectedItemIds,
  manualEdits: payload.parameters.contextIntelligence.manualEdits,
  researchedAt: payload.parameters.contextIntelligence.researchedAt,
  dateRange: payload.parameters.contextIntelligence.dateRange,
});

const formatContextItem = (item: ContextItem): string => {
  const base = normalize(item.editedSummary) || normalize(item.summary) || normalize(item.factualStatement);
  const source = normalize(item.sourceName);
  const date = normalize(item.publishedAt);
  const suffix = [source ? `Source: ${source}` : "", date ? `Date: ${date}` : ""].filter(Boolean).join(" | ");
  return suffix ? `${base} (${suffix})` : base;
};

const buildContextBuckets = (items: ContextItem[]) => {
  const selected = items.filter((item) => item.isSelected);
  const excluded = items.filter((item) => !item.isSelected).map((item) => formatContextItem(item));

  const internalFacts = selected
    .filter((item) => item.sourceType === "internal" && item.statementType === "fact")
    .filter((item) => item.verificationStatus === "verified" || item.verificationStatus === "reported")
    .map((item) => formatContextItem(item));

  const externalVerifiedFacts = selected
    .filter((item) => (item.sourceType === "official" || item.sourceType === "media" || item.sourceType === "external") && item.statementType === "fact")
    .filter((item) => item.verificationStatus === "verified" || item.verificationStatus === "reported")
    .map((item) => formatContextItem(item));

  const userProvidedContextItems = selected
    .filter((item) => item.sourceType === "user" || item.verificationStatus === "user_provided")
    .map((item) => formatContextItem(item));

  const editorialLeads = selected
    .filter((item) => item.statementType === "editorial_lead" || item.verificationStatus === "unverified")
    .map((item) => formatContextItem(item));

  return {
    internalFacts,
    externalVerifiedFacts,
    userProvidedContextItems,
    editorialLeads,
    excludedContext: excluded,
    selected,
  };
};

const buildContentContext = async (
  payload: CreationPreparationPayload,
  access: Pick<ContentAccessContext, "workspaceId" | "role">,
): Promise<{ context: ContentContext; missingInformation: string[] }> => {
  const missingInformation: string[] = [];
  const interviewType = payload.objective.id === "interview" ? payload.objective.subtypeId : undefined;
  const templateKey = resolveTemplateKeyForObjective(payload.objective.id);
  const contextItems = payload.parameters.contextIntelligence.selectedContextItems;
  const buckets = buildContextBuckets(contextItems);

  if (payload.subject.source === "crm") {
    if (!payload.subject.id) {
      throw new ContentGenerationError("MISSING_SUBJECT", "Sujet CRM introuvable");
    }

    const athlete = await readEditorialAthleteProjection(payload.subject.id, access);
    if (!athlete) {
      throw new ContentGenerationError("MISSING_SUBJECT", "Sujet CRM introuvable");
    }

    if (!normalize(athlete.position)) missingInformation.push("Discipline ou poste non renseigne");
    if (!normalize(athlete.biography)) missingInformation.push("Biographie publique non renseignee");

    return {
      context: {
        subjectId: athlete.id,
        source: "crm",
        subjectType: payload.subject.type,
        displayName: normalize(athlete.displayName),
        sport: normalize(athlete.sport) || undefined,
        disciplineOrPosition: normalize(athlete.position) || undefined,
        clubOrOrganization: normalize(athlete.club) || undefined,
        biography: normalize(athlete.biography) || undefined,
        knownFacts: buildKnownFacts(athlete),
        manualContext: normalize(payload.parameters.additionalContext) || undefined,
        objective: payload.objective.id,
        audience: payload.parameters.audienceId,
        templateKey,
        contentType: payload.objective.id,
        interviewType,
        format: payload.parameters.formatId,
        tone: payload.parameters.toneId,
        internalFacts: buckets.internalFacts,
        externalVerifiedFacts: buckets.externalVerifiedFacts,
        userProvidedContextItems: buckets.userProvidedContextItems,
        editorialLeads: buckets.editorialLeads,
        excludedContext: buckets.excludedContext,
        constraints: {
          requiredTopics: payload.parameters.requiredTopics,
          avoidedTopics: payload.parameters.avoidedTopics,
          questionCount: payload.parameters.questionCount,
        },
      },
      missingInformation,
    };

  }

  if (!normalize(payload.subject.sport)) missingInformation.push("Sport ou secteur non renseigne");

  return {
    context: {
      subjectId: payload.subject.id,
      source: "temporary",
      subjectType: payload.subject.type,
      displayName: payload.subject.displayName,
      sport: normalize(payload.subject.sport) || undefined,
      disciplineOrPosition: undefined,
      clubOrOrganization: normalize(payload.subject.clubOrOrganization) || undefined,
      biography: normalize(payload.subject.description) || undefined,
      knownFacts: compact([
        payload.subject.sport ? `Sport: ${payload.subject.sport}` : undefined,
        payload.subject.clubOrOrganization ? `Organisation: ${payload.subject.clubOrOrganization}` : undefined,
      ]),
      manualContext: normalize(payload.parameters.additionalContext) || undefined,
      objective: payload.objective.id,
      audience: payload.parameters.audienceId,
      templateKey,
      contentType: payload.objective.id,
      interviewType,
      format: payload.parameters.formatId,
      tone: payload.parameters.toneId,
      internalFacts: buckets.internalFacts,
      externalVerifiedFacts: buckets.externalVerifiedFacts,
      userProvidedContextItems: buckets.userProvidedContextItems,
      editorialLeads: buckets.editorialLeads,
      excludedContext: buckets.excludedContext,
      constraints: {
        requiredTopics: payload.parameters.requiredTopics,
        avoidedTopics: payload.parameters.avoidedTopics,
        questionCount: payload.parameters.questionCount,
      },
    },
    missingInformation,
  };
};

export const buildContentGenerationRequest = async (
  payload: CreationPreparationPayload,
  access: Pick<ContentAccessContext, "workspaceId" | "role">,
): Promise<{ request: AnyContentGenerationRequest; missingInformation: string[] }> => {
  const { context, missingInformation } = await buildContentContext(payload, access);

  if (payload.objective.id === "publication") {
    const publication = payload.parameters.publication;
    if (!publication) {
      throw new ContentGenerationError("INVALID_REQUEST", "Configuration publication manquante");
    }

    const request: PublicationGenerationRequest = {
      requestType: "publication",
      language: payload.parameters.language,
      template: {
        key: activeTemplateByFamily.publication,
        family: "publication",
        name: "Publication",
        version: "v1",
      },
      context: {
        ...context,
        templateKey: activeTemplateByFamily.publication,
      },
      brief: {
        objective: publication.objectiveId,
        customObjective: publication.customObjective,
        selectedAngle: publication.selectedAngle,
        platform: publication.platform,
        tone: payload.parameters.toneId,
        length: publication.length,
        audience: payload.parameters.audienceId,
        cta: publication.cta,
        hashtags: publication.hashtags,
        useEmojis: publication.useEmojis,
        specialInstructions: publication.specialInstructions,
        includeElements: publication.includeElements,
        avoidElements: publication.avoidElements,
        additionalContext: payload.parameters.additionalContext,
      },
      selectedContextItems: payload.parameters.contextIntelligence.selectedContextItems.filter((item) => item.isSelected),
      contextSelection: buildContextSelection(payload),
      rulesVersion: "editorial-rules-v1",
      externalContext: null,
    };

    return {
      request,
      missingInformation,
    };
  }

  if (payload.objective.id === "reel") {
    const reel = payload.parameters.reel;
    if (!reel) {
      throw new ContentGenerationError("INVALID_REQUEST", "Configuration reel manquante");
    }

    const request: ReelGenerationRequest = {
      requestType: "reel",
      language: payload.parameters.language,
      template: {
        key: activeTemplateByFamily.reel,
        family: "reel",
        name: "Reel",
        version: "v1",
      },
      context: {
        ...context,
        templateKey: activeTemplateByFamily.reel,
      },
      brief: {
        objective: "reel",
        selectedAngle: reel.selectedAngle,
        duration: reel.duration,
        format: reel.format,
        platform: reel.platform,
        tone: payload.parameters.toneId,
        audience: payload.parameters.audienceId,
        additionalContext: payload.parameters.additionalContext,
      },
      selectedContextItems: payload.parameters.contextIntelligence.selectedContextItems.filter((item) => item.isSelected),
      contextSelection: buildContextSelection(payload),
      rulesVersion: "editorial-rules-v1",
      externalContext: null,
    };

    return {
      request,
      missingInformation,
    };
  }

  if (payload.objective.id === "story") {
    const story = payload.parameters.story;
    if (!story) {
      throw new ContentGenerationError("INVALID_REQUEST", "Configuration story manquante");
    }

    const request: StoryGenerationRequest = {
      requestType: "story",
      language: payload.parameters.language,
      template: {
        key: activeTemplateByFamily.story,
        family: "story",
        name: "Story",
        version: "v1",
      },
      context: {
        ...context,
        templateKey: activeTemplateByFamily.story,
      },
      brief: {
        objective: "story",
        selectedAngle: story.selectedAngle,
        frameCount: story.frameCount,
        platform: story.platform,
        tone: payload.parameters.toneId,
        audience: payload.parameters.audienceId,
        additionalContext: payload.parameters.additionalContext,
      },
      selectedContextItems: payload.parameters.contextIntelligence.selectedContextItems.filter((item) => item.isSelected),
      contextSelection: buildContextSelection(payload),
      rulesVersion: "editorial-rules-v1",
      externalContext: null,
    };

    return {
      request,
      missingInformation,
    };
  }

  const request: InterviewGenerationRequest = {
    requestType: "interview",
    language: payload.parameters.language,
    template: {
      key: activeTemplateByFamily.interview,
      family: "interview",
      name: "Interview",
      version: "v1",
    },
    context,
    brief: {
      interviewType: payload.objective.subtypeId as InterviewGenerationRequest["brief"]["interviewType"],
      objective: payload.objective.id,
      tone: payload.parameters.toneId as InterviewGenerationRequest["brief"]["tone"],
      questionCount: payload.parameters.questionCount,
      format: payload.parameters.formatId as InterviewGenerationRequest["brief"]["format"],
      audience: payload.parameters.audienceId as InterviewGenerationRequest["brief"]["audience"],
      requiredTopics: payload.parameters.requiredTopics,
      avoidedTopics: payload.parameters.avoidedTopics,
      additionalContext: payload.parameters.additionalContext,
    },
    selectedContextItems: payload.parameters.contextIntelligence.selectedContextItems.filter((item) => item.isSelected),
    contextSelection: buildContextSelection(payload),
    rulesVersion: "editorial-rules-v1",
    externalContext: null,
  };

  return {
    request,
    missingInformation,
  };
};
