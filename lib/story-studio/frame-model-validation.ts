import { getStoryStudioLayoutKey, type StoryStudioFrameRole } from "@/types/story-studio";
import type {
  StoryStudioFrameModelContent,
  StoryStudioFrameModelInput,
} from "@/types/story-studio-frame-model";
import {
  StoryStudioValidationError,
  validateStoryStudioProjectPayload,
} from "@/lib/story-studio/validation";

export class StoryStudioFrameModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryStudioFrameModelValidationError";
  }
}

const roles: StoryStudioFrameRole[] = ["result", "context", "poll", "question"];

const requireObject = (value: unknown, field: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StoryStudioFrameModelValidationError(`${field} doit etre un objet.`);
  }
  return value as Record<string, unknown>;
};

const requireExactKeys = (value: Record<string, unknown>, keys: string[], field: string) => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new StoryStudioFrameModelValidationError(`${field} contient des champs inattendus.`);
  }
};

const validateContent = (value: unknown): StoryStudioFrameModelContent => {
  const content = requireObject(value, "content");
  requireExactKeys(
    content,
    ["schemaVersion", "canvasFormat", "templateKey", "brandKitId", "brandKitSnapshot", "frame"],
    "content",
  );
  if (content.schemaVersion !== 1 || content.canvasFormat !== "1080x1350") {
    throw new StoryStudioFrameModelValidationError("Le modele doit utiliser le schema 1 au format 1080x1350.");
  }

  const frame = requireObject(content.frame, "content.frame");
  const hasTextLayout = Object.hasOwn(frame, "textLayout");
  const hasLogoLayout = Object.hasOwn(frame, "logoLayout");
  requireExactKeys(
    frame,
    ["text", "elements", ...(hasTextLayout ? ["textLayout"] : []), ...(hasLogoLayout ? ["logoLayout"] : [])],
    "content.frame",
  );

  const layoutKey = getStoryStudioLayoutKey("1080x1350", String(content.templateKey) as StoryStudioFrameModelContent["templateKey"]);
  const frames = roles.map((role, index) => ({
    id: `frame-model-validation-${index + 1}`,
    order: index + 1,
    role,
    sourceStoryIndex: null,
    text: frame.text,
    ...(hasTextLayout ? { textLayouts: { [layoutKey]: frame.textLayout } } : {}),
    ...(hasLogoLayout ? { logoLayouts: { [layoutKey]: frame.logoLayout } } : {}),
    photo: { assetId: null, visible: false, scale: 1, x: 0, y: 0 },
    elements: frame.elements,
  }));

  try {
    const payload = validateStoryStudioProjectPayload({
      schemaVersion: 1,
      canvasFormat: "1080x1350",
      templateKey: content.templateKey,
      brandKitId: content.brandKitId,
      brandKitSnapshot: content.brandKitSnapshot,
      frames,
    });
    const validatedFrame = payload.frames[0];
    return {
      schemaVersion: 1,
      canvasFormat: "1080x1350",
      templateKey: payload.templateKey,
      brandKitId: payload.brandKitId ?? null,
      brandKitSnapshot: payload.brandKitSnapshot ?? null,
      frame: {
        text: validatedFrame.text,
        elements: validatedFrame.elements,
        ...(hasTextLayout ? { textLayout: validatedFrame.textLayouts?.[layoutKey] } : {}),
        ...(hasLogoLayout ? { logoLayout: validatedFrame.logoLayouts?.[layoutKey] } : {}),
      },
    };
  } catch (error) {
    if (error instanceof StoryStudioValidationError) {
      throw new StoryStudioFrameModelValidationError(error.message);
    }
    throw error;
  }
};

export const validateStoryStudioFrameModelInput = (value: unknown): StoryStudioFrameModelInput => {
  const input = requireObject(value, "modele");
  requireExactKeys(input, ["name", "content"], "modele");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 80) {
    throw new StoryStudioFrameModelValidationError("Le nom du modele doit contenir entre 1 et 80 caracteres.");
  }
  return { name, content: validateContent(input.content) };
};