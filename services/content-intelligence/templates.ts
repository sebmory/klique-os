import type { AnyContentGenerationRequest, ContentTemplateDefinition } from "@/types/content-generation";

export const interviewTemplateV1: ContentTemplateDefinition = {
  key: "interview:v1",
  family: "interview",
  name: "Interview",
  version: "v1",
  description: "Generation d une fiche interview editoriale structuree.",
  buildPrompt: (request: AnyContentGenerationRequest) => {
    return JSON.stringify({
      requestType: request.requestType,
      template: request.template,
      context: request.context,
      brief: request.brief,
      selectedContextItems: request.selectedContextItems,
    }, null, 2);
  },
};

export const publicationTemplateV1: ContentTemplateDefinition = {
  key: "publication:v1",
  family: "publication",
  name: "Publication",
  version: "v1",
  description: "Generation de publications editoriales multi-plateformes.",
  buildPrompt: (request: AnyContentGenerationRequest) => {
    return JSON.stringify({
      requestType: request.requestType,
      template: request.template,
      context: request.context,
      brief: request.brief,
      selectedContextItems: request.selectedContextItems,
    }, null, 2);
  },
};

export const storyTemplateV1: ContentTemplateDefinition = {
  key: "story:v1",
  family: "story",
  name: "Story",
  version: "v1",
  description: "Template reserve pour les stories.",
  buildPrompt: () => {
    throw new Error("Template story:v1 non implemente");
  },
};

export const reelTemplateV1: ContentTemplateDefinition = {
  key: "reel:v1",
  family: "reel",
  name: "Reel",
  version: "v1",
  description: "Template reserve pour les reels.",
  buildPrompt: (request: AnyContentGenerationRequest) => {
    return JSON.stringify({
      requestType: request.requestType,
      template: request.template,
      context: request.context,
      brief: request.brief,
      selectedContextItems: request.selectedContextItems,
    }, null, 2);
  },
};

export const podcastTemplateV1: ContentTemplateDefinition = {
  key: "podcast:v1",
  family: "podcast",
  name: "Podcast",
  version: "v1",
  description: "Template reserve pour les podcasts.",
  buildPrompt: () => {
    throw new Error("Template podcast:v1 non implemente");
  },
};

export const articleTemplateV1: ContentTemplateDefinition = {
  key: "article:v1",
  family: "article",
  name: "Article",
  version: "v1",
  description: "Template reserve pour les articles.",
  buildPrompt: () => {
    throw new Error("Template article:v1 non implemente");
  },
};

export const contentTemplates = [
  interviewTemplateV1,
  publicationTemplateV1,
  storyTemplateV1,
  reelTemplateV1,
  podcastTemplateV1,
  articleTemplateV1,
] as const;

export const activeTemplateByFamily = {
  interview: interviewTemplateV1.key,
  publication: publicationTemplateV1.key,
  story: storyTemplateV1.key,
  reel: reelTemplateV1.key,
  podcast: podcastTemplateV1.key,
  article: articleTemplateV1.key,
} as const;

export const resolveTemplate = (key: string) => {
  return contentTemplates.find((template) => template.key === key) ?? null;
};
