import { describe, expect, it, vi } from "vitest";
import {
  invalidatePublicKliqueStats,
  PUBLIC_KLIQUE_STATS_CACHE_TAG,
} from "@/lib/public-klique-stats-cache";

describe("public KLIQUE stats cache invalidation", () => {
  it("expires the aggregate tag and revalidates the API and public home", () => {
    const revalidateTag = vi.fn();
    const revalidatePath = vi.fn();

    invalidatePublicKliqueStats({
      revalidateTag,
      revalidatePath,
    });

    expect(revalidateTag).toHaveBeenCalledWith(
      PUBLIC_KLIQUE_STATS_CACHE_TAG,
      { expire: 0 },
    );
    expect(revalidatePath.mock.calls).toEqual([
      ["/api/public/klique-stats"],
      ["/"],
    ]);
  });
});
