import { put } from "@vercel/blob";

export type AthleteVisualUsage = "profilePortrait" | "kliqueArrivalVisual";

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const USAGE_FOLDER: Record<AthleteVisualUsage, string> = {
  profilePortrait: "profile",
  kliqueArrivalVisual: "arrival",
};

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const allowedAthleteVisualUsages: AthleteVisualUsage[] = ["profilePortrait", "kliqueArrivalVisual"];

export const isAllowedAthleteVisualUsage = (value: unknown): value is AthleteVisualUsage =>
  typeof value === "string" && allowedAthleteVisualUsages.includes(value as AthleteVisualUsage);

export const isAllowedAthleteVisualContentType = (contentType: string): boolean =>
  ALLOWED_CONTENT_TYPES.has(contentType);

export type UploadAthleteVisualInput = {
  athleteId: string;
  usage: AthleteVisualUsage;
  file: File;
};

export type UploadAthleteVisualResult = {
  url: string;
  pathname: string;
  contentType: string;
};

export const uploadAthleteVisual = async ({
  athleteId,
  usage,
  file,
}: UploadAthleteVisualInput): Promise<UploadAthleteVisualResult> => {
  const contentType = file.type;
  if (!isAllowedAthleteVisualContentType(contentType)) {
    throw new Error("Type d'image non autorisé. Formats acceptés: JPEG, PNG, WebP.");
  }

  const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
  const folder = USAGE_FOLDER[usage];
  const pathname = `athletes/${athleteId}/${folder}/${Date.now()}.${extension}`;

  const blob = await put(pathname, file, {
    access: "public",
    contentType,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType,
  };
};
