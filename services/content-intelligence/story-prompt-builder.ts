import { buildEditorialRulesBlock, editorialRulesVersion } from "@/services/content-intelligence/editorial-rules";
import type { AnyContentGenerationRequest } from "@/types/content-generation";

// Convention Reel: mission + regles de qualite + contexte + charge utile serialisee du brief.
export const buildStoryPrompt = (request: AnyContentGenerationRequest): string => {
  if (request.requestType !== "story") {
    throw new Error("buildStoryPrompt attend une requete de type story.");
  }

  const selectedCount = request.selectedContextItems.length;
  const frameCount = request.brief.frameCount;

  const storyRules = [
    `- Produire exactement 3 sequences Story distinctes, traitant le meme angle editorial selectionne.`,
    `- Chaque sequence doit contenir exactement ${frameCount} frames ordonnees (order strictement sequentiel de 1 a ${frameCount}).`,
    "- Chaque frame doit avoir un type coherent (introduction, contexte, citation, sondage, quiz, question, teaser, appel_a_action) et un contenu concret pret a l usage.",
    "- Ne jamais inventer de faits, resultats, citations, chiffres, dates, blessures, transferts ou annonces.",
    "- Utiliser uniquement les informations transmises dans le contexte.",
    "- Les 3 sequences doivent proposer 3 traitements reellement differents du meme angle, sans reformulation les unes des autres.",
    "- Chaque sequence doit contenir: hook, frames, cta (facultatif), caption, hashtags.",
    "- Adapter l ecriture a la plateforme cible (Instagram, Facebook ou TikTok).",
    "- Legende concise, publiable telle quelle, sans meta-commentaire editorial.",
    "- Hashtags sobres, pertinents et strictement lies aux faits/contextes fournis.",
    "- La forme de sortie est imposee par un schema JSON strict externe.",
  ].join("\n");

  const storyContextRules = [
    `- Nombre d elements de contexte selectionnes: ${selectedCount}.`,
    "- Utiliser uniquement les faits selectionnes transmis dans le contexte.",
    "- Ne jamais transformer une piste editoriale en fait verifie.",
    "- Si le contexte est insuffisant, rester sobre et factuel.",
    "- Ne pas inclure d URL sauf demande explicite.",
  ].join("\n");

  const templatePayload = JSON.stringify(
    {
      requestType: request.requestType,
      template: request.template,
      context: request.context,
      brief: request.brief,
      selectedContextItems: request.selectedContextItems,
    },
    null,
    2
  );

  return [
    "Mission: generer des sequences Story editoriales, concretes et exploitables en production.",
    `Template: ${request.template.key}`,
    `Template version: ${request.template.version}`,
    `Langue obligatoire: ${request.language}`,
    `Rules version: ${editorialRulesVersion}`,
    "Regles editoriales:",
    buildEditorialRulesBlock(),
    "Contraintes Story:",
    storyRules,
    "Contexte intelligent:",
    storyContextRules,
    "Contexte et demande:",
    templatePayload,
  ].join("\n\n");
};
