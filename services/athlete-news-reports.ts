import type { AthleteNewsArticlePrefill } from "@/types/athlete-news-report";
import type { ManualEditorialMaterial } from "@/types/context-intelligence";

export const buildAthleteNewsEditorialMaterial = (
  prefill: AthleteNewsArticlePrefill,
): ManualEditorialMaterial => ({
  id: `athlete-news-report-${prefill.reportId}`,
  kind: "note",
  text: prefill.message,
  provenance: prefill.provenance,
  sourceDate: prefill.eventDate,
});
