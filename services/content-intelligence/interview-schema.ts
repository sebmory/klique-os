type JsonSchema = Record<string, unknown>;

export type InterviewQuestionRaw = {
  text: string;
  purpose: string;
  topic: string;
  optional: false;
  followUps: string[];
};

export type InterviewIdeaRaw = {
  title: string;
  concept: string;
  suggestedHook: string;
};

export type InterviewTemplateMetadataRaw = {
  templateId: "interview";
  templateVersion: "v1";
};

export type InterviewGenerationResultRaw = {
  title: string;
  editorialAngle: string;
  introduction: string;
  questions: InterviewQuestionRaw[];
  conclusion: string;
  reelIdeas: InterviewIdeaRaw[];
  storyIdeas: InterviewIdeaRaw[];
  publicationIdeas: InterviewIdeaRaw[];
  metadata: InterviewTemplateMetadataRaw;
};

const nonEmptyStringSchema: JsonSchema = {
  type: "string",
  minLength: 1,
};

const interviewIdeaSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "concept", "suggestedHook"],
  properties: {
    title: nonEmptyStringSchema,
    concept: nonEmptyStringSchema,
    suggestedHook: nonEmptyStringSchema,
  },
};

const interviewQuestionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "purpose", "topic", "optional", "followUps"],
  properties: {
    text: nonEmptyStringSchema,
    purpose: nonEmptyStringSchema,
    topic: nonEmptyStringSchema,
    optional: { type: "boolean", enum: [false] },
    followUps: {
      type: "array",
      minItems: 1,
      items: nonEmptyStringSchema,
    },
  },
};

export const buildInterviewGenerationJsonSchema = (questionCount: number): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "editorialAngle",
    "introduction",
    "questions",
    "conclusion",
    "reelIdeas",
    "storyIdeas",
    "publicationIdeas",
    "metadata",
  ],
  properties: {
    title: nonEmptyStringSchema,
    editorialAngle: nonEmptyStringSchema,
    introduction: nonEmptyStringSchema,
    questions: {
      type: "array",
      minItems: questionCount,
      maxItems: questionCount,
      items: interviewQuestionSchema,
    },
    conclusion: nonEmptyStringSchema,
    reelIdeas: {
      type: "array",
      minItems: 1,
      items: interviewIdeaSchema,
    },
    storyIdeas: {
      type: "array",
      minItems: 1,
      items: interviewIdeaSchema,
    },
    publicationIdeas: {
      type: "array",
      minItems: 1,
      items: interviewIdeaSchema,
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["templateId", "templateVersion"],
      properties: {
        templateId: { type: "string", enum: ["interview"] },
        templateVersion: { type: "string", enum: ["v1"] },
      },
    },
  },
});
