import type {
  CarouselStructuredContent,
  ContentVariantStructuredContent,
  PodcastIntroStructuredContent,
  PublicationStructuredContent,
  QuoteVisualStructuredContent,
  ReelStructuredContent,
  ShortArticleStructuredContent,
  StoriesStructuredContent,
  TeaserStructuredContent,
} from "@/types/content-variant";

const asBulletLines = (items: string[]): string => {
  return items.filter(Boolean).map((item) => `- ${item}`).join("\n");
};

export const stringifyStructuredVariation = (structuredContent: ContentVariantStructuredContent): string => {
  if ("slides" in structuredContent) {
    const value = structuredContent as CarouselStructuredContent;
    return [
      `Titre: ${value.title}`,
      `Couverture: ${value.cover}`,
      "Slides:",
      asBulletLines(value.slides.map((slide) => `Slide ${slide.index}: ${slide.text}`)),
      `Conclusion: ${value.conclusion}`,
      `CTA: ${value.callToAction}`,
      `Legende: ${value.caption}`,
    ].join("\n\n");
  }

  if ("scenes" in structuredContent) {
    const value = structuredContent as ReelStructuredContent;
    return [
      `Concept: ${value.concept}`,
      `Hook: ${value.hook}`,
      `Duree recommandee: ${value.duration}`,
      `Scenario: ${value.scenario}`,
      "Plans:",
      asBulletLines(value.scenes.map((scene) => `Plan ${scene.index}: ${scene.shot} - ${scene.action}`)),
      "Texte a l ecran:",
      asBulletLines(value.onScreenText),
      `Voix off: ${value.voiceOver ?? "Aucune"}`,
      `CTA: ${value.callToAction}`,
      `Legende: ${value.caption}`,
      `Couverture: ${value.coverIdea}`,
    ].join("\n\n");
  }

  if ("stories" in structuredContent) {
    const value = structuredContent as StoriesStructuredContent;
    return [
      `Sequence: ${value.sequenceTitle}`,
      "Stories:",
      asBulletLines(value.stories.map((story) => `Story ${story.index} [${story.type}] ${story.content}${story.interaction ? ` | Interaction: ${story.interaction}` : ""}`)),
      `CTA: ${value.callToAction}`,
    ].join("\n\n");
  }

  if ("shortVersion" in structuredContent) {
    const value = structuredContent as TeaserStructuredContent;
    return [
      `Version courte: ${value.shortVersion}`,
      `Version moyenne: ${value.mediumVersion}`,
      `Accroche: ${value.hook}`,
      `CTA: ${value.callToAction}`,
      `Canal recommande: ${value.recommendedChannel}`,
    ].join("\n\n");
  }

  if ("chapo" in structuredContent) {
    const value = structuredContent as ShortArticleStructuredContent;
    return [
      `Titre: ${value.title}`,
      `Chapo: ${value.chapo}`,
      `Introduction: ${value.introduction}`,
      "Structure:",
      asBulletLines(value.structure),
      `Corps: ${value.body}`,
      `Conclusion: ${value.conclusion}`,
    ].join("\n\n");
  }

  if ("hasQuote" in structuredContent) {
    const value = structuredContent as QuoteVisualStructuredContent;
    if (!value.hasQuote) {
      return value.messageIfMissing ?? "Aucune citation directe exploitable n a ete trouvee dans ce document.";
    }
    return [
      `Citation: ${value.quote ?? ""}`,
      `Section source: ${value.sourceSection ?? "Inconnue"}`,
      `Contexte: ${value.context ?? ""}`,
      `Mise en valeur: ${value.visualHighlight ?? ""}`,
      `Legende: ${value.shortCaption ?? ""}`,
    ].join("\n\n");
  }

  if ("introScript" in structuredContent) {
    const value = structuredContent as PodcastIntroStructuredContent;
    return [
      `Titre: ${value.title}`,
      `Hook: ${value.openingHook}`,
      `Introduction podcast: ${value.introScript}`,
      `CTA: ${value.callToAction}`,
    ].join("\n\n");
  }

  const value = structuredContent as PublicationStructuredContent;
  return [
    `Angle: ${value.angle}`,
    `Accroche: ${value.hook}`,
    `Texte principal: ${value.body}`,
    `CTA: ${value.callToAction}`,
    "Hashtags:",
    asBulletLines(value.hashtags),
    `Idee visuelle: ${value.visualIdea}`,
  ].join("\n\n");
};
