export type InterviewAngleDefinition = {
  id: string;
  title: string;
  intention: string;
  generationInstruction: string;
};

const interviewAnglesBySubtype: Record<string, readonly InterviewAngleDefinition[]> = {
  portrait: [
    {
      id: "portrait-trigger",
      title: "Le déclic",
      intention: "Faire émerger le moment ou la rencontre qui a orienté le parcours.",
      generationInstruction: "Construire des questions ouvertes sur le parcours sans transformer une actualité récente en sujet principal.",
    },
    {
      id: "portrait-person",
      title: "La personne derrière l’athlète",
      intention: "Découvrir les repères, les valeurs et le quotidien au-delà de la performance.",
      generationInstruction: "Privilégier l’identité et les expériences personnelles sans déduire de faits absents des sources.",
    },
    {
      id: "portrait-motivation",
      title: "Ce qui la motive aujourd’hui",
      intention: "Comprendre les moteurs actuels, les priorités et les envies.",
      generationInstruction: "Formuler les motivations comme des invitations à raconter, jamais comme des affirmations déjà établies.",
    },
  ],
  before_match: [
    {
      id: "before-match-duel",
      title: "Les clés du duel",
      intention: "Identifier les enjeux sportifs et les points d’attention de la rencontre.",
      generationInstruction: "Interroger les clés du match sans annoncer une participation individuelle non confirmée.",
    },
    {
      id: "before-match-preparation",
      title: "La préparation",
      intention: "Explorer le travail réalisé et les repères recherchés avant la rencontre.",
      generationInstruction: "Demander comment la personne se prépare sans inventer de programme, de rôle ou de titularisation.",
    },
    {
      id: "before-match-ambitions",
      title: "Les ambitions pour la rencontre",
      intention: "Faire préciser les objectifs collectifs et personnels pour ce rendez-vous.",
      generationInstruction: "Distinguer clairement ambitions et faits acquis, et ne pas présumer que l’athlète jouera.",
    },
  ],
  after_match: [
    {
      id: "after-match-reading",
      title: "Lire le match",
      intention: "Faire raconter le tournant, les choix et les sensations autour de la rencontre.",
      generationInstruction: "S’appuyer uniquement sur les faits vérifiés et ne jamais déduire une participation individuelle du score collectif.",
    },
    {
      id: "after-match-lessons",
      title: "Les enseignements",
      intention: "Identifier ce que cette rencontre change dans le travail et les priorités.",
      generationInstruction: "Transformer les éléments sourcés en questions, sans présenter les statistiques à vérifier comme acquises.",
    },
    {
      id: "after-match-next",
      title: "La suite",
      intention: "Ouvrir sur les ajustements, les objectifs et le prochain rendez-vous.",
      generationInstruction: "Utiliser le match comme point de départ sans inventer de calendrier, de rôle ou de performance individuelle.",
    },
  ],
  fast_questions: [
    {
      id: "fast-questions-instinct",
      title: "Réponses instinctives",
      intention: "Obtenir des réponses courtes qui révèlent les préférences et les réflexes.",
      generationInstruction: "Produire des questions simples, variées et sans prémisse factuelle non vérifiée.",
    },
    {
      id: "fast-questions-locker-room",
      title: "Dans le vestiaire",
      intention: "Faire ressortir les habitudes, les rôles et les petits détails du collectif.",
      generationInstruction: "Inviter au récit sans attribuer un rôle ou une habitude qui n’est pas confirmé.",
    },
    {
      id: "fast-questions-projection",
      title: "En un mot",
      intention: "Faire réagir rapidement aux objectifs, aux émotions et à la suite.",
      generationInstruction: "Garder un rythme bref et laisser la personne définir elle-même les faits et les émotions.",
    },
  ],
  journey: [
    {
      id: "journey-origins",
      title: "Les débuts",
      intention: "Revenir sur les premières étapes et les premiers repères du parcours.",
      generationInstruction: "Questionner les origines sans compléter les périodes inconnues.",
    },
    {
      id: "journey-turning-points",
      title: "Les étapes charnières",
      intention: "Identifier les décisions, rencontres et apprentissages qui ont fait évoluer le parcours.",
      generationInstruction: "Présenter les étapes non sourcées comme des sujets à raconter, pas comme des faits.",
    },
    {
      id: "journey-next-chapter",
      title: "Le prochain chapitre",
      intention: "Relier le chemin parcouru aux objectifs et aux choix à venir.",
      generationInstruction: "Distinguer les projets exprimés des échéances confirmées.",
    },
  ],
  performance: [
    {
      id: "performance-markers",
      title: "Les repères de progression",
      intention: "Comprendre comment la personne mesure son évolution.",
      generationInstruction: "Ne citer une statistique que si elle est vérifiée; sinon demander quels repères la personne utilise.",
    },
    {
      id: "performance-work",
      title: "Le travail derrière la performance",
      intention: "Explorer les routines, les ajustements et les apprentissages.",
      generationInstruction: "Ne présumer ni méthode, ni charge de travail, ni résultat individuel.",
    },
    {
      id: "performance-objectives",
      title: "Le prochain cap",
      intention: "Faire préciser les objectifs sportifs et la manière de les aborder.",
      generationInstruction: "Formuler les objectifs comme des projections de l’interviewé, pas comme des échéances acquises.",
    },
  ],
  mental: [
    {
      id: "mental-routines",
      title: "Les routines",
      intention: "Explorer les repères utilisés pour se concentrer et entrer dans la compétition.",
      generationInstruction: "Demander les routines sans supposer qu’elles existent ou qu’elles produisent un effet précis.",
    },
    {
      id: "mental-pressure",
      title: "Composer avec la pression",
      intention: "Comprendre comment la personne décrit et traverse les moments exigeants.",
      generationInstruction: "Éviter tout diagnostic psychologique et laisser l’interviewé qualifier son expérience.",
    },
    {
      id: "mental-balance",
      title: "Trouver l’équilibre",
      intention: "Aborder la récupération, l’entourage et les ressources personnelles.",
      generationInstruction: "Ne présumer ni difficulté, ni accompagnement, ni pratique de santé.",
    },
  ],
  injury_return: [
    {
      id: "injury-return-steps",
      title: "Les étapes de la reprise",
      intention: "Inviter la personne à décrire, si elle le souhaite, les étapes et les repères de son retour.",
      generationInstruction: "Ne confirmer ni blessure, ni diagnostic, ni date de reprise; formuler chaque élément médical comme une question ouverte.",
    },
    {
      id: "injury-return-bearings",
      title: "Retrouver ses repères",
      intention: "Explorer les sensations, les ajustements et le rythme retrouvé progressivement.",
      generationInstruction: "Ne supposer aucune difficulté, douleur, participation ou étape déjà franchie.",
    },
    {
      id: "injury-return-confidence",
      title: "Reprendre confiance",
      intention: "Comprendre les appuis personnels et sportifs mobilisés pour se projeter.",
      generationInstruction: "Laisser la personne définir elle-même son état et ses progrès, sans diagnostic ni chronologie inventée.",
    },
  ],
  new_club: [
    {
      id: "new-club-first-impressions",
      title: "Les premières impressions",
      intention: "Faire raconter la découverte du nouvel environnement.",
      generationInstruction: "Ne présumer ni date d’arrivée, ni accueil, ni rôle avant leur confirmation.",
    },
    {
      id: "new-club-integration",
      title: "Trouver sa place",
      intention: "Explorer les repères humains et sportifs de l’intégration.",
      generationInstruction: "Questionner l’intégration sans affirmer qu’elle est achevée ou difficile.",
    },
    {
      id: "new-club-project",
      title: "Le projet commun",
      intention: "Relier les attentes personnelles aux ambitions du club.",
      generationInstruction: "Distinguer les ambitions exprimées des objectifs officiellement confirmés.",
    },
  ],
  free: [
    {
      id: "free-starting-point",
      title: "Le point de départ",
      intention: "Clarifier le sujet central et ce qui mérite d’être raconté maintenant.",
      generationInstruction: "Commencer par des questions ouvertes et ne transformer aucune note utilisateur en fait vérifié.",
    },
    {
      id: "free-human-angle",
      title: "L’angle humain",
      intention: "Faire émerger l’expérience personnelle derrière le sujet.",
      generationInstruction: "Laisser l’interviewé confirmer les faits et qualifier son expérience.",
    },
    {
      id: "free-perspective",
      title: "La mise en perspective",
      intention: "Relier le sujet à ses enseignements et à la suite.",
      generationInstruction: "Séparer les faits sourcés, les pistes de question et les projections.",
    },
  ],
};

export const getInterviewAngles = (subtypeId: string): readonly InterviewAngleDefinition[] =>
  interviewAnglesBySubtype[subtypeId] ?? interviewAnglesBySubtype.free;

export const getInterviewAngle = (
  subtypeId: string,
  angleId: string | undefined,
): InterviewAngleDefinition | undefined =>
  getInterviewAngles(subtypeId).find((angle) => angle.id === angleId);

export const serializeInterviewAngle = (angle: InterviewAngleDefinition): string =>
  `${angle.title}. Intention : ${angle.intention} Consigne de génération : ${angle.generationInstruction}`;
