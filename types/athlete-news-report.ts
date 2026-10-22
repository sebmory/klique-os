export type AthleteNewsReportStatus = "new" | "preparing" | "processed";

export type AthleteNewsReport = {
  id: string;
  athleteId: string;
  message: string;
  eventDate: string;
  externalUrl: string | null;
  photoHref: string | null;
  status: AthleteNewsReportStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AthleteNewsArticlePrefill = {
  reportId: string;
  athleteId: string;
  message: string;
  eventDate: string;
  externalUrl: string | null;
  photoHref: string | null;
  provenance: string;
};
