import {
  storyStudioBrandKitFonts,
  storyStudioBrandKitSignatureModes,
  type StoryStudioBrandKitFont,
  type StoryStudioBrandKitInput,
  type StoryStudioBrandKitSignatureMode,
  type UpdateStoryStudioBrandKitInput,
} from "@/types/story-studio-brand-kit";

export class StoryStudioBrandKitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryStudioBrandKitValidationError";
  }
}

const inputKeys = [
  "name",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "textColor",
  "mutedTextColor",
  "lightLogoPhotoId",
  "darkLogoPhotoId",
  "fontFamily",
  "signatureMode",
] as const;

const colorPattern = /^#[0-9A-Fa-f]{6}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StoryStudioBrandKitValidationError("Le Brand Kit doit etre un objet.");
  }
  return value as Record<string, unknown>;
};

const rejectUnknownKeys = (value: Record<string, unknown>) => {
  const unknownKey = Object.keys(value).find((key) => !inputKeys.includes(key as typeof inputKeys[number]));
  if (unknownKey) throw new StoryStudioBrandKitValidationError(`Champ Brand Kit inconnu: ${unknownKey}.`);
};

const requireName = (value: unknown): string => {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 80) {
    throw new StoryStudioBrandKitValidationError("Le nom doit contenir entre 1 et 80 caracteres.");
  }
  return name;
};

const requireColor = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !colorPattern.test(value)) {
    throw new StoryStudioBrandKitValidationError(`${field} doit etre une couleur hexadecimale #RRGGBB.`);
  }
  return value.toUpperCase();
};

const requireAssetId = (value: unknown, field: string): string | null => {
  if (value === null) return null;
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new StoryStudioBrandKitValidationError(`${field} doit etre un UUID de photo Story Studio ou null.`);
  }
  return value.toLowerCase();
};

const requireFont = (value: unknown): StoryStudioBrandKitFont => {
  if (!storyStudioBrandKitFonts.includes(value as StoryStudioBrandKitFont)) {
    throw new StoryStudioBrandKitValidationError("Police Brand Kit non autorisee.");
  }
  return value as StoryStudioBrandKitFont;
};

const requireSignatureMode = (value: unknown): StoryStudioBrandKitSignatureMode => {
  if (!storyStudioBrandKitSignatureModes.includes(value as StoryStudioBrandKitSignatureMode)) {
    throw new StoryStudioBrandKitValidationError("Mode de signature KLIQUE non autorise.");
  }
  return value as StoryStudioBrandKitSignatureMode;
};

const validators = {
  name: requireName,
  primaryColor: (value: unknown) => requireColor(value, "primaryColor"),
  secondaryColor: (value: unknown) => requireColor(value, "secondaryColor"),
  accentColor: (value: unknown) => requireColor(value, "accentColor"),
  textColor: (value: unknown) => requireColor(value, "textColor"),
  mutedTextColor: (value: unknown) => requireColor(value, "mutedTextColor"),
  lightLogoPhotoId: (value: unknown) => requireAssetId(value, "lightLogoPhotoId"),
  darkLogoPhotoId: (value: unknown) => requireAssetId(value, "darkLogoPhotoId"),
  fontFamily: requireFont,
  signatureMode: requireSignatureMode,
};

export const validateStoryStudioBrandKitInput = (value: unknown): StoryStudioBrandKitInput => {
  const input = requireObject(value);
  rejectUnknownKeys(input);
  return {
    name: requireName(input.name),
    primaryColor: requireColor(input.primaryColor, "primaryColor"),
    secondaryColor: requireColor(input.secondaryColor, "secondaryColor"),
    accentColor: requireColor(input.accentColor, "accentColor"),
    textColor: requireColor(input.textColor, "textColor"),
    mutedTextColor: requireColor(input.mutedTextColor, "mutedTextColor"),
    lightLogoPhotoId: requireAssetId(input.lightLogoPhotoId, "lightLogoPhotoId"),
    darkLogoPhotoId: requireAssetId(input.darkLogoPhotoId, "darkLogoPhotoId"),
    fontFamily: requireFont(input.fontFamily),
    signatureMode: requireSignatureMode(input.signatureMode),
  };
};

export const validateStoryStudioBrandKitUpdate = (value: unknown): UpdateStoryStudioBrandKitInput => {
  const input = requireObject(value);
  rejectUnknownKeys(input);
  if (Object.keys(input).length === 0) {
    throw new StoryStudioBrandKitValidationError("Au moins un champ Brand Kit doit etre fourni.");
  }

  const result: UpdateStoryStudioBrandKitInput = {};
  for (const key of inputKeys) {
    if (Object.hasOwn(input, key)) {
      Object.assign(result, { [key]: validators[key](input[key]) });
    }
  }
  return result;
};

export const validateStoryStudioBrandKitId = (value: unknown): string => {
  const id = requireAssetId(value, "brandKitId");
  if (!id) throw new StoryStudioBrandKitValidationError("brandKitId est obligatoire.");
  return id;
};