import type { EditorialDossier, EditorialFact } from "@/types/editorial-dossier";
import type { ArticleTypeId, InterviewTypeId } from "@/types/content-generation";

export type EditorialGenerationTarget =
  | { type: "interview"; interviewType?: InterviewTypeId }
  | { type: "article"; articleType: ArticleTypeId };

export type EditorialGenerationEligibility = {
  status: "ready" | "limited" | "blocked";
  reasons: string[];
  warnings: string[];
  missingInformation: string[];
  contradictionSummaries: string[];
  eligibleFactIds: string[];
};

const reliable = (fact: EditorialFact): boolean =>
  (fact.confidence.level === "high" || fact.confidence.level === "medium")
  && !(fact.freshness.status === "stale" && (fact.category === "news" || fact.category === "sports_result"));

const isIdentityOnlyFact = (fact: EditorialFact): boolean =>
  fact.semanticKey === "name";

const allowedForTarget = (fact: EditorialFact, target: EditorialGenerationTarget): boolean => {
  if (fact.category === "contact_request" || fact.category === "appointment") return false;
  if (fact.category === "health") {
    return target.type === "interview" && target.interviewType === "injury_return";
  }
  return true;
};

const applicableToArticle = (fact: EditorialFact, articleType: ArticleTypeId): boolean => {
  if (articleType !== "actualite") return true;
  return fact.freshness.status === "current"
    && (fact.category === "news" || fact.category === "sports_result" || fact.category === "production");
};

const contradictionSummaries = (dossier: EditorialDossier): string[] =>
  dossier.contradictions
    .filter((contradiction) => contradiction.status === "unresolved")
    .sort((left, right) => left.contradictionId.localeCompare(right.contradictionId))
    .map((contradiction, index) =>
      `Contradiction ${contradiction.status === "unresolved" ? "non resolue" : "resolue"} ${index + 1}: les formulations concernees ont ete exclues sans arbitrage.`);

export const evaluateEditorialGenerationEligibility = (
  dossier: EditorialDossier,
  target: EditorialGenerationTarget,
): EditorialGenerationEligibility => {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const missingInformation = dossier.missingInformation.map((item) => item.label);
  const contradictions = contradictionSummaries(dossier);
  const identityPresent = Boolean(dossier.subject.canonicalId?.trim() && dossier.subject.displayName.trim());
  const projectedElementCount = dossier.facts.length + dossier.editorialLeads.length + dossier.citations.length;

  if (!identityPresent) {
    reasons.push("L identite canonique du sujet est absente ou incomplete.");
  }
  if (projectedElementCount === 0) {
    reasons.push("La projection autorisee pour ce role ne contient aucun element editorial.");
  }

  const usableFacts = dossier.facts.filter((fact) => fact.usable);
  const targetUsableFacts = usableFacts.filter((fact) => !isIdentityOnlyFact(fact) && allowedForTarget(fact, target));
  const reliableFacts = targetUsableFacts.filter(reliable);
  const applicableFacts = target.type === "article"
    ? reliableFacts.filter((fact) => applicableToArticle(fact, target.articleType))
    : reliableFacts;

  if (target.type === "article") {
    if (!applicableFacts.length) {
      reasons.push(
        target.articleType === "actualite"
          ? "Un article d actualite exige au moins un fait recent, exploitable et suffisamment fiable."
          : "Un article factuel exige au moins un fait exploitable et suffisamment fiable.",
      );
    }
    if (reasons.length) {
      return {
        status: "blocked",
        reasons,
        warnings,
        missingInformation,
        contradictionSummaries: contradictions,
        eligibleFactIds: applicableFacts.map((fact) => fact.factId).sort(),
      };
    }

    if (contradictions.length || dossier.confidence.level === "low" || dossier.freshness.status === "stale") {
      warnings.push("Le perimetre factuel a ete reduit aux seuls faits fiables et non contradictoires.");
      return {
        status: "limited",
        reasons: ["Des limites editoriales imposent un contexte factuel reduit."],
        warnings,
        missingInformation,
        contradictionSummaries: contradictions,
        eligibleFactIds: applicableFacts.map((fact) => fact.factId).sort(),
      };
    }

    return {
      status: "ready",
      reasons: ["Identite canonique et faits fiables disponibles."],
      warnings,
      missingInformation,
      contradictionSummaries: contradictions,
      eligibleFactIds: applicableFacts.map((fact) => fact.factId).sort(),
    };
  }

  if (reasons.length) {
    return {
      status: "blocked",
      reasons,
      warnings,
      missingInformation,
      contradictionSummaries: contradictions,
      eligibleFactIds: reliableFacts.map((fact) => fact.factId).sort(),
    };
  }

  if (reliableFacts.length) {
    if (contradictions.length) {
      warnings.push("Les faits contradictoires sont exclus et ne doivent pas etre arbitres.");
      return {
        status: "limited",
        reasons: ["L interview est limitee aux faits non contradictoires."],
        warnings,
        missingInformation,
        contradictionSummaries: contradictions,
        eligibleFactIds: reliableFacts.map((fact) => fact.factId).sort(),
      };
    }
    return {
      status: "ready",
      reasons: ["Identite canonique et faits exploitables disponibles."],
      warnings,
      missingInformation,
      contradictionSummaries: contradictions,
      eligibleFactIds: reliableFacts.map((fact) => fact.factId).sort(),
    };
  }

  const hasExploratoryMaterial = dossier.editorialLeads.length > 0 || dossier.citations.length > 0 || targetUsableFacts.length > 0;
  if (hasExploratoryMaterial) {
    warnings.push("Mode exploratoire: formuler uniquement des questions ouvertes et ne confirmer aucune hypothese.");
    return {
      status: "limited",
      reasons: ["Aucun fait suffisamment fiable, mais des pistes editoriales autorisees sont disponibles."],
      warnings,
      missingInformation,
      contradictionSummaries: contradictions,
      eligibleFactIds: targetUsableFacts.map((fact) => fact.factId).sort(),
    };
  }

  return {
    status: "blocked",
    reasons: ["Aucun fait exploitable ni piste editoriale sure n est disponible."],
    warnings,
    missingInformation,
    contradictionSummaries: contradictions,
    eligibleFactIds: [],
  };
};
