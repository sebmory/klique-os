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
      "Faire raconter une sequence nommee du match (quart-temps, serie, fin de match) quand elle est documentee.",
      "Faire preciser un choix ou une decision sur une situation de jeu documentee.",
      "Faire expliquer ce que l adversaire a pose comme probleme concret.",
      "Si une statistique individuelle est verifiee, la citer dans une question principale et interroger la maniere (comment le joueur a trouve ses tirs, ou il a fait la difference), jamais reciter le chiffre pour lui-meme.",
      "Si les scores des quatre quart-temps documentent une avance avant le dernier quart puis un ecart final plus faible, poser une question principale sur cette fin de match en citant les deux ecarts calculables, sans inventer d action ni de cause.",
      "Sans preuve de participation individuelle, ne presupposer ni temps de jeu, ni points, ni role: exploiter le contexte collectif ou inviter au recit.",
      "Classement et calendrier seulement s ils figurent dans les faits fournis.",
    ],
    relances: "selon la reponse, faire preciser le moment exact, le geste, la consigne ou l ajustement; jamais de relance detachee du match.",
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
  "- Placer la question la plus forte en premier, ancree sur la matiere du type d interview.",
  "- Pour une interview apres-match, garder une ouverture a chaud sur le fait verifie le plus fort et une conclusion courte.",
  "- Ecrire des questions courtes, directes et naturelles a l oral, avec une seule idee par question.",
  "- Chaque question cherche une reponse precise: un choix, un episode, une situation de jeu, une decision, une reaction.",
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
  if (verifiedAnchorCount >= args.questionCount) {
    return { ready: true, verifiedAnchorCount, message: null };
  }
  return {
    ready: false,
    verifiedAnchorCount,
    message: [
      `Le brief contient ${verifiedAnchorCount} ancrage${verifiedAnchorCount === 1 ? "" : "s"} verifie${verifiedAnchorCount === 1 ? "" : "s"} pour ${args.questionCount} questions demandees.`,
      "Completez le brief avec des faits verifies ou choisissez un format plus court avant de lancer la generation.",
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
