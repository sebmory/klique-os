export type MediaSubjectStatus = "draft" | "published" | "archived";

export type MediaRequestType = "interview" | "reaction" | "reportage" | "images" | "podcast";

export type MediaSubjectAthlete = {
  id: string;
  name: string;
};

export type MediaSubject = {
  id: string;
  title: string;
  summary: string;
  angle: string;
  sport: string | null;
  location: string | null;
  date: string | null;
  coverImageUrl: string | null;
  availableRequestTypes: MediaRequestType[];
  athleteIds: string[];
  athletes: MediaSubjectAthlete[];
  status: MediaSubjectStatus;
  publishedAt: string | null;
  updatedAt: string;
};

export type MediaSubjectFilters = {
  query: string;
  sport: string;
  requestType: MediaRequestType | "all";
};

export const MEDIA_REQUEST_TYPE_LABELS: Record<MediaRequestType, string> = {
  interview: "Interview",
  reaction: "Réaction",
  reportage: "Reportage",
  images: "Images",
  podcast: "Podcast",
};

export const MEDIA_REQUEST_ACTION_LABELS: Record<MediaRequestType, string> = {
  interview: "Demander une interview",
  reaction: "Demander une réaction",
  reportage: "Demander un reportage",
  images: "Demander des images",
  podcast: "Demander un podcast",
};

export const MEDIA_REQUEST_TYPE_ORDER: readonly MediaRequestType[] = Object.freeze([
  "interview",
  "reaction",
  "reportage",
  "images",
  "podcast",
]);

export const formatSubjectDateLabel = (value: string | null): string => {
  if (typeof value !== "string") return "Sans date";
  const isoPrefix = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!isoPrefix) return "Sans date";
  return `${isoPrefix[3]}.${isoPrefix[2]}.${isoPrefix[1]}`;
};

// Les noms proviennent uniquement des sujets renvoyes par l API : aucun annuaire athlete n est charge.
export const getSubjectAthleteNames = (subject: Pick<MediaSubject, "athletes" | "athleteIds">): string[] => {
  if (Array.isArray(subject.athletes) && subject.athletes.length > 0) {
    return subject.athletes.map((athlete) => athlete.name || athlete.id);
  }
  return subject.athleteIds;
};

export const collectSubjectSports = (subjects: MediaSubject[]): string[] =>
  [...new Set(subjects.map((subject) => (subject.sport ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );

export const sortRequestTypes = (types: MediaRequestType[]): MediaRequestType[] =>
  MEDIA_REQUEST_TYPE_ORDER.filter((type) => types.includes(type));

// La liste media n affiche jamais autre chose que des sujets publies, meme si l API en renvoyait d autres.
export const filterMediaSubjects = (
  subjects: MediaSubject[],
  filters: MediaSubjectFilters,
): MediaSubject[] => {
  const query = filters.query.trim().toLowerCase();

  return subjects.filter((subject) => {
    if (subject.status !== "published") return false;

    if (filters.sport !== "all" && (subject.sport ?? "").trim() !== filters.sport) return false;

    if (filters.requestType !== "all" && !subject.availableRequestTypes.includes(filters.requestType)) return false;

    if (!query) return true;

    const haystack = [subject.title, subject.sport ?? "", ...getSubjectAthleteNames(subject)]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
};
