import { createHash } from "node:crypto";
import type { ContextItem, ContextSubject } from "@/types/context-intelligence";
import type {
  EditorialChronologyEntry,
  EditorialCitation,
  EditorialConfidence,
  EditorialContradiction,
  EditorialDossier,
  EditorialDossierRole,
  EditorialFact,
  EditorialFactCategory,
  EditorialFreshness,
  EditorialLead,
  EditorialMissingInformation,
  EditorialSource,
  EditorialSubject,
  EditorialVisibility,
} from "@/types/editorial-dossier";
import {
  calculateEditorialFreshness,
  DEFAULT_EDITORIAL_FRESHNESS_POLICIES,
} from "@/services/editorial-dossier/policies";
import {
  isEditorialVisibilityAllowed,
  resolveEditorialVisibility,
} from "@/services/editorial-dossier/visibility";

export type SecuredEditorialCollectionInput = {
  id: string;
  workspaceId: string;
  items: ContextItem[];
  createdAt: string;
};

export type BuildEditorialDossierInput = {
  collection: SecuredEditorialCollectionInput;
  authenticatedWorkspaceId: string;
  subject: ContextSubject;
  role: EditorialDossierRole;
  revision?: number;
};

const confidenceScore = {
  high: 90,
  medium: 65,
  low: 35,
  unknown: 10,
} as const;

const confidenceRank = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
} as const;

const normalizeText = (value: unknown): string =>
  String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeComparable = (value: unknown): string =>
  normalizeText(value).toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalizeDate = (value: unknown): string | undefined => {
  const text = normalizeText(value);
  if (!text) return undefined;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
};

const stableId = (prefix: string, value: unknown): string => {
  const digest = createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}-${digest}`;
};

const metadataText = (item: ContextItem, key: string): string =>
  normalizeText(item.metadata[key]);

const metadataBoolean = (item: ContextItem, key: string): boolean =>
  item.metadata[key] === true || item.metadata[key] === "true";

export const normalizeEditorialCategory = (item: ContextItem): EditorialFactCategory => {
  const fieldId = metadataText(item, "fieldId").toLowerCase();
  const dataClass = metadataText(item, "dataClass").toLowerCase();
  if (dataClass === "health" || item.category === "injury_or_return") return "health";
  if (dataClass === "contact_request") return "contact_request";
  if (dataClass === "appointment") return "appointment";
  if (fieldId.includes("palmares")) return "historical_record";
  if (fieldId.includes("objective") || fieldId.includes("goal")) return "objective";
  if (fieldId === "club" || fieldId === "position") return "club_position";

  switch (item.category) {
    case "profile":
      return "profile";
    case "club_or_organization":
    case "transfer_or_contract":
      return "club_position";
    case "performance":
    case "result":
      return "sports_result";
    case "recent_news":
    case "selection":
    case "event":
      return "news";
    case "production":
      return "production";
    case "schedule":
      return "schedule";
    case "previous_content":
      return "generated_reference";
    default:
      return metadataBoolean(item, "citation") ? "citation" : "other";
  }
};

const itemFormulation = (item: ContextItem): string =>
  normalizeText(item.editedSummary) || normalizeText(item.factualStatement) || normalizeText(item.summary);

const itemReferenceDate = (item: ContextItem): string | undefined =>
  normalizeDate(item.metadata.eventDate)
  || normalizeDate(item.metadata.validAt)
  || normalizeDate(item.publishedAt)
  || normalizeDate(item.retrievedAt);

const itemEventDate = (item: ContextItem): string | undefined =>
  normalizeDate(item.metadata.eventDate) || normalizeDate(item.publishedAt);

const semanticKey = (item: ContextItem, category: EditorialFactCategory): string =>
  normalizeComparable(
    metadataText(item, "contradictionKey")
    || metadataText(item, "factKey")
    || metadataText(item, "fieldId")
    || `${category}:${item.title}`,
  );

const sourceVisibility = (
  item: ContextItem,
  itemVisibility: EditorialVisibility,
): EditorialVisibility => {
  if (itemVisibility === "sensitive" || itemVisibility === "admin_only") return itemVisibility;
  if (item.sourceType === "official" || item.sourceType === "media" || item.sourceType === "external") {
    return item.publishedAt ? "public" : itemVisibility;
  }
  return itemVisibility;
};

const calculateItemConfidence = (
  item: ContextItem,
  freshness: EditorialFreshness,
): EditorialConfidence => {
  let level = item.confidence;
  const reasons = [`Confiance source declaree: ${item.confidence}.`];

  if (item.sourceType === "user" || item.verificationStatus === "user_provided") {
    level = "low";
    reasons.push("Information manuelle non confirmee: confiance plafonnee a faible.");
  } else if (item.verificationStatus === "unverified" || item.verificationStatus === "rejected") {
    level = "low";
    reasons.push("Information non verifiee: confiance plafonnee a faible.");
  } else if (item.sourceType === "internal" && confidenceRank[level] > confidenceRank.medium) {
    level = "medium";
    reasons.push("Une origine interne n est pas automatiquement elevee.");
  } else if (
    item.sourceType === "official"
    && item.verificationStatus === "verified"
    && freshness.status === "current"
  ) {
    level = "high";
    reasons.push("Source officielle, verifiee et encore actuelle.");
  }

  if (freshness.status === "stale" && confidenceRank[level] > confidenceRank.low) {
    level = level === "high" ? "medium" : "low";
    reasons.push("Donnee perimee selon sa politique de fraicheur.");
  }

  return {
    level,
    score: confidenceScore[level],
    reasons,
  };
};

type SourceAccumulator = EditorialSource & {
  identity: string;
};

const buildSources = (
  items: ContextItem[],
  generatedAt: string,
  visibilityByItemId: Map<string, EditorialVisibility>,
): { sources: EditorialSource[]; sourceIdsByItemId: Map<string, string[]> } => {
  const sourceByIdentity = new Map<string, SourceAccumulator>();
  const sourceIdsByItemId = new Map<string, string[]>();

  const addSource = (
    item: ContextItem,
    source: {
      type: ContextItem["sourceType"];
      name: string;
      url?: string;
      publishedAt?: string;
      internalReference?: string;
    },
  ): string => {
    const safeUrl = source.url?.startsWith("https://") ? source.url : undefined;
    const publishedAt = normalizeDate(source.publishedAt);
    const collectedAt = normalizeDate(item.retrievedAt) ?? generatedAt;
    const itemVisibility = visibilityByItemId.get(item.id) ?? "workspace_internal";
    const visibility = sourceVisibility(item, itemVisibility);
    const identity = JSON.stringify({
      type: source.type,
      name: normalizeText(source.name),
      url: safeUrl ?? "",
      internalReference: normalizeText(source.internalReference),
    });
    const sourceId = stableId("source", identity);
    const freshness = calculateEditorialFreshness(
      normalizeEditorialCategory(item),
      generatedAt,
      publishedAt ?? collectedAt,
    );
    const confidence = calculateItemConfidence(item, freshness);
    const existing = sourceByIdentity.get(identity);

    if (!existing) {
      sourceByIdentity.set(identity, {
        identity,
        sourceId,
        type: source.type,
        name: normalizeText(source.name) || "Source non nommee",
        ...(safeUrl ? { url: safeUrl } : {}),
        ...(normalizeText(source.internalReference)
          ? { internalReference: normalizeText(source.internalReference) }
          : {}),
        ...(publishedAt ? { publishedAt } : {}),
        collectedAt,
        official: source.type === "official",
        confidence,
        visibility,
      });
    }
    return sourceId;
  };

  for (const item of items) {
    const ids = [
      addSource(item, {
        type: item.sourceType,
        name: item.sourceName,
        url: item.sourceUrl,
        publishedAt: item.publishedAt,
        internalReference: item.internalReference,
      }),
      ...(item.alternateSources ?? []).map((source) =>
        addSource(item, {
          type: source.sourceType,
          name: source.sourceName,
          url: source.sourceUrl,
          publishedAt: source.publishedAt,
        })),
    ];
    sourceIdsByItemId.set(item.id, Array.from(new Set(ids)).sort());
  }

  return {
    sources: Array.from(sourceByIdentity.values())
      .map((accumulator) => {
        const { identity, ...source } = accumulator;
        void identity;
        return source;
      })
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    sourceIdsByItemId,
  };
};

const buildSubject = (subject: ContextSubject, items: ContextItem[]): EditorialSubject => {
  const trustedFields = new Map<string, string>();
  for (const item of items) {
    if (item.sourceName !== "Projection editoriale Athlete") continue;
    const fieldId = metadataText(item, "fieldId");
    const value = itemFormulation(item);
    if (fieldId && value && !trustedFields.has(fieldId)) trustedFields.set(fieldId, value);
  }

  return {
    type: normalizeText(subject.type) || "other",
    canonicalId: normalizeText(subject.id) || undefined,
    displayName: trustedFields.get("name") || normalizeText(subject.displayName),
    sport: trustedFields.get("sport") || normalizeText(subject.sport) || undefined,
    clubOrOrganization: trustedFields.get("club") || normalizeText(subject.clubOrOrganization) || undefined,
    publicRoleOrPosition: trustedFields.get("position") || normalizeText(subject.disciplineOrPosition) || undefined,
  };
};

const buildMissingInformation = (
  subject: EditorialSubject,
  facts: EditorialFact[],
  sources: EditorialSource[],
): EditorialMissingInformation[] => {
  const missing: EditorialMissingInformation[] = [];
  if (!subject.canonicalId) {
    missing.push({ code: "SUBJECT_CANONICAL_ID", label: "Identifiant canonique du sujet manquant.", blocksFactualGeneration: false });
  }
  if (!subject.sport) {
    missing.push({ code: "SUBJECT_SPORT", label: "Sport ou domaine du sujet manquant.", blocksFactualGeneration: false });
  }
  if (!subject.clubOrOrganization) {
    missing.push({ code: "SUBJECT_ORGANIZATION", label: "Club ou organisation du sujet manquant.", blocksFactualGeneration: false });
  }
  if (!subject.publicRoleOrPosition) {
    missing.push({ code: "SUBJECT_PUBLIC_ROLE", label: "Role ou poste public du sujet manquant.", blocksFactualGeneration: false });
  }
  if (!facts.some((fact) => fact.usable)) {
    missing.push({ code: "NO_USABLE_FACTS", label: "Aucun fait exploitable sans contradiction.", blocksFactualGeneration: true });
  }
  if (!sources.length) {
    missing.push({ code: "NO_SOURCES", label: "Aucune source conservee.", blocksFactualGeneration: true });
  }
  return missing;
};

const buildOverallConfidence = (facts: EditorialFact[]): EditorialDossier["confidence"] => {
  const usableFacts = facts.filter((fact) => fact.usable);
  if (!usableFacts.length) {
    return {
      level: "unknown",
      score: 0,
      usableFactIds: [],
      reasons: ["Aucun fait exploitable: la generation factuelle peut etre bloquee, mais les angles restent possibles."],
    };
  }

  const weakest = usableFacts.reduce((current, fact) =>
    confidenceRank[fact.confidence.level] < confidenceRank[current.confidence.level] ? fact : current);
  return {
    level: weakest.confidence.level,
    score: weakest.confidence.score,
    usableFactIds: usableFacts.map((fact) => fact.factId).sort(),
    reasons: [
      "La confiance globale est bornee par le fait exploitable le plus faible.",
      `Fait limitant: ${weakest.factId} (${weakest.confidence.level}).`,
    ],
  };
};

const buildOverallFreshness = (facts: EditorialFact[], generatedAt: string): EditorialFreshness => {
  const usable = facts.filter((fact) => fact.usable);
  const statuses = new Set(usable.map((fact) => fact.freshness.status));
  const status: EditorialFreshness["status"] =
    statuses.has("stale")
      ? "stale"
      : statuses.size > 0 && Array.from(statuses).every((value) => value === "historical")
        ? "historical"
        : statuses.has("current")
          ? "current"
          : "unknown";
  return {
    status,
    asOf: generatedAt,
    policyId: "dossier-aggregate",
    reasons: [
      status === "stale"
        ? "Au moins un fait exploitable est perime."
        : status === "historical"
          ? "Tous les faits exploitables sont historiques."
          : status === "current"
            ? "Aucun fait exploitable n est perime et au moins un est actuel."
            : "Fraicheur globale indeterminable.",
    ],
  };
};

const projectSubject = (
  subject: EditorialSubject,
  role: EditorialDossierRole,
): EditorialSubject => role === "media"
  ? {
      type: subject.type,
      canonicalId: subject.canonicalId,
      displayName: subject.displayName,
      sport: subject.sport,
      clubOrOrganization: subject.clubOrOrganization,
      publicRoleOrPosition: subject.publicRoleOrPosition,
    }
  : subject;

export const projectEditorialDossier = (
  dossier: EditorialDossier,
  role: EditorialDossierRole,
): EditorialDossier => {
  if (role !== "admin" && role !== "media") {
    throw new Error("Role sans acces au dossier editorial.");
  }

  const facts = dossier.facts.filter((fact) => isEditorialVisibilityAllowed(fact.visibility, role));
  const factIds = new Set(facts.map((fact) => fact.factId));
  const leads = dossier.editorialLeads.filter((lead) => isEditorialVisibilityAllowed(lead.visibility, role));
  const citations = dossier.citations.filter((citation) => isEditorialVisibilityAllowed(citation.visibility, role));
  const sourceIds = new Set([
    ...facts.flatMap((fact) => fact.sourceIds),
    ...leads.flatMap((lead) => lead.sourceIds),
    ...citations.flatMap((citation) => citation.sourceIds),
  ]);
  const sources = dossier.sources.filter((source) =>
    sourceIds.has(source.sourceId) && isEditorialVisibilityAllowed(source.visibility, role));
  const availableSourceIds = new Set(sources.map((source) => source.sourceId));
  const projectedFacts = facts.map((fact) => ({
    ...fact,
    sourceIds: fact.sourceIds.filter((sourceId) => availableSourceIds.has(sourceId)),
  }));
  const contradictions = dossier.contradictions
    .map((contradiction) => ({
      ...contradiction,
      factIds: contradiction.factIds.filter((factId) => factIds.has(factId)),
    }))
    .filter((contradiction) => contradiction.factIds.length >= 2);
  const contradictionIds = new Set(contradictions.map((item) => item.contradictionId));
  const finalFacts = projectedFacts.map((fact) => ({
    ...fact,
    blockedByContradictionIds: fact.blockedByContradictionIds.filter((id) => contradictionIds.has(id)),
  }));
  const chronology = dossier.chronology
    .map((entry) => ({
      ...entry,
      factIds: entry.factIds.filter((factId) => factIds.has(factId)),
      sourceIds: entry.sourceIds.filter((sourceId) => availableSourceIds.has(sourceId)),
    }))
    .filter((entry) => entry.factIds.length > 0);
  const subject = projectSubject(dossier.subject, role);

  return {
    ...dossier,
    subject,
    facts: finalFacts,
    editorialLeads: leads.map((lead) => ({
      ...lead,
      sourceIds: lead.sourceIds.filter((sourceId) => availableSourceIds.has(sourceId)),
    })),
    citations: citations.map((citation) => ({
      ...citation,
      sourceIds: citation.sourceIds.filter((sourceId) => availableSourceIds.has(sourceId)),
    })),
    sources,
    chronology,
    contradictions,
    missingInformation: buildMissingInformation(subject, finalFacts, sources),
    freshness: buildOverallFreshness(finalFacts, dossier.generatedAt),
    confidence: buildOverallConfidence(finalFacts),
    visibilityProjection: role,
  };
};

export const buildEditorialDossier = (input: BuildEditorialDossierInput): EditorialDossier => {
  if (input.role !== "admin" && input.role !== "media") {
    throw new Error("Role sans acces au dossier editorial.");
  }
  if (!input.authenticatedWorkspaceId || input.collection.workspaceId !== input.authenticatedWorkspaceId) {
    throw new Error("Collection editoriale hors workspace authentifie.");
  }

  const generatedAt = normalizeDate(input.collection.createdAt);
  if (!generatedAt) throw new Error("Date de collection editoriale invalide.");
  const revision = Math.max(1, Math.floor(input.revision ?? 1));
  const selectedItems = input.collection.items
    .filter((item) => item.isSelected)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  const visibilityByItemId = new Map<string, EditorialVisibility>();
  const categoryByItemId = new Map<string, EditorialFactCategory>();
  const visibilityReasonsByItemId = new Map<string, string[]>();

  for (const item of selectedItems) {
    const category = normalizeEditorialCategory(item);
    const visibility = resolveEditorialVisibility(item, category);
    categoryByItemId.set(item.id, category);
    visibilityByItemId.set(item.id, visibility.visibility);
    visibilityReasonsByItemId.set(item.id, visibility.reasons);
  }

  const { sources, sourceIdsByItemId } = buildSources(selectedItems, generatedAt, visibilityByItemId);
  const facts: EditorialFact[] = [];
  const editorialLeads: EditorialLead[] = [];
  const citations: EditorialCitation[] = [];

  for (const item of selectedItems) {
    const category = categoryByItemId.get(item.id) ?? "other";
    const visibility = visibilityByItemId.get(item.id) ?? "workspace_internal";
    const visibilityReasons = visibilityReasonsByItemId.get(item.id) ?? [];
    const formulation = itemFormulation(item);
    if (!formulation) continue;
    const freshness = calculateEditorialFreshness(category, generatedAt, itemReferenceDate(item));
    const confidence = calculateItemConfidence(item, freshness);
    const sourceIds = sourceIdsByItemId.get(item.id) ?? [];
    const sensitive = visibility === "sensitive" || visibility === "admin_only" && (
      category === "contact_request" || category === "appointment"
    );
    const isCitation = category === "citation" || metadataBoolean(item, "citation");
    const isLead =
      item.statementType === "editorial_lead"
      || item.connectorId === "previous_content"
      || item.sourceType === "user"
      || item.verificationStatus === "user_provided"
      || item.verificationStatus === "unverified"
      || item.verificationStatus === "rejected";

    if (isCitation) {
      citations.push({
        citationId: stableId("citation", { itemId: item.id, formulation, sourceIds }),
        text: formulation,
        author: metadataText(item, "author") || undefined,
        sourceIds,
        date: itemEventDate(item),
        verificationStatus: item.verificationStatus,
        visibility,
        freshness,
      });
    }

    if (isLead) {
      editorialLeads.push({
        leadId: stableId("lead", { itemId: item.id, formulation, sourceIds }),
        category,
        formulation,
        sourceIds,
        confidence,
        verificationStatus: item.verificationStatus,
        visibility,
        sensitive,
        freshness,
        reasons: [
          ...confidence.reasons,
          item.connectorId === "previous_content"
            ? "Contenu precedemment genere: reference editoriale, jamais preuve factuelle automatique."
            : "Piste editoriale non promue en fait exploitable.",
        ],
        sourceItemIds: [item.id],
      });
      continue;
    }

    const structured = item.metadata.value;
    facts.push({
      factId: stableId("fact", { itemId: item.id, formulation, sourceIds }),
      semanticKey: semanticKey(item, category),
      category,
      formulation,
      structuredValue:
        typeof structured === "string" || typeof structured === "number" || typeof structured === "boolean"
          ? structured
          : undefined,
      validAt: normalizeDate(item.metadata.validAt),
      eventDate: itemEventDate(item),
      sourceIds,
      confidence,
      verificationStatus: item.verificationStatus,
      visibility,
      sensitive,
      freshness,
      confidenceReasons: confidence.reasons,
      visibilityReasons,
      usable: true,
      blockedByContradictionIds: [],
      sourceItemIds: [item.id],
    });
  }

  const contradictionGroups = new Map<string, EditorialFact[]>();
  for (const fact of facts) {
    const list = contradictionGroups.get(fact.semanticKey) ?? [];
    list.push(fact);
    contradictionGroups.set(fact.semanticKey, list);
  }
  const contradictions: EditorialContradiction[] = [];
  for (const [key, groupedFacts] of contradictionGroups) {
    const formulations = Array.from(new Set(groupedFacts.map((fact) => normalizeComparable(fact.formulation))));
    if (groupedFacts.length < 2 || formulations.length < 2) continue;
    const contradictionId = stableId("contradiction", {
      key,
      factIds: groupedFacts.map((fact) => fact.factId).sort(),
    });
    const resolved = groupedFacts.every((fact) =>
      fact.sourceItemIds.every((itemId) => {
        const item = selectedItems.find((candidate) => candidate.id === itemId);
        return item ? metadataBoolean(item, "contradictionResolved") : false;
      }));
    contradictions.push({
      contradictionId,
      semanticKey: key,
      factIds: groupedFacts.map((fact) => fact.factId).sort(),
      formulations: groupedFacts.map((fact) => fact.formulation).sort(),
      status: resolved ? "resolved" : "unresolved",
      reasons: [
        resolved
          ? "Desaccord conserve mais marque resolu par les donnees source."
          : "Formulations incompatibles conservees sans arbitrage automatique.",
      ],
    });
    if (!resolved) {
      for (const fact of groupedFacts) {
        fact.usable = false;
        fact.blockedByContradictionIds.push(contradictionId);
        fact.confidenceReasons = [...fact.confidenceReasons, "Fait bloque par une contradiction non resolue."];
      }
    }
  }

  const chronologyByDate = new Map<string, EditorialChronologyEntry>();
  for (const fact of facts) {
    const date = fact.eventDate ?? fact.validAt;
    if (!date) continue;
    const existing = chronologyByDate.get(date);
    if (existing) {
      existing.factIds.push(fact.factId);
      existing.sourceIds = Array.from(new Set([...existing.sourceIds, ...fact.sourceIds])).sort();
      existing.blocked = existing.blocked || !fact.usable;
      continue;
    }
    chronologyByDate.set(date, {
      chronologyId: stableId("chronology", { date, factId: fact.factId }),
      date,
      label: fact.formulation,
      factIds: [fact.factId],
      sourceIds: fact.sourceIds,
      blocked: !fact.usable,
    });
  }

  const subject = buildSubject(input.subject, selectedItems);
  const dossierId = stableId("dossier", {
    workspaceId: input.collection.workspaceId,
    collectionId: input.collection.id,
    revision,
  });
  const adminDossier: EditorialDossier = {
    dossierId,
    workspaceId: input.collection.workspaceId,
    revision,
    subject,
    chronology: Array.from(chronologyByDate.values())
      .map((entry) => ({
        ...entry,
        factIds: entry.factIds.sort(),
      }))
      .sort((left, right) => left.date.localeCompare(right.date) || left.chronologyId.localeCompare(right.chronologyId)),
    facts: facts.sort((left, right) => left.factId.localeCompare(right.factId)),
    editorialLeads: editorialLeads.sort((left, right) => left.leadId.localeCompare(right.leadId)),
    citations: citations.sort((left, right) => left.citationId.localeCompare(right.citationId)),
    sources,
    contradictions: contradictions.sort((left, right) => left.contradictionId.localeCompare(right.contradictionId)),
    missingInformation: [],
    freshness: buildOverallFreshness(facts, generatedAt),
    confidence: buildOverallConfidence(facts),
    generatedAt,
    sourceCollectionId: input.collection.id,
    visibilityProjection: "admin",
  };
  adminDossier.missingInformation = buildMissingInformation(subject, adminDossier.facts, sources);

  return projectEditorialDossier(adminDossier, input.role);
};

export const editorialFreshnessPolicies = DEFAULT_EDITORIAL_FRESHNESS_POLICIES;
