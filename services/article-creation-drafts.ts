"use client";

import type {
  ArticleCreationDraftPayload,
  ArticleCreationDraftRecord,
  ArticleCreationDraftSummary,
} from "@/types/article-creation-draft";

export type ArticleDraftSaveState = "idle" | "loading" | "saving" | "saved" | "error" | "conflict";

type ErrorPayload = {
  code?: string;
  message?: string;
  currentVersion?: number;
};

export class ArticleCreationDraftApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly currentVersion?: number,
  ) {
    super(message);
    this.name = "ArticleCreationDraftApiError";
  }
}

const readJson = async <T>(response: Response): Promise<T> =>
  await response.json().catch(() => ({})) as T;

const assertOk = async <T>(response: Response): Promise<T> => {
  const payload = await readJson<T & ErrorPayload>(response);
  if (!response.ok) {
    throw new ArticleCreationDraftApiError(
      payload.message || "Le stockage prive des brouillons Article est indisponible.",
      response.status,
      payload.code,
      payload.currentVersion,
    );
  }
  return payload;
};

export const createArticleDraftClientCreationId = (): string => crypto.randomUUID();

export const articleDraftRecoveryStorageKey = (storageScope: string, contextKey: string): string =>
  `klique.contents.article-draft-recovery.v1:${storageScope}:${contextKey}`;

export const ArticleCreationDraftClient = {
  async list(): Promise<{ storageScope: string; drafts: ArticleCreationDraftSummary[] }> {
    const response = await fetch("/api/contents/article-drafts", {
      credentials: "include",
      cache: "no-store",
    });
    return await assertOk(response);
  },

  async load(draftId: string): Promise<ArticleCreationDraftRecord> {
    const response = await fetch(`/api/contents/article-drafts/${encodeURIComponent(draftId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = await assertOk<{ draft: ArticleCreationDraftRecord }>(response);
    return payload.draft;
  },

  async create(input: {
    clientCreationId: string;
    displayTitle: string;
    payload: ArticleCreationDraftPayload;
  }): Promise<ArticleCreationDraftRecord> {
    const response = await fetch("/api/contents/article-drafts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await assertOk<{ draft: ArticleCreationDraftRecord }>(response);
    return payload.draft;
  },

  async update(
    draftId: string,
    input: {
      expectedVersion: number;
      displayTitle: string;
      payload: ArticleCreationDraftPayload;
    },
  ): Promise<ArticleCreationDraftRecord> {
    const response = await fetch(`/api/contents/article-drafts/${encodeURIComponent(draftId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await assertOk<{ draft: ArticleCreationDraftRecord }>(response);
    return payload.draft;
  },

  async remove(draftId: string): Promise<void> {
    const response = await fetch(`/api/contents/article-drafts/${encodeURIComponent(draftId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (response.status === 204) return;
    await assertOk(response);
  },
};

type QueueSnapshot<T> = {
  revision: number;
  value: T;
};

export type SerializedSaveResult = "saved" | "conflict";

export class SerializedArticleDraftSaveQueue<T> {
  private latest: QueueSnapshot<T> | null = null;
  private persistedRevision = 0;
  private revision = 0;
  private running: Promise<SerializedSaveResult> | null = null;
  private stopped = false;

  update(value: T): void {
    if (this.stopped) return;
    this.revision += 1;
    this.latest = { revision: this.revision, value };
  }

  hasPending(): boolean {
    return Boolean(this.latest && this.latest.revision > this.persistedRevision);
  }

  stop(): void {
    this.stopped = true;
  }

  reset(value: T): void {
    this.stopped = false;
    this.revision += 1;
    this.persistedRevision = this.revision;
    this.latest = { revision: this.revision, value };
  }

  async flush(save: (value: T) => Promise<SerializedSaveResult>): Promise<SerializedSaveResult> {
    if (this.stopped) return "conflict";
    if (!this.running) {
      const drain = (async () => {
        while (!this.stopped && this.latest && this.latest.revision > this.persistedRevision) {
          const snapshot = this.latest;
          const result = await save(snapshot.value);
          if (result === "conflict") {
            this.stopped = true;
            return result;
          }
          this.persistedRevision = snapshot.revision;
        }
        return this.stopped ? "conflict" : "saved";
      })();
      const tracked = drain.finally(() => {
        if (this.running === tracked) this.running = null;
      });
      this.running = tracked;
    }
    return await this.running;
  }
}
