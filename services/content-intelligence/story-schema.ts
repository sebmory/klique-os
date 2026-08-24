type JsonSchema = Record<string, unknown>;

export type StoryTemplateMetadataRaw = {
  templateId: "story";
  templateVersion: "v1";
};

export type StorySequenceFrameRaw = {
  order: number;
  type: string;
  content: string;
  interaction: string | null;
};

export type StorySequenceRaw = {
  hook: string;
  frames: StorySequenceFrameRaw[];
  cta: string;
  caption: string;
  hashtags: string[];
};

export type StoryGenerationResultRaw = {
  title: string;
  selectedAngle: string;
  sequences: StorySequenceRaw[];
  metadata: StoryTemplateMetadataRaw;
};

const nonEmptyStringSchema: JsonSchema = {
  type: "string",
  minLength: 1,
};

const storyCardTypeSchema: JsonSchema = {
  type: "string",
  enum: ["introduction", "contexte", "citation", "sondage", "quiz", "question", "teaser", "appel_a_action"],
};

const frameSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["order", "type", "content", "interaction"],
  properties: {
    order: {
      type: "integer",
      minimum: 1,
    },
    type: storyCardTypeSchema,
    content: nonEmptyStringSchema,
    interaction: {
      type: ["string", "null"],
    },
  },
};

const sequenceSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["hook", "frames", "cta", "caption", "hashtags"],
  properties: {
    hook: nonEmptyStringSchema,
    frames: {
      type: "array",
      minItems: 2,
      items: frameSchema,
    },
    cta: {
      type: "string",
    },
    caption: nonEmptyStringSchema,
    hashtags: {
      type: "array",
      minItems: 0,
      items: nonEmptyStringSchema,
    },
  },
};

export const buildStoryGenerationJsonSchema = (): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  required: ["title", "selectedAngle", "sequences", "metadata"],
  properties: {
    title: nonEmptyStringSchema,
    selectedAngle: nonEmptyStringSchema,
    sequences: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: sequenceSchema,
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["templateId", "templateVersion"],
      properties: {
        templateId: { type: "string", enum: ["story"] },
        templateVersion: { type: "string", enum: ["v1"] },
      },
    },
  },
});
