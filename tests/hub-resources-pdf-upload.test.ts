import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_HUB_RESOURCE_PDF_SIZE_BYTES,
  isAllowedHubResourcePdfContentType,
  isValidHubResourcePdfFile,
  sanitizeHubResourcePdfFilename,
} from "@/lib/hub-resources/pdf-upload";

const pdfBytes = new TextEncoder().encode("%PDF-1.4 fake but valid header");
const makePdfFile = (name = "brochure.pdf", bytes: Uint8Array<ArrayBuffer> = pdfBytes) =>
  new File([bytes], name, { type: "application/pdf" });

describe("isAllowedHubResourcePdfContentType", () => {
  it("only accepts application/pdf", () => {
    expect(isAllowedHubResourcePdfContentType("application/pdf")).toBe(true);
    expect(isAllowedHubResourcePdfContentType("image/png")).toBe(false);
    expect(isAllowedHubResourcePdfContentType("application/msword")).toBe(false);
  });
});

describe("sanitizeHubResourcePdfFilename", () => {
  it("replaces unsafe characters and keeps a usable extension", () => {
    expect(sanitizeHubResourcePdfFilename("Mon Fichier (2026).pdf")).toBe("Mon_Fichier__2026_.pdf");
  });

  it("falls back to a default name when nothing usable remains", () => {
    expect(sanitizeHubResourcePdfFilename("   ")).toBe("document.pdf");
  });
});

describe("isValidHubResourcePdfFile", () => {
  it("accepts a valid PDF (correct content type, size, and binary signature)", async () => {
    await expect(isValidHubResourcePdfFile(makePdfFile())).resolves.toBe(true);
  });

  it("rejects a non-PDF content type", async () => {
    const file = new File([pdfBytes], "brochure.png", { type: "image/png" });
    await expect(isValidHubResourcePdfFile(file)).resolves.toBe(false);
  });

  it("rejects a file whose declared type is PDF but whose content is not (spoofed content type)", async () => {
    const file = new File([new TextEncoder().encode("not a real pdf")], "fake.pdf", { type: "application/pdf" });
    await expect(isValidHubResourcePdfFile(file)).resolves.toBe(false);
  });

  it("rejects an empty file", async () => {
    const file = new File([], "empty.pdf", { type: "application/pdf" });
    await expect(isValidHubResourcePdfFile(file)).resolves.toBe(false);
  });

  it("rejects a file larger than the maximum allowed size", async () => {
    const oversized = new Uint8Array(new ArrayBuffer(MAX_HUB_RESOURCE_PDF_SIZE_BYTES + 1));
    oversized.set(pdfBytes);
    const file = makePdfFile("big.pdf", oversized);
    await expect(isValidHubResourcePdfFile(file)).resolves.toBe(false);
  });
});

describe("hub-resources PDF: upload and permission-gated access", () => {
  const uploadRouteSource = fs.readFileSync(
    path.resolve(process.cwd(), "app/api/hub-resources/pdf/route.ts"),
    "utf8",
  );
  const downloadRouteSource = fs.readFileSync(
    path.resolve(process.cwd(), "app/api/hub-resources/[resourceId]/pdf/route.ts"),
    "utf8",
  );

  it("uploads directly from the browser to Blob via a signed token, never through the serverless function body", () => {
    expect(uploadRouteSource).toContain("handleUpload");
    expect(uploadRouteSource).toContain("onBeforeGenerateToken");
    expect(uploadRouteSource).toContain("maximumSizeInBytes: MAX_HUB_RESOURCE_PDF_SIZE_BYTES");
    expect(uploadRouteSource).toContain('allowedContentTypes: [HUB_RESOURCE_PDF_CONTENT_TYPE]');
  });

  it("gates the upload token behind the admin-only write:crm permission check", () => {
    expect(uploadRouteSource).toContain('evaluateBusinessAccess(request, { action: "write:crm" })');
  });

  it("serves the stored PDF only after re-checking the resource's own visibility permissions", () => {
    expect(downloadRouteSource).toContain("getHubResourceById(request, resourceId, userId ?? null)");
    expect(downloadRouteSource).toContain('{ access: "private" }');
  });
});

