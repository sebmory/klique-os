import { buildEditorialRulesBlock, editorialRulesVersion } from "@/services/content-intelligence/editorial-rules";
import {
  INTERVIEW_CRAFT_RULES,
  buildInterviewPreparationBlock,
} from "@/services/content-intelligence/interview-preparation";
import { buildStoryPrompt } from "@/services/content-intelligence/story-prompt-builder";
import type { AnyContentGenerationRequest, ContentTemplateDefinition } from "@/types/content-generation";

export const buildContentPrompt = (args: {
  request: AnyContentGenerationRequest;
  template: ContentTemplateDefinition;
  promptVersion: string;
}): string => {
  const templatePayload = args.template.buildPrompt(args.request);
  const selectedCount = args.request.selectedContextItems.length;
  const interviewType = args.request.requestType === "interview"
    ? args.request.brief.interviewType
    : undefined;
  const isAfterMatch = interviewType === "after_match";
  const isTournamentReview = interviewType === "tournament_review";
  const contextRules = [
    `- Nombre d elements de contexte selectionnes: ${selectedCount}.`,
    "- Utiliser uniquement les faits selectionnes transmis dans le contexte.",
    "- Aucun fait, score, date, club, resultat, citation ou palmares ne peut etre invente.",
    "- Ne jamais resoudre automatiquement une contradiction.",
    "- Ne jamais fabriquer une citation ni reformuler un texte comme citation directe.",
    "- Une piste editoriale ou une donnee manuelle non verifiee reste une hypothese.",
    "- Transformer une information manquante en question ouverte ou l omettre.",
    "- Ne jamais presenter un element historique comme une actualite recente.",
    "- Rester strictement dans le perimetre du dossier editorial fourni.",
    "- Ne jamais transformer une piste editoriale en fait verifie.",
    "- Ne jamais inventer de detail absent.",
    "- Ne pas affirmer un resultat non fourni.",
    "- Relier les questions a l actualite seulement quand les faits selectionnes le permettent.",
    // Apres-match, la trame est centree sur la rencontre; les autres types gardent l equilibre.
    ...(isAfterMatch
      ? ["- Centrer la trame sur cette rencontre precise: equipes, score, sequences et faits fournis."]
      : isTournamentReview
        ? ["- Centrer la trame sur l edition de tournoi transmise, couvrir les disciplines representees et ne pas derouler les matchs un par un."]
      : [
          "- Conserver un equilibre entre actualite et profondeur humaine.",
          "- Eviter que toutes les questions portent sur un seul evenement recent.",
        ]),
    "- Utiliser les dates fournies pour eviter les formulations temporelles erronees.",
    "- Ne pas inclure d URL dans les questions sauf demande explicite.",
  ].join("\n");

  if (args.request.requestType === "publication") {
    const publicationContextRules = [
      `- Nombre d elements de contexte selectionnes: ${selectedCount}.`,
      "- Utiliser uniquement les faits selectionnes transmis dans le contexte.",
      "- Ne jamais transformer une piste editoriale en fait verifie.",
      "- Ne jamais inventer de detail absent.",
      "- Ne pas affirmer un resultat non fourni.",
      "- Exploiter explicitement les faits disponibles dans le texte final.",
      "- Si le contexte est insuffisant, rester strictement factuel et sobre dans le texte.",
      "- Signaler les limites de contexte dans editorialNote, jamais dans le texte a publier.",
      "- Ne pas inclure d URL sauf demande explicite.",
    ].join("\n");

    const publicationRules = [
      "- Produire exactement 3 propositions de publication.",
      "- Les 3 propositions doivent traiter le meme sujet editorial commun: l angle selectionne a l etape 3.",
      "- Les 3 propositions ne doivent pas chercher 3 nouveaux angles.",
      "- Les 3 propositions doivent proposer 3 traitements editoriaux differents du meme angle.",
      "- Interdiction de produire 3 reformulations entre elles.",
      "- Chaque proposition doit etre un vrai texte pret a publier, pas une analyse editoriale, pas une note strategique.",
      "- Priorite absolue: le champ text doit etre directement publiable tel quel.",
      "- Ecrire comme un journaliste sportif / community manager experimente, pas comme une IA qui analyse un sujet.",
      "- Commencer text par une accroche forte directement liee au sujet.",
      "- Ecrire naturellement avec du rythme et des phrases de longueurs variees.",
      "- Privilegier les faits concrets aux formulations abstraites.",
      "- Donner une vraie personnalite au texte.",
      "- Proposition 1: traitement factuel / direct. Centrer sur le fait principal et les informations verifiees du contexte, style actualite sportive, sans mise en scene ni effet narratif.",
      "- Proposition 2: traitement humain / narratif. Partir d une emotion, d un vecu ou d une reaction explicitement presente dans le contexte selectionne; si aucune n est presente, rester sur un recit factuel du parcours sans inventer d emotion.",
      "- Proposition 3: traitement communautaire / conversationnel. Traiter la portee pour le club, les supporters ou le sport local, avec un CTA reellement pertinent pour cette communaute.",
      "- Les trois textes ne doivent jamais commencer par la meme information ni derouler les faits dans le meme ordre.",
      "- editorialNote proposition 1 doit commencer par: [TRAITEMENT: editorial_factuel].",
      "- editorialNote proposition 2 doit commencer par: [TRAITEMENT: storytelling_humain].",
      "- editorialNote proposition 3 doit commencer par: [TRAITEMENT: social_impact].",
      "- Le sujet editorial commun est fixe; seule la maniere de le traiter change.",
      "- Chaque proposition doit hierarchiser les informations selon son traitement, pas selon un plan CRM fixe.",
      "- Les donnees CRM sont une matiere premiere, pas un plan obligatoire ni un sommaire a remplir.",
      "- Ne pas empiler toutes les informations disponibles dans chaque proposition.",
      "- Selectionner uniquement les informations utiles au traitement choisi.",
      "- Structure obligatoire proposition 1 (editorial / factuel):",
      "  * Commencer par l information principale ou l actualite la plus utile.",
      "  * Informations hierarchisees: fait principal puis elements de contexte.",
      "  * Ecriture precise, naturelle, journalistique et publiable telle quelle.",
      "- Structure obligatoire proposition 2 (storytelling / humain):",
      "  * Commencer par une phrase forte, un contraste ou un moment du parcours.",
      "  * Construire une progression narrative (debut -> evolution -> enjeu).",
      "  * Narration naturelle, rythme fluide, accroche forte, centree sur la personne et son parcours, sans inventer d emotions ni de faits.",
      "  * Ne pas reprendre la meme chronologie que la version journalistique.",
      "- Structure obligatoire proposition 3 (social / impact):",
      "  * Commencer par une accroche courte et percutante.",
      "  * Ecriture directe, vivante et rythmee, native de la plateforme choisie.",
      "  * Pensee en priorite pour Instagram et la lecture mobile.",
      "  * Paragraphes courts; listes, chiffres ou emojis possibles uniquement si ton et consignes les autorisent.",
      "- Les 3 propositions doivent etre reconnaissables immediatement comme 3 traitements differents, dans leur construction et leur ecriture, tout en restant sur le meme angle.",
      "- Adapter reellement la structure a la plateforme selectionnee.",
      "- Pour instagram, eviter les gros blocs ressemblant a un article.",
      "- Pour une publication longue, produire un texte developpe agreable a lire sur mobile, avec plusieurs paragraphes courts.",
      "- Chaque proposition doit apporter une valeur d accroche differente: information, emotion, curiosite ou contexte.",
      "- Utiliser uniquement les faits fournis par le contexte selectionne.",
      "- Ne pas inventer de faits, dates, chiffres, citations ou annonces.",
      "- Prioriser les faits disponibles avant toute formule d habillage.",
      "- Rediger comme un vrai post pret a publier, pas comme un resume CRM, un communique ou un texte IA.",
      "- Eviter le style institutionnel/IA: repetitions, conclusions abstraites, formules comme 'dans cette perspective', 'le parcours s inscrit', 'l objectif consiste a'.",
      "- Eviter aussi les formulations artificielles/institutionnelles suivantes: 'projet sportif', 'trajectoire', 's inscrit dans', 'change de dimension', 'dans cette perspective', 'constitue un repere', 'permet de mesurer'.",
      "- Ecrire comme un humain qui connait le sport.",
      "- Interdit dans text: commenter la strategie editoriale, expliquer comment raconter le sujet, justifier un angle ou une methode d ecriture.",
      "- Interdit dans text: formulations abstraites/institutionnelles, phrases de remplissage, repetitions du meme concept.",
      "- Ne pas repeter plusieurs fois les memes objectifs ou informations.",
      "- Le lecteur doit pouvoir lire text directement sur instagram sans percevoir un assistant editorial.",
      "- Le resultat doit pouvoir etre copie-colle sur instagram sans reecriture importante.",
      "- Les informations techniques (traitement, limites, justification, suggestion visuelle) restent dans leurs champs dedies et ne doivent jamais apparaitre dans text.",
      "- Ne jamais ecrire comme une introduction d interview et ne pas enchainer des questions.",
      "- Eviter les formulations generiques, creuses et cliches.",
      "- Interdire explicitement les tics suivants: 'une histoire a ecrire', 'bien plus qu un', 'passion et determination', 'repousser ses limites', 'pret pour la suite'.",
      "- Eviter les successions artificielles de phrases tres courtes et les questions rhetoriques inutiles.",
      "- Adapter reellement l ecriture a la plateforme, au sujet, au sport, a l objectif, au ton et au public cible.",
      "- Respecter la plateforme, le ton, la longueur, l audience et le CTA demandes.",
      "- Respect strict de la longueur selon brief.length:",
      "  * short: 30 a 70 mots.",
      "  * medium: 80 a 150 mots.",
      "  * long: 180 a 300 mots, avec un vrai developpement narratif/editorial.",
      "  * free: suivre l instruction utilisateur dans specialInstructions.",
      "- Le CTA est facultatif: s il n apporte rien, retourner cta vide.",
      "- Les hashtags sont facultatifs: si non utiles, retourner un tableau vide.",
      "- Quand hashtags presents, ils doivent etre sobres, pertinents et strictement relies au contenu genere.",
      "- La suggestion visuelle doit etre concrete et coherente avec les faits et le texte de la proposition.",
      "- Respecter strictement les elements a inclure et a eviter.",
      "- Si une information manque, rester prudent et factuel sans inventer ni remplir avec du texte vague.",
      "- Chaque proposition doit correspondre strictement a son traitement assigne (1: factuel/direct, 2: humain/narratif, 3: communautaire/conversationnel), sans deriver vers un autre traitement.",
      "- Chaque proposition doit avoir un title, un rythme de phrases, une suggestion visuelle et une conclusion reellement differents des deux autres.",
      "- Interdit: la meme accroche, le meme deroule ou la meme conclusion entre deux propositions.",
      "- Interdit: produire trois reformulations des memes faits dans le meme ordre.",
      "- Interdit: attribuer une appreciation, un ressenti ou une reaction a une source si elle n est pas explicitement presente dans le contexte selectionne.",
      "- Interdit: inventer des faits ou des citations.",
      "- Prioriser strictement les elements de contexte selectionnes comme source d information principale.",
      "- Si le contexte selectionne est pauvre ou insuffisant, rester sobre et factuel plutot que d inventer un fait, un chiffre, une citation ou un detail absent.",
      "- Eviter les titres ou accroches generiques, les repetitions d une proposition a l autre et toute formulation interchangeable entre les 3 propositions.",
      "- La forme de sortie est imposee par un schema JSON strict externe.",
    ].join("\n");

    return [
      "Mission: generer des publications editoriales fiables, exploitables et pretes a l usage.",
      `Prompt version: ${args.promptVersion}`,
      `Template: ${args.template.key}`,
      `Template version: ${args.template.version}`,
      `Langue obligatoire: ${args.request.language}`,
      `Rules version: ${editorialRulesVersion}`,
      "Regles editoriales:",
      buildEditorialRulesBlock(),
      "Contraintes de qualite:",
      publicationRules,
      "Contexte intelligent:",
      publicationContextRules,
      "Contexte et demande:",
      templatePayload,
    ].join("\n\n");
  }

  if (args.request.requestType === "reel") {
    const reelRules = [
      "- Produire exactement 3 concepts Reel distincts et directement tournables/montables.",
      "- Les 3 concepts doivent traiter le meme angle editorial selectionne, avec 3 traitements reellement differents.",
      "- Ne jamais inventer de faits, resultats, citations, chiffres, dates, blessures, transferts ou annonces.",
      "- Utiliser uniquement les informations transmises dans le contexte.",
      "- Chaque concept doit contenir: hook, concept, scenes chronologiques, plans, texte ecran, voix off, B-roll, transitions, ambiance/musique, CTA (facultatif), legende, hashtags, idee de cover.",
      "- Le deroule scene par scene doit etre clair, concret et executable par une equipe production.",
      "- Pour chaque scene, definir un durationSeconds entier et une progression narrative logique.",
      "- Pour chaque scene, fournir explicitement un role.",
      "- Pour chaque scene, fournir explicitement une direction; si aucune consigne n est necessaire, retourner direction: null.",
      "- Respecter strictement la duree cible: la somme de durationSeconds de chaque concept doit etre exactement egale a la duree demandee.",
      "- Si le format est voice_over: au moins une scene doit contenir une voix off explicite.",
      "- Si le format n est pas voice_over: la voix off peut rester vide.",
      "- Hooks differents entre les 3 concepts, sans reformulation du meme angle.",
      "- Adapter l ecriture a la plateforme cible (Instagram, TikTok ou YouTube Shorts).",
      "- Legende concise, publiable telle quelle, sans meta-commentaire editorial.",
      "- Hashtags sobres, pertinents et strictement lies aux faits/contextes fournis.",
      "- Cover idea visuelle, specifique et realiste.",
      "- La forme de sortie est imposee par un schema JSON strict externe.",
    ].join("\n");

    const reelContextRules = [
      `- Nombre d elements de contexte selectionnes: ${selectedCount}.`,
      "- Utiliser uniquement les faits selectionnes transmis dans le contexte.",
      "- Ne jamais transformer une piste editoriale en fait verifie.",
      "- Si le contexte est insuffisant, rester sobre et factuel.",
      "- Ne pas inclure d URL sauf demande explicite.",
    ].join("\n");

    return [
      "Mission: generer des concepts Reel editoriaux, concrets et exploitables en production.",
      `Prompt version: ${args.promptVersion}`,
      `Template: ${args.template.key}`,
      `Template version: ${args.template.version}`,
      `Langue obligatoire: ${args.request.language}`,
      `Rules version: ${editorialRulesVersion}`,
      "Regles editoriales:",
      buildEditorialRulesBlock(),
      "Contraintes Reel:",
      reelRules,
      "Contexte intelligent:",
      reelContextRules,
      "Contexte et demande:",
      templatePayload,
    ].join("\n\n");
  }

  if (args.request.requestType === "story") {
    return buildStoryPrompt(args.request);
  }

  const questionCount = args.request.brief.questionCount;
  const afterMatchSituationRules = isAfterMatch
    ? [
        "- Avant de rediger, utiliser afterMatchSituation pour construire silencieusement une tension editoriale propre a cette rencontre. Ne jamais afficher ce raisonnement.",
      "- Utiliser toute la situation Apres-match disponible, notamment le resultat, le score et l adversaire de la fiche de match explicitement selectionnee. Conserver leur provenance et leur statut dans les informations de fiabilite et ne jamais les promouvoir silencieusement en faits officiels.",
      "- Distinguer strictement les donnees verified, reported et unverified. Les donnees de la fiche explicitement selectionnee peuvent structurer l entretien, mais leur statut doit rester explicite dans les informations de fiabilite.",
      "- Exception strictement limitee au resultat selectionne par le redacteur: les champs opponent, score et outcome de afterMatchSituation peuvent servir de contexte journalistique et etre cites dans une question meme lorsque verificationStatus vaut unverified.",
      "- Cette exception ne transforme jamais opponent, score ou outcome en donnees verified, n autorise aucune deduction de participation individuelle et ne s applique a aucun autre editorial_lead.",
      "- Pour ces trois champs seulement, l exception permet de presenter le resultat collectif comme contexte de question sans le presenter comme un fait officiel verifie.",
      "- Maximum deux questions principales autour d un meme fait ou evenement.",
      "- Une entree en jeu ne doit jamais produire une serie de variantes distinctes sur l observation, les consignes, la lecture, la mission et l apport. Regrouper ces pistes en une ou deux questions principales au maximum.",
      "- Quand une action precise est documentee, la citer dans la question et demander au joueur de l expliquer.",
      "- Ne jamais demander au joueur de choisir, retrouver ou identifier lui-meme une action ou un souvenir precis que les donnees ne documentent pas.",
      "- Si seule la minute d entree est connue, poser exactement une seule question principale sur cette entree. Ne produire aucune autre variante sur l observation, les consignes, la lecture ou l apport.",
      "- Ne jamais inventer d occasion, d action, de consigne, d emotion ni de probleme physique.",
      "- Apres la question eventuelle sur l entree, utiliser les autres elements disponibles: resultat, dynamique, classement, poste, role collectif, moral, solutions et suite.",
      "- Quand une defaite et une derniere place sont disponibles dans afterMatchSituation, elles structurent la tension et la progression de l entretien.",
      "- Pour une defaite et une derniere place, privilegier la reaction, les difficultes, le moral, les solutions, la confiance, le role du joueur et la suite.",
      "- Lorsqu un adversaire, un score et une issue sont disponibles dans afterMatchSituation, une question principale doit exploiter clairement ces trois elements.",
      "- Lorsque opponent, score et outcome sont disponibles, nommer l adversaire et le resultat dans la question plutot que d employer une formulation vague comme 'cette rencontre'.",
      "- Lorsqu un poste CRM est disponible, une question principale doit utiliser ce role pour apporter un angle sportif concret.",
      "- Poser au maximum une seule question principale sur le classement.",
      "- Refuser deux questions qui cherchent essentiellement la meme reponse, notamment constat du classement / vecu du classement ou difficulte collective / changement urgent.",
      "- Repartir les huit questions entre des angles distincts. Exemple pour une situation comme Camara, a adapter aux faits disponibles et non a recopier comme des phrases fixes: 1. reaction au resultat en nommant issue, score et adversaire; 2. difficulte collective observee; 3. point positif ou point d appui; 4. entree en jeu, une seule question; 5. confiance personnelle; 6. role ou attentes lies au poste CRM; 7. solutions pour sortir de la derniere place; 8. supporters ou prochaine echeance.",
        "- Adapter librement l ordre et les angles a la tension reelle du match, au profil du joueur et aux faits transmis. Ne jamais forcer une etape absente de la situation.",
      "- Chaque question doit etre naturelle, directe et humaine, chercher une reponse differente et former avec les autres une conversation naturelle.",
      "- Employer le vocabulaire propre au sport et utiliser le poste CRM lorsqu il apporte un vrai angle sportif.",
        "- Replacer les chiffres dans une situation sportive et emotionnelle sans dicter l emotion attendue.",
        "- Eviter le ton questionnaire ou IA.",
        "- Interdire les questions de remplissage et leurs variantes: 'quelle etait votre priorite ?', 'qu aviez-vous observe ?', 'qu est-ce qui vous a sollicite physiquement ?', 'quelle decision aimeriez-vous expliquer ?'. Les utiliser uniquement si un fait precis leur donne un veritable interet journalistique.",
      ].join("\n")
    : "";
  return [
    "Mission: generer un contenu interview editorial utile, fiable et exploitable.",
    `Prompt version: ${args.promptVersion}`,
    `Template: ${args.template.key}`,
    `Template version: ${args.template.version}`,
    `Langue obligatoire: ${args.request.language}`,
    `Rules version: ${editorialRulesVersion}`,
    "Regles editoriales:",
    buildEditorialRulesBlock(),
    "Contraintes de qualite:",
    [
      `- Generer exactement ${questionCount} questions principales, ni plus ni moins.`,
      "- Si la matiere verifiee est insuffisante, ne jamais compenser avec des pistes non verifiees ni reduire silencieusement le nombre.",
      "- Produire des questions distinctes, non repetitives et adaptees au sujet, sport, type, format, audience et angle editorial.",
      "- Ne jamais inventer de faits, actualites, blessures, transferts, resultats, statistiques ou citations.",
      "- Utiliser uniquement les informations fournies.",
      "- Si une information manque, ne pas en faire une premisse de question. Les reserves restent dans Fiabilite et sources.",
      "- Respecter strictement les sujets obligatoires et eviter strictement les sujets interdits.",
      "- Pour chaque question, proposer des relances directement liees a la question.",
      "- La forme de sortie est imposee par un schema JSON strict externe.",
      "- Ne pas inclure de metadata sensible sur le provider ou la cle API.",
    ].join("\n"),
    "Methode journaliste (commune a tous les types):",
    INTERVIEW_CRAFT_RULES.join("\n"),
    ...(afterMatchSituationRules
      ? ["Tension editoriale Apres-match:", afterMatchSituationRules]
      : []),
    buildInterviewPreparationBlock(interviewType ?? "free"),
    "Contexte intelligent:",
    contextRules,
    "Contexte et demande:",
    templatePayload,
  ].join("\n\n");
};
