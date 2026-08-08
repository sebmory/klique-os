import { buildEditorialRulesBlock, editorialRulesVersion } from "@/services/content-intelligence/editorial-rules";
import type { ContentVariationRequest } from "@/types/content-variant";

const quoteGuardrail = [
  "Regle citation visuelle:",
  "- Ne jamais inventer de citation.",
  "- Utiliser uniquement une phrase exacte presente dans le document source.",
  "- Si aucune citation directe exploitable n existe, retourner hasQuote=false avec messageIfMissing.",
].join("\n");

export const variationTemplateVersion = "variation-v1";

export const buildVariationPrompt = (request: ContentVariationRequest, promptVersion: string): string => {
  return [
    "Mission: creer une declinaison editoriale exploitable a partir du document source.",
    `Prompt version: ${promptVersion}`,
    `Template version: ${variationTemplateVersion}`,
    `Rules version: ${editorialRulesVersion}`,
    "Regles editoriales:",
    buildEditorialRulesBlock(),
    "Regles declinaison:",
    "- Ne pas deformer le sens du document source.",
    "- Ne pas ajouter de faits absents.",
    "- Ne pas inventer une performance, un resultat ou une citation.",
    "- Respecter les sujets a eviter.",
    "- Adapter au canal, au public et au ton.",
    "- Eviter une structure generique identique tous canaux.",
    "- Produire un contenu concret et actionnable.",
    "- Limiter les hashtags inutiles et les CTA artificiels.",
    "- Ne pas transformer automatiquement en promotion.",
    quoteGuardrail,
    "Contexte et demande:",
    JSON.stringify(request, null, 2),
  ].join("\n\n");
};
