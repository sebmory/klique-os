import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";

export type KliqueVisibilityFormat =
  | "photo"
  | "video"
  | "carousel"
  | "story"
  | "reel"
  | "article"
  | "live"
  | "other";

export type KliqueVisibilityNetwork =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "linkedin"
  | "website"
  | "other";

export type KliqueVisibilityHistoryScope = "global" | "athlete";

export type VisibilityOrigin =
  | "legacy_unclassified"
  | "klique_owned"
  | "klique_distributed"
  | "external_coverage";

export type VisibilityEditorialCategory =
  | "legacy_unclassified"
  | "athlete_welcome"
  | "photo_gallery"
  | "athlete_of_month"
  | "interview"
  | "portrait"
  | "performance"
  | "media_day"
  | "news"
  | "partner_expert"
  | "behind_the_scenes"
  | "event"
  | "other";

export type VisibilityMetricSource = "manual" | "import" | "api";

export type VisibilityAudienceTrackingState = {
  status: "in_progress" | "closed";
  theoreticalClosingDate: string;
};

export type VisibilityMetricSnapshot = {
  id: string;
  workspaceId: string;
  publicationId: string;
  observedAt: string;
  views: number;
  reach: number | null;
  impressions: number | null;
  source: VisibilityMetricSource;
  createdByClerkUserId: string;
  createdAt: string;
};

export type VisibilityPublicationClassificationInput = {
  origin: VisibilityOrigin;
  publisherName?: string | null;
  externalPostId?: string | null;
};

export type VisibilityMetricSnapshotInput = {
  observedAt: string;
  views: number;
  reach?: number | null;
  impressions?: number | null;
  source: VisibilityMetricSource;
};

export const kliqueVisibilityFormats: KliqueVisibilityFormat[] = [
  "photo", "video", "carousel", "story", "reel", "article", "live", "other",
];

export const kliqueVisibilityNetworks: KliqueVisibilityNetwork[] = [
  "instagram", "tiktok", "facebook", "youtube", "linkedin", "website", "other",
];

export const visibilityOrigins: VisibilityOrigin[] = [
  "legacy_unclassified", "klique_owned", "klique_distributed", "external_coverage",
];

export const visibilityEditorialCategories: VisibilityEditorialCategory[] = [
  "legacy_unclassified", "athlete_welcome", "photo_gallery", "athlete_of_month", "interview", "portrait",
  "performance", "media_day", "news", "partner_expert", "behind_the_scenes", "event", "other",
];

export const visibilityMetricSources: VisibilityMetricSource[] = ["manual", "import", "api"];

// Publication reelle: format, reseau, date, lien facultatif, un ou plusieurs athletes.
export type KliqueVisibilityPublication = {
  id: string;
  workspaceId: string;
  format: KliqueVisibilityFormat;
  network: KliqueVisibilityNetwork;
  publishedAt: string;
  link: string | null;
  title: string | null;
  editorialCategory: VisibilityEditorialCategory;
  origin: VisibilityOrigin;
  publisherName: string | null;
  externalPostId: string | null;
  athleteIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type KliqueVisibilityPublicationInput = {
  format: KliqueVisibilityFormat;
  network: KliqueVisibilityNetwork;
  publishedAt: string;
  link?: string | null;
  title: string;
  editorialCategory: VisibilityEditorialCategory;
  athleteIds: string[];
};

// Reprise historique saisie manuellement: periode, format, reseau, athlete et quantite (jamais des publications individuelles).
export type KliqueVisibilityHistoryEntry = {
  id: string;
  workspaceId: string;
  scope: KliqueVisibilityHistoryScope;
  periodStart: string;
  periodEnd: string;
  format: KliqueVisibilityFormat;
  network: KliqueVisibilityNetwork;
  athleteId: string | null;
  quantity: number;
  createdAt: string;
  updatedAt: string;
};

export type KliqueVisibilityHistoryEntryInput = {
  scope: KliqueVisibilityHistoryScope;
  periodStart: string;
  periodEnd: string;
  format: KliqueVisibilityFormat;
  network: KliqueVisibilityNetwork;
  athleteId?: string | null;
  quantity: number;
};

// Date de debut du suivi detaille par workspace: separe l'historique manuel des publications detaillees.
export type KliqueVisibilityTrackingSettings = {
  workspaceId: string;
  trackingStartDate: string;
  createdAt: string;
  updatedAt: string;
};

export type KliqueVisibilityErrorCode =
  | "invalid_input"
  | "invalid_format"
  | "invalid_network"
  | "invalid_date"
  | "invalid_link"
  | "invalid_title"
  | "invalid_editorial_category"
  | "invalid_origin"
  | "invalid_publisher_name"
  | "invalid_external_post_id"
  | "invalid_views"
  | "invalid_reach"
  | "invalid_impressions"
  | "invalid_observed_at"
  | "invalid_metric_source"
  | "invalid_created_by"
  | "missing_athletes"
  | "invalid_period"
  | "invalid_scope_athlete"
  | "invalid_quantity"
  | "tracking_start_missing"
  | "tracking_start_locked"
  | "publication_before_tracking_start"
  | "history_period_not_before_tracking_start"
  | "history_period_overlap"
  | "publication_not_found"
  | "history_entry_not_found";

export class KliqueVisibilityError extends Error {
  constructor(
    public readonly code: KliqueVisibilityErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const normalize = (value: unknown): string => String(value ?? "").trim();

const isValidDateString = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(new Date(value).getTime());

const isValidLink = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const parseKliqueVisibilityPublicationInput = (value: unknown): KliqueVisibilityPublicationInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new KliqueVisibilityError("invalid_input", "Données invalides.");
  }
  const input = value as Record<string, unknown>;
  const allowedKeys = new Set(["format", "network", "publishedAt", "link", "title", "editorialCategory", "athleteIds"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new KliqueVisibilityError("invalid_input", "Données invalides.");
  }
  if (!kliqueVisibilityFormats.includes(input.format as KliqueVisibilityFormat)) {
    throw new KliqueVisibilityError("invalid_format", "Format de publication invalide.");
  }
  if (!kliqueVisibilityNetworks.includes(input.network as KliqueVisibilityNetwork)) {
    throw new KliqueVisibilityError("invalid_network", "Réseau invalide.");
  }
  const publishedAt = normalize(input.publishedAt);
  if (!publishedAt || !isValidDateString(publishedAt)) {
    throw new KliqueVisibilityError("invalid_date", "Date de publication invalide.");
  }
  let link: string | null = null;
  if (input.link !== undefined && input.link !== null) {
    if (typeof input.link !== "string") {
      throw new KliqueVisibilityError("invalid_link", "Lien invalide.");
    }
    const normalizedLink = normalize(input.link);
    if (normalizedLink) {
      if (!isValidLink(normalizedLink)) {
        throw new KliqueVisibilityError("invalid_link", "Lien invalide.");
      }
      link = normalizedLink;
    }
  }
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new KliqueVisibilityError("invalid_title", "Titre de publication invalide.");
  }
  const title = input.title.trim();
  if (
    !visibilityEditorialCategories.includes(input.editorialCategory as VisibilityEditorialCategory)
    || input.editorialCategory === "legacy_unclassified"
  ) {
    throw new KliqueVisibilityError("invalid_editorial_category", "Catégorie éditoriale invalide.");
  }
  if (!Array.isArray(input.athleteIds) || input.athleteIds.length === 0) {
    throw new KliqueVisibilityError("missing_athletes", "Au moins un athlète est requis.");
  }
  const athleteIds = Array.from(new Set(input.athleteIds.map((id) => normalize(id))));
  if (athleteIds.some((id) => !id)) {
    throw new KliqueVisibilityError("missing_athletes", "Au moins un athlète est requis.");
  }

  return {
    format: input.format as KliqueVisibilityFormat,
    network: input.network as KliqueVisibilityNetwork,
    publishedAt,
    link,
    title,
    editorialCategory: input.editorialCategory as VisibilityEditorialCategory,
    athleteIds,
  };
};

const parseOptionalClassificationText = (
  value: unknown,
  code: "invalid_publisher_name" | "invalid_external_post_id",
  message: string,
): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new KliqueVisibilityError(code, message);
  const normalized = value.trim();
  return normalized || null;
};

export const parseVisibilityPublicationClassificationInput = (
  value: unknown,
): VisibilityPublicationClassificationInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new KliqueVisibilityError("invalid_input", "Données invalides.");
  }
  const input = value as Record<string, unknown>;
  const allowedKeys = new Set(["origin", "publisherName", "externalPostId"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new KliqueVisibilityError("invalid_input", "Données invalides.");
  }
  if (!visibilityOrigins.includes(input.origin as VisibilityOrigin)) {
    throw new KliqueVisibilityError("invalid_origin", "Origine de publication invalide.");
  }

  return {
    origin: input.origin as VisibilityOrigin,
    publisherName: parseOptionalClassificationText(
      input.publisherName,
      "invalid_publisher_name",
      "Nom d’éditeur invalide.",
    ),
    externalPostId: parseOptionalClassificationText(
      input.externalPostId,
      "invalid_external_post_id",
      "Identifiant de publication externe invalide.",
    ),
  };
};

const parseMetricCount = (
  value: unknown,
  field: "views" | "reach" | "impressions",
  required: boolean,
): number | null => {
  if (value === undefined || value === null) {
    if (!required) return null;
    throw new KliqueVisibilityError(`invalid_${field}`, `${field} invalide.`);
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new KliqueVisibilityError(`invalid_${field}`, `${field} invalide.`);
  }
  return value;
};

export const parseVisibilityMetricSnapshotInput = (value: unknown): VisibilityMetricSnapshotInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new KliqueVisibilityError("invalid_input", "Données invalides.");
  }
  const input = value as Record<string, unknown>;
  const allowedKeys = new Set(["observedAt", "views", "reach", "impressions", "source"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new KliqueVisibilityError("invalid_input", "Données invalides.");
  }
  const observedAt = normalize(input.observedAt);
  const observedDate = new Date(observedAt);
  if (!observedAt || Number.isNaN(observedDate.getTime())) {
    throw new KliqueVisibilityError("invalid_observed_at", "Horodatage du relevé invalide.");
  }
  if (!visibilityMetricSources.includes(input.source as VisibilityMetricSource)) {
    throw new KliqueVisibilityError("invalid_metric_source", "Source du relevé invalide.");
  }

  return {
    observedAt: observedDate.toISOString(),
    views: parseMetricCount(input.views, "views", true)!,
    reach: parseMetricCount(input.reach, "reach", false),
    impressions: parseMetricCount(input.impressions, "impressions", false),
    source: input.source as VisibilityMetricSource,
  };
};

export const parseKliqueVisibilityHistoryEntryInput = (value: unknown): KliqueVisibilityHistoryEntryInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new KliqueVisibilityError("invalid_input", "Données invalides.");
  }
  const input = value as Record<string, unknown>;
  const allowedKeys = new Set(["scope", "periodStart", "periodEnd", "format", "network", "athleteId", "quantity"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new KliqueVisibilityError("invalid_input", "Données invalides.");
  }
  if (input.scope !== "global" && input.scope !== "athlete") {
    throw new KliqueVisibilityError("invalid_input", "Portée invalide.");
  }
  if (!kliqueVisibilityFormats.includes(input.format as KliqueVisibilityFormat)) {
    throw new KliqueVisibilityError("invalid_format", "Format invalide.");
  }
  if (!kliqueVisibilityNetworks.includes(input.network as KliqueVisibilityNetwork)) {
    throw new KliqueVisibilityError("invalid_network", "Réseau invalide.");
  }
  const periodStart = normalize(input.periodStart);
  const periodEnd = normalize(input.periodEnd);
  if (!periodStart || !isValidDateString(periodStart) || !periodEnd || !isValidDateString(periodEnd)) {
    throw new KliqueVisibilityError("invalid_period", "Période invalide.");
  }
  if (new Date(periodStart).getTime() > new Date(periodEnd).getTime()) {
    throw new KliqueVisibilityError("invalid_period", "La période doit se terminer après son début.");
  }
  const athleteId = normalize(input.athleteId);
  if (input.scope === "global" && athleteId) {
    throw new KliqueVisibilityError("invalid_scope_athlete", "Un total global ne porte pas d’athlète.");
  }
  if (input.scope === "athlete" && !athleteId) {
    throw new KliqueVisibilityError("invalid_scope_athlete", "Un athlète est requis pour une reprise par athlète.");
  }
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new KliqueVisibilityError("invalid_quantity", "La quantité doit être un entier positif.");
  }

  return {
    scope: input.scope as KliqueVisibilityHistoryScope,
    periodStart,
    periodEnd,
    format: input.format as KliqueVisibilityFormat,
    network: input.network as KliqueVisibilityNetwork,
    athleteId: input.scope === "athlete" ? athleteId : null,
    quantity,
  };
};

// --- Calculs purs, sans accès base de données ---

export type KliqueVisibilityPublicationTotals = {
  totalPublications: number;
  perAthlete: Record<string, number>;
};

// Chaque publication compte une fois au total et une fois pour chaque athlete concerne (carrousel inclus).
export const calculateKliqueVisibilityPublicationTotals = (
  publications: Array<{ id: string; athleteIds: string[] }>,
): KliqueVisibilityPublicationTotals => {
  const perAthlete: Record<string, number> = {};
  for (const publication of publications) {
    for (const athleteId of new Set(publication.athleteIds)) {
      perAthlete[athleteId] = (perAthlete[athleteId] ?? 0) + 1;
    }
  }
  return { totalPublications: publications.length, perAthlete };
};

export type VisibilityAudienceBreakdown = {
  totalContents: number;
  contentsWithSnapshot: number;
  coverageRate: number;
  totalViews: number;
  averageViewsPerMeasuredContent: number;
  totalReach: number | null;
  totalImpressions: number | null;
};

export type VisibilityAudienceSummary = {
  totalDetailedContents: number;
  contentsWithSnapshot: number;
  coverageRate: number;
  totalViews: number;
  averageViewsPerMeasuredContent: number;
  totalReach: number | null;
  totalImpressions: number | null;
  mostViewedContent: { publicationId: string; views: number } | null;
  byNetwork: Array<VisibilityAudienceBreakdown & { network: KliqueVisibilityNetwork }>;
  byOrigin: Array<VisibilityAudienceBreakdown & { origin: VisibilityOrigin }>;
};

type VisibilityAudienceAccumulator = {
  totalContents: number;
  contentsWithSnapshot: number;
  totalViews: number;
  totalReach: number;
  hasReach: boolean;
  totalImpressions: number;
  hasImpressions: boolean;
};

const createVisibilityAudienceAccumulator = (): VisibilityAudienceAccumulator => ({
  totalContents: 0,
  contentsWithSnapshot: 0,
  totalViews: 0,
  totalReach: 0,
  hasReach: false,
  totalImpressions: 0,
  hasImpressions: false,
});

const addVisibilityAudience = (
  accumulator: VisibilityAudienceAccumulator,
  snapshot: Pick<VisibilityMetricSnapshot, "views" | "reach" | "impressions"> | undefined,
) => {
  accumulator.totalContents += 1;
  if (!snapshot) return;
  accumulator.contentsWithSnapshot += 1;
  accumulator.totalViews += snapshot.views;
  if (snapshot.reach !== null) {
    accumulator.totalReach += snapshot.reach;
    accumulator.hasReach = true;
  }
  if (snapshot.impressions !== null) {
    accumulator.totalImpressions += snapshot.impressions;
    accumulator.hasImpressions = true;
  }
};

const finalizeVisibilityAudience = (
  accumulator: VisibilityAudienceAccumulator,
): VisibilityAudienceBreakdown => ({
  totalContents: accumulator.totalContents,
  contentsWithSnapshot: accumulator.contentsWithSnapshot,
  coverageRate: accumulator.totalContents === 0
    ? 0
    : (accumulator.contentsWithSnapshot / accumulator.totalContents) * 100,
  totalViews: accumulator.totalViews,
  averageViewsPerMeasuredContent: accumulator.contentsWithSnapshot === 0
    ? 0
    : accumulator.totalViews / accumulator.contentsWithSnapshot,
  totalReach: accumulator.hasReach ? accumulator.totalReach : null,
  totalImpressions: accumulator.hasImpressions ? accumulator.totalImpressions : null,
});

export const calculateVisibilityAudienceSummary = (
  publications: Array<Pick<KliqueVisibilityPublication, "id" | "network" | "origin">>,
  snapshots: Array<Pick<VisibilityMetricSnapshot, "publicationId" | "observedAt" | "views" | "reach" | "impressions">>,
): VisibilityAudienceSummary => {
  const publicationsById = new Map(publications.map((publication) => [publication.id, publication]));
  const latestSnapshots = new Map<string, typeof snapshots[number]>();

  for (const snapshot of snapshots) {
    if (!publicationsById.has(snapshot.publicationId)) continue;
    const observedAt = new Date(snapshot.observedAt).getTime();
    if (Number.isNaN(observedAt)) continue;
    const current = latestSnapshots.get(snapshot.publicationId);
    if (!current || observedAt > new Date(current.observedAt).getTime()) {
      latestSnapshots.set(snapshot.publicationId, snapshot);
    }
  }

  const global = createVisibilityAudienceAccumulator();
  const byNetwork = new Map<KliqueVisibilityNetwork, VisibilityAudienceAccumulator>();
  const byOrigin = new Map<VisibilityOrigin, VisibilityAudienceAccumulator>();
  let mostViewedContent: VisibilityAudienceSummary["mostViewedContent"] = null;

  for (const publication of publicationsById.values()) {
    const snapshot = latestSnapshots.get(publication.id);
    addVisibilityAudience(global, snapshot);

    const networkAccumulator = byNetwork.get(publication.network) ?? createVisibilityAudienceAccumulator();
    addVisibilityAudience(networkAccumulator, snapshot);
    byNetwork.set(publication.network, networkAccumulator);

    const originAccumulator = byOrigin.get(publication.origin) ?? createVisibilityAudienceAccumulator();
    addVisibilityAudience(originAccumulator, snapshot);
    byOrigin.set(publication.origin, originAccumulator);

    if (snapshot && (!mostViewedContent || snapshot.views > mostViewedContent.views)) {
      mostViewedContent = { publicationId: publication.id, views: snapshot.views };
    }
  }

  const totals = finalizeVisibilityAudience(global);
  return {
    totalDetailedContents: totals.totalContents,
    contentsWithSnapshot: totals.contentsWithSnapshot,
    coverageRate: totals.coverageRate,
    totalViews: totals.totalViews,
    averageViewsPerMeasuredContent: totals.averageViewsPerMeasuredContent,
    totalReach: totals.totalReach,
    totalImpressions: totals.totalImpressions,
    mostViewedContent,
    byNetwork: Array.from(byNetwork, ([network, accumulator]) => ({
      network,
      ...finalizeVisibilityAudience(accumulator),
    })),
    byOrigin: Array.from(byOrigin, ([origin, accumulator]) => ({
      origin,
      ...finalizeVisibilityAudience(accumulator),
    })),
  };
};

export type KliqueVisibilityHistoryTotals = {
  globalTotal: number;
  perAthlete: Record<string, number>;
};

// Le total global vient uniquement des lignes scope='global'; jamais deduit en sommant les lignes par athlete.
export const calculateKliqueVisibilityHistoryTotals = (
  entries: Array<Pick<KliqueVisibilityHistoryEntry, "scope" | "athleteId" | "quantity">>,
): KliqueVisibilityHistoryTotals => {
  let globalTotal = 0;
  const perAthlete: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.scope === "global") {
      globalTotal += entry.quantity;
      continue;
    }
    if (entry.athleteId) {
      perAthlete[entry.athleteId] = (perAthlete[entry.athleteId] ?? 0) + entry.quantity;
    }
  }
  return { globalTotal, perAthlete };
};

export type KliqueVisibilityRegistryTotals = {
  totalPublications: number;
  totalHistorical: number;
  combinedTotal: number;
  perAthlete: Record<string, { publications: number; historical: number; combined: number }>;
};

// Additionne publications detaillees et historique uniquement au niveau final, sans jamais les confondre en amont.
export const combineKliqueVisibilityRegistryTotals = (
  publicationTotals: KliqueVisibilityPublicationTotals,
  historyTotals: KliqueVisibilityHistoryTotals,
): KliqueVisibilityRegistryTotals => {
  const athleteIds = new Set([
    ...Object.keys(publicationTotals.perAthlete),
    ...Object.keys(historyTotals.perAthlete),
  ]);
  const perAthlete: KliqueVisibilityRegistryTotals["perAthlete"] = {};
  for (const athleteId of athleteIds) {
    const publications = publicationTotals.perAthlete[athleteId] ?? 0;
    const historical = historyTotals.perAthlete[athleteId] ?? 0;
    perAthlete[athleteId] = { publications, historical, combined: publications + historical };
  }
  return {
    totalPublications: publicationTotals.totalPublications,
    totalHistorical: historyTotals.globalTotal,
    combinedTotal: publicationTotals.totalPublications + historyTotals.globalTotal,
    perAthlete,
  };
};

export type KliqueVisibilityFormatBreakdownRow = {
  format: KliqueVisibilityFormat;
  tracked: number;
  historical: number;
  combined: number;
};

// Vue par format pour un seul athlete: suivi detaille (une publication = une unite) vs historique (quantite agregee).
export const calculateKliqueVisibilityFormatBreakdown = (
  publications: Array<{ format: KliqueVisibilityFormat }>,
  historyEntries: Array<{ format: KliqueVisibilityFormat; quantity: number }>,
): KliqueVisibilityFormatBreakdownRow[] => {
  const byFormat = new Map<KliqueVisibilityFormat, { tracked: number; historical: number }>(
    kliqueVisibilityFormats.map((format) => [format, { tracked: 0, historical: 0 }]),
  );
  for (const publication of publications) {
    byFormat.get(publication.format)!.tracked += 1;
  }
  for (const entry of historyEntries) {
    byFormat.get(entry.format)!.historical += entry.quantity;
  }
  return kliqueVisibilityFormats.map((format) => {
    const row = byFormat.get(format)!;
    return { format, tracked: row.tracked, historical: row.historical, combined: row.tracked + row.historical };
  });
};

// La reprise historique reste strictement avant le debut du suivi; les publications commencent a partir de lui (inclus).
export const isKliqueVisibilityPublicationWithinTracking = (
  publishedAt: string,
  trackingStartDate: string,
): boolean => new Date(publishedAt).getTime() >= new Date(trackingStartDate).getTime();

const toUtcCivilDate = (value: string | Date): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new KliqueVisibilityError("invalid_date", "Date invalide.");
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

export const calculateVisibilityAudienceTrackingState = (
  publishedAt: string,
  currentDate: string | Date,
): VisibilityAudienceTrackingState => {
  const publicationDate = toUtcCivilDate(publishedAt);
  const closingDate = new Date(publicationDate.getTime());
  closingDate.setUTCDate(closingDate.getUTCDate() + 30);
  const currentCivilDate = toUtcCivilDate(currentDate);

  return {
    status: currentCivilDate.getTime() >= closingDate.getTime() ? "closed" : "in_progress",
    theoreticalClosingDate: closingDate.toISOString().slice(0, 10),
  };
};

export const isKliqueVisibilityHistoryPeriodBeforeTracking = (
  periodEnd: string,
  trackingStartDate: string,
): boolean => new Date(periodEnd).getTime() < new Date(trackingStartDate).getTime();

export type KliqueVisibilityHistoryCategory = {
  scope: KliqueVisibilityHistoryScope;
  athleteId: string | null;
  format: KliqueVisibilityFormat;
  network: KliqueVisibilityNetwork;
};

const sameKliqueVisibilityHistoryCategory = (
  a: KliqueVisibilityHistoryCategory,
  b: KliqueVisibilityHistoryCategory,
): boolean => a.scope === b.scope
  && (a.athleteId ?? "") === (b.athleteId ?? "")
  && a.format === b.format
  && a.network === b.network;

// Mirroir applicatif de la contrainte d'exclusion: meme categorie (scope, athlete, format, reseau) et periodes chevauchantes.
export const doKliqueVisibilityHistoryPeriodsOverlap = (
  a: KliqueVisibilityHistoryCategory & { periodStart: string; periodEnd: string },
  b: KliqueVisibilityHistoryCategory & { periodStart: string; periodEnd: string },
): boolean => {
  if (!sameKliqueVisibilityHistoryCategory(a, b)) return false;
  const aStart = new Date(a.periodStart).getTime();
  const aEnd = new Date(a.periodEnd).getTime();
  const bStart = new Date(b.periodStart).getTime();
  const bEnd = new Date(b.periodEnd).getTime();
  return aStart <= bEnd && bStart <= aEnd;
};

// --- Persistance serveur, isolee par workspace ---

type PublicationRow = {
  id: string;
  workspace_id: string;
  format: KliqueVisibilityFormat;
  network: KliqueVisibilityNetwork;
  published_at: string | Date;
  link: string | null;
  title?: string | null;
  editorial_category?: VisibilityEditorialCategory | null;
  origin: VisibilityOrigin;
  publisher_name: string | null;
  external_post_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type MetricSnapshotRow = {
  id: string;
  workspace_id: string;
  publication_id: string;
  observed_at: string | Date;
  views: number | string;
  reach: number | string | null;
  impressions: number | string | null;
  source: VisibilityMetricSource;
  created_by_clerk_user_id: string;
  created_at: string | Date;
};

type HistoryEntryRow = {
  id: string;
  workspace_id: string;
  scope: KliqueVisibilityHistoryScope;
  period_start: string | Date;
  period_end: string | Date;
  format: KliqueVisibilityFormat;
  network: KliqueVisibilityNetwork;
  athlete_id: string | null;
  quantity: number | string;
  created_at: string | Date;
  updated_at: string | Date;
};

// Le pilote Neon parse les colonnes DATE en heure locale (new Date(year, month, day)), jamais en UTC:
// relire les composants locaux evite un decalage de jour que provoquerait toISOString().
const toIsoDate = (value: string | Date): string => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toIsoDateTime = (value: string | Date): string => new Date(value).toISOString();

const mapPublicationRow = (row: PublicationRow, athleteIds: string[]): KliqueVisibilityPublication => ({
  id: row.id,
  workspaceId: row.workspace_id,
  format: row.format,
  network: row.network,
  publishedAt: toIsoDate(row.published_at),
  link: row.link,
  title: row.title ?? null,
  editorialCategory: row.editorial_category ?? "legacy_unclassified",
  origin: row.origin,
  publisherName: row.publisher_name,
  externalPostId: row.external_post_id,
  athleteIds,
  createdAt: toIsoDateTime(row.created_at),
  updatedAt: toIsoDateTime(row.updated_at),
});

const mapMetricSnapshotRow = (row: MetricSnapshotRow): VisibilityMetricSnapshot => ({
  id: row.id,
  workspaceId: row.workspace_id,
  publicationId: row.publication_id,
  observedAt: toIsoDateTime(row.observed_at),
  views: Number(row.views),
  reach: row.reach === null ? null : Number(row.reach),
  impressions: row.impressions === null ? null : Number(row.impressions),
  source: row.source,
  createdByClerkUserId: row.created_by_clerk_user_id,
  createdAt: toIsoDateTime(row.created_at),
});

const mapHistoryEntryRow = (row: HistoryEntryRow): KliqueVisibilityHistoryEntry => ({
  id: row.id,
  workspaceId: row.workspace_id,
  scope: row.scope,
  periodStart: toIsoDate(row.period_start),
  periodEnd: toIsoDate(row.period_end),
  format: row.format,
  network: row.network,
  athleteId: row.athlete_id,
  quantity: Number(row.quantity),
  createdAt: toIsoDateTime(row.created_at),
  updatedAt: toIsoDateTime(row.updated_at),
});

const requireWorkspaceId = (workspaceId: string): string => {
  const resolved = normalize(workspaceId);
  if (!resolved) throw new KliqueVisibilityError("invalid_input", "Workspace requis.");
  return resolved;
};

type TrackingSettingsRow = {
  workspace_id: string;
  tracking_start_date: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
};

const mapTrackingSettingsRow = (row: TrackingSettingsRow): KliqueVisibilityTrackingSettings => ({
  workspaceId: row.workspace_id,
  trackingStartDate: toIsoDate(row.tracking_start_date),
  createdAt: toIsoDateTime(row.created_at),
  updatedAt: toIsoDateTime(row.updated_at),
});

export const getKliqueVisibilityTrackingSettings = async (
  workspaceId: string,
): Promise<KliqueVisibilityTrackingSettings | null> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const sql = createContentStorageClient();
  const rows = await sql`
    SELECT workspace_id, tracking_start_date, created_at, updated_at
    FROM klique_visibility_tracking_settings
    WHERE workspace_id = ${resolvedWorkspaceId}
  `;
  const row = (rows as TrackingSettingsRow[])[0];
  return row ? mapTrackingSettingsRow(row) : null;
};

export const setKliqueVisibilityTrackingStartDate = async (
  workspaceId: string,
  trackingStartDate: string,
): Promise<KliqueVisibilityTrackingSettings> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const normalizedDate = normalize(trackingStartDate);
  if (!normalizedDate || !isValidDateString(normalizedDate)) {
    throw new KliqueVisibilityError("invalid_date", "Date de début de suivi invalide.");
  }
  const sql = createContentStorageClient();

  const existingSettings = await getKliqueVisibilityTrackingSettings(resolvedWorkspaceId);
  if (existingSettings && existingSettings.trackingStartDate !== normalizedDate) {
    const entryCounts = await sql`
      SELECT
        (SELECT count(*)::int FROM klique_visibility_publications WHERE workspace_id = ${resolvedWorkspaceId}) AS publications,
        (SELECT count(*)::int FROM klique_visibility_history_entries WHERE workspace_id = ${resolvedWorkspaceId}) AS history_entries
    `;
    const counts = entryCounts[0] as { publications: number; history_entries: number };
    if (counts.publications > 0 || counts.history_entries > 0) {
      throw new KliqueVisibilityError(
        "tracking_start_locked",
        "La date de début de suivi ne peut plus être modifiée après la première entrée.",
      );
    }
  }

  const now = new Date().toISOString();
  const rows = await sql`
    INSERT INTO klique_visibility_tracking_settings (workspace_id, tracking_start_date, created_at, updated_at)
    VALUES (${resolvedWorkspaceId}, ${normalizedDate}::date, ${now}, ${now})
    ON CONFLICT (workspace_id) DO UPDATE
      SET tracking_start_date = EXCLUDED.tracking_start_date, updated_at = ${now}
    RETURNING workspace_id, tracking_start_date, created_at, updated_at
  `;
  return mapTrackingSettingsRow(rows[0] as TrackingSettingsRow);
};

const requireTrackingStartDate = async (workspaceId: string): Promise<string> => {
  const settings = await getKliqueVisibilityTrackingSettings(workspaceId);
  if (!settings) {
    throw new KliqueVisibilityError("tracking_start_missing", "Aucune date de début de suivi configurée pour ce workspace.");
  }
  return settings.trackingStartDate;
};

export const createKliqueVisibilityPublication = async (
  workspaceId: string,
  input: KliqueVisibilityPublicationInput,
): Promise<KliqueVisibilityPublication> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const trackingStartDate = await requireTrackingStartDate(resolvedWorkspaceId);
  if (!isKliqueVisibilityPublicationWithinTracking(input.publishedAt, trackingStartDate)) {
    throw new KliqueVisibilityError(
      "publication_before_tracking_start",
      `Une publication détaillée doit être datée à partir du début du suivi (${trackingStartDate}).`,
    );
  }
  const sql = createContentStorageClient();
  const id = randomUUID();
  const now = new Date().toISOString();

  const insertPublication = sql`
    INSERT INTO klique_visibility_publications (
      id, workspace_id, format, network, published_at, link, title, editorial_category, created_at, updated_at
    ) VALUES (
      ${id}, ${resolvedWorkspaceId}, ${input.format}, ${input.network},
      ${input.publishedAt}::date, ${input.link}, ${input.title}, ${input.editorialCategory}, ${now}, ${now}
    )
    RETURNING id, workspace_id, format, network, published_at, link, title, editorial_category,
              origin, publisher_name, external_post_id, created_at, updated_at
  `;
  const insertAthletes = input.athleteIds.map((athleteId) => sql`
    INSERT INTO klique_visibility_publication_athletes (publication_id, workspace_id, athlete_id, created_at)
    VALUES (${id}, ${resolvedWorkspaceId}, ${athleteId}, ${now})
  `);

  const results = await sql.transaction([insertPublication, ...insertAthletes]);
  const publicationRow = (results[0] as PublicationRow[])[0];
  return mapPublicationRow(publicationRow, input.athleteIds);
};

export const listKliqueVisibilityPublications = async (
  workspaceId: string,
): Promise<KliqueVisibilityPublication[]> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const sql = createContentStorageClient();
  const rows = await sql`
    SELECT publication.id, publication.workspace_id, publication.format, publication.network,
          publication.published_at, publication.link, publication.title, publication.editorial_category,
          publication.origin, publication.publisher_name,
           publication.external_post_id, publication.created_at, publication.updated_at,
           COALESCE(
             array_agg(athlete.athlete_id ORDER BY athlete.athlete_id) FILTER (WHERE athlete.athlete_id IS NOT NULL),
             ARRAY[]::text[]
           ) AS athlete_ids
    FROM klique_visibility_publications publication
    LEFT JOIN klique_visibility_publication_athletes athlete
      ON athlete.publication_id = publication.id
      AND athlete.workspace_id = publication.workspace_id
    WHERE publication.workspace_id = ${resolvedWorkspaceId}
    GROUP BY publication.id
    ORDER BY publication.published_at DESC, publication.created_at DESC
  `;

  return (rows as (PublicationRow & { athlete_ids: string[] })[]).map(
    (row) => mapPublicationRow(row, row.athlete_ids),
  );
};

export const updateKliqueVisibilityPublication = async (
  workspaceId: string,
  publicationId: string,
  input: KliqueVisibilityPublicationInput,
): Promise<KliqueVisibilityPublication> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const id = normalize(publicationId);
  if (!id) throw new KliqueVisibilityError("invalid_input", "Publication invalide.");
  const trackingStartDate = await requireTrackingStartDate(resolvedWorkspaceId);
  if (!isKliqueVisibilityPublicationWithinTracking(input.publishedAt, trackingStartDate)) {
    throw new KliqueVisibilityError(
      "publication_before_tracking_start",
      `Une publication détaillée doit être datée à partir du début du suivi (${trackingStartDate}).`,
    );
  }
  const sql = createContentStorageClient();

  // Verifie l'appartenance au workspace avant la transaction pour ne jamais inserer des liens athletes orphelins.
  const existing = await sql`
    SELECT id FROM klique_visibility_publications WHERE id = ${id} AND workspace_id = ${resolvedWorkspaceId}
  `;
  if (existing.length === 0) {
    throw new KliqueVisibilityError("publication_not_found", "Publication introuvable.");
  }

  const now = new Date().toISOString();
  const updatePublication = sql`
    UPDATE klique_visibility_publications
    SET format = ${input.format}, network = ${input.network}, published_at = ${input.publishedAt}::date,
        link = ${input.link}, title = ${input.title}, editorial_category = ${input.editorialCategory}, updated_at = ${now}
    WHERE id = ${id} AND workspace_id = ${resolvedWorkspaceId}
    RETURNING id, workspace_id, format, network, published_at, link, title, editorial_category,
              origin, publisher_name, external_post_id, created_at, updated_at
  `;
  const deleteAthletes = sql`
    DELETE FROM klique_visibility_publication_athletes
    WHERE publication_id = ${id} AND workspace_id = ${resolvedWorkspaceId}
  `;
  const insertAthletes = input.athleteIds.map((athleteId) => sql`
    INSERT INTO klique_visibility_publication_athletes (publication_id, workspace_id, athlete_id, created_at)
    VALUES (${id}, ${resolvedWorkspaceId}, ${athleteId}, ${now})
  `);

  const results = await sql.transaction([updatePublication, deleteAthletes, ...insertAthletes]);
  const publicationRow = (results[0] as PublicationRow[])[0];
  return mapPublicationRow(publicationRow, input.athleteIds);
};

export const deleteKliqueVisibilityPublication = async (
  workspaceId: string,
  publicationId: string,
): Promise<void> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const id = normalize(publicationId);
  if (!id) throw new KliqueVisibilityError("invalid_input", "Publication invalide.");
  const sql = createContentStorageClient();
  const rows = await sql`
    DELETE FROM klique_visibility_publications
    WHERE id = ${id} AND workspace_id = ${resolvedWorkspaceId}
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new KliqueVisibilityError("publication_not_found", "Publication introuvable.");
  }
};

export const updateKliqueVisibilityPublicationClassification = async (
  workspaceId: string,
  publicationId: string,
  input: VisibilityPublicationClassificationInput,
): Promise<KliqueVisibilityPublication> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const id = normalize(publicationId);
  if (!id) throw new KliqueVisibilityError("invalid_input", "Publication invalide.");
  const sql = createContentStorageClient();
  const now = new Date().toISOString();
  const rows = await sql`
    UPDATE klique_visibility_publications
    SET origin = ${input.origin}, publisher_name = ${input.publisherName ?? null},
        external_post_id = ${input.externalPostId ?? null}, updated_at = ${now}
    WHERE id = ${id} AND workspace_id = ${resolvedWorkspaceId}
    RETURNING id, workspace_id, format, network, published_at, link, title, editorial_category,
              origin, publisher_name, external_post_id, created_at, updated_at
  `;
  const publicationRow = (rows as PublicationRow[])[0];
  if (!publicationRow) {
    throw new KliqueVisibilityError("publication_not_found", "Publication introuvable.");
  }
  const athleteRows = await sql`
    SELECT athlete_id
    FROM klique_visibility_publication_athletes
    WHERE publication_id = ${id} AND workspace_id = ${resolvedWorkspaceId}
    ORDER BY athlete_id
  `;
  const athleteIds = (athleteRows as Array<{ athlete_id: string }>).map((row) => row.athlete_id);
  return mapPublicationRow(publicationRow, athleteIds);
};

export const createKliqueVisibilityMetricSnapshot = async (
  workspaceId: string,
  publicationId: string,
  createdByClerkUserId: string,
  input: VisibilityMetricSnapshotInput,
): Promise<VisibilityMetricSnapshot> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const resolvedPublicationId = normalize(publicationId);
  if (!resolvedPublicationId) throw new KliqueVisibilityError("invalid_input", "Publication invalide.");
  const resolvedCreatedBy = normalize(createdByClerkUserId);
  if (!resolvedCreatedBy) {
    throw new KliqueVisibilityError("invalid_created_by", "Auteur du relevé requis.");
  }
  const sql = createContentStorageClient();
  const id = randomUUID();
  const rows = await sql`
    INSERT INTO klique_visibility_metric_snapshots (
      id, workspace_id, publication_id, observed_at, views, reach, impressions,
      source, created_by_clerk_user_id
    )
    SELECT
      ${id}, ${resolvedWorkspaceId}, publication.id, ${input.observedAt}::timestamptz,
      ${input.views}, ${input.reach ?? null}, ${input.impressions ?? null},
      ${input.source}, ${resolvedCreatedBy}
    FROM klique_visibility_publications publication
    WHERE publication.id = ${resolvedPublicationId}
      AND publication.workspace_id = ${resolvedWorkspaceId}
    RETURNING id, workspace_id, publication_id, observed_at, views, reach, impressions,
              source, created_by_clerk_user_id, created_at
  `;
  const snapshotRow = (rows as MetricSnapshotRow[])[0];
  if (!snapshotRow) {
    throw new KliqueVisibilityError("publication_not_found", "Publication introuvable.");
  }
  return mapMetricSnapshotRow(snapshotRow);
};

export const listKliqueVisibilityMetricSnapshots = async (
  workspaceId: string,
  publicationId: string,
): Promise<VisibilityMetricSnapshot[]> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const resolvedPublicationId = normalize(publicationId);
  if (!resolvedPublicationId) throw new KliqueVisibilityError("invalid_input", "Publication invalide.");
  const sql = createContentStorageClient();
  const rows = await sql`
    SELECT id, workspace_id, publication_id, observed_at, views, reach, impressions,
           source, created_by_clerk_user_id, created_at
    FROM klique_visibility_metric_snapshots
    WHERE workspace_id = ${resolvedWorkspaceId}
      AND publication_id = ${resolvedPublicationId}
    ORDER BY observed_at DESC, created_at DESC
  `;
  return (rows as MetricSnapshotRow[]).map(mapMetricSnapshotRow);
};

export const createKliqueVisibilityHistoryEntry = async (
  workspaceId: string,
  input: KliqueVisibilityHistoryEntryInput,
): Promise<KliqueVisibilityHistoryEntry> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const trackingStartDate = await requireTrackingStartDate(resolvedWorkspaceId);
  if (!isKliqueVisibilityHistoryPeriodBeforeTracking(input.periodEnd, trackingStartDate)) {
    throw new KliqueVisibilityError(
      "history_period_not_before_tracking_start",
      `Une reprise historique doit se terminer avant le début du suivi (${trackingStartDate}).`,
    );
  }
  const sql = createContentStorageClient();
  const id = randomUUID();
  const now = new Date().toISOString();

  const rows = await sql`
    INSERT INTO klique_visibility_history_entries (
      id, workspace_id, scope, period_start, period_end, format, network, athlete_id, quantity, created_at, updated_at
    ) VALUES (
      ${id}, ${resolvedWorkspaceId}, ${input.scope}, ${input.periodStart}::date, ${input.periodEnd}::date,
      ${input.format}, ${input.network}, ${input.athleteId}, ${input.quantity}, ${now}, ${now}
    )
    RETURNING id, workspace_id, scope, period_start, period_end, format, network, athlete_id, quantity, created_at, updated_at
  `;

  return mapHistoryEntryRow(rows[0] as HistoryEntryRow);
};

export const listKliqueVisibilityHistoryEntries = async (
  workspaceId: string,
): Promise<KliqueVisibilityHistoryEntry[]> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const sql = createContentStorageClient();
  const rows = await sql`
    SELECT id, workspace_id, scope, period_start, period_end, format, network, athlete_id, quantity, created_at, updated_at
    FROM klique_visibility_history_entries
    WHERE workspace_id = ${resolvedWorkspaceId}
    ORDER BY period_start DESC, created_at DESC
  `;

  return (rows as HistoryEntryRow[]).map(mapHistoryEntryRow);
};

export const updateKliqueVisibilityHistoryEntry = async (
  workspaceId: string,
  historyEntryId: string,
  input: KliqueVisibilityHistoryEntryInput,
): Promise<KliqueVisibilityHistoryEntry> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const id = normalize(historyEntryId);
  if (!id) throw new KliqueVisibilityError("invalid_input", "Reprise historique invalide.");
  const trackingStartDate = await requireTrackingStartDate(resolvedWorkspaceId);
  if (!isKliqueVisibilityHistoryPeriodBeforeTracking(input.periodEnd, trackingStartDate)) {
    throw new KliqueVisibilityError(
      "history_period_not_before_tracking_start",
      `Une reprise historique doit se terminer avant le début du suivi (${trackingStartDate}).`,
    );
  }
  const sql = createContentStorageClient();
  const now = new Date().toISOString();

  // La contrainte d'exclusion et le trigger de debut de suivi s'appliquent aussi sur UPDATE.
  const rows = await sql`
    UPDATE klique_visibility_history_entries
    SET scope = ${input.scope}, period_start = ${input.periodStart}::date, period_end = ${input.periodEnd}::date,
        format = ${input.format}, network = ${input.network}, athlete_id = ${input.athleteId}, quantity = ${input.quantity},
        updated_at = ${now}
    WHERE id = ${id} AND workspace_id = ${resolvedWorkspaceId}
    RETURNING id, workspace_id, scope, period_start, period_end, format, network, athlete_id, quantity, created_at, updated_at
  `;
  if (rows.length === 0) {
    throw new KliqueVisibilityError("history_entry_not_found", "Reprise historique introuvable.");
  }
  return mapHistoryEntryRow(rows[0] as HistoryEntryRow);
};

export const deleteKliqueVisibilityHistoryEntry = async (
  workspaceId: string,
  historyEntryId: string,
): Promise<void> => {
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const id = normalize(historyEntryId);
  if (!id) throw new KliqueVisibilityError("invalid_input", "Reprise historique invalide.");
  const sql = createContentStorageClient();
  const rows = await sql`
    DELETE FROM klique_visibility_history_entries
    WHERE id = ${id} AND workspace_id = ${resolvedWorkspaceId}
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new KliqueVisibilityError("history_entry_not_found", "Reprise historique introuvable.");
  }
};

export const getKliqueVisibilityRegistryTotals = async (
  workspaceId: string,
): Promise<KliqueVisibilityRegistryTotals> => {
  const [publications, historyEntries] = await Promise.all([
    listKliqueVisibilityPublications(workspaceId),
    listKliqueVisibilityHistoryEntries(workspaceId),
  ]);
  return combineKliqueVisibilityRegistryTotals(
    calculateKliqueVisibilityPublicationTotals(publications),
    calculateKliqueVisibilityHistoryTotals(historyEntries),
  );
};

export type KliqueVisibilityRegistryOverview = {
  trackingSettings: KliqueVisibilityTrackingSettings | null;
  publications: KliqueVisibilityPublication[];
  historyEntries: KliqueVisibilityHistoryEntry[];
  totals: KliqueVisibilityRegistryTotals;
};

// Vue d'ensemble pour l'ecran Admin: reglages, publications detaillees, historique et compteurs, en un seul appel.
export const getKliqueVisibilityRegistryOverview = async (
  workspaceId: string,
): Promise<KliqueVisibilityRegistryOverview> => {
  const [trackingSettings, publications, historyEntries] = await Promise.all([
    getKliqueVisibilityTrackingSettings(workspaceId),
    listKliqueVisibilityPublications(workspaceId),
    listKliqueVisibilityHistoryEntries(workspaceId),
  ]);
  const totals = combineKliqueVisibilityRegistryTotals(
    calculateKliqueVisibilityPublicationTotals(publications),
    calculateKliqueVisibilityHistoryTotals(historyEntries),
  );
  return { trackingSettings, publications, historyEntries, totals };
};
