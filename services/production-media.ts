import type { Production } from "@/types/production";
import { getProductionWorkflow, type ProductionWorkflowResult, type ProductionWorkflowSeverity } from "@/services/production-workflow";

export type ProductionMediaStorageProvider = "google_drive" | "external" | "none";
export type ProductionMediaStorageResourceType = "folder" | "file" | "unknown" | "none";

export type ProductionMediaLifecycleState = "completed" | "pending" | "inconsistent";

export type ProductionMediaStatus =
  | "empty"
  | "needs_storage"
  | "storage_linked"
  | "exported"
  | "published"
  | "needs_review";

export type ProductionMediaWarningCode =
  | "PHOTO_COUNT_INVALID"
  | "VIDEO_COUNT_INVALID"
  | "MEDIA_COUNT_NEGATIVE"
  | "MEDIA_COUNT_DECIMAL"
  | "INVALID_STORAGE_LINK"
  | "MEDIA_WITHOUT_STORAGE"
  | "PUBLISHED_WITHOUT_MEDIA"
  | "PUBLICATION_BEFORE_EXPORT";

export type ProductionMediaWarning = {
  code: ProductionMediaWarningCode;
  severity: ProductionWorkflowSeverity;
  message: string;
  field?: "photos" | "videos" | "drive" | "publication" | "export" | "global";
};

export type ProductionMediaStorage = {
  rawValue: string;
  normalizedUrl: string;
  shortUrl: string;
  isValid: boolean;
  provider: ProductionMediaStorageProvider;
  providerLabel: string;
  resourceType: ProductionMediaStorageResourceType;
  actionLabel: string;
};

export type ProductionMediaSummary = {
  photoCount: number;
  videoCount: number;
  totalMediaCount: number;
  hasPhotos: boolean;
  hasVideos: boolean;
  hasMedia: boolean;
  driveUrl: string;
  hasValidDriveUrl: boolean;
  storageProvider: ProductionMediaStorageProvider;
  storage: ProductionMediaStorage;
  exportState: ProductionMediaLifecycleState;
  exportLabel: string;
  publicationState: ProductionMediaLifecycleState;
  publicationLabel: string;
  availabilityLabel: string;
  mediaStatus: ProductionMediaStatus;
  mediaStatusLabel: string;
  warnings: ProductionMediaWarning[];
  workflow: ProductionWorkflowResult;
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const detectStorageProvider = (url: URL): ProductionMediaStorageProvider => {
  const hostname = url.hostname.toLowerCase();
  if (hostname.includes("drive.google.com") || hostname.includes("docs.google.com")) {
    return "google_drive";
  }
  return "external";
};

const detectResourceType = (url: URL): ProductionMediaStorageResourceType => {
  const path = url.pathname.toLowerCase();
  if (path.includes("/folders/")) return "folder";
  if (path.includes("/file/") || path.includes("/document/") || path.includes("/spreadsheets/")) return "file";
  return "unknown";
};

const shortenUrl = (raw: string): string => {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const compact = `${url.hostname}${url.pathname}`.replace(/\/$/, "");
    if (compact.length <= 52) return compact;
    return `${compact.slice(0, 49)}...`;
  } catch {
    if (raw.length <= 52) return raw;
    return `${raw.slice(0, 49)}...`;
  }
};

const parseMediaCount = (
  value: unknown,
  field: "photos" | "videos"
): { count: number; warnings: ProductionMediaWarning[] } => {
  const raw = normalize(value);
  const warnings: ProductionMediaWarning[] = [];

  if (!raw) {
    return { count: 0, warnings };
  }

  const numeric = Number(raw.replace(",", "."));
  if (!Number.isFinite(numeric)) {
    warnings.push({
      code: field === "photos" ? "PHOTO_COUNT_INVALID" : "VIDEO_COUNT_INVALID",
      severity: "warning",
      field,
      message:
        field === "photos"
          ? "Le nombre de photos renseigne n est pas valide."
          : "Le nombre de videos renseigne n est pas valide.",
    });
    return { count: 0, warnings };
  }

  if (numeric < 0) {
    warnings.push({
      code: "MEDIA_COUNT_NEGATIVE",
      severity: "warning",
      field,
      message:
        field === "photos"
          ? "Le nombre de photos est negatif et doit etre verifie."
          : "Le nombre de videos est negatif et doit etre verifie.",
    });
    return { count: 0, warnings };
  }

  if (!Number.isInteger(numeric)) {
    warnings.push({
      code: "MEDIA_COUNT_DECIMAL",
      severity: "warning",
      field,
      message:
        field === "photos"
          ? "Le nombre de photos contient une valeur decimale et a ete normalise."
          : "Le nombre de videos contient une valeur decimale et a ete normalise.",
    });
  }

  return { count: Math.floor(numeric), warnings };
};

const validateDriveLink = (value: unknown): ProductionMediaStorage => {
  const rawValue = normalize(value);
  if (!rawValue) {
    return {
      rawValue,
      normalizedUrl: "",
      shortUrl: "",
      isValid: false,
      provider: "none",
      providerLabel: "Aucun stockage",
      resourceType: "none",
      actionLabel: "",
    };
  }

  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== "https:") {
      return {
        rawValue,
        normalizedUrl: "",
        shortUrl: shortenUrl(rawValue),
        isValid: false,
        provider: "none",
        providerLabel: "Lien non valide",
        resourceType: "none",
        actionLabel: "",
      };
    }

    const provider = detectStorageProvider(parsed);
    const resourceType = detectResourceType(parsed);
    const providerLabel = provider === "google_drive" ? "Google Drive" : "Lien externe";

    return {
      rawValue,
      normalizedUrl: parsed.toString(),
      shortUrl: shortenUrl(parsed.toString()),
      isValid: true,
      provider,
      providerLabel,
      resourceType,
      actionLabel: provider === "google_drive" ? "Ouvrir le dossier" : "Ouvrir le lien",
    };
  } catch {
    return {
      rawValue,
      normalizedUrl: "",
      shortUrl: shortenUrl(rawValue),
      isValid: false,
      provider: "none",
      providerLabel: "Lien non valide",
      resourceType: "none",
      actionLabel: "",
    };
  }
};

const stateFromWorkflowStep = (state: string): ProductionMediaLifecycleState => {
  if (state === "inconsistent") return "inconsistent";
  if (state === "completed") return "completed";
  return "pending";
};

const statusMeta = (
  status: ProductionMediaStatus
): { label: string; priority: number } => {
  if (status === "needs_review") return { label: "A verifier", priority: 1 };
  if (status === "published") return { label: "Medias publies", priority: 2 };
  if (status === "exported") return { label: "Medias exportes", priority: 3 };
  if (status === "storage_linked") return { label: "Dossier lie", priority: 4 };
  if (status === "needs_storage") return { label: "Medias a centraliser", priority: 5 };
  return { label: "Aucun media renseigne", priority: 6 };
};

export const getProductionMediaStatusPriority = (status: ProductionMediaStatus): number => {
  return statusMeta(status).priority;
};

export const getProductionMediaSummary = (
  production: Production,
  workflowArg?: ProductionWorkflowResult
): ProductionMediaSummary => {
  const workflow = workflowArg ?? getProductionWorkflow(production);

  const parsedPhotos = parseMediaCount(production.raw.photos ?? production.nbPhotos, "photos");
  const parsedVideos = parseMediaCount(production.raw.videos ?? production.nbVideos, "videos");

  const photoCount = parsedPhotos.count;
  const videoCount = parsedVideos.count;
  const totalMediaCount = photoCount + videoCount;
  const hasPhotos = photoCount > 0;
  const hasVideos = videoCount > 0;
  const hasMedia = totalMediaCount > 0;

  const storage = validateDriveLink(production.raw.driveLink ?? "");

  const exportStep = workflow.steps.find((step) => step.id === "export");
  const publicationStep = workflow.steps.find((step) => step.id === "publication");

  const exportState = stateFromWorkflowStep(exportStep?.state ?? "pending");
  const publicationState = stateFromWorkflowStep(publicationStep?.state ?? "pending");

  const exportLabel =
    exportState === "completed" ? "Export termine" : exportState === "inconsistent" ? "Export a verifier" : "Export a faire";

  const publicationLabel =
    publicationState === "completed"
      ? "Medias publies"
      : publicationState === "inconsistent"
        ? "Publication a verifier"
        : "Publication a faire";

  const warnings: ProductionMediaWarning[] = [...parsedPhotos.warnings, ...parsedVideos.warnings];

  if (storage.rawValue && !storage.isValid) {
    warnings.push({
      code: "INVALID_STORAGE_LINK",
      severity: "warning",
      field: "drive",
      message: "Le lien de stockage renseigne n est pas valide.",
    });
  }

  if (hasMedia && !storage.isValid) {
    warnings.push({
      code: "MEDIA_WITHOUT_STORAGE",
      severity: "warning",
      field: "drive",
      message: "Des medias sont comptabilises, mais aucun dossier n est lie a cette production.",
    });
  }

  if (!hasMedia && publicationState === "completed") {
    warnings.push({
      code: "PUBLISHED_WITHOUT_MEDIA",
      severity: "critical",
      field: "publication",
      message: "La production est indiquee comme publiee alors qu aucun media n est comptabilise.",
    });
  }

  if (publicationState === "completed" && exportState !== "completed") {
    warnings.push({
      code: "PUBLICATION_BEFORE_EXPORT",
      severity: "critical",
      field: "publication",
      message: "La publication est terminee alors que l export ne l est pas.",
    });
  }

  const hasImportantIssue = warnings.some((warning) => warning.severity === "critical") || warnings.length > 0;

  let mediaStatus: ProductionMediaStatus;
  if (hasImportantIssue) {
    mediaStatus = "needs_review";
  } else if (publicationState === "completed") {
    mediaStatus = "published";
  } else if (exportState === "completed") {
    mediaStatus = "exported";
  } else if (storage.isValid) {
    mediaStatus = "storage_linked";
  } else if (hasMedia) {
    mediaStatus = "needs_storage";
  } else {
    mediaStatus = "empty";
  }

  const availabilityLabel =
    !hasMedia && !storage.isValid
      ? "Aucun media comptabilise"
      : hasMedia && !storage.isValid
        ? "Medias comptabilises"
        : publicationState === "completed"
          ? "Medias publies"
          : exportState === "completed"
            ? "Medias exportes"
            : "Medias accessibles via Drive";

  return {
    photoCount,
    videoCount,
    totalMediaCount,
    hasPhotos,
    hasVideos,
    hasMedia,
    driveUrl: storage.normalizedUrl,
    hasValidDriveUrl: storage.isValid,
    storageProvider: storage.provider,
    storage,
    exportState,
    exportLabel,
    publicationState,
    publicationLabel,
    availabilityLabel,
    mediaStatus,
    mediaStatusLabel: statusMeta(mediaStatus).label,
    warnings,
    workflow,
  };
};
