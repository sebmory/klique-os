import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { imageSize } from "image-size";

export type AthleteVisualUsage = "profilePortrait" | "kliqueArrivalVisual";

export const allowedVisualContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedVisualContentType = typeof allowedVisualContentTypes[number];

const ALLOWED_CONTENT_TYPES = new Set<string>(allowedVisualContentTypes);

const USAGE_FOLDER: Record<AthleteVisualUsage, string> = {
  profilePortrait: "profile",
  kliqueArrivalVisual: "arrival",
};

const EXTENSION_BY_CONTENT_TYPE: Record<AllowedVisualContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const IMAGE_SIZE_TYPE_BY_CONTENT_TYPE: Record<AllowedVisualContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_VISUAL_BYTES = 10 * 1024 * 1024;
export const MIN_VISUAL_DIMENSION = 320;
export const MAX_VISUAL_DIMENSION = 8192;

export class AthleteVisualValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AthleteVisualValidationError";
  }
}

export const allowedAthleteVisualUsages: AthleteVisualUsage[] = ["profilePortrait", "kliqueArrivalVisual"];

export const isAllowedAthleteVisualUsage = (value: unknown): value is AthleteVisualUsage =>
  typeof value === "string" && allowedAthleteVisualUsages.includes(value as AthleteVisualUsage);

export const isAllowedAthleteVisualContentType = (contentType: string): boolean =>
  ALLOWED_CONTENT_TYPES.has(contentType);

export type UploadValidatedVisualInput = {
  file: File;
  pathnamePrefix: string;
};

export type UploadValidatedVisualResult = {
  url: string;
  pathname: string;
  contentType: AllowedVisualContentType;
  width: number;
  height: number;
  sizeBytes: number;
};

export const uploadValidatedVisual = async ({
  file,
  pathnamePrefix,
}: UploadValidatedVisualInput): Promise<UploadValidatedVisualResult> => {
  const contentType = file.type;
  if (!isAllowedAthleteVisualContentType(contentType)) {
    throw new AthleteVisualValidationError("Type d'image non autorisé. Formats acceptés: JPEG, PNG, WebP.");
  }
  if (file.size <= 0 || file.size > MAX_VISUAL_BYTES) {
    throw new AthleteVisualValidationError("Image trop volumineuse ou vide. Taille maximale: 10 Mo.");
  }

  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new AthleteVisualValidationError("Fichier image invalide ou illisible.");
  }

  const allowedContentType = contentType as AllowedVisualContentType;
  if (dimensions.type !== IMAGE_SIZE_TYPE_BY_CONTENT_TYPE[allowedContentType]) {
    throw new AthleteVisualValidationError("Le contenu du fichier ne correspond pas a son type MIME.");
  }
  if (
    !dimensions.width
    || !dimensions.height
    || dimensions.width < MIN_VISUAL_DIMENSION
    || dimensions.height < MIN_VISUAL_DIMENSION
    || dimensions.width > MAX_VISUAL_DIMENSION
    || dimensions.height > MAX_VISUAL_DIMENSION
  ) {
    throw new AthleteVisualValidationError("Dimensions invalides. Chaque cote doit etre compris entre 320 et 8192 px.");
  }

  const prefix = pathnamePrefix.replace(/^\/+|\/+$/g, "");
  if (!prefix) throw new AthleteVisualValidationError("Chemin Blob invalide.");
  const extension = EXTENSION_BY_CONTENT_TYPE[allowedContentType];
  const pathname = `${prefix}/${Date.now()}-${randomUUID()}.${extension}`;
  const blob = await put(pathname, file, {
    access: "public",
    contentType: allowedContentType,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: allowedContentType,
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: file.size,
  };
};

export type UploadAthleteVisualInput = {
  athleteId: string;
  usage: AthleteVisualUsage;
  file: File;
};

export type UploadAthleteVisualResult = {
  url: string;
  pathname: string;
  contentType: AllowedVisualContentType;
  width: number;
  height: number;
  sizeBytes: number;
};

export const uploadAthleteVisual = async ({
  athleteId,
  usage,
  file,
}: UploadAthleteVisualInput): Promise<UploadAthleteVisualResult> => {
  const folder = USAGE_FOLDER[usage];
  return uploadValidatedVisual({
    file,
    pathnamePrefix: `athletes/${athleteId}/${folder}`,
  });
};
