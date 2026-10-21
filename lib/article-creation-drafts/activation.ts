export const ARTICLE_CREATION_DRAFTS_ENABLED_VALUE = "true";

export const isArticleCreationDraftsEnabled = (
  value: string | undefined = process.env.KLIQUE_ARTICLE_CREATION_DRAFTS_ENABLED,
): boolean => value === ARTICLE_CREATION_DRAFTS_ENABLED_VALUE;
