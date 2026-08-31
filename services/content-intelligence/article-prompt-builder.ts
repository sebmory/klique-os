import { buildEditorialRulesBlock, editorialRulesVersion } from "@/services/content-intelligence/editorial-rules";
import type {
  ArticleAngleSuggestionsRequest,
  ArticleGenerationRequest,
  ArticleLengthId,
  ArticleStructureSuggestion,
} from "@/types/content-generation";

const articleWordCountRangeByLength: Record<ArticleLengthId, { min: number; max: number }> = {
  court: { min: 400, max: 600 },
  moyen: { min: 700, max: 1000 },
  long: { min: 1200, max: 1600 },
};

const formatArticleWordCountRange = (length: ArticleLengthId): string => {
  const range = articleWordCountRangeByLength[length];
  return `${range.min} a ${range.max} mots`;
};

const serializeArticleContext = (request: ArticleGenerationRequest | ArticleAngleSuggestionsRequest) =>
  JSON.stringify(
    {
      requestType: request.requestType,
      template: request.template,
      context: request.context,
      brief: request.brief,
      selectedContextItems: request.selectedContextItems,
    },
    null,
    2,
  );

const articleFactualRules = [
  "- Utiliser uniquement le contexte fourni, les sources externes verifiees et les citations fournies.",
  "- Ne jamais inventer, completer ou deduire un fait, une citation, un auteur ou une source.",
  "- Si une information manque, l omettre au lieu de la remplacer par une formulation generique.",
  "- Distinguer explicitement les faits verifies, l analyse editoriale et les citations fournies.",
  "- Ne pas modifier une citation fournie ni changer son auteur ou sa source.",
  "- Ne citer comme source que les sources externes verifiees reellement utilisees.",
  "- Ne jamais deduire qu un evenement est le premier, le dernier, un retour, une reprise, une premiere apparition ou une premiere titularisation uniquement parce qu aucun evenement anterieur n est present dans le contexte.",
  "- Ces qualifications temporelles ne sont autorisees que si elles sont affirmees explicitement par le contexte manuel, une source verifiee ou une citation fournie.",
  "- L absence de donnees ne constitue jamais une preuve.",
  "- Lorsqu une source confirme seulement une participation ou une entree en jeu a une date donnee, employer uniquement cette formulation factuelle.",
  "- Ne jamais transformer 'entre en jeu' en 'premiere apparition'.",
].join("\n");

export const buildArticleFactualCorrectionInstruction = (errorMessage: string, invalidResponse: unknown): string => [
  "Correction obligatoire: supprimer ou reformuler uniquement les qualifications temporelles non prouvees.",
  "Utiliser uniquement les formulations explicitement presentes dans le contexte et la demande; l absence de donnees ne prouve rien.",
  "Conserver tous les faits valides et le format JSON strict, sans ajouter de fait, source ou citation.",
  `Erreur exacte: ${errorMessage}`,
  "Reponse invalide:",
  JSON.stringify(invalidResponse, null, 2),
].join("\n\n");

export const buildArticleAngleSuggestionsPrompt = (request: ArticleAngleSuggestionsRequest): string => {
  const angleRules = [
    "- Produire exactement 3 angles journalistiques reellement distincts.",
    "- Chaque angle doit etre precis, realisable et adapte au type et a la longueur d article demandes.",
    "- Chaque angle doit contenir un titre et une explication breve de sa promesse editoriale et de son traitement.",
    "- Ne jamais presenter comme certain un fait qui n est pas documente dans le contexte, les sources verifiees ou les citations fournies.",
    "- Varier reellement les approches, sans reformulation cosmetique ni changement des faits disponibles.",
    "- La sortie doit respecter strictement le format PublicationAngleSuggestionsResult, avec exactement 3 suggestions.",
  ].join("\n");

  return [
    "Mission: proposer des angles journalistiques fiables et exploitables pour un article.",
    `Template: ${request.template.key}`,
    `Template version: ${request.template.version}`,
    `Langue obligatoire: ${request.language}`,
    `Rules version: ${editorialRulesVersion}`,
    "Regles editoriales:",
    buildEditorialRulesBlock(),
    "Contraintes factuelles:",
    articleFactualRules,
    "Contraintes d angles:",
    angleRules,
    "Contexte et demande:",
    serializeArticleContext(request),
  ].join("\n\n");
};

export const buildArticleStructurePrompt = (request: ArticleGenerationRequest): string => {
  const wordCountRange = formatArticleWordCountRange(request.brief.length);
  const structureRules = [
    "- Produire exactement 3 propositions de structure reellement distinctes.",
    "- Respecter strictement le sujet, l angle selectionne, le type d article, la longueur, le ton, l audience, la langue et les sujets obligatoires.",
    "- Chaque proposition doit inclure un id, un titre, une promesse editoriale, des sections ordonnees et une estimation du nombre de mots.",
    "- Chaque section doit inclure son ordre, son titre, son objectif et les points a traiter.",
    "- Les trois structures doivent se distinguer par leur promesse editoriale, leur ordre narratif et leur hierarchie des faits, sans changer les faits disponibles.",
    `- L estimation du nombre de mots doit etre comprise entre ${wordCountRange} pour la longueur demandee.`,
    "- La sortie doit respecter strictement le format ArticleStructureSuggestionsResult.",
  ].join("\n");

  return [
    "Mission: proposer des structures d article editoriales, fiables et exploitables.",
    `Template: ${request.template.key}`,
    `Template version: ${request.template.version}`,
    `Langue obligatoire: ${request.language}`,
    `Rules version: ${editorialRulesVersion}`,
    "Regles editoriales:",
    buildEditorialRulesBlock(),
    "Contraintes factuelles:",
    articleFactualRules,
    "Contraintes de structure:",
    structureRules,
    "Contexte et demande:",
    serializeArticleContext(request),
  ].join("\n\n");
};

export const buildArticleFinalPrompt = (
  request: ArticleGenerationRequest,
  selectedStructure: ArticleStructureSuggestion,
): string => {
  const wordCountRange = formatArticleWordCountRange(request.brief.length);
  const finalRules = [
    "- Rediger un seul article complet, pret a etre publie.",
    "- Suivre exactement la structure selectionnee sans ajouter de section factuelle non justifiee.",
    "- Produire uniquement les paragraphs de chaque section, dans le meme ordre et avec exactement le meme nombre de sections que la structure selectionnee.",
    "- Ne pas recopier les titres ni les numeros des sections: ils sont imposes par la structure selectionnee.",
    "- Chaque groupe de paragraphs doit contenir au moins un paragraphe non vide.",
    `- Rediger entre ${wordCountRange} et fournir une estimation du nombre de mots dans cette meme plage.`,
    "- Produire un titre, un sous-titre optionnel, un chapeau, des sections ordonnees avec intertitres et paragraphes, une conclusion, les citations utilisees et les sources utilisees.",
    "- N utiliser une citation que si elle figure parmi les citations fournies, mot pour mot avec le meme auteur et la meme source.",
    "- Le tableau usedCitations ne doit contenir que les citations effectivement utilisees dans le texte.",
    "- Le tableau usedSources ne doit contenir que les sources externes verifiees effectivement utilisees dans le texte.",
    "- La sortie doit respecter strictement le format ArticleFinalResult.",
  ].join("\n");

  return [
    "Mission: rediger un article editorial fiable, structure et directement exploitable.",
    `Template: ${request.template.key}`,
    `Template version: ${request.template.version}`,
    `Langue obligatoire: ${request.language}`,
    `Rules version: ${editorialRulesVersion}`,
    "Regles editoriales:",
    buildEditorialRulesBlock(),
    "Contraintes factuelles:",
    articleFactualRules,
    "Contraintes de redaction:",
    finalRules,
    "Structure selectionnee:",
    JSON.stringify(selectedStructure, null, 2),
    "Contexte et demande:",
    serializeArticleContext(request),
  ].join("\n\n");
};