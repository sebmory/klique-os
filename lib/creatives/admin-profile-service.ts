import {
  CreativeProfileRepository,
  CreativeProfileValidationError,
} from "@/lib/creatives/repository";
import type {
  CreateAdminManualCreativeProfileInput,
  CreateManualCreativeProfileInput,
  CreativeProfile,
  UpdateCreativeProfileInput,
} from "@/types/creative";

export type CreativeProfileAdminServiceDependencies = {
  listProfiles: (workspaceId: string) => Promise<CreativeProfile[]>;
  updateProfile: (
    workspaceId: string,
    creativeId: string,
    input: UpdateCreativeProfileInput,
  ) => Promise<CreativeProfile | null>;
  createManualProfile: (
    workspaceId: string,
    input: CreateAdminManualCreativeProfileInput,
  ) => Promise<CreativeProfile>;
  now: () => Date;
};

export class CreativeProfileAdminError extends Error {
  constructor(
    public readonly code: "validation" | "not_found" | "dependency",
    message: string,
  ) {
    super(message);
    this.name = "CreativeProfileAdminError";
  }
}

const defaultDependencies: CreativeProfileAdminServiceDependencies = {
  listProfiles: CreativeProfileRepository.list.bind(CreativeProfileRepository),
  updateProfile: CreativeProfileRepository.update.bind(CreativeProfileRepository),
  createManualProfile: CreativeProfileRepository.createManual.bind(CreativeProfileRepository),
  now: () => new Date(),
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireWorkspaceId = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new CreativeProfileAdminError("validation", "workspaceId est requis.");
  }
  return value.trim();
};

const requireCreativeId = (value: unknown): string => {
  if (typeof value !== "string" || !uuidPattern.test(value.trim())) {
    throw new CreativeProfileAdminError("validation", "creativeId est invalide.");
  }
  return value.trim().toLowerCase();
};

export const listCreativeProfilesForAdmin = async (
  workspaceId: string,
  dependencies: CreativeProfileAdminServiceDependencies = defaultDependencies,
): Promise<CreativeProfile[]> => {
  const workspace = requireWorkspaceId(workspaceId);
  try {
    return await dependencies.listProfiles(workspace);
  } catch {
    throw new CreativeProfileAdminError(
      "dependency",
      "Les fiches créatives n’ont pas pu être chargées.",
    );
  }
};

export const createManualCreativeProfileForAdmin = async (
  workspaceId: string,
  approvedByClerkUserId: string,
  input: CreateManualCreativeProfileInput,
  dependencies: CreativeProfileAdminServiceDependencies = defaultDependencies,
): Promise<CreativeProfile> => {
  const workspace = requireWorkspaceId(workspaceId);
  if (typeof approvedByClerkUserId !== "string" || !approvedByClerkUserId.trim()) {
    throw new CreativeProfileAdminError("validation", "Administrateur invalide.");
  }
  try {
    const profile = await dependencies.createManualProfile(workspace, {
      ...input,
      provenance: "admin_manual",
      applicationId: null,
      sourceRow: null,
      approvedByClerkUserId: approvedByClerkUserId.trim(),
      approvedAt: dependencies.now().toISOString(),
    });
    if (
      profile.workspaceId !== workspace
      || profile.provenance !== "admin_manual"
      || profile.applicationId !== null
      || profile.sourceRow !== null
    ) {
      throw new CreativeProfileAdminError(
        "dependency",
        "La fiche créative manuelle créée est incohérente.",
      );
    }
    return profile;
  } catch (error) {
    if (error instanceof CreativeProfileAdminError) throw error;
    if (error instanceof CreativeProfileValidationError) {
      throw new CreativeProfileAdminError(
        "validation",
        "Les données de la fiche créative sont invalides.",
      );
    }
    throw new CreativeProfileAdminError(
      "dependency",
      "La fiche créative n’a pas pu être créée.",
    );
  }
};

export const updateCreativeProfileForAdmin = async (
  workspaceId: string,
  creativeId: string,
  input: UpdateCreativeProfileInput,
  dependencies: CreativeProfileAdminServiceDependencies = defaultDependencies,
): Promise<CreativeProfile> => {
  const workspace = requireWorkspaceId(workspaceId);
  const id = requireCreativeId(creativeId);
  if (!input || typeof input !== "object" || Object.keys(input).length === 0) {
    throw new CreativeProfileAdminError("validation", "Aucune modification fournie.");
  }

  try {
    const profile = await dependencies.updateProfile(workspace, id, input);
    if (!profile) {
      throw new CreativeProfileAdminError(
        "not_found",
        "Fiche créative introuvable.",
      );
    }
    if (profile.workspaceId !== workspace || profile.id !== id) {
      throw new CreativeProfileAdminError(
        "not_found",
        "Fiche créative introuvable.",
      );
    }
    return profile;
  } catch (error) {
    if (error instanceof CreativeProfileAdminError) throw error;
    if (error instanceof CreativeProfileValidationError) {
      throw new CreativeProfileAdminError(
        "validation",
        "Les données de la fiche créative sont invalides.",
      );
    }
    throw new CreativeProfileAdminError(
      "dependency",
      "La fiche créative n’a pas pu être mise à jour.",
    );
  }
};
