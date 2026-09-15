export type AuthenticatedContentStorageRole = "admin" | "media" | null;

let authenticatedRole: AuthenticatedContentStorageRole = null;

export const setAuthenticatedContentStorageRole = (role: unknown): void => {
  authenticatedRole = role === "admin" || role === "media" ? role : null;
};

export const canUseLocalContentStorage = (): boolean => authenticatedRole === "admin";