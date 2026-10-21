import type {
  EditorialGenerationEligibility,
  EditorialGenerationTarget,
} from "@/services/editorial-generation/policy";
import type {
  EditorialDossier,
  EditorialFact,
  EditorialFreshnessStatus,
} from "@/types/editorial-dossier";
import type {
  EditorialGenerationMetadata,
  EditorialModelContext,
} from "@/types/content-generation";

const FACT_LIMIT = 24;
const CHRONOLOGY_LIMIT = 12;
const CITATION_LIMIT = 8;
const LEAD_LIMIT = 12;
const CONTRADICTION_LIMIT = 8;

const confidenceRank = { high: 3, medium: 2, low: 1, unknown: 0 } as const;
const freshnessRank: Record<EditorialFreshnessStatus, number> = {
  current: 3,
  historical: 2,
  unknown: 1,
  stale: 0,
};

const relevance = (fact: EditorialFact, target: EditorialGenerationTarget): number => {
  if (target.type === "article" && target.articleType === "actualite") {
    return fact.category === "news" || fact.category === "sports_result" || fact.category === "production" ? 5 : 1;
  }
  if (target.type === "article") {
    return fact.category === "profile" || fact.category === "historical_record" || fact.category === "citation" ? 4 : 2;
  }
  if (target.interviewType === "performance") {
    return fact.category === "sports_result" || fact.category === "historical_record" ? 5 : 2;
  }
  if (target.interviewType === "before_match" || target.interviewType === "after_match") {
    return fact.category === "sports_result" || fact.category === "schedule" ? 5 : 2;
  }
  return fact.category === "profile" || fact.category === "objective" || fact.category === "historical_record" ? 4 : 2;
};

const categoryAllowed = (fact: EditorialFact, target: EditorialGenerationTarget): boolean => {
  if (fact.category === "contact_request" || fact.category === "appointment") return false;
  if (fact.category === "health") {
    return target.type === "interview" && target.interviewType === "injury_return";
  }
  return true;
};

const factScore = (fact: EditorialFact, target: EditorialGenerationTarget): number =>
  relevance(fact, target) * 100
  + (fact.verificationStatus === "verified" ? 30 : fact.verificationStatus === "reported" ? 15 : 0)
  + freshnessRank[fact.freshness.status] * 10
  + confidenceRank[fact.confidence.level];

const safeFreshness = (status: EditorialFreshnessStatus): "current" | "historical" | "unknown" =>
  status === "current" || status === "historical" ? status : "unknown";

export type EditorialGenerationSelection = {
  modelContext: EditorialModelContext;
  metadata: EditorialGenerationMetadata;
};

export const selectEditorialGenerationContext = (
  dossier: EditorialDossier,
  eligibility: EditorialGenerationEligibility,
  target: EditorialGenerationTarget,
): EditorialGenerationSelection => {
  if (eligibility.status === "blocked") {
    throw new Error("Une selection de contexte ne peut pas etre construite pour une generation bloquee.");
  }

  const eligibleIds = new Set(eligibility.eligibleFactIds);
  const facts = dossier.facts
    .filter((fact) => fact.usable && eligibleIds.has(fact.factId))
    .filter((fact) => categoryAllowed(fact, target))
    .filter((fact) =>
      !(
        (target.type === "interview" || target.articleType === "actualite")
        && fact.freshness.status === "stale"
        && (fact.category === "news" || fact.category === "sports_result")
      ))
    .sort((left, right) => factScore(right, target) - factScore(left, target) || left.factId.localeCompare(right.factId))
    .slice(0, FACT_LIMIT);
  const factIds = new Set(facts.map((fact) => fact.factId));
  const citations = dossier.citations
    .filter((citation) => citation.verificationStatus !== "rejected")
    .sort((left, right) => left.citationId.localeCompare(right.citationId))
    .slice(0, CITATION_LIMIT);
  const leads = dossier.editorialLeads
    .filter((lead) => lead.category !== "generated_reference")
    .filter((lead) => lead.freshness.status !== "stale")
    .sort((left, right) =>
      confidenceRank[right.confidence.level] - confidenceRank[left.confidence.level]
      || left.leadId.localeCompare(right.leadId))
    .slice(0, LEAD_LIMIT);
  const sourceIds = new Set([
    ...facts.flatMap((fact) => fact.sourceIds),
    ...citations.flatMap((citation) => citation.sourceIds),
    ...leads.flatMap((lead) => lead.sourceIds),
  ]);
  const sources = dossier.sources
    .filter((source) => sourceIds.has(source.sourceId))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const sourceNames = (ids: string[]) =>
    ids.map((sourceId) => sourceById.get(sourceId)?.name).filter((name): name is string => Boolean(name));
  const contradictions = eligibility.contradictionSummaries.slice(0, CONTRADICTION_LIMIT);
  const userProvidedCitationTexts = new Set(
    citations
      .filter((citation) => citation.verificationStatus === "user_provided")
      .map((citation) => citation.text),
  );
  const userProvidedMaterials = [
    ...citations
      .filter((citation) => citation.verificationStatus === "user_provided")
      .map((citation) => ({
        kind: "verbatim_quote" as const,
        text: citation.text,
        provenance: sourceNames(citation.sourceIds).join(", ") || "Provenance non précisée",
        ...(citation.date ? { date: citation.date } : {}),
        ...(citation.author ? { speaker: citation.author } : {}),
      })),
    ...leads
      .filter((lead) =>
        lead.verificationStatus === "user_provided"
        && !userProvidedCitationTexts.has(lead.formulation))
      .map((lead) => ({
        kind: "note" as const,
        text: lead.formulation,
        provenance: sourceNames(lead.sourceIds).join(", ") || "Provenance non précisée",
        ...(lead.date ? { date: lead.date } : {}),
      })),
  ];

  const modelContext: EditorialModelContext = {
    generationMode: eligibility.status,
    subject: {
      type: dossier.subject.type,
      displayName: dossier.subject.displayName,
      ...(dossier.subject.sport ? { sport: dossier.subject.sport } : {}),
      ...(dossier.subject.clubOrOrganization ? { clubOrOrganization: dossier.subject.clubOrOrganization } : {}),
      ...(dossier.subject.publicRoleOrPosition ? { publicRoleOrPosition: dossier.subject.publicRoleOrPosition } : {}),
      identityBasis: dossier.subject.canonicalId
        ? "canonical"
        : dossier.subject.declaredInterviewIdentity?.hasAttributedCitation
          ? "declared_interview"
          : undefined,
    },
    facts: facts.map((fact) => ({
      category: fact.category,
      text: fact.formulation,
      verificationStatus: fact.verificationStatus,
      confidence: fact.confidence.level,
      freshness: safeFreshness(fact.freshness.status),
      ...(fact.eventDate ? { eventDate: fact.eventDate } : {}),
      sourceNames: sourceNames(fact.sourceIds),
    })),
    chronology: dossier.chronology
      .filter((entry) => !entry.blocked && entry.factIds.some((factId) => factIds.has(factId)))
      .sort((left, right) => right.date.localeCompare(left.date) || left.chronologyId.localeCompare(right.chronologyId))
      .slice(0, CHRONOLOGY_LIMIT)
      .map((entry) => ({ date: entry.date, text: entry.label })),
    citations: citations.map((citation) => ({
      text: citation.text,
      ...(citation.author ? { author: citation.author } : {}),
      verificationStatus: citation.verificationStatus,
      freshness: safeFreshness(citation.freshness.status),
      sourceNames: sourceNames(citation.sourceIds),
    })),
    editorialLeads: leads.map((lead) => ({
      text: lead.formulation,
      verificationStatus: lead.verificationStatus,
      confidence: lead.confidence.level,
    })),
    missingInformation: eligibility.missingInformation,
    unresolvedContradictions: contradictions,
  };

  return {
    modelContext,
    metadata: {
      dossierRevision: dossier.revision,
      generationMode: eligibility.status,
      confidence: {
        level: dossier.confidence.level,
        score: dossier.confidence.score,
        explanation: dossier.confidence.level === "unknown"
          ? []
          : [
              "La confiance globale correspond au fait exploitable le moins fiable transmis.",
              `Niveau limitant: ${dossier.confidence.level}.`,
            ],
      },
      usedSources: sources.map((source) => ({
        name: source.name,
        ...(source.url ? { url: source.url } : {}),
        ...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
        official: source.official,
        confidence: source.confidence.level,
      })),
      userProvidedMaterials,
      contradictions,
      missingInformation: eligibility.missingInformation,
      warnings: eligibility.warnings,
      identityBasis: dossier.subject.canonicalId
        ? "canonical"
        : dossier.subject.declaredInterviewIdentity?.hasAttributedCitation
          ? "declared_interview"
          : undefined,
    },
  };
};
