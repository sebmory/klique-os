import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { validateStoryStudioPhotoBytes } from "@/lib/story-studio/photo-service";
import { AthleteNewsReportError } from "@/lib/athlete-news-reports/service";

export const MAX_ATHLETE_NEWS_PHOTO_BYTES = 10 * 1024 * 1024;

export const getAthleteNewsBlobToken = (): string => {
  const token = process.env.KLIQUE_ATHLETE_NEWS_BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error("KLIQUE_ATHLETE_NEWS_BLOB_READ_WRITE_TOKEN est absent.");
  }
  return token;
};

export const uploadAthleteNewsPhoto = async (file: File) => {
  if (file.size < 1 || file.size > MAX_ATHLETE_NEWS_PHOTO_BYTES) {
    throw new AthleteNewsReportError("validation", "La photo doit peser moins de 10 Mo.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateStoryStudioPhotoBytes(bytes, file.type, file.size);
  const extension = validated.contentType === "image/jpeg"
    ? "jpg"
    : validated.contentType === "image/png" ? "png" : "webp";
  const pathname = `athlete-news-reports/${randomUUID()}.${extension}`;
  const blob = await put(pathname, Buffer.from(bytes), {
    access: "private",
    addRandomSuffix: false,
    contentType: validated.contentType,
    token: getAthleteNewsBlobToken(),
  });
  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: validated.contentType,
    sizeBytes: validated.sizeBytes,
  };
};

export const deleteAthleteNewsPhoto = async (url: string) => {
  await del(url, { token: getAthleteNewsBlobToken() });
};
