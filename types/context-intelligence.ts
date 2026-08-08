export type ContextConnectorId =
  | "crm"
  | "productions"
  | "manual"
  | "external_news"
  | "calendar"
  | "results"
  | "official_website"
  | "rss"
  | "social"
  | "documents"
  | "previous_content";

export type ContextItemCategory =
  | "profile"
  | "club_or_organization"
  | "recent_news"
  | "performance"
  | "result"
  | "schedule"
  | "transfer_or_contract"
  | "injury_or_return"
  | "selection"
  | "production"
  | "previous_content"
  | "user_note"
  | "event"
  | "other";

export type ContextSourceType = "internal" | "official" | "media" | "external" | "user" | "unknown";

export type ContextConfidence = "high" | "medium" | "low" | "unknown";

export type ContextVerificationStatus = "verified" | "reported" | "user_provided" | "unverified" | "rejected";

export type ContextStatementType = "fact" | "editorial_lead";

export type ContextSourcePreference = "official_only" | "official_and_reliable" | "broad";

export type ContextSearchDepth = "quick" | "standard" | "deep";

export type ContextDateRangePreset = "last_7_days" | "last_30_days" | "last_90_days" | "last_12_months" | "custom";

export type ContextDateRange = {
  preset: ContextDateRangePreset;
  from: string;
  to: string;
};

export type ContentSubject = {
  id?: string;
  type: string;
  source: "crm" | "temporary";
  displayName: string;
  sport?: string;
  disciplineOrPosition?: string;
  clubOrOrganization?: string;
  photoUrl?: string;
  workspaceId?: string;
  description?: string;
};

export type WebResearchCitation = {
  title: string;
  url: string;
  startIndex: number;
  endIndex: number;
};

export type WebResearchSource = {
  sourceName: string;
  url: string;
};

export type WebResearchResult = {
  responseId: string;
  text: string;
  citations: WebResearchCitation[];
  sources: WebResearchSource[];
  searchedAt: string;
  dateRange: ContextDateRange;
  webSearchCallCount: number;
  messageFound: boolean;
};

export type ExternalNewsSearchItem = {
  id: string;
  title: string;
  summary: string;
  factualStatement: string;
  sourceName: string;
  sourceUrl: string;
  sourceType: "official" | "media" | "external";
  publishedAt: string | null;
  retrievedAt: string;
  confidence: ContextConfidence;
  verificationStatus: "verified" | "reported" | "unverified";
  category: ContextItemCategory;
  statementType: ContextStatementType;
};

export type ExternalNewsSearchResult = {
  items: ExternalNewsSearchItem[];
  searchedAt: string;
  dateRange: ContextDateRange;
  querySummary: string;
};

export type ContextSubject = ContentSubject;

export type ContextCollectionRequest = {
  workspaceId?: string;
  subject: ContextSubject;
  selectedConnectorIds: ContextConnectorId[];
  dateRange: ContextDateRange;
  sourcePreference: ContextSourcePreference;
  searchDepth: ContextSearchDepth;
  language: "fr" | "fr-CH";
  manualContext?: string;
  contentType: string;
  interviewType?: string;
};

export type ContextSourceReference = {
  sourceType: ContextSourceType;
  sourceName: string;
  sourceUrl?: string;
  publishedAt?: string;
};

export type ContextItem = {
  id: string;
  connectorId: ContextConnectorId;
  category: ContextItemCategory;
  title: string;
  summary: string;
  factualStatement: string;
  statementType: ContextStatementType;
  sourceType: ContextSourceType;
  sourceName: string;
  sourceUrl?: string;
  publishedAt?: string;
  retrievedAt: string;
  confidence: ContextConfidence;
  verificationStatus: ContextVerificationStatus;
  isSelected: boolean;
  isEditable: boolean;
  internalReference?: string;
  metadata: Record<string, string | number | boolean | null>;
  alternateSources?: ContextSourceReference[];
  originalSummary?: string;
  editedSummary?: string;
  isSensitive?: boolean;
};

export type ContextConnectorStatus = "pending" | "running" | "completed" | "empty" | "unavailable" | "error";

export type ContextConnectorReport = {
  connectorId: ContextConnectorId;
  status: ContextConnectorStatus;
  itemCount: number;
  message?: string;
  errorCode?: ContextCollectionErrorCode;
};

export type ContextConnectorResult = {
  connectorId: ContextConnectorId;
  status: ContextConnectorStatus;
  items: ContextItem[];
  message?: string;
  errorCode?: ContextCollectionErrorCode;
};

export type ContextCollectionErrorCode =
  | "INVALID_CONTEXT_REQUEST"
  | "CRM_SUBJECT_ID_MISSING"
  | "CRM_SUBJECT_NOT_FOUND"
  | "PRODUCTION_LINK_NOT_FOUND"
  | "CONNECTOR_NOT_AVAILABLE"
  | "EXTERNAL_SEARCH_NOT_CONFIGURED"
  | "EXTERNAL_SEARCH_MODEL_UNSUPPORTED"
  | "EXTERNAL_SEARCH_FAILED"
  | "EXTERNAL_SEARCH_EMPTY"
  | "EXTERNAL_SEARCH_NO_CITATIONS"
  | "EXTERNAL_NORMALIZATION_FAILED"
  | "EXTERNAL_NORMALIZATION_INVALID_URL"
  | "EXTERNAL_CONTEXT_NOT_CONFIGURED"
  | "EXTERNAL_CONTEXT_AUTHENTICATION_FAILED"
  | "EXTERNAL_CONTEXT_MODEL_UNSUPPORTED"
  | "EXTERNAL_CONTEXT_RATE_LIMITED"
  | "EXTERNAL_CONTEXT_QUOTA_EXCEEDED"
  | "EXTERNAL_CONTEXT_INVALID_RESPONSE"
  | "EXTERNAL_CONTEXT_FAILED"
  | "CONTEXT_TIMEOUT"
  | "CONTEXT_COLLECTION_PARTIAL_SUCCESS"
  | "NO_EXTERNAL_CONTEXT_FOUND"
  | "NO_CONTEXT_FOUND"
  | "SOURCE_VALIDATION_FAILED"
  | "CONTEXT_LIMIT_EXCEEDED";

export type ContextCollectionSummary = {
  totalItemsFound: number;
  selectedItemsCount: number;
  externalSourcesCount: number;
  researchedAt: string;
  dateRange: ContextDateRange;
  warnings: string[];
};

export type ContextCollectionResponseSuccess = {
  ok: true;
  items: ContextItem[];
  reports: ContextConnectorReport[];
  summary: ContextCollectionSummary;
};

export type ContextCollectionResponseError = {
  ok: false;
  code: ContextCollectionErrorCode;
  message: string;
  reports: ContextConnectorReport[];
};

export type ContextCollectionResponse = ContextCollectionResponseSuccess | ContextCollectionResponseError;

export type ContextUsage = {
  usedContextItemIds: string[];
  usedSourceIds: string[];
  unusedSelectedContextItemIds: string[];
  researchedAt?: string;
  dateRange?: ContextDateRange;
  externalContextUsed: boolean;
  selectedItems?: ContextItem[];
};
