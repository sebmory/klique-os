import {
  ARTICLE_CREATION_DRAFT_MAX_BYTES,
  ARTICLE_CREATION_DRAFT_SCHEMA_VERSION,
  type ArticleCreationDraftPayload,
  type ArticleCreationDraftStepId,
} from "@/types/article-creation-draft";
import {
  MANUAL_EDITORIAL_MATERIAL_LIMIT,
  MANUAL_EDITORIAL_TEXT_LIMIT,
  MANUAL_INTERVIEW_SOURCE_TEXT_LIMIT,
  type ManualEditorialMaterial,
} from "@/types/context-intelligence";

export class ArticleCreationDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArticleCreationDraftValidationError";
  }
}

const stepIds = new Set<ArticleCreationDraftStepId>([
  "subject",
  "objective",
  "parameters",
  "context",
  "angle",
  "structure",
  "summary",
]);

const requireObject = (value: unknown, message: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ArticleCreationDraftValidationError(message);
  }
  return value as Record<string, unknown>;
};

const requireString = (value: unknown, message: string, maxLength: number): string => {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new ArticleCreationDraftValidationError(message);
  }
  return value.trim();
};

const requireUuid = (value: unknown, message: string): string => {
  const normalized = requireString(value, message, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new ArticleCreationDraftValidationError(message);
  }
  return normalized;
};

const requireDraftString = (value: unknown, message: string, maxLength: number): string => {
  if (typeof value !== "string" || value.length > maxLength) {
    throw new ArticleCreationDraftValidationError(message);
  }
  return value;
};

const validateInterviewSource = (value: unknown): void => {
  if (value === null || value === undefined) return;
  const source = requireObject(value, "Entretien du brouillon invalide.");
  const sourceText = requireDraftString(
    source.sourceText,
    "Texte source de l entretien invalide.",
    MANUAL_INTERVIEW_SOURCE_TEXT_LIMIT,
  );
  requireString(source.id, "Identifiant d entretien invalide.", 160);
  requireDraftString(source.provenance, "Provenance d entretien invalide.", 160);
  requireDraftString(source.sourceDate, "Date d entretien invalide.", 40);
  requireDraftString(source.interviewer, "Intervieweur invalide.", 120);
  requireDraftString(source.interviewee, "Personne interrogee invalide.", 120);
  if (
    source.subjectIdentityConfirmed !== undefined
    && typeof source.subjectIdentityConfirmed !== "boolean"
  ) {
    throw new ArticleCreationDraftValidationError("Confirmation d identite declaree invalide.");
  }
  if (!Array.isArray(source.excerpts) || source.excerpts.length > MANUAL_EDITORIAL_MATERIAL_LIMIT) {
    throw new ArticleCreationDraftValidationError("Extraits d entretien invalides.");
  }
  for (const excerptValue of source.excerpts) {
    const excerpt = requireObject(excerptValue, "Extrait d entretien invalide.");
    const start = excerpt.start;
    const end = excerpt.end;
    const text = excerpt.text;
    if (
      !Number.isInteger(start)
      || !Number.isInteger(end)
      || Number(start) < 0
      || Number(end) <= Number(start)
      || Number(end) > sourceText.length
      || typeof text !== "string"
      || sourceText.slice(Number(start), Number(end)) !== text
      || (excerpt.speakerRole !== "interviewer" && excerpt.speakerRole !== "interviewee")
      || excerpt.confirmed !== true
    ) {
      throw new ArticleCreationDraftValidationError("Extrait d entretien non conforme au texte source.");
    }
  }
};

export const validateManualEditorialMaterials = (
  value: unknown,
): ManualEditorialMaterial[] => {
  if (!Array.isArray(value) || value.length > MANUAL_EDITORIAL_MATERIAL_LIMIT) {
    throw new ArticleCreationDraftValidationError("Matiere journalistique du brouillon invalide.");
  }
  return value.map((materialValue) => {
    const material = requireObject(
      materialValue,
      "Matiere journalistique du brouillon invalide.",
    );
    const kind = material.kind;
    if (kind !== "note" && kind !== "verbatim_quote") {
      throw new ArticleCreationDraftValidationError("Type de matiere journalistique invalide.");
    }
    const validated: ManualEditorialMaterial = {
      id: requireString(material.id, "Identifiant de matiere invalide.", 160),
      kind,
      text: requireString(
        material.text,
        "Texte de matiere journalistique invalide.",
        MANUAL_EDITORIAL_TEXT_LIMIT,
      ),
      provenance: requireString(material.provenance, "Provenance de matiere invalide.", 1000),
      sourceDate: requireString(material.sourceDate, "Date de matiere invalide.", 40),
    };
    if (kind === "verbatim_quote") {
      validated.speaker = requireString(material.speaker, "Auteur de citation invalide.", 160);
    }
    return validated;
  });
};

export const validateArticleCreationDraftPayload = (value: unknown): ArticleCreationDraftPayload => {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ArticleCreationDraftValidationError("Brouillon Article impossible a serialiser.");
  }
  if (Buffer.byteLength(serialized, "utf8") > ARTICLE_CREATION_DRAFT_MAX_BYTES) {
    throw new ArticleCreationDraftValidationError("Brouillon Article trop volumineux.");
  }

  const payload = requireObject(value, "Brouillon Article invalide.");
  if (payload.schemaVersion !== ARTICLE_CREATION_DRAFT_SCHEMA_VERSION) {
    throw new ArticleCreationDraftValidationError("Version de brouillon Article non prise en charge.");
  }
  requireString(payload.contextKey, "Contexte de brouillon invalide.", 1000);
  if (typeof payload.stepId !== "string" || !stepIds.has(payload.stepId as ArticleCreationDraftStepId)) {
    throw new ArticleCreationDraftValidationError("Etape de brouillon invalide.");
  }

  const draft = requireObject(payload.draft, "Contenu du brouillon invalide.");
  const subject = requireObject(draft.subject, "Sujet du brouillon invalide.");
  requireString(subject.displayName, "Nom du sujet obligatoire.", 180);
  const objective = requireObject(draft.objective, "Objectif du brouillon invalide.");
  if (objective.objective !== "article") {
    throw new ArticleCreationDraftValidationError("Seuls les brouillons Article sont acceptes.");
  }
  const parameters = requireObject(draft.parameters, "Parametres du brouillon invalides.");
  validateManualEditorialMaterials(parameters.manualEditorialMaterials);
  validateInterviewSource(parameters.manualInterviewSource);

  const contextState = requireObject(payload.contextState, "Contexte collecte du brouillon invalide.");
  if (!Array.isArray(contextState.items) || contextState.items.length > 200) {
    throw new ArticleCreationDraftValidationError("Elements de contexte du brouillon invalides.");
  }
  if (!Array.isArray(contextState.reports) || contextState.reports.length > 20) {
    throw new ArticleCreationDraftValidationError("Rapports de contexte du brouillon invalides.");
  }
  if (typeof contextState.hasCollected !== "boolean") {
    throw new ArticleCreationDraftValidationError("Etat de collecte du brouillon invalide.");
  }

  const workflow = requireObject(payload.articleWorkflow, "Workflow Article du brouillon invalide.");
  if (!Array.isArray(workflow.suggestions) || workflow.suggestions.length > 3) {
    throw new ArticleCreationDraftValidationError("Angles du brouillon invalides.");
  }
  if (!Array.isArray(workflow.structures) || workflow.structures.length > 3) {
    throw new ArticleCreationDraftValidationError("Structures du brouillon invalides.");
  }
  if (typeof workflow.selectedStructureId !== "string" || workflow.selectedStructureId.length > 180) {
    throw new ArticleCreationDraftValidationError("Structure selectionnee invalide.");
  }
  if (typeof workflow.choicesNeedReview !== "boolean") {
    throw new ArticleCreationDraftValidationError("Etat de revalidation editoriale invalide.");
  }

  return value as ArticleCreationDraftPayload;
};

export const validateCreateArticleCreationDraftBody = (value: unknown) => {
  const body = requireObject(value, "Corps de creation du brouillon invalide.");
  return {
    clientCreationId: requireUuid(body.clientCreationId, "Identifiant de creation invalide."),
    displayTitle: requireString(body.displayTitle, "Titre du brouillon invalide.", 180),
    payload: validateArticleCreationDraftPayload(body.payload),
  };
};

export const validateUpdateArticleCreationDraftBody = (value: unknown) => {
  const body = requireObject(value, "Corps de mise a jour du brouillon invalide.");
  if (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) {
    throw new ArticleCreationDraftValidationError("Version attendue du brouillon invalide.");
  }
  return {
    expectedVersion: Number(body.expectedVersion),
    displayTitle: requireString(body.displayTitle, "Titre du brouillon invalide.", 180),
    payload: validateArticleCreationDraftPayload(body.payload),
  };
};
