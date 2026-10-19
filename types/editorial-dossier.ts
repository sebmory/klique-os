import type {
  ContextConfidence,
  ContextItemCategory,
  ContextSourceType,
  ContextVerificationStatus,
} from "@/types/context-intelligence";

export type EditorialDossierRole = "admin" | "media";

export type EditorialVisibility =
  | "public"
  | "media_allowed"
  | "workspace_internal"
  | "admin_only"
  | "sensitive";

export type EditorialFactCategory =
  | "profile"
  | "club_position"
  | "sports_result"
  | "news"
  | "production"
  | "citation"
  | "objective"
  | "historical_record"
  | "schedule"
  | "health"
  | "contact_request"
  | "appointment"
  | "generated_reference"
  | "other";

export type EditorialFreshnessStatus = "current" | "stale" | "historical" | "unknown";

export type EditorialFreshness = {
  status: EditorialFreshnessStatus;
  asOf: string;
  referenceDate?: string;
  validUntil?: string;
  ageDays?: number;
  policyId: string;
  reasons: string[];
};

export type EditorialConfidence = {
  level: ContextConfidence;
  score: number;
  reasons: string[];
};

export type EditorialSubject = {
  type: string;
  canonicalId?: string;
  displayName: string;
  sport?: string;
  clubOrOrganization?: string;
  publicRoleOrPosition?: string;
};

export type EditorialSource = {
  sourceId: string;
  type: ContextSourceType;
  name: string;
  url?: string;
  internalReference?: string;
  publishedAt?: string;
  collectedAt: string;
  official: boolean;
  confidence: EditorialConfidence;
  visibility: EditorialVisibility;
};

export type EditorialFact = {
  factId: string;
  semanticKey: string;
  category: EditorialFactCategory;
  formulation: string;
  structuredValue?: string | number | boolean;
  validAt?: string;
  eventDate?: string;
  sourceIds: string[];
  confidence: EditorialConfidence;
  verificationStatus: ContextVerificationStatus;
  visibility: EditorialVisibility;
  sensitive: boolean;
  freshness: EditorialFreshness;
  confidenceReasons: string[];
  visibilityReasons: string[];
  usable: boolean;
  blockedByContradictionIds: string[];
  sourceItemIds: string[];
};

export type EditorialLead = {
  leadId: string;
  category: EditorialFactCategory;
  formulation: string;
  sourceIds: string[];
  confidence: EditorialConfidence;
  verificationStatus: ContextVerificationStatus;
  visibility: EditorialVisibility;
  sensitive: boolean;
  freshness: EditorialFreshness;
  reasons: string[];
  sourceItemIds: string[];
};

export type EditorialCitation = {
  citationId: string;
  text: string;
  author?: string;
  sourceIds: string[];
  date?: string;
  verificationStatus: ContextVerificationStatus;
  visibility: EditorialVisibility;
  freshness: EditorialFreshness;
};

export type EditorialChronologyEntry = {
  chronologyId: string;
  date: string;
  label: string;
  factIds: string[];
  sourceIds: string[];
  blocked: boolean;
};

export type EditorialContradiction = {
  contradictionId: string;
  semanticKey: string;
  factIds: string[];
  formulations: string[];
  status: "unresolved" | "resolved";
  reasons: string[];
};

export type EditorialMissingInformation = {
  code:
    | "SUBJECT_CANONICAL_ID"
    | "SUBJECT_SPORT"
    | "SUBJECT_ORGANIZATION"
    | "SUBJECT_PUBLIC_ROLE"
    | "NO_USABLE_FACTS"
    | "NO_SOURCES";
  label: string;
  blocksFactualGeneration: boolean;
};

export type EditorialDossier = {
  dossierId: string;
  workspaceId: string;
  revision: number;
  subject: EditorialSubject;
  chronology: EditorialChronologyEntry[];
  facts: EditorialFact[];
  editorialLeads: EditorialLead[];
  citations: EditorialCitation[];
  sources: EditorialSource[];
  contradictions: EditorialContradiction[];
  missingInformation: EditorialMissingInformation[];
  freshness: EditorialFreshness;
  confidence: EditorialConfidence & {
    usableFactIds: string[];
  };
  generatedAt: string;
  sourceCollectionId: string;
  visibilityProjection: EditorialDossierRole;
};

export type EditorialFreshnessPolicy = {
  policyId: string;
  category: EditorialFactCategory;
  currentForDays: number | null;
  historical: boolean;
  description: string;
};

export type EditorialCategoryMapping = Partial<Record<ContextItemCategory, EditorialFactCategory>>;
