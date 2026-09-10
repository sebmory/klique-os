import type { ContentAccessContext } from "@/lib/content-storage/access";
import { getDefaultWorkspaceId } from "@/lib/content-storage/db";
import { getMediaFromGoogleSheets } from "@/lib/google-sheets";
import type { MediaLot } from "@/types/media";

export type MediaBankOrientations = {
  vertical: number;
  horizontal: number;
  square: number;
};

export type MediaBankLot = {
  id: string;
  row: number | null;
  date: string;
  athlete: string;
  sport: string;
  mediaType: string;
  event: string;
  place: string;
  totalFiles: number;
  orientations: MediaBankOrientations;
  videos: number;
  rights: string;
  driveLink: string;
};

export type MediaBankAccessContext = Pick<ContentAccessContext, "workspaceId" | "role" | "isAdmin">;

export class MediaBankForbiddenError extends Error {
  constructor(message = "Acces refuse.") {
    super(message);
    this.name = "MediaBankForbiddenError";
  }
}

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizeCount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
};

// Seul un lien Drive https est exploitable : tout le reste est ecarte.
const normalizeDriveLink = (value: unknown): string | null => {
  const trimmed = normalizeText(value);
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const foldAccents = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Les droits doivent mentionner explicitement une cession media ou presse.
export const hasMediaUsageRights = (value: unknown): boolean => {
  const normalized = foldAccents(normalizeText(value).toLowerCase());
  return /\bmedias?\b/.test(normalized) || /\bpresse\b/.test(normalized);
};

const toMediaBankLot = (lot: MediaLot, driveLink: string, index: number): MediaBankLot => ({
  id: lot.row ? `lot-${lot.row}` : `lot-index-${index}`,
  row: lot.row ?? null,
  date: normalizeText(lot.date),
  athlete: normalizeText(lot.athlete),
  sport: normalizeText(lot.sport),
  mediaType: normalizeText(lot.mediaType),
  event: normalizeText(lot.event),
  place: normalizeText(lot.place),
  totalFiles: normalizeCount(lot.totalFiles),
  orientations: {
    vertical: normalizeCount(lot.vertical),
    horizontal: normalizeCount(lot.horizontal),
    square: normalizeCount(lot.square),
  },
  videos: normalizeCount(lot.videos),
  rights: normalizeText(lot.rights),
  driveLink,
});

export const listMediaBankLots = async (access: MediaBankAccessContext): Promise<MediaBankLot[]> => {
  if (access.role !== "admin" && access.role !== "media") {
    throw new MediaBankForbiddenError();
  }

  // La banque provient d une seule source Sheets : elle n existe que pour le workspace KLIQUE.
  if (normalizeText(access.workspaceId) !== getDefaultWorkspaceId()) {
    return [];
  }

  const lots = await getMediaFromGoogleSheets();

  return lots
    .map((lot, index) => {
      const driveLink = normalizeDriveLink(lot.driveLink);
      if (!driveLink || !hasMediaUsageRights(lot.rights)) return null;
      return toMediaBankLot(lot, driveLink, index);
    })
    .filter((lot): lot is MediaBankLot => lot !== null);
};
