import { createHash, randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { PDFDocument } from "pdf-lib";
import { getAthleteNewsBlobToken } from "@/lib/athlete-news-reports/photo";
import { validateStoryStudioPhotoBytes } from "@/lib/story-studio/photo-service";

export const MAX_SPORTS_WATCH_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_SPORTS_WATCH_IMPORT_PDF_PAGES = 5;

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export class SportsWatchImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SportsWatchImportFileError";
  }
}

const validatePdf = async (bytes: Uint8Array): Promise<void> => {
  if (
    bytes.length < 5
    || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-"
  ) {
    throw new SportsWatchImportFileError("Le fichier ne possède pas une signature PDF valide.");
  }
  try {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const pageCount = pdf.getPageCount();
    if (pageCount < 1 || pageCount > MAX_SPORTS_WATCH_IMPORT_PDF_PAGES) {
      throw new SportsWatchImportFileError(
        `Le PDF doit contenir entre 1 et ${MAX_SPORTS_WATCH_IMPORT_PDF_PAGES} pages.`,
      );
    }
  } catch (error) {
    if (error instanceof SportsWatchImportFileError) throw error;
    throw new SportsWatchImportFileError("Le PDF est invalide, chiffré ou illisible.");
  }
};

export const validateSportsWatchImportFile = async (file: File) => {
  if (
    file.size < 1
    || file.size > MAX_SPORTS_WATCH_IMPORT_BYTES
    || !allowedContentTypes.has(file.type)
  ) {
    throw new SportsWatchImportFileError(
      "Formats acceptés : JPEG, PNG, WebP ou PDF, avec une taille maximale de 10 Mo.",
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === "application/pdf") {
    await validatePdf(bytes);
  } else {
    try {
      validateStoryStudioPhotoBytes(bytes, file.type, file.size);
    } catch (error) {
      throw new SportsWatchImportFileError(
        error instanceof Error ? error.message : "L’image est invalide ou illisible.",
      );
    }
  }
  return {
    bytes,
    contentType: file.type,
    sizeBytes: file.size,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    originalFilename: file.name.trim().slice(0, 240) || `resultat.${extensions[file.type]}`,
  };
};

export const uploadSportsWatchImportFile = async (
  file: File,
): Promise<{
  pathname: string;
  contentType: string;
  sizeBytes: number;
  contentHash: string;
  originalFilename: string;
}> => {
  const validated = await validateSportsWatchImportFile(file);
  const pathname = `sports-watch-imports/${randomUUID()}.${extensions[validated.contentType]}`;
  const blob = await put(pathname, Buffer.from(validated.bytes), {
    access: "private",
    addRandomSuffix: false,
    contentType: validated.contentType,
    token: getAthleteNewsBlobToken(),
  });
  return {
    pathname: blob.pathname,
    contentType: validated.contentType,
    sizeBytes: validated.sizeBytes,
    contentHash: validated.contentHash,
    originalFilename: validated.originalFilename,
  };
};

export const readSportsWatchImportFile = async (
  pathname: string,
): Promise<Uint8Array> => {
  const blob = await get(pathname, {
    access: "private",
    useCache: false,
    token: getAthleteNewsBlobToken(),
  });
  if (!blob?.stream) {
    throw new SportsWatchImportFileError("Le document privé importé est introuvable.");
  }
  return new Uint8Array(await new Response(blob.stream).arrayBuffer());
};

export const deleteSportsWatchImportFile = async (pathname: string): Promise<void> => {
  await del(pathname, { token: getAthleteNewsBlobToken() });
};
