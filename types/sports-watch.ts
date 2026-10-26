import type { ManualEditorialMaterial } from "@/types/context-intelligence";

export type SportsWatchAdminStatus = "pending" | "validated" | "rejected";
export type SportsWatchAttributionStatus = "matched" | "ambiguous";
export type SportsWatchVerificationStatus = "unverified" | "verified" | "disputed";
export type SportsWatchResultKind = "individual_result" | "collective_result" | "participation" | "news_excerpt";
export type SportsWatchSourceKey =
  | "bc-bulle"
  | "swiss-badminton"
  | "iwwf-wakesurf"
  | "kenpokan"
  | "safv";

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
};

export type SportsWatchRunResult = {
  sourceName: string;
  sourceUrl: string;
  message: string;
  scannedCount: number;
  recentCount: number;
  createdCount: number;
  candidates: SportsWatchCandidate[];
};

export type SportsWatchArticlePrefill = {
  candidateId: string;
  athleteId: string;
  verificationStatus: SportsWatchVerificationStatus;
  material: ManualEditorialMaterial;
};
