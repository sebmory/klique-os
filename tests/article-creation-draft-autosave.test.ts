import { describe, expect, it, vi } from "vitest";
import {
  SerializedArticleDraftSaveQueue,
  articleDraftRecoveryStorageKey,
} from "@/services/article-creation-drafts";

describe("Article draft serialized autosave", () => {
  it("serializes saves and does not finish before a newer snapshot is stored", async () => {
    const queue = new SerializedArticleDraftSaveQueue<{ value: number }>();
    let releaseFirst: (() => void) | undefined;
    const save = vi.fn(async ({ value }: { value: number }) => {
      if (value === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return "saved" as const;
    });

    queue.update({ value: 1 });
    const flushing = queue.flush(save);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    queue.update({ value: 2 });
    releaseFirst?.();

    await expect(flushing).resolves.toBe("saved");
    expect(save.mock.calls.map(([snapshot]) => snapshot.value)).toEqual([1, 2]);
    expect(queue.hasPending()).toBe(false);
  });

  it("stops after a version conflict and keeps the newer local snapshot pending", async () => {
    const queue = new SerializedArticleDraftSaveQueue<{ value: number }>();
    queue.update({ value: 1 });

    await expect(queue.flush(async () => "conflict")).resolves.toBe("conflict");
    queue.update({ value: 2 });

    expect(queue.hasPending()).toBe(true);
    await expect(queue.flush(async () => "saved")).resolves.toBe("conflict");
  });

  it("shares one drain between simultaneous flush requests", async () => {
    const queue = new SerializedArticleDraftSaveQueue<{ value: number }>();
    let inFlight = 0;
    let maxInFlight = 0;
    let release: (() => void) | undefined;
    queue.update({ value: 1 });
    const save = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      inFlight -= 1;
      return "saved" as const;
    });

    const first = queue.flush(save);
    const second = queue.flush(save);
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    release?.();

    await expect(Promise.all([first, second])).resolves.toEqual(["saved", "saved"]);
    expect(maxInFlight).toBe(1);
  });

  it("isolates browser recovery keys by authenticated scope and work context", () => {
    expect(articleDraftRecoveryStorageKey("scope-user-a", "article:alex"))
      .not.toBe(articleDraftRecoveryStorageKey("scope-user-b", "article:alex"));
    expect(articleDraftRecoveryStorageKey("scope-user-a", "article:alex"))
      .not.toBe(articleDraftRecoveryStorageKey("scope-user-a", "article:other"));
  });
});
