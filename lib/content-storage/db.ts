import { neon } from "@neondatabase/serverless";
import { getContentStorageServerConfig } from "@/lib/content-storage/config";

const ensureNodeRuntime = () => {
  if (typeof window !== "undefined") {
    throw new Error("Content storage DB est reserve au serveur.");
  }
  const edgeRuntime = (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime;
  if (typeof edgeRuntime !== "undefined") {
    throw new Error("Content storage DB requiert runtime Node.js.");
  }
};

export const createContentStorageClient = () => {
  ensureNodeRuntime();
  const { databaseUrl } = getContentStorageServerConfig();
  return neon(databaseUrl);
};

export const getDefaultWorkspaceId = (): string => {
  const { defaultWorkspaceId } = getContentStorageServerConfig();
  return defaultWorkspaceId;
};
