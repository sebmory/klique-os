import type { ManualEditorialMaterial } from "@/types/context-intelligence";

export type SportsWatchAdminStatus = "pending" | "validated" | "rejected";
export type SportsWatchAttributionStatus = "matched" | "ambiguous";
export type SportsWatchVerificationStatus = "unverified" | "verified" | "disputed";
export type SportsWatchResultKind = "individual_result" | "collective_result" | "participation" | "news_excerpt";
export type SportsWatchSourceKey = "bc-bulle" | "swiss-badminton";

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
