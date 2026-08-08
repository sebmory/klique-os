type JsonSchema = Record<string, unknown>;

export type ReelTemplateMetadataRaw = {
  templateId: "reel";
  templateVersion: "v1";
};

export type ReelGenerationResultRaw = {
  title: string;
  selectedAngle: string;
  concepts: ReelConceptRaw[];
  metadata: ReelTemplateMetadataRaw;
};

export type ReelConceptSceneRaw = {
  order: number;
  durationSeconds: number;
  role: string;
  shotPlan: string;
  action: string;
  onScreenText: string;
  voiceOver: string;
  bRoll: string;
  transition: string;
  ambianceMusic: string;
  direction: string | null;
};

export type ReelConceptRaw = {
  hook: string;
  concept: string;
  scenes: ReelConceptSceneRaw[];
  cta: string;
  caption: string;
  hashtags: string[];
  coverIdea: string;
};

const nonEmptyStringSchema: JsonSchema = {
  type: "string",
  minLength: 1,
};

export const buildReelGenerationJsonSchema = (): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "selectedAngle",
    "concepts",
    "metadata",
  ],
  properties: {
    title: nonEmptyStringSchema,
    selectedAngle: nonEmptyStringSchema,
    concepts: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hook", "concept", "scenes", "cta", "caption", "hashtags", "coverIdea"],
        properties: {
          hook: nonEmptyStringSchema,
          concept: nonEmptyStringSchema,
          scenes: {
            type: "array",
            minItems: 2,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "order",
                "durationSeconds",
                "role",
                "shotPlan",
                "action",
                "onScreenText",
                "voiceOver",
                "bRoll",
                "transition",
                "ambianceMusic",
                "direction",
              ],
              properties: {
                order: { type: "integer", minimum: 1 },
                durationSeconds: { type: "integer", minimum: 1 },
                role: nonEmptyStringSchema,
                shotPlan: nonEmptyStringSchema,
                action: nonEmptyStringSchema,
                onScreenText: nonEmptyStringSchema,
                voiceOver: { type: "string" },
                bRoll: nonEmptyStringSchema,
                transition: nonEmptyStringSchema,
                ambianceMusic: nonEmptyStringSchema,
                direction: { type: ["string", "null"] },
              },
            },
          },
          cta: { type: "string" },
          caption: nonEmptyStringSchema,
          hashtags: {
            type: "array",
            minItems: 0,
            items: nonEmptyStringSchema,
          },
          coverIdea: nonEmptyStringSchema,
        },
      },
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["templateId", "templateVersion"],
      properties: {
        templateId: { type: "string", enum: ["reel"] },
        templateVersion: { type: "string", enum: ["v1"] },
      },
    },
  },
});
