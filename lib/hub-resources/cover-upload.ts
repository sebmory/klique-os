import { randomUUID } from "crypto";
import { put } from "@vercel/blob";

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png"]);

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

export const MAX_HUB_RESOURCE_COVER_BYTES = 4 * 1024 * 1024;

export const isAllowedHubResourceCoverContentType = (contentType: string): boolean =>
  ALLOWED_CONTENT_TYPES.has(contentType);

export type UploadHubResourceCoverResult = {
  url: string;
};

export const uploadHubResourceCover = async (file: File): Promise<UploadHubResourceCoverResult> => {
  const contentType = file.type;
  if (!isAllowedHubResourceCoverContentType(contentType)) {
    throw new Error("Type d'image non autorisé. Formats acceptés: JPEG, PNG.");
  }

  if (file.size > MAX_HUB_RESOURCE_COVER_BYTES) {
    throw new Error("Image trop volumineuse. Taille maximale: 4 Mo.");
  }

  const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
  const pathname = `hub-resources/covers/${Date.now()}-${randomUUID()}.${extension}`;

  const blob = await put(pathname, file, {
    access: "public",
    contentType,
  });

  return { url: blob.url };
};
