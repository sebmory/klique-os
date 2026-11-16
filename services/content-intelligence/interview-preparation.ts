import type { InterviewTypeId } from "@/types/content-generation";
import type { ContextItem } from "@/types/context-intelligence";

// Cadre de preparation journalistique par type d interview.
// Chaque cadre decrit la matiere attendue, l ouverture et les relances utiles.
// Ce sont des reperes de travail pour la generation, pas des rubriques obligatoires.

export type InterviewPreparationFrame = {
  interviewType: InterviewTypeId;
  matiere: string;
  ouverture: string;
  questions: string[];
  relances: string;
};

const frames: Record<InterviewTypeId, InterviewPreparationFrame> = {
  after_match: {
    interviewType: "after_match",
    matiere: "resultat et ecart, evolution par quart-temps ou sequences documentees, ligne individuelle verifiee (points, titularisation), incidence au classement et prochain rendez-vous uniquement si ces elements sont sources et a jour.",
    ouverture: "le fait verifie le plus fort pour l angle choisi: performance individuelle confirmee, bascule documentee du score, sinon le resultat collectif, nomme precisement (adversaire, score).",
    questions: [
      "Avant de rediger, choisir interieurement un fil d entretien a partir des faits verifies et l ordonner pour que chaque question appelle une reponse differente. Ne pas afficher ce travail preparatoire.",
      "Composer ce fil avec quelques pistes seulement, selon la matiere disponible: vecu individuel documente, lecture du match, reaction a un moment precis, puis perspective uniquement si elle est sourcee. Ce sont des pistes de preparation, jamais des rubriques a remplir.",
      "Quand une non-titularisation et une participation individuelle sont toutes deux verifiees, le role en sortie de banc peut faire partie du fil sans inventer le moment de l entree ni la presence du joueur sur une sequence precise.",
      "Adopter une voix de journaliste sportif: questions naturelles a l oral, une idee a la fois, dans un fil qui suit ce que le joueur a vecu et compris du match.",
      "Varier le rythme entre reaction a chaud, lecture d un fait du match et projection courte; ne pas aligner des formulations du type 'statistique: comment expliquez-vous...'.",
      "Utiliser les chiffres seulement lorsqu ils eclairent le match; ne pas dicter l emotion attendue, la laisser venir de la reponse.",
      "Traiter la feuille de match comme des notes: selectionner le moment qui sert le fil, jamais fabriquer une question par quart-temps ni derouler chronologiquement tous les scores.",
      "Ne pas demander le premier ballon, le premier tir, la premiere possession ni un autre micro-detail arbitraire, sauf si ce detail est documente et apporte un interet editorial precis.",
      "Si une statistique individuelle est verifiee, la citer dans une seule question principale et interroger ce qu elle revele de la performance, jamais reciter le chiffre pour lui-meme.",
      "Apres une question ancree dans un chiffre, une relance courte peut chercher un souvenir, un choix ou un ressenti sans repeter la statistique et sans presupposer la reponse.",
      "Si les scores des quatre quart-temps documentent une avance avant le dernier quart puis un ecart final plus faible, consacrer une seule question principale a cette fin de match en citant les deux ecarts calculables, sans inventer d action ni de cause.",
      "Ne pas poser plusieurs variantes sur la meme fin de match, le meme moment ou la meme statistique. Ne pas repeter le score complet dans plusieurs questions.",
      "Ordonner les questions selon la conversation suggeree par les faits, sans position fixe valable pour tous les matchs. Si une question invite a souligner la contribution d un coequipier, placer d abord la question sur le moment collectif documente auquel cette contribution peut se rattacher.",
      "Attribuer explicitement a l equipe les scores, ecarts, series et points collectifs; ne jamais les presenter comme une statistique individuelle du joueur.",
      "Ne jamais supposer que le joueur etait sur le terrain pendant un quart-temps, une serie ou un moment precis sans donnee qui le confirme; lui proposer de raconter ce qu il a vecu ou observe.",
      "Sans preuve de participation individuelle, ne presupposer ni temps de jeu, ni points, ni role: exploiter le contexte collectif ou inviter au recit.",
      "Chaque bloc afterMatchClosingFacts present dans le brief est un sujet obligatoire des questions principales, de preference vers la fin de l entretien.",
      "Pour ranking, citer explicitement requiredMention dans une question principale. Pour nextFixture, citer explicitement requiredMention dans une autre question principale. L introduction, une relance ou une question vague sur la suite ne compte pas.",
      "Si les deux blocs sont presents, les traiter dans deux questions distinctes avec une seule idee par question, tout en les integrant au nombre total demande.",
      "Respecter retainedFrom et resolutionNote: une valeur verified_context remplace la saisie manuelle contradictoire; une valeur manual_brief reste une information fournie par l utilisateur et sa source ne constitue pas une verification independante.",
      "Si aucun bloc afterMatchClosingFacts n est present, ne pas imposer de question sur le classement ou le prochain rendez-vous et ne rien inventer sur la suite.",
    ],
    relances: "apres la reponse, faire preciser un souvenir, un choix, un ressenti, une consigne ou un ajustement sans repeter le chiffre de la question; jamais de relance detachee du match.",
  },
  tournament_review: {
    interviewType: "tournament_review",
    matiere: "les matchs selectionnes d une meme edition de tournoi, regroupes par simple, double et mixte avec leurs adversaires, sources et statuts de verification.",
    ouverture: "un fait marquant verifie de l edition ou une invitation a dresser le bilan si la couverture est partielle.",
    questions: [
      "Produire une seule interview avec exactement le nombre de questions demande.",
      "Couvrir chacune des disciplines representees dans les matchs transmis, sans imposer une question par match.",
      "Choisir les faits marquants qui appellent des reponses distinctes et construire un fil transversal a l edition.",
      "Utiliser les adversaires pour distinguer les rencontres qui partagent le meme titre.",
      "Respecter la source et le statut de verification de chaque match; ne jamais promouvoir une rencontre non verifiee en fait acquis.",
      "Si la couverture est partielle, le signaler dans la preparation et ne deduire ni bilan complet, ni nombre total de victoires, ni classement final.",
    ],
    relances: "faire comparer une discipline, un adversaire ou un moment deja cite dans la reponse, sans derouler chronologiquement tous les matchs.",
  },
  before_match: {
    interviewType: "before_match",
    matiere: "l adversaire et son identite de jeu observable, l enjeu concret de la rencontre, l etat du groupe et le contexte du calendrier si ces elements sont sources.",
    ouverture: "l enjeu concret de la rencontre ou un point fort documente de l adversaire, nomme precisement.",
    questions: [
      "Interroger la preparation sur un aspect precis du jeu adverse documente.",
      "Faire decrire le scenario de match attendu et le plan pour y repondre.",
      "Ne jamais annoncer une titularisation ou un role non confirme.",
    ],
    relances: "faire detailler un scenario concret ou la reponse prevue a une force adverse citee.",
  },
  portrait: {
    interviewType: "portrait",
    matiere: "un choix, un episode ou un changement precis et source dans le parcours de la personne.",
    ouverture: "cet episode ou ce choix precis, jamais une question d identite generale.",
    questions: [
      "Faire raconter des scenes vecues et des decisions datees.",
      "Laisser la personne qualifier elle-meme ses valeurs et ses moteurs.",
    ],
    relances: "demander un exemple vecu des qu une reponse reste abstraite.",
  },
  journey: {
    interviewType: "journey",
    matiere: "les etapes charnieres sourcees du parcours: decisions, rencontres, changements de cap.",
    ouverture: "l etape charniere la plus marquante du dossier, nommee precisement.",
    questions: [
      "Faire raconter la decision ou la rencontre qui a change la suite.",
      "Ne pas combler les periodes inconnues: les transformer en invitation au recit.",
    ],
    relances: "faire comparer l avant et l apres d une etape citee par la personne.",
  },
  fast_questions: {
    interviewType: "fast_questions",
    matiere: "le profil de la personne et son univers sportif, sans premisse factuelle non verifiee.",
    ouverture: "une question instinctive, courte et liee a son sport ou son quotidien.",
    questions: [
      "Garder un rythme tres court, une idee par question, reponses spontanees.",
      "Varier les registres (jeu, habitudes, preferences) sans attribuer de role ou d habitude non confirmee.",
    ],
    relances: "une seule relance eclair par question au maximum, liee a la reponse.",
  },
  performance: {
    interviewType: "performance",
    matiere: "les reperes de progression sources (resultats, statistiques verifiees); sinon les reperes que la personne utilise elle-meme.",
    ouverture: "un resultat ou un repere verifie, interroge sur le travail qui l explique.",
    questions: [
      "Interroger le travail concret derriere un resultat verifie.",
      "Sans statistique verifiee, demander quels reperes la personne suit.",
    ],
    relances: "faire decrire un exercice, un ajustement ou une routine citee dans la reponse.",
  },
  mental: {
    interviewType: "mental",
    matiere: "les moments concrets racontables par la personne; aucun diagnostic ni premisse psychologique.",
    ouverture: "un moment concret et source, ou une invitation a raconter un moment exigeant choisi par la personne.",
    questions: [
      "Laisser la personne qualifier son experience, sans supposer difficulte ou methode.",
    ],
    relances: "faire revivre la scene citee: ce qu elle a vu, entendu, decide.",
  },
  injury_return: {
    interviewType: "injury_return",
    matiere: "les etapes connues et sourcees du retour, et ce que l athlete accepte d aborder.",
    ouverture: "une etape connue du retour, ou une invitation prudente a raconter la reprise.",
    questions: [
      "Ne confirmer ni blessure, ni diagnostic, ni date de reprise.",
      "Formuler chaque element medical comme une question ouverte que la personne peut decliner.",
    ],
    relances: "suivre uniquement ce que la personne a elle-meme evoque.",
  },
  new_club: {
    interviewType: "new_club",
    matiere: "les faits sources de l arrivee: club, date, contexte; rien de presume sur le role ou l integration.",
    ouverture: "le fait source de l arrivee, puis la decouverte racontee par la personne.",
    questions: [
      "Faire raconter les premieres impressions reelles sans presumer accueil ni difficulte.",
      "Distinguer ambitions exprimees et objectifs officiellement confirmes.",
    ],
    relances: "faire comparer avec le contexte precedent uniquement si la personne l evoque.",
  },
  free: {
    interviewType: "free",
    matiere: "les faits fournis par le dossier et la demande explicite de l utilisateur.",
    ouverture: "l element le plus concret et le plus recent du dossier.",
    questions: [
      "Cadrer le sujet avec les faits fournis et laisser la personne confirmer le reste.",
    ],
    relances: "approfondir le point le plus concret de la reponse.",
  },
};

export const getInterviewPreparationFrame = (
  interviewType: string,
): InterviewPreparationFrame => frames[interviewType as InterviewTypeId] ?? frames.free;

// Exigences de qualite communes a tous les types: fil d interview, oralite, precision.
export const INTERVIEW_CRAFT_RULES: readonly string[] = [
  "- Construire un fil d interview qui se suit naturellement, pas une liste de themes: chaque question prolonge la logique de la precedente.",
  "- Avant de rediger, choisir silencieusement ce fil a partir des seuls faits verifies; ne pas ajouter d etape ni de rubrique a la sortie JSON.",
  "- Placer la question la plus forte en premier, ancree sur la matiere du type d interview.",
  "- Pour une interview apres-match, rediger une introduction d une seule phrase qui presente le sujet, garder une ouverture a chaud sur le fait verifie le plus fort et terminer par un remerciement court.",
  "- Pour une interview apres-match, ecrire avec une voix de journaliste sportif et varier le rythme des questions plutot que repeter une meme construction autour des statistiques.",
  "- Ecrire des questions courtes, directes et naturelles a l oral, avec une seule idee par question.",
  "- Chaque question doit chercher une reponse differente des autres: un souvenir, un choix, une lecture, une reaction ou une perspective documentee.",
  "- Pour une question tactique, partir d une situation de jeu precise et documentee, jamais d un concept abstrait.",
  "- Les faits cles demandes doivent apparaitre dans le texte des questions principales, jamais seulement dans les relances ou l objectif editorial.",
  "- Les reserves et pistes non verifiees restent dans Fiabilite et sources: ne jamais les transformer en premisse d une question au micro.",
  "- Ne jamais commencer une question par une reserve conditionnelle comme 'si le succes est confirme', 'si le match est confirme' ou 'si les points sont confirmes'.",
  "- Les relances sont conditionnelles, dependent d une reponse possible et apportent une information nouvelle; jamais de reformulation de la question ni de relance de remplissage.",
  "- Interdire les formules abstraites ou passe-partout et leurs variantes: 'Qu est-ce que le score ne raconte pas', 'Quel passage aide a comprendre le match', 'Qu est-ce que le public n a pas vu', 'Quelle sequence choisiriez-vous'.",
  "- Interdire les tournures negatives abstraites et les questions a deux etages.",
  "- Ne pas imposer de grille thematique fixe (ressenti / attaque / defense / communication): l ordre suit l angle choisi et la matiere disponible.",
  "- Ecarter les questions de remplissage sur le ressenti, la communication ou le prochain entrainement.",
  "- Test de relecture obligatoire avant de livrer: une question qui pourrait etre posee telle quelle apres n importe quel match ou pour n importe quel sujet doit etre retravaillee avec un fait precis, ou au besoin retrogradee en relance de secours.",
  "- Une trame ne doit jamais pouvoir passer d un type d interview a un autre en changeant trois mots.",
];

const countAfterMatchAnchors = (items: ContextItem[]): number => items
  .filter((item) =>
    item.isSelected
    && item.statementType === "fact"
    && item.verificationStatus === "verified"
  )
  .reduce((count, item) => {
    const text = `${item.factualStatement} ${item.summary}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const quarterCount = new Set(
      Array.from(text.matchAll(/\bq([1-4])\s*\d{1,3}\s*[–—-]\s*\d{1,3}\b/g), (match) => match[1]),
    ).size;
    const hasIndividualStatistic = /\b(?:pts?\s*\d{1,3}|\d{1,3}\s+points?|statistiques? individuelles?)\b/.test(text);
    const hasNamedPresence = /\bpresence nominative\b/.test(text);
    const hasKnownStarterStatus = /\btitularisation\s*:\s*(?:oui|non)\b/.test(text);
    const hasRankingOrSchedule = /\b(?:classement|prochain match|prochaine rencontre|calendrier)\b/.test(text);
    return count
      + 1
      + quarterCount
      + Number(hasIndividualStatistic)
      + Number(hasNamedPresence)
      + Number(hasKnownStarterStatus)
      + Number(hasRankingOrSchedule);
  }, 0);

export const assessInterviewBriefReadiness = (args: {
  interviewType: string;
  questionCount: number;
  selectedContextItems: ContextItem[];
}): { ready: boolean; verifiedAnchorCount: number; message: string | null } => {
  if (args.interviewType !== "after_match") {
    return { ready: true, verifiedAnchorCount: args.questionCount, message: null };
  }
  const verifiedAnchorCount = countAfterMatchAnchors(args.selectedContextItems);
  if (verifiedAnchorCount > 0) {
    return { ready: true, verifiedAnchorCount, message: null };
  }
  return {
    ready: false,
    verifiedAnchorCount,
    message: [
      `Le brief contient ${verifiedAnchorCount} ancrage${verifiedAnchorCount === 1 ? "" : "s"} verifie${verifiedAnchorCount === 1 ? "" : "s"} pour ${args.questionCount} questions demandees.`,
      "La fiche selectionnee ne fournit aucun fait verifie. Selectionnez une fiche verifiee ou ajoutez un Fait de match verifie par le redacteur avant de lancer la generation.",
    ].join(" "),
  };
};

export const buildInterviewPreparationBlock = (interviewType: string): string => {
  const frame = getInterviewPreparationFrame(interviewType);
  return [
    `Methode de preparation (${frame.interviewType}):`,
    `- Matiere a avoir sous les yeux: ${frame.matiere}`,
    `- Ouverture: ${frame.ouverture}`,
    ...frame.questions.map((rule) => `- ${rule}`),
    `- Relances utiles: ${frame.relances}`,
  ].join("\n");
};
