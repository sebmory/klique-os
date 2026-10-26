import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  MAX_SPORTS_WATCH_IMPORT_BYTES,
  validateSportsWatchImportFile,
} from "@/lib/sports-watch/import-file";

const pdfFile = async (pageCount: number): Promise<File> => {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) pdf.addPage();
  const bytes = await pdf.save();
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new File([buffer], "resultats.pdf", { type: "application/pdf" });
};

describe("sports watch import file validation", () => {
  it("accepts a real five-page PDF and computes stable metadata", async () => {
    const result = await validateSportsWatchImportFile(await pdfFile(5));
    expect(result).toMatchObject({
      contentType: "application/pdf",
      originalFilename: "resultats.pdf",
    });
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects oversized, invalid and six-page PDFs", async () => {
    await expect(validateSportsWatchImportFile(await pdfFile(6)))
      .rejects.toThrow("entre 1 et 5 pages");
    await expect(validateSportsWatchImportFile(
      new File(["not-pdf"], "resultats.pdf", { type: "application/pdf" }),
    )).rejects.toThrow("signature PDF valide");
    await expect(validateSportsWatchImportFile(
      new File([new Uint8Array(MAX_SPORTS_WATCH_IMPORT_BYTES + 1)], "large.pdf", {
        type: "application/pdf",
      }),
    )).rejects.toThrow("10 Mo");
  });
});
