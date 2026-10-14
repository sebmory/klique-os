export type ModuleGuideRole = "admin" | "media";

export type ModuleGuideAction = {
  label: string;
  description: string;
  href: string;
};

export type ModuleGuideDefinition = {
  name: string;
  purpose: string;
  start: string;
  actions: ModuleGuideAction[];
};

const adminGuides = {
  "/today": {
    name: "Tableau de bord",
    purpose: "Centralise les priorités, alertes et actions à traiter aujourd’hui.",
    start: "Commencez par les éléments signalés comme prioritaires, puis répartissez les actions dans les modules concernés.",
    actions: [
      { label: "Traiter les demandes", description: "Passez en revue les prestations et mises en relation en attente.", href: "/crm/demandes" },
      { label: "Suivre les productions", description: "Vérifiez les projets qui nécessitent une prochaine action.", href: "/production" },
      { label: "Préparer une annonce", description: "Informez les publics concernés depuis les notifications.", href: "/settings/notifications" },
    ],
  },
  "/calendar": {
    name: "Calendrier opérationnel",
    purpose: "Réunit les dates fiables des missions, demandes, productions et journées média.",
    start: "Commencez par la vue À venir, puis ouvrez chaque élément dans son module d’origine pour le traiter.",
    actions: [
      { label: "Voir les prochaines échéances", description: "Filtrez les événements à venir par source métier.", href: "/calendar" },
      { label: "Traiter les missions", description: "Retrouvez les missions qui nécessitent une action.", href: "/missions" },
      { label: "Préparer les productions", description: "Ouvrez le suivi opérationnel des shootings.", href: "/production" },
    ],
  },
  "/analytics/visibilite": {
    name: "Visibilité",
    purpose: "Suit les publications KLIQUE, leur diffusion et les retombées obtenues.",
    start: "Vérifiez la période de suivi, puis complétez les publications ou métriques encore manquantes.",
    actions: [
      { label: "Mettre à jour le suivi", description: "Saisissez les publications et leurs dernières métriques.", href: "/analytics/visibilite" },
      { label: "Contrôler les Athlètes", description: "Retrouvez les fiches liées aux publications suivies.", href: "/crm/personnes" },
      { label: "Préparer les prochains contenus", description: "Transformez les constats en nouvelles prises de parole.", href: "/contents" },
    ],
  },
  "/crm/personnes": {
    name: "Athlètes",
    purpose: "Regroupe les fiches Athlètes, leurs informations et leur suivi opérationnel.",
    start: "Recherchez d’abord l’Athlète concerné avant de créer ou mettre à jour sa fiche.",
    actions: [
      { label: "Consulter les fiches", description: "Recherchez un Athlète et ouvrez son dossier.", href: "/crm/personnes" },
      { label: "Suivre les demandes", description: "Vérifiez les prestations demandées par les Athlètes.", href: "/crm/demandes" },
      { label: "Retrouver leurs médias", description: "Accédez aux lots disponibles dans la banque interne.", href: "/media" },
    ],
  },
  "/crm/creatifs": {
    name: "Créatifs",
    purpose: "Centralise les candidatures, les profils et les accès des créatifs KLIQUE.",
    start: "Traitez les candidatures en attente avant d’affecter un créatif à une production.",
    actions: [
      { label: "Examiner les candidatures", description: "Contrôlez les informations et le portfolio transmis.", href: "/crm/creatifs" },
      { label: "Préparer une affectation", description: "Consultez les productions qui ont besoin d’un créatif.", href: "/production" },
      { label: "Vérifier les accès", description: "Retrouvez la configuration générale du workspace.", href: "/settings" },
    ],
  },
  "/ecosysteme": {
    name: "Partenaires & experts",
    purpose: "Gère les partenaires, experts, médias et avantages de l’écosystème KLIQUE.",
    start: "Recherchez l’organisation avant d’ajouter une fiche ou de mettre à jour une offre.",
    actions: [
      { label: "Parcourir l’écosystème", description: "Consultez les fiches et leur statut actuel.", href: "/ecosysteme" },
      { label: "Suivre les mises en relation", description: "Traitez les demandes adressées aux partenaires.", href: "/crm/demandes" },
      { label: "Publier dans la communauté", description: "Reliez les opportunités et avantages au Hub.", href: "/hub" },
    ],
  },
  "/crm/demandes": {
    name: "Demandes",
    purpose: "Réunit les prestations, prises de contact et mises en relation à coordonner.",
    start: "Ouvrez la vue correspondant au type de demande, puis traitez en priorité les éléments sans réponse.",
    actions: [
      { label: "Traiter les prestations", description: "Consultez les demandes de services des Athlètes.", href: "/crm/demandes?tab=services" },
      { label: "Traiter les partenaires", description: "Consultez les demandes de mise en relation.", href: "/crm/demandes?tab=partners" },
      { label: "Planifier la réalisation", description: "Transformez une demande validée en suivi opérationnel.", href: "/production" },
    ],
  },
  "/production": {
    name: "Productions",
    purpose: "Suit l’avancement opérationnel des productions et leurs prochaines étapes.",
    start: "Repérez les productions sans prochaine action, puis mettez à jour leur état.",
    actions: [
      { label: "Suivre les productions", description: "Ouvrez un projet pour contrôler son avancement.", href: "/production" },
      { label: "Rassembler les médias", description: "Retrouvez les fichiers utiles à la livraison.", href: "/media" },
      { label: "Préparer les contenus", description: "Créez ou reprenez les contenus liés au projet.", href: "/contents" },
    ],
  },
  "/missions": {
    name: "Missions créatives",
    purpose: "Centralise la préparation, l’affectation et l’avancement des missions confiées aux créatifs.",
    start: "Commencez par les livraisons à vérifier, puis traitez les missions à préparer ou à affecter.",
    actions: [
      { label: "Prioriser les missions", description: "Filtrez la liste selon la prochaine action attendue.", href: "/missions" },
      { label: "Ouvrir une demande", description: "Utilisez la demande pour modifier la fiche ou l’affectation existante.", href: "/crm/demandes?tab=services" },
      { label: "Consulter les créatifs", description: "Vérifiez les profils et accès avant une affectation.", href: "/crm/creatifs" },
    ],
  },
  "/media": {
    name: "Banque médias",
    purpose: "Centralise les photos et vidéos internes utiles aux équipes KLIQUE.",
    start: "Filtrez par Athlète ou production avant d’ajouter ou de rechercher un média.",
    actions: [
      { label: "Parcourir la banque", description: "Recherchez les lots et fichiers disponibles.", href: "/media" },
      { label: "Retrouver une production", description: "Vérifiez le contexte opérationnel des médias.", href: "/production" },
      { label: "Réutiliser un média", description: "Préparez un contenu à partir des ressources disponibles.", href: "/contents" },
    ],
  },
  "/media-days": {
    name: "Journées média",
    purpose: "Organise les journées média, les invitations et les créneaux des Athlètes.",
    start: "Vérifiez les journées ouvertes et les réponses avant de créer une nouvelle session.",
    actions: [
      { label: "Planifier une journée", description: "Créez la session, les horaires et la capacité.", href: "/media-days" },
      { label: "Choisir les Athlètes", description: "Contrôlez les fiches avant d’envoyer les invitations.", href: "/crm/personnes" },
      { label: "Classer les livrables", description: "Retrouvez ensuite les médias produits.", href: "/media" },
    ],
  },
  "/media-desk": {
    name: "Sujets médias",
    purpose: "Prépare les sujets proposés aux médias et suit les demandes reçues.",
    start: "Vérifiez les sujets en brouillon, puis publiez uniquement ceux prêts à être proposés.",
    actions: [
      { label: "Préparer un sujet", description: "Rédigez l’angle, associez les Athlètes et définissez les demandes possibles.", href: "/media-desk" },
      { label: "Sélectionner les médias", description: "Retrouvez les ressources disponibles dans la banque.", href: "/media" },
      { label: "Traiter les retours", description: "Suivez les demandes et prises de contact reçues.", href: "/crm/demandes" },
    ],
  },
  "/shooting/assistant": {
    name: "Assistant shooting",
    purpose: "Structure un brief, une shotlist et les références nécessaires à un shooting.",
    start: "Choisissez le contexte du shooting et complétez le brief avant de générer la préparation.",
    actions: [
      { label: "Préparer le shooting", description: "Renseignez l’objectif, le lieu et les contraintes.", href: "/shooting/assistant" },
      { label: "Vérifier les références", description: "Consultez les médias déjà disponibles.", href: "/media" },
      { label: "Anticiper les livrables", description: "Préparez les formats de contenus attendus.", href: "/contents" },
    ],
  },
  "/contents": {
    name: "Studio de contenus",
    purpose: "Crée de nouveaux contenus et permet de reprendre les brouillons existants.",
    start: "Choisissez un format ou reprenez un brouillon avant de compléter le contexte éditorial.",
    actions: [
      { label: "Choisir un format", description: "Démarrez depuis un générateur ou un modèle disponible.", href: "/contents" },
      { label: "Créer un contenu", description: "Ouvrez l’assistant de création avec le bon contexte.", href: "/contents/create" },
      { label: "Préparer une identité visuelle", description: "Gérez les projets et kits de Story Studio.", href: "/contents/story-studio/brand-kits" },
    ],
  },
  "/contents/story-studio/brand-kits": {
    name: "Story Studio",
    purpose: "Gère les identités visuelles et les projets utilisés pour produire des stories.",
    start: "Vérifiez le kit de marque avant de créer ou reprendre un projet Story Studio.",
    actions: [
      { label: "Gérer les kits", description: "Créez ou mettez à jour les identités visuelles.", href: "/contents/story-studio/brand-kits" },
      { label: "Retrouver les contenus", description: "Revenez au studio et à ses brouillons.", href: "/contents" },
      { label: "Choisir les médias", description: "Préparez les ressources visuelles nécessaires.", href: "/media" },
    ],
  },
  "/hub": {
    name: "Communauté",
    purpose: "Anime les publications, opportunités, avantages et ressources de la communauté.",
    start: "Vérifiez les contenus en attente ou arrivant à échéance avant de publier une nouveauté.",
    actions: [
      { label: "Animer la communauté", description: "Consultez le fil et les différents espaces du Hub.", href: "/hub" },
      { label: "Relier un partenaire", description: "Vérifiez l’organisation porteuse d’un avantage.", href: "/ecosysteme" },
      { label: "Suivre les demandes", description: "Traitez les contacts générés par les opportunités.", href: "/crm/demandes" },
    ],
  },
  "/settings": {
    name: "Paramètres",
    purpose: "Regroupe les accès et la configuration du workspace KLIQUE.",
    start: "Choisissez le réglage concerné et vérifiez son périmètre avant toute modification.",
    actions: [
      { label: "Gérer les abonnements", description: "Attribuez et suivez les offres des Athlètes.", href: "/settings/athlete-subscriptions" },
      { label: "Gérer les annonces", description: "Préparez les communications destinées aux utilisateurs.", href: "/settings/notifications" },
      { label: "Contrôler le workspace", description: "Retrouvez les autres réglages et accès disponibles.", href: "/settings" },
    ],
  },
  "/settings/notifications": {
    name: "Notifications & annonces",
    purpose: "Diffuse des annonces ciblées aux utilisateurs actifs du workspace.",
    start: "Définissez les destinataires et vérifiez le lien interne avant l’envoi.",
    actions: [
      { label: "Préparer l’annonce", description: "Rédigez un titre, un message et son lien d’action.", href: "/settings/notifications" },
      { label: "Vérifier la destination", description: "Contrôlez que la page liée est prête et accessible.", href: "/today" },
      { label: "Revenir aux paramètres", description: "Retrouvez les autres réglages du workspace.", href: "/settings" },
    ],
  },
} satisfies Record<string, ModuleGuideDefinition>;

const mediaGuides = {
  "/contents": {
    name: "Contenus média",
    purpose: "Permet de créer ou reprendre les contenus autorisés pour votre activité média.",
    start: "Reprenez un brouillon existant ou choisissez un format disponible dans votre espace.",
    actions: [
      { label: "Parcourir les contenus", description: "Consultez les formats et brouillons disponibles.", href: "/contents" },
      { label: "Consulter les sujets", description: "Retrouvez les sujets publiés par KLIQUE.", href: "/media-desk" },
      { label: "Rechercher un Athlète", description: "Accédez aux profils ouverts aux médias.", href: "/media/athletes" },
    ],
  },
  "/media-desk": {
    name: "Media Desk",
    purpose: "Présente les sujets et Athlètes proposés aux médias par KLIQUE.",
    start: "Consultez les sujets publiés, puis ouvrez celui qui correspond à votre besoin éditorial.",
    actions: [
      { label: "Découvrir les sujets", description: "Parcourez les propositions disponibles.", href: "/media-desk" },
      { label: "Rechercher un Athlète", description: "Consultez les profils accessibles aux médias.", href: "/media/athletes" },
      { label: "Préparer un contenu", description: "Retrouvez les outils disponibles dans votre espace.", href: "/contents" },
    ],
  },
} satisfies Record<string, ModuleGuideDefinition>;

export const resolveModuleGuide = (
  route: string,
  role: string | null | undefined,
): ModuleGuideDefinition | null => {
  if (role === "admin") {
    return adminGuides[route as keyof typeof adminGuides] ?? null;
  }
  if (role === "media") {
    return mediaGuides[route as keyof typeof mediaGuides] ?? null;
  }
  return null;
};

export const adminModuleGuideRoutes = Object.keys(adminGuides);
