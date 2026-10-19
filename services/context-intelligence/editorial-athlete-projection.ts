import { getEditorialAthleteProjectionFromGoogleSheets } from "@/lib/google-sheets";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import type { EditorialAthleteProjection } from "@/types/editorial-athlete";

export class EditorialGoogleSheetsWorkspaceError extends Error {
  constructor() {
    super("La source Google Sheets editoriale n est pas disponible pour ce workspace.");
    this.name = "EditorialGoogleSheetsWorkspaceError";
  }
}

export type EditorialAthleteProjectionReader = (
  athleteId: string,
  role: ContentAccessContext["role"],
) => Promise<EditorialAthleteProjection | null>;

export const assertEditorialGoogleSheetsWorkspace = (workspaceId: string): void => {
  const defaultWorkspaceId = process.env.KLIQUE_DEFAULT_WORKSPACE_ID?.trim() ?? "";
  if (!defaultWorkspaceId || workspaceId.trim() !== defaultWorkspaceId) {
    throw new EditorialGoogleSheetsWorkspaceError();
  }
};

export const readEditorialAthleteProjection = async (
  athleteId: string,
  access: Pick<ContentAccessContext, "workspaceId" | "role">,
  reader: EditorialAthleteProjectionReader = getEditorialAthleteProjectionFromGoogleSheets,
): Promise<EditorialAthleteProjection | null> => {
  assertEditorialGoogleSheetsWorkspace(access.workspaceId);
  return reader(athleteId, access.role);
};
