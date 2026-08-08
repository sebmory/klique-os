export type ContentContextType = "athlete" | "club" | "partner" | "organization" | "other";

export type ContentCreationContext = {
  mode: "free" | "contextual";
  subjectName?: string;
  subjectId?: string;
  subjectType?: ContentContextType;
  objective?: ContentGeneratorId;
};

export type ContentGeneratorId =
  | "interview"
  | "publication"
  | "reel"
  | "story"
  | "podcast"
  | "article"
  | "campaign";

export type ContentGenerator = {
  id: ContentGeneratorId;
  title: string;
  description: string;
  isAvailable: boolean;
  statusLabel: "Disponible" | "Bientot disponible";
  entryRoute: string;
};

export type ContentTemplateId =
  | "portrait-athlete"
  | "before-match"
  | "after-match"
  | "new-contract"
  | "behind-the-scenes"
  | "fast-questions"
  | "partner-interview"
  | "match-day-story";

export type ContentTemplate = {
  id: ContentTemplateId;
  title: string;
  description: string;
};

const generators: ContentGenerator[] = [
  {
    id: "interview",
    title: "Interview",
    description: "Structurez rapidement des interviews impactantes pour vos talents.",
    isAvailable: true,
    statusLabel: "Disponible",
    entryRoute: "/contents/create",
  },
  {
    id: "publication",
    title: "Publication",
    description: "Preparez des posts clairs pour reseaux sociaux et plateformes.",
    isAvailable: true,
    statusLabel: "Disponible",
    entryRoute: "/contents/create?objective=publication",
  },
  {
    id: "reel",
    title: "Reel",
    description: "Posez un script court et un angle creatif en quelques clics.",
    isAvailable: true,
    statusLabel: "Disponible",
    entryRoute: "/contents/create?objective=reel&contentType=reel",
  },
  {
    id: "story",
    title: "Story",
    description: "Cadrez une sequence Story concise avec hook et call to action.",
    isAvailable: false,
    statusLabel: "Bientot disponible",
    entryRoute: "/contents/create",
  },
  {
    id: "podcast",
    title: "Podcast",
    description: "Montez un plan editorial audio avec themes et segments invites.",
    isAvailable: false,
    statusLabel: "Bientot disponible",
    entryRoute: "/contents/create",
  },
  {
    id: "article",
    title: "Article",
    description: "Definissez angle, structure et sections pour un article solide.",
    isAvailable: false,
    statusLabel: "Bientot disponible",
    entryRoute: "/contents/create",
  },
  {
    id: "campaign",
    title: "Campagne",
    description: "Coordonnez plusieurs formats dans un plan editorial coherent.",
    isAvailable: false,
    statusLabel: "Bientot disponible",
    entryRoute: "/contents/create",
  },
];

const templates: ContentTemplate[] = [
  {
    id: "portrait-athlete",
    title: "Portrait d athlete",
    description: "Presenter une personnalite, son parcours et sa vision.",
  },
  {
    id: "before-match",
    title: "Avant-match",
    description: "Monter la tension avant une rencontre importante.",
  },
  {
    id: "after-match",
    title: "Apres-match",
    description: "Capitaliser sur les emotions et les enseignements a chaud.",
  },
  {
    id: "new-contract",
    title: "Nouveau contrat",
    description: "Annoncer un partenariat ou un engagement strategique.",
  },
  {
    id: "behind-the-scenes",
    title: "Behind the scenes",
    description: "Montrer les coulisses et l energie de la production.",
  },
  {
    id: "fast-questions",
    title: "Fast Questions",
    description: "Format court et dynamique pour l engagement de communaute.",
  },
  {
    id: "partner-interview",
    title: "Interview partenaire",
    description: "Mettre en avant la collaboration et les activations communes.",
  },
  {
    id: "match-day-story",
    title: "Story jour de match",
    description: "Sequencer la journee en stories prêtes a publier.",
  },
];

export const ContentsHubService = {
  generators(): ContentGenerator[] {
    return generators;
  },

  templates(): ContentTemplate[] {
    return templates;
  },

  contextFromSearchParams(params: {
    subject?: string;
    subjectId?: string;
    contextType?: string;
    objective?: string;
  }): ContentCreationContext {
    const objectiveCandidate = String(params.objective ?? "").trim().toLowerCase();
    const objective = generators.some((item) => item.id === objectiveCandidate)
      ? (objectiveCandidate as ContentGeneratorId)
      : undefined;

    const subjectName = String(params.subject ?? "").trim();
    if (!subjectName) {
      return { mode: "free", objective };
    }

    const allowedTypes: ContentContextType[] = ["athlete", "club", "partner", "organization", "other"];
    const candidate = String(params.contextType ?? "").trim().toLowerCase();
    const subjectType = allowedTypes.includes(candidate as ContentContextType)
      ? (candidate as ContentContextType)
      : "other";

    return {
      mode: "contextual",
      subjectName,
      subjectId: String(params.subjectId ?? "").trim() || undefined,
      subjectType,
      objective,
    };
  },
};
