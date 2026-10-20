export const partnerAthleteIntroductionStatuses = [
  "awaiting_athlete",
  "accepted",
  "declined",
] as const;

export const partnerAthleteIntroductionModerationStatuses = [
  "clear",
  "suspended",
] as const;

export const historicalContactRequestStatuses = [
  "open",
  "pending",
  "in_progress",
  "resolved",
] as const;

export type PartnerAthleteIntroductionStatus =
  (typeof partnerAthleteIntroductionStatuses)[number];
export type PartnerAthleteIntroductionModerationStatus =
  (typeof partnerAthleteIntroductionModerationStatuses)[number];
export type HistoricalContactRequestStatus =
  (typeof historicalContactRequestStatuses)[number];
export type ContactRequestStatus =
  | HistoricalContactRequestStatus
  | PartnerAthleteIntroductionStatus;
export type ContactRequestKind =
  | "athlete_contact"
  | "partner_athlete_introduction";
export type IntroductionActorRole =
  | "admin"
  | "athlete"
  | "partner_expert"
  | "media";
export type IntroductionAccessStatus = "invited" | "active" | "disabled";
export type AthleteIntroductionDecision = "accept" | "decline";
export type IntroductionModerationAction = "suspend" | "reactivate";

export type IntroductionActor = {
  clerkUserId: string;
  role: IntroductionActorRole;
  status: IntroductionAccessStatus;
  workspaceId: string;
  athleteId: string | null;
  partnerId: string | null;
};

export type IntroductionRequestState = {
  id: string;
  workspaceId: string;
  athleteId: string;
  partnerId: string;
  requestKind: ContactRequestKind;
  flowVersion: number;
  status: ContactRequestStatus;
  moderationStatus: PartnerAthleteIntroductionModerationStatus;
  athleteResponseEnabledAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  reason?: string;
  message?: string;
  partnerPublicNameSnapshot: string;
  athletePublicNameSnapshot: string;
  authorizedContactChannel: "instagram" | null;
  authorizedContactValueSnapshot: string | null;
  authorizedContactReference: string | null;
  contactConsentedAt: string | null;
};

export type IntroductionPairHistory = Pick<
  IntroductionRequestState,
  | "id"
  | "workspaceId"
  | "athleteId"
  | "partnerId"
  | "requestKind"
  | "status"
  | "moderationStatus"
  | "respondedAt"
  | "createdAt"
>;

export type InstagramContactPresentation = {
  channel: "instagram";
  value: string;
  reference: string;
};

export type IntroductionCreationPayload = {
  athleteId: string;
  reason: string;
  message?: string | null;
};

export type IntroductionResponsePayload = {
  decision: AthleteIntroductionDecision;
  confirmedContact?: string | null;
  contactReference?: string | null;
};

export type StoredIdempotentOperation = {
  key: string;
  payloadHash: string;
};

export type PartnerIntroductionSummary = {
  id: string;
  athleteId: string;
  athletePublicName: string;
  reason: string;
  message: string;
  status: ContactRequestStatus;
  moderationStatus: PartnerAthleteIntroductionModerationStatus;
  createdAt: string;
  respondedAt: string | null;
};

export type PartnerIntroductionDetail = PartnerIntroductionSummary & {
  authorizedContact?: {
    channel: "instagram";
    value: string;
    consentedAt: string;
  };
};

export type AthleteIntroductionDetail = {
  id: string;
  partnerPublicName: string;
  reason: string;
  message: string;
  status: ContactRequestStatus;
  moderationStatus: PartnerAthleteIntroductionModerationStatus;
  createdAt: string;
  respondedAt: string | null;
};

export type IntroductionReportStatus = "open" | "reviewing" | "resolved" | "dismissed";

export type IntroductionReport = {
  id: string;
  reason: string;
  comment: string;
  status: IntroductionReportStatus;
  reportedAt: string;
  handledAt: string | null;
  handlingNote: string;
};

export type AdminIntroductionSummary = {
  id: string;
  partnerId: string;
  athleteId: string;
  partnerPublicName: string;
  athletePublicName: string;
  reason: string;
  status: ContactRequestStatus;
  moderationStatus: PartnerAthleteIntroductionModerationStatus;
  createdAt: string;
  respondedAt: string | null;
  ageDays: number;
  stale: boolean;
  reported: boolean;
};

export type AdminIntroductionDetail = AdminIntroductionSummary & {
  message: string;
  solicitationAllowed: boolean;
  events: Array<{
    id: string;
    eventType: IntroductionDomainEvent["eventType"];
    actorRole: IntroductionActorRole;
    requestStatus: ContactRequestStatus;
    moderationStatus: PartnerAthleteIntroductionModerationStatus;
    occurredAt: string;
  }>;
  reports: IntroductionReport[];
  solicitationEvents: Array<{
    id: string;
    canSolicit: boolean;
    reason: string;
    occurredAt: string;
  }>;
};

export type IntroductionDomainEvent = {
  requestId: string;
  workspaceId: string;
  eventType:
    | "request_created"
    | "athlete_accepted"
    | "athlete_declined"
    | "moderation_suspended"
    | "moderation_reactivated"
    | "athlete_reported"
    | "report_reviewing"
    | "report_resolved"
    | "report_dismissed";
  actorClerkUserId: string;
  actorRole: IntroductionActorRole;
  requestStatus: ContactRequestStatus;
  moderationStatus: PartnerAthleteIntroductionModerationStatus;
  idempotencyKey: string;
  payloadHash: string;
  occurredAt: string;
};

export type IntroductionNotification = {
  recipientClerkUserId: string;
  type:
    | "partner_athlete_introduction.created"
    | "partner_athlete_introduction.accepted"
    | "partner_athlete_introduction.declined"
    | "partner_athlete_introduction.suspended"
    | "partner_athlete_introduction.reactivated";
  title: string;
  body: string;
  actionHref: string;
  eventKey: string;
};
