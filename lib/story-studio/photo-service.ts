import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { imageSize } from "image-size";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import {
  isAllowedAthleteVisualContentType,
  MAX_VISUAL_DIMENSION,
  MIN_VISUAL_DIMENSION,
  type AllowedVisualContentType,
} from "@/lib/athlete-visuals/service";
import { MAX_STORY_STUDIO_PHOTO_BYTES } from "@/types/story-studio-photo";

const INTENT_TTL_MS = 15 * 60 * 1000;
const MIN_BRAND_KIT_LOGO_DIMENSION = 128;
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

type StoryStudioPhotoUploadIntent = {
  version: 1;
  expiresAt: number;
  pathname: string;
  workspaceId: string;
  clerkUserId: string;
  mediaId: string | null;
  athleteId: string | null;
  assetKind: StoryStudioUploadAssetKind;
  contentType: AllowedVisualContentType;
  sizeBytes: number;
};

export type StoryStudioUploadAssetKind = "photo" | "brandKitLogo";

export class StoryStudioPhotoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryStudioPhotoValidationError";
  }
}

const getSigningSecret = () => {
  const secret = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!secret) throw new Error("BLOB_READ_WRITE_TOKEN est absent.");
  return secret;
};

const signPayload = (payload: string) => createHmac("sha256", getSigningSecret())
  .update(payload)
  .digest("base64url");

const assertUploadInput = (contentType: string, sizeBytes: number): AllowedVisualContentType => {
  if (!isAllowedAthleteVisualContentType(contentType)) {
    throw new StoryStudioPhotoValidationError("Type d'image non autorisé. Formats acceptés: JPEG, PNG, WebP.");
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new StoryStudioPhotoValidationError("Le fichier image est vide ou invalide.");
  }
  if (sizeBytes > MAX_STORY_STUDIO_PHOTO_BYTES) {
    throw new StoryStudioPhotoValidationError("La photo dépasse la limite de 25 Mo.");
  }
  return contentType as AllowedVisualContentType;
};

export const createStoryStudioPhotoUploadIntent = (
  input: { athleteId: string | null; assetKind?: StoryStudioUploadAssetKind; contentType: string; sizeBytes: number },
  access: ContentAccessContext,
) => {
  const contentType = assertUploadInput(input.contentType, input.sizeBytes);
  const assetKind = input.assetKind ?? "photo";
  const folder = assetKind === "brandKitLogo" ? "brand-kit-logos" : "photos";
  const pathname = `story-studio/${folder}/${randomUUID()}.${EXTENSION_BY_CONTENT_TYPE[contentType]}`;
  const payload: StoryStudioPhotoUploadIntent = {
    version: 1,
    expiresAt: Date.now() + INTENT_TTL_MS,
    pathname,
    workspaceId: access.workspaceId,
    clerkUserId: access.clerkUserId,
    mediaId: access.isAdmin ? null : access.mediaId ?? null,
    athleteId: input.athleteId,
    assetKind,
    contentType,
    sizeBytes: input.sizeBytes,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { pathname, uploadIntent: `${encodedPayload}.${signPayload(encodedPayload)}` };
};

export const verifyStoryStudioPhotoUploadIntent = (
  uploadIntent: string,
  access: ContentAccessContext,
): StoryStudioPhotoUploadIntent => {
  const [encodedPayload, signature, extra] = uploadIntent.split(".");
  if (!encodedPayload || !signature || extra) throw new StoryStudioPhotoValidationError("Intention d'upload invalide.");
  const expected = Buffer.from(signPayload(encodedPayload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new StoryStudioPhotoValidationError("Intention d'upload invalide.");
  }

  let payload: StoryStudioPhotoUploadIntent;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as StoryStudioPhotoUploadIntent;
  } catch {
    throw new StoryStudioPhotoValidationError("Intention d'upload invalide.");
  }
  if (
    payload.version !== 1
    || payload.expiresAt < Date.now()
    || payload.workspaceId !== access.workspaceId
    || payload.clerkUserId !== access.clerkUserId
    || payload.mediaId !== (access.isAdmin ? null : access.mediaId ?? null)
  ) {
    throw new StoryStudioPhotoValidationError("Intention d'upload expirée ou non autorisée.");
  }
  assertUploadInput(payload.contentType, payload.sizeBytes);
  return payload;
};

export const validateStoryStudioPhotoBytes = (
  bytes: Uint8Array,
  contentType: string,
  sizeBytes: number,
  assetKind: StoryStudioUploadAssetKind = "photo",
) => {
  const allowedContentType = assertUploadInput(contentType, sizeBytes);
  if (bytes.byteLength !== sizeBytes) {
    throw new StoryStudioPhotoValidationError("La taille du Blob ne correspond pas au fichier autorisé.");
  }

  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(bytes);
  } catch {
    throw new StoryStudioPhotoValidationError("Fichier image invalide ou illisible.");
  }
  if (dimensions.type !== IMAGE_SIZE_TYPE_BY_CONTENT_TYPE[allowedContentType]) {
    throw new StoryStudioPhotoValidationError("Le contenu du fichier ne correspond pas à son type MIME.");
  }
  const minimumDimension = assetKind === "brandKitLogo" ? MIN_BRAND_KIT_LOGO_DIMENSION : MIN_VISUAL_DIMENSION;
  if (
    !dimensions.width
    || !dimensions.height
    || dimensions.width < minimumDimension
    || dimensions.height < minimumDimension
    || dimensions.width > MAX_VISUAL_DIMENSION
    || dimensions.height > MAX_VISUAL_DIMENSION
  ) {
    throw new StoryStudioPhotoValidationError(`Dimensions invalides. Chaque côté doit être compris entre ${minimumDimension} et 8192 px.`);
  }
  return { contentType: allowedContentType, width: dimensions.width, height: dimensions.height, sizeBytes };
};