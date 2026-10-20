import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { isPartnerAthleteIntroductionsEnabled } from "@/lib/partner-athlete-introductions/activation";
import { processPartnerAthleteIntroductionOutbox } from "@/lib/partner-athlete-introductions/outbox";

type AfterResponseDependencies = {
  enabled?: () => boolean;
  schedule?: (task: () => Promise<void>) => void;
  process?: typeof processPartnerAthleteIntroductionOutbox;
};

export const schedulePartnerIntroductionOutboxAfterResponse = (
  dependencies: AfterResponseDependencies = {},
): void => {
  const enabled = dependencies.enabled ?? isPartnerAthleteIntroductionsEnabled;
  if (!enabled()) return;
  const schedule = dependencies.schedule ?? after;
  const processOutbox = dependencies.process ?? processPartnerAthleteIntroductionOutbox;

  schedule(async () => {
    if (!enabled()) return;
    try {
      const result = await processOutbox({
        workerId: `after-response-${randomUUID()}`,
      });
      console.info(
        [
          "[partner_athlete_introduction_outbox]",
          "source=after_response",
          `claimed=${result.claimed}`,
          `delivered=${result.delivered}`,
          `discarded=${result.discarded}`,
          `retried=${result.retried}`,
          `failed=${result.failed}`,
        ].join(" "),
      );
    } catch {
      console.warn(
        "[partner_athlete_introduction_outbox] source=after_response execution=failed",
      );
    }
  });
};
