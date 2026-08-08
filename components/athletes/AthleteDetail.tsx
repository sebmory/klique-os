"use client";

import { useState } from "react";
import type { Athlete } from "@/types/athlete";
import type { Shooting } from "@/types/shooting";
import type { Partner } from "@/types/partner";
import { PartnerService } from "@/services/partner.service";
import { Modal } from "@/components/ui/Modal";
import { AthleteHeader } from "@/components/athletes/AthleteHeader";
import { AthleteMainInfo } from "@/components/athletes/AthleteMainInfo";
import { AthleteObjectives } from "@/components/athletes/AthleteObjectives";
import { AthleteFollowUp } from "@/components/athletes/AthleteFollowUp";
import { AthleteMedia } from "@/components/athletes/AthleteMedia";
import { AthleteExperts } from "@/components/athletes/AthleteExperts";

type MediaInterviewFormat =
  | "Portrait"
  | "Avant compétition"
  | "Après compétition"
  | "Nouveau club"
  | "Nouveau partenaire"
  | "Lifestyle"
  | "Mental"
  | "Réseaux sociaux"
  | "Questions rapides"
  | "Interview complète"
  | "Tu préfères... ?"
  | "Rafale"
  | "Vrai ou faux"
  | "Finir les phrases"
  | "En dehors du sport"
  | "Coéquipiers";

type GeneratedInterview = {
  format: MediaInterviewFormat;
  complementaryInfo: string;
  questions: string[];
};

type InstagramPublicationType =
  | "annonce"
  | "performance"
  | "portrait"
  | "coulisses"
  | "partenaire"
  | "remerciement";

type InstagramTone = "premium" | "humain" | "dynamique" | "sobre";

type InstagramLanguage = "français" | "anglais" | "bilingue";

type GeneratedInstagramPost = {
  publicationType: InstagramPublicationType;
  tone: InstagramTone;
  language: InstagramLanguage;
  complementaryInfo: string;
  text: string;
};

type ReelObjective =
  | "visibilité"
  | "storytelling"
  | "performance"
  | "coulisses"
  | "partenaire"
  | "engagement";

type ReelStyle =
  | "dynamique"
  | "émotionnel"
  | "premium"
  | "humoristique"
  | "éducatif";

type ReelDuration = "15 s" | "30 s" | "60 s";

type ReelPlatform = "Instagram" | "TikTok" | "YouTube Shorts";

type GeneratedReelIdea = {
  objective: ReelObjective;
  style: ReelStyle;
  duration: ReelDuration;
  platform: ReelPlatform;
  complementaryInfo: string;
  concept: string;
  hook3s: string;
  sceneFlow: string[];
  shotsToFilm: string[];
  onScreenText: string[];
  musicMood: string;
  callToAction: string;
  shortCaption: string;
};

type ShotlistShootingType =
  | "portrait"
  | "action"
  | "entraînement"
  | "match"
  | "lifestyle"
  | "partenaire"
  | "interview";

type ShotlistObjective =
  | "réseaux sociaux"
  | "annonce"
  | "storytelling"
  | "sponsor"
  | "banque médias";

type ShotlistLocation = "intérieur" | "extérieur" | "studio" | "terrain";

type ShotlistDuration = "15 min" | "30 min" | "60 min" | "90 min";

type ShotlistExpectedFormat = "vertical" | "horizontal" | "carré" | "vidéo";

type ShotPriority = "indispensable" | "recommandée" | "bonus";

type ShotPlan = {
  id: string;
  name: string;
  description: string;
  framing: string;
  orientation: string;
  poseOrAction: string;
  priority: ShotPriority;
  suggestedOrder: number;
};

type GeneratedShotlist = {
  shootingType: ShotlistShootingType;
  objective: ShotlistObjective;
  location: ShotlistLocation;
  duration: ShotlistDuration;
  expectedFormats: ShotlistExpectedFormat[];
  complementaryInfo: string;
  plans: ShotPlan[];
};

type ContentPlannerObjective =
  | "Développer la visibilité"
  | "Valoriser une performance"
  | "Trouver des partenaires"
  | "Fidéliser la communauté"
  | "Mettre en avant un sponsor"
  | "Annoncer une actualité";

type ContentPlannerDuration =
  | "1 jour"
  | "3 jours"
  | "1 semaine"
  | "2 semaines"
  | "1 mois";

type ContentPlannerChannel =
  | "Instagram"
  | "TikTok"
  | "LinkedIn"
  | "Facebook"
  | "YouTube";

type ContentPlannerItem = {
  id: string;
  date: string;
  platform: ContentPlannerChannel;
  contentType: string;
  objective: string;
  mainIdea: string;
  recommendedFormat: string;
  callToAction: string;
};

type GeneratedContentPlanner = {
  objective: ContentPlannerObjective;
  duration: ContentPlannerDuration;
  channels: ContentPlannerChannel[];
  complementaryInfo: string;
  publications: ContentPlannerItem[];
};

type ShootingAssistantType =
  | "Portrait"
  | "Action"
  | "Entraînement"
  | "Match"
  | "Lifestyle"
  | "Partenaire"
  | "Interview";

type ShootingAssistantDuration = "30 min" | "60 min" | "90 min" | "120 min";

type ShootingAssistantLocation = "Studio" | "Intérieur" | "Extérieur" | "Terrain";

type ShootingAssistantObjective =
  | "Réseaux sociaux"
  | "Annonce"
  | "Performance"
  | "Storytelling"
  | "Activation sponsor"
  | "Banque médias";

type ShootingAssistantMinuteSlot = {
  timeRange: string;
  task: string;
};

type GeneratedShootingAssistant = {
  shootingType: ShootingAssistantType;
  duration: ShootingAssistantDuration;
  location: ShootingAssistantLocation;
  objective: ShootingAssistantObjective;
  equipment: string;
  outfitsCount: number;
  deliverablesWanted: number;
  equipmentChecklist: string[];
  shotlist: string[];
  poseIdeas: string[];
  videoIdeas: string[];
  reelIdeas: string[];
  storyIdeas: string[];
  recommendedInterview: string[];
  minuteByMinutePlan: ShootingAssistantMinuteSlot[];
  plannedDeliverables: string[];
};

const instagramPublicationTypes: InstagramPublicationType[] = [
  "annonce",
  "performance",
  "portrait",
  "coulisses",
  "partenaire",
  "remerciement",
];

const instagramTones: InstagramTone[] = [
  "premium",
  "humain",
  "dynamique",
  "sobre",
];

const instagramLanguages: InstagramLanguage[] = [
  "français",
  "anglais",
  "bilingue",
];

const reelObjectives: ReelObjective[] = [
  "visibilité",
  "storytelling",
  "performance",
  "coulisses",
  "partenaire",
  "engagement",
];

const reelStyles: ReelStyle[] = [
  "dynamique",
  "émotionnel",
  "premium",
  "humoristique",
  "éducatif",
];

const reelDurations: ReelDuration[] = ["15 s", "30 s", "60 s"];

const reelPlatforms: ReelPlatform[] = ["Instagram", "TikTok", "YouTube Shorts"];

const shotlistShootingTypes: ShotlistShootingType[] = [
  "portrait",
  "action",
  "entraînement",
  "match",
  "lifestyle",
  "partenaire",
  "interview",
];

const shotlistObjectives: ShotlistObjective[] = [
  "réseaux sociaux",
  "annonce",
  "storytelling",
  "sponsor",
  "banque médias",
];

const shotlistLocations: ShotlistLocation[] = [
  "intérieur",
  "extérieur",
  "studio",
  "terrain",
];

const shotlistDurations: ShotlistDuration[] = ["15 min", "30 min", "60 min", "90 min"];

const shotlistExpectedFormats: ShotlistExpectedFormat[] = [
  "vertical",
  "horizontal",
  "carré",
  "vidéo",
];

const contentPlannerObjectives: ContentPlannerObjective[] = [
  "Développer la visibilité",
  "Valoriser une performance",
  "Trouver des partenaires",
  "Fidéliser la communauté",
  "Mettre en avant un sponsor",
  "Annoncer une actualité",
];

const contentPlannerDurations: ContentPlannerDuration[] = [
  "1 jour",
  "3 jours",
  "1 semaine",
  "2 semaines",
  "1 mois",
];

const contentPlannerChannels: ContentPlannerChannel[] = [
  "Instagram",
  "TikTok",
  "LinkedIn",
  "Facebook",
  "YouTube",
];

const shootingAssistantTypes: ShootingAssistantType[] = [
  "Portrait",
  "Action",
  "Entraînement",
  "Match",
  "Lifestyle",
  "Partenaire",
  "Interview",
];

const shootingAssistantDurations: ShootingAssistantDuration[] = [
  "30 min",
  "60 min",
  "90 min",
  "120 min",
];

const shootingAssistantLocations: ShootingAssistantLocation[] = [
  "Studio",
  "Intérieur",
  "Extérieur",
  "Terrain",
];

const shootingAssistantObjectives: ShootingAssistantObjective[] = [
  "Réseaux sociaux",
  "Annonce",
  "Performance",
  "Storytelling",
  "Activation sponsor",
  "Banque médias",
];

const mediaInterviewFormats: MediaInterviewFormat[] = [
  "Portrait",
  "Avant compétition",
  "Après compétition",
  "Nouveau club",
  "Nouveau partenaire",
  "Lifestyle",
  "Mental",
  "Réseaux sociaux",
  "Questions rapides",
  "Interview complète",
  "Tu préfères... ?",
  "Rafale",
  "Vrai ou faux",
  "Finir les phrases",
  "En dehors du sport",
  "Coéquipiers",
];

const interviewQuestionCountOptions = [5, 10, 15, 20, 25, 30] as const;

const mediaAssistantActions = [
  {
    key: "interview",
    icon: "🎤",
    title: "Interview",
    description: "Préparer une base de questions pour un format court ou long.",
  },
  {
    key: "publication-instagram",
    icon: "📱",
    title: "Publication Instagram",
    description: "Structurer un post impactant aligné au moment sportif.",
  },
  {
    key: "idee-reel",
    icon: "🎬",
    title: "Idée de Reel",
    description: "Construire un concept Reel rapide à tourner et publier.",
  },
  {
    key: "shotlist",
    icon: "📸",
    title: "Shotlist",
    description: "Lister les plans clés pour cadrer la production visuelle.",
  },
  {
    key: "content-planner",
    icon: "🗓️",
    title: "Content Planner",
    description: "Créer un planning éditorial de démonstration par canal.",
  },
  {
    key: "shooting-assistant",
    icon: "🎥",
    title: "Shooting Assistant",
    description: "Préparer un shooting complet avec plan opérationnel prêt à exécuter.",
  },
  {
    key: "communique",
    icon: "📰",
    title: "Communiqué de presse",
    description: "Rédiger une trame officielle pour annonce ou résultat.",
  },
  {
    key: "presentation-partenaire",
    icon: "🤝",
    title: "Présentation partenaire",
    description: "Mettre en avant une collaboration sponsor de façon premium.",
  },
  {
    key: "email",
    icon: "📧",
    title: "Email",
    description: "Créer un message prêt à envoyer pour un contact ciblé.",
  },
];

const normalizePersonName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const parseKliqueDate = (value: string): Date | null => {
  const cleaned = String(value ?? "").trim();
  if (!cleaned || cleaned === "0" || cleaned.includes("1899")) return null;

  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const europeanMatch = cleaned.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (europeanMatch) {
    const date = new Date(Number(europeanMatch[3]), Number(europeanMatch[2]) - 1, Number(europeanMatch[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatKliqueDate = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat("fr-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(date)
    : "Jamais";

export function AthleteDetail({
  athlete,
  partners,
  shootings,
  onBack,
}: {
  athlete: Athlete;
  partners: Partner[];
  shootings: Shooting[];
  onBack: () => void;
}) {
  const linkedPartners = PartnerService.partnersForAthlete(partners, athlete);
  const [selectedShooting, setSelectedShooting] = useState<Shooting | null>(null);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [selectedInterviewFormat, setSelectedInterviewFormat] =
    useState<MediaInterviewFormat>(mediaInterviewFormats[0]);
  const [selectedInterviewQuestionCount, setSelectedInterviewQuestionCount] =
    useState<number>(10);
  const [interviewComplementaryInfo, setInterviewComplementaryInfo] = useState("");
  const [generatedInterview, setGeneratedInterview] = useState<GeneratedInterview | null>(null);
  const [interviewCopyStatus, setInterviewCopyStatus] = useState("");
  const [interviewGenerationVersion, setInterviewGenerationVersion] = useState(0);

  const [showInstagramModal, setShowInstagramModal] = useState(false);
  const [selectedInstagramPublicationType, setSelectedInstagramPublicationType] =
    useState<InstagramPublicationType>(instagramPublicationTypes[0]);
  const [selectedInstagramTone, setSelectedInstagramTone] =
    useState<InstagramTone>(instagramTones[0]);
  const [selectedInstagramLanguage, setSelectedInstagramLanguage] =
    useState<InstagramLanguage>(instagramLanguages[0]);
  const [instagramComplementaryInfo, setInstagramComplementaryInfo] = useState("");
  const [generatedInstagramPost, setGeneratedInstagramPost] =
    useState<GeneratedInstagramPost | null>(null);
  const [instagramCopyStatus, setInstagramCopyStatus] = useState("");

  const [showReelModal, setShowReelModal] = useState(false);
  const [selectedReelObjective, setSelectedReelObjective] =
    useState<ReelObjective>(reelObjectives[0]);
  const [selectedReelStyle, setSelectedReelStyle] =
    useState<ReelStyle>(reelStyles[0]);
  const [selectedReelDuration, setSelectedReelDuration] =
    useState<ReelDuration>(reelDurations[0]);
  const [selectedReelPlatform, setSelectedReelPlatform] =
    useState<ReelPlatform>(reelPlatforms[0]);
  const [reelComplementaryInfo, setReelComplementaryInfo] = useState("");
  const [generatedReelIdea, setGeneratedReelIdea] = useState<GeneratedReelIdea | null>(null);
  const [reelCopyStatus, setReelCopyStatus] = useState("");

  const [showShotlistModal, setShowShotlistModal] = useState(false);
  const [selectedShotlistShootingType, setSelectedShotlistShootingType] =
    useState<ShotlistShootingType>(shotlistShootingTypes[0]);
  const [selectedShotlistObjective, setSelectedShotlistObjective] =
    useState<ShotlistObjective>(shotlistObjectives[0]);
  const [selectedShotlistLocation, setSelectedShotlistLocation] =
    useState<ShotlistLocation>(shotlistLocations[0]);
  const [selectedShotlistDuration, setSelectedShotlistDuration] =
    useState<ShotlistDuration>(shotlistDurations[1]);
  const [selectedShotlistFormats, setSelectedShotlistFormats] = useState<
    Record<ShotlistExpectedFormat, boolean>
  >({
    vertical: true,
    horizontal: true,
    carré: false,
    vidéo: true,
  });
  const [shotlistComplementaryInfo, setShotlistComplementaryInfo] = useState("");
  const [generatedShotlist, setGeneratedShotlist] = useState<GeneratedShotlist | null>(null);
  const [checkedShotPlans, setCheckedShotPlans] = useState<string[]>([]);
  const [shotlistCopyStatus, setShotlistCopyStatus] = useState("");

  const [showContentPlannerModal, setShowContentPlannerModal] = useState(false);
  const [selectedContentPlannerObjective, setSelectedContentPlannerObjective] =
    useState<ContentPlannerObjective>(contentPlannerObjectives[0]);
  const [selectedContentPlannerDuration, setSelectedContentPlannerDuration] =
    useState<ContentPlannerDuration>(contentPlannerDurations[0]);
  const [selectedContentPlannerChannels, setSelectedContentPlannerChannels] = useState<
    Record<ContentPlannerChannel, boolean>
  >({
    Instagram: true,
    TikTok: false,
    LinkedIn: false,
    Facebook: true,
    YouTube: false,
  });
  const [contentPlannerComplementaryInfo, setContentPlannerComplementaryInfo] = useState("");
  const [generatedContentPlanner, setGeneratedContentPlanner] =
    useState<GeneratedContentPlanner | null>(null);
  const [contentPlannerCopyStatus, setContentPlannerCopyStatus] = useState("");

  const [showShootingAssistantModal, setShowShootingAssistantModal] = useState(false);
  const [selectedShootingAssistantType, setSelectedShootingAssistantType] =
    useState<ShootingAssistantType>(shootingAssistantTypes[0]);
  const [selectedShootingAssistantDuration, setSelectedShootingAssistantDuration] =
    useState<ShootingAssistantDuration>(shootingAssistantDurations[1]);
  const [selectedShootingAssistantLocation, setSelectedShootingAssistantLocation] =
    useState<ShootingAssistantLocation>(shootingAssistantLocations[0]);
  const [selectedShootingAssistantObjective, setSelectedShootingAssistantObjective] =
    useState<ShootingAssistantObjective>(shootingAssistantObjectives[0]);
  const [shootingAssistantEquipment, setShootingAssistantEquipment] = useState("");
  const [shootingAssistantOutfitsCount, setShootingAssistantOutfitsCount] = useState(3);
  const [shootingAssistantDeliverablesWanted, setShootingAssistantDeliverablesWanted] =
    useState(12);
  const [generatedShootingAssistant, setGeneratedShootingAssistant] =
    useState<GeneratedShootingAssistant | null>(null);
  const [shootingAssistantCopyStatus, setShootingAssistantCopyStatus] = useState("");

  const athleteShootings = shootings
    .filter(
      (shooting) =>
        normalizePersonName(shooting.athlete) === normalizePersonName(athlete.name)
    )
    .sort(
      (a, b) =>
        (parseKliqueDate(b.date)?.getTime() ?? 0) -
        (parseKliqueDate(a.date)?.getTime() ?? 0)
    );

  const lastShootingLabel = formatKliqueDate(
    parseKliqueDate(athleteShootings[0]?.date ?? "")
  );

  const shootingProgress = (shooting: Shooting) => {
    const steps = [
      shooting.importDone,
      shooting.sortDone,
      shooting.retouchDone,
      shooting.exportDone,
      shooting.driveDone,
      shooting.published,
    ];
    return Math.round((steps.filter(Boolean).length / steps.length) * 100);
  };

  const recommendation =
    athlete.coverage < 35
      ? "Programmer un premier shooting complet."
      : athlete.premium < 5
      ? "Créer davantage de contenus Premium."
      : "Aucune action urgente.";

  // derived from athlete data until media lots are wired to this component
  const mediaStats = {
    totalShootings:      athleteShootings.length,
    totalPhotos:         athleteShootings.reduce((sum, s) => sum + s.photos, 0),
    totalVideos:         athleteShootings.reduce((sum, s) => sum + s.videos, 0),
    completedShootings:  athleteShootings.filter((s) => s.published).length,
    toProcess:           athleteShootings.filter((s) => s.shootingDone && !s.published).length,
    premiumRemaining:    athlete.premium,
  };

  const lastShootDate = athleteShootings[0] ? parseKliqueDate(athleteShootings[0].date) : null;
  const daysSinceShoot = lastShootDate
    ? Math.floor((Date.now() - lastShootDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const alerts: { icon: string; message: string }[] = [];
  if (athlete.daysWithoutVisibility > 14)
    alerts.push({ icon: "🔴", message: `${athlete.daysWithoutVisibility} jours sans visibilité.` });
  if (daysSinceShoot === null || daysSinceShoot > 30)
    alerts.push({ icon: "🟠", message: daysSinceShoot === null ? "Aucun shooting enregistré." : `${daysSinceShoot} jours sans shooting.` });
  if (athlete.premium <= 0)
    alerts.push({ icon: "🟡", message: "Aucun contenu Premium disponible." });
  if (!athlete.nextContact?.trim())
    alerts.push({ icon: "🔵", message: "Aucun prochain contact planifié." });

  // 25 pts visibility · 25 pts shooting recency · 20 pts weekly response · 15 pts monthly response · 15 pts premium
  const visibilityScore =
    athlete.daysWithoutVisibility === 0 ? 25
    : athlete.daysWithoutVisibility <= 7  ? 20
    : athlete.daysWithoutVisibility <= 14 ? 15
    : athlete.daysWithoutVisibility <= 30 ? 5
    : 0;
  const shootScore =
    daysSinceShoot === null ? 0
    : daysSinceShoot <= 14  ? 25
    : daysSinceShoot <= 30  ? 20
    : daysSinceShoot <= 60  ? 10
    : 0;
  const weeklyScore  = parseKliqueDate(athlete.lastResponseWeekly)  !== null ? 20 : 0;
  const monthlyScore = parseKliqueDate(athlete.lastResponseMonthly) !== null ? 15 : 0;
  const premiumScore =
    athlete.premium >= 10 ? 15
    : athlete.premium >= 5 ? 10
    : athlete.premium >= 1 ? 5
    : 0;
  const activityScore = visibilityScore + shootScore + weeklyScore + monthlyScore + premiumScore;
  const activityLevel =
    activityScore >= 80 ? "Excellent"
    : activityScore >= 60 ? "Bon"
    : activityScore >= 40 ? "Moyen"
    : "Faible";

  const daysSince = (raw: string) => {
    const d = parseKliqueDate(raw);
    return d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : null;
  };
  const daysSinceStory   = daysSince(athlete.lastStory);
  const daysSincePost    = daysSince(athlete.lastPost);
  const daysSinceWeekly  = daysSince(athlete.lastResponseWeekly);
  const daysSinceMonthly = daysSince(athlete.lastResponseMonthly);

  const actions: string[] = [];
  if (!athlete.nextContact?.trim())
    actions.push("Contacter l'athlète — aucun prochain contact planifié.");
  if (daysSinceShoot === null || daysSinceShoot > 30)
    actions.push(daysSinceShoot === null
      ? "Prévoir un shooting — aucun shooting enregistré."
      : `Prévoir un shooting — dernier il y a ${daysSinceShoot} jours.`);
  if (daysSinceStory === null || daysSinceStory > 7)
    actions.push(daysSinceStory === null
      ? "Préparer une story — aucune story enregistrée."
      : `Préparer une story — dernière il y a ${daysSinceStory} jours.`);
  if (daysSincePost === null || daysSincePost > 14)
    actions.push(daysSincePost === null
      ? "Préparer un post — aucun post enregistré."
      : `Préparer un post — dernier il y a ${daysSincePost} jours.`);
  if (athlete.premium > 0)
    actions.push(`Utiliser un contenu Premium — ${athlete.premium} disponible(s).`);
  if (daysSinceWeekly === null || daysSinceWeekly > 7)
    actions.push(daysSinceWeekly === null
      ? "Relancer le formulaire hebdo — aucune réponse enregistrée."
      : `Relancer le formulaire hebdo — dernière réponse il y a ${daysSinceWeekly} jours.`);
  if (daysSinceMonthly === null || daysSinceMonthly > 30)
    actions.push(daysSinceMonthly === null
      ? "Relancer le formulaire mensuel — aucune réponse enregistrée."
      : `Relancer le formulaire mensuel — dernière réponse il y a ${daysSinceMonthly} jours.`);

  const buildAthleteContentContext = () => {
    const athleteData = athlete as Athlete & Record<string, unknown>;
    const recentShootings = athleteShootings.slice(0, 3);
    const recentShootingSummary = recentShootings.length
      ? recentShootings
          .map((shooting) => `${shooting.date || "Date"} · ${shooting.type || "Shooting"}`)
          .join(" / ")
      : "Aucun shooting récent";

    const ageCandidate = athleteData.age ?? athleteData.ageYears ?? athleteData.athleteAge;
    const ageText =
      typeof ageCandidate === "number" && Number.isFinite(ageCandidate)
        ? `${ageCandidate} ans`
        : typeof ageCandidate === "string" && ageCandidate.trim().length > 0
        ? ageCandidate.trim()
        : "âge non précisé";

    const recentPublications = [athlete.lastPublication, athlete.lastPost, athlete.lastStory]
      .filter((value) => Boolean(value?.trim()))
      .join(" / ") || "Aucune publication récente";

    const partnerSummary = linkedPartners.length
      ? linkedPartners.map((partner) => partner.name).slice(0, 4).join(", ")
      : "Aucun partenaire actif";

    return {
      name: athlete.name || "Athlète",
      sport: athlete.sport || "sport",
      club: athlete.club || "club non précisé",
      nationality: athlete.nationality || "nationalité non précisée",
      ageText,
      objective: athlete.objective || athlete.longTerm || "objectif non précisé",
      palmares: athlete.palmares || "palmarès à compléter",
      partners: partnerSummary,
      history: athlete.followUpNotes || athlete.notes || "historique à compléter",
      recentPublications,
      recentShootings: recentShootingSummary,
    };
  };

  const generateQuestionsForFormat = (
    format: MediaInterviewFormat,
    complementaryInfo: string
  ) => {
    const context = buildAthleteContentContext();
    const extra = complementaryInfo.trim() ? ` Infos complémentaires: ${complementaryInfo.trim()}.` : "";

    const portraitQuestions = [
      `Comment décrirais-tu ton identité sportive aujourd'hui en ${context.sport} ?`,
      `Quel rôle joue ${context.club} dans ton évolution actuelle ?`,
      `En quoi ton parcours depuis ${context.nationality} influence ton style ?`,
      `Quel objectif te motive le plus cette saison : ${context.objective} ?`,
      `Quel moment de ton palmarès te définit le mieux : ${context.palmares} ?`,
      `Quelle valeur personnelle veux-tu transmettre au public ?`,
      `Comment restes-tu constant(e) entre entraînement et performance ?`,
      `Quel aspect de ton historique veux-tu réécrire cette année ?`,
      `Quelle image souhaites-tu donner dans tes prochaines publications ?`,
      `Quel message veux-tu adresser aux jeunes athlètes qui te suivent ?${extra}`,
    ];

    const interviewByType: Record<MediaInterviewFormat, string[]> = {
      "Portrait": portraitQuestions,
      "Avant compétition": [
        `Quel est ton état d'esprit à l'approche de la prochaine compétition ?`,
        `Quel est ton objectif principal sur cette échéance : ${context.objective} ?`,
        `Qu'as-tu le plus ajusté dans ta préparation récente ?`,
        `Quel détail tactique peut faire la différence pour toi ?`,
        `Comment ton staff au ${context.club} t'accompagne dans la dernière ligne droite ?`,
        `Quelles sensations recherches-tu la veille de la compétition ?`,
        `Quelle pression positive te pousse à performer ?`,
        `Que veux-tu montrer au public dès ton entrée en action ?`,
        `Comment gères-tu la concentration sur les dernières 24h ?`,
        `Quel message envoies-tu à tes supporters avant l'épreuve ?${extra}`,
      ],
      "Après compétition": [
        `Quel est ton ressenti global juste après la compétition ?`,
        `Quelle partie de ta performance te rend le(la) plus fier(ère) ?`,
        `Quel moment-clé a changé le scénario de ta journée ?`,
        `Que retiens-tu pour la prochaine échéance ?`,
        `Ton objectif initial (${context.objective}) a-t-il évolué ?`,
        `Quel retour as-tu reçu de ton entourage technique ?`,
        `Comment expliques-tu ton niveau d'énergie aujourd'hui ?`,
        `Quelles actions concrètes lances-tu dès cette semaine ?`,
        `Quelle émotion veux-tu partager avec ta communauté ?`,
        `Si c'était à refaire, que changerais-tu ?${extra}`,
      ],
      "Nouveau club": [
        `Qu'est-ce qui t'a convaincu(e) de rejoindre ${context.club} ?`,
        `Quelle première impression as-tu eue de ton nouvel environnement ?`,
        `Comment ce changement soutient-il ton objectif ${context.objective} ?`,
        `Quelles valeurs partages-tu déjà avec ce club ?`,
        `Quel rôle veux-tu prendre au sein du collectif ?`,
        `Comment s'est passée ton intégration avec le staff ?`,
        `Quel aspect de ton jeu veux-tu développer ici ?`,
        `Quelle connexion veux-tu créer avec les supporters ?`,
        `Quel message adresses-tu à ton ancien club et à ton nouveau ?`,
        `Comment imagines-tu ta première saison dans ce contexte ?${extra}`,
      ],
      "Nouveau partenaire": [
        `Qu'est-ce qui rend ce nouveau partenariat naturel pour toi ?`,
        `Comment ce partenaire accompagne ton quotidien d'athlète ?`,
        `Quelle valeur commune vous unit le plus ?`,
        `Comment sélectionnes-tu les collaborations qui te ressemblent ?`,
        `En quoi ce partenariat renforce ton projet ${context.objective} ?`,
        `Quel type de contenu veux-tu créer avec ce partenaire ?`,
        `Quel bénéfice concret vois-tu pour ta communauté ?`,
        `Comment restes-tu authentique dans tes prises de parole sponsorisées ?`,
        `Quel objectif commun vous fixez-vous pour les prochains mois ?`,
        `Quel message veux-tu transmettre aux futurs partenaires ?${extra}`,
      ],
      "Lifestyle": [
        `À quoi ressemble une journée idéale hors compétition ?`,
        `Quels rituels te permettent de garder l'équilibre ?`,
        `Comment ta vie au ${context.club} influence ton quotidien ?`,
        `Quel rôle joue la récupération dans ton hygiène de vie ?`,
        `Comment protèges-tu ton énergie mentale au quotidien ?`,
        `Quels contenus lifestyle plaisent le plus à ta communauté ?`,
        `Quelle habitude simple a le plus d'impact sur tes performances ?`,
        `Comment concilies-tu vie personnelle et objectifs sportifs ?`,
        `Quel lieu te ressource le plus en ce moment ?`,
        `Quelle facette de toi les gens connaissent encore mal ?${extra}`,
      ],
      "Mental": [
        `Quelle est ta méthode pour gérer la pression ?`,
        `Comment rebondis-tu après un moment difficile ?`,
        `Quel dialogue intérieur t'aide avant d'entrer en action ?`,
        `Comment travailles-tu la confiance en toi au quotidien ?`,
        `Quelle leçon mentale t'a fait le plus progresser ?`,
        `Comment transformes-tu un échec en moteur ?`,
        `Quel rôle jouent les proches dans ton équilibre mental ?`,
        `As-tu une routine spécifique de visualisation ?`,
        `Quel conseil donnerais-tu à un(e) athlète en doute ?`,
        `Comment définis-tu la résilience dans ton parcours ?${extra}`,
      ],
      "Réseaux sociaux": [
        `Quel est le rôle d'Instagram dans ta communication ?`,
        `Comment choisis-tu les moments à partager ?`,
        `Quels formats fonctionnent le mieux pour toi actuellement ?`,
        `Comment relies-tu tes publications à ton objectif ${context.objective} ?`,
        `Que cherches-tu à transmettre dans tes stories ?`,
        `Comment gères-tu les retours négatifs ou la pression en ligne ?`,
        `Quels contenus issus de tes shootings récents veux-tu valoriser ?`,
        `Comment restes-tu régulier(ère) malgré un emploi du temps intense ?`,
        `Quelle collaboration digitale t'a le plus marqué(e) ?`,
        `Quel message central veux-tu porter cette saison ?${extra}`,
      ],
      "Questions rapides": [
        `Ton objectif numéro 1 en ce moment ?`,
        `Ton meilleur souvenir de compétition ?`,
        `Un mot pour décrire ${context.club} ?`,
        `Ton rituel avant effort ?`,
        `Un partenaire qui t'inspire ?`,
        `Ton contenu préféré à publier ?`,
        `Le plus gros défi cette saison ?`,
        `Ce qui te motive quand c'est dur ?`,
        `Un conseil pour les jeunes sportifs ?`,
        `Ta promesse à ta communauté ?${extra}`,
      ],
      "Interview complète": [
        ...portraitQuestions,
        ...[
          `Que t'apprend ton historique récent sur ta progression ?`,
          `Comment analyses-tu tes derniers shootings : ${context.recentShootings} ?`,
          `Quel bilan fais-tu de tes dernières publications : ${context.recentPublications} ?`,
          `Comment collabores-tu avec tes partenaires : ${context.partners} ?`,
          `Quelle partie de ton palmarès veux-tu enrichir en priorité ?`,
          `Quel axe de performance travailles-tu le plus actuellement ?`,
          `Comment gères-tu ton rythme entre entraînements et médias ?`,
          `Quel contenu premium souhaiterais-tu créer prochainement ?`,
          `Qu'attends-tu de tes prochaines apparitions publiques ?`,
          `Qu'est-ce qui te rend le(la) plus fier(ère) hors résultats ?`,
          `Quel retour de ta communauté t'a le plus touché(e) ?`,
          `Comment prépares-tu la suite de la saison ?`,
          `Quel impact veux-tu laisser dans ton sport ?`,
          `Si tu devais résumer l'année en une phrase ?`,
          `Quelle est la prochaine grande étape de ton histoire ?${extra}`,
        ],
      ],
      "Tu préfères... ?": [
        `Tu préfères un entraînement ultra tôt ou une session tardive avant la nuit ?`,
        `Tu préfères travailler la technique pure ou l'explosivité sur ${context.sport} ?`,
        `Tu préfères une victoire d'un point ou une victoire large et maîtrisée ?`,
        `Tu préfères un public survolté ou un environnement totalement calme ?`,
        `Tu préfères commencer fort ou finir en sprint final ?`,
        `Tu préfères une playlist motivante ou le silence complet juste avant la perf ?`,
        `Tu préfères un défi individuel ou un challenge en duo avec un(e) coéquipier(e) ?`,
        `Tu préfères une séance courte très intense ou longue et progressive ?`,
        `Tu préfères performer sous pression ou sans enjeu particulier ?`,
        `Tu préfères un équipement 100% confort ou 100% performance ?`,
        `Tu préfères analyser tes stats tout de suite ou à froid le lendemain ?`,
        `Tu préfères improviser pendant l'effort ou suivre un plan millimétré ?`,
        `Tu préfères un stage en montagne ou en bord de mer pour préparer la saison ?`,
        `Tu préfères créer du contenu backstage ou du contenu action pure ?`,
        `Tu préfères un entraînement en solo ou avec tout le groupe du ${context.club} ?`,
        `Tu préfères te challenger sur tes points faibles ou renforcer tes points forts ?`,
        `Tu préfères un objectif court terme ou un gros cap à long terme ?`,
        `Tu préfères une routine stricte ou une organisation plus flexible à ${context.ageText} ?`,
        `Tu préfères un moment de récupération active ou de repos total après compétition ?`,
        `Tu préfères célébrer une perf discrètement ou la partager en direct avec ta communauté ?${extra}`,
      ],
      "Rafale": [
        `Ton mot-clé de la semaine ?`,
        `Ton meilleur réflexe avant un effort ?`,
        `Un lieu qui te booste instantanément ?`,
        `Le son qui te met en mode compétition ?`,
        `Un rituel que tu ne changes jamais ?`,
        `Ton point fort numéro 1 aujourd'hui ?`,
        `L'objectif le plus concret de ce mois ?`,
        `Une qualité de ${context.sport} que tu admires ?`,
        `Ton contenu favori à poster en ce moment ?`,
        `Une phrase qui résume ton état d'esprit ?${extra}`,
      ],
      "Vrai ou faux": [
        `Vrai ou faux: tu préfères l'entraînement matinal aux séances du soir ?`,
        `Vrai ou faux: la partie mentale compte autant que la partie physique ?`,
        `Vrai ou faux: tu regardes souvent tes anciennes performances pour progresser ?`,
        `Vrai ou faux: les jours sans motivation peuvent devenir les plus productifs ?`,
        `Vrai ou faux: ton environnement au ${context.club} influence fortement ton niveau ?`,
        `Vrai ou faux: tu prends plaisir à parler de tes objectifs publiquement ?`,
        `Vrai ou faux: tu aimes improviser sur certains contenus réseaux ?`,
        `Vrai ou faux: la récupération est ton avantage caché ?`,
        `Vrai ou faux: tu veux marquer cette saison d'une façon différente ?`,
        `Vrai ou faux: tu es prêt(e) à sortir de ta zone de confort maintenant ?${extra}`,
      ],
      "Finir les phrases": [
        `Ce qui me motive le plus quand je doute, c'est...`,
        `La valeur que je veux défendre dans ${context.sport}, c'est...`,
        `Mon objectif principal de saison est...`,
        `Quand je pense à ${context.club}, je pense à...`,
        `Le moment de ma carrière que je n'oublierai jamais, c'est...`,
        `Pour progresser encore, je dois surtout...`,
        `Mon public me donne de l'énergie quand...`,
        `Mon prochain cap personnel, c'est...`,
        `En dehors des résultats, je suis fier(ère) de...`,
        `Aujourd'hui, je veux surtout transmettre...${extra}`,
      ],
      "En dehors du sport": [
        `Comment décroches-tu mentalement en dehors de ${context.sport} ?`,
        `Quelles activités te ressourcent le plus ?`,
        `Quel type de musique accompagne ton quotidien hors entraînement ?`,
        `Comment organises-tu ton équilibre vie perso / vie sportive ?`,
        `Quelle habitude simple te fait du bien chaque semaine ?`,
        `Quel contenu non sportif aimes-tu partager avec ta communauté ?`,
        `Quel endroit te permet vraiment de souffler ?`,
        `Comment ton entourage t'aide à rester aligné(e) ?`,
        `Quelle passion aimerais-tu développer davantage ?`,
        `Quel trait de ta personnalité ressort le plus hors compétition ?${extra}`,
      ],
      "Coéquipiers": [
        `Quelle qualité tu apprécies le plus chez tes coéquipiers ?`,
        `Comment définis-tu une bonne alchimie de groupe ?`,
        `Quel rôle prends-tu naturellement dans l'équipe ?`,
        `Quel souvenir collectif t'a le plus marqué(e) ?`,
        `Comment le groupe t'aide à rester exigeant(e) ?`,
        `Qu'est-ce qui rend l'ambiance de ${context.club} particulière ?`,
        `Quel conseil donnerais-tu à un nouveau coéquipier ?`,
        `Comment gérez-vous les moments de pression ensemble ?`,
        `Quelle valeur de groupe veux-tu renforcer cette saison ?`,
        `Quel message veux-tu envoyer à tes coéquipiers aujourd'hui ?${extra}`,
      ],
    };

    return interviewByType[format] ?? portraitQuestions;
  };

  const hashText = (value: string) => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  const createRandom = (seed: number) => {
    let state = seed % 2147483647;
    if (state <= 0) state += 2147483646;
    return () => {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    };
  };

  const buildInterviewQuestionPool = (
    format: MediaInterviewFormat,
    complementaryInfo: string
  ) => {
    const context = buildAthleteContentContext();
    const baseQuestions = generateQuestionsForFormat(format, complementaryInfo);
    const complementaryTag = complementaryInfo.trim()
      ? ` Info complémentaire: ${complementaryInfo.trim()}.`
      : "";

    const extensionQuestions = [
      `Quel objectif concret te fixes-tu pour les 7 prochains jours en ${context.sport} ?${complementaryTag}`,
      `Quelle habitude quotidienne t'aide le plus à progresser avec ${context.club} ?${complementaryTag}`,
      `Quel détail technique veux-tu améliorer en priorité ce mois-ci ?${complementaryTag}`,
      `Quel contenu aimerais-tu partager davantage avec ta communauté ?${complementaryTag}`,
      `Comment veux-tu faire évoluer ton image d'athlète cette saison ?${complementaryTag}`,
      `Quel moment récent t'a donné le plus de confiance ?${complementaryTag}`,
      `Quel conseil aurais-tu aimé recevoir plus tôt dans ton parcours ?${complementaryTag}`,
      `Qu'est-ce qui te motive dans les jours où l'énergie est plus basse ?${complementaryTag}`,
      `Quel message veux-tu transmettre après ton prochain shooting ?${complementaryTag}`,
      `Quelle action simple peut améliorer ton organisation cette semaine ?${complementaryTag}`,
      `Quel aspect de ton palmarès veux-tu enrichir en priorité ?${complementaryTag}`,
      `Quel rôle jouent tes partenaires (${context.partners}) dans ta progression ?${complementaryTag}`,
      `Quel format de contenu te ressemble le plus aujourd'hui ?${complementaryTag}`,
      `Comment gères-tu la pression avant un objectif important ?${complementaryTag}`,
      `Quel succès non visible est le plus important pour toi en ce moment ?${complementaryTag}`,
      `Quelle routine mentale utilises-tu juste avant de performer ?${complementaryTag}`,
      `Quelle est la prochaine étape clé de ton histoire sportive ?${complementaryTag}`,
      `Quel angle veux-tu mettre en avant dans ton prochain contenu ?${complementaryTag}`,
      `Qu'est-ce qui t'aide à rester constant(e) dans tes efforts ?${complementaryTag}`,
      `Quel indicateur te prouve que tu progresses réellement ?${complementaryTag}`,
      `Si tu résumes ta saison actuelle en une phrase, ce serait laquelle ?${complementaryTag}`,
      `Quelle valeur veux-tu défendre le plus fortement en ${context.sport} ?${complementaryTag}`,
      `Quel retour de ta communauté t'a le plus marqué récemment ?${complementaryTag}`,
      `Quel moment backstage aimerais-tu montrer plus souvent ?${complementaryTag}`,
      `Quelle priorité absolue gardes-tu pour les prochaines semaines ?${complementaryTag}`,
    ];

    const uniquePool: string[] = [];
    const seen = new Set<string>();
    for (const question of [...baseQuestions, ...extensionQuestions]) {
      const normalized = question.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      uniquePool.push(normalized);
    }

    let extraIndex = 1;
    while (uniquePool.length < 60) {
      const base = baseQuestions[(extraIndex - 1) % baseQuestions.length] ?? `Question ${extraIndex}`;
      const variant = `${base} (variante ${extraIndex})`;
      if (!seen.has(variant)) {
        seen.add(variant);
        uniquePool.push(variant);
      }
      extraIndex += 1;
    }

    return uniquePool;
  };

  const pickInterviewQuestions = ({
    format,
    complementaryInfo,
    count,
    generationVersion,
    excluded,
  }: {
    format: MediaInterviewFormat;
    complementaryInfo: string;
    count: number;
    generationVersion: number;
    excluded?: string[];
  }) => {
    const pool = buildInterviewQuestionPool(format, complementaryInfo);
    const random = createRandom(
      hashText(
        `${athlete.name}|${format}|${complementaryInfo}|${generationVersion}|${count}`
      ) + 1
    );

    const banned = new Set((excluded ?? []).map((item) => item.trim()));
    const candidatePool = pool.filter((question) => !banned.has(question.trim()));
    const picked: string[] = [];
    const used = new Set<string>();

    const source = candidatePool.length > 0 ? candidatePool : pool;
    const weighted = source
      .map((question) => ({ question, weight: random() }))
      .sort((a, b) => a.weight - b.weight)
      .map((item) => item.question);

    for (const question of weighted) {
      const normalized = question.trim();
      if (used.has(normalized)) continue;
      used.add(normalized);
      picked.push(question);
      if (picked.length >= count) break;
    }

    let fallbackIndex = 1;
    while (picked.length < count) {
      const fallback = `Question complémentaire ${fallbackIndex} pour ${format.toLowerCase()}.`;
      if (!used.has(fallback)) {
        used.add(fallback);
        picked.push(fallback);
      }
      fallbackIndex += 1;
    }

    return picked;
  };

  const interviewToText = (interview: GeneratedInterview) => {
    const context = buildAthleteContentContext();
    const header = [
      `Interview - ${interview.format}`,
      "",
      "Contexte:",
      `- Nom: ${context.name}`,
      `- Sport: ${context.sport}`,
      `- Age: ${context.ageText}`,
      `- Club: ${context.club}`,
      `- Nationalite: ${context.nationality}`,
      `- Objectifs: ${context.objective}`,
      `- Palmares: ${context.palmares}`,
      `- Partenaires: ${context.partners}`,
      `- Historique: ${context.history}`,
      `- Dernieres publications: ${context.recentPublications}`,
      `- Derniers shootings: ${context.recentShootings}`,
      `- Informations complementaires: ${interview.complementaryInfo || "Aucune"}`,
      "",
      "Questions:",
    ];

    const lines = interview.questions.map((question, index) => `${index + 1}. ${question}`);
    return [...header, ...lines].join("\n");
  };

  const openInterviewModal = () => {
    setShowInterviewModal(true);
    setGeneratedInterview(null);
    setInterviewCopyStatus("");
  };

  const openInstagramModal = () => {
    setShowInstagramModal(true);
    setGeneratedInstagramPost(null);
    setInstagramCopyStatus("");
  };

  const openReelModal = () => {
    setShowReelModal(true);
    setGeneratedReelIdea(null);
    setReelCopyStatus("");
  };

  const openShotlistModal = () => {
    setShowShotlistModal(true);
    setGeneratedShotlist(null);
    setCheckedShotPlans([]);
    setShotlistCopyStatus("");
  };

  const openContentPlannerModal = () => {
    setShowContentPlannerModal(true);
    setGeneratedContentPlanner(null);
    setContentPlannerCopyStatus("");
  };

  const openShootingAssistantModal = () => {
    setShowShootingAssistantModal(true);
    setGeneratedShootingAssistant(null);
    setShootingAssistantCopyStatus("");
  };

  const copyInterview = async () => {
    if (!generatedInterview) return;
    try {
      await navigator.clipboard.writeText(interviewToText(generatedInterview));
      setInterviewCopyStatus("Questions copiees.");
    } catch {
      setInterviewCopyStatus("Copie impossible.");
    }
  };

  const generateInterview = (forcedVersion?: number) => {
    const generationVersion = forcedVersion ?? interviewGenerationVersion;
    const count = Math.max(5, Math.min(30, selectedInterviewQuestionCount));
    const questions = pickInterviewQuestions({
      format: selectedInterviewFormat,
      complementaryInfo: interviewComplementaryInfo,
      count,
      generationVersion,
    });

    setGeneratedInterview({
      format: selectedInterviewFormat,
      complementaryInfo: interviewComplementaryInfo,
      questions,
    });
    setInterviewCopyStatus("");
  };

  const regenerateInterview = () => {
    if (!generatedInterview) return;
    const nextVersion = interviewGenerationVersion + 1;
    const count = Math.max(5, Math.min(30, generatedInterview.questions.length));
    let nextQuestions = pickInterviewQuestions({
      format: generatedInterview.format,
      complementaryInfo: generatedInterview.complementaryInfo,
      count,
      generationVersion: nextVersion,
    });

    const isSameSeries =
      nextQuestions.length === generatedInterview.questions.length &&
      nextQuestions.every((question, index) => question === generatedInterview.questions[index]);

    if (isSameSeries) {
      nextQuestions = pickInterviewQuestions({
        format: generatedInterview.format,
        complementaryInfo: generatedInterview.complementaryInfo,
        count,
        generationVersion: nextVersion + 1,
      });
      setInterviewGenerationVersion(nextVersion + 1);
    } else {
      setInterviewGenerationVersion(nextVersion);
    }

    setGeneratedInterview({
      format: generatedInterview.format,
      complementaryInfo: generatedInterview.complementaryInfo,
      questions: nextQuestions,
    });
    setInterviewCopyStatus("");
  };

  const exportInterviewPdf = () => {
    if (!generatedInterview) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    const content = interviewToText(generatedInterview)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br />");

    win.document.write(`
      <html>
        <head>
          <title>Interview - Export PDF</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; line-height: 1.45; }
            h1 { margin-bottom: 12px; }
            p { color: #334155; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <h1>Interview</h1>
          <p>Utilise "Enregistrer en PDF" dans la fenêtre d'impression.</p>
          <div>${content}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const updateInterviewQuestion = (index: number, value: string) => {
    if (!generatedInterview) return;
    setGeneratedInterview({
      ...generatedInterview,
      questions: generatedInterview.questions.map((question, questionIndex) =>
        questionIndex === index ? value : question
      ),
    });
    setInterviewCopyStatus("");
  };

  const autoResizeInterviewQuestion = (element: HTMLTextAreaElement) => {
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  };

  const replaceInterviewQuestion = (index: number) => {
    if (!generatedInterview) return;

    const currentQuestions = generatedInterview.questions;
    const excluded = currentQuestions.filter((_, questionIndex) => questionIndex !== index);
    const replacement = pickInterviewQuestions({
      format: selectedInterviewFormat,
      complementaryInfo: interviewComplementaryInfo,
      count: 1,
      generationVersion: interviewGenerationVersion + index + currentQuestions.length + 1,
      excluded,
    })[0];

    if (!replacement) return;

    setGeneratedInterview({
      ...generatedInterview,
      questions: currentQuestions.map((question, questionIndex) =>
        questionIndex === index ? replacement : question
      ),
    });
    setInterviewGenerationVersion((current) => current + 1);
    setInterviewCopyStatus("");
  };

  const removeInterviewQuestion = (index: number) => {
    if (!generatedInterview) return;
    setGeneratedInterview({
      ...generatedInterview,
      questions: generatedInterview.questions.filter((_, questionIndex) => questionIndex !== index),
    });
    setInterviewCopyStatus("");
  };

  const addInterviewQuestion = () => {
    if (!generatedInterview) return;

    const nextQuestion = pickInterviewQuestions({
      format: selectedInterviewFormat,
      complementaryInfo: interviewComplementaryInfo,
      count: 1,
      generationVersion: interviewGenerationVersion + generatedInterview.questions.length + 1,
      excluded: generatedInterview.questions,
    })[0];

    if (!nextQuestion) return;

    setGeneratedInterview({
      ...generatedInterview,
      questions: [...generatedInterview.questions, nextQuestion],
    });
    setInterviewGenerationVersion((current) => current + 1);
    setInterviewCopyStatus("");
  };

  const buildInstagramPostDemo = (
    publicationType: InstagramPublicationType,
    tone: InstagramTone,
    language: InstagramLanguage,
    complementaryInfo: string
  ) => {
    const context = buildAthleteContentContext();
    const toneLeadMap: Record<InstagramTone, string> = {
      premium: "Excellence, constance et intention.",
      humain: "Un moment vrai, simple et authentique.",
      dynamique: "Énergie maximale, focus total.",
      sobre: "Discipline, régularité, progression.",
    };

    const publicationLabelMap: Record<InstagramPublicationType, string> = {
      annonce: "Annonce",
      performance: "Performance",
      portrait: "Portrait",
      coulisses: "Coulisses",
      partenaire: "Partenaire",
      remerciement: "Remerciement",
    };

    const typeBodyMap: Record<InstagramPublicationType, string> = {
      annonce: `Nouveau chapitre pour ${context.name}. Prochaine étape en ${context.sport} avec ${context.club}. Objectif: ${context.objective}.`,
      performance: `${context.name} continue d'élever son niveau. Les derniers repères confirment une vraie progression, cap sur la suite.`,
      portrait: `${context.name}, ${context.ageText}, construit un parcours exigeant entre travail quotidien et ambition durable.`,
      coulisses: `Entre préparation, réglages et récupération, voici l'envers du décor de ${context.name} pour performer au bon moment.`,
      partenaire: `Fier de mettre en lumière l'alliance entre ${context.name} et ses partenaires: ${context.partners}.`,
      remerciement: `Merci à toutes les personnes qui accompagnent ${context.name} au quotidien: staff, proches, supporters et partenaires.`,
    };

    const hashtags = [
      `#${context.name.replace(/\s+/g, "")}`,
      `#${context.sport.replace(/\s+/g, "")}`,
      "#KLIQUEOS",
      "#Performance",
      "#AthleteLife",
    ].join(" ");

    const complementaryLine = complementaryInfo.trim()
      ? `\nInfos complémentaires: ${complementaryInfo.trim()}`
      : "";

    const frenchText =
      `${publicationLabelMap[publicationType]}\n\n` +
      `${toneLeadMap[tone]}\n` +
      `${typeBodyMap[publicationType]}\n` +
      `Derniers shootings: ${context.recentShootings}.\n` +
      `Dernières publications: ${context.recentPublications}.` +
      `${complementaryLine}\n\n` +
      `${hashtags}`;

    const englishText =
      `${publicationLabelMap[publicationType]}\n\n` +
      `${toneLeadMap[tone]}\n` +
      `${context.name} keeps building momentum in ${context.sport} with ${context.club}. ` +
      `Current focus: ${context.objective}.\n` +
      `Recent shoots: ${context.recentShootings}.\n` +
      `Recent posts: ${context.recentPublications}.` +
      `${complementaryLine}\n\n` +
      `${hashtags}`;

    if (language === "français") return frenchText;
    if (language === "anglais") return englishText;
    return `${frenchText}\n\n---\n\n${englishText}`;
  };

  const generateInstagramPost = () => {
    const text = buildInstagramPostDemo(
      selectedInstagramPublicationType,
      selectedInstagramTone,
      selectedInstagramLanguage,
      instagramComplementaryInfo
    );
    setGeneratedInstagramPost({
      publicationType: selectedInstagramPublicationType,
      tone: selectedInstagramTone,
      language: selectedInstagramLanguage,
      complementaryInfo: instagramComplementaryInfo,
      text,
    });
    setInstagramCopyStatus("");
  };

  const copyInstagramPost = async () => {
    if (!generatedInstagramPost) return;
    try {
      await navigator.clipboard.writeText(generatedInstagramPost.text);
      setInstagramCopyStatus("Texte copie.");
    } catch {
      setInstagramCopyStatus("Copie impossible.");
    }
  };

  const regenerateInstagramPost = () => {
    if (!generatedInstagramPost) return;
    generateInstagramPost();
  };

  const buildReelIdeaDemo = (
    objective: ReelObjective,
    style: ReelStyle,
    duration: ReelDuration,
    platform: ReelPlatform,
    complementaryInfo: string
  ): GeneratedReelIdea => {
    const context = buildAthleteContentContext();
    const extraInfo = complementaryInfo.trim();

    const conceptByObjective: Record<ReelObjective, string> = {
      "visibilité": `Mini-format signature de ${context.name} pour renforcer la présence en ${context.sport} et montrer un moment fort du quotidien.`,
      "storytelling": `Micro-récit: de la préparation à l'exécution, avec une narration claire autour du parcours de ${context.name}.`,
      "performance": `Focus performance: enchaîner les séquences qui montrent l'intensité, la précision et le progrès de ${context.name}.`,
      "coulisses": `Backstage authentique: routines, détails d'entraînement et organisation avant/après session.`,
      "partenaire": `Activation partenaire: intégrer ${context.partners} de manière naturelle dans le flow sportif de ${context.name}.`,
      "engagement": `Format participatif: poser une question à la communauté pour générer réponses, partages et interactions.`,
    };

    const styleMusicByType: Record<ReelStyle, string> = {
      "dynamique": "Beat rapide, percussions sportives, montage rythmé.",
      "émotionnel": "Piano / ambient léger, montée progressive, respiration narrative.",
      "premium": "Electro minimaliste, texture cinématique propre, tempo maîtrisé.",
      "humoristique": "Son léger et punchy, cuts rapides, sync avec les réactions.",
      "éducatif": "Fond discret, lisible, pour laisser la place aux infos clés.",
    };

    const durationPlanByType: Record<ReelDuration, string[]> = {
      "15 s": [
        "0-3 s: accroche forte et visuelle.",
        "3-10 s: démonstration ultra compacte.",
        "10-15 s: conclusion + CTA.",
      ],
      "30 s": [
        "0-3 s: accroche immédiate.",
        "3-18 s: séquence principale en 2 temps.",
        "18-26 s: variation / angle secondaire.",
        "26-30 s: conclusion + CTA.",
      ],
      "60 s": [
        "0-3 s: accroche forte.",
        "3-20 s: mise en contexte.",
        "20-45 s: coeur du contenu.",
        "45-55 s: point clé / takeaway.",
        "55-60 s: conclusion + CTA.",
      ],
    };

    const platformCTAByType: Record<ReelPlatform, string> = {
      "Instagram": "Dis-moi en commentaire la prochaine étape que tu veux voir.",
      "TikTok": "Commente ton avis et on fait la partie 2.",
      "YouTube Shorts": "Abonne-toi pour la suite de la série performance.",
    };

    const conceptBase = conceptByObjective[objective];
    const concept = extraInfo
      ? `${conceptBase} Angle complémentaire: ${extraInfo}.`
      : conceptBase;

    const hook3s =
      objective === "performance"
        ? `${context.name} en ${context.sport}: 3 secondes pour comprendre le niveau.`
        : objective === "engagement"
        ? `${context.name}: tu ferais quoi à sa place ?`
        : `${context.name} · ${context.sport} · ${context.club} en mode ${style}.`;

    const sceneFlow = [
      `Ouverture: ${hook3s}`,
      `Bloc principal: ${context.recentShootings}.`,
      `Point éditorial: objectif ${context.objective} avec tonalité ${style}.`,
      ...durationPlanByType[duration],
    ];

    const shotsToFilm = [
      "Plan large d'installation / environnement.",
      "Plan serré sur le regard et la concentration.",
      "Plan action principal en mouvement.",
      "Plan détail (mains, équipement, geste technique).",
      "Plan final avec interaction caméra pour le CTA.",
    ];

    const onScreenText = [
      `${context.name} · ${context.sport}`,
      `Objectif: ${context.objective}`,
      `Format: ${objective} · ${style}`,
      `Plateforme: ${platform}`,
    ];

    const shortCaption =
      `${context.name} continue de construire son cap en ${context.sport}. ` +
      `Objectif: ${context.objective}. #${context.name.replace(/\s+/g, "")} #${context.sport.replace(/\s+/g, "")} #KLIQUEOS`;

    return {
      objective,
      style,
      duration,
      platform,
      complementaryInfo,
      concept,
      hook3s,
      sceneFlow,
      shotsToFilm,
      onScreenText,
      musicMood: styleMusicByType[style],
      callToAction: platformCTAByType[platform],
      shortCaption,
    };
  };

  const reelIdeaToText = (idea: GeneratedReelIdea) => {
    const lines = [
      `Idée de Reel - ${idea.platform}`,
      `Objectif: ${idea.objective}`,
      `Style: ${idea.style}`,
      `Durée: ${idea.duration}`,
      `Informations complémentaires: ${idea.complementaryInfo || "Aucune"}`,
      "",
      `Concept: ${idea.concept}`,
      `Accroche 3s: ${idea.hook3s}`,
      "",
      "Déroulé scène par scène:",
      ...idea.sceneFlow.map((item, index) => `${index + 1}. ${item}`),
      "",
      "Plans à filmer:",
      ...idea.shotsToFilm.map((item, index) => `${index + 1}. ${item}`),
      "",
      "Texte à l'écran:",
      ...idea.onScreenText.map((item, index) => `${index + 1}. ${item}`),
      "",
      `Musique / ambiance suggérée: ${idea.musicMood}`,
      `Appel à l'action: ${idea.callToAction}`,
      `Légende courte: ${idea.shortCaption}`,
    ];

    return lines.join("\n");
  };

  const generateReelIdea = () => {
    const idea = buildReelIdeaDemo(
      selectedReelObjective,
      selectedReelStyle,
      selectedReelDuration,
      selectedReelPlatform,
      reelComplementaryInfo
    );
    setGeneratedReelIdea(idea);
    setReelCopyStatus("");
  };

  const copyReelIdea = async () => {
    if (!generatedReelIdea) return;
    try {
      await navigator.clipboard.writeText(reelIdeaToText(generatedReelIdea));
      setReelCopyStatus("Proposition copiee.");
    } catch {
      setReelCopyStatus("Copie impossible.");
    }
  };

  const regenerateReelIdea = () => {
    if (!generatedReelIdea) return;
    generateReelIdea();
  };

  const toggleShotlistFormat = (format: ShotlistExpectedFormat) => {
    setSelectedShotlistFormats((current) => ({
      ...current,
      [format]: !current[format],
    }));
  };

  const buildShotlistDemo = (
    shootingType: ShotlistShootingType,
    objective: ShotlistObjective,
    location: ShotlistLocation,
    duration: ShotlistDuration,
    expectedFormats: ShotlistExpectedFormat[],
    complementaryInfo: string
  ): GeneratedShotlist => {
    const context = buildAthleteContentContext();
    const durationPlanCount: Record<ShotlistDuration, number> = {
      "15 min": 4,
      "30 min": 6,
      "60 min": 8,
      "90 min": 10,
    };

    const basePlans: Omit<ShotPlan, "id" | "suggestedOrder">[] = [
      {
        name: "Plan identité",
        description: `${context.name} dans son environnement ${location}, pour poser l'univers visuel ${objective}.`,
        framing: "Plan large",
        orientation: expectedFormats.includes("horizontal") ? "horizontal" : "vertical",
        poseOrAction: `${context.name} se place face caméra, posture assurée.`,
        priority: "indispensable",
      },
      {
        name: "Plan geste signature",
        description: `Mise en avant d'un geste clé en ${context.sport}, avec intention ${shootingType}.`,
        framing: "Plan moyen",
        orientation: expectedFormats.includes("vertical") ? "vertical" : "horizontal",
        poseOrAction: "Exécution du geste principal en 2 prises (naturelle + intense).",
        priority: "indispensable",
      },
      {
        name: "Plan regard / émotion",
        description: `Créer une connexion émotionnelle autour du parcours ${context.objective}.`,
        framing: "Gros plan",
        orientation: expectedFormats.includes("carré") ? "carré" : "vertical",
        poseOrAction: "Regard caméra, respiration calme, micro-expression authentique.",
        priority: "recommandée",
      },
      {
        name: "Plan mouvement",
        description: `Séquence en déplacement pour dynamiser la narration ${objective}.`,
        framing: "Travelling / suivi",
        orientation: expectedFormats.includes("vidéo") ? "vidéo vertical" : "horizontal",
        poseOrAction: "Action continue sur 5-8 secondes, vitesse progressive.",
        priority: "recommandée",
      },
      {
        name: "Plan détail équipement",
        description: `Focus sur matériel, tenue ou élément utile à l'univers ${shootingType}.`,
        framing: "Très gros plan",
        orientation: expectedFormats.includes("vertical") ? "vertical" : "carré",
        poseOrAction: "Main en action sur l'équipement, mouvement court et net.",
        priority: "bonus",
      },
      {
        name: "Plan partenaire",
        description: `Intégration naturelle d'un partenaire (${context.partners}) sans casser le rythme visuel.`,
        framing: "Plan moyen",
        orientation: "horizontal",
        poseOrAction: "Interaction brève avec branding visible mais discret.",
        priority: objective === "sponsor" || shootingType === "partenaire" ? "indispensable" : "bonus",
      },
      {
        name: "Plan narration courte",
        description: `Capture d'une phrase-clé sur ${context.objective} pour renforcer le storytelling.`,
        framing: "Mi-rapproché",
        orientation: "vertical",
        poseOrAction: "Dire une phrase simple face caméra, ton posé.",
        priority: objective === "storytelling" ? "indispensable" : "recommandée",
      },
      {
        name: "Plan fin / CTA",
        description: "Clôture visuelle forte, pensée pour publication et conversion.",
        framing: "Plan poitrine",
        orientation: expectedFormats.includes("vertical") ? "vertical" : "horizontal",
        poseOrAction: "Geste de conclusion + regard caméra.",
        priority: "indispensable",
      },
      {
        name: "Plan backstage",
        description: "Coulisses rapides pour humaniser le shooting.",
        framing: "Plan séquence",
        orientation: "vidéo vertical",
        poseOrAction: "Transition préparation -> action.",
        priority: "bonus",
      },
      {
        name: "Plan banque médias",
        description: "Visuel intemporel à réutiliser sur plusieurs supports.",
        framing: "Plan américain",
        orientation: "horizontal",
        poseOrAction: "Posture neutre et propre, variations micro-angles.",
        priority: objective === "banque médias" ? "indispensable" : "recommandée",
      },
    ];

    const selectedCount = durationPlanCount[duration];
    const selectedPlans = basePlans.slice(0, selectedCount).map((plan, index) => ({
      ...plan,
      id: `${shootingType}-${objective}-${index + 1}`,
      suggestedOrder: index + 1,
      description:
        complementaryInfo.trim().length > 0 && index === 0
          ? `${plan.description} Info complémentaire: ${complementaryInfo.trim()}.`
          : plan.description,
    }));

    return {
      shootingType,
      objective,
      location,
      duration,
      expectedFormats,
      complementaryInfo,
      plans: selectedPlans,
    };
  };

  const shotlistToText = (shotlist: GeneratedShotlist) => {
    const lines = [
      "Shotlist de démonstration",
      `Type de shooting: ${shotlist.shootingType}`,
      `Objectif: ${shotlist.objective}`,
      `Lieu: ${shotlist.location}`,
      `Durée disponible: ${shotlist.duration}`,
      `Formats attendus: ${shotlist.expectedFormats.join(", ") || "non précisé"}`,
      `Informations complémentaires: ${shotlist.complementaryInfo || "Aucune"}`,
      "",
      "Plans:",
      ...shotlist.plans.map((plan) =>
        [
          `${plan.suggestedOrder}. ${plan.name}`,
          `- Description: ${plan.description}`,
          `- Cadrage: ${plan.framing}`,
          `- Orientation: ${plan.orientation}`,
          `- Pose / action: ${plan.poseOrAction}`,
          `- Priorité: ${plan.priority}`,
        ].join("\n")
      ),
    ];
    return lines.join("\n");
  };

  const generateShotlist = () => {
    const expectedFormats = shotlistExpectedFormats.filter(
      (format) => selectedShotlistFormats[format]
    );
    const shotlist = buildShotlistDemo(
      selectedShotlistShootingType,
      selectedShotlistObjective,
      selectedShotlistLocation,
      selectedShotlistDuration,
      expectedFormats.length > 0 ? expectedFormats : ["vertical"],
      shotlistComplementaryInfo
    );
    setGeneratedShotlist(shotlist);
    setCheckedShotPlans([]);
    setShotlistCopyStatus("");
  };

  const copyShotlist = async () => {
    if (!generatedShotlist) return;
    try {
      await navigator.clipboard.writeText(shotlistToText(generatedShotlist));
      setShotlistCopyStatus("Shotlist copiée.");
    } catch {
      setShotlistCopyStatus("Copie impossible.");
    }
  };

  const regenerateShotlist = () => {
    if (!generatedShotlist) return;
    generateShotlist();
  };

  const printShotlist = () => {
    if (!generatedShotlist) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    const content = shotlistToText(generatedShotlist)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br />");

    win.document.write(`
      <html>
        <head>
          <title>Shotlist</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; line-height: 1.45; }
            h1 { margin-bottom: 12px; }
          </style>
        </head>
        <body>
          <h1>Shotlist</h1>
          <div>${content}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const toggleShotPlanChecked = (planId: string) => {
    setCheckedShotPlans((current) =>
      current.includes(planId)
        ? current.filter((id) => id !== planId)
        : [...current, planId]
    );
  };

  const toggleContentPlannerChannel = (channel: ContentPlannerChannel) => {
    setSelectedContentPlannerChannels((current) => ({
      ...current,
      [channel]: !current[channel],
    }));
  };

  const buildContentPlannerDemo = (
    objective: ContentPlannerObjective,
    duration: ContentPlannerDuration,
    channels: ContentPlannerChannel[],
    complementaryInfo: string
  ): GeneratedContentPlanner => {
    const context = buildAthleteContentContext();
    const selectedChannels: ContentPlannerChannel[] =
      channels.length > 0 ? channels : ["Instagram"];

    const dayTemplatesByDuration: Record<ContentPlannerDuration, string[]> = {
      "1 jour": ["Aujourd'hui"],
      "3 jours": ["Jour 1", "Jour 2", "Jour 3"],
      "1 semaine": ["Lundi", "Mardi", "Jeudi", "Vendredi", "Dimanche"],
      "2 semaines": [
        "Lundi S1",
        "Mardi S1",
        "Jeudi S1",
        "Vendredi S1",
        "Dimanche S1",
        "Mardi S2",
        "Jeudi S2",
        "Dimanche S2",
      ],
      "1 mois": [
        "S1 - Lundi",
        "S1 - Jeudi",
        "S1 - Dimanche",
        "S2 - Mardi",
        "S2 - Vendredi",
        "S2 - Dimanche",
        "S3 - Lundi",
        "S3 - Jeudi",
        "S3 - Samedi",
        "S4 - Mardi",
        "S4 - Vendredi",
        "S4 - Dimanche",
      ],
    };

    const contentIdeasByObjective: Record<
      ContentPlannerObjective,
      Array<{ contentType: string; mainIdea: string; recommendedFormat: string; callToAction: string }>
    > = {
      "Développer la visibilité": [
        {
          contentType: "Reel",
          mainIdea: `Présentation de l'entraînement de ${context.name}`,
          recommendedFormat: "Vidéo verticale 9:16",
          callToAction: "Partage ce Reel à un ami sportif.",
        },
        {
          contentType: "Story",
          mainIdea: "Question / sondage sur la préparation",
          recommendedFormat: "Story interactive",
          callToAction: "Réponds au sondage en story.",
        },
        {
          contentType: "Portrait",
          mainIdea: `Portrait rapide de ${context.name} et de son cap ${context.objective}`,
          recommendedFormat: "Carrousel 4-6 slides",
          callToAction: "Dis en commentaire ton slide préféré.",
        },
        {
          contentType: "Interview",
          mainIdea: `Interview courte sur les coulisses de ${context.sport}`,
          recommendedFormat: "Vidéo 30-60 secondes",
          callToAction: "Pose ta question pour la partie 2.",
        },
        {
          contentType: "Best-of",
          mainIdea: "Best-of de la semaine",
          recommendedFormat: "Montage court + sous-titres",
          callToAction: "Enregistre le post pour le revoir.",
        },
      ],
      "Valoriser une performance": [
        {
          contentType: "Performance highlight",
          mainIdea: `Séquence clé de performance en ${context.sport}`,
          recommendedFormat: "Reel + chiffres en overlay",
          callToAction: "Like si tu veux l'analyse complète.",
        },
        {
          contentType: "Décryptage",
          mainIdea: "Analyse d'un geste technique déterminant",
          recommendedFormat: "Vidéo face cam + cutaways",
          callToAction: "Commente le point le plus marquant.",
        },
        {
          contentType: "Carrousel",
          mainIdea: "Avant / après: progression sur 30 jours",
          recommendedFormat: "Carrousel éducatif",
          callToAction: "Swipe jusqu'à la conclusion.",
        },
        {
          contentType: "Story recap",
          mainIdea: "Top 3 enseignements de la semaine",
          recommendedFormat: "Stories en série",
          callToAction: "Réagis avec un emoji sur ton point fort.",
        },
        {
          contentType: "Interview flash",
          mainIdea: `Retour express de ${context.name} après effort`,
          recommendedFormat: "Interview verticale",
          callToAction: "Partage la vidéo avec ton équipe.",
        },
      ],
      "Trouver des partenaires": [
        {
          contentType: "Brand fit",
          mainIdea: "Valeurs de l'athlète et axes de collaboration",
          recommendedFormat: "Post LinkedIn structuré",
          callToAction: "Contacte-nous pour une collaboration.",
        },
        {
          contentType: "Behind the scenes",
          mainIdea: "Montrer le professionnalisme hors terrain",
          recommendedFormat: "Reel coulisses",
          callToAction: "Identifie une marque qui partage ces valeurs.",
        },
        {
          contentType: "Case study",
          mainIdea: "Résultats d'une activation passée",
          recommendedFormat: "Carrousel KPI",
          callToAction: "DM pour recevoir le media kit.",
        },
        {
          contentType: "Témoignage",
          mainIdea: "Retour d'expérience d'un partenaire",
          recommendedFormat: "Capsule vidéo courte",
          callToAction: "Discutons d'un partenariat adapté.",
        },
        {
          contentType: "Annonce",
          mainIdea: "Ouverture à de nouveaux partenaires",
          recommendedFormat: "Post + callout clair",
          callToAction: "Envoyer un message privé pour échanger.",
        },
      ],
      "Fidéliser la communauté": [
        {
          contentType: "Story interactive",
          mainIdea: "Q&A avec la communauté",
          recommendedFormat: "Stories questions",
          callToAction: "Pose ta question maintenant.",
        },
        {
          contentType: "Routine",
          mainIdea: "Routine quotidienne avant entraînement",
          recommendedFormat: "Reel court",
          callToAction: "Partage ta propre routine.",
        },
        {
          contentType: "Coulisses",
          mainIdea: "Ce qu'on ne voit pas d'habitude",
          recommendedFormat: "Photo + légende narrative",
          callToAction: "Réagis avec ton moment préféré.",
        },
        {
          contentType: "Interview communauté",
          mainIdea: "Réponses aux questions fréquentes",
          recommendedFormat: "Interview verticale",
          callToAction: "Commente la prochaine question à traiter.",
        },
        {
          contentType: "Best-of",
          mainIdea: "Temps forts de la semaine avec la commu",
          recommendedFormat: "Montage vidéo / carrousel",
          callToAction: "Sauvegarde pour ne rien manquer.",
        },
      ],
      "Mettre en avant un sponsor": [
        {
          contentType: "Activation sponsor",
          mainIdea: `Mise en avant d'un sponsor dans la préparation de ${context.name}`,
          recommendedFormat: "Reel produit intégré",
          callToAction: "Découvre la collaboration en bio.",
        },
        {
          contentType: "Story produit",
          mainIdea: "Usage concret du produit en situation réelle",
          recommendedFormat: "Stories en 3 étapes",
          callToAction: "Swipe pour plus d'infos.",
        },
        {
          contentType: "Carrousel co-brandé",
          mainIdea: "Valeurs communes athlète + sponsor",
          recommendedFormat: "Carrousel image + texte",
          callToAction: "Tag un ami intéressé.",
        },
        {
          contentType: "Interview partenaire",
          mainIdea: "Pourquoi ce partenariat a du sens",
          recommendedFormat: "Vidéo interview 45 secondes",
          callToAction: "Commente ce que tu veux voir ensuite.",
        },
        {
          contentType: "Récap hebdo sponsor",
          mainIdea: "Best moments sponsorisés de la semaine",
          recommendedFormat: "Montage best-of",
          callToAction: "Partage le format qui t'a le plus plu.",
        },
      ],
      "Annoncer une actualité": [
        {
          contentType: "Annonce officielle",
          mainIdea: `Actualité majeure autour de ${context.name}`,
          recommendedFormat: "Post statique premium",
          callToAction: "Commente pour soutenir cette étape.",
        },
        {
          contentType: "Story update",
          mainIdea: "Point rapide sur l'actualité",
          recommendedFormat: "Story texte + sticker",
          callToAction: "Réagis en story.",
        },
        {
          contentType: "Vidéo contexte",
          mainIdea: "Expliquer le contexte en 30 secondes",
          recommendedFormat: "Vidéo verticale face cam",
          callToAction: "Enregistre ce post pour suivre la suite.",
        },
        {
          contentType: "Interview flash",
          mainIdea: "Réaction à chaud de l'athlète",
          recommendedFormat: "Interview courte",
          callToAction: "Pose ta question pour demain.",
        },
        {
          contentType: "Récap semaine",
          mainIdea: "Synthèse des retombées de l'actualité",
          recommendedFormat: "Carrousel ou best-of",
          callToAction: "Partage l'info à ton réseau.",
        },
      ],
    };

    const templates = contentIdeasByObjective[objective];
    const dayLabels = dayTemplatesByDuration[duration];
    const extraInfoSuffix = complementaryInfo.trim()
      ? ` | Info complémentaire: ${complementaryInfo.trim()}`
      : "";

    const publications = dayLabels.map((dayLabel, index) => {
      const channel = selectedChannels[index % selectedChannels.length];
      const template = templates[index % templates.length];
      return {
        id: `${duration}-${channel}-${index + 1}`,
        date: dayLabel,
        platform: channel,
        contentType: template.contentType,
        objective,
        mainIdea: `${template.mainIdea}${extraInfoSuffix}`,
        recommendedFormat:
          channel === "LinkedIn"
            ? "Post structuré + visuel horizontal"
            : channel === "YouTube"
            ? "Short vertical + titre explicite"
            : template.recommendedFormat,
        callToAction: template.callToAction,
      };
    });

    return {
      objective,
      duration,
      channels: selectedChannels,
      complementaryInfo,
      publications,
    };
  };

  const contentPlannerToText = (planner: GeneratedContentPlanner) => {
    const context = buildAthleteContentContext();
    const lines = [
      "Content Planner - Demonstration",
      `Athlete: ${context.name}`,
      `Sport: ${context.sport}`,
      `Objectif principal: ${planner.objective}`,
      `Duree du plan: ${planner.duration}`,
      `Canaux: ${planner.channels.join(", ")}`,
      `Informations complementaires: ${planner.complementaryInfo || "Aucune"}`,
      "",
      "Planning:",
      ...planner.publications.map((item, index) =>
        [
          `${index + 1}. ${item.date}`,
          `- Plateforme: ${item.platform}`,
          `- Type de contenu: ${item.contentType}`,
          `- Objectif: ${item.objective}`,
          `- Idee principale: ${item.mainIdea}`,
          `- Format conseille: ${item.recommendedFormat}`,
          `- Appel a l'action: ${item.callToAction}`,
        ].join("\n")
      ),
    ];
    return lines.join("\n");
  };

  const generateContentPlanner = () => {
    const channels = contentPlannerChannels.filter(
      (channel) => selectedContentPlannerChannels[channel]
    );
    const planner = buildContentPlannerDemo(
      selectedContentPlannerObjective,
      selectedContentPlannerDuration,
      channels,
      contentPlannerComplementaryInfo
    );
    setGeneratedContentPlanner(planner);
    setContentPlannerCopyStatus("");
  };

  const copyContentPlanner = async () => {
    if (!generatedContentPlanner) return;
    try {
      await navigator.clipboard.writeText(contentPlannerToText(generatedContentPlanner));
      setContentPlannerCopyStatus("Planning copié.");
    } catch {
      setContentPlannerCopyStatus("Copie impossible.");
    }
  };

  const regenerateContentPlanner = () => {
    if (!generatedContentPlanner) return;
    generateContentPlanner();
  };

  const printContentPlanner = () => {
    if (!generatedContentPlanner) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    const content = contentPlannerToText(generatedContentPlanner)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br />");

    win.document.write(`
      <html>
        <head>
          <title>Content Planner</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; line-height: 1.45; }
            h1 { margin-bottom: 12px; }
          </style>
        </head>
        <body>
          <h1>Content Planner</h1>
          <div>${content}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const exportContentPlannerPdf = () => {
    if (!generatedContentPlanner) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    const content = contentPlannerToText(generatedContentPlanner)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br />");

    win.document.write(`
      <html>
        <head>
          <title>Content Planner - Export PDF</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; line-height: 1.45; }
            h1 { margin-bottom: 12px; }
            p { color: #334155; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <h1>Content Planner</h1>
          <p>Utilise "Enregistrer en PDF" dans la fenêtre d'impression.</p>
          <div>${content}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const buildShootingAssistantDemo = (): GeneratedShootingAssistant => {
    const context = buildAthleteContentContext();
    const durationMinutes = Number(selectedShootingAssistantDuration.replace(" min", ""));
    const safeOutfits = Number.isFinite(shootingAssistantOutfitsCount)
      ? Math.max(1, Math.min(20, Math.floor(shootingAssistantOutfitsCount)))
      : 1;
    const safeDeliverables = Number.isFinite(shootingAssistantDeliverablesWanted)
      ? Math.max(1, Math.min(100, Math.floor(shootingAssistantDeliverablesWanted)))
      : 1;
    const equipmentInput = shootingAssistantEquipment.trim();

    const baseEquipment = [
      "Boîtier principal + batterie de secours",
      "Cartes mémoire formatées",
      "Objectif principal adapté au plan",
      "Microfibre + chiffon optique",
      "Smartphone pour backstage stories",
      "Bouteille d'eau / récupération",
    ];

    const userEquipmentItems = equipmentInput
      ? equipmentInput
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    const equipmentChecklist = [
      ...baseEquipment,
      ...userEquipmentItems,
      `Tenues prévues: ${safeOutfits}`,
      `Lieu confirmé: ${selectedShootingAssistantLocation}`,
    ];

    const shotlist = [
      `Plan identité ${context.name} (${selectedShootingAssistantType})`,
      `Plan action principal en ${context.sport}`,
      `Plan émotion / regard caméra sur objectif ${context.objective}`,
      `Plan détail équipement ou geste technique`,
      `Plan partenaire / branding (${context.partners})`,
      "Plan final CTA / clôture",
    ];

    const poseIdeas = [
      "Posture ancrée face caméra, regard direct.",
      "Dynamique en mouvement latéral.",
      "Interaction avec équipement en plan rapproché.",
      "Variation assise / debout selon tenue.",
      "Pose signature liée au sport pratiqué.",
    ];

    const videoIdeas = [
      "Routine d'échauffement en 3 étapes.",
      "Séquence technique avec ralenti.",
      "Backstage préparation + transition action.",
      "Message court de motivation à la communauté.",
    ];

    const reelIdeas = [
      `${context.name} en 20 secondes: intensité + focus.`,
      "Avant / pendant / après: micro-récit de session.",
      "Top 3 points clés de performance du jour.",
    ];

    const storyIdeas = [
      "Story 1: arrivée sur le lieu + contexte.",
      "Story 2: sondage sur la tenue / angle préféré.",
      "Story 3: coulisses matériel et setup.",
      "Story 4: teaser du contenu final.",
    ];

    const recommendedInterview = [
      `Objectif du jour: ${selectedShootingAssistantObjective}`,
      `Comment ${context.name} prépare une séance ${selectedShootingAssistantType.toLowerCase()} ?`,
      "Quel détail technique a fait la différence aujourd'hui ?",
      "Quel message transmettre à la communauté cette semaine ?",
      "Prochaine étape sportive à suivre ?",
    ];

    const minuteByMinutePlan: ShootingAssistantMinuteSlot[] = [];
    const blockSize = durationMinutes >= 90 ? 15 : 10;
    for (let cursor = 0; cursor < durationMinutes; cursor += blockSize) {
      const end = Math.min(durationMinutes, cursor + blockSize);
      const label = `${String(cursor).padStart(2, "0")}-${String(end).padStart(2, "0")} min`;
      const blockIndex = minuteByMinutePlan.length;
      const tasks = [
        "Installation / brief objectifs",
        "Set 1: plans identité + action",
        "Set 2: poses + variations tenues",
        "Captation vidéo / reels",
        "Stories live + interview flash",
        "Review rapide + sécurité des livrables",
      ];
      minuteByMinutePlan.push({
        timeRange: label,
        task: tasks[blockIndex % tasks.length],
      });
    }

    const plannedDeliverables = Array.from({ length: safeDeliverables }).map((_, index) => {
      const order = index + 1;
      if (order <= Math.ceil(safeDeliverables * 0.4)) {
        return `Photo premium ${order} (${selectedShootingAssistantLocation.toLowerCase()})`;
      }
      if (order <= Math.ceil(safeDeliverables * 0.75)) {
        return `Story / format vertical ${order}`;
      }
      return `Clip court / reel ${order}`;
    });

    return {
      shootingType: selectedShootingAssistantType,
      duration: selectedShootingAssistantDuration,
      location: selectedShootingAssistantLocation,
      objective: selectedShootingAssistantObjective,
      equipment: equipmentInput || "Matériel standard du studio",
      outfitsCount: safeOutfits,
      deliverablesWanted: safeDeliverables,
      equipmentChecklist,
      shotlist,
      poseIdeas,
      videoIdeas,
      reelIdeas,
      storyIdeas,
      recommendedInterview,
      minuteByMinutePlan,
      plannedDeliverables,
    };
  };

  const shootingAssistantToText = (plan: GeneratedShootingAssistant) => {
    const context = buildAthleteContentContext();
    return [
      "Shooting Assistant - Plan de preparation",
      `Athlete: ${context.name}`,
      `Sport: ${context.sport}`,
      `Type de shooting: ${plan.shootingType}`,
      `Duree disponible: ${plan.duration}`,
      `Lieu: ${plan.location}`,
      `Objectif: ${plan.objective}`,
      `Materiel utilise: ${plan.equipment}`,
      `Nombre de tenues: ${plan.outfitsCount}`,
      `Nombre de livrables souhaites: ${plan.deliverablesWanted}`,
      "",
      "Checklist materiel:",
      ...plan.equipmentChecklist.map((item) => `- ${item}`),
      "",
      "Shotlist:",
      ...plan.shotlist.map((item, index) => `${index + 1}. ${item}`),
      "",
      "Idees de poses:",
      ...plan.poseIdeas.map((item, index) => `${index + 1}. ${item}`),
      "",
      "Idees de videos:",
      ...plan.videoIdeas.map((item, index) => `${index + 1}. ${item}`),
      "",
      "Idees de Reels:",
      ...plan.reelIdeas.map((item, index) => `${index + 1}. ${item}`),
      "",
      "Idees de stories:",
      ...plan.storyIdeas.map((item, index) => `${index + 1}. ${item}`),
      "",
      "Interview conseillee:",
      ...plan.recommendedInterview.map((item, index) => `${index + 1}. ${item}`),
      "",
      "Planning minute par minute:",
      ...plan.minuteByMinutePlan.map((slot) => `- ${slot.timeRange}: ${slot.task}`),
      "",
      "Livrables prevus:",
      ...plan.plannedDeliverables.map((item, index) => `${index + 1}. ${item}`),
    ].join("\n");
  };

  const prepareShootingAssistant = () => {
    const plan = buildShootingAssistantDemo();
    setGeneratedShootingAssistant(plan);
    setShootingAssistantCopyStatus("");
  };

  const copyShootingAssistant = async () => {
    if (!generatedShootingAssistant) return;
    try {
      await navigator.clipboard.writeText(shootingAssistantToText(generatedShootingAssistant));
      setShootingAssistantCopyStatus("Préparation copiée.");
    } catch {
      setShootingAssistantCopyStatus("Copie impossible.");
    }
  };

  const printShootingAssistant = () => {
    if (!generatedShootingAssistant) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    const content = shootingAssistantToText(generatedShootingAssistant)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br />");

    win.document.write(`
      <html>
        <head>
          <title>Shooting Assistant</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; line-height: 1.45; }
            h1 { margin-bottom: 12px; }
          </style>
        </head>
        <body>
          <h1>Shooting Assistant</h1>
          <div>${content}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const exportShootingAssistantPdf = () => {
    if (!generatedShootingAssistant) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    const content = shootingAssistantToText(generatedShootingAssistant)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br />");

    win.document.write(`
      <html>
        <head>
          <title>Shooting Assistant - Export PDF</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; line-height: 1.45; }
            h1 { margin-bottom: 12px; }
            p { color: #334155; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <h1>Shooting Assistant</h1>
          <p>Utilise "Enregistrer en PDF" dans la fenêtre d'impression.</p>
          <div>${content}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const openSoonMessage = () => {
    window.alert("Bientôt disponible");
  };

  return (
    <>
      <AthleteHeader athlete={athlete} lastShootingLabel={lastShootingLabel} onBack={onBack} />
      <AthleteMainInfo athlete={athlete} />
      {alerts.length > 0 && (
        <section className="panel">
          <p className="eyebrow">Alertes</p>
          <div className="premium-info-list">
            {alerts.map(({ icon, message }, index) => (
              <div key={index}><span>{icon}</span><strong>{message}</strong></div>
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <p className="eyebrow">Score d'activité</p>
        <div className="premium-info-list">
          <div><span>Score</span><strong>{activityScore} / 100</strong></div>
          <div><span>Niveau</span><strong>{activityLevel}</strong></div>
          <div><span>Visibilité</span><strong>{visibilityScore} / 25</strong></div>
          <div><span>Shooting récent</span><strong>{shootScore} / 25</strong></div>
          <div><span>Réponse hebdo</span><strong>{weeklyScore} / 20</strong></div>
          <div><span>Réponse mensuelle</span><strong>{monthlyScore} / 15</strong></div>
          <div><span>Premium restants</span><strong>{premiumScore} / 15</strong></div>
        </div>
      </section>
      {actions.length > 0 && (
        <section className="panel">
          <p className="eyebrow">Actions recommandées</p>
          <div className="premium-info-list">
            {actions.map((action, index) => (
              <div key={index}><span>→</span><strong>{action}</strong></div>
            ))}
          </div>
        </section>
      )}
      <section className="premium-overview-grid">
        <article className="panel premium-panel">
          <p className="eyebrow">Recommandation</p>
          <h3>{recommendation}</h3>
          <div className="premium-info-list">
            <div><span>E-mail</span><strong>{athlete.email || "À compléter"}</strong></div>
            <div><span>Téléphone</span><strong>{athlete.phone || "À compléter"}</strong></div>
            <div><span>Objectif</span><strong>{athlete.objective || "À définir"}</strong></div>
            <div><span>Long terme</span><strong>{athlete.longTerm || "À définir"}</strong></div>
          </div>
        </article>
        <article className="panel premium-insight">
          <div className="insight-icon">✦</div>
          <p className="eyebrow">Analyse KLIQUE</p>
          <h3>{athlete.nextAction || recommendation}</h3>
          <p>Cette fiche est alimentée par la base réelle Google Sheets.</p>
        </article>
        <article className="panel premium-panel athlete-shootings-panel">
          <p className="eyebrow">Shootings</p>
          <h3>{athleteShootings.length} shooting(s) enregistré(s)</h3>
          <div className="athlete-shooting-list">
            {athleteShootings.length ? (
              athleteShootings.map((shooting, index) => {
                const progress = shootingProgress(shooting);
                return (
                  <button
                    type="button"
                    className="athlete-shooting-card"
                    key={`${shooting.row ?? index}-${shooting.date}-${shooting.type}`}
                    onClick={() => setSelectedShooting(shooting)}
                  >
                    <div>
                      <span>{shooting.date || "Date à compléter"}</span>
                      <strong>{shooting.type || "Shooting"}</strong>
                      <small>{shooting.place || "Lieu à compléter"} · {shooting.status || "Statut à compléter"}</small>
                    </div>
                    <div className="athlete-shooting-progress">
                      <b>{progress}%</b>
                      <i><span style={{ width: `${progress}%` }} /></i>
                    </div>
                  </button>
                );
              })
            ) : (
              <p>Aucun shooting lié à cet athlète.</p>
            )}
          </div>
        </article>
      </section>

      {selectedShooting && (
        <Modal
          title={`${selectedShooting.athlete} · ${selectedShooting.type || "Shooting"}`}
          onClose={() => setSelectedShooting(null)}
        >
          <div className="athlete-shooting-modal">
            <section className="athlete-shooting-modal-hero">
              <div>
                <p className="eyebrow">{selectedShooting.date} · {selectedShooting.sport}</p>
                <h3>{selectedShooting.type || "Shooting"}</h3>
                <p>{selectedShooting.place || "Lieu à compléter"}</p>
              </div>
              <div>
                <span>Progression</span>
                <strong>{shootingProgress(selectedShooting)}%</strong>
              </div>
            </section>

            <section className="athlete-shooting-modal-grid">
              <div><span>Statut</span><strong>{selectedShooting.status || "À compléter"}</strong></div>
              <div><span>Photographe</span><strong>{selectedShooting.photographer || "À compléter"}</strong></div>
              <div><span>Photos</span><strong>{selectedShooting.photos}</strong></div>
              <div><span>Vidéos</span><strong>{selectedShooting.videos}</strong></div>
            </section>

            <section className="athlete-shooting-workflow">
              {[
                ["Import", selectedShooting.importDone],
                ["Tri", selectedShooting.sortDone],
                ["Retouche", selectedShooting.retouchDone],
                ["Export", selectedShooting.exportDone],
                ["Drive", selectedShooting.driveDone],
                ["Publication", selectedShooting.published],
              ].map(([label, done]) => (
                <span className={done ? "done" : ""} key={String(label)}>
                  {done ? "✓ " : ""}{String(label)}
                </span>
              ))}
            </section>

            {(selectedShooting.objective || selectedShooting.notes) && (
              <section className="athlete-shooting-notes">
                {selectedShooting.objective && (
                  <div><span>Objectif</span><p>{selectedShooting.objective}</p></div>
                )}
                {selectedShooting.notes && (
                  <div><span>Notes</span><p>{selectedShooting.notes}</p></div>
                )}
              </section>
            )}

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setSelectedShooting(null)}>Fermer</button>
            </div>
          </div>
        </Modal>
      )}

      <section className="athlete-grid-summary">
        <AthleteMedia stats={mediaStats} athlete={athlete} />
      </section>

      <section className="athlete-section-grid">
        <AthleteObjectives athlete={athlete} />
        <AthleteFollowUp athlete={athlete} />
      </section>

      <section className="athlete-section-grid">
        <AthleteExperts expertPartners={linkedPartners} />
      </section>

      <section className="panel premium-panel">
        <p className="eyebrow">Media Assistant</p>
        <h3>Outils de création média</h3>
        <p style={{ marginTop: "0.25rem" }}>
          Sélectionne un assistant pour démarrer la création de contenu.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0.65rem",
            marginTop: "0.85rem",
          }}
        >
          {mediaAssistantActions.map((item) => (
            <article
              key={item.title}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.35)",
                borderRadius: "0.8rem",
                padding: "0.7rem",
                backgroundColor: "rgba(148, 163, 184, 0.08)",
                display: "grid",
                gap: "0.4rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                }}
              >
                <span style={{ fontSize: "1rem" }}>{item.icon}</span>
                <strong>{item.title}</strong>
              </div>
              <small>{item.description}</small>
              <div className="modal-actions" style={{ marginTop: "0.2rem" }}>
                <button
                  className="secondary-button"
                  onClick={
                    item.key === "interview"
                      ? openInterviewModal
                      : item.key === "publication-instagram"
                      ? openInstagramModal
                      : item.key === "idee-reel"
                      ? openReelModal
                      : item.key === "shotlist"
                      ? openShotlistModal
                      : item.key === "content-planner"
                      ? openContentPlannerModal
                      : item.key === "shooting-assistant"
                      ? openShootingAssistantModal
                      : openSoonMessage
                  }
                >
                  Créer
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {showInterviewModal && (
        <Modal
          title="Créer une interview"
          onClose={() => {
            setShowInterviewModal(false);
            setGeneratedInterview(null);
            setInterviewCopyStatus("");
          }}
        >
          <div className="modal-form" style={{ width: "100%", paddingBottom: "0.3rem" }}>
            <section
              className="panel"
              style={{
                margin: "0",
                width: "100%",
                borderColor: "rgba(59, 130, 246, 0.24)",
                backgroundColor: "rgba(15, 23, 42, 0.26)",
                display: "flex",
                flexDirection: "column",
                gap: "0.8rem",
              }}
            >
              <p className="eyebrow">Créer une interview</p>

              <label>
                <span>Format</span>
                <select
                  value={selectedInterviewFormat}
                  onChange={(event) => setSelectedInterviewFormat(event.target.value as MediaInterviewFormat)}
                >
                  {mediaInterviewFormats.map((format) => (
                    <option key={format} value={format}>{format}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Nombre de questions</span>
                <select
                  value={selectedInterviewQuestionCount}
                  onChange={(event) => setSelectedInterviewQuestionCount(Number(event.target.value))}
                >
                  {interviewQuestionCountOptions.map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Informations complémentaires</span>
                <textarea
                  rows={3}
                  value={interviewComplementaryInfo}
                  onChange={(event) => setInterviewComplementaryInfo(event.target.value)}
                  placeholder="Contexte, angle éditorial, contrainte de ton, etc."
                />
              </label>

              <div className="modal-actions" style={{ justifyContent: "center", marginTop: "0.2rem" }}>
                <button className="primary-button" onClick={() => generateInterview()}>
                  Générer
                </button>
              </div>
            </section>

            <section
              className="panel"
              style={{
                marginTop: "0.7rem",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
              }}
            >
              <p className="eyebrow">Liste des questions</p>

              {generatedInterview ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.55rem",
                    width: "100%",
                  }}
                >
                  {generatedInterview.questions.map((question, index) => (
                    <article
                      key={`${generatedInterview.format}-${index}`}
                      className="panel"
                      style={{
                        margin: "0",
                        width: "100%",
                        borderColor: "rgba(148, 163, 184, 0.35)",
                        backgroundColor: "rgba(15, 23, 42, 0.24)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.55rem",
                        padding: "0.75rem",
                      }}
                    >
                      <strong>Question {index + 1}</strong>

                      <textarea
                        rows={1}
                        value={question}
                        onChange={(event) => {
                          updateInterviewQuestion(index, event.target.value);
                          autoResizeInterviewQuestion(event.currentTarget);
                        }}
                        onInput={(event) => autoResizeInterviewQuestion(event.currentTarget)}
                        ref={(element) => {
                          if (element) autoResizeInterviewQuestion(element);
                        }}
                        style={{
                          width: "100%",
                          minHeight: "2.4rem",
                          resize: "none",
                          overflow: "hidden",
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                          writingMode: "horizontal-tb",
                          lineHeight: 1.45,
                          display: "block",
                        }}
                      />

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.6rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <small style={{ color: "#93c5fd", letterSpacing: "0.02em" }}>✨ IA</small>

                        <div className="modal-actions" style={{ marginTop: "0", justifyContent: "flex-end" }}>
                          <button
                            className="secondary-button"
                            onClick={() => replaceInterviewQuestion(index)}
                          >
                            Remplacer
                          </button>
                          <button
                            className="secondary-button"
                            style={{
                              color: "#f87171",
                              borderColor: "rgba(248, 113, 113, 0.42)",
                              backgroundColor: "rgba(248, 113, 113, 0.08)",
                            }}
                            onClick={() => removeInterviewQuestion(index)}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <small>Génère une interview pour afficher les questions éditables.</small>
              )}

              <div className="modal-actions" style={{ marginTop: "0.25rem" }}>
                <button className="secondary-button" onClick={addInterviewQuestion} disabled={!generatedInterview}>
                  + Ajouter une question
                </button>
              </div>
            </section>

            {interviewCopyStatus && <small>{interviewCopyStatus}</small>}

            <div
              className="modal-actions"
              style={{
                position: "sticky",
                bottom: 0,
                zIndex: 2,
                marginTop: "0.75rem",
                paddingTop: "0.7rem",
                paddingBottom: "0.2rem",
                borderTop: "1px solid rgba(148, 163, 184, 0.24)",
                backgroundColor: "rgba(6, 11, 23, 0.96)",
                justifyContent: "space-between",
              }}
            >
              <button className="secondary-button" onClick={copyInterview}>
                Copier
              </button>
              <button
                className="secondary-button"
                onClick={regenerateInterview}
                disabled={!generatedInterview}
              >
                Régénérer
              </button>
              <button
                className="secondary-button"
                onClick={exportInterviewPdf}
                disabled={!generatedInterview}
              >
                Exporter PDF
              </button>
              <button
                className="row-action"
                onClick={() => {
                  setShowInterviewModal(false);
                  setGeneratedInterview(null);
                  setInterviewCopyStatus("");
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showInstagramModal && (
        <Modal
          title="Créer une publication Instagram"
          onClose={() => {
            setShowInstagramModal(false);
            setGeneratedInstagramPost(null);
            setInstagramCopyStatus("");
          }}
        >
          <div className="modal-form">
            <label>
              <span>Type de publication</span>
              <select
                value={selectedInstagramPublicationType}
                onChange={(event) =>
                  setSelectedInstagramPublicationType(
                    event.target.value as InstagramPublicationType
                  )
                }
              >
                {instagramPublicationTypes.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Ton</span>
              <select
                value={selectedInstagramTone}
                onChange={(event) =>
                  setSelectedInstagramTone(event.target.value as InstagramTone)
                }
              >
                {instagramTones.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Langue</span>
              <select
                value={selectedInstagramLanguage}
                onChange={(event) =>
                  setSelectedInstagramLanguage(event.target.value as InstagramLanguage)
                }
              >
                {instagramLanguages.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Informations complémentaires</span>
              <textarea
                rows={3}
                value={instagramComplementaryInfo}
                onChange={(event) => setInstagramComplementaryInfo(event.target.value)}
                placeholder="Contexte, axe éditorial, CTA, détail partenaire, etc."
              />
            </label>

            <div className="modal-actions" style={{ marginTop: "0.2rem" }}>
              <button className="primary-button" onClick={generateInstagramPost}>
                Générer
              </button>
            </div>

            {generatedInstagramPost && (
              <section className="panel" style={{ marginTop: "0.55rem" }}>
                <p className="eyebrow">Texte de démonstration</p>
                <p style={{ whiteSpace: "pre-wrap", marginTop: "0.35rem" }}>
                  {generatedInstagramPost.text}
                </p>
              </section>
            )}

            {instagramCopyStatus && <small>{instagramCopyStatus}</small>}

            <div className="modal-actions">
              <button className="secondary-button" onClick={copyInstagramPost}>
                Copier
              </button>
              <button
                className="secondary-button"
                onClick={regenerateInstagramPost}
                disabled={!generatedInstagramPost}
              >
                Régénérer
              </button>
              <button
                className="row-action"
                onClick={() => {
                  setShowInstagramModal(false);
                  setGeneratedInstagramPost(null);
                  setInstagramCopyStatus("");
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showReelModal && (
        <Modal
          title="Créer une idée de Reel"
          onClose={() => {
            setShowReelModal(false);
            setGeneratedReelIdea(null);
            setReelCopyStatus("");
          }}
        >
          <div className="modal-form">
            <label>
              <span>Objectif</span>
              <select
                value={selectedReelObjective}
                onChange={(event) =>
                  setSelectedReelObjective(event.target.value as ReelObjective)
                }
              >
                {reelObjectives.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Style</span>
              <select
                value={selectedReelStyle}
                onChange={(event) =>
                  setSelectedReelStyle(event.target.value as ReelStyle)
                }
              >
                {reelStyles.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Durée</span>
              <select
                value={selectedReelDuration}
                onChange={(event) =>
                  setSelectedReelDuration(event.target.value as ReelDuration)
                }
              >
                {reelDurations.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Plateforme</span>
              <select
                value={selectedReelPlatform}
                onChange={(event) =>
                  setSelectedReelPlatform(event.target.value as ReelPlatform)
                }
              >
                {reelPlatforms.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Informations complémentaires</span>
              <textarea
                rows={3}
                value={reelComplementaryInfo}
                onChange={(event) => setReelComplementaryInfo(event.target.value)}
                placeholder="Contrainte créative, partenaire à intégrer, message clé, etc."
              />
            </label>

            <div className="modal-actions" style={{ marginTop: "0.2rem" }}>
              <button className="primary-button" onClick={generateReelIdea}>
                Générer
              </button>
            </div>

            {generatedReelIdea && (
              <section className="panel" style={{ marginTop: "0.55rem" }}>
                <p className="eyebrow">Proposition de démonstration</p>
                <div className="premium-info-list" style={{ marginTop: "0.35rem" }}>
                  <div><span>Concept du Reel</span><strong>{generatedReelIdea.concept}</strong></div>
                  <div><span>Accroche des 3 premières secondes</span><strong>{generatedReelIdea.hook3s}</strong></div>
                  <div>
                    <span>Déroulé scène par scène</span>
                    <strong>{generatedReelIdea.sceneFlow.join(" | ")}</strong>
                  </div>
                  <div>
                    <span>Plans à filmer</span>
                    <strong>{generatedReelIdea.shotsToFilm.join(" | ")}</strong>
                  </div>
                  <div>
                    <span>Texte à l'écran</span>
                    <strong>{generatedReelIdea.onScreenText.join(" | ")}</strong>
                  </div>
                  <div><span>Musique / ambiance suggérée</span><strong>{generatedReelIdea.musicMood}</strong></div>
                  <div><span>Appel à l'action</span><strong>{generatedReelIdea.callToAction}</strong></div>
                  <div><span>Légende courte</span><strong>{generatedReelIdea.shortCaption}</strong></div>
                </div>
              </section>
            )}

            {reelCopyStatus && <small>{reelCopyStatus}</small>}

            <div className="modal-actions">
              <button className="secondary-button" onClick={copyReelIdea}>
                Copier
              </button>
              <button
                className="secondary-button"
                onClick={regenerateReelIdea}
                disabled={!generatedReelIdea}
              >
                Régénérer
              </button>
              <button
                className="row-action"
                onClick={() => {
                  setShowReelModal(false);
                  setGeneratedReelIdea(null);
                  setReelCopyStatus("");
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showShotlistModal && (
        <Modal
          title="Créer une shotlist"
          onClose={() => {
            setShowShotlistModal(false);
            setGeneratedShotlist(null);
            setCheckedShotPlans([]);
            setShotlistCopyStatus("");
          }}
        >
          <div className="modal-form">
            <label>
              <span>Type de shooting</span>
              <select
                value={selectedShotlistShootingType}
                onChange={(event) =>
                  setSelectedShotlistShootingType(
                    event.target.value as ShotlistShootingType
                  )
                }
              >
                {shotlistShootingTypes.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Objectif</span>
              <select
                value={selectedShotlistObjective}
                onChange={(event) =>
                  setSelectedShotlistObjective(event.target.value as ShotlistObjective)
                }
              >
                {shotlistObjectives.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Lieu</span>
              <select
                value={selectedShotlistLocation}
                onChange={(event) =>
                  setSelectedShotlistLocation(event.target.value as ShotlistLocation)
                }
              >
                {shotlistLocations.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Durée disponible</span>
              <select
                value={selectedShotlistDuration}
                onChange={(event) =>
                  setSelectedShotlistDuration(event.target.value as ShotlistDuration)
                }
              >
                {shotlistDurations.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <div>
              <span style={{ display: "block", marginBottom: "0.3rem" }}>Formats attendus</span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "0.35rem",
                }}
              >
                {shotlistExpectedFormats.map((format) => (
                  <label
                    key={format}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      border: "1px solid rgba(148, 163, 184, 0.35)",
                      borderRadius: "0.55rem",
                      padding: "0.4rem 0.5rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedShotlistFormats[format]}
                      onChange={() => toggleShotlistFormat(format)}
                    />
                    <span>{format}</span>
                  </label>
                ))}
              </div>
            </div>

            <label>
              <span>Informations complémentaires</span>
              <textarea
                rows={3}
                value={shotlistComplementaryInfo}
                onChange={(event) => setShotlistComplementaryInfo(event.target.value)}
                placeholder="Contrainte créative, message à intégrer, priorité terrain, etc."
              />
            </label>

            <div className="modal-actions" style={{ marginTop: "0.2rem" }}>
              <button className="primary-button" onClick={generateShotlist}>
                Générer
              </button>
            </div>

            {generatedShotlist && (
              <section className="panel" style={{ marginTop: "0.55rem" }}>
                <p className="eyebrow">Shotlist de démonstration</p>
                <div className="task-list" style={{ marginTop: "0.35rem" }}>
                  {generatedShotlist.plans.map((plan) => (
                    <label
                      key={plan.id}
                      className="task-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr",
                        alignItems: "start",
                        gap: "0.55rem",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checkedShotPlans.includes(plan.id)}
                        onChange={() => toggleShotPlanChecked(plan.id)}
                        style={{ marginTop: "0.2rem" }}
                      />
                      <div>
                        <strong>
                          {plan.suggestedOrder}. {plan.name}
                        </strong>
                        <small>{plan.description}</small>
                        <small>Cadrage: {plan.framing}</small>
                        <small>Orientation: {plan.orientation}</small>
                        <small>Pose / action: {plan.poseOrAction}</small>
                        <small>Priorité: {plan.priority}</small>
                      </div>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {shotlistCopyStatus && <small>{shotlistCopyStatus}</small>}

            <div className="modal-actions">
              <button className="secondary-button" onClick={copyShotlist}>
                Copier
              </button>
              <button
                className="secondary-button"
                onClick={regenerateShotlist}
                disabled={!generatedShotlist}
              >
                Régénérer
              </button>
              <button
                className="secondary-button"
                onClick={printShotlist}
                disabled={!generatedShotlist}
              >
                Imprimer
              </button>
              <button
                className="row-action"
                onClick={() => {
                  setShowShotlistModal(false);
                  setGeneratedShotlist(null);
                  setCheckedShotPlans([]);
                  setShotlistCopyStatus("");
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showContentPlannerModal && (
        <Modal
          title="Créer un Content Planner"
          onClose={() => {
            setShowContentPlannerModal(false);
            setGeneratedContentPlanner(null);
            setContentPlannerCopyStatus("");
          }}
        >
          <div className="modal-form">
            <label>
              <span>Objectif principal</span>
              <select
                value={selectedContentPlannerObjective}
                onChange={(event) =>
                  setSelectedContentPlannerObjective(
                    event.target.value as ContentPlannerObjective
                  )
                }
              >
                {contentPlannerObjectives.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Durée du plan</span>
              <select
                value={selectedContentPlannerDuration}
                onChange={(event) =>
                  setSelectedContentPlannerDuration(
                    event.target.value as ContentPlannerDuration
                  )
                }
              >
                {contentPlannerDurations.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <div>
              <span style={{ display: "block", marginBottom: "0.3rem" }}>Canaux</span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "0.35rem",
                }}
              >
                {contentPlannerChannels.map((channel) => (
                  <label
                    key={channel}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      border: "1px solid rgba(148, 163, 184, 0.35)",
                      borderRadius: "0.55rem",
                      padding: "0.4rem 0.5rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedContentPlannerChannels[channel]}
                      onChange={() => toggleContentPlannerChannel(channel)}
                    />
                    <span>{channel}</span>
                  </label>
                ))}
              </div>
            </div>

            <label>
              <span>Informations complémentaires</span>
              <textarea
                rows={3}
                value={contentPlannerComplementaryInfo}
                onChange={(event) => setContentPlannerComplementaryInfo(event.target.value)}
                placeholder="Contexte, lancement à annoncer, campagne sponsor, etc."
              />
            </label>

            <div className="modal-actions" style={{ marginTop: "0.2rem" }}>
              <button className="primary-button" onClick={generateContentPlanner}>
                Générer
              </button>
            </div>

            {generatedContentPlanner && (
              <section className="panel" style={{ marginTop: "0.55rem" }}>
                <p className="eyebrow">Planning de contenu de démonstration</p>
                <div className="task-list" style={{ marginTop: "0.35rem" }}>
                  {generatedContentPlanner.publications.map((item) => (
                    <article
                      key={item.id}
                      className="task-row"
                      style={{
                        display: "grid",
                        gap: "0.2rem",
                        alignItems: "start",
                      }}
                    >
                      <strong>{item.date}</strong>
                      <small>
                        {item.platform} · {item.contentType}
                      </small>
                      <small>Objectif: {item.objective}</small>
                      <small>Idée principale: {item.mainIdea}</small>
                      <small>Format conseillé: {item.recommendedFormat}</small>
                      <small>Appel à l'action: {item.callToAction}</small>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {contentPlannerCopyStatus && <small>{contentPlannerCopyStatus}</small>}

            <div className="modal-actions">
              <button className="secondary-button" onClick={copyContentPlanner}>
                Copier
              </button>
              <button
                className="secondary-button"
                onClick={regenerateContentPlanner}
                disabled={!generatedContentPlanner}
              >
                Régénérer
              </button>
              <button
                className="secondary-button"
                onClick={printContentPlanner}
                disabled={!generatedContentPlanner}
              >
                Imprimer
              </button>
              <button
                className="secondary-button"
                onClick={exportContentPlannerPdf}
                disabled={!generatedContentPlanner}
              >
                Export PDF
              </button>
              <button
                className="row-action"
                onClick={() => {
                  setShowContentPlannerModal(false);
                  setGeneratedContentPlanner(null);
                  setContentPlannerCopyStatus("");
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showShootingAssistantModal && (
        <Modal
          title="Shooting Assistant"
          onClose={() => {
            setShowShootingAssistantModal(false);
            setGeneratedShootingAssistant(null);
            setShootingAssistantCopyStatus("");
          }}
        >
          <div className="modal-form">
            <label>
              <span>Type de shooting</span>
              <select
                value={selectedShootingAssistantType}
                onChange={(event) =>
                  setSelectedShootingAssistantType(event.target.value as ShootingAssistantType)
                }
              >
                {shootingAssistantTypes.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Durée disponible</span>
              <select
                value={selectedShootingAssistantDuration}
                onChange={(event) =>
                  setSelectedShootingAssistantDuration(
                    event.target.value as ShootingAssistantDuration
                  )
                }
              >
                {shootingAssistantDurations.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Lieu</span>
              <select
                value={selectedShootingAssistantLocation}
                onChange={(event) =>
                  setSelectedShootingAssistantLocation(
                    event.target.value as ShootingAssistantLocation
                  )
                }
              >
                {shootingAssistantLocations.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Objectif</span>
              <select
                value={selectedShootingAssistantObjective}
                onChange={(event) =>
                  setSelectedShootingAssistantObjective(
                    event.target.value as ShootingAssistantObjective
                  )
                }
              >
                {shootingAssistantObjectives.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Matériel utilisé</span>
              <input
                value={shootingAssistantEquipment}
                onChange={(event) => setShootingAssistantEquipment(event.target.value)}
                placeholder="Ex: Sony A7IV, 24-70, 70-200, LED, trépied"
              />
            </label>

            <label>
              <span>Nombre de tenues</span>
              <input
                type="number"
                min={1}
                max={20}
                value={shootingAssistantOutfitsCount}
                onChange={(event) => setShootingAssistantOutfitsCount(Number(event.target.value))}
              />
            </label>

            <label>
              <span>Nombre de livrables souhaités</span>
              <input
                type="number"
                min={1}
                max={100}
                value={shootingAssistantDeliverablesWanted}
                onChange={(event) =>
                  setShootingAssistantDeliverablesWanted(Number(event.target.value))
                }
              />
            </label>

            <div className="modal-actions" style={{ marginTop: "0.2rem" }}>
              <button className="primary-button" onClick={prepareShootingAssistant}>
                Préparer le shooting
              </button>
            </div>

            {generatedShootingAssistant && (
              <section className="panel" style={{ marginTop: "0.55rem" }}>
                <p className="eyebrow">Page de préparation</p>

                <div className="premium-info-list" style={{ marginTop: "0.35rem" }}>
                  <div><span>Type</span><strong>{generatedShootingAssistant.shootingType}</strong></div>
                  <div><span>Durée</span><strong>{generatedShootingAssistant.duration}</strong></div>
                  <div><span>Lieu</span><strong>{generatedShootingAssistant.location}</strong></div>
                  <div><span>Objectif</span><strong>{generatedShootingAssistant.objective}</strong></div>
                  <div><span>Matériel</span><strong>{generatedShootingAssistant.equipment}</strong></div>
                  <div><span>Tenues</span><strong>{generatedShootingAssistant.outfitsCount}</strong></div>
                  <div><span>Livrables</span><strong>{generatedShootingAssistant.deliverablesWanted}</strong></div>
                </div>

                <div className="task-list" style={{ marginTop: "0.45rem" }}>
                  <article className="task-row" style={{ display: "grid", gap: "0.2rem" }}>
                    <strong>Checklist matériel</strong>
                    <small>{generatedShootingAssistant.equipmentChecklist.join(" | ")}</small>
                  </article>

                  <article className="task-row" style={{ display: "grid", gap: "0.2rem" }}>
                    <strong>Shotlist</strong>
                    <small>{generatedShootingAssistant.shotlist.join(" | ")}</small>
                  </article>

                  <article className="task-row" style={{ display: "grid", gap: "0.2rem" }}>
                    <strong>Idées de poses</strong>
                    <small>{generatedShootingAssistant.poseIdeas.join(" | ")}</small>
                  </article>

                  <article className="task-row" style={{ display: "grid", gap: "0.2rem" }}>
                    <strong>Idées de vidéos</strong>
                    <small>{generatedShootingAssistant.videoIdeas.join(" | ")}</small>
                  </article>

                  <article className="task-row" style={{ display: "grid", gap: "0.2rem" }}>
                    <strong>Idées de Reels</strong>
                    <small>{generatedShootingAssistant.reelIdeas.join(" | ")}</small>
                  </article>

                  <article className="task-row" style={{ display: "grid", gap: "0.2rem" }}>
                    <strong>Idées de stories</strong>
                    <small>{generatedShootingAssistant.storyIdeas.join(" | ")}</small>
                  </article>

                  <article className="task-row" style={{ display: "grid", gap: "0.2rem" }}>
                    <strong>Interview conseillée</strong>
                    <small>{generatedShootingAssistant.recommendedInterview.join(" | ")}</small>
                  </article>

                  <article className="task-row" style={{ display: "grid", gap: "0.2rem" }}>
                    <strong>Planning minute par minute</strong>
                    <small>
                      {generatedShootingAssistant.minuteByMinutePlan
                        .map((slot) => `${slot.timeRange}: ${slot.task}`)
                        .join(" | ")}
                    </small>
                  </article>

                  <article className="task-row" style={{ display: "grid", gap: "0.2rem" }}>
                    <strong>Livrables prévus</strong>
                    <small>{generatedShootingAssistant.plannedDeliverables.join(" | ")}</small>
                  </article>
                </div>
              </section>
            )}

            {shootingAssistantCopyStatus && <small>{shootingAssistantCopyStatus}</small>}

            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={copyShootingAssistant}
                disabled={!generatedShootingAssistant}
              >
                Copier
              </button>
              <button
                className="secondary-button"
                onClick={printShootingAssistant}
                disabled={!generatedShootingAssistant}
              >
                Imprimer
              </button>
              <button
                className="secondary-button"
                onClick={exportShootingAssistantPdf}
                disabled={!generatedShootingAssistant}
              >
                Exporter PDF
              </button>
              <button
                className="row-action"
                onClick={() => {
                  setShowShootingAssistantModal(false);
                  setGeneratedShootingAssistant(null);
                  setShootingAssistantCopyStatus("");
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}

      <section className="panel">
        <p className="eyebrow">Historique</p>
        <div className="premium-info-list">
          {[
            { label: "Adhésion KLIQUE",           raw: athlete.adhesionDate },
            { label: "Dernier contact",            raw: athlete.lastContact },
            { label: "Dernière publication",       raw: athlete.lastPublication },
            { label: "Dernier post",               raw: athlete.lastPost },
            { label: "Dernière story",             raw: athlete.lastStory },
            { label: "Dernière réponse hebdo",     raw: athlete.lastResponseWeekly },
            { label: "Dernière réponse mensuelle", raw: athlete.lastResponseMonthly },
            ...athleteShootings.map((s) => ({ label: `Shooting · ${s.type || "Shooting"}`, raw: s.date })),
          ]
            .map(({ label, raw }) => ({ label, date: parseKliqueDate(raw) }))
            .filter((e): e is { label: string; date: Date } => e.date !== null)
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .map(({ label, date }, index) => (
              <div key={index}>
                <span>{label}</span>
                <strong>{formatKliqueDate(date)}</strong>
              </div>
            ))}
        </div>
      </section>
    </>
  );
}
