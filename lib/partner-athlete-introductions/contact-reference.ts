import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeInstagramContact } from "@/lib/partner-athlete-introductions/domain";

const normalizeRequired = (value: unknown, fieldName: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${fieldName} est requis.`);
  return normalized;
};

const frame = (value: string): string => `${Buffer.byteLength(value, "utf8")}:${value}`;

export const getContactReferenceSecret = (): string => {
  const secret = process.env.KLIQUE_CONTACT_REFERENCE_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error(
      "KLIQUE_CONTACT_REFERENCE_SECRET doit contenir au moins 32 caractères.",
    );
  }
  return secret;
};

export const buildInstagramContactReference = (input: {
  secret: string;
  workspaceId: string;
  requestId: string;
  athleteId: string;
  normalizedInstagram: string;
}): string => {
  const secret = normalizeRequired(input.secret, "secret");
  const normalizedInstagram = normalizeInstagramContact(input.normalizedInstagram);
  if (!normalizedInstagram) throw new Error("Instagram est invalide.");
  const payload = [
    "partner-athlete-introduction-contact-v1",
    normalizeRequired(input.workspaceId, "workspaceId"),
    normalizeRequired(input.requestId, "requestId"),
    normalizeRequired(input.athleteId, "athleteId"),
    "instagram",
    normalizedInstagram,
  ].map(frame).join("|");
  return `v1.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
};

export const contactReferencesEqual = (
  leftValue: unknown,
  rightValue: unknown,
): boolean => {
  const left = Buffer.from(String(leftValue ?? "").trim(), "utf8");
  const right = Buffer.from(String(rightValue ?? "").trim(), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
};
