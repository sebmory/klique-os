export type AthleteSubscriptionPlanCode = "essential" | "impact" | "signature";
export type AthleteSubscriptionInternalPlanCode = "founder";

export type AthleteSubscriptionBenefitCode =
  | "platform"
  | "media_requests"
  | "galleries"
  | "visibility"
  | "opportunities"
  | "partners"
  | "notifications";

export type AthleteContentMediaType =
  | "athlete_information"
  | "editorial_brief"
  | "photo_portrait"
  | "photo_action"
  | "photo_lifestyle"
  | "photo_product"
  | "video_vertical"
  | "video_horizontal"
  | "audio_interview"
  | "quote"
  | "statistics"
  | "partner_assets";

export type AthleteContentFormatCode =
  | "athlete_announcement"
  | "news"
  | "performance"
  | "portrait"
  | "quote"
  | "storytelling_carousel"
  | "story"
  | "reel"
  | "editorial_interview"
  | "video_interview"
  | "partner_activation"
  | "behind_the_scenes";

export type AthleteSubscriptionBenefit = Readonly<{
  code: AthleteSubscriptionBenefitCode;
  name: string;
  description: string;
}>;

export type AthleteContentFormat = Readonly<{
  code: AthleteContentFormatCode;
  name: string;
  description: string;
  requiredMedia: readonly AthleteContentMediaType[];
}>;

export type AthletePhotoSessionInclusion = Readonly<{
  kind: "photo_session";
  imageCount: 20;
}>;

export type AthleteMediaDayInclusion = Readonly<{
  kind: "media_day";
  portraitCount: 35;
  interviewDurationMinutes: readonly [5, 6];
}>;

export type AthleteCompetitionSessionInclusion = Readonly<{
  kind: "match_or_competition_session";
  imageCount: 20;
}>;

export type AthleteSubscriptionProductionInclusion =
  | AthletePhotoSessionInclusion
  | AthleteMediaDayInclusion
  | AthleteCompetitionSessionInclusion;

export type AthleteSubscriptionPlan = Readonly<{
  code: AthleteSubscriptionPlanCode;
  name: string;
  annualPriceChf: number;
  inheritsFrom: AthleteSubscriptionPlanCode | null;
  includedProductions: readonly AthleteSubscriptionProductionInclusion[];
  customContentCount: number;
  aLaCarteDiscountPercent: number;
  commonBenefitCodes: readonly AthleteSubscriptionBenefitCode[];
  contentFormatCodes: readonly AthleteContentFormatCode[];
}>;

export type AthleteSubscriptionInternalPlan = Readonly<{
  code: AthleteSubscriptionInternalPlanCode;
  name: string;
  annualPriceChf: 0;
  includedProductions: readonly [];
  customContentCount: 0;
  aLaCarteDiscountPercent: 0;
  commonBenefitCodes: readonly AthleteSubscriptionBenefitCode[];
  contentFormatCodes: readonly [];
}>;

export const ATHLETE_SUBSCRIPTION_COMMON_BENEFITS = [
  {
    code: "platform",
    name: "Plateforme KLIQUE",
    description: "Accès à l’espace Athlète KLIQUE et à ses services.",
  },
  {
    code: "media_requests",
    name: "Demandes médias",
    description: "Envoi et suivi des demandes médias depuis la plateforme.",
  },
  {
    code: "galleries",
    name: "Galeries",
    description: "Accès aux galeries photo et vidéo livrées par KLIQUE.",
  },
  {
    code: "visibility",
    name: "Visibilité",
    description: "Mise en avant éditoriale de l’athlète dans l’écosystème KLIQUE.",
  },
  {
    code: "opportunities",
    name: "Opportunités",
    description: "Accès aux opportunités pertinentes proposées dans l’écosystème KLIQUE.",
  },
  {
    code: "partners",
    name: "Partenaires",
    description: "Accès au réseau de partenaires et d’experts KLIQUE.",
  },
  {
    code: "notifications",
    name: "Notifications",
    description: "Réception des informations et alertes liées à l’abonnement et aux activités KLIQUE.",
  },
] as const satisfies readonly AthleteSubscriptionBenefit[];

export const ATHLETE_CONTENT_FORMATS = [
  {
    code: "athlete_announcement",
    name: "Annonce Athlète",
    description: "Présentation officielle de l’athlète et de son arrivée dans l’écosystème KLIQUE.",
    requiredMedia: ["athlete_information", "photo_portrait"],
  },
  {
    code: "news",
    name: "Actualité",
    description: "Communication d’une nouvelle sportive, personnelle ou professionnelle.",
    requiredMedia: ["athlete_information", "photo_portrait"],
  },
  {
    code: "performance",
    name: "Performance",
    description: "Valorisation d’un résultat, d’une sélection, d’un record ou d’un temps fort sportif.",
    requiredMedia: ["photo_action", "statistics"],
  },
  {
    code: "portrait",
    name: "Portrait",
    description: "Contenu centré sur la personnalité, le parcours et l’univers de l’athlète.",
    requiredMedia: ["athlete_information", "photo_portrait"],
  },
  {
    code: "quote",
    name: "Citation",
    description: "Prise de parole courte mise en image pour transmettre une idée forte ou une réaction.",
    requiredMedia: ["photo_portrait", "quote"],
  },
  {
    code: "storytelling_carousel",
    name: "Carrousel storytelling",
    description: "Récit en plusieurs écrans pour développer un parcours, une actualité ou une performance.",
    requiredMedia: ["editorial_brief", "photo_portrait", "photo_action"],
  },
  {
    code: "story",
    name: "Story",
    description: "Contenu vertical court conçu pour une information immédiate ou une séquence spontanée.",
    requiredMedia: ["editorial_brief", "video_vertical"],
  },
  {
    code: "reel",
    name: "Reel",
    description: "Vidéo verticale montée pour raconter un moment, une performance ou une prise de parole.",
    requiredMedia: ["editorial_brief", "video_vertical"],
  },
  {
    code: "editorial_interview",
    name: "Interview éditoriale",
    description: "Entretien rédigé qui approfondit le parcours, les objectifs ou l’actualité de l’athlète.",
    requiredMedia: ["athlete_information", "audio_interview", "photo_portrait"],
  },
  {
    code: "video_interview",
    name: "Interview vidéo",
    description: "Entretien filmé et monté pour une diffusion sur les canaux numériques.",
    requiredMedia: ["editorial_brief", "video_horizontal", "audio_interview"],
  },
  {
    code: "partner_activation",
    name: "Activation partenaire",
    description: "Mise en valeur authentique d’un partenaire, d’un produit ou d’une collaboration.",
    requiredMedia: ["editorial_brief", "photo_product", "partner_assets"],
  },
  {
    code: "behind_the_scenes",
    name: "Coulisses",
    description: "Immersion dans la préparation, l’entraînement, le déplacement ou le quotidien de l’athlète.",
    requiredMedia: ["photo_lifestyle", "video_vertical"],
  },
] as const satisfies readonly AthleteContentFormat[];

export const ATHLETE_SUBSCRIPTION_COMMON_BENEFIT_CODES: readonly AthleteSubscriptionBenefitCode[] =
  ATHLETE_SUBSCRIPTION_COMMON_BENEFITS.map(({ code }) => code);

export const ATHLETE_CONTENT_FORMAT_CODES: readonly AthleteContentFormatCode[] =
  ATHLETE_CONTENT_FORMATS.map(({ code }) => code);

export const ATHLETE_SUBSCRIPTION_FOUNDER_PLAN = {
  code: "founder",
  name: "Membre fondateur",
  annualPriceChf: 0,
  includedProductions: [],
  customContentCount: 0,
  aLaCarteDiscountPercent: 0,
  commonBenefitCodes: ATHLETE_SUBSCRIPTION_COMMON_BENEFIT_CODES,
  contentFormatCodes: [],
} as const satisfies AthleteSubscriptionInternalPlan;

export const ATHLETE_SUBSCRIPTION_PLANS = [
  {
    code: "essential",
    name: "Essentiel",
    annualPriceChf: 249,
    inheritsFrom: null,
    includedProductions: [{ kind: "photo_session", imageCount: 20 }],
    customContentCount: 2,
    aLaCarteDiscountPercent: 10,
    commonBenefitCodes: ATHLETE_SUBSCRIPTION_COMMON_BENEFIT_CODES,
    contentFormatCodes: ATHLETE_CONTENT_FORMAT_CODES,
  },
  {
    code: "impact",
    name: "Impact",
    annualPriceChf: 549,
    inheritsFrom: "essential",
    includedProductions: [
      { kind: "photo_session", imageCount: 20 },
      { kind: "media_day", portraitCount: 35, interviewDurationMinutes: [5, 6] },
    ],
    customContentCount: 4,
    aLaCarteDiscountPercent: 20,
    commonBenefitCodes: ATHLETE_SUBSCRIPTION_COMMON_BENEFIT_CODES,
    contentFormatCodes: ATHLETE_CONTENT_FORMAT_CODES,
  },
  {
    code: "signature",
    name: "Signature",
    annualPriceChf: 999,
    inheritsFrom: "impact",
    includedProductions: [
      { kind: "photo_session", imageCount: 20 },
      { kind: "media_day", portraitCount: 35, interviewDurationMinutes: [5, 6] },
      { kind: "match_or_competition_session", imageCount: 20 },
    ],
    customContentCount: 6,
    aLaCarteDiscountPercent: 30,
    commonBenefitCodes: ATHLETE_SUBSCRIPTION_COMMON_BENEFIT_CODES,
    contentFormatCodes: ATHLETE_CONTENT_FORMAT_CODES,
  },
] as const satisfies readonly AthleteSubscriptionPlan[];