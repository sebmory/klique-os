export type ContentContextType = "athlete" | "club" | "partner" | "organization" | "other";

export type ContentPresetId = "after-match";

export type ContentCreationContext = {
  mode: "free" | "contextual";
  subjectName?: string;
  subjectId?: string;
  subjectType?: ContentContextType;
  objective?: ContentGeneratorId;
  presetId?: ContentPresetId;
};

export type ContentGeneratorId =
  | "interview"
  | "publication"
  | "reel"
  | "story"
  | "podcast"
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
  | "after-match"
  | "behind-the-scenes"
  | "fast-questions"
  | "partner-interview";

export type ContentTemplate = {
  id: ContentTemplateId;
  title: string;
  description: string;
  isAvailable?: boolean;
  entryRoute?: string;
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
    isAvailable: true,
    statusLabel: "Disponible",
    entryRoute: "/contents/create?objective=story",
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
    id: "after-match",
    title: "Apres-match",
    description: "Capitaliser sur les emotions et les enseignements a chaud.",
    isAvailable: true,
    entryRoute: "/contents/create?objective=publication&preset=after-match",
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
    preset?: string;
  }): ContentCreationContext {
    const objectiveCandidate = String(params.objective ?? "").trim().toLowerCase();
    const objective = generators.some((item) => item.id === objectiveCandidate)
      ? (objectiveCandidate as ContentGeneratorId)
      : undefined;

    // Le preset n est retenu que pour l objectif Publication, seul flux qui le consomme.
    const presetCandidate = String(params.preset ?? "").trim().toLowerCase();
    const presetId = objective === "publication" && presetCandidate === "after-match" ? (presetCandidate as ContentPresetId) : undefined;

    const subjectName = String(params.subject ?? "").trim();
    if (!subjectName) {
      return { mode: "free", objective, presetId };
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
      presetId,
    };
  },
};
