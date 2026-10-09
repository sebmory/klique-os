import { revalidatePath, revalidateTag } from "next/cache";

export const PUBLIC_KLIQUE_STATS_CACHE_TAG = "public-klique-stats";
export const PUBLIC_KLIQUE_STATS_WORKSPACE_ID = "klique-os";

type PublicKliqueStatsCacheDependencies = {
  revalidatePath: typeof revalidatePath;
  revalidateTag: typeof revalidateTag;
};

const defaultDependencies: PublicKliqueStatsCacheDependencies = {
  revalidatePath,
  revalidateTag,
};

export const invalidatePublicKliqueStats = (
  dependencies: PublicKliqueStatsCacheDependencies = defaultDependencies,
): void => {
  dependencies.revalidateTag(PUBLIC_KLIQUE_STATS_CACHE_TAG, { expire: 0 });
  dependencies.revalidatePath("/api/public/klique-stats");
  dependencies.revalidatePath("/");
};
