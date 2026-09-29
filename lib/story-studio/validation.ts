import {
  DEFAULT_STORY_STUDIO_CANVAS_FORMAT,
  storyStudioCanvasFormats,
  storyStudioTemplateKeys,
  type StoryStudioCanvasFormat,
  type StoryStudioBrandKitSnapshot,
  type StoryStudioFrame,
  type StoryStudioFrameRole,
  type StoryStudioProjectPayload,
  type StoryStudioTextLayout,
  type StoryStudioLayoutKey,
  type StoryStudioMatchCard,
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
const allowedStoryStudioLogoPathPrefixes = ["/story-studio/photos/", "/story-studio/brand-kit-logos/"] as const;
const allowedStoryStudioSubjectPathPrefix = "/story-studio/subjects/";

const parseLayoutKey = (key: string): { key: StoryStudioLayoutKey; canvasFormat: StoryStudioCanvasFormat } | null => {
  if (storyStudioTemplateKeys.includes(key as StoryStudioTemplateKey)) {
    return { key: key as StoryStudioTemplateKey, canvasFormat: DEFAULT_STORY_STUDIO_CANVAS_FORMAT };
  }
  const [canvasFormat, templateKey, extra] = key.split(":");
  if (extra !== undefined
    || !storyStudioCanvasFormats.includes(canvasFormat as StoryStudioCanvasFormat)
    || !storyStudioTemplateKeys.includes(templateKey as StoryStudioTemplateKey)) {
    return null;
  }
  return { key: key as StoryStudioLayoutKey, canvasFormat: canvasFormat as StoryStudioCanvasFormat };
};

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
      || !allowedStoryStudioLogoPathPrefixes.some((prefix) => parsed.pathname.startsWith(prefix))
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

const validateMatchCard = (value: unknown, field: string): StoryStudioMatchCard => {
  const matchCard = requireObject(value, field);
  requireExactKeys(matchCard, ["competition", "homeTeam", "awayTeam", "homeScore", "awayScore"], field);
  const validateTeam = (value: unknown, teamField: string): StoryStudioMatchCard["homeTeam"] => {
    const team = requireObject(value, teamField);
    requireExactKeys(team, ["name", "logoPhotoId", "logoUrl"], teamField);
    const name = requireString(team.name, `${teamField}.name`);
    if (name.length > 80) throw new StoryStudioValidationError(`${teamField}.name ne doit pas depasser 80 caracteres.`);
    const logo = requireNullableLogo(team.logoPhotoId, team.logoUrl, `${teamField}.logo`);
    return { name, logoPhotoId: logo.id, logoUrl: logo.url };
  };
  const competition = requireString(matchCard.competition, `${field}.competition`, true).trim();
  if (competition.length > 120) {
    throw new StoryStudioValidationError(`${field}.competition ne doit pas depasser 120 caracteres.`);
  }
  const score = (value: unknown, scoreField: string): number => {
    const parsed = requireNumber(value, scoreField, 0, 99);
    if (!Number.isInteger(parsed)) throw new StoryStudioValidationError(`${scoreField} doit etre un entier.`);
    return parsed;
  };
  return {
    competition,
    homeTeam: validateTeam(matchCard.homeTeam, `${field}.homeTeam`),
    awayTeam: validateTeam(matchCard.awayTeam, `${field}.awayTeam`),
    homeScore: score(matchCard.homeScore, `${field}.homeScore`),
    awayScore: score(matchCard.awayScore, `${field}.awayScore`),
  };
};

const validateFrame = (value: unknown, index: number): StoryStudioFrame => {
  const field = `frames[${index}]`;
  const frame = requireObject(value, field);
  const hasTextLayouts = Object.hasOwn(frame, "textLayouts");
  const hasLogoLayouts = Object.hasOwn(frame, "logoLayouts");
  const hasMatchCard = Object.hasOwn(frame, "matchCard");
  const hasSubjectLayer = Object.hasOwn(frame, "subjectLayer");
  requireExactKeys(
    frame,
    [
      "id", "order", "role", "sourceStoryIndex", "text",
      ...(hasMatchCard ? ["matchCard"] : []),
      ...(hasSubjectLayer ? ["subjectLayer"] : []),
      ...(hasTextLayouts ? ["textLayouts"] : []),
      ...(hasLogoLayouts ? ["logoLayouts"] : []),
      "photo", "elements",
    ],
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

  let subjectLayer: StoryStudioFrame["subjectLayer"];
  if (hasSubjectLayer) {
    const subject = requireObject(frame.subjectLayer, `${field}.subjectLayer`);
    requireExactKeys(subject, ["photoId", "url", "x", "y", "scale"], `${field}.subjectLayer`);
    if (typeof subject.photoId !== "string" || !uuidPattern.test(subject.photoId)) {
      throw new StoryStudioValidationError(`${field}.subjectLayer.photoId doit etre un UUID.`);
    }
    if (typeof subject.url !== "string") {
      throw new StoryStudioValidationError(`${field}.subjectLayer.url doit etre une URL Blob Vercel.`);
    }
    try {
      const url = new URL(subject.url);
      if (url.protocol !== "https:"
        || !url.hostname.endsWith(".blob.vercel-storage.com")
        || !url.pathname.startsWith(allowedStoryStudioSubjectPathPrefix)) throw new Error("invalid");
    } catch {
      throw new StoryStudioValidationError(`${field}.subjectLayer.url doit etre une URL Blob Vercel Story Studio subjects.`);
    }
    subjectLayer = {
      photoId: subject.photoId.toLowerCase(),
      url: subject.url,
      x: requireNumber(subject.x, `${field}.subjectLayer.x`, -8192, 1080),
      y: requireNumber(subject.y, `${field}.subjectLayer.y`, -8192, 1920),
      scale: requireNumber(subject.scale, `${field}.subjectLayer.scale`, 0.1, 4),
    };
  }

  let textLayouts: StoryStudioFrame["textLayouts"];
  if (hasTextLayouts) {
    const layouts = requireObject(frame.textLayouts, `${field}.textLayouts`);
    requireExactKeys(layouts, Object.keys(layouts).filter((key) => parseLayoutKey(key)), `${field}.textLayouts`);
    textLayouts = {};
    for (const [layoutKey, rawLayout] of Object.entries(layouts)) {
      const parsedKey = parseLayoutKey(layoutKey);
      if (!parsedKey) {
        throw new StoryStudioValidationError(`${field}.textLayouts.${layoutKey} est une disposition inconnue.`);
      }
      const layout = requireObject(rawLayout, `${field}.textLayouts.${layoutKey}`);
      requireExactKeys(layout, ["eyebrow", "headline", "body"], `${field}.textLayouts.${layoutKey}`);
      const validatedLayout = {} as StoryStudioTextLayout;
      for (const block of ["eyebrow", "headline", "body"] as const) {
        const position = requireObject(layout[block], `${field}.textLayouts.${layoutKey}.${block}`);
        requireExactKeys(position, ["x", "y"], `${field}.textLayouts.${layoutKey}.${block}`);
        validatedLayout[block] = {
          x: requireNumber(position.x, `${field}.textLayouts.${layoutKey}.${block}.x`, 0, 1080),
          y: requireNumber(position.y, `${field}.textLayouts.${layoutKey}.${block}.y`, 0, parsedKey.canvasFormat === "1080x1350" ? 1350 : 1920),
        };
      }
      textLayouts[parsedKey.key] = validatedLayout;
    }
  }

  let logoLayouts: StoryStudioFrame["logoLayouts"];
  if (hasLogoLayouts) {
    const layouts = requireObject(frame.logoLayouts, `${field}.logoLayouts`);
    requireExactKeys(layouts, Object.keys(layouts).filter((key) => parseLayoutKey(key)), `${field}.logoLayouts`);
    logoLayouts = {};
    for (const [layoutKey, rawLayout] of Object.entries(layouts)) {
      const parsedKey = parseLayoutKey(layoutKey);
      if (!parsedKey) {
        throw new StoryStudioValidationError(`${field}.logoLayouts.${layoutKey} est une disposition inconnue.`);
      }
      const layout = requireObject(rawLayout, `${field}.logoLayouts.${layoutKey}`);
      requireExactKeys(layout, ["x", "y", "scale"], `${field}.logoLayouts.${layoutKey}`);
      logoLayouts[parsedKey.key] = {
        x: requireNumber(layout.x, `${field}.logoLayouts.${layoutKey}.x`, 0, 1080),
        y: requireNumber(layout.y, `${field}.logoLayouts.${layoutKey}.y`, 0, parsedKey.canvasFormat === "1080x1350" ? 1350 : 1920),
        scale: requireNumber(layout.scale, `${field}.logoLayouts.${layoutKey}.scale`, 0.25, 4),
      };
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
    ...(hasMatchCard ? { matchCard: validateMatchCard(frame.matchCard, `${field}.matchCard`) } : {}),
    ...(subjectLayer ? { subjectLayer } : {}),
    ...(textLayouts ? { textLayouts } : {}),
    ...(logoLayouts ? { logoLayouts } : {}),
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
  const hasCanvasFormat = Object.hasOwn(payload, "canvasFormat");
  requireExactKeys(
    payload,
    [
      "schemaVersion",
      ...(hasCanvasFormat ? ["canvasFormat"] : []),
      "templateKey",
      ...(hasBrandKit ? ["brandKitId", "brandKitSnapshot"] : []),
      "frames",
    ],
    "payload",
  );
  if (payload.schemaVersion !== 1) {
    throw new StoryStudioValidationError("payload.schemaVersion doit valoir 1.");
  }
  if (!storyStudioTemplateKeys.includes(payload.templateKey as never)) {
    throw new StoryStudioValidationError("payload.templateKey contient une valeur non supportee.");
  }
  if (hasCanvasFormat && !storyStudioCanvasFormats.includes(payload.canvasFormat as StoryStudioCanvasFormat)) {
    throw new StoryStudioValidationError("payload.canvasFormat contient une valeur non supportee.");
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
    ...(hasCanvasFormat ? { canvasFormat: payload.canvasFormat as StoryStudioCanvasFormat } : {}),
    templateKey: payload.templateKey as StoryStudioProjectPayload["templateKey"],
    ...brandKitFields,
    frames: payload.frames.map(validateFrame) as StoryStudioProjectPayload["frames"],
  };
};