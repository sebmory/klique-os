"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type AthleteOption = {
  key?: string;
  name?: string;
  sport?: string;
  club?: string;
  status?: string;
};

type AthletesPayload = {
  athletes?: AthleteOption[];
  source?: string;
  message?: string;
};

type AssistantMode = "klique" | "free";

type AssistantDraft = {
  preparation: string[];
  strategy: string[];
  installation: string[];
  deroule: string[];
  shotlist: string[];
  poses: string[];
  formats: string[];
  moodboard: string[];
  structuredMoodboard: StructuredMoodboardSection[];
};

type MoodboardCategoryKey = "poses" | "actions" | "cadrages" | "details" | "expressions" | "accessoires" | "creatif";

type MoodboardItemSet = {
  base: string[];
  byType?: Record<string, string[]>;
};

type MoodboardReference = {
  key: string;
  title: string;
  description: string;
  image?: string;
  imageKey?: string;
  category: string;
};

type StructuredMoodboardSection = {
  domain: string;
  discipline: string;
  categories: Array<{
    key: MoodboardCategoryKey;
    title: string;
    items: MoodboardReference[];
  }>;
};

type ShootingTypeOption = {
  value: string;
  label: string;
};

type DisciplineOption = {
  value: string;
  label: string;
};

const normalize = (value: unknown): string => String(value ?? "").trim();
const formatValue = (value: unknown): string => normalize(value) || "Non renseigné";

const photographyDomains: DisciplineOption[] = [
  { value: "Sport", label: "Sport" },
  { value: "Portrait", label: "Portrait" },
  { value: "Mariage", label: "Mariage" },
  { value: "Gastronomie", label: "Gastronomie" },
  { value: "Corporate", label: "Corporate" },
  { value: "Mode / éditorial", label: "Mode / éditorial" },
  { value: "Événement", label: "Événement" },
  { value: "Immobilier / architecture", label: "Immobilier / architecture" },
  { value: "Réseaux sociaux", label: "Réseaux sociaux" },
  { value: "Autre", label: "Autre" },
];

const sportDisciplines: DisciplineOption[] = [
  { value: "Football", label: "Football" },
  { value: "Football américain", label: "Football américain" },
  { value: "Basketball", label: "Basketball" },
  { value: "Hockey", label: "Hockey" },
  { value: "Tennis", label: "Tennis" },
  { value: "Athlétisme", label: "Athlétisme" },
  { value: "Autre", label: "Autre" },
];

const objectiveOptions: DisciplineOption[] = [
  { value: "Image personnelle", label: "Image personnelle" },
  { value: "Réseaux sociaux", label: "Réseaux sociaux" },
  { value: "Communication", label: "Communication" },
  { value: "Campagne", label: "Campagne" },
  { value: "Branding", label: "Branding" },
  { value: "Presse", label: "Presse" },
  { value: "Portfolio", label: "Portfolio" },
  { value: "Autre", label: "Autre" },
];

const locationOptions: DisciplineOption[] = [
  { value: "Studio", label: "Studio" },
  { value: "Extérieur", label: "Extérieur" },
  { value: "Terrain", label: "Terrain" },
  { value: "Salle", label: "Salle" },
  { value: "Stade", label: "Stade" },
  { value: "Urbain", label: "Urbain" },
  { value: "Intérieur", label: "Intérieur" },
  { value: "Autre", label: "Autre" },
];

const contextOptions: DisciplineOption[] = [
  { value: "Réseaux sociaux", label: "Réseaux sociaux" },
  { value: "Campagne", label: "Campagne" },
  { value: "Communication", label: "Communication" },
  { value: "Presse", label: "Presse" },
  { value: "Branding", label: "Branding" },
  { value: "Site web", label: "Site web" },
  { value: "Portfolio", label: "Portfolio" },
  { value: "Autre", label: "Autre" },
];

const otherDisciplineOptions: Record<string, DisciplineOption[]> = {
  Portrait: [
    { value: "Portrait corporate", label: "Portrait corporate" },
    { value: "Portrait éditorial", label: "Portrait éditorial" },
    { value: "Portrait de marque", label: "Portrait de marque" },
    { value: "Portrait artistique", label: "Portrait artistique" },
    { value: "Autre", label: "Autre" },
  ],
  Mariage: [
    { value: "Cérémonie", label: "Cérémonie" },
    { value: "Couple", label: "Couple" },
    { value: "Réception", label: "Réception" },
    { value: "Storytelling", label: "Storytelling" },
    { value: "Autre", label: "Autre" },
  ],
  Gastronomie: [
    { value: "Produit", label: "Produit" },
    { value: "Cuisine", label: "Cuisine" },
    { value: "Établissement", label: "Établissement" },
    { value: "Editorial", label: "Editorial" },
    { value: "Autre", label: "Autre" },
  ],
  Corporate: [
    { value: "Leadership", label: "Leadership" },
    { value: "Équipe", label: "Équipe" },
    { value: "Produit", label: "Produit" },
    { value: "Événement", label: "Événement" },
    { value: "Autre", label: "Autre" },
  ],
  "Mode / éditorial": [
    { value: "Campagne", label: "Campagne" },
    { value: "Lookbook", label: "Lookbook" },
    { value: "Editorial", label: "Editorial" },
    { value: "Brand", label: "Brand" },
    { value: "Autre", label: "Autre" },
  ],
  Événement: [
    { value: "Festival", label: "Festival" },
    { value: "Conférence", label: "Conférence" },
    { value: "Gala", label: "Gala" },
    { value: "Sport event", label: "Sport event" },
    { value: "Autre", label: "Autre" },
  ],
  "Immobilier / architecture": [
    { value: "Intérieur", label: "Intérieur" },
    { value: "Extérieur", label: "Extérieur" },
    { value: "Architecture", label: "Architecture" },
    { value: "Rénovation", label: "Rénovation" },
    { value: "Autre", label: "Autre" },
  ],
  "Réseaux sociaux": [
    { value: "Reels", label: "Reels" },
    { value: "Stories", label: "Stories" },
    { value: "Carousel", label: "Carousel" },
    { value: "Brand content", label: "Brand content" },
    { value: "Autre", label: "Autre" },
  ],
};

const getDisciplineOptions = (domain: string): DisciplineOption[] => {
  switch (domain) {
    case "Sport":
      return sportDisciplines;
    case "Portrait":
    case "Mariage":
    case "Gastronomie":
    case "Corporate":
    case "Mode / éditorial":
    case "Événement":
    case "Immobilier / architecture":
    case "Réseaux sociaux":
      return otherDisciplineOptions[domain] ?? [];
    default:
      return [];
  }
};

const getDisciplineLabel = (domain: string): string => (domain === "Sport" ? "Sport / discipline" : "Discipline / catégorie");

const getSportSelectionValue = (sport: string): string => {
  const normalized = normalize(sport).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (normalized.includes("football americain") || normalized.includes("american football")) {
    return "Football américain";
  }
  if (normalized.includes("football") || normalized.includes("soccer")) {
    return "Football";
  }
  if (normalized.includes("basket") || normalized.includes("basketball")) {
    return "Basketball";
  }
  if (normalized.includes("hockey")) {
    return "Hockey";
  }
  if (normalized.includes("tennis")) {
    return "Tennis";
  }
  if (normalized.includes("athlet") || normalized.includes("athletics")) {
    return "Athlétisme";
  }

  return normalize(sport) || "Autre";
};

const categoryLabels: Record<MoodboardCategoryKey, string> = {
  poses: "Poses",
  actions: "Actions",
  cadrages: "Cadrages",
  details: "Détails",
  expressions: "Expressions",
  accessoires: "Accessoires",
  creatif: "Créatif",
};

type MoodboardReferencePackItem = {
  key: string;
  title: string;
  description: string;
  imageKey?: string;
};

const footballVisualReferencePack: Record<MoodboardCategoryKey, MoodboardReferencePackItem[]> = {
  poses: [
    {
      key: "football-poses-portrait-debout",
      title: "Portrait debout avec ballon",
      description: "Portrait vertical, posture naturelle, ballon au niveau du bassin pour une silhouette claire.",
      imageKey: "football-poses-portrait-debout",
    },
    {
      key: "football-poses-ballon-sous-le-bras",
      title: "Ballon sous le bras",
      description: "Vue frontale ou trois-quarts avec le ballon retenu au niveau du torse pour un cadrage simple et fort.",
      imageKey: "football-poses-ballon-sous-le-bras",
    },
    {
      key: "football-poses-portrait-34",
      title: "Portrait 3/4",
      description: "Portrait en diagonale, regard porté vers l’objectif, épaules ouvertes et posture de présence.",
      imageKey: "football-poses-portrait-34",
    },
    {
      key: "football-poses-assis-avec-ballon",
      title: "Portrait assis avec ballon",
      description: "Position assise, calme et stable, avec le ballon comme point de focus secondaire.",
      imageKey: "football-poses-assis-avec-ballon",
    },
  ],
  actions: [
    {
      key: "football-actions-course-balle-au-pied",
      title: "Course balle au pied",
      description: "Course de progression avec contrôle de balle, appui au sol et dynamique de jeu visible.",
      imageKey: "football-actions-course-balle-au-pied",
    },
    {
      key: "football-actions-frappe",
      title: "Frappe",
      description: "Geste de tir ou de finition, avec le corps engagé et l’intention très lisible.",
      imageKey: "football-actions-frappe",
    },
    {
      key: "football-actions-dribble",
      title: "Dribble",
      description: "Séquence de dribble compact, rythme rapide et maîtrise du ballon dans le mouvement.",
      imageKey: "football-actions-dribble",
    },
    {
      key: "football-actions-celebration",
      title: "Célébration",
      description: "Moment d’émotion et d’énergie, avec une posture forte et un regard très expressif.",
      imageKey: "football-actions-celebration",
    },
  ],
  cadrages: [
    {
      key: "football-cadrages-plan-americain",
      title: "Plan américain / joueur entier",
      description: "Cadrage vertical ou horizontal sur le joueur entier, avec l’espace de jeu et la silhouette complètes.",
      imageKey: "football-cadrages-plan-americain",
    },
    {
      key: "football-cadrages-gros-plan-visage",
      title: "Gros plan visage",
      description: "Gros plan très serré sur le visage pour mettre en valeur le regard, la tension et l’intensité.",
      imageKey: "football-cadrages-gros-plan-visage",
    },
    {
      key: "football-cadrages-plan-large-environnement",
      title: "Plan large avec environnement",
      description: "Plan large qui raconte l’espace du terrain, le contexte et l’ambiance du moment.",
      imageKey: "football-cadrages-plan-large-environnement",
    },
  ],
  details: [
    {
      key: "football-cadrages-detail-equipement",
      title: "Détail équipement : chaussures / ballon",
      description: "Détail très concret sur les chaussures, le ballon ou les textures de jeu pour renforcer la signature.",
      imageKey: "football-cadrages-detail-equipement",
    },
  ],
  expressions: [],
  accessoires: [],
  creatif: [],
};

const footballVisualImagePaths: Record<string, string> = {
  "football-poses-portrait-debout": "/moodboard/football/01-portrait-debout.jpg",
  "football-poses-ballon-sous-le-bras": "/moodboard/football/02-ballon-sous-le-bras.jpg",
  "football-poses-portrait-34": "/moodboard/football/03-portrait-trois-quarts.jpg",
  "football-poses-assis-avec-ballon": "/moodboard/football/04-portrait-assis.jpg",
  "football-actions-course-balle-au-pied": "/moodboard/football/05-course-balle-au-pied.jpg",
  "football-actions-frappe": "/moodboard/football/06-frappe.jpg",
  "football-actions-dribble": "/moodboard/football/07-dribble.jpg",
  "football-actions-celebration": "/moodboard/football/08-celebration.jpg",
  "football-cadrages-plan-americain": "/moodboard/football/09-plan-americain.jpg",
  "football-cadrages-gros-plan-visage": "/moodboard/football/10-gros-plan-visage.jpg",
  "football-cadrages-plan-large-environnement": "/moodboard/football/11-plan-large-environnement.jpg",
  "football-cadrages-detail-equipement": "/moodboard/football/12-detail-chaussures-ballon.jpg",
};

const footballAmericanVisualReferencePack: Record<MoodboardCategoryKey, MoodboardReferencePackItem[]> = {
  poses: [
    {
      key: "football-americain-poses-portrait-debout",
      title: "Portrait debout avec ballon",
      description: "Portrait de présence, posture droite, regard porté et ballon en position forte.",
      imageKey: "football-americain-poses-portrait-debout",
    },
    {
      key: "football-americain-poses-ballon-sous-le-bras",
      title: "Ballon sous le bras",
      description: "Cadrage simple et impactant avec le ballon retenu au niveau du torse.",
      imageKey: "football-americain-poses-ballon-sous-le-bras",
    },
    {
      key: "football-americain-poses-portrait-34",
      title: "Portrait 3/4 avec casque",
      description: "Portrait en trois-quarts avec casque, posture assurée et regard très lisible.",
      imageKey: "football-americain-poses-portrait-34",
    },
    {
      key: "football-americain-poses-assis-avec-equipement",
      title: "Portrait assis avec équipement",
      description: "Pose stable et professionnelle avec l’équipement comme élément de signature.",
      imageKey: "football-americain-poses-assis-avec-equipement",
    },
  ],
  actions: [
    {
      key: "football-americain-actions-course-avec-ballon",
      title: "Course avec ballon",
      description: "Course de progression et de contrôle, avec énergie et mouvement très visibles.",
      imageKey: "football-americain-actions-course-avec-ballon",
    },
    {
      key: "football-americain-actions-lancer",
      title: "Lancer du quarterback",
      description: "Geste de passe en action, avec la technique et l’intention pleinement lisibles.",
      imageKey: "football-americain-actions-lancer",
    },
    {
      key: "football-americain-actions-reception",
      title: "Réception",
      description: "Séquence de réception avec anticipation, posture et timing très marqués.",
      imageKey: "football-americain-actions-reception",
    },
    {
      key: "football-americain-actions-celebration",
      title: "Célébration",
      description: "Moment d’émotion, d’intensité et de cohésion d’équipe.",
      imageKey: "football-americain-actions-celebration",
    },
  ],
  cadrages: [
    {
      key: "football-americain-cadrages-joueur-entier",
      title: "Joueur entier en situation",
      description: "Cadrage complet du joueur dans son environnement de jeu pour une lecture claire de la posture.",
      imageKey: "football-americain-cadrages-joueur-entier",
    },
    {
      key: "football-americain-cadrages-gros-plan-visage",
      title: "Gros plan visage avec casque",
      description: "Gros plan très serré sur le visage pour mettre en valeur le regard et la concentration.",
      imageKey: "football-americain-cadrages-gros-plan-visage",
    },
    {
      key: "football-americain-cadrages-plan-large-terrain",
      title: "Plan large terrain",
      description: "Plan large qui raconte le terrain, la profondeur de jeu et l’atmosphère du moment.",
      imageKey: "football-americain-cadrages-plan-large-terrain",
    },
  ],
  details: [
    {
      key: "football-americain-details-equipement",
      title: "Détail équipement : casque / ballon / gants",
      description: "Détail concret sur le casque, le ballon et les gants pour renforcer la signature du sport.",
      imageKey: "football-americain-details-equipement",
    },
  ],
  expressions: [],
  accessoires: [],
  creatif: [],
};

const footballAmericanVisualImagePaths: Record<string, string> = {
  "football-americain-poses-portrait-debout": "/moodboard/football-americain/01-portrait-debout-avec-ballon.jpg",
  "football-americain-poses-ballon-sous-le-bras": "/moodboard/football-americain/02-ballon-sous-le-bras.jpg",
  "football-americain-poses-portrait-34": "/moodboard/football-americain/03-portrait-trois-quarts-avec-casque.jpg",
  "football-americain-poses-assis-avec-equipement": "/moodboard/football-americain/04-portrait-assis-avec-equipement.jpg",
  "football-americain-actions-course-avec-ballon": "/moodboard/football-americain/05-course-avec-ballon.jpg",
  "football-americain-actions-lancer": "/moodboard/football-americain/06-lancer-du-quarterback.jpg",
  "football-americain-actions-reception": "/moodboard/football-americain/07-reception.jpg",
  "football-americain-actions-celebration": "/moodboard/football-americain/08-celebration.jpg",
  "football-americain-cadrages-joueur-entier": "/moodboard/football-americain/09-joueur-entier-en-situation.jpg",
  "football-americain-cadrages-gros-plan-visage": "/moodboard/football-americain/10-gros-plan-visage-casque.jpg",
  "football-americain-cadrages-plan-large-terrain": "/moodboard/football-americain/11-plan-large-terrain.jpg",
  "football-americain-details-equipement": "/moodboard/football-americain/12-detail-equipement-casque-ballon-gants.jpg",
};

const basketVisualReferencePack: Record<MoodboardCategoryKey, MoodboardReferencePackItem[]> = {
  poses: [
    {
      key: "basket-poses-portrait-debout",
      title: "Portrait debout avec ballon",
      description: "Portrait de présence, posture droite et ballon comme point de focus principal.",
      imageKey: "basket-poses-portrait-debout",
    },
    {
      key: "basket-poses-ballon-sous-le-bras",
      title: "Ballon sous le bras",
      description: "Pose simple et forte, avec le ballon retenu au niveau du torse pour une lecture nette.",
      imageKey: "basket-poses-ballon-sous-le-bras",
    },
    {
      key: "basket-poses-portrait-34",
      title: "Portrait 3/4",
      description: "Portrait en trois-quarts, regard porté et posture de mouvement très visible.",
      imageKey: "basket-poses-portrait-34",
    },
    {
      key: "basket-poses-assis-avec-ballon",
      title: "Portrait assis avec ballon",
      description: "Pose plus calme et maîtrisée, avec le ballon comme élément de signature.",
      imageKey: "basket-poses-assis-avec-ballon",
    },
  ],
  actions: [
    {
      key: "basket-actions-dribble",
      title: "Dribble et progression",
      description: "Séquence de dribble avec rythme, contrôle et fluidité dans le mouvement.",
      imageKey: "basket-actions-dribble",
    },
    {
      key: "basket-actions-tir",
      title: "Tir / shoot",
      description: "Action de tir avec l’engagement du corps et une intention très lisible.",
      imageKey: "basket-actions-tir",
    },
    {
      key: "basket-actions-passe",
      title: "Passe",
      description: "Moment de transmission du ballon, avec posture et timing très marqués.",
      imageKey: "basket-actions-passe",
    },
    {
      key: "basket-actions-celebration",
      title: "Célébration",
      description: "Instant d’émotion et de cohésion d’équipe, très fort visuellement.",
      imageKey: "basket-actions-celebration",
    },
  ],
  cadrages: [
    {
      key: "basket-cadrages-joueur-entier",
      title: "Joueur entier en situation",
      description: "Cadrage complet du joueur dans son environnement de jeu pour une lecture claire de la posture.",
      imageKey: "basket-cadrages-joueur-entier",
    },
    {
      key: "basket-cadrages-gros-plan-visage",
      title: "Gros plan visage",
      description: "Gros plan très serré sur le visage pour mettre en valeur le regard et l’intensité.",
      imageKey: "basket-cadrages-gros-plan-visage",
    },
    {
      key: "basket-cadrages-plan-large-terrain",
      title: "Plan large terrain",
      description: "Plan large qui raconte le terrain, la profondeur de jeu et l’ambiance du moment.",
      imageKey: "basket-cadrages-plan-large-terrain",
    },
  ],
  details: [
    {
      key: "basket-details-equipement",
      title: "Détail équipement : chaussures / ballon",
      description: "Détail concret sur les chaussures, le ballon ou le textile pour renforcer la signature du sport.",
      imageKey: "basket-details-equipement",
    },
  ],
  expressions: [],
  accessoires: [],
  creatif: [],
};

const basketVisualImagePaths: Record<string, string> = {
  "basket-poses-portrait-debout": "/moodboard/basket/01-portrait-debout-avec-ballon.jpg",
  "basket-poses-ballon-sous-le-bras": "/moodboard/basket/02-ballon-sous-le-bras.jpg",
  "basket-poses-portrait-34": "/moodboard/basket/03-portrait-trois-quarts.jpg",
  "basket-poses-assis-avec-ballon": "/moodboard/basket/04-portrait-assis-avec-ballon.jpg",
  "basket-actions-dribble": "/moodboard/basket/05-dribble-et-progression.jpg",
  "basket-actions-tir": "/moodboard/basket/06-tir-shoot.jpg",
  "basket-actions-passe": "/moodboard/basket/07-passe.jpg",
  "basket-actions-celebration": "/moodboard/basket/08-celebration.jpg",
  "basket-cadrages-joueur-entier": "/moodboard/basket/09-joueur-entier-en-situation.jpg",
  "basket-cadrages-gros-plan-visage": "/moodboard/basket/10-gros-plan-visage.jpg",
  "basket-cadrages-plan-large-terrain": "/moodboard/basket/11-plan-large-terrain.jpg",
  "basket-details-equipement": "/moodboard/basket/12-detail-equipement-chaussures-ballon.jpg",
};

const moodboardLibrary: Record<string, Record<MoodboardCategoryKey, MoodboardItemSet>> = {
  football: {
    poses: {
      base: ["Pose de réception avec regard porté vers l’objectif", "Pose de dribble compact et maîtrisé", "Pose de célébration sobre et forte"],
      byType: {
        "Portrait studio": ["Pose de confiance au centre du cadre, ballon au sol et posture très propre", "Pose de profil élégant avec regard porté et tenue nette"],
        "Action / performance": ["Pose d’accélération avec appui au sol et dynamique visible", "Pose d’enchaînement de dribble avec corps engagé"],
        "Réseaux sociaux": ["Pose verticale très lisible avec regard direct et énergie de match", "Pose de détail en close-up avec ballon et expression forte"],
        "Campagne publicitaire": ["Pose de marque, silhouette nette, posture premium et cohérence de branding"],
        "Lifestyle": ["Pose de préparation ou de récupération avec authenticité sportive"],
      },
    },
    actions: {
      base: ["Dribble court et rapide", "Passe décisive", "Concentration avant le geste"],
      byType: {
        "Action / performance": ["Course de rupture, contrôle de balle, finition rapide", "Pressing, contre-pressing et jeu de transition"],
        "Événement": ["Moment de célébration, ambiance de tribune, émotion collective"],
        "Réseaux sociaux": ["Action courte, fragmentée, très partageable"],
      },
    },
    cadrages: {
      base: ["Plan moyen pour l’intensité du jeu", "Gros plan sur le regard et l’émotion", "Plan large sur la profondeur du terrain"],
      byType: {
        "Portrait éditorial": ["Cadrage trois-quarts sur le visage, environnement de terrain en fond", "Plan très propre sur les épaules, la posture et le ballon"],
        "Portrait studio": ["Plan poitrine et plan très serré sur le regard", "Cadrage horizontal sur la silhouette et l’équipement"],
      },
    },
    details: {
      base: ["Laces du ballon, bandeau, maillot, protège-tibias", "Texture du terrain, traces de jeu, haute intensité"],
      byType: {
        "Shooting produit": ["Détail du maillot, du ballon, du protège-genou et du textile", "Vue de l’équipement en situation, très propre pour un lancement"],
      },
    },
    expressions: {
      base: ["Concentration totale", "Leader au moment du geste", "Énergie de groupe"],
      byType: {
        "Nouveau contrat / signature": ["Expression de sérieux, calme et présence", "Regard de confiance, posture stable"],
      },
    },
    accessoires: {
      base: ["Ballon, maillot, protège-tibias, gants", "Bandeau, cordes, chaussures"],
      byType: {
        "Lifestyle": ["Équipement de préparation, sac, bouteille, tenue de ville"],
      },
    },
    creatif: {
      base: ["Image de terrain à l’aube, lumière naturelle ultra graphique", "Narratif entre préparation et match"],
      byType: {
        "Réseaux sociaux": ["Montage rapide, transitions dynamiques, visuel de boucle", "Visuals de story avec bascules de couleur et cadre vertical"],
        "Campagne publicitaire": ["Ambiance de club, identité visuelle, présence de marque"],
      },
    },
  },
  basketball: {
    poses: {
      base: ["Pose d’élan avec regard porté", "Pose de mouvement au tir", "Pose au rebond avec ligne du corps forte"],
      byType: {
        "Action / performance": ["Pose de lancement, jambe d’appui, bras tendu", "Pose de prise à l’air pour une image très dynamique"],
        "Portrait éditorial": ["Pose statique, élégante, très graphique avec le ballon"],
      },
    },
    actions: {
      base: ["Drive, tir, passe", "Transition rapide", "Rebond"],
      byType: {
        "Réseaux sociaux": ["Action courte, accélération, lumière urbaine"],
      },
    },
    cadrages: {
      base: ["Plan large sur le terrain", "Plan moyen sur les lignes du corps", "Gros plan sur le regard"],
      byType: {
        "Portrait studio": ["Cadrage très propre sur la posture et le maillot", "Plan poitrine avec fond neutre"],
      },
    },
    details: {
      base: ["Ballon, chaussures, raquette de basket?", "Doigts, mains, texture du cuir"],
      byType: {
        "Shooting produit": ["Détail du maillot, du ballon et de la texture du textile"],
      },
    },
    expressions: {
      base: ["Concentration, détermination, leadership"],
      byType: { "Campagne publicitaire": ["Expression de star, calme et posture de marque"] },
    },
    accessoires: {
      base: ["Ballon, chaussures, maillot, bandeau"],
      byType: { "Lifestyle": ["Équipement de préparation, hoodie, sac de sport"] },
    },
    creatif: {
      base: ["Terrain, couloirs, gymnase, ambiance nocturne", "Transition entre jeu et identité de ville"],
      byType: { "Événement": ["Ambiance de salle, tribunes, lumière de match"] },
    },
  },
  hockey: {
    poses: {
      base: ["Pose de charge, posture basse et forte", "Pose de glisse avec regard porté", "Pose de progression et d’énergie"],
      byType: {
        "Action / performance": ["Pose d’accélération, patins en mouvement, geste d’attaque", "Pose de défense ou d’enchaînement avec hockey-stick"],
      },
    },
    actions: {
      base: ["Glissade, tir, passe, contact", "Tempo de jeu et combat"],
      byType: { "Réseaux sociaux": ["Séquences courtes et très énergétiques"] },
    },
    cadrages: {
      base: ["Plan large sur la glace", "Plan moyen sur la posture", "Gros plan sur le regard et le stick"],
      byType: { "Portrait éditorial": ["Cadrage très graphique sur l’équipement et la vitesse"] },
    },
    details: {
      base: ["Patins, bâton, glace, protections", "Équipement très technique"],
      byType: { "Shooting produit": ["Détail du stick, du casque, de la protection, du textile"] },
    },
    expressions: {
      base: ["Concentration intense", "Force tranquille", "Énergie de combat"],
      byType: { "Campagne publicitaire": ["Expression de leader, d’équipe et de discipline"] },
    },
    accessoires: {
      base: ["Bâton, casque, patins, protections"],
      byType: { "Lifestyle": ["Combinaison de transition, équipement de préparation"] },
    },
    creatif: {
      base: ["Glace, lumière froide, ambiance d’arène", "Énergie de match"],
      byType: { "Événement": ["Ambiance tribunes, foule, moment de victoire"] },
    },
  },
  tennis: {
    poses: {
      base: ["Pose de préparation au service", "Pose de réception très propre", "Pose de contrôle de la raquette"],
      byType: {
        "Portrait studio": ["Pose élégante et sobre avec raquette, calme et posture maîtrisée"],
        "Action / performance": ["Pose d’impact, de swing et de suivi du geste"],
      },
    },
    actions: {
      base: ["Service, coup droit, revers", "Transition entre vitesse et contrôle"],
      byType: { "Réseaux sociaux": ["Action courte, fluidité, énergie, coup de raquette"] },
    },
    cadrages: {
      base: ["Plan large sur le court", "Plan moyen sur le geste", "Gros plan sur la raquette et le visage"],
      byType: { "Portrait éditorial": ["Cadrage très graphique sur la silhouette et les lignes du court"] },
    },
    details: {
      base: ["Raquette, corde, tenue, chaussures", "Détails de surface et de mouvement"],
      byType: { "Shooting produit": ["Détail de la raquette, du grip et des textures"], },
    },
    expressions: {
      base: ["Concentration, calme, confiance", "Énergie de compétition"],
      byType: { "Nouveau contrat / signature": ["Expression stable, professionnelle, très élégante"] },
    },
    accessoires: {
      base: ["Raquette, balle, chaussures, survêtement"],
      byType: { "Lifestyle": ["Équipement de préparation, sac, tenue de ville"] },
    },
    creatif: {
      base: ["Court, lumière naturelle, lignes nettes, architecture du club", "Équilibre entre performance et élégance"],
      byType: { "Campagne publicitaire": ["Visuel très premium, très propre, très marque"], },
    },
  },
  athletisme: {
    poses: {
      base: ["Pose d’élan sur la piste", "Pose de transition avant l’effort", "Pose de performance avec regard porté"],
      byType: {
        "Action / performance": ["Pose de sprint, de saut ou de lancer avec intensité visible", "Pose de suspension pour l’effort technique"],
        "Portrait studio": ["Pose très graphique et légère, avec une ligne de corps propre"],
      },
    },
    actions: {
      base: ["Sprint, saut, relais, lancer", "Transition entre préparation et performance"],
      byType: { "Réseaux sociaux": ["Action courte très fluide et très dynamique"] },
    },
    cadrages: {
      base: ["Plan très large sur la piste", "Plan moyen sur le mouvement", "Gros plan sur la technique"],
      byType: { "Portrait éditorial": ["Cadrage sur la ligne du corps et l’espace de course"] },
    },
    details: {
      base: ["Chaussures, piste, timing, posture", "Détails de la technique et de l’équipement"],
      byType: { "Shooting produit": ["Détail de la chaussure, du textile et de l’équipement de performance"] },
    },
    expressions: {
      base: ["Concentration, discipline, ambition"],
      byType: { "Campagne publicitaire": ["Expression de détermination et d’excellence"] },
    },
    accessoires: {
      base: ["Chaussures, dossard, équipement de piste"],
      byType: { "Lifestyle": ["Équipement de préparation, tenue confort, accessoires de routine"] },
    },
    creatif: {
      base: ["Piste, lignes, lumière du matin, environnement sportif", "Énergie de performance pure"],
      byType: { "Événement": ["Ambiance de rencontre, compétition, émotion de course"] },
    },
  },
  footballAmericain: {
    poses: {
      base: ["Pose en stance, épaules ouvertes et regard fixé", "Pose de réception ou d’attaque avec énergie visible", "Pose de leadership avec casque et gants"],
      byType: {
        "Action / performance": ["Pose d’accélération, de blocage ou d’enchaînement de course", "Pose de réception, de sprint ou de contact avec une ligne de corps forte"],
        "Portrait studio": ["Pose très structurée avec casque, maillot et posture premium", "Pose de confiance, calme et très graphique"],
        "Réseaux sociaux": ["Pose de close-up avec casque, regard direct et énergie de match"],
        "Campagne publicitaire": ["Pose de marque, posture forte, silhouette très lisible et très impactante"],
      },
    },
    actions: {
      base: ["Snap, course, réception, plaquage, sprint", "Transition de jeu, énergie de groupe et moments de pression"],
      byType: {
        "Action / performance": ["Course vers la zone, prise de balle, contact, célébration de touchdown"],
        "Événement": ["Ambiance de stade, tribunes, lumière de nuit, moment de match"],
      },
    },
    cadrages: {
      base: ["Plan large sur le terrain et le repère de jeu", "Plan moyen sur la posture et l’équipement", "Gros plan sur le regard et les protections"],
      byType: {
        "Portrait éditorial": ["Cadrage trois-quarts avec casque, épaulières et profondeur de terrain", "Plan serré qui valorise la puissance du regard et du corps"],
        "Portrait studio": ["Cadrage très propre sur la silhouette, le casque et les détails du maillot"],
      },
    },
    details: {
      base: ["Casque, épaulières, gants, protège-dents, lacets, maillot", "Textures du matériel, cuir, matière synthétique, lignes de jeu"],
      byType: {
        "Shooting produit": ["Détail du casque, du protège-dents, du textile et du matériel de jeu", "Vue très propre des équipements en situation ou en composition premium"],
      },
    },
    expressions: {
      base: ["Concentration, dureté, esprit d’équipe", "Présence de leader au moment du jeu"],
      byType: {
        "Nouveau contrat / signature": ["Expression de sérieux, stabilité et leadership", "Regard de confiance et posture professionnelle"],
      },
    },
    accessoires: {
      base: ["Casque, gants, protège-dents, épaulières, ballon, équipement de protection"],
      byType: {
        "Lifestyle": ["Tenue de préparation, accessoires de route, hoodie, sac de sport"],
        "Réseaux sociaux": ["Accessoires de gameplay, casque, gants, accessoires de club"],
      },
    },
    creatif: {
      base: ["Stade, tunnel, sortie de vestiaire, lumière nocturne, ambiance de match", "Narratif entre préparation, esprit d’équipe et performance"],
      byType: {
        "Campagne publicitaire": ["Image de marque très forte, silhouette très lisible, ambiance de club"],
        "Événement": ["Ambiance tribune, foule, énergie vendredi soir, moment de victoire"],
      },
    },
  },
};

const moodboardLibraryByDomain: Record<string, Record<string, Record<MoodboardCategoryKey, MoodboardItemSet>>> = {
  sport: {
    football: {
      poses: { base: ["Pose de réception avec regard porté vers l’objectif", "Pose de dribble compact et maîtrisé", "Pose de célébration sobre et forte"] },
      actions: { base: ["Dribble court et rapide", "Passe décisive", "Concentration avant le geste"] },
      cadrages: { base: ["Plan moyen pour l’intensité du jeu", "Gros plan sur le regard et l’émotion", "Plan large sur la profondeur du terrain"] },
      details: { base: ["Laces du ballon, bandeau, maillot, protège-tibias", "Texture du terrain, traces de jeu, haute intensité"] },
      expressions: { base: ["Concentration totale", "Leader au moment du geste", "Énergie de groupe"] },
      accessoires: { base: ["Ballon, maillot, protège-tibias, gants", "Bandeau, cordes, chaussures"] },
      creatif: { base: ["Image de terrain à l’aube, lumière naturelle ultra graphique", "Narratif entre préparation et match"] },
    },
    footballAmericain: {
      poses: { base: ["Pose en stance, épaules ouvertes et regard fixé", "Pose de réception ou d’attaque avec énergie visible", "Pose de leadership avec casque et gants"] },
      actions: { base: ["Snap, course, réception, plaquage, sprint", "Transition de jeu, énergie de groupe et moments de pression"] },
      cadrages: { base: ["Plan large sur le terrain et le repère de jeu", "Plan moyen sur la posture et l’équipement", "Gros plan sur le regard et les protections"] },
      details: { base: ["Casque, épaulières, gants, protège-dents, lacets, maillot", "Textures du matériel, cuir, matière synthétique, lignes de jeu"] },
      expressions: { base: ["Concentration, dureté, esprit d’équipe", "Présence de leader au moment du jeu"] },
      accessoires: { base: ["Casque, gants, protège-dents, épaulières, ballon, équipement de protection"] },
      creatif: { base: ["Stade, tunnel, sortie de vestiaire, lumière nocturne, ambiance de match", "Narratif entre préparation, esprit d’équipe et performance"] },
    },
    basketball: {
      poses: { base: ["Pose d’élan avec regard porté", "Pose de mouvement au tir", "Pose au rebond avec ligne du corps forte"] },
      actions: { base: ["Drive, tir, passe", "Transition rapide", "Rebond"] },
      cadrages: { base: ["Plan large sur le terrain", "Plan moyen sur les lignes du corps", "Gros plan sur le regard"] },
      details: { base: ["Ballon, chaussures, maillot, texture du cuir", "Doigts, mains, énergie du geste"] },
      expressions: { base: ["Concentration, détermination, leadership"] },
      accessoires: { base: ["Ballon, chaussures, maillot, bandeau"] },
      creatif: { base: ["Terrain, couloirs, gymnase, ambiance nocturne", "Transition entre jeu et identité de ville"] },
    },
    hockey: {
      poses: { base: ["Pose de charge, posture basse et forte", "Pose de glisse avec regard porté", "Pose de progression et d’énergie"] },
      actions: { base: ["Glissade, tir, passe, contact", "Tempo de jeu et combat"] },
      cadrages: { base: ["Plan large sur la glace", "Plan moyen sur la posture", "Gros plan sur le regard et le stick"] },
      details: { base: ["Patins, bâton, glace, protections", "Équipement très technique"] },
      expressions: { base: ["Concentration intense", "Force tranquille", "Énergie de combat"] },
      accessoires: { base: ["Bâton, casque, patins, protections"] },
      creatif: { base: ["Glace, lumière froide, ambiance d’arène", "Énergie de match"] },
    },
    tennis: {
      poses: { base: ["Pose de préparation au service", "Pose de réception très propre", "Pose de contrôle de la raquette"] },
      actions: { base: ["Service, coup droit, revers", "Transition entre vitesse et contrôle"] },
      cadrages: { base: ["Plan large sur le court", "Plan moyen sur le geste", "Gros plan sur la raquette et le visage"] },
      details: { base: ["Raquette, corde, tenue, chaussures", "Détails de surface et de mouvement"] },
      expressions: { base: ["Concentration, calme, confiance", "Énergie de compétition"] },
      accessoires: { base: ["Raquette, balle, chaussures, survêtement"] },
      creatif: { base: ["Court, lumière naturelle, lignes nettes, architecture du club", "Équilibre entre performance et élégance"] },
    },
    athletisme: {
      poses: { base: ["Pose d’élan sur la piste", "Pose de transition avant l’effort", "Pose de performance avec regard porté"] },
      actions: { base: ["Sprint, saut, relais, lancer", "Transition entre préparation et performance"] },
      cadrages: { base: ["Plan très large sur la piste", "Plan moyen sur le mouvement", "Gros plan sur la technique"] },
      details: { base: ["Chaussures, piste, timing, posture", "Détails de la technique et de l’équipement"] },
      expressions: { base: ["Concentration, discipline, ambition"] },
      accessoires: { base: ["Chaussures, dossard, équipement de piste"] },
      creatif: { base: ["Piste, lignes, lumière du matin, environnement sportif", "Énergie de performance pure"] },
    },
    autre: {
      poses: { base: ["Pose de présence simple, lisible et forte", "Pose de mouvement adaptée à la discipline", "Pose de détail pour mettre en valeur la signature"] },
      actions: { base: ["Action d’entraînement", "Transition entre préparation et performance", "Moment clé de l’activité"] },
      cadrages: { base: ["Plan large pour l’environnement", "Plan moyen pour la posture", "Gros plan pour l’expression"] },
      details: { base: ["Équipement, texture, matière, geste technique", "Détail de la discipline ou du contexte"] },
      expressions: { base: ["Concentration", "Énergie", "Présence"] },
      accessoires: { base: ["Équipement de sport", "Accessoires de préparation", "Détails de marque"] },
      creatif: { base: ["Ambiance visuelle cohérente", "Direction artistique sobre et premium", "Narratif de performance"] },
    },
  },
  portrait: {
    portraitCorporate: {
      poses: { base: ["Pose de présence calme et assurée", "Pose de discussion avec regard franc", "Pose de leadership et de confiance"] },
      actions: { base: ["Échange, écoute, pause de présence", "Moment de réflexion", "Transition entre naturel et posture"] },
      cadrages: { base: ["Portrait serré", "Plan trois-quarts", "Plan large de contexte"] },
      details: { base: ["Regard, posture, texture du vêtement", "Éléments de signature personnelle"] },
      expressions: { base: ["Confiance", "Calme", "Autorité"] },
      accessoires: { base: ["Vêtement, accessoire de marque", "Éléments de bureau ou d’environnement"] },
      creatif: { base: ["Lumière sculptée", "Composition sobre", "Identité visuelle claire"] },
    },
    autre: {
      poses: { base: ["Pose de présence", "Pose de calme", "Pose de pouvoir"] },
      actions: { base: ["Mouvement naturel", "Pause", "Échange"] },
      cadrages: { base: ["Portrait serré", "Plan moyen", "Plan de contexte"] },
      details: { base: ["Détails du visage", "Texture", "Éléments de style"] },
      expressions: { base: ["Émotion", "Confiance", "Authenticité"] },
      accessoires: { base: ["Accessoires de style", "Éléments de contexte", "Vêtement"] },
      creatif: { base: ["Ambiance visuelle premium", "Direction artistique simple", "Narratif émotionnel"] },
    },
  },
  mariage: {
    autre: {
      poses: { base: ["Pose de couple élégante", "Pose de mouvement pendant la cérémonie", "Pose de célébration en groupe"] },
      actions: { base: ["Arrivée", "Cérémonie", "Réception"] },
      cadrages: { base: ["Plan large sur le lieu", "Portrait intime", "Gros plan sur les émotions"] },
      details: { base: ["Robes, fleurs, alliance, lumière", "Textures et décor"] },
      expressions: { base: ["Joie", "Émotion", "Élégance"] },
      accessoires: { base: ["Fleurs", "Alliance", "Vêtements"] },
      creatif: { base: ["Lumière dorée", "Narratif émotionnel", "Élégance romantique"] },
    },
  },
  gastronomie: {
    autre: {
      poses: { base: ["Composition de plat soignée", "Mise en scène naturelle", "Pose de service ou de dégustation"] },
      actions: { base: ["Préparation", "Service", "Dégustation"] },
      cadrages: { base: ["Plan détaillé", "Plan de préparation", "Plan d’ambiance de salle"] },
      details: { base: ["Textures, matières, lumière sur le plat", "Détails de service"] },
      expressions: { base: ["Appétit", "Émotion", "Séduction"] },
      accessoires: { base: ["Vaisselle", "Ingrédients", "Équipements de cuisine"] },
      creatif: { base: ["Lumière chaude", "Composition de produit", "Ambiance premium"] },
    },
  },
  corporate: {
    autre: {
      poses: { base: ["Pose de leadership", "Pose d’échange", "Pose de présence de marque"] },
      actions: { base: ["Présentation", "Échange", "Réunion"] },
      cadrages: { base: ["Portrait corporate", "Plan de groupe", "Plan de contexte"] },
      details: { base: ["Vêtement, bureau, objet de marque", "Détails d’environnement"] },
      expressions: { base: ["Confiance", "Sérieux", "Professionnalisme"] },
      accessoires: { base: ["Accessoires de marque", "Équipement de bureau", "Éléments de présentation"] },
      creatif: { base: ["Composition sobre", "Lumière claire", "Identité visuelle forte"] },
    },
  },
  mode: {
    autre: {
      poses: { base: ["Pose de silhouette", "Pose de mouvement", "Pose de présence éditoriale"] },
      actions: { base: ["Déplacement", "Mouvement de tenue", "Transition"] },
      cadrages: { base: ["Plan large", "Portrait éditorial", "Plan détail"] },
      details: { base: ["Texture du vêtement", "Accessoire", "Ligne de silhouette"] },
      expressions: { base: ["Élégance", "Modernité", "Charisme"] },
      accessoires: { base: ["Vêtement", "Chaussures", "Bijoux"] },
      creatif: { base: ["Composition sculptée", "Palette raffinée", "Esthétique de marque"] },
    },
  },
  evenement: {
    autre: {
      poses: { base: ["Pose de présence", "Pose d’échange", "Pose de groupe"] },
      actions: { base: ["Arrivée", "Émotion", "Interaction"] },
      cadrages: { base: ["Plan large sur l’événement", "Portrait en mouvement", "Gros plan sur les réactions"] },
      details: { base: ["Détails émotionnels", "Décor", "Ambiance"] },
      expressions: { base: ["Joie", "Énergie", "Émotion"] },
      accessoires: { base: ["Éléments de décor", "Accessoires de soirée", "Équipement d’événement"] },
      creatif: { base: ["Ambiance vivante", "Narratif social", "Énergie de moment"] },
    },
  },
  immobilier: {
    autre: {
      poses: { base: ["Composition de l’espace", "Point de vue architectural", "Perspective de profondeur"] },
      actions: { base: ["Entrée", "Déplacement dans l’espace", "Observation"] },
      cadrages: { base: ["Plan large", "Plan de détail", "Plan de perspective"] },
      details: { base: ["Matériaux", "Lumière", "Détails d’architecture"] },
      expressions: { base: ["Équilibre", "Luxe", "Calme"] },
      accessoires: { base: ["Mobilier", "Objets de décoration", "Éléments d’architecture"] },
      creatif: { base: ["Ligne architecturale", "Jouer la lumière", "Composition élégante"] },
    },
  },
  reseaux: {
    autre: {
      poses: { base: ["Pose nette et lisible", "Pose de détail très social", "Pose de mouvement rapide"] },
      actions: { base: ["Transition", "Capture instantanée", "Story courte"] },
      cadrages: { base: ["Vertical", "Carré", "Plan très focalisé"] },
      details: { base: ["Élément de signature", "Détail haut impact", "Texte ou identité"] },
      expressions: { base: ["Énergie", "Authenticité", "Modernité"] },
      accessoires: { base: ["Éléments de marque", "Accessoires de contenu", "Détails visuels"] },
      creatif: { base: ["Rythme éditorial", "Formats courts", "Cohérence visuelle"] },
    },
  },
  autre: {
    autre: {
      poses: { base: ["Pose de présence", "Pose de simplicité", "Pose de caractère"] },
      actions: { base: ["Élément de mouvement", "Transition", "Moment clé"] },
      cadrages: { base: ["Plan large", "Plan moyen", "Gros plan"] },
      details: { base: ["Détail de signature", "Élément de contexte", "Texture"] },
      expressions: { base: ["Authenticité", "Émotion", "Présence"] },
      accessoires: { base: ["Éléments de style", "Accessoires de contexte", "Objets de marque"] },
      creatif: { base: ["Direction artistique ouverte", "Composition simple", "Narratif minimal"] },
    },
  },
};

const getSportLabel = (sportKey: string): string => {
  switch (sportKey) {
    case "footballAmericain":
      return "Football américain";
    case "football":
      return "Football";
    case "basketball":
      return "Basketball";
    case "hockey":
      return "Hockey";
    case "tennis":
      return "Tennis";
    case "athletisme":
      return "Athlétisme";
    default:
      return "Sport";
  }
};

const normalizeDomainKey = (domain: string): string => {
  const normalized = normalize(domain).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("sport")) return "sport";
  if (normalized.includes("portrait")) return "portrait";
  if (normalized.includes("mariage")) return "mariage";
  if (normalized.includes("gastr")) return "gastronomie";
  if (normalized.includes("corpor")) return "corporate";
  if (normalized.includes("mode") || normalized.includes("editorial")) return "mode";
  if (normalized.includes("evenement") || normalized.includes("event")) return "evenement";
  if (normalized.includes("immobilier") || normalized.includes("architecture")) return "immobilier";
  if (normalized.includes("reseau") || normalized.includes("social")) return "reseaux";
  return "autre";
};

const normalizeDisciplineKey = (discipline: string): string => {
  const normalized = normalize(discipline).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("football americain") || normalized.includes("american football")) return "footballAmericain";
  if (normalized.includes("football") || normalized.includes("soccer")) return "football";
  if (normalized.includes("basket") || normalized.includes("basketball")) return "basketball";
  if (normalized.includes("hockey")) return "hockey";
  if (normalized.includes("tennis")) return "tennis";
  if (normalized.includes("athlet") || normalized.includes("athletics")) return "athletisme";
  if (normalized.includes("portrait corporate")) return "portraitCorporate";
  if (normalized.includes("portrait editorial")) return "portraitEditorial";
  if (normalized.includes("portrait de marque")) return "portraitMarque";
  if (normalized.includes("portrait artistique")) return "portraitArtistique";
  if (normalized.includes("autre")) return "autre";
  return normalized.replace(/[^a-z0-9]+/g, "");
};

const getDomainLabel = (domain: string): string => {
  switch (normalizeDomainKey(domain)) {
    case "sport": return "Sport";
    case "portrait": return "Portrait";
    case "mariage": return "Mariage";
    case "gastronomie": return "Gastronomie";
    case "corporate": return "Corporate";
    case "mode": return "Mode / éditorial";
    case "evenement": return "Événement";
    case "immobilier": return "Immobilier / architecture";
    case "reseaux": return "Réseaux sociaux";
    default: return "Autre";
  }
};

const getDisciplineDisplayLabel = (domain: string, discipline: string): string => {
  if (normalizeDomainKey(domain) === "sport") {
    return getSportLabel(normalizeDisciplineKey(discipline));
  }
  return discipline || "Autre";
};


const getMoodboardSections = (domain: string, discipline: string, shootingType: string): StructuredMoodboardSection[] => {
  const domainKey = normalizeDomainKey(domain);
  const disciplineKey = normalizeDisciplineKey(discipline);
  const domainLibrary = moodboardLibraryByDomain[domainKey];
  const library = domainLibrary?.[disciplineKey] ?? domainLibrary?.autre ?? null;

  if (!library) {
    return [];
  }

  const categories = (Object.entries(categoryLabels) as Array<[MoodboardCategoryKey, string]>).map(([key, title]) => {
    const isVisualPackSport = domainKey === "sport" && (disciplineKey === "football" || disciplineKey === "footballAmericain" || disciplineKey === "basketball");
    const packItems = isVisualPackSport
      ? (disciplineKey === "footballAmericain"
          ? footballAmericanVisualReferencePack[key] ?? []
          : disciplineKey === "basketball"
            ? basketVisualReferencePack[key] ?? []
            : footballVisualReferencePack[key] ?? [])
      : [];

    const references = packItems.length
      ? packItems.map((item) => ({
          key: item.key,
          title: item.title,
          description: item.description,
          image: item.imageKey
            ? (disciplineKey === "footballAmericain"
                ? footballAmericanVisualImagePaths[item.imageKey]
                : disciplineKey === "basketball"
                  ? basketVisualImagePaths[item.imageKey]
                  : footballVisualImagePaths[item.imageKey])
            : undefined,
          imageKey: item.imageKey,
          category: title,
        } satisfies MoodboardReference))
      : (() => {
          const set = library[key];
          const items = set?.byType?.[shootingType] ?? set?.base ?? [];

          return items
            .map((item, index) => {
              const cleaned = item.trim();

              return {
                key: `${key}-${index}`,
                title: cleaned.length > 40 ? `${title} ${index + 1}` : cleaned,
                description: cleaned,
                category: title,
              } satisfies MoodboardReference;
            })
            .filter((item): item is MoodboardReference => Boolean(item));
        })();

    return {
      key,
      title,
      items: references,
    };
  }).filter((category) => {
    if (!category.items.length) {
      return false;
    }

    if (domainKey === "sport" && (disciplineKey === "football" || disciplineKey === "footballAmericain" || disciplineKey === "basketball")) {
      const packItems = disciplineKey === "footballAmericain"
        ? footballAmericanVisualReferencePack[category.key as MoodboardCategoryKey] ?? []
        : disciplineKey === "basketball"
          ? basketVisualReferencePack[category.key as MoodboardCategoryKey] ?? []
          : footballVisualReferencePack[category.key as MoodboardCategoryKey] ?? [];
      return packItems.length > 0;
    }

    return true;
  });

  if (!categories.length) {
    return [];
  }

  return [
    {
      domain: getDomainLabel(domain),
      discipline: getDisciplineDisplayLabel(domain, discipline),
      categories,
    },
  ];
};

export const buildDraft = (payload: {
  mode: AssistantMode;
  athleteName: string;
  athleteSport: string;
  photographyDomain: string;
  shootingType: string;
  objective: string;
  location: string;
  context: string;
  constraints: string;
}): AssistantDraft => {
  const subjectLabel = payload.mode === "klique" ? payload.athleteName : `${payload.athleteName} (sportif / sujet externe)`;
  const sportLabel = payload.athleteSport || "sport ou discipline";
  const typeLabel = payload.shootingType || "Portrait sportif";
  const objectiveLabel = payload.objective || "mettre en valeur la présence";
  const locationLabel = payload.location || "lieu de shooting";
  const contextLabel = payload.context || "campagne ou contenu";
  const constraintsLabel = payload.constraints || "temps, lumière, logistique";
  const strategy = getTypeStrategy({
    type: typeLabel,
    sport: sportLabel,
    objective: objectiveLabel,
    location: locationLabel,
    context: contextLabel,
    constraints: constraintsLabel,
    domain: payload.photographyDomain,
  });
  const structuredMoodboard = getMoodboardSections(payload.photographyDomain || "Sport", payload.athleteSport || "Sport", typeLabel);

  return {
    preparation: [
      `Préparer un brief de ${typeLabel.toLowerCase()} autour de ${subjectLabel} avec une ligne visuelle premium, sobre et cohérente avec ${sportLabel}.`,
      `Structurer la séance autour de ${objectiveLabel.toLowerCase()} en donnant priorité à la présence, à la clarté du message et à la force de l’image.`,
      `Adapter le plan de travail à ${locationLabel.toLowerCase()} et au contexte ${contextLabel.toLowerCase()} en respectant ces contraintes : ${constraintsLabel.toLowerCase()}.`,
      ...strategy.preparation,
    ],
    strategy: strategy.strategy,
    installation: strategy.installation,
    deroule: strategy.deroule,
    shotlist: [
      `Prise 0 — plan principal et cadrage fort pour ${typeLabel.toLowerCase()} avec mise en valeur de ${sportLabel}.`,
      `Prise 1 — plan de contexte pour montrer le lieu, l’environnement ou la dynamique du moment à ${locationLabel.toLowerCase()}.`,
      `Prise 2 — plan de détail sur le geste, l’équipement, l’expression ou la texture pour renforcer l’identité du sujet.`,
      `Prise 3 — image de signature, propre et immédiatement exploitable pour ${contextLabel.toLowerCase()}.`,
      ...strategy.shotlist,
    ],
    poses: [
      `Pose de présence — posture nette, regard franc et ligne du corps maîtrisée.`,
      `Pose d’usage — énergie, rythme et cohérence avec ${sportLabel} et ${typeLabel.toLowerCase()}.`,
      `Pose de détail — geste, accessoire, matière ou expression à la fois naturelle et premium.`,
      ...strategy.poses,
    ],
    formats: strategy.formats,
    moodboard: [
      ...strategy.moodboard,
      `Palette KLIQUE : noir, blanc et accents jaunes chauds pour une image premium et distinctive.`,
      `Direction artistique : équilibre entre authenticité, élégance, modernité et impact.`,
      `Éléments visuels : lumière maîtrisée, texture, contexte, posture et cohérence de marque.`,
    ],
    structuredMoodboard,
  };
};

const shootingTypes: ShootingTypeOption[] = [
  { value: "Portrait sportif", label: "Portrait sportif" },
  { value: "Portrait éditorial", label: "Portrait éditorial" },
  { value: "Portrait studio", label: "Portrait studio" },
  { value: "Action / performance", label: "Action / performance" },
  { value: "Lifestyle", label: "Lifestyle" },
  { value: "Réseaux sociaux", label: "Réseaux sociaux" },
  { value: "Campagne publicitaire", label: "Campagne publicitaire" },
  { value: "Nouveau contrat / signature", label: "Nouveau contrat / signature" },
  { value: "Équipe / collectif", label: "Équipe / collectif" },
  { value: "Événement", label: "Événement" },
  { value: "Shooting produit", label: "Shooting produit" },
  { value: "Autre", label: "Autre" },
];

const palette = {
  accent: "#fbbf24",
  accentStrong: "#f59e0b",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  surface: "#fffdf8",
  surfaceAlt: "#fef3c7",
};

const parseDurationMinutes = (constraints: string): number => {
  const match = normalize(constraints).match(/(\d+)\s*(min|minute|minutes|m)/i);
  if (match) {
    return Number(match[1]);
  }

  if (/1h|heure|hour/i.test(constraints)) {
    return 60;
  }

  return 30;
};

const getLocationMode = (location: string) => {
  const value = normalize(location).toLowerCase();
  if (value.includes("studio")) return "studio";
  if (value.includes("stade")) return "stade";
  if (value.includes("terrain")) return "terrain";
  if (value.includes("ext") || value.includes("urbain")) return "exterieur";
  if (value.includes("salle") || value.includes("interieur") || value.includes("domicile")) return "interieur";
  return "mixte";
};

const getContextMode = (context: string, objective: string) => {
  const value = `${normalize(context)} ${normalize(objective)}`.toLowerCase();
  if (/réseaux|social|reels|story|post|instagram/i.test(value)) return "social";
  if (/presse|communication|site|web|portfolio|press/i.test(value)) return "communication";
  if (/campagne|branding|identité|marque|publicit|signature|contrat/i.test(value)) return "marque";
  return "portrait";
};

const getTypeMode = (type: string) => {
  const value = normalize(type).toLowerCase();
  if (/action|performance/i.test(value)) return "action";
  if (/lifestyle/i.test(value)) return "lifestyle";
  if (/réseaux|social/i.test(value)) return "social";
  if (/studio/i.test(value)) return "studio";
  if (/portrait/i.test(value)) return "portrait";
  if (/campagne|publicitaire|signature|équipe|collectif|événement|produit/i.test(value)) return "marque";
  return "portrait";
};

const getConstraintFlags = (constraints: string) => {
  const value = normalize(constraints).toLowerCase();
  return {
    naturalLight: /lumière naturelle|naturelle|soleil|daylight|sun/i.test(value),
    controlledLight: /lumière douce|fond blanc|studio|soft|flash|contrôlée|flash/i.test(value),
    quickTurnaround: /30|min|45|60|minutes|heure|rapid/i.test(value),
    stylisme: /stylisme|costume|tenue|maillot|équipement|accessoire/i.test(value),
    equipment: /matériel|flash|trépied|objectif|appareil|caméra|camera/i.test(value),
  };
};

const getSportSpecificDetails = (sport: string) => {
  const value = normalize(sport).toLowerCase();
  if (value.includes("football americain") || value.includes("american football")) {
    return { noun: "casque, gants et protections", action: "stance, réception et course", locationElements: "terrain, lignes, vestiaire, tribunes" };
  }
  if (value.includes("football") || value.includes("soccer")) {
    return { noun: "ballon, chaussures et maillot", action: "conduite de balle, marche et frappe", locationElements: "but, lignes du terrain, gazon, tribunes" };
  }
  if (value.includes("basket") || value.includes("basketball")) {
    return { noun: "ballon, chaussures et maillot", action: "dribble, tir et rebond", locationElements: "panneau, ligne de lancer franc, parquet" };
  }
  if (value.includes("hockey")) {
    return { noun: "bâton, patins et protections", action: "glissade et tir", locationElements: "glace, zone de jeu, banc" };
  }
  if (value.includes("tennis")) {
    return { noun: "raquette, balle et chaussures", action: "service et revers", locationElements: "court, filet, lignes" };
  }
  if (value.includes("athl") || value.includes("athletics")) {
    return { noun: "dossard, chaussures et piste", action: "sprint, saut et élan", locationElements: "piste, couloir, ligne de départ" };
  }
  return { noun: "équipement de sport et tenue", action: "mouvement de discipline", locationElements: "espace de pratique et fond clair" };
};

const getTypeStrategy = (payload: {
  type: string;
  sport: string;
  objective: string;
  location: string;
  context: string;
  constraints: string;
  domain: string;
}) => {
  const sportLabel = payload.sport || "sport ou discipline";
  const objectiveLabel = payload.objective || "mettre en valeur la présence";
  const locationLabel = payload.location || "lieu de shooting";
  const contextLabel = payload.context || "campagne ou contenu";
  const constraintsLabel = payload.constraints || "temps et logistique";
  const typeMode = getTypeMode(payload.type);
  const contextMode = getContextMode(contextLabel, objectiveLabel);
  const locationMode = getLocationMode(locationLabel);
  const constraints = getConstraintFlags(constraintsLabel);
  const duration = parseDurationMinutes(constraintsLabel);
  const sportDetails = getSportSpecificDetails(sportLabel);

  const strategy = [
    typeMode === "lifestyle"
      ? `Le plan de séance doit garder ${sportLabel.toLowerCase()} en arrière-plan de l’identité, avec un récit centré sur la spontanéité, la personnalité et la narration.`
      : `Le plan de séance doit mettre en avant ${sportLabel.toLowerCase()} avec un récit visuel construit autour de ${objectiveLabel.toLowerCase()} et de ${contextLabel.toLowerCase()}.`,
    typeMode === "action"
      ? "L’intensité du mouvement doit guider la séquence, avec un souci de clarté et d’anticipation."
      : typeMode === "lifestyle"
        ? "L’authenticité doit dominer, avec des gestes naturels, des transitions fluides et une vraie spontanéité."
        : typeMode === "social"
          ? "Les prises doivent être très lisibles et immédiatement partageables, avec une forte cohérence de rythme."
          : typeMode === "portrait"
            ? "La présence du sujet doit être claire, graphique et immédiatement exploitable pour le contexte choisi."
            : "La présence du sujet doit être claire, forte et immédiatement exploitable pour le contexte choisi.",
    typeMode === "lifestyle"
      ? "Le lieu sert la narration plus que le sport : marche, assise, regard hors caméra, mouvement léger et détails personnels doivent guider la séquence."
      : locationMode === "studio"
        ? "Le décor doit rester sobre pour que la lumière et le regard portent le message."
        : locationMode === "stade"
          ? "Le lieu doit être utilisé comme un repère géométrique et émotionnel, pas seulement comme un fond."
          : locationMode === "terrain"
            ? "Le terrain doit structurer les plans et donner de la profondeur à la séance."
            : locationMode === "exterieur"
              ? "L’environnement extérieur doit servir la narration sans voler la lisibilité au sujet."
              : "Le lieu doit apporter du contexte sans saturer l’image.",
    constraints.naturalLight
      ? "La lumière naturelle est un atout à exploiter, avec attention à l’angle et à l’heure de prise."
      : constraints.controlledLight
        ? "La lumière doit être maîtrisée en amont, avec une répétition des réglages pour rester propre et stable."
        : "Le photographe doit travailler la texture, l’angle et la posture davantage que la lumière.",
    typeMode === "lifestyle"
      ? "Le stylisme et les accessoires doivent renforcer la personnalité sans surcharger l’image : tenue, détails, objets de vie ou éléments de sport de façon subtile."
      : constraints.stylisme
        ? "Le stylisme et les accessoires doivent renforcer la signature sans disperser l’attention."
        : "Le sujet doit rester très lisible, avec peu d’éléments perturbateurs.",
    duration <= 35
      ? "Le temps est court : chaque prise doit avoir une intention précise et un objectif clair."
      : duration <= 60
        ? "Le déroulé doit être fluide, sans perdre de temps en répétitions inutiles."
        : "La séance doit être pensée en séquences, avec des variantes pour éviter l’épuisement visuel.",
  ];

  const installation = [
    typeMode === "lifestyle"
      ? "Privilégier un espace de travail simple, vivant et naturel : un coin de pièce, un passage, une fenêtre ou un coin du studio qui permette au sujet de se sentir à l’aise et d’agir sans contrainte."
      : constraints.naturalLight
        ? "Travailler avec la lumière naturelle comme source principale : orienter le sujet de côté ou de trois-quarts pour sculpter le visage, puis ajuster le timing autour du moment le plus favorable."
        : constraints.controlledLight
          ? "Construire le setup à partir d’un éclairage maîtrisé : garder la même logique de lumière entre les prises et ne changer de réglage qu’en cas de besoin réel."
          : locationMode === "studio"
            ? "Placer le sujet à 1 à 1,5 m d’un fond propre, avec un éclairage à 45° pour sculpter le visage et les épaules."
            : locationMode === "stade"
              ? "Positionner le sujet à côté d’une ligne de jeu ou d’une zone de tribune pour exploiter la profondeur et l’architecture du lieu."
              : locationMode === "terrain"
                ? "Mettre le sujet sur une ligne du terrain ou au bord du but pour donner une vraie structure à l’image et renforcer la lecture du sport."
                : locationMode === "exterieur"
                  ? "Choisir un arrière-plan simple, avec un point lumineux latéral et une zone de recul pour garder le sujet lisible."
                  : "Créer un décor minimal, plus proche d’un intérieur de vie ou d’un espace de travail, avec un fond stable et une lumière douce.",
    typeMode === "lifestyle"
      ? "Laisser de la place aux détails personnels : tenue, accessoires, gestes de préparation, regard hors caméra, marche, appui sur un meuble ou arrêt devant une fenêtre."
      : constraints.naturalLight
        ? "Éviter les fonds trop chargés et privilégier un arrière-plan simple qui soutient le sujet sans entrer en conflit avec la lumière du moment."
        : locationMode === "studio"
          ? "Garder le décor sobre : fond uni, un seul élément de texture au maximum, et un angle de lumière qui évite les ombres parasites."
          : locationMode === "stade"
            ? "Exploiter les tribunes, les filets, le gazon et les lignes pour créer de la profondeur et du rythme sans saturer l’image."
            : locationMode === "terrain"
              ? "Utiliser le gazon, le ballon, le but et les lignes comme repères graphiques et émotionnels."
              : locationMode === "exterieur"
                ? "Éviter les éléments visuels trop chargés au fond et privilégier un arrière-plan qui soutient le sujet."
                : "Éviter les objets trop proches du sujet, qui dispersent l’attention du visage ou du geste.",
    typeMode === "lifestyle"
      ? "Préparer le cadrage pour que le sujet puisse se sentir naturel, avec une composition souple, un espace autour du corps et des lignes simples qui laissent respirer l’image."
      : constraints.naturalLight
        ? "Garder un angle de prise qui révèle la forme du visage, sans forcer le sujet à se positionner dans un éclairage trop frontal."
        : constraints.controlledLight
          ? "Placer le sujet pour que la lumière sculpte le regard, les pommettes et la posture, puis conserver la même orientation entre les prises."
          : "Garder un angle de prise qui révélera la forme et la présence du sujet sans dépendre d’un éclairage parfait.",
    typeMode === "lifestyle"
      ? "Privilégier un mouvement léger et une direction douce : quelques pas, un changement de position, un regard vers l’extérieur ou un simple retrait du regard vers la caméra."
      : typeMode === "action"
        ? "Positionner le photographe assez loin pour capturer le mouvement entier, puis se rapprocher au moment du geste principal."
        : typeMode === "portrait"
          ? "Positionner le photographe à hauteur du visage, avec un léger décalage latéral pour rendre les lignes plus élégantes."
          : "Positionner le photographe à angle oblique pour renforcer la profondeur et garder un rythme visuel plus vivant.",
    constraints.quickTurnaround
      ? "Éviter de changer de décor à chaque prise ; garder un même point de vue de base et faire varier seulement la posture ou le déplacement."
      : typeMode === "lifestyle"
        ? "Prévoir quelques variantes très simples autour du même moment pour conserver la spontanéité sans perdre le fil narratif."
        : "Prévoir quelques variantes de cadrage autour du même setup pour garder de la cohérence au montage.",
  ];

  const timeline = typeMode === "lifestyle"
    ? duration <= 35
      ? [
          `0–5 min : mise en confiance, réglage du cadre et repérage d’un espace naturel.`,
          `5–12 min : marche, posture détendue, regard hors caméra et premières interactions simples.`,
          `12–22 min : moments de préparation, accessoires, tenue et détails personnels.`,
          `22–27 min : mouvement léger, pause, sourire et regards vers l’extérieur.`,
          `27–${duration} min : image finale plus calme, plus humaine, avec une vraie sensation de vie.`,
        ]
      : [
          `0–8 min : mise en confiance, réglage du cadre et repérage d’un espace naturel.`,
          `8–18 min : marche, posture détendue, regard hors caméra et premières interactions simples.`,
          `18–35 min : moments de préparation, accessoires, tenue et détails personnels.`,
          `35–48 min : mouvement léger, pause, sourire et regards vers l’extérieur.`,
          `48–60 min : image finale plus calme, plus humaine, avec une vraie sensation de vie.`,
        ]
    : duration <= 35
      ? [
          `0–5 min : installation rapide, portrait simple et vérification de la lumière.`,
          `5–12 min : portraits avec ${sportDetails.noun.toLowerCase()} et posture de présence.`,
          `12–22 min : mouvement, ${sportDetails.action.toLowerCase()} et anticipation.`,
          `22–27 min : détails, accessoires, textures et variations de cadrage.`,
          `27–${duration} min : image signature, regard, ligne du corps et finition premium.`,
        ]
      : duration <= 60
        ? [
            `0–8 min : installation, repères de lumière et premières poses simples.`,
            `8–18 min : portraits et présence avec ${sportDetails.noun.toLowerCase()}.`,
            `18–35 min : action, mouvement et ${sportDetails.action.toLowerCase()}.`,
            `35–48 min : détails, environnement et variantes de cadrage.`,
            `48–60 min : image signature, répétition de la meilleure prise et finition.`,
          ]
        : [
            `0–10 min : installation et repères lumineux.`,
            `10–25 min : portraits et présence.`,
            `25–45 min : action, mouvement et séquences.`,
            `45–60 min : détails et contexte.`,
            `60–75 min : variantes, image signature et archive de sécurité.`,
          ];

  const shotlist = typeMode === "lifestyle"
    ? [
        "1. Plan d’ouverture plus naturel : le sujet entre dans le cadre comme s’il était déjà en train de vivre son moment, sans posture trop construite.",
        "2. Plan de marche ou de déplacement léger, avec un regard hors caméra, une attitude détendue et un rythme fluide.",
        "3. Moment de préparation ou de détail personnel : tenue, accessoires, objet du sport, geste de mise en place ou interaction avec l’environnement.",
        "4. Plan assis ou debout, plus intime, avec un regard vers l’extérieur, un sourire ou une concentration discrète.",
        "5. Plan de transition sur la personnalité du sujet : posture relâchée, présence forte sans exagération, avec une vraie sensation d’authenticité.",
        "6. Image finale plus calme et plus humaine, où l’identité sportive reste présente mais ne domine pas la scène.",
      ]
    : [
        typeMode === "action"
          ? `1. Portrait d’ouverture avec ${sportLabel.toLowerCase()} en mouvement, regard engagé et ${locationMode === "studio" ? "fond propre" : locationMode === "stade" ? "lignes du terrain visibles" : locationMode === "terrain" ? "ballon et gazon visibles" : "arrière-plan clair"}.`
          : `1. Portrait principal avec posture stable, regard franc et ${locationMode === "studio" ? "fond maîtrisé" : locationMode === "terrain" ? "repères du terrain" : locationMode === "stade" ? "architecture du stade" : "contexte simple"}.`,
        locationMode === "stade" || locationMode === "terrain"
          ? `2. Plan moyen sur le sujet au bord du but, de la ligne de touche ou du couloir, avec ${sportDetails.locationElements.toLowerCase()} visibles.`
          : locationMode === "exterieur"
            ? "2. Plan moyen avec déplacement latéral et arrière-plan de rue, de lumière naturelle ou d’environnement."
            : "2. Plan moyen avec un angle oblique pour construire une profondeur plus élégante.",
        typeMode === "action"
          ? `3. Séquence courte de ${sportDetails.action.toLowerCase()} : départ, anticipation et relâchement, avec le sujet en pleine intention.`
          : "3. Variation de posture plus détendue, avec un léger mouvement du buste et un regard moins figé.",
        locationMode === "stade" || locationMode === "terrain"
          ? "4. Prise proche sur les chaussures, les mains, le ballon ou le maillot, avec les lignes du terrain comme repère graphique."
          : "4. Prise proche sur le visage, la tenue ou un accessoire symbolique.",
        contextMode === "social"
          ? "5. Plan vertical 4:5 avec espace libre pour texte, regard direct et un mouvement discret du buste."
          : contextMode === "communication"
            ? "5. Plan horizontal ou portrait de presse avec un cadrage plus propre, plus sobre et mieux exploitable en site ou en communiqué."
            : "5. Plan plus large pour montrer la cohérence du lieu, du décor et de la posture.",
        typeMode === "action"
          ? "6. Prise de transition sur le mouvement de sortie ou de finition, avec le sujet qui quitte le cadre avec énergie."
          : "6. Prise de posture de signature, épaules ouvertes, silhouette nette et regard porté à l’objectif.",
        constraints.stylisme
          ? "7. Variation avec accessoire, tenue ou détail de stylisme pour renforcer l’identité du sujet."
          : "7. Variation plus simple, plus pure, avec seulement l’équipement ou la posture comme élément visuel.",
        contextMode === "marque"
          ? "8. Image de finition très cohérente, répétable et propre à l’identité visuelle, avec une composition stable."
          : "8. Image de finition mémorable, calme ou puissante selon l’intention, avec une ligne du corps claire.",
        locationMode === "stade" || locationMode === "terrain"
          ? `9. Plan large avec tribunes, profondeur et ${sportDetails.locationElements.toLowerCase()} pour donner de la sensation d’espace et de contexte.`
          : `9. Plan de détail sur ${sportDetails.noun.toLowerCase()} ou sur un élément de décor qui permet de relier le sujet à son univers.`,
        contextMode === "social"
          ? "10. Variante de format 9:16 ou 1:1, très simple, avec un regard direct et une posture nette pour des montages rapides."
          : "10. Variante de cadrage latéral ou de profil, plus graphique, pour créer une image secondaire réutilisable.",
      ].filter((entry) => Boolean(entry));

  const poses = typeMode === "lifestyle"
    ? [
        "Demandez au sujet de marcher doucement, puis de s’arrêter sur un regard naturel, hors caméra, pour créer un moment vivant.",
        "Faites prendre au sujet une posture simple, assis ou debout, avec le corps relâché et la tête légèrement tournée vers l’extérieur.",
        "Orientez le sujet vers des gestes de préparation ou d’interaction : ajuster une tenue, toucher un accessoire, regarder un détail ou se préparer à sortir.",
        "Laissez une vraie place à la spontanéité : un rire, une pause, un mouvement de bras, un regard vers le côté, sans forcer la pose.",
        "Conservez l’esprit de l’identité sportive mais sans transformer chaque image en succession de gestes techniques ou de poses sportives.",
      ]
    : [
        typeMode === "action"
          ? "Demandez au sujet de partir du rythme du geste, puis d’arrêter un instant sur le regard au moment de la réception ou de la finition."
          : "Demandez au sujet de garder une posture stable, puis d’ouvrir légèrement le buste pour rendre le regard plus vivant sans casser la ligne du corps.",
        sportLabel.toLowerCase().includes("football")
          ? "Dirigez le sujet pour qu’il appuie son poids sur la jambe arrière, garde le buste ouvert et place la main ou le ballon de façon naturelle, sans rigidité."
          : sportLabel.toLowerCase().includes("basket")
            ? "Orientez le sujet vers une posture de départ simple, avec un appui stable, le regard porté vers l’objectif et un geste de bras discret."
            : sportLabel.toLowerCase().includes("tennis")
              ? "Demandez au sujet de préparer le geste avec le buste en rotation, puis de relâcher le bras au moment du contact pour conserver une ligne fluide."
              : sportLabel.toLowerCase().includes("athl")
                ? "Faites prendre au sujet une posture de projection nette, avec le corps en préparation, le regard devant et la transmission de l’énergie visible."
                : "Guidez le sujet vers une posture de présence calme, avec la tête relevée, le regard franc et une respiration visible.",
        locationMode === "studio"
          ? "Demandez au sujet d’aligner les épaules sur un angle de 30° et de laisser les mains détendues pour une lecture très propre."
          : locationMode === "stade" || locationMode === "terrain"
            ? "Orientez le sujet à utiliser un repère du terrain comme appui de posture, sans perdre la fluidité du mouvement."
            : locationMode === "exterieur"
              ? "Faites déplacer le sujet lentement, avec un pas latéral et un regard porté devant pour garder de la vie dans l’image."
              : "Demandez au sujet de s’appuyer sur un meuble ou un bord de pièce pour ancrer la posture sans rigidité.",
        contextMode === "social"
          ? "Demandez au sujet d’ouvrir légèrement la bouche, de garder un regard direct et de faire un geste simple du bras ou de la main pour renforcer l’énergie du format court."
          : contextMode === "marque"
            ? "Faites garder au sujet une silhouette stable, une ligne du corps droite et une expression calme pour une image de marque forte."
            : "Dirigez le sujet vers une tête légèrement tournée, avec un sourire ou une concentration adaptée à la tonalité du shooting.",
        constraints.stylisme
          ? "Demandez au sujet de laisser un détail de tenue ou d’accessoire visible, mais ajusté au dernier moment pour éviter la surcharge."
          : "Faites varier un seul geste du buste ou de la main pour casser la rigidité sans détourner l’attention du visage.",
        typeMode === "action"
          ? "Demandez au sujet de répéter un mouvement court en trois temps — départ, effort puis relâchement — puis d’arrêter sur un regard précis."
          : "Demandez au sujet de conserver une variation plus calme et plus naturelle, pour garder l’authenticité et la lisibilité du visage.",
      ].filter((entry) => Boolean(entry));

  const formats = [
    contextMode === "social"
      ? "Priorité à la verticale 4:5, avec quelques 9:16 pour les stories et reels, et un peu d’espace négatif pour le texte."
      : contextMode === "communication"
        ? "Privilégier les cadrages horizontaux ou portrait de presse, avec un rendu sobre et facilement réutilisable dans un site ou un communiqué."
        : contextMode === "marque"
          ? "Prévoir des horizontales fortes pour la campagne, puis quelques portraits plus marqués pour les supports digitaux."
          : "Prévoir un mix de portraits, plans moyens et plans larges pour une utilisation polyvalente en portfolio ou en support institutionnel.",
    contextMode === "social"
      ? "Créer plusieurs variantes d’un même moment : portrait serré, plan moyen et plein pied, pour couvrir les différents besoins de publication."
      : "Conserver au moins une image très simple, une image plus narrative et une image graphique pour la polyvalence des usages.",
    constraints.naturalLight
      ? "Garder la lumière naturelle comme élément de signature, mais garder un second choix avec un fond plus neutre si besoin."
      : constraints.controlledLight
        ? "Prévoir une version de la même prise avec fond clair et fond plus sombre pour faciliter l’usage final."
        : "Prévoir une image simple et une image plus chargée pour couvrir différents contextes de diffusion.",
    typeMode === "action"
      ? "Les visuels d’action doivent rester très lisibles même en petit format, avec un sujet clairement identifié et un fond relativement calme."
      : "Les plans doivent garder une grande lisibilité même en très petit format, surtout si l’objectif est la diffusion digitale.",
  ];

  return {
    preparation: strategy,
    strategy,
    installation,
    deroule: timeline,
    shotlist,
    poses,
    formats,
    moodboard: [
      `Direction visuelle cohérente avec ${contextLabel.toLowerCase()} et ${objectiveLabel.toLowerCase()} pour un rendu premium et immédiatement exploitable.`,
      `Conserver une approche sobre, graphique et forte, avec des lignes propres et une vraie identité de marque.`,
      `Prévoir des variantes de cadrage, de lumière et de rythme qui fonctionnent aussi bien en contenu social que dans un portfolio ou une campagne.`,
    ],
  };
};

export default function ShootingAssistantPage() {
  const [mode, setMode] = useState<AssistantMode>("klique");
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [selectedAthleteKey, setSelectedAthleteKey] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [photographyDomain, setPhotographyDomain] = useState(photographyDomains[0].value);
  const [athleteSport, setAthleteSport] = useState("");
  const [shootingType, setShootingType] = useState(shootingTypes[0].value);
  const [objective, setObjective] = useState(objectiveOptions[0].value);
  const [location, setLocation] = useState(locationOptions[0].value);
  const [context, setContext] = useState(contextOptions[0].value);
  const [constraints, setConstraints] = useState("30 minutes, lumière naturelle, stylisme simple");
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [loadingAthletes, setLoadingAthletes] = useState(true);

  useEffect(() => {
    let active = true;

    const loadAthletes = async () => {
      try {
        const response = await fetch("/api/athletes", {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Impossible de charger les athlètes KLIQUE.");
        }

        const payload = (await response.json()) as AthletesPayload;
        const nextAthletes = Array.isArray(payload?.athletes) ? payload.athletes : [];

        if (!active) return;
        setAthletes(nextAthletes);
      } catch {
        if (!active) return;
        setAthletes([]);
      } finally {
        if (active) setLoadingAthletes(false);
      }
    };

    void loadAthletes();

    return () => {
      active = false;
    };
  }, []);

  const selectedAthlete = useMemo(() => {
    if (mode !== "klique") return null;
    return athletes.find((item) => item.key === selectedAthleteKey) ?? null;
  }, [athletes, mode, selectedAthleteKey]);

  useEffect(() => {
    if (mode === "klique" && selectedAthlete) {
      const nextSport = getSportSelectionValue(selectedAthlete.sport ?? "");
      const nextDomain = nextSport === "Autre" && normalize(selectedAthlete.sport) ? "Autre" : "Sport";
      const nextShootingType = nextDomain === "Sport" ? "Portrait sportif" : shootingTypes[0].value;

      setAthleteName(selectedAthlete.name ?? "");
      setPhotographyDomain(nextDomain);
      setAthleteSport(nextSport);
      setShootingType(nextShootingType);
    }
  }, [mode, selectedAthlete]);

  useEffect(() => {
    if (photographyDomain === "Sport") {
      const nextSport = sportDisciplines.some((option) => option.value === athleteSport) ? athleteSport : sportDisciplines[0]?.value ?? "";
      if (athleteSport !== nextSport) {
        setAthleteSport(nextSport);
      }
      return;
    }

    const disciplineOptions = getDisciplineOptions(photographyDomain);
    const nextDiscipline = disciplineOptions.some((option) => option.value === athleteSport) ? athleteSport : disciplineOptions[0]?.value ?? "";
    if (athleteSport !== nextDiscipline) {
      setAthleteSport(nextDiscipline);
    }
  }, [photographyDomain]);

  const handleGenerate = () => {
    const resolvedName = mode === "klique" ? athleteName || "Athlète KLIQUE" : athleteName || "Sportif / sujet externe";
    const resolvedSport = athleteSport || "sport ou discipline";

    setDraft(
      buildDraft({
        mode,
        athleteName: resolvedName,
        athleteSport: resolvedSport,
        photographyDomain,
        shootingType,
        objective,
        location,
        context,
        constraints,
      })
    );
  };

  return (
    <div style={{ padding: "2rem", background: "linear-gradient(135deg, #fffdf8 0%, #fef3c7 100%)", minHeight: "100%" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gap: "1.25rem" }}>
        <section style={{ border: "1px solid #e5e7eb", borderRadius: "24px", padding: "1.5rem", background: "rgba(255,255,255,0.95)", boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: palette.accentStrong, fontWeight: 700 }}>Assistant Shooting</p>
              <h1 style={{ margin: "0.25rem 0 0.25rem", fontSize: "2rem", fontWeight: 800, color: palette.text }}>Préparez un shooting premium, sans IA réelle</h1>
              <p style={{ margin: 0, color: palette.muted, maxWidth: "700px" }}>
                Choisissez un mode, définissez votre brief et obtenez une préparation, une shotlist et des poses prêtes à utiliser.
              </p>
            </div>
            <div style={{ padding: "0.6rem 0.8rem", borderRadius: "999px", background: "linear-gradient(135deg, #111827 0%, #f59e0b 100%)", color: "white", fontWeight: 700 }}>
              KLIQUE OS
            </div>
          </div>
        </section>

        <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "1.1fr 0.9fr" }}>
          <section style={{ border: "1px solid #e5e7eb", borderRadius: "24px", padding: "1.25rem", background: "white", boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)" }}>
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
              {(["klique", "free"] as AssistantMode[]).map((option) => {
                const active = option === mode;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    style={{
                      border: active ? `1px solid ${palette.accentStrong}` : `1px solid ${palette.border}`,
                      background: active ? palette.surfaceAlt : "white",
                      color: active ? palette.text : palette.muted,
                      borderRadius: "999px",
                      padding: "0.6rem 0.9rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {option === "klique" ? "Athlète KLIQUE" : "Shooting libre"}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "grid", gap: "0.9rem" }}>
              {mode === "klique" ? (
                <>
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontWeight: 700, color: palette.text }}>Sélectionner un athlète</span>
                    <select value={selectedAthleteKey} onChange={(event) => setSelectedAthleteKey(event.target.value)} style={inputStyle} disabled={loadingAthletes}>
                      <option value="">{loadingAthletes ? "Chargement…" : "Choisir un athlète existant"}</option>
                      {athletes.map((athlete) => (
                        <option key={athlete.key ?? athlete.name} value={athlete.key ?? athlete.name}>
                          {athlete.name} — {athlete.sport || "Sport à préciser"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontWeight: 700, color: palette.text }}>Nom de l’athlète</span>
                    <input value={athleteName} onChange={(event) => setAthleteName(event.target.value)} style={inputStyle} placeholder="Nom complet" />
                  </label>
                </>
              ) : (
                <label style={{ display: "grid", gap: "0.35rem" }}>
                  <span style={{ fontWeight: 700, color: palette.text }}>Nom du sportif / sujet externe</span>
                  <input value={athleteName} onChange={(event) => setAthleteName(event.target.value)} style={inputStyle} placeholder="Nom du sportif, créateur, modèle…" />
                </label>
              )}

              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span style={{ fontWeight: 700, color: palette.text }}>Domaine / univers</span>
                <select value={photographyDomain} onChange={(event) => setPhotographyDomain(event.target.value)} style={inputStyle}>
                  {photographyDomains.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span style={{ fontWeight: 700, color: palette.text }}>{getDisciplineLabel(photographyDomain)}</span>
                {photographyDomain === "Sport" ? (
                  <select value={athleteSport} onChange={(event) => setAthleteSport(event.target.value)} style={inputStyle}>
                    {sportDisciplines.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select value={athleteSport} onChange={(event) => setAthleteSport(event.target.value)} style={inputStyle}>
                    {getDisciplineOptions(photographyDomain).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span style={{ fontWeight: 700, color: palette.text }}>Type de shooting</span>
                <select value={shootingType} onChange={(event) => setShootingType(event.target.value)} style={inputStyle}>
                  {shootingTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span style={{ fontWeight: 700, color: palette.text }}>Objectif</span>
                <select value={objective} onChange={(event) => setObjective(event.target.value)} style={inputStyle}>
                  {objectiveOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span style={{ fontWeight: 700, color: palette.text }}>Lieu</span>
                <select value={location} onChange={(event) => setLocation(event.target.value)} style={inputStyle}>
                  {locationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span style={{ fontWeight: 700, color: palette.text }}>Contexte</span>
                <select value={context} onChange={(event) => setContext(event.target.value)} style={inputStyle}>
                  {contextOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span style={{ fontWeight: 700, color: palette.text }}>Contraintes</span>
                <textarea value={constraints} onChange={(event) => setConstraints(event.target.value)} style={{ ...inputStyle, minHeight: "96px" }} placeholder="Temps, lumière, accessibilité, budget, style…" />
              </label>

              <button type="button" onClick={handleGenerate} style={{ border: "none", background: "linear-gradient(135deg, #111827 0%, #f59e0b 100%)", color: "white", borderRadius: "999px", padding: "0.8rem 1rem", fontWeight: 700, cursor: "pointer" }}>
                Générer la préparation
              </button>
            </div>
          </section>

          <section style={{ display: "grid", gap: "1rem" }}>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "24px", padding: "1.1rem", background: "white", boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)" }}>
              <p style={{ margin: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: palette.muted, fontWeight: 700 }}>Brief</p>
              <h2 style={{ margin: "0.25rem 0 0.5rem", color: palette.text }}>{formatValue(athleteName || (mode === "klique" ? "Athlète KLIQUE" : "Sujet libre"))}</h2>
              <p style={{ margin: 0, color: palette.muted, lineHeight: 1.6 }}>
                {formatValue(shootingType)} • {formatValue(objective)} • {formatValue(location)}
              </p>
              <p style={{ margin: "0.6rem 0 0", color: palette.muted }}>
                Contexte : {formatValue(context)}
              </p>
            </div>

            {!draft ? (
              <div style={{ border: "1px dashed #cbd5e1", borderRadius: "24px", padding: "1.1rem", background: "rgba(255,255,255,0.85)" }}>
                <p style={{ margin: 0, color: palette.muted }}>Le brief apparaîtra ici une fois généré.</p>
              </div>
            ) : (
              <>
                <Card title="Stratégie de séance" items={draft.strategy} />
                <Card title="Installation & lumière" items={draft.installation} />
                <Card title="Déroulé conseillé" items={draft.deroule} />
                <Card title="Shotlist" items={draft.shotlist} />
                <Card title="Poses & direction du sujet" items={draft.poses} />
                <Card title="Formats & livrables" items={draft.formats} />
                <StructuredMoodboardCard sections={draft.structuredMoodboard} />
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Card({ title, items }: { title: string; items?: unknown[] | null }) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "20px", padding: "1rem", background: "white" }}>
      <h3 style={{ margin: "0 0 0.6rem", color: "#111827" }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: "1rem", color: "#4b5563", display: "grid", gap: "0.45rem" }}>
        {safeItems.map((item, index) => (
          <li key={`${title}-${index}`} style={{ lineHeight: 1.5 }}>{typeof item === "string" ? item : item == null ? "—" : String(item)}</li>
        ))}
      </ul>
    </div>
  );
}

function StructuredMoodboardCard({ sections }: { sections: StructuredMoodboardSection[] }) {
  if (!sections.length) {
    return null;
  }

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "20px", padding: "1rem", background: "linear-gradient(135deg, #fffdf8 0%, #fef3c7 100%)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: "#111827" }}>Galerie de références</h3>
          <p style={{ margin: "0.25rem 0 0", color: "#4b5563" }}>Chaque référence apparaît comme une carte visuelle filtrée selon le domaine, le sport et le type de shooting.</p>
        </div>
        <span style={{ padding: "0.35rem 0.6rem", borderRadius: "999px", background: "#111827", color: "white", fontSize: "0.8rem", fontWeight: 700 }}>
          Premium KLIQUE
        </span>
      </div>

      <div style={{ display: "grid", gap: "0.85rem" }}>
        {sections.map((section) => (
          <div key={`${section.domain}-${section.discipline}`} style={{ border: "1px solid #fbbf24", borderRadius: "16px", padding: "0.9rem", background: "rgba(255,255,255,0.85)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap" }}>
              <div>
                <h4 style={{ margin: 0, color: "#111827" }}>{section.domain} • {section.discipline}</h4>
              </div>
              <span style={{ color: "#b45309", fontWeight: 700, fontSize: "0.8rem" }}>Bibliothèque structurée</span>
            </div>

            <div style={{ display: "grid", gap: "0.8rem" }}>
              {section.categories.map((category) => (
                <div key={category.key} style={{ border: "1px solid #f3e8ab", borderRadius: "12px", padding: "0.75rem", background: "#fffef9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
                    <h5 style={{ margin: 0, color: "#111827", fontSize: "0.95rem" }}>{category.title}</h5>
                    <span style={{ color: "#b45309", fontSize: "0.75rem", fontWeight: 700 }}>{category.items.length} références</span>
                  </div>

                  <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                    {category.items.map((item) => (
                      <div key={`${category.key}-${item.key}`} style={{ border: "1px solid #e5e7eb", borderRadius: "14px", overflow: "hidden", background: "white", display: "grid" }}>
                        {item.image ? (
                          <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", background: "linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                            <img src={item.image} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", backgroundColor: "#f9fafb" }} />
                            <span style={{ position: "absolute", top: "0.5rem", left: "0.5rem", padding: "0.25rem 0.5rem", borderRadius: "999px", background: "rgba(255,255,255,0.9)", color: "#111827", fontSize: "0.7rem", fontWeight: 700 }}>
                              {item.category}
                            </span>
                          </div>
                        ) : (
                          <div style={{ width: "100%", aspectRatio: "4 / 3", background: "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: "0.75rem", fontWeight: 700, textAlign: "center", padding: "0 0.75rem" }}>
                            {item.imageKey ? "Image à venir" : "Aucune image"}
                          </div>
                        )}
                        <div style={{ padding: "0.7rem", display: "grid", gap: "0.35rem" }}>
                          <h6 style={{ margin: 0, color: "#111827", fontSize: "0.9rem" }}>{item.title}</h6>
                          <p style={{ margin: 0, color: "#4b5563", fontSize: "0.8rem", lineHeight: 1.45 }}>{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "12px",
  padding: "0.7rem 0.8rem",
  fontSize: "0.95rem",
  background: "#f9fafb",
  color: "#111827",
};
