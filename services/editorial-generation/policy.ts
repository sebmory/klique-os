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
  itemDiagnostics: EditorialItemEligibilityDiagnostic[];
  suggestedArticleTypes: ArticleTypeId[];
};

export type EditorialItemEligibilityDiagnostic = {
  itemId: string;
  status: "eligible" | "caution" | "ineligible";
  reasons: string[];
};

const reliable = (fact: EditorialFact): boolean =>
  fact.confidence.level === "high" || fact.confidence.level === "medium";

const isIdentityOnlyFact = (fact: EditorialFact): boolean =>
  fact.semanticKey === "name";

const allowedForTarget = (fact: EditorialFact, target: EditorialGenerationTarget): boolean => {
  if (fact.category === "contact_request" || fact.category === "appointment") return false;
  if (fact.category === "health") {
    return target.type === "interview" && target.interviewType === "injury_return";
  }
  return true;
};

const applicableToArticle = (
  fact: EditorialFact,
  articleType: ArticleTypeId,
): boolean => {
  if (articleType !== "actualite") return true;
  return fact.freshness.status === "current"
    && (fact.category === "news" || fact.category === "sports_result" || fact.category === "production")
    && fact.explicitlyAttributedToSubject;
};

const buildItemDiagnostics = (
  dossier: EditorialDossier,
  target: EditorialGenerationTarget,
  eligibleFactIds: Set<string>,
): EditorialItemEligibilityDiagnostic[] => {
  const diagnostics = new Map<string, EditorialItemEligibilityDiagnostic>();
  const rank = { ineligible: 1, caution: 2, eligible: 3 } as const;
  const add = (itemId: string, status: EditorialItemEligibilityDiagnostic["status"], reasons: string[]) => {
    const existing = diagnostics.get(itemId);
    if (!existing || rank[status] > rank[existing.status]) {
      diagnostics.set(itemId, { itemId, status, reasons });
      return;
    }
    if (existing.status === status) {
      existing.reasons = Array.from(new Set([...existing.reasons, ...reasons]));
    }
  };

  for (const fact of dossier.facts) {
    let status: EditorialItemEligibilityDiagnostic["status"] = "ineligible";
    let reasons: string[];
    if (eligibleFactIds.has(fact.factId)) {
      status = "eligible";
      reasons = target.type === "article" && target.articleType === "actualite"
        ? ["Fait récent, attribué au sujet et suffisamment fiable pour cet article."]
        : ["Fait attribué au sujet et suffisamment fiable dans le périmètre de cet article."];
    } else if (fact.blockedByContradictionIds.length > 0 || !fact.usable) {
      reasons = ["Fait exclu en raison d’une contradiction non résolue."];
    } else if (!reliable(fact)) {
      reasons = [
        "Fait exclu car son niveau de confiance est insuffisant.",
        ...(fact.freshness.status === "stale"
          ? ["Fait exclu pour ancienneté dans le cadre de cet article."]
          : []),
      ];
    } else if (
      target.type === "article"
      && target.articleType === "actualite"
      && (fact.category === "news" || fact.category === "sports_result" || fact.category === "production")
      && fact.freshness.status === "current"
      && !fact.explicitlyAttributedToSubject
    ) {
      reasons = ["Fait exclu car il n’est pas explicitement attribué au sujet individuel."];
    } else {
      status = "caution";
      reasons = target.type === "article" && target.articleType === "actualite"
        ? ["Information utilisable comme contexte historique, mais pas comme actualité récente."]
        : ["Information utilisable avec prudence dans le périmètre demandé."];
    }
    for (const itemId of fact.sourceItemIds) add(itemId, status, reasons);
  }

  for (const lead of dossier.editorialLeads) {
    const reasons = lead.verificationStatus === "user_provided" || lead.verificationStatus === "unverified"
      ? ["Piste ou information manuelle non vérifiée : elle ne constitue pas une preuve factuelle."]
      : ["Piste éditoriale utilisable avec prudence, sans affirmation factuelle."];
    for (const itemId of lead.sourceItemIds) add(itemId, "caution", reasons);
  }

  return Array.from(diagnostics.values()).sort((left, right) => left.itemId.localeCompare(right.itemId));
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
  const attributedReliableFacts = reliableFacts.filter((fact) => fact.explicitlyAttributedToSubject);
  let applicableFacts = reliableFacts;
  let articleStatus: "ready" | "limited" | "blocked" | null = null;
  let articleReasons: string[] = [];
  let articleWarnings: string[] = [];

  if (target.type === "article") {
    if (target.articleType === "actualite") {
      applicableFacts = reliableFacts.filter((fact) => applicableToArticle(fact, target.articleType));
      if (!applicableFacts.length) {
        articleStatus = "blocked";
        articleReasons = [
          "Aucun fait individuel récent, explicitement attribué au sujet et suffisamment fiable n’est disponible pour un article d’actualité.",
        ];
      } else {
        articleStatus = contradictions.length ? "limited" : "ready";
      }
    } else if (target.articleType === "portrait") {
      applicableFacts = attributedReliableFacts.filter((fact) =>
        fact.category === "profile"
        || fact.category === "club_position"
        || fact.category === "sports_result"
        || fact.category === "historical_record"
        || fact.category === "objective"
        || fact.category === "news");
      const narrativeFacts = applicableFacts.filter((fact) =>
        fact.category === "sports_result"
        || fact.category === "historical_record"
        || fact.category === "objective"
        || fact.category === "news"
        || fact.semanticKey === "bio"
        || fact.semanticKey === "position"
        || fact.semanticKey === "palmares");
      const hasSafePortraitMaterial =
        applicableFacts.length > 0
        || dossier.chronology.some((entry) => !entry.blocked)
        || dossier.citations.some((citation) => citation.verificationStatus !== "rejected")
        || dossier.editorialLeads.some((lead) => lead.verificationStatus !== "rejected");
      if (!hasSafePortraitMaterial) {
        articleStatus = "blocked";
        articleReasons = ["Aucun élément exploitable n’est disponible pour construire un portrait prudent."];
      } else if (narrativeFacts.length >= 2 && contradictions.length === 0) {
        articleStatus = "ready";
      } else {
        articleStatus = "limited";
        articleReasons = ["La matière disponible permet uniquement un portrait prudent, limité aux faits confirmés."];
        articleWarnings = [
          "Ne pas inventer le parcours, les motivations, les résultats ni les citations du sujet.",
        ];
      }
    } else if (target.articleType === "analyse") {
      applicableFacts = attributedReliableFacts;
      if (applicableFacts.length < 2) {
        articleStatus = "blocked";
        articleReasons = ["Une analyse exige au moins deux faits fiables pour comparer, expliquer ou contextualiser."];
      } else {
        articleStatus = contradictions.length ? "limited" : "ready";
      }
    } else {
      applicableFacts = attributedReliableFacts;
      const hasSafeReportageMaterial =
        applicableFacts.length > 0
        || dossier.editorialLeads.some((lead) => lead.verificationStatus !== "rejected");
      if (!hasSafeReportageMaterial) {
        articleStatus = "blocked";
        articleReasons = ["Aucun contexte ni piste éditoriale sûre n’est disponible pour ce reportage."];
      } else {
        articleStatus = applicableFacts.length > 1 && contradictions.length === 0 ? "ready" : "limited";
        if (articleStatus === "limited") {
          articleReasons = ["Le reportage est limité au contexte et aux pistes sûres disponibles."];
          articleWarnings = [
            "Ne pas inventer d’observations de terrain, d’ambiances ni de citations.",
          ];
        }
      }
    }
  }
  const eligibleFactIds = applicableFacts.map((fact) => fact.factId).sort();
  const itemDiagnostics = buildItemDiagnostics(dossier, target, new Set(eligibleFactIds));
  const hasHistoricalReliableFacts = reliableFacts.some((fact) =>
    fact.freshness.status === "historical"
    || fact.category === "profile"
    || fact.category === "historical_record");
  const suggestedArticleTypes: ArticleTypeId[] =
    target.type === "article" && target.articleType === "actualite" && hasHistoricalReliableFacts
      ? ["portrait", "analyse"]
      : [];

  if (target.type === "article") {
    reasons.push(...articleReasons);
    warnings.push(...articleWarnings);
    if (reasons.length) {
      if (articleStatus !== "blocked" && identityPresent && projectedElementCount > 0) {
        return {
          status: articleStatus ?? "limited",
          reasons,
          warnings,
          missingInformation,
          contradictionSummaries: contradictions,
          eligibleFactIds,
          itemDiagnostics,
          suggestedArticleTypes,
        };
      }
      return {
        status: "blocked",
        reasons,
        warnings,
        missingInformation,
        contradictionSummaries: contradictions,
        eligibleFactIds,
        itemDiagnostics,
        suggestedArticleTypes,
      };
    }

    if (
      articleStatus === "limited"
      || contradictions.length
      || dossier.confidence.level === "low"
      || dossier.freshness.status === "stale"
    ) {
      warnings.push("Le perimetre factuel a ete reduit aux seuls faits fiables et non contradictoires.");
      return {
        status: "limited",
        reasons: articleReasons.length ? articleReasons : ["Des limites editoriales imposent un contexte factuel reduit."],
        warnings,
        missingInformation,
        contradictionSummaries: contradictions,
        eligibleFactIds,
        itemDiagnostics,
        suggestedArticleTypes,
      };
    }

    return {
      status: "ready",
      reasons: ["Identite canonique et faits fiables disponibles."],
      warnings,
      missingInformation,
      contradictionSummaries: contradictions,
      eligibleFactIds,
      itemDiagnostics,
      suggestedArticleTypes,
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
      itemDiagnostics,
      suggestedArticleTypes,
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
        itemDiagnostics,
        suggestedArticleTypes,
      };
    }
    return {
      status: "ready",
      reasons: ["Identite canonique et faits exploitables disponibles."],
      warnings,
      missingInformation,
      contradictionSummaries: contradictions,
      eligibleFactIds: reliableFacts.map((fact) => fact.factId).sort(),
      itemDiagnostics,
      suggestedArticleTypes,
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
      itemDiagnostics,
      suggestedArticleTypes,
    };
  }

  return {
    status: "blocked",
    reasons: ["Aucun fait exploitable ni piste editoriale sure n est disponible."],
    warnings,
    missingInformation,
    contradictionSummaries: contradictions,
    eligibleFactIds: [],
    itemDiagnostics,
    suggestedArticleTypes,
  };
};
