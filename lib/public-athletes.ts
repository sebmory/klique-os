export const normalizePublicSportLabel = (value: unknown): string => {
  const label = String(value ?? "").trim().replace(/\s+/g, " ");
  const key = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(?:football|foot|american football)\s+americain(?:e)?$/.test(key)) return "Football américain";
  if (/^basket(?:ball)?(?:\s+u(?:\s*\d+)?)?$/.test(key)) return "Basketball";
  if (/^(?:foot|football)(?:\s+u(?:\s*\d+)?)?$/.test(key)) return "Football";
  if (key === "badminton") return "Badminton";
  if (key === "tennis") return "Tennis";
  return label;
};