import {
  ContextCollectionRequest,
  ContextConnectorId,
  ContextDateRange,
  MANUAL_EDITORIAL_MATERIAL_LIMIT,
  MANUAL_EDITORIAL_TEXT_LIMIT,
  MANUAL_INTERVIEW_SOURCE_TEXT_LIMIT,
  ManualEditorialMaterial,
  ManualInterviewSource,
  ContextSearchDepth,
  ContextSourcePreference,
} from "@/types/context-intelligence";
import { ContextCollectionError } from "@/services/context-intelligence/errors";
import { buildDateRange, normalize } from "@/services/context-intelligence/utils";

const allowedConnectors: ContextConnectorId[] = [
  "crm",
  "productions",
  "manual",
  "external_news",
  "calendar",
  "results",
  "official_website",
  "rss",
  "social",
  "documents",
  "previous_content",
];

const parseDateRange = (value: unknown): ContextDateRange => {
  if (!value || typeof value !== "object") {
    return buildDateRange("last_30_days");
  }

  const obj = value as { preset?: string; from?: string; to?: string };
  const preset = normalize(obj.preset) as ContextDateRange["preset"];
  if (!preset) return buildDateRange("last_30_days");

  if (preset === "custom") {
    return buildDateRange("custom", obj.from, obj.to);
  }

  if (preset === "last_7_days" || preset === "last_30_days" || preset === "last_90_days" || preset === "last_12_months") {
    return buildDateRange(preset);
  }

  return buildDateRange("last_30_days");
};

const parseManualEditorialMaterials = (value: unknown): ManualEditorialMaterial[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MANUAL_EDITORIAL_MATERIAL_LIMIT) {
    throw new ContextCollectionError(
      "INVALID_CONTEXT_REQUEST",
      "La matière journalistique doit contenir au maximum 12 éléments.",
    );
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new ContextCollectionError(
        "INVALID_CONTEXT_REQUEST",
        `Matière journalistique invalide à la position ${index + 1}.`,
      );
    }
    const item = entry as Record<string, unknown>;
    const id = normalize(item.id);
    const kind = normalize(item.kind);
    const text = normalize(item.text);
    const provenance = normalize(item.provenance);
    const sourceDate = normalize(item.sourceDate);
    const speaker = normalize(item.speaker);

    if (!id || (kind !== "note" && kind !== "verbatim_quote")) {
      throw new ContextCollectionError(
        "INVALID_CONTEXT_REQUEST",
        `Type de matière journalistique invalide à la position ${index + 1}.`,
      );
    }
    if (!text || text.length > MANUAL_EDITORIAL_TEXT_LIMIT || !provenance || provenance.length > 160) {
      throw new ContextCollectionError(
        "INVALID_CONTEXT_REQUEST",
        `Texte ou provenance invalide à la position ${index + 1}.`,
      );
    }
    const parsedSourceDate = new Date(`${sourceDate}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)
      || Number.isNaN(parsedSourceDate.getTime())
      || parsedSourceDate.toISOString().slice(0, 10) !== sourceDate
    ) {
      throw new ContextCollectionError(
        "INVALID_CONTEXT_REQUEST",
        `Date de matière journalistique invalide à la position ${index + 1}.`,
      );
    }
    if (kind === "verbatim_quote" && (!speaker || speaker.length > 120)) {
      throw new ContextCollectionError(
        "INVALID_CONTEXT_REQUEST",
        `Le locuteur est obligatoire pour la citation à la position ${index + 1}.`,
      );
    }

    return {
      id,
      kind,
      text,
      provenance,
      sourceDate,
      ...(kind === "verbatim_quote" ? { speaker } : {}),
    } satisfies ManualEditorialMaterial;
  });
};

const parseIsoDate = (value: unknown, message: string): string => {
  const sourceDate = normalize(value);
  const parsedSourceDate = new Date(`${sourceDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)
    || Number.isNaN(parsedSourceDate.getTime())
    || parsedSourceDate.toISOString().slice(0, 10) !== sourceDate
  ) {
    throw new ContextCollectionError("INVALID_CONTEXT_REQUEST", message);
  }
  return sourceDate;
};

const parseManualInterviewSources = (value: unknown): ManualInterviewSource[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1) {
    throw new ContextCollectionError(
      "INVALID_CONTEXT_REQUEST",
      "Un seul entretien colle peut etre traite a la fois.",
    );
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new ContextCollectionError("INVALID_CONTEXT_REQUEST", "Entretien colle invalide.");
    }

    const item = entry as Record<string, unknown>;
    const id = normalize(item.id);
    const provenance = normalize(item.provenance);
    const interviewer = normalize(item.interviewer);
    const interviewee = normalize(item.interviewee);
    const subjectIdentityConfirmed = item.subjectIdentityConfirmed === true;
    const sourceText = typeof item.sourceText === "string" ? item.sourceText : "";
    const sourceDate = parseIsoDate(item.sourceDate, "Date de l entretien invalide.");
    const rawExcerpts = item.excerpts;

    if (!id || !provenance || provenance.length > 160) {
      throw new ContextCollectionError("INVALID_CONTEXT_REQUEST", "Provenance de l entretien invalide.");
    }
    if (!interviewer || interviewer.length > 120 || !interviewee || interviewee.length > 120) {
      throw new ContextCollectionError("INVALID_CONTEXT_REQUEST", "Les deux intervenants de l entretien sont obligatoires.");
    }
    if (!sourceText || sourceText.length > MANUAL_INTERVIEW_SOURCE_TEXT_LIMIT) {
      throw new ContextCollectionError(
        "INVALID_CONTEXT_REQUEST",
        `Le texte source de l entretien doit contenir au maximum ${MANUAL_INTERVIEW_SOURCE_TEXT_LIMIT} caracteres.`,
      );
    }
    if (!Array.isArray(rawExcerpts)) {
      throw new ContextCollectionError("INVALID_CONTEXT_REQUEST", "Extraits d entretien invalides.");
    }

    const excerpts = rawExcerpts.map((excerpt, index) => {
      if (!excerpt || typeof excerpt !== "object") {
        throw new ContextCollectionError(
          "INVALID_CONTEXT_REQUEST",
          `Extrait d entretien invalide a la position ${index + 1}.`,
        );
      }
      const candidate = excerpt as Record<string, unknown>;
      const excerptId = normalize(candidate.id);
      const start = candidate.start;
      const end = candidate.end;
      const text = typeof candidate.text === "string" ? candidate.text : "";
      const speakerRole = candidate.speakerRole;

      if (
        !excerptId
        || typeof start !== "number"
        || typeof end !== "number"
        || !Number.isInteger(start)
        || !Number.isInteger(end)
        || start < 0
        || end <= start
        || end > sourceText.length
      ) {
        throw new ContextCollectionError(
          "INVALID_CONTEXT_REQUEST",
          `Bornes de l extrait invalides a la position ${index + 1}.`,
        );
      }
      if (!text.trim() || text.length > MANUAL_EDITORIAL_TEXT_LIMIT) {
        throw new ContextCollectionError(
          "INVALID_CONTEXT_REQUEST",
          `L extrait d entretien doit contenir au maximum ${MANUAL_EDITORIAL_TEXT_LIMIT} caracteres.`,
        );
      }
      if (sourceText.slice(start, end) !== text) {
        throw new ContextCollectionError(
          "INVALID_CONTEXT_REQUEST",
          `L extrait d entretien ne correspond pas exactement au texte source a la position ${index + 1}.`,
        );
      }
      if (speakerRole !== "interviewer" && speakerRole !== "interviewee") {
        throw new ContextCollectionError(
          "INVALID_CONTEXT_REQUEST",
          `Le locuteur de l extrait doit etre choisi a la position ${index + 1}.`,
        );
      }
      if (candidate.confirmed !== true) {
        throw new ContextCollectionError(
          "INVALID_CONTEXT_REQUEST",
          `L extrait d entretien doit etre confirme a la position ${index + 1}.`,
        );
      }

      return {
        id: excerptId,
        start,
        end,
        text,
        speakerRole,
        confirmed: true,
      } as const;
    });

    return {
      id,
      provenance,
      sourceDate,
      interviewer,
      interviewee,
      subjectIdentityConfirmed,
      sourceText,
      excerpts,
    };
  });
};

export const validateContextCollectionRequest = (value: unknown): ContextCollectionRequest => {
  if (!value || typeof value !== "object") {
    throw new ContextCollectionError("INVALID_CONTEXT_REQUEST", "Requete de collecte invalide.");
  }

  const payload = value as Record<string, unknown>;
  const subject = payload.subject as Record<string, unknown> | undefined;
  if (!subject) {
    throw new ContextCollectionError("INVALID_CONTEXT_REQUEST", "Sujet manquant.");
  }

  const displayName = normalize(subject.displayName);
  if (!displayName) {
    throw new ContextCollectionError("INVALID_CONTEXT_REQUEST", "Nom du sujet manquant.");
  }

  const selectedConnectorIds = Array.isArray(payload.selectedConnectorIds)
    ? (payload.selectedConnectorIds
      .map((item) => normalize(item))
      .filter((item): item is ContextConnectorId => allowedConnectors.includes(item as ContextConnectorId)))
    : [];

  const sourcePreferenceRaw = normalize(payload.sourcePreference);
  const sourcePreference: ContextSourcePreference =
    sourcePreferenceRaw === "official_only" || sourcePreferenceRaw === "broad"
      ? (sourcePreferenceRaw as ContextSourcePreference)
      : "official_and_reliable";

  const searchDepthRaw = normalize(payload.searchDepth);
  const searchDepth: ContextSearchDepth =
    searchDepthRaw === "quick" || searchDepthRaw === "deep"
      ? (searchDepthRaw as ContextSearchDepth)
      : "standard";

  const languageRaw = normalize(payload.language).toLowerCase();
  const language = languageRaw === "fr" ? "fr" : "fr-CH";

  const manualEditorialMaterials = parseManualEditorialMaterials(payload.manualEditorialMaterials);
  const manualInterviewSources = parseManualInterviewSources(payload.manualInterviewSources);
  const interviewExcerptCount = manualInterviewSources.reduce(
    (total, source) => total + source.excerpts.length,
    0,
  );
  if (manualEditorialMaterials.length + interviewExcerptCount > MANUAL_EDITORIAL_MATERIAL_LIMIT) {
    throw new ContextCollectionError(
      "INVALID_CONTEXT_REQUEST",
      `La matiere journalistique doit contenir au maximum ${MANUAL_EDITORIAL_MATERIAL_LIMIT} elements.`,
    );
  }

  return {
    workspaceId: "",
    subject: {
      id: normalize(subject.id) || normalize(subject.subjectId) || undefined,
      source: normalize(subject.source) === "crm" ? "crm" : "temporary",
      type: normalize(subject.type) || normalize(subject.subjectType) || "other",
      displayName,
      sport: normalize(subject.sport) || undefined,
      clubOrOrganization: normalize(subject.clubOrOrganization) || normalize(subject.organization) || undefined,
      disciplineOrPosition: normalize(subject.disciplineOrPosition) || undefined,
      photoUrl: normalize(subject.photoUrl) || undefined,
      workspaceId: undefined,
      description: normalize(subject.description) || undefined,
    },
    selectedConnectorIds,
    dateRange: parseDateRange(payload.dateRange),
    sourcePreference,
    searchDepth,
    language,
    manualContext: normalize(payload.manualContext) || undefined,
    manualEditorialMaterials,
    manualInterviewSources,
    contentType: normalize(payload.contentType) || "interview",
    interviewType: normalize(payload.interviewType) || undefined,
  };
};
