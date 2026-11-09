import {
  findCreativeApplicationById,
  readCreativeApplications,
  updateCreativeApplicationModeration,
  CreativeApplicationsSheetError,
  type CreativeApplication,
  type UpdateCreativeApplicationModerationInput,
  versionCreativeApplication,
} from "@/lib/creatives/applications-sheet";
import {
  CreativeProfileRepository,
  CreativeProfileValidationError,
} from "@/lib/creatives/repository";
import type {
  CreateFormApplicationCreativeProfileInput,
  CreativeProfile,
  CreativeType,
} from "@/types/creative";

export type ApproveCreativeApplicationResult = {
  profile: CreativeProfile;
  application: CreativeApplication;
  alreadyApproved: boolean;
  sheetSynchronized: boolean;
};

export type RejectCreativeApplicationResult = {
  application: CreativeApplication;
  alreadyRejected: boolean;
};

export type CreativeApplicationAdminServiceDependencies = {
  listApplications: () => Promise<CreativeApplication[]>;
  findApplication: (applicationId: string) => Promise<CreativeApplication | null>;
  updateModeration: (
    applicationId: string,
    input: UpdateCreativeApplicationModerationInput,
  ) => Promise<CreativeApplication>;
  createProfile: (
    workspaceId: string,
    input: CreateFormApplicationCreativeProfileInput,
  ) => Promise<CreativeProfile>;
  getProfileById: (
    workspaceId: string,
    creativeId: string,
  ) => Promise<CreativeProfile | null>;
  listProfilesByApplicationIds: (
    workspaceId: string,
    applicationIds: string[],
  ) => Promise<CreativeProfile[]>;
  now: () => Date;
};

export class CreativeApplicationAdminError extends Error {
  constructor(
    public readonly code:
      | "validation"
      | "missing_required_field"
      | "not_found"
      | "version_conflict"
      | "conflict"
      | "dependency",
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "CreativeApplicationAdminError";
  }
}

const defaultDependencies: CreativeApplicationAdminServiceDependencies = {
  listApplications: readCreativeApplications,
  findApplication: findCreativeApplicationById,
  updateModeration: updateCreativeApplicationModeration,
  createProfile: CreativeProfileRepository.createIdempotent.bind(CreativeProfileRepository),
  getProfileById: CreativeProfileRepository.getById.bind(CreativeProfileRepository),
  listProfilesByApplicationIds:
    CreativeProfileRepository.listByApplicationIds.bind(CreativeProfileRepository),
  now: () => new Date(),
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireText = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new CreativeApplicationAdminError("validation", `${field} est requis.`);
  }
  return value.trim();
};

const requireUuid = (value: unknown, field: string): string => {
  const normalized = requireText(value, field).toLowerCase();
  if (!uuidPattern.test(normalized)) {
    throw new CreativeApplicationAdminError("validation", `${field} est invalide.`);
  }
  return normalized;
};

const requireVersion = (value: unknown): string => {
  const version = requireText(value, "version");
  if (!/^v1:[0-9a-f]{64}$/.test(version)) {
    throw new CreativeApplicationAdminError("validation", "version est invalide.");
  }
  return version;
};

const requireApplicationField = (
  value: unknown,
  field: string,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new CreativeApplicationAdminError(
      "missing_required_field",
      `${field} est requis.`,
      field,
    );
  }
  return value.trim();
};

const normalizeOptionalText = (value: string): string | null => {
  const normalized = value.trim();
  return normalized || null;
};

const normalizeOptionalUrl = (value: string): string | null => {
  const normalized = value.trim();
  if (!normalized) return null;
  try {
    const direct = new URL(normalized);
    if (direct.protocol === "http:" || direct.protocol === "https:") {
      return direct.toString();
    }
  } catch {
    // The form commonly receives domains without a protocol.
  }
  try {
    const withProtocol = new URL(`https://${normalized}`);
    return withProtocol.hostname.includes(".") ? withProtocol.toString() : null;
  } catch {
    return null;
  }
};

const normalizeKey = (value: string): string => value
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const creativeTypeFromApplication = (value: string): CreativeType => {
  const normalized = normalizeKey(value);
  const isPhotographer = normalized.includes("photograph");
  const isVideographer = normalized.includes("vide");
  if (isPhotographer && isVideographer) return "both";
  if (isPhotographer) return "photographer";
  if (isVideographer) return "videographer";
  throw new CreativeApplicationAdminError(
    "missing_required_field",
    "Le type de créatif de la candidature est invalide.",
    "profile",
  );
};

const splitList = (value: string): string[] => [...new Set(
  value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim().replace(/\s+/g, " "))
    .filter(Boolean),
)];

const profileInputFromApplication = (
  application: CreativeApplication,
  approvedByClerkUserId: string,
  approvedAt: string,
): CreateFormApplicationCreativeProfileInput => {
  const displayName = requireApplicationField(application.fields.fullName, "fullName");
  const contactEmail = requireApplicationField(application.fields.email, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new CreativeApplicationAdminError(
      "missing_required_field",
      "email est invalide.",
      "email",
    );
  }
  return {
    provenance: "form_application",
    applicationId: application.applicationId,
    displayName,
    creativeType: creativeTypeFromApplication(
      requireApplicationField(application.fields.profile, "profile"),
    ),
    contactEmail,
    phone: normalizeOptionalText(application.fields.phone),
    websiteUrl: normalizeOptionalUrl(application.fields.websiteUrl),
    portfolioUrl: normalizeOptionalUrl(application.fields.portfolioUrl),
    instagram: normalizeOptionalText(application.fields.instagram),
    city: normalizeOptionalText(application.fields.city),
    country: null,
    coverageAreas: splitList(application.fields.travelRegions),
    specialties: splitList(application.fields.sportsToCover),
    bio: normalizeOptionalText(application.fields.background),
    status: "active",
    sourceRow: application.sourceRow,
    approvedByClerkUserId,
    approvedAt,
  };
};

const normalizeReason = (value: unknown): string => {
  const reason = requireText(value, "reason").replace(/\s+/g, " ");
  if (reason.length > 2_000) {
    throw new CreativeApplicationAdminError("validation", "reason est trop long.");
  }
  return reason;
};

const dependencyError = (): CreativeApplicationAdminError =>
  new CreativeApplicationAdminError(
    "dependency",
    "Le traitement de la candidature n’a pas pu aboutir.",
  );

const loadApplication = async (
  applicationId: string,
  dependencies: CreativeApplicationAdminServiceDependencies,
): Promise<CreativeApplication> => {
  try {
    const application = await dependencies.findApplication(applicationId);
    if (!application) {
      throw new CreativeApplicationAdminError(
        "not_found",
        "Candidature créative introuvable.",
      );
    }
    return application;
  } catch (error) {
    if (error instanceof CreativeApplicationAdminError) throw error;
    if (
      error instanceof CreativeApplicationsSheetError
      && (error.code === "validation" || error.code === "conflict")
    ) {
      throw new CreativeApplicationAdminError(
        "conflict",
        "Les données de modération de la candidature sont incohérentes.",
      );
    }
    throw dependencyError();
  }
};

const createProfile = async (
  workspaceId: string,
  input: CreateFormApplicationCreativeProfileInput,
  dependencies: CreativeApplicationAdminServiceDependencies,
): Promise<CreativeProfile> => {
  try {
    return await dependencies.createProfile(workspaceId, input);
  } catch (error) {
    if (error instanceof CreativeProfileValidationError) {
      throw new CreativeApplicationAdminError(
        "validation",
        "La candidature ne contient pas les données requises pour créer une fiche.",
      );
    }
    throw dependencyError();
  }
};

const loadApprovedProfile = async (
  workspaceId: string,
  application: CreativeApplication,
  dependencies: CreativeApplicationAdminServiceDependencies,
): Promise<CreativeProfile> => {
  if (!application.creativeId) {
    throw new CreativeApplicationAdminError(
      "conflict",
      "Une candidature approuvée doit référencer une fiche canonique.",
    );
  }
  try {
    const profile = await dependencies.getProfileById(workspaceId, application.creativeId);
    if (
      !profile
      || profile.workspaceId !== workspaceId
      || profile.applicationId !== application.applicationId
    ) {
      throw new CreativeApplicationAdminError(
        "conflict",
        "La fiche canonique liée à la candidature est incohérente.",
      );
    }
    return profile;
  } catch (error) {
    if (error instanceof CreativeApplicationAdminError) throw error;
    throw dependencyError();
  }
};

const writeModeration = async (
  applicationId: string,
  input: UpdateCreativeApplicationModerationInput,
  dependencies: CreativeApplicationAdminServiceDependencies,
): Promise<CreativeApplication> => {
  try {
    return await dependencies.updateModeration(applicationId, input);
  } catch {
    throw dependencyError();
  }
};

const applicationFromProfile = (
  application: CreativeApplication,
  profile: CreativeProfile,
): CreativeApplication => versionCreativeApplication({
  applicationId: application.applicationId,
  sourceRow: application.sourceRow,
  fields: application.fields,
  moderationStatus: "approved",
  creativeId: profile.id,
  moderatedAt: profile.approvedAt,
  moderatedBy: profile.approvedByClerkUserId,
  moderationNotes: null,
});

const profilesByApplicationId = (
  workspaceId: string,
  applications: CreativeApplication[],
  profiles: CreativeProfile[],
): Map<string, CreativeProfile> => {
  const result = new Map<string, CreativeProfile>();
  for (const profile of profiles) {
    if (
      profile.workspaceId !== workspaceId
      || profile.provenance !== "form_application"
      || !profile.applicationId
      || !applications.some((application) => application.applicationId === profile.applicationId)
      || result.has(profile.applicationId)
    ) {
      throw new CreativeApplicationAdminError(
        "conflict",
        "Les fiches canoniques liées aux candidatures sont incohérentes.",
      );
    }
    result.set(profile.applicationId, profile);
  }
  return result;
};

export const listCreativeApplicationsForAdmin = async (
  workspaceId: string,
  dependencies: CreativeApplicationAdminServiceDependencies = defaultDependencies,
): Promise<CreativeApplication[]> => {
  requireText(workspaceId, "workspaceId");
  try {
    const applications = await dependencies.listApplications();
    const profiles = await dependencies.listProfilesByApplicationIds(
      workspaceId,
      applications.map((application) => application.applicationId),
    );
    const profileByApplicationId = profilesByApplicationId(
      workspaceId,
      applications,
      profiles,
    );
    return applications.map((application) => {
      const profile = profileByApplicationId.get(application.applicationId);
      if (!profile) {
        if (application.moderationStatus === "approved" || application.creativeId) {
          throw new CreativeApplicationAdminError(
            "conflict",
            "Une candidature référence une fiche canonique introuvable.",
          );
        }
        return application;
      }
      if (
        application.moderationStatus === "rejected"
        || (application.creativeId && application.creativeId !== profile.id)
      ) {
        throw new CreativeApplicationAdminError(
          "conflict",
          "La décision canonique et la modération Google Sheets divergent.",
        );
      }
      return applicationFromProfile(application, profile);
    });
  } catch (error) {
    if (error instanceof CreativeApplicationAdminError) throw error;
    throw dependencyError();
  }
};

export const approveCreativeApplication = async (
  workspaceId: string,
  applicationId: string,
  approvedByClerkUserId: string,
  expectedVersion: string,
  dependencies: CreativeApplicationAdminServiceDependencies = defaultDependencies,
): Promise<ApproveCreativeApplicationResult> => {
  const workspace = requireText(workspaceId, "workspaceId");
  const id = requireUuid(applicationId, "applicationId");
  const adminId = requireText(approvedByClerkUserId, "approvedByClerkUserId");
  const version = requireVersion(expectedVersion);
  const initial = await loadApplication(id, dependencies);

  if (initial.moderationStatus === "rejected") {
    throw new CreativeApplicationAdminError(
      "conflict",
      "Une candidature refusée ne peut pas être approuvée.",
    );
  }
  if (initial.moderationStatus === "approved") {
    return {
      profile: await loadApprovedProfile(workspace, initial, dependencies),
      application: initial,
      alreadyApproved: true,
      sheetSynchronized: true,
    };
  }
  if (initial.version !== version) {
    throw new CreativeApplicationAdminError(
      "version_conflict",
      "La candidature a été modifiée.",
    );
  }
  if (initial.creativeId) {
    throw new CreativeApplicationAdminError(
      "conflict",
      "Une candidature en attente ne peut pas déjà référencer une fiche canonique.",
    );
  }

  const confirmed = await loadApplication(id, dependencies);
  if (
    confirmed.moderationStatus !== "pending"
    || confirmed.creativeId
    || confirmed.version !== version
  ) {
    throw new CreativeApplicationAdminError(
      "version_conflict",
      "La candidature a été modifiée.",
    );
  }

  const attemptedAt = dependencies.now().toISOString();
  const profile = await createProfile(
    workspace,
    profileInputFromApplication(confirmed, adminId, attemptedAt),
    dependencies,
  );
  if (profile.workspaceId !== workspace || profile.applicationId !== id) {
    throw new CreativeApplicationAdminError(
      "conflict",
      "La fiche canonique créée ne correspond pas à la candidature.",
    );
  }

  const current = await loadApplication(id, dependencies);
  if (current.moderationStatus === "approved") {
    if (current.creativeId !== profile.id) {
      throw new CreativeApplicationAdminError(
        "conflict",
        "La candidature référence une autre fiche canonique.",
      );
    }
    return {
      profile,
      application: current,
      alreadyApproved: true,
      sheetSynchronized: true,
    };
  }
  if (
    current.moderationStatus === "rejected"
    || (current.creativeId && current.creativeId !== profile.id)
  ) {
    throw new CreativeApplicationAdminError(
      "conflict",
      "L’état de la candidature a changé pendant son approbation.",
    );
  }

  try {
    const synchronized = await dependencies.updateModeration(id, {
      status: "approved",
      creativeId: profile.id,
      moderatedAt: profile.approvedAt,
      moderatedBy: profile.approvedByClerkUserId,
      notes: null,
    });
    return {
      profile,
      application: synchronized,
      alreadyApproved: false,
      sheetSynchronized: true,
    };
  } catch {
    return {
      profile,
      application: applicationFromProfile(current, profile),
      alreadyApproved: false,
      sheetSynchronized: false,
    };
  }
};

export const rejectCreativeApplication = async (
  workspaceId: string,
  applicationId: string,
  rejectedByClerkUserId: string,
  reason: string,
  expectedVersion: string,
  dependencies: CreativeApplicationAdminServiceDependencies = defaultDependencies,
): Promise<RejectCreativeApplicationResult> => {
  requireText(workspaceId, "workspaceId");
  const id = requireUuid(applicationId, "applicationId");
  const adminId = requireText(rejectedByClerkUserId, "rejectedByClerkUserId");
  const normalizedReason = normalizeReason(reason);
  const version = requireVersion(expectedVersion);
  const application = await loadApplication(id, dependencies);

  if (application.moderationStatus === "approved") {
    throw new CreativeApplicationAdminError(
      "conflict",
      "Une candidature approuvée ne peut pas être refusée.",
    );
  }
  if (application.creativeId) {
    throw new CreativeApplicationAdminError(
      "conflict",
      "Une candidature non approuvée ne peut pas référencer une fiche canonique.",
    );
  }
  if (application.moderationStatus === "rejected") {
    if (application.moderationNotes !== normalizedReason) {
      throw new CreativeApplicationAdminError(
        "conflict",
        "La candidature a déjà été refusée avec une autre décision.",
      );
    }
    return { application, alreadyRejected: true };
  }
  if (application.version !== version) {
    throw new CreativeApplicationAdminError(
      "version_conflict",
      "La candidature a été modifiée.",
    );
  }

  const rejected = await writeModeration(id, {
    status: "rejected",
    creativeId: null,
    moderatedAt: dependencies.now().toISOString(),
    moderatedBy: adminId,
    notes: normalizedReason,
  }, dependencies);
  return { application: rejected, alreadyRejected: false };
};
