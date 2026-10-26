import {
  collectRssSportsWatchCandidates,
  type RssSportsWatchSourceConfig,
  type SportsWatchAthleteSnapshot,
} from "@/lib/sports-watch/bcbulle-collector";

export const KENPOKAN_SOURCE_KEY = "kenpokan";
export const KENPOKAN_SOURCE_NAME = "Kenpokan Dojo";
export const KENPOKAN_FEED_URL = "https://kenpokan-dojo.ch/feed/";

const KENPOKAN_RSS_SOURCE: RssSportsWatchSourceConfig = {
  key: KENPOKAN_SOURCE_KEY,
  name: KENPOKAN_SOURCE_NAME,
  feedUrl: KENPOKAN_FEED_URL,
  hostname: "kenpokan-dojo.ch",
  sportLabels: ["kempo", "kenpo"],
  clubLabels: ["kenpokan", "kenpokandojo"],
  requireArticleClubContext: true,
};

export const collectKenpokanCandidates = (
  athlete: SportsWatchAthleteSnapshot,
  options: Parameters<typeof collectRssSportsWatchCandidates>[2] = {},
) => collectRssSportsWatchCandidates(athlete, KENPOKAN_RSS_SOURCE, options);

export const kenpokanCollectorTestUtils = {
  source: KENPOKAN_RSS_SOURCE,
};
