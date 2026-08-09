export type ProductionNote = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const makeId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = () => new Date().toISOString();

export const parseProductionNotes = (value: unknown): ProductionNote[] => {
  if (!value) return [];

  if (typeof value === "string") {
    const content = normalize(value);
    if (!content) return [];

    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
          .map((entry) => ({
            id: normalize(entry.id) || makeId(),
            content: normalize(entry.content),
            createdAt: normalize(entry.createdAt) || nowIso(),
            updatedAt: normalize(entry.updatedAt) || nowIso(),
          }))
          .filter((entry) => entry.content);
      }
    } catch {
      // fall back to plain text note
    }

    return [{ id: makeId(), content, createdAt: nowIso(), updatedAt: nowIso() }];
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        id: normalize(entry.id) || makeId(),
        content: normalize(entry.content),
        createdAt: normalize(entry.createdAt) || nowIso(),
        updatedAt: normalize(entry.updatedAt) || nowIso(),
      }))
      .filter((entry) => entry.content);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const content = normalize(record.content);
    if (content) return [{ id: makeId(), content, createdAt: nowIso(), updatedAt: nowIso() }];
  }

  return [];
};

export const serializeProductionNotes = (notes: ProductionNote[]): string => {
  return JSON.stringify(notes);
};

export const createProductionNote = (content: string): ProductionNote => ({
  id: makeId(),
  content,
  createdAt: nowIso(),
  updatedAt: nowIso(),
});
