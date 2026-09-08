// Constantes et validations partagees entre le widget d'upload (client) et la route handleUpload (serveur).
// Stockage durable Vercel Blob en acces prive: memes principes que lib/athlete-visuals/service.ts, mais
// l'upload passe directement du navigateur vers Blob (voir /api/hub-resources/pdf) pour eviter la limite
// de taille de requete des fonctions serverless Vercel (~4.5 Mo), incompatible avec la limite de 20 Mo annoncee.
export const HUB_RESOURCE_PDF_CONTENT_TYPE = "application/pdf";
export const MAX_HUB_RESOURCE_PDF_SIZE_BYTES = 20 * 1024 * 1024; // 20 Mo
const PDF_MAGIC_BYTES = "%PDF-";

export const isAllowedHubResourcePdfContentType = (contentType: string): boolean =>
  contentType === HUB_RESOURCE_PDF_CONTENT_TYPE;

export const sanitizeHubResourcePdfFilename = (filename: string): string => {
  const trimmed = filename.trim().slice(-120);
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe || "document.pdf";
};

// Verification cote client avant envoi: le type MIME declare peut etre falsifie, on lit aussi la signature binaire.
export const isValidHubResourcePdfFile = async (file: File): Promise<boolean> => {
  if (!isAllowedHubResourcePdfContentType(file.type)) return false;
  if (file.size <= 0 || file.size > MAX_HUB_RESOURCE_PDF_SIZE_BYTES) return false;
  const headerBytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return new TextDecoder("utf-8").decode(headerBytes) === PDF_MAGIC_BYTES;
};
