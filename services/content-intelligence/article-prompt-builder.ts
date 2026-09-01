import { buildEditorialRulesBlock, editorialRulesVersion } from "@/services/content-intelligence/editorial-rules";
import type {
  ArticleAngleSuggestionsRequest,
  ArticleGenerationRequest,
  ArticleLengthId,
  ArticleStructureSuggestion,
} from "@/types/content-generation";

const articleWordCountRangeByLength: Record<ArticleLengthId, { min: number; max: number }> = {
  breve: { min: 50, max: 120 },
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
  "- Les formulations de nouveau, a nouveau, retrouve, reintegre, renoue avec, reapparait, revient dans, retrouve la competition ou retrouve les terrains sont interdites lorsqu elles suggerent une presence, une participation, un statut ou une activite repetee qui n est pas explicitement prouvee.",
  "- Ces formulations restent autorisees lorsqu elles n ont aucune signification temporelle ou statutaire dans la phrase.",
  "- L absence de donnees ne constitue jamais une preuve.",
  "- Lorsqu une source confirme seulement une participation ou une entree en jeu a une date donnee, employer uniquement cette formulation factuelle.",
  "- Ne jamais transformer 'entre en jeu' en 'premiere apparition'.",
].join("\n");

const articleJournalisticCharter = [
  "- Produire un contenu destine a etre publie, jamais un rapport sur les donnees recues.",
  "- Ouvrir sur l information principale et hierarchiser les faits par interet journalistique.",
  "- Chaque paragraphe doit apporter un fait, un contexte, une citation ou une analyse nouvelle.",
  "- Ne pas repeter la meme information entre le titre, le sous-titre, le chapeau, les sections et la fin de l article.",
  "- Employer une ecriture active, concrete et naturelle.",
  "- Integrer les attributions de sources naturellement et seulement lorsqu elles sont utiles.",
  "- Ne pas developper les informations absentes ni les limites documentaires, sauf si cette absence est explicitement fournie et constitue un enjeu du sujet.",
  "- Les intertitres doivent introduire une nouvelle dimension editoriale, jamais seulement decrire la fonction de la section.",
  "- Terminer sur un fait fort, une consequence, un enjeu ou une perspective documentee, jamais sur un resume scolaire.",
  "- Pour les sujets sportifs, privilegier les protagonistes, le resultat, le moment, la competition, l enjeu et les consequences sportives lorsqu ils sont documentes.",
  "- Pour les sujets sportifs, privilegier des titres courts et naturels.",
  "- Pour les sujets sportifs, utiliser 'face a' ou 'contre' pour introduire l adversaire et eviter la construction lourde 'avec [club] contre [adversaire]'.",
  "- Pour les sujets sportifs, ne pas repeter le club dans le titre lorsque l affiliation peut etre facilement precisee dans le chapeau.",
  "- Pour les sujets sportifs, ne jamais inventer une ambiance, une reaction, un enjeu ou une consequence.",
].join("\n");

export const buildArticleFactualCorrectionInstruction = (errorMessage: string, invalidResponse: unknown): string => [
  "Correction obligatoire: supprimer ou reformuler uniquement les qualifications temporelles non prouvees.",
  "Utiliser uniquement les formulations explicitement presentes dans le contexte et la demande; l absence de donnees ne prouve rien.",
  "Conserver tous les faits valides et le format JSON strict, sans ajouter de fait, source ou citation.",
  `Erreur exacte: ${errorMessage}`,
  "Reponse invalide:",
  JSON.stringify(invalidResponse, null, 2),
].join("\n\n");

export const buildArticleFinalCorrectionInstruction = (args: {
  errorMessage: string;
  invalidResponse: unknown;
  actualWordCount?: number;
  minimumWordCount?: number;
  maximumWordCount?: number;
  actualVisibleParagraphCount?: number;
  minimumVisibleParagraphCount?: number;
  maximumVisibleParagraphCount?: number;
  repeatedSentenceLocations?: [string, string];
}): string => [
  "Correction obligatoire: corriger la reponse finale invalide en une seule nouvelle version complete.",
  args.actualWordCount !== undefined && args.minimumWordCount !== undefined && args.maximumWordCount !== undefined
    ? `Longueur reelle: ${args.actualWordCount} mots. Plage attendue: ${args.minimumWordCount}-${args.maximumWordCount} mots.`
    : "Respecter exactement le nombre de sections et fournir au moins un paragraphe non vide par section.",
  args.actualVisibleParagraphCount !== undefined && args.minimumVisibleParagraphCount !== undefined && args.maximumVisibleParagraphCount !== undefined
    ? `Paragraphes visibles reels, chapeau et conclusion eventuelle compris: ${args.actualVisibleParagraphCount}. Total attendu: ${args.minimumVisibleParagraphCount}-${args.maximumVisibleParagraphCount}.`
    : "Conserver un nombre de paragraphes visibles adapte a la longueur demandee.",
  args.repeatedSentenceLocations
    ? `Supprimer la repetition entre ${args.repeatedSentenceLocations[0]} et ${args.repeatedSentenceLocations[1]}; conserver le fait une seule fois sans le reformuler ailleurs.`
    : "Ne repeter ni reformuler un fait deja exprime.",
  "Ajuster la longueur sans inventer de faits, sans repetition et sans langage meta.",
  "Conserver le meme schema JSON strict et tous les faits, citations et sources valides.",
  `Erreur exacte: ${args.errorMessage}`,
  "Reponse invalide:",
  JSON.stringify(args.invalidResponse, null, 2),
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
    "Charte journalistique Article:",
    articleJournalisticCharter,
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
  const sectionCountRule = request.brief.length === "breve"
    ? "- Pour une breve, chaque structure doit contenir 1 ou 2 sections maximum."
    : "- Chaque structure doit contenir au moins 3 sections.";
  const structureRules = [
    "- Produire exactement 3 propositions de structure reellement distinctes.",
    "- Respecter strictement le sujet, l angle selectionne, le type d article, la longueur, le ton, l audience, la langue et les sujets obligatoires.",
    "- Chaque proposition doit inclure un id, un titre, une promesse editoriale, des sections ordonnees et une estimation du nombre de mots.",
    "- Chaque section doit inclure son ordre, son titre, son objectif et les points a traiter.",
    sectionCountRule,
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
    "Charte journalistique Article:",
    articleJournalisticCharter,
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
  const briefRules = request.brief.length === "breve"
    ? [
        "- Pour une breve, subtitle doit etre strictement null.",
        "- Pour une breve, rediger un texte journalistique continu et dense avec 2 a 3 paragraphes visibles au total, en comptant le chapeau, tous les paragraphes des sections et la conclusion eventuelle.",
        "- Pour une breve, viser en priorite 70 a 100 mots.",
        "- Pour une breve, les titres de sections sont uniquement structurels et ne doivent jamais etre annonces, commentes ni repris dans les paragraphes comme des intertitres editoriaux visibles.",
        "- Pour une breve, raconter directement les faits et leur chronologie, sans commenter les limites du systeme, des sources ou des donnees.",
        "- Pour une breve, ne mentionner une information inconnue que si cette absence est elle-meme explicitement fournie comme un fait pertinent.",
        "- Pour une breve, eviter les phrases expliquant ce qu un fait ou une source ne permet pas d etablir ou de determiner.",
        "- Pour une breve, la conclusion doit etre une derniere phrase tres courte et utile, jamais un resume.",
        "- Pour une breve, un fait doit normalement apparaitre une seule fois dans l ensemble du texte.",
        "- Pour une breve, ne jamais reformuler une phrase uniquement pour atteindre le minimum de mots.",
        "- Pour une breve, ne pas repeter une date, un score, une source ou une meme action dans plusieurs paragraphes sans apport nouveau.",
        "- Pour une breve, attribuer normalement une source une seule fois.",
        "- Pour une breve, chaque paragraphe doit ajouter une information differente.",
        "- Pour une breve sportive, employer un francais naturel et proscrire les formulations 'debute parmi les remplacants', 'presence initiale sur le banc' et 'equipe de football'.",
        "- Pour une breve sportive, preferer 'figurait parmi les remplacants', 'a debute sur le banc' ou 'est entre en jeu', uniquement selon les preuves disponibles.",
        "- Pour une breve, une version dense de 50 a 69 mots est preferable a un allongement artificiel; proscrire tout remplissage.",
      ]
    : [];
  const finalRules = [
    "- Rediger un seul article complet, pret a etre publie.",
    "- Suivre exactement la structure selectionnee sans ajouter de section factuelle non justifiee.",
    "- Produire uniquement les paragraphs de chaque section, dans le meme ordre et avec exactement le meme nombre de sections que la structure selectionnee.",
    "- Ne pas recopier les titres ni les numeros des sections: ils sont imposes par la structure selectionnee.",
    "- Chaque groupe de paragraphs doit contenir au moins un paragraphe non vide.",
    "- Donner la priorite absolue a la densite editoriale, jamais au respect artificiel d un minimum de mots.",
    `- Le contenu redige doit respecter ${wordCountRange}, sans remplissage, repetition ni commentaire sur les informations manquantes.`,
    "- Le nombre de mots est calcule uniquement sur le chapeau, tous les paragraphes des sections et la conclusion; le titre, le sous-titre et les intertitres sont exclus.",
    "- Renseigner estimatedWordCount avec ce meme nombre de mots, meme si le serveur le recalculera comme autorite finale.",
    ...briefRules,
    "- Chaque fait principal ne doit etre developpe qu une fois, sauf rappel bref indispensable a la comprehension.",
    "- Le titre, le chapeau, chaque section et la conclusion doivent remplir des fonctions editoriales differentes.",
    "- La conclusion doit apporter une fermeture ou une perspective utile, sans resumer a nouveau tout l article.",
    "- Ne jamais ecrire comme si le lecteur voyait un dossier, un prompt, un contexte technique ou des donnees internes.",
    "- Interdire toute formulation meta, notamment: le contexte fourni; les informations fournies; le dossier disponible; le fait verifie; le cadre factuel; le repere a retenir; cette formulation repose sur; les elements disponibles; il convient de; pour suivre la situation avec rigueur.",
    "- Produire un titre, un sous-titre optionnel, un chapeau, des sections ordonnees avec intertitres et paragraphes, une conclusion, les citations utilisees et les sources utilisees. Pour une breve uniquement, la conclusion peut etre une chaine vide si aucune ouverture utile n est justifiee.",
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
    "Charte journalistique Article:",
    articleJournalisticCharter,
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