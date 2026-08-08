type JsonSchema = Record<string, unknown>;

export type PublicationProposalRaw = {
  hook: string;
  text: string;
  cta: string;
  hashtags: string[];
  visualSuggestion: string;
  editorialNote: string;
};

export type PublicationTemplateMetadataRaw = {
  templateId: "publication";
  templateVersion: "v1";
};

export type PublicationGenerationResultRaw = {
  title: string;
  selectedAngle: string;
  proposals: PublicationProposalRaw[];
  metadata: PublicationTemplateMetadataRaw;
};

const nonEmptyStringSchema: JsonSchema = {
  type: "string",
  minLength: 1,
};

const proposalSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["hook", "text", "cta", "hashtags", "visualSuggestion", "editorialNote"],
  properties: {
    hook: nonEmptyStringSchema,
    text: nonEmptyStringSchema,
    cta: {
      type: "string",
    },
    hashtags: {
      type: "array",
      minItems: 0,
      items: nonEmptyStringSchema,
    },
    visualSuggestion: nonEmptyStringSchema,
    editorialNote: nonEmptyStringSchema,
  },
};

export const buildPublicationGenerationJsonSchema = (): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  required: ["title", "selectedAngle", "proposals", "metadata"],
  properties: {
    title: nonEmptyStringSchema,
    selectedAngle: nonEmptyStringSchema,
    proposals: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: proposalSchema,
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["templateId", "templateVersion"],
      properties: {
        templateId: { type: "string", enum: ["publication"] },
        templateVersion: { type: "string", enum: ["v1"] },
      },
    },
  },
});

export const buildPublicationAnglesJsonSchema = (): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "rationale"],
        properties: {
          title: nonEmptyStringSchema,
          rationale: nonEmptyStringSchema,
        },
      },
    },
  },
});

export const buildPublicationSingleProposalJsonSchema = (): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  required: ["proposal"],
  properties: {
    proposal: proposalSchema,
  },
});
