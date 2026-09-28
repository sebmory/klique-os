import { describe, expect, it } from "vitest";
import {
  afterMatchStoryFramePurposes,
  mapAfterMatchStoriesToStudioPayload,
  StoryStudioMappingError,
} from "@/lib/story-studio/after-match-mapper";
import {
  getStoryStudioTemplate,
  STORY_STUDIO_CANVAS,
  storyStudioTemplates,
} from "@/lib/story-studio/templates";
import type { ContentVariant, StoriesStructuredContent } from "@/types/content-variant";

const makeVariant = (structuredContent: StoriesStructuredContent): ContentVariant => ({
  id: "variant-stories-1",
  sourceDocumentId: "document-1",
  sourceDocumentType: "publication",
  sourceDocumentVersionId: "version-1",
  sourceDocumentUpdatedAt: "2026-09-28T10:00:00.000Z",
  type: "stories",
  format: "stories",
  platform: "instagram",
  objective: "engagement",
  tone: "dynamic",
  audience: "supporters",
  title: "Titre qui ne doit pas servir de fallback",
  content: "Contenu qui ne doit pas servir de fallback",
  structuredContent,
  status: "draft",
  origin: { type: "after_match_pack", packId: "pack-1", deliverable: "stories" },
  generationMetadata: {
    provider: "openai",
    model: "gpt",
    generatedAt: "2026-09-28T10:00:00.000Z",
    generationDurationMs: 10,
    promptVersion: "1",
    variationTemplateVersion: "variation-v1",
    sourceDocumentVersionId: "version-1",
    sourceDocumentUpdatedAt: "2026-09-28T10:00:00.000Z",
    usedContextItemIds: [],
  },
  createdAt: "2026-09-28T10:00:00.000Z",
  updatedAt: "2026-09-28T10:00:00.000Z",
});

describe("After-match Stories to Story Studio mapping", () => {
  it("maps the four indexed Pack Stories to the fixed Studio purposes", () => {
    const variant = makeVariant({
      sequenceTitle: "Le match",
      stories: [
        { index: 4, type: "question", content: "Votre moment du match ?", interaction: "Repondez ici" },
        { index: 2, type: "contexte", content: "But decisif a la 88e", interaction: "" },
        { index: 1, type: "introduction", content: "Victoire 2-1", interaction: "" },
        { index: 3, type: "sondage", content: "Joueur du match ?", interaction: "Option A / Option B" },
      ],
      callToAction: "Reagissez",
    });

    const payload = mapAfterMatchStoriesToStudioPayload(variant, "match_energy");

    expect(payload.templateKey).toBe("match_energy");
    expect(payload.frames.map((frame) => frame.role)).toEqual(["result", "context", "poll", "question"]);
    expect(payload.frames.map((frame) => afterMatchStoryFramePurposes[frame.role])).toEqual([
      "resultat",
      "fait_marquant",
      "sondage",
      "question",
    ]);
    expect(payload.frames.map((frame) => frame.sourceStoryIndex)).toEqual([1, 2, 3, 4]);
    expect(payload.frames.map((frame) => frame.text.headline)).toEqual([
      "Victoire 2-1",
      "But decisif a la 88e",
      "Joueur du match ?",
      "Votre moment du match ?",
    ]);
    expect(payload.frames[2].text.interaction).toBe("Option A / Option B");
    expect(payload.frames[3].text.interaction).toBe("Repondez ici");
  });

  it("uses default eyebrows while leaving missing content empty without CTA fallbacks", () => {
    const payload = mapAfterMatchStoriesToStudioPayload(makeVariant({
      sequenceTitle: "",
      stories: [{ index: 1, type: "introduction", content: "Score final", interaction: "" }],
      callToAction: "CTA qui ne doit pas etre injecte",
    }));

    expect(payload.frames[0].text).toEqual({ eyebrow: "Résultat", headline: "Score final", body: "", interaction: "" });
    expect(payload.frames.slice(1).every((frame) => (
      frame.sourceStoryIndex === null
      && frame.text.headline === ""
      && frame.text.body === ""
      && frame.text.interaction === ""
    ))).toBe(true);
    expect(payload.frames.map((frame) => frame.text.eyebrow)).toEqual([
      "Résultat",
      "Fait marquant",
      "Votre avis",
      "Posez votre question",
    ]);
    expect(JSON.stringify(payload)).not.toContain("fallback");
    expect(JSON.stringify(payload)).not.toContain("CTA qui ne doit pas etre injecte");
  });

  it("splits real long Stories while preserving every source field for editing", () => {
    const stories: StoriesStructuredContent["stories"] = [
      {
        index: 1,
        type: "introduction",
        content: "Victoire 2-1 pour Vevey Sport, le 27 septembre 2026 en 1re ligue. Abdou Böbödi CAMARA est au centre de cet après-match.",
        interaction: "Aucune — ouverture visuelle avec le résultat, la compétition et la date.",
      },
      {
        index: 2,
        type: "contexte",
        content: "Attaquant de Vevey Sport, Abdou Böbödi CAMARA est passé par le FC Nantes. Il y a disputé la Youth League et remporté deux titres de champion de France U19, en 2021-2022 et 2022-2023.",
        interaction: "Aucune — portrait vertical accompagné d’une chronologie sobre.",
      },
      {
        index: 3,
        type: "sondage",
        content: "Après une victoire, quel aspect souhaitez-vous découvrir en priorité?",
        interaction: "Sondage : « L’analyse du match » / « Le ressenti du joueur »",
      },
      {
        index: 4,
        type: "question",
        content: "Quelle question aimeriez-vous poser à Abdou Böbödi CAMARA après ce succès?",
        interaction: "Sticker Questions pour recueillir les propositions de la communauté.",
      },
    ];
    const payload = mapAfterMatchStoriesToStudioPayload(makeVariant({
      sequenceTitle: "Après-match avec Abdou Böbödi CAMARA",
      stories,
      callToAction: "Partagez votre question dans la dernière story.",
    }));

    expect(payload.frames[0].text).toMatchObject({
      headline: "Victoire 2-1 pour Vevey Sport, le 27 septembre 2026 en 1re ligue.",
      body: "Abdou Böbödi CAMARA est au centre de cet après-match.",
      interaction: stories[0].interaction,
    });
    expect(payload.frames[1].text).toMatchObject({
      headline: "Attaquant de Vevey Sport, Abdou Böbödi CAMARA est passé par le FC Nantes.",
      body: "Il y a disputé la Youth League et remporté deux titres de champion de France U19, en 2021-2022 et 2022-2023.",
      interaction: stories[1].interaction,
    });
    payload.frames.forEach((mappedFrame, index) => {
      expect([mappedFrame.text.headline, mappedFrame.text.body].filter(Boolean).join(" ")).toBe(stories[index].content);
      expect(mappedFrame.text.interaction).toBe(stories[index].interaction);
    });
  });

  it("rejects a Stories variant that is not from an After-match Pack", () => {
    const variant = makeVariant({ sequenceTitle: "", stories: [], callToAction: "" });
    variant.origin = undefined;
    expect(() => mapAfterMatchStoriesToStudioPayload(variant)).toThrowError(StoryStudioMappingError);
  });
});

describe("Story Studio template definitions", () => {
  it("defines three distinct versioned 1080x1920 compositions", () => {
    expect(Object.keys(storyStudioTemplates)).toEqual([
      "editorial_klique",
      "match_energy",
      "minimal_premium",
    ]);

    const templates = Object.values(storyStudioTemplates);
    expect(templates.every((template) => template.version === 1)).toBe(true);
    expect(templates.every((template) => template.canvas === STORY_STUDIO_CANVAS)).toBe(true);
    expect(templates.every((template) => template.canvas.width === 1080 && template.canvas.height === 1920)).toBe(true);
    expect(new Set(templates.map((template) => JSON.stringify(template.composition))).size).toBe(3);
    const editorialTemplate = getStoryStudioTemplate("editorial_klique");
    expect(editorialTemplate.label).toBe("Éditorial KLIQUE");
    expect(editorialTemplate.composition).toMatchObject({
      backgroundColor: "#000000",
      foregroundColor: "#FFFFFF",
      accentColor: "#F2B800",
      photo: { width: 1080, height: 1800 },
    });
    const matchEnergyTemplate = getStoryStudioTemplate("match_energy");
    expect(matchEnergyTemplate.label).toBe("Énergie Match");
    const yellowShapeBottomAtTextX = 420 - (420 / 330) * matchEnergyTemplate.composition.text.x;
    expect(matchEnergyTemplate.composition.text.y).toBeGreaterThan(
      yellowShapeBottomAtTextX + matchEnergyTemplate.composition.eyebrowSize,
    );
    expect(getStoryStudioTemplate("minimal_premium").label).toBe("Minimal Premium");
  });
});