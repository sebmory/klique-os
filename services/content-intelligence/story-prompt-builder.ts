import { buildEditorialRulesBlock, editorialRulesVersion } from "@/services/content-intelligence/editorial-rules";
import type { AnyContentGenerationRequest } from "@/types/content-generation";

// Convention Reel: mission + regles de qualite + contexte + charge utile serialisee du brief.
export const buildStoryPrompt = (request: AnyContentGenerationRequest): string => {
  if (request.requestType !== "story") {
    throw new Error("buildStoryPrompt attend une requete de type story.");
  }

  const selectedCount = request.selectedContextItems.length;
  const frameCount = request.brief.frameCount;
  const isMatchDayStory = request.context.manualContext?.startsWith("[STORY JOUR DE MATCH]") ?? false;
  const isAfterMatchStory = request.context.manualContext?.startsWith("[STORY APRES-MATCH]") ?? false;
  const afterMatchStoryCallToAction = request.context.manualContext
    ?.split("\n")
    .find((line) => line.startsWith("Appel a l action:"))
    ?.replace("Appel a l action:", "")
    .trim()
    .toLowerCase();
  const hasAfterMatchStoryCallToAction = Boolean(
    afterMatchStoryCallToAction && !["non renseigne", "non renseigné", "aucun", "aucune"].includes(afterMatchStoryCallToAction),
  );

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

  const matchDayStoryRules = isMatchDayStory
    ? [
        "- Preset Story jour de match: conserver exactement les faits fournis dans les trois propositions.",
        "- Proposition 1: annonce factuelle.",
        "- Proposition 2: montee en tension sportive.",
        "- Proposition 3: mise en avant du sujet selectionne.",
        "- Ne jamais completer une information absente par une suggestion generique.",
        "- Si l appel a l action est absent ou indique comme non renseigne, ne generer aucun CTA, sticker, question, sondage, invitation a repondre ou a partager.",
        `- Chaque proposition doit contenir exactement ${frameCount} frames demandees.`,
        "- Chaque frame doit avoir une information ou fonction differente et eviter les repetitions.",
      ].join("\n")
    : "";

  const afterMatchStoryRules = isAfterMatchStory
    ? [
        "- Preset Story apres-match: conserver exactement les memes score, resultat et faits fournis dans les trois propositions.",
        "- Proposition 1: resume factuel du match.",
        "- Proposition 2: recit emotionnel adapte au resultat reel.",
        "- Proposition 3: mise en avant du sujet selectionne, uniquement avec la performance fournie.",
        "- Ne jamais inventer de statistique, action, classement, performance, reaction ou citation.",
        hasAfterMatchStoryCallToAction
          ? "- Utiliser un appel a l action uniquement s il correspond exactement a celui fourni."
          : "- Sans appel a l action fourni, ne generer aucun CTA, sticker, question, sondage, invitation, interaction ni frame de type appel_a_action ou equivalent; terminer par une frame de type Conclusion.",
        `- Chaque proposition doit contenir exactement ${frameCount} frames demandees.`,
        "- Imposer cette progression chronologique: 1. introduction du match; 2. contexte fourni; 3. resultat et score; 4. lecture emotionnelle strictement coherente avec le resultat; 5. conclusion factuelle.",
        "- Si des moments cles, une performance ou une reaction sont fournis, les utiliser dans les frames intermediaires.",
        "- S ils sont absents, rester sobre et ne jamais repeter presque mot pour mot le score ou la defaite dans plusieurs frames.",
        "- Ne jamais utiliser une frame de type teaser apres avoir deja revele le resultat.",
        "- Chaque frame doit avoir une fonction differente.",
      ].join("\n")
    : "";

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
    matchDayStoryRules,
    afterMatchStoryRules,
    "Contexte intelligent:",
    storyContextRules,
    "Contexte et demande:",
    templatePayload,
  ].join("\n\n");
};
