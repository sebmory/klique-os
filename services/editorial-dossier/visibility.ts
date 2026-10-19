import type { ContextItem } from "@/types/context-intelligence";
import type {
  EditorialDossierRole,
  EditorialFactCategory,
  EditorialVisibility,
} from "@/types/editorial-dossier";

export const EDITORIAL_VISIBILITY_MATRIX: Record<EditorialVisibility, readonly EditorialDossierRole[]> = {
  public: ["admin", "media"],
  media_allowed: ["admin", "media"],
  workspace_internal: ["admin"],
  admin_only: ["admin"],
  sensitive: ["admin"],
};

const truthyMetadata = (item: ContextItem, key: string): boolean =>
  item.metadata[key] === true || item.metadata[key] === "true";

const normalizedMetadata = (item: ContextItem, key: string): string =>
  String(item.metadata[key] ?? "").trim().toLowerCase();

export const resolveEditorialVisibility = (
  item: ContextItem,
  category: EditorialFactCategory,
): { visibility: EditorialVisibility; sensitive: boolean; reasons: string[] } => {
  const dataClass = normalizedMetadata(item, "dataClass");
  const responseCadence = normalizedMetadata(item, "responseCadence");

  if (
    item.isSensitive
    || category === "health"
    || dataClass === "health"
    || dataClass === "difficulty"
  ) {
    return {
      visibility: "sensitive",
      sensitive: true,
      reasons: ["Sante, blessure ou difficulte exclue de toute projection Media."],
    };
  }

  if (category === "contact_request" || category === "appointment") {
    return {
      visibility: "admin_only",
      sensitive: true,
      reasons: ["Demandes de contact et rendez-vous reserves a l Admin."],
    };
  }

  if (responseCadence === "weekly" || responseCadence === "monthly") {
    return {
      visibility: "admin_only",
      sensitive: false,
      reasons: ["Reponse hebdomadaire ou mensuelle reservee a l Admin par defaut."],
    };
  }

  if (item.connectorId === "previous_content" || category === "generated_reference") {
    return {
      visibility: "workspace_internal",
      sensitive: false,
      reasons: ["Contenu genere anterieur conserve comme reference editoriale interne."],
    };
  }

  if (item.sourceType === "official" && Boolean(item.publishedAt)) {
    return {
      visibility: "public",
      sensitive: false,
      reasons: ["Source officielle publiee."],
    };
  }

  if (
    item.sourceName === "Projection editoriale Athlete"
    || truthyMetadata(item, "public")
    || truthyMetadata(item, "published")
    || truthyMetadata(item, "mediaValidated")
  ) {
    return {
      visibility: "media_allowed",
      sensitive: false,
      reasons: ["Information publique, publiee ou explicitement validee pour les medias."],
    };
  }

  if (item.sourceType === "user") {
    return {
      visibility: "media_allowed",
      sensitive: false,
      reasons: ["Texte fourni par l utilisateur, conserve comme non verifie."],
    };
  }

  if (item.sourceType === "media" || item.sourceType === "external") {
    return {
      visibility: item.publishedAt ? "public" : "workspace_internal",
      sensitive: false,
      reasons: [item.publishedAt ? "Information publiee par une source externe." : "Source externe sans publication datee."],
    };
  }

  return {
    visibility: "workspace_internal",
    sensitive: false,
    reasons: ["Information limitee au workspace faute de validation Media explicite."],
  };
};

export const isEditorialVisibilityAllowed = (
  visibility: EditorialVisibility,
  role: EditorialDossierRole,
): boolean => EDITORIAL_VISIBILITY_MATRIX[visibility].includes(role);
