import {
  storyStudioTemplateKeys,
  type StoryStudioBrandKitSnapshot,
  type StoryStudioFrame,
  type StoryStudioFrameRole,
  type StoryStudioProjectPayload,
  type StoryStudioTextLayout,
  type StoryStudioTemplateKey,
} from "@/types/story-studio";
import { storyStudioBrandKitFonts, storyStudioBrandKitSignatureModes } from "@/types/story-studio-brand-kit";

export class StoryStudioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryStudioValidationError";
  }
}

const frameRoles: StoryStudioFrameRole[] = ["result", "context", "poll", "question"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const colorPattern = /^#[0-9A-Fa-f]{6}$/;

const requireObject = (value: unknown, fieldName: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StoryStudioValidationError(`${fieldName} doit etre un objet.`);
  }
  return value as Record<string, unknown>;
};

const requireExactKeys = (value: Record<string, unknown>, keys: string[], fieldName: string): void => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new StoryStudioValidationError(`${fieldName} contient des champs inattendus.`);
  }
};

const requireString = (value: unknown, fieldName: string, allowEmpty = false): string => {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new StoryStudioValidationError(`${fieldName} doit etre une chaine${allowEmpty ? "" : " non vide"}.`);
  }
  return allowEmpty ? value : value.trim();
};

const requireBoolean = (value: unknown, fieldName: string): boolean => {
  if (typeof value !== "boolean") {
    throw new StoryStudioValidationError(`${fieldName} doit etre un booleen.`);
  }
  return value;
};

const requireNumber = (value: unknown, fieldName: string, minimum: number, maximum: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new StoryStudioValidationError(`${fieldName} doit etre compris entre ${minimum} et ${maximum}.`);
  }
  return value;
};

const requireNullableLogo = (id: unknown, url: unknown, fieldName: string) => {
  if (id === null && url === null) return { id: null, url: null };
  if (typeof id !== "string" || !uuidPattern.test(id)) {
    throw new StoryStudioValidationError(`${fieldName}PhotoId doit etre un UUID ou null.`);
  }
  if (typeof url !== "string") {
    throw new StoryStudioValidationError(`${fieldName}Url doit etre une URL Blob Vercel.`);
  }
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:"
      || !parsed.hostname.endsWith(".blob.vercel-storage.com")
      || !parsed.pathname.startsWith("/story-studio/photos/")
    ) throw new Error("invalid");
  } catch {
    throw new StoryStudioValidationError(`${fieldName}Url doit etre une URL Blob Vercel Story Studio.`);
  }
  return { id: id.toLowerCase(), url };
};

const validateBrandKitSnapshot = (value: unknown): StoryStudioBrandKitSnapshot => {
  const snapshot = requireObject(value, "payload.brandKitSnapshot");
  requireExactKeys(snapshot, [
    "name", "primaryColor", "secondaryColor", "accentColor", "textColor", "mutedTextColor",
    "lightLogoPhotoId", "darkLogoPhotoId", "lightLogoUrl", "darkLogoUrl", "fontFamily", "signatureMode",
  ], "payload.brandKitSnapshot");
  const color = (key: "primaryColor" | "secondaryColor" | "accentColor" | "textColor" | "mutedTextColor") => {
    if (typeof snapshot[key] !== "string" || !colorPattern.test(snapshot[key])) {
      throw new StoryStudioValidationError(`payload.brandKitSnapshot.${key} doit etre une couleur #RRGGBB.`);
    }
    return snapshot[key].toUpperCase();
  };
  if (!storyStudioBrandKitFonts.includes(snapshot.fontFamily as never)) {
    throw new StoryStudioValidationError("payload.brandKitSnapshot.fontFamily n'est pas autorisee.");
  }
  if (!storyStudioBrandKitSignatureModes.includes(snapshot.signatureMode as never)) {
    throw new StoryStudioValidationError("payload.brandKitSnapshot.signatureMode n'est pas autorise.");
  }
  const lightLogo = requireNullableLogo(snapshot.lightLogoPhotoId, snapshot.lightLogoUrl, "lightLogo");
  const darkLogo = requireNullableLogo(snapshot.darkLogoPhotoId, snapshot.darkLogoUrl, "darkLogo");
  return {
    name: requireString(snapshot.name, "payload.brandKitSnapshot.name"),
    primaryColor: color("primaryColor"),
    secondaryColor: color("secondaryColor"),
    accentColor: color("accentColor"),
    textColor: color("textColor"),
    mutedTextColor: color("mutedTextColor"),
    lightLogoPhotoId: lightLogo.id,
    darkLogoPhotoId: darkLogo.id,
    lightLogoUrl: lightLogo.url,
    darkLogoUrl: darkLogo.url,
    fontFamily: snapshot.fontFamily as StoryStudioBrandKitSnapshot["fontFamily"],
    signatureMode: snapshot.signatureMode as StoryStudioBrandKitSnapshot["signatureMode"],
  };
};

const validateFrame = (value: unknown, index: number): StoryStudioFrame => {
  const field = `frames[${index}]`;
  const frame = requireObject(value, field);
  const hasTextLayouts = Object.hasOwn(frame, "textLayouts");
  requireExactKeys(
    frame,
    hasTextLayouts
      ? ["id", "order", "role", "sourceStoryIndex", "text", "textLayouts", "photo", "elements"]
      : ["id", "order", "role", "sourceStoryIndex", "text", "photo", "elements"],
    field,
  );

  const expectedOrder = index + 1;
  if (frame.order !== expectedOrder) {
    throw new StoryStudioValidationError(`${field}.order doit valoir ${expectedOrder}.`);
  }
  if (frame.role !== frameRoles[index]) {
    throw new StoryStudioValidationError(`${field}.role doit valoir ${frameRoles[index]}.`);
  }
  if (frame.sourceStoryIndex !== null && (!Number.isInteger(frame.sourceStoryIndex) || Number(frame.sourceStoryIndex) < 1)) {
    throw new StoryStudioValidationError(`${field}.sourceStoryIndex doit etre un entier positif ou null.`);
  }

  const text = requireObject(frame.text, `${field}.text`);
  requireExactKeys(text, ["eyebrow", "headline", "body", "interaction"], `${field}.text`);
  const photo = requireObject(frame.photo, `${field}.photo`);
  requireExactKeys(photo, ["assetId", "visible", "scale", "x", "y"], `${field}.photo`);
  const elements = requireObject(frame.elements, `${field}.elements`);
  requireExactKeys(
    elements,
    ["athleteName", "score", "competition", "logo", "signature", "interactionZone"],
    `${field}.elements`
  );

  let textLayouts: StoryStudioFrame["textLayouts"];
  if (hasTextLayouts) {
    const layouts = requireObject(frame.textLayouts, `${field}.textLayouts`);
    requireExactKeys(layouts, Object.keys(layouts).filter((key) => storyStudioTemplateKeys.includes(key as StoryStudioTemplateKey)), `${field}.textLayouts`);
    textLayouts = {};
    for (const [templateKey, rawLayout] of Object.entries(layouts)) {
      if (!storyStudioTemplateKeys.includes(templateKey as StoryStudioTemplateKey)) {
        throw new StoryStudioValidationError(`${field}.textLayouts.${templateKey} est un template inconnu.`);
      }
      const layout = requireObject(rawLayout, `${field}.textLayouts.${templateKey}`);
      requireExactKeys(layout, ["eyebrow", "headline", "body"], `${field}.textLayouts.${templateKey}`);
      const validatedLayout = {} as StoryStudioTextLayout;
      for (const block of ["eyebrow", "headline", "body"] as const) {
        const position = requireObject(layout[block], `${field}.textLayouts.${templateKey}.${block}`);
        requireExactKeys(position, ["x", "y"], `${field}.textLayouts.${templateKey}.${block}`);
        validatedLayout[block] = {
          x: requireNumber(position.x, `${field}.textLayouts.${templateKey}.${block}.x`, 0, 1080),
          y: requireNumber(position.y, `${field}.textLayouts.${templateKey}.${block}.y`, 0, 1920),
        };
      }
      textLayouts[templateKey as StoryStudioTemplateKey] = validatedLayout;
    }
  }

  return {
    id: requireString(frame.id, `${field}.id`),
    order: expectedOrder as StoryStudioFrame["order"],
    role: frameRoles[index],
    sourceStoryIndex: frame.sourceStoryIndex === null ? null : Number(frame.sourceStoryIndex),
    text: {
      eyebrow: requireString(text.eyebrow, `${field}.text.eyebrow`, true),
      headline: requireString(text.headline, `${field}.text.headline`, true),
      body: requireString(text.body, `${field}.text.body`, true),
      interaction: requireString(text.interaction, `${field}.text.interaction`, true),
    },
    ...(textLayouts ? { textLayouts } : {}),
    photo: {
      assetId: photo.assetId === null ? null : requireString(photo.assetId, `${field}.photo.assetId`),
      visible: requireBoolean(photo.visible, `${field}.photo.visible`),
      scale: requireNumber(photo.scale, `${field}.photo.scale`, 0.1, 10),
      x: requireNumber(photo.x, `${field}.photo.x`, -1, 1),
      y: requireNumber(photo.y, `${field}.photo.y`, -1, 1),
    },
    elements: {
      athleteName: requireBoolean(elements.athleteName, `${field}.elements.athleteName`),
      score: requireBoolean(elements.score, `${field}.elements.score`),
      competition: requireBoolean(elements.competition, `${field}.elements.competition`),
      logo: requireBoolean(elements.logo, `${field}.elements.logo`),
      signature: requireBoolean(elements.signature, `${field}.elements.signature`),
      interactionZone: requireBoolean(elements.interactionZone, `${field}.elements.interactionZone`),
    },
  };
};

export const validateStoryStudioProjectPayload = (value: unknown): StoryStudioProjectPayload => {
  const payload = requireObject(value, "payload");
  const hasBrandKit = Object.hasOwn(payload, "brandKitId") || Object.hasOwn(payload, "brandKitSnapshot");
  requireExactKeys(
    payload,
    hasBrandKit
      ? ["schemaVersion", "templateKey", "brandKitId", "brandKitSnapshot", "frames"]
      : ["schemaVersion", "templateKey", "frames"],
    "payload",
  );
  if (payload.schemaVersion !== 1) {
    throw new StoryStudioValidationError("payload.schemaVersion doit valoir 1.");
  }
  if (!storyStudioTemplateKeys.includes(payload.templateKey as never)) {
    throw new StoryStudioValidationError("payload.templateKey contient une valeur non supportee.");
  }
  if (!Array.isArray(payload.frames) || payload.frames.length !== 4) {
    throw new StoryStudioValidationError("payload.frames doit contenir exactement quatre frames.");
  }

  let brandKitFields: Pick<StoryStudioProjectPayload, "brandKitId" | "brandKitSnapshot"> | Record<string, never> = {};
  if (hasBrandKit) {
    if (payload.brandKitId === null && payload.brandKitSnapshot === null) {
      brandKitFields = { brandKitId: null, brandKitSnapshot: null };
    } else {
      if (typeof payload.brandKitId !== "string" || !uuidPattern.test(payload.brandKitId)) {
        throw new StoryStudioValidationError("payload.brandKitId doit etre un UUID ou null.");
      }
      brandKitFields = {
        brandKitId: payload.brandKitId.toLowerCase(),
        brandKitSnapshot: validateBrandKitSnapshot(payload.brandKitSnapshot),
      };
    }
  }

  return {
    schemaVersion: 1,
    templateKey: payload.templateKey as StoryStudioProjectPayload["templateKey"],
    ...brandKitFields,
    frames: payload.frames.map(validateFrame) as StoryStudioProjectPayload["frames"],
  };
};