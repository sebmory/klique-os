type JsonSchema = Record<string, unknown>;

const nonEmptyStringSchema: JsonSchema = {
  type: "string",
  minLength: 1,
};

const storyTypeEnum = [
  "introduction",
  "contexte",
  "citation",
  "sondage",
  "quiz",
  "question",
  "teaser",
  "appel_a_action",
];

export const buildVariationJsonSchema = (variationType: string, constraint: { slideCount?: number; storyCount?: number }): JsonSchema => {
  if (variationType === "carousel") {
    const count = Math.max(2, Math.min(12, Number(constraint.slideCount ?? 5)));
    return {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "structuredContent"],
      properties: {
        title: nonEmptyStringSchema,
        summary: nonEmptyStringSchema,
        structuredContent: {
          type: "object",
          additionalProperties: false,
          required: ["title", "cover", "slides", "conclusion", "callToAction", "caption"],
          properties: {
            title: nonEmptyStringSchema,
            cover: nonEmptyStringSchema,
            slides: {
              type: "array",
              minItems: count,
              maxItems: count,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["index", "text"],
                properties: {
                  index: { type: "integer", minimum: 1 },
                  text: nonEmptyStringSchema,
                },
              },
            },
            conclusion: nonEmptyStringSchema,
            callToAction: nonEmptyStringSchema,
            caption: nonEmptyStringSchema,
          },
        },
      },
    };
  }

  if (variationType === "reel") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "structuredContent"],
      properties: {
        title: nonEmptyStringSchema,
        summary: nonEmptyStringSchema,
        structuredContent: {
          type: "object",
          additionalProperties: false,
          required: ["concept", "hook", "duration", "scenario", "scenes", "onScreenText", "voiceOver", "callToAction", "caption", "coverIdea"],
          properties: {
            concept: nonEmptyStringSchema,
            hook: nonEmptyStringSchema,
            duration: nonEmptyStringSchema,
            scenario: nonEmptyStringSchema,
            scenes: {
              type: "array",
              minItems: 2,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["index", "shot", "action"],
                properties: {
                  index: { type: "integer", minimum: 1 },
                  shot: nonEmptyStringSchema,
                  action: nonEmptyStringSchema,
                },
              },
            },
            onScreenText: {
              type: "array",
              minItems: 1,
              items: nonEmptyStringSchema,
            },
            voiceOver: { type: "string" },
            callToAction: nonEmptyStringSchema,
            caption: nonEmptyStringSchema,
            coverIdea: nonEmptyStringSchema,
          },
        },
      },
    };
  }

  if (variationType === "stories") {
    const count = Math.max(2, Math.min(12, Number(constraint.storyCount ?? 4)));
    return {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "structuredContent"],
      properties: {
        title: nonEmptyStringSchema,
        summary: nonEmptyStringSchema,
        structuredContent: {
          type: "object",
          additionalProperties: false,
          required: ["sequenceTitle", "stories", "callToAction"],
          properties: {
            sequenceTitle: nonEmptyStringSchema,
            stories: {
              type: "array",
              minItems: count,
              maxItems: count,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  index: { type: "integer", minimum: 1 },
                  type: { type: "string", enum: storyTypeEnum },
                  content: nonEmptyStringSchema,
                  interaction: { type: "string" },
                },
                required: ["index", "type", "content", "interaction"],
              },
            },
            callToAction: nonEmptyStringSchema,
          },
        },
      },
    };
  }

  if (variationType === "teaser") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "structuredContent"],
      properties: {
        title: nonEmptyStringSchema,
        summary: nonEmptyStringSchema,
        structuredContent: {
          type: "object",
          additionalProperties: false,
          required: ["shortVersion", "mediumVersion", "hook", "callToAction", "recommendedChannel"],
          properties: {
            shortVersion: nonEmptyStringSchema,
            mediumVersion: nonEmptyStringSchema,
            hook: nonEmptyStringSchema,
            callToAction: nonEmptyStringSchema,
            recommendedChannel: nonEmptyStringSchema,
          },
        },
      },
    };
  }

  if (variationType === "short_article") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "structuredContent"],
      properties: {
        title: nonEmptyStringSchema,
        summary: nonEmptyStringSchema,
        structuredContent: {
          type: "object",
          additionalProperties: false,
          required: ["title", "chapo", "introduction", "structure", "body", "conclusion"],
          properties: {
            title: nonEmptyStringSchema,
            chapo: nonEmptyStringSchema,
            introduction: nonEmptyStringSchema,
            structure: {
              type: "array",
              minItems: 2,
              items: nonEmptyStringSchema,
            },
            body: nonEmptyStringSchema,
            conclusion: nonEmptyStringSchema,
          },
        },
      },
    };
  }

  if (variationType === "quote_visual") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "structuredContent"],
      properties: {
        title: nonEmptyStringSchema,
        summary: nonEmptyStringSchema,
        structuredContent: {
          type: "object",
          additionalProperties: false,
          required: ["hasQuote", "quote", "sourceSection", "context", "visualHighlight", "shortCaption", "messageIfMissing"],
          properties: {
            hasQuote: { type: "boolean" },
            quote: { type: "string" },
            sourceSection: { type: "string" },
            context: { type: "string" },
            visualHighlight: { type: "string" },
            shortCaption: { type: "string" },
            messageIfMissing: { type: "string" },
          },
        },
      },
    };
  }

  if (variationType === "podcast_intro") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "structuredContent"],
      properties: {
        title: nonEmptyStringSchema,
        summary: nonEmptyStringSchema,
        structuredContent: {
          type: "object",
          additionalProperties: false,
          required: ["title", "openingHook", "introScript", "callToAction"],
          properties: {
            title: nonEmptyStringSchema,
            openingHook: nonEmptyStringSchema,
            introScript: nonEmptyStringSchema,
            callToAction: nonEmptyStringSchema,
          },
        },
      },
    };
  }

  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "structuredContent"],
    properties: {
      title: nonEmptyStringSchema,
      summary: nonEmptyStringSchema,
      structuredContent: {
        type: "object",
        additionalProperties: false,
        required: ["angle", "hook", "body", "callToAction", "hashtags", "visualIdea"],
        properties: {
          angle: nonEmptyStringSchema,
          hook: nonEmptyStringSchema,
          body: nonEmptyStringSchema,
          callToAction: nonEmptyStringSchema,
          hashtags: {
            type: "array",
            minItems: 1,
            items: nonEmptyStringSchema,
          },
          visualIdea: nonEmptyStringSchema,
        },
      },
    },
  };
};
