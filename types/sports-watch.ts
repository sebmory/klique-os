import type { ManualEditorialMaterial } from "@/types/context-intelligence";

export type SportsWatchAdminStatus =
  | "pending"
  | "validated"
  | "exploited"
  | "rejected"
  | "dismissed";
export type SportsWatchCandidateGroup = "pending" | "validated" | "history";
export type SportsWatchAttributionStatus = "matched" | "ambiguous";
export type SportsWatchVerificationStatus = "unverified" | "verified" | "disputed";
export type SportsWatchResultKind = "individual_result" | "collective_result" | "participation" | "news_excerpt";
export type SportsWatchSourceKey =
  | "bc-bulle"
  | "swiss-badminton"
  | "iwwf-wakesurf"
  | "kenpokan"
  | "safv"
  | "football-public"
  | "bebasket"
  | "swiss-basketball"
  | "manual-import"
  | "manual-entry";

export type SportsWatchCollectionSourceKey = Exclude<
  SportsWatchSourceKey,
  "manual-import" | "manual-entry"
>;

export type FootballBindingStatus = "draft" | "verified" | "ambiguous" | "disabled";

export type FootballPublicPlayer = {
  id: string;
  name: string;
  shirtNumber: string | null;
  position: string | null;
  profileUrl: string;
};

export type FootballManualCompletion = {
  mode: "football_pro_completion" | "public_source_attached";
  previousCandidateId: string;
  completedByClerkUserId: string;
  completedAt: string;
  previousVersion: number;
  newVersion: number;
  fieldProvenance: Record<
    string,
    "footstats_public" | "footstats_pro_admin" | "existing_manual"
  >;
};

export type FootballCandidateResolution =
  | "participation_unverifiable"
  | "not_exploitable"
  | "incorrect";

export type FootballPublicTeamDiscovery = {
  footstatsTeamId: string;
  teamName: string;
  competition: string;
  season: string;
  teamUrl: string;
  rosterUrl: string;
  matchesUrl: string;
  players: FootballPublicPlayer[];
  discoveredAt: string;
  warnings: string[];
};

export type FootballSourceSuggestion = {
  id: string;
  manualCandidateId: string;
  matchKey: string;
  evidence: FootballCandidateEvidence;
  comparison: FootballReconciliationComparison;
  status: "pending" | "attached" | "rejected";
  decidedByClerkUserId: string | null;
  decidedAt: string | null;
  version: number;
  manualCandidate: SportsWatchCandidate;
};

export type FootballPublicBinding = {
  id: string;
  athleteId: string;
  footstatsTeamId: string;
  footstatsTeamName: string;
  footstatsPlayerId: string | null;
  footstatsPlayerName: string | null;
  affTeamId: string | null;
  affPlayerId: string | null;
  competition: string;
  season: string;
  status: FootballBindingStatus;
  roster: FootballPublicPlayer[];
  evidence: string[];
  verifiedByClerkUserId: string | null;
  verifiedAt: string | null;
  version: number;
  updatedAt: string;
};

export type FootballParticipationProof =
  | "team_match"
  | "lineup_available"
  | "player_named"
  | "starter"
  | "substitute"
  | "entered"
  | "goal"
  | "card";

export type FootballCandidateEvidence = {
  mode: "football_public";
  matchKey: string;
  eventDate: string;
  publicReference: string;
  competition: string | null;
  team: string;
  opponent: string;
  score: string | null;
  footstatsTeamId: string;
  footstatsPlayerId: string | null;
  affTeamId: string | null;
  affPlayerId: string | null;
  lineupAvailable: boolean;
  playerNamed: boolean;
  starter: boolean | null;
  substitute: boolean | null;
  entered: boolean | null;
  entryMinute: number | null;
  exitMinute: number | null;
  goals: number | null;
  goalMinutes: number[];
  yellowCards: number | null;
  redCards: number | null;
  cardMinutes: number[];
  participationProved: boolean;
  proofs: FootballParticipationProof[];
  sourceFacts: Array<{
    source: "footstats" | "aff";
    sourceName: string;
    sourceUrl: string;
    official: boolean;
    facts: string[];
  }>;
};

export type FootballCollectionReport = {
  sourcesQueried: Array<{
    source: "footstats" | "aff";
    status: "available" | "unavailable" | "failed";
    detail: string;
  }>;
  matchesExamined: number;
  lineupsFound: number;
  namedPresenceFound: number;
  candidatesProposed: number;
  duplicates: number;
  errors: string[];
  partialCoverage: boolean;
};

export type FootballReconciliationDecision =
  | "pending"
  | "keep_manual"
  | "keep_automatic"
  | "complete_manual"
  | "different_events"
  | "examine_later";

export type FootballReconciliationComparison = {
  identical: string[];
  complementary: string[];
  contradictions: string[];
};

export type FootballCandidateReconciliation = {
  id: string;
  manualCandidateId: string;
  automaticCandidateId: string;
  decision: FootballReconciliationDecision;
  comparison: FootballReconciliationComparison;
  decidedByClerkUserId: string | null;
  decidedAt: string | null;
  version: number;
};

export type SportsWatchManualNewsType =
  | "result_match"
  | "individual_performance"
  | "selection_callup"
  | "transfer_signing"
  | "injury_return"
  | "distinction"
  | "record"
  | "other_news";

export type SportsWatchParticipationStatus =
  | "starter"
  | "entered"
  | "unused_substitute"
  | "unknown";

export type SportsWatchManualStatistic = {
  label: string;
  value: string;
  unit: string | null;
};

export type SportsWatchManualFootballDetails = {
  team: string | null;
  participationStatus: SportsWatchParticipationStatus;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  yellowCards: number | null;
  redCards: number | null;
  opponent: string | null;
  score: string | null;
  competition: string | null;
  footstatsReference: string | null;
  footstatsPlayerId: string | null;
  footstatsTeamId: string | null;
};

export type SportsWatchManualBasketballDetails = {
  starter: boolean | null;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
};

export type SportsWatchManualEntryMetadata = {
  mode: "manual_entry";
  newsType: SportsWatchManualNewsType;
  competition: string | null;
  opponent: string | null;
  score: string | null;
  source: string | null;
  sourceReference: string | null;
  internalNote: string | null;
  football: SportsWatchManualFootballDetails | null;
  basketball: SportsWatchManualBasketballDetails | null;
  statistics: SportsWatchManualStatistic[];
};

export type SportsWatchManualEntryDuplicate = {
  candidateId: string;
  sourceName: string;
  title: string;
  eventDate: string | null;
  articleUrl: string;
  reason: string;
};

export type SportsWatchManualEntryCreation = {
  candidate: SportsWatchCandidate;
  created: boolean;
};

export type SwissBadmintonOfficialIdentity = {
  profileUrl: string;
  profileUuid: string;
  playerId: string;
  name: string;
  club: string | null;
};

export type SwissBadmintonIdentityVerification = {
  athlete: {
    id: string;
    name: string;
    sport: string;
    club: string;
  };
  officialIdentity: SwissBadmintonOfficialIdentity;
  clubComparison: "matching" | "different" | "unknown";
  evidence: string[];
  verifiedAt: string;
};

export type SwissBadmintonBinding = {
  id: string;
  athleteId: string;
  officialIdentity: SwissBadmintonOfficialIdentity;
  clubComparison: SwissBadmintonIdentityVerification["clubComparison"];
  evidence: string[];
  verifiedAt: string;
  confirmedAt: string;
  active: boolean;
  disabledAt: string | null;
  version: number;
};

export type IwwfOfficialIdentity = {
  profileUrl: string;
  athleteId: string;
  name: string;
  birthYear: number | null;
};

export type IwwfIdentityVerification = {
  athlete: {
    id: string;
    name: string;
    sport: string;
    club: string;
  };
  officialIdentity: IwwfOfficialIdentity;
  evidence: string[];
  verifiedAt: string;
};

export type IwwfBinding = {
  id: string;
  athleteId: string;
  officialIdentity: IwwfOfficialIdentity;
  evidence: string[];
  verifiedAt: string;
  confirmedAt: string;
  active: boolean;
  disabledAt: string | null;
  version: number;
};

export type SafvOfficialTeam = {
  scheduleUrl: string;
  leagueId: string;
  teamId: string;
  teamName: string;
  competitionName: string;
  seasonId: string;
  seasonName: string;
};

export type SafvTeamVerification = {
  athlete: {
    id: string;
    name: string;
    sport: string;
    club: string;
  };
  officialTeam: SafvOfficialTeam;
  clubComparison: "matching" | "different" | "unknown";
  evidence: string[];
  verifiedAt: string;
};

export type SafvBinding = {
  id: string;
  athleteId: string;
  officialTeam: SafvOfficialTeam;
  clubComparison: SafvTeamVerification["clubComparison"];
  evidence: string[];
  verifiedAt: string;
  confirmedAt: string;
  active: boolean;
  disabledAt: string | null;
  version: number;
};

export type BeBasketOfficialIdentity = {
  calendarUrl: string;
  teamSlug: string;
  teamName: string;
  playerName: string;
};

export type BeBasketBindingVerification = {
  athlete: {
    id: string;
    name: string;
    sport: string;
    club: string;
  };
  officialIdentity: BeBasketOfficialIdentity;
  evidence: string[];
  verifiedAt: string;
};

export type BeBasketBinding = {
  id: string;
  athleteId: string;
  officialIdentity: BeBasketOfficialIdentity;
  evidence: string[];
  verifiedAt: string;
  confirmedAt: string;
  active: boolean;
  disabledAt: string | null;
  version: number;
};

export type SwissBasketballOfficialIdentity = {
  scheduleUrl: string;
  federationId: string;
  seasonId: string;
  seasonName: string;
  leagueId: string;
  leagueName: string;
  teamId: string;
  teamName: string;
  clubId: string;
  playerId: string;
  playerName: string;
};

export type SwissBasketballBindingVerification = {
  athlete: {
    id: string;
    name: string;
    sport: string;
    club: string;
  };
  officialIdentity: SwissBasketballOfficialIdentity;
  evidence: string[];
  verifiedAt: string;
};

export type SwissBasketballBinding = {
  id: string;
  athleteId: string;
  officialIdentity: SwissBasketballOfficialIdentity;
  evidence: string[];
  verifiedAt: string;
  confirmedAt: string;
  active: boolean;
  disabledAt: string | null;
  version: number;
};

export type SportsWatchCollectionObservationStatus =
  | "sheet_absent"
  | "player_absent"
  | "player_listed_without_participation"
  | "participation_explicit"
  | "team_ambiguous"
  | "binding_error";

export type SportsWatchCollectionObservation = {
  matchUrl: string;
  title: string;
  eventDate: string;
  status: SportsWatchCollectionObservationStatus;
  warning?: string;
};

export type SportsWatchCandidate = {
  id: string;
  athleteId: string;
  athleteName: string;
  sourceName: string;
  sourceUrl: string;
  articleUrl: string;
  title: string;
  excerpt: string;
  resultKind: SportsWatchResultKind;
  publicationDate: string | null;
  eventDateFrom: string | null;
  eventDateTo: string | null;
  collectedAt: string;
  attributionStatus: SportsWatchAttributionStatus;
  attributionEvidence: string[];
  verificationStatus: SportsWatchVerificationStatus;
  adminStatus: SportsWatchAdminStatus;
  supersedesCandidateId: string | null;
  version: number;
  manualEntry?: SportsWatchManualEntryMetadata | null;
  footballEvidence?: FootballCandidateEvidence | null;
  footballCompletion?: FootballManualCompletion | null;
  footballResolution?: FootballCandidateResolution | null;
};

export type FootballCandidateReconciliationView = FootballCandidateReconciliation & {
  manualCandidate: SportsWatchCandidate;
  automaticCandidate: SportsWatchCandidate;
};

export type SportsWatchCandidateTotals = Record<SportsWatchAdminStatus, number> & {
  superseded: number;
  supersededPending: number;
  supersededValidated: number;
};

export type SportsWatchAthleteCandidateTotals = {
  athleteId: string;
  athleteName: string;
  pending: number;
  validated: number;
};

export type SportsWatchCandidatePage = {
  group: SportsWatchCandidateGroup;
  items: SportsWatchCandidate[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
};

export type SportsWatchCandidateDashboard = {
  pages: Record<SportsWatchCandidateGroup, SportsWatchCandidatePage>;
  totals: SportsWatchCandidateTotals;
  athleteTotals: SportsWatchAthleteCandidateTotals[];
};

export type SportsWatchRunResult = {
  sourceName: string;
  sourceUrl: string;
  message: string;
  scannedCount: number;
  recentCount: number;
  createdCount: number;
  observations?: SportsWatchCollectionObservation[];
  footballReport?: FootballCollectionReport;
  candidates: SportsWatchCandidate[];
};

export type SportsWatchRefreshBatchStatus = "running" | "completed" | "partial" | "failed";

export type SportsWatchRefreshTaskSummary = {
  sourceKey: SportsWatchCollectionSourceKey;
  athleteId: string;
  athleteName: string;
  status: "pending" | "running" | "completed" | "failed";
  createdCount: number;
  message: string | null;
};

export type SportsWatchRefreshBatchSummary = {
  id: string;
  trigger: "scheduled";
  status: SportsWatchRefreshBatchStatus;
  scheduledFor: string;
  startedAt: string;
  completedAt: string | null;
  message: string | null;
  taskCount: number;
  completedCount: number;
  failedCount: number;
  createdCount: number;
  tasks: SportsWatchRefreshTaskSummary[];
};

export type SportsWatchArticlePrefill = {
  candidateId: string;
  candidateIds: string[];
  athleteId: string | null;
  athleteIds: string[];
  verificationStatus: SportsWatchVerificationStatus;
  materials: ManualEditorialMaterial[];
  potentialDuplicates: SportsWatchPotentialDuplicate[];
};

export type SportsWatchInterviewCandidate = Pick<
  SportsWatchCandidate,
  | "id"
  | "athleteId"
  | "athleteName"
  | "sourceName"
  | "articleUrl"
  | "title"
  | "excerpt"
  | "resultKind"
  | "publicationDate"
  | "eventDateFrom"
  | "eventDateTo"
  | "collectedAt"
  | "verificationStatus"
  | "adminStatus"
> & {
  provesIndividualParticipation: boolean;
  materials: ManualEditorialMaterial[];
};

export type SportsWatchInterviewContext = {
  athleteId: string;
  selectedCandidateId: string | null;
  candidates: SportsWatchInterviewCandidate[];
};

export type SportsWatchPotentialDuplicate = {
  id: string;
  reason: string;
  candidates: Array<{
    id: string;
    athleteName: string;
    sourceName: string;
    articleUrl: string;
    title: string;
    eventDateFrom: string | null;
  }>;
};

export type SportsWatchIndividualStatistic = {
  label: string;
  value: string;
  evidence: string | null;
};

export type SportsWatchImportExtraction = {
  sourceName: string | null;
  documentDate: string | null;
  documentDateEvidence: string | null;
  matchDate: string | null;
  matchDateEvidence: string | null;
  competition: string | null;
  participantA: string | null;
  participantB: string | null;
  score: string | null;
  resultKind: SportsWatchResultKind | null;
  individualParticipationExplicit: boolean;
  individualEvidence: string | null;
  individualStatistics: SportsWatchIndividualStatistic[];
  warnings: string[];
};

export type SportsWatchImport = {
  id: string;
  athleteId: string;
  athleteName: string;
  athleteSport: string;
  athleteClub: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  fileHref: string;
  status: "uploaded" | "extracted" | "confirmed";
  extraction: SportsWatchImportExtraction | null;
  extractionProvider: string | null;
  extractionModel: string | null;
  extractedAt: string | null;
  candidateId: string | null;
  version: number;
};

export type SportsWatchImportConfirmation = {
  sourceName: string;
  documentDate: string | null;
  matchDate: string | null;
  competition: string | null;
  participantA: string | null;
  participantB: string | null;
  score: string | null;
  resultKind: SportsWatchResultKind;
  individualParticipationExplicit: boolean;
  individualEvidence: string | null;
  individualStatistics: SportsWatchIndividualStatistic[];
};
