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

const serializeArticleContext = (request: ArticleGenerationRequest | ArticleAngleSuggestionsRequest) => {
  const brief = request.editorialGeneration?.generationMode === "limited"
    && "selectedAngle" in request.brief
    && request.editorialGeneration.identityBasis !== "declared_interview"
    ? {
        ...request.brief,
        selectedAngle: "Presentation factuelle limitee aux seuls elements documentes.",
      }
    : request.brief;

  return JSON.stringify(
    {
      requestType: request.requestType,
      template: request.template,
      context: request.editorialContext ?? request.context,
      brief,
    },
    null,
    2,
  );
};

const articleFactualRules = [
  "- Utiliser uniquement le contexte fourni, les sources externes verifiees et les citations fournies.",
  "- Aucun fait, score, date, club, resultat, citation ou palmares ne peut etre invente.",
  "- Ne jamais resoudre automatiquement une contradiction.",
  "- Une piste ou une donnee manuelle non verifiee doit rester explicitement hypothetique.",
  "- Une information manquante doit etre omise ou transformee en question, jamais completee.",
  "- Ne jamais presenter un element historique comme une actualite recente.",
  "- Rester strictement dans le perimetre du dossier editorial fourni.",
  "- Ne jamais inventer, completer ou deduire un fait, une citation, un auteur ou une source.",
  "- Si une information manque, l omettre au lieu de la remplacer par une formulation generique.",
  "- Distinguer explicitement les faits verifies, l analyse editoriale et les citations fournies.",
  "- Une déclaration fournie par l utilisateur peut être rapportée uniquement avec une attribution claire à son locuteur; elle ne devient jamais un fait corroboré.",
  "- Pour un article fondé sur un entretien déclaré, ne déduire aucune biographie, scène, performance, motivation ou caractéristique personnelle au-delà des propos attribués.",
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
  const isLimited = request.editorialGeneration?.generationMode === "limited";
  const isDeclaredInterviewPortrait = request.brief.articleType === "portrait"
    && request.editorialGeneration?.identityBasis === "declared_interview";
  const angleRules = [
    "- Produire entre 1 et 3 angles journalistiques reellement distincts selon la richesse de la matiere.",
    "- Ne jamais forcer un nombre de propositions ni completer artificiellement la liste.",
    "- Chaque angle doit etre precis, realisable et adapte au type et a la longueur d article demandes.",
    "- Chaque angle doit contenir un titre et une explication breve de sa promesse editoriale et de son traitement.",
    "- Ancrer chaque angle dans un ou plusieurs elements precis du dossier et les nommer dans son explication.",
    "- Ne proposer aucun angle sur les choix de carriere, les motivations, le caractere, la vie personnelle, le style de jeu ou le role tactique sans faits explicites correspondants.",
    "- Ne jamais transformer une information de profil isolee en hypothese narrative, tactique ou psychologique.",
    "- Les informations absentes constituent des pistes d interview, pas des angles affirmatifs ni des questions rhetoriques destinees a l article.",
    "- Ne jamais presenter comme certain un fait qui n est pas documente dans le contexte, les sources verifiees ou les citations fournies.",
    "- Varier reellement les approches, sans reformulation cosmetique ni changement des faits disponibles.",
    ...(isLimited
      ? ["- Mode limited: proposer uniquement des cadrages sobres de presentation factuelle; ne pas promettre un portrait approfondi."]
      : []),
    ...(isDeclaredInterviewPortrait
      ? [
          "- Portrait fonde sur un entretien declare: chaque promesse doit etre directement soutenue par les extraits selectionnes.",
          "- Les choix et objectifs explicitement declares peuvent etre traites avec attribution; ils ne permettent jamais d inferer un trait de personnalite.",
        ]
      : []),
    "- La sortie doit respecter strictement le format PublicationAngleSuggestionsResult, avec entre 1 et 3 suggestions.",
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
  const isLimited = request.editorialGeneration?.generationMode === "limited";
  const sectionCountRule = isLimited
    ? "- Mode limited: utiliser une seule section; une seconde est permise uniquement si elle repose sur un autre ensemble de faits precis."
    : request.brief.length === "breve"
    ? "- Pour une breve, chaque structure doit contenir 1 ou 2 sections maximum."
    : "- Chaque structure doit contenir au moins 3 sections.";
  const structureRules = [
    "- Produire exactement 3 propositions de structure reellement distinctes.",
    "- Respecter le sujet, le type d article, la longueur, le ton, l audience, la langue et les sujets obligatoires.",
    "- L angle selectionne est une preference editoriale, jamais une preuve: n en conserver que la partie soutenue par les faits, citations ou sources du dossier.",
    "- Traiter la promesse soutenue de l angle selectionne comme le fil directeur de chaque proposition.",
    "- Le titre de la structure et sa premiere section doivent developper cette promesse a partir des faits ou citations qui la fondent, sans se contenter d en reprendre les mots.",
    "- Les informations secondaires peuvent contextualiser le sujet apres cette ouverture, mais ne doivent jamais remplacer, diluer ou elargir l angle selectionne.",
    "- Si un ancien angle mentionne un theme non documente, ne pas le reprendre dans le titre, la promesse, les sections ou les points; recentrer la structure sur la matiere verifiable.",
    "- Chaque proposition doit inclure un id, un titre, une promesse editoriale, des sections ordonnees et une estimation du nombre de mots.",
    "- Chaque section doit inclure son ordre, son titre, son objectif et les points a traiter.",
    "- Chaque section et chaque point doivent etre redigeables uniquement avec des faits, citations ou sources explicitement presents dans le dossier.",
    "- Supprimer toute section qui exigerait une hypothese, une generalite sur le poste ou le sport, une motivation supposee, une scene inventee ou une question sans reponse.",
    "- Eviter les intertitres administratifs ou descriptifs tels que 'Profil sportif et affiliation club' ou 'Donnees precises sur la participation en match officiel'.",
    "- Formuler des intertitres concrets a partir d un fait, d une action ou d une citation documentee; eviter les notions abstraites et toute progression, amelioration ou consequence qui n est pas etablie.",
    sectionCountRule,
    "- Les trois structures doivent se distinguer par leur promesse editoriale, leur ordre narratif et leur hierarchie des faits, sans changer les faits disponibles.",
    isLimited
      ? `- Mode limited: ${wordCountRange} est un objectif maximal indicatif; estimer une longueur plus courte lorsque la matiere ne permet pas de l atteindre sans remplissage.`
      : `- L estimation du nombre de mots doit etre comprise entre ${wordCountRange} pour la longueur demandee.`,
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
  const isLimited = request.editorialGeneration?.generationMode === "limited";
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
    "- Faire du titre, du chapeau et de la premiere section la continuite editoriale de l angle selectionne et de sa promesse soutenue.",
    "- Ouvrir sur le fait ou la citation qui fonde cet angle, puis developper son enchainement documentaire avant les informations secondaires.",
    "- Les informations secondaires servent uniquement a contextualiser l angle; elles ne doivent pas devenir le sujet principal.",
    "- Produire uniquement les paragraphs de chaque section, dans le meme ordre et avec exactement le meme nombre de sections que la structure selectionnee.",
    "- Ne pas recopier les titres ni les numeros des sections: ils sont imposes par la structure selectionnee.",
    "- Chaque groupe de paragraphs doit contenir au moins un paragraphe non vide.",
    "- Donner la priorite absolue a la densite editoriale, jamais au respect artificiel d un minimum de mots.",
    isLimited
      ? `- Mode limited: ${wordCountRange} est un objectif maximal, jamais un minimum; produire une presentation factuelle courte si la matiere est rare.`
      : `- Le contenu redige doit respecter ${wordCountRange}, sans remplissage, repetition ni commentaire sur les informations manquantes.`,
    "- Le nombre de mots est calcule uniquement sur le chapeau, tous les paragraphes des sections et la conclusion; le titre, le sous-titre et les intertitres sont exclus.",
    "- Renseigner estimatedWordCount avec ce meme nombre de mots, meme si le serveur le recalculera comme autorite finale.",
    ...briefRules,
    "- Chaque fait principal ne doit etre developpe qu une fois, sauf rappel bref indispensable a la comprehension.",
    "- Le titre, le chapeau, chaque section et la conclusion doivent remplir des fonctions editoriales differentes.",
    isLimited
      ? "- Mode limited: laisser la conclusion vide si aucune fermeture factuelle distincte n est justifiee."
      : "- La conclusion doit apporter une fermeture ou une perspective utile, sans resumer a nouveau tout l article.",
    "- Interdire les generalites interchangeables sur le poste ou le sport, les scenarios hypothetiques, les motivations supposees et les conclusions abstraites sur le collectif, le parcours ou les defis a venir.",
    "- Ne jamais inventer une scene, une observation de match, un resultat, une citation ou un element biographique pour rendre le texte vivant.",
    "- L absence de resultat ou de participation retrouvee dans les sources est une limite documentaire, jamais une preuve d inactivite; ne pas l ecrire dans l article.",
    "- Ne jamais commenter dans le texte publiable ce que le sujet, l entretien, les extraits ou le dossier ne decrivent pas, ne precisent pas ou ne permettent pas d etablir; omettre simplement le detail indisponible.",
    "- Ne jamais supposer ni recuperer un passage de transcription qui ne figure pas parmi les extraits selectionnes.",
    "- Un placement sur une composition ou une feuille de match ne prouve pas un role tactique precis; ne pas en deduire un poste ou une fonction.",
    "- Ne poser aucune question rhetorique ou sans reponse dans le texte publiable; les lacunes restent des pistes d interview hors de l article.",
    "- Attribuer naturellement dans le texte les faits qui reposent sur une source externe; le panneau de sources ne remplace pas cette attribution.",
    ...(isLimited
      ? [
          "- Mode limited: ne developper ni quotidien, ni choix de carriere, ni psychologie, ni style de jeu sans matiere explicite correspondante.",
        ]
      : []),
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
    "Angle directeur retenu:",
    request.brief.selectedAngle,
    "Structure selectionnee:",
    JSON.stringify(selectedStructure, null, 2),
    "Contexte et demande:",
    serializeArticleContext(request),
  ].join("\n\n");
};