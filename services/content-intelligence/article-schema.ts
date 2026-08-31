type JsonSchema = Record<string, unknown>;

export type ArticleTemplateMetadataRaw = { templateId: "article"; templateVersion: "v1" };

export type ArticleFinalContentSectionRaw = { paragraphs: string[] };

export type ArticleFinalContentRaw = {
  title: string;
  subtitle: string | null;
  lead: string;
  sections: ArticleFinalContentSectionRaw[];
  conclusion: string;
  usedCitations: Array<{ text: string; author: string; source: string }>;
  usedSources: Array<{ title: string; url: string }>;
  estimatedWordCount: number;
  metadata: ArticleTemplateMetadataRaw;
};

const nonEmptyStringSchema: JsonSchema = {
  type: "string",
  minLength: 1,
};

const sourceSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "url"],
  properties: {
    title: nonEmptyStringSchema,
    url: nonEmptyStringSchema,
  },
};

const citationSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "author", "source"],
  properties: {
    text: nonEmptyStringSchema,
    author: nonEmptyStringSchema,
    source: nonEmptyStringSchema,
  },
};

const finalContentSectionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["paragraphs"],
  properties: {
    paragraphs: {
      type: "array",
      minItems: 1,
      items: nonEmptyStringSchema,
    },
  },
};

export const buildArticleStructureSuggestionsJsonSchema = (): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "editorialPromise", "sections", "estimatedWordCount"],
        properties: {
          id: nonEmptyStringSchema,
          title: nonEmptyStringSchema,
          editorialPromise: nonEmptyStringSchema,
          sections: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["order", "title", "purpose", "points"],
              properties: {
                order: { type: "integer", minimum: 1 },
                title: nonEmptyStringSchema,
                purpose: nonEmptyStringSchema,
                points: { type: "array", minItems: 1, items: nonEmptyStringSchema },
              },
            },
          },
          estimatedWordCount: { type: "integer", minimum: 1 },
        },
      },
    },
  },
});

export const buildArticleFinalJsonSchema = (): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  required: ["title", "subtitle", "lead", "sections", "conclusion", "usedCitations", "usedSources", "estimatedWordCount", "metadata"],
  properties: {
    title: nonEmptyStringSchema,
    subtitle: { type: ["string", "null"] },
    lead: nonEmptyStringSchema,
    sections: { type: "array", minItems: 1, items: finalContentSectionSchema },
    conclusion: nonEmptyStringSchema,
    usedCitations: { type: "array", items: citationSchema },
    usedSources: { type: "array", items: sourceSchema },
    estimatedWordCount: { type: "integer", minimum: 1 },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["templateId", "templateVersion"],
      properties: {
        templateId: { type: "string", enum: ["article"] },
        templateVersion: { type: "string", enum: ["v1"] },
      },
    },
  },
});