import { randomUUID } from "node:crypto";
import {
  createPartnerAthleteIntroductionRepository,
  type PartnerAthleteIntroductionRepository,
} from "@/lib/partner-athlete-introductions/repository";

export type PartnerIntroductionOutboxRunResult = {
  claimed: number;
  delivered: number;
  discarded: number;
  retried: number;
  failed: number;
};

export type PartnerIntroductionOutboxOptions = {
  workerId: string;
  now?: Date;
  batchSize?: number;
  maxAttempts?: number;
  staleLockMilliseconds?: number;
};

const boundedInteger = (
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  fieldName: string,
): number => {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new Error(`${fieldName} doit être un entier entre ${minimum} et ${maximum}.`);
  }
  return resolved;
};

const retryDelayMilliseconds = (attemptCount: number): number =>
  Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** Math.max(0, attemptCount - 1));

/**
 * Point d'appel réservé à un futur worker serveur authentifié par l'infrastructure.
 * Ne pas l'exposer dans une route publique : le planificateur devra fournir un workerId
 * unique et empêcher les invocations non autorisées. Aucun déclencheur n'est activé ici.
 */
export const processPartnerAthleteIntroductionOutbox = async (
  options: PartnerIntroductionOutboxOptions,
  repository: PartnerAthleteIntroductionRepository =
    createPartnerAthleteIntroductionRepository(),
): Promise<PartnerIntroductionOutboxRunResult> => {
  const workerId = options.workerId.trim();
  if (!workerId) throw new Error("workerId est requis.");
  const batchSize = boundedInteger(options.batchSize, 20, 1, 100, "batchSize");
  const maxAttempts = boundedInteger(options.maxAttempts, 5, 1, 20, "maxAttempts");
  const staleLockMilliseconds = boundedInteger(
    options.staleLockMilliseconds,
    5 * 60 * 1000,
    30 * 1000,
    60 * 60 * 1000,
    "staleLockMilliseconds",
  );
  const now = options.now ? new Date(options.now.getTime()) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("now est invalide.");

  const claimed = await repository.claimOutbox({
    workerId,
    batchSize,
    maxAttempts,
    staleLockBefore: new Date(now.getTime() - staleLockMilliseconds).toISOString(),
    now: now.toISOString(),
  });
  const result: PartnerIntroductionOutboxRunResult = {
    claimed: claimed.length,
    delivered: 0,
    discarded: 0,
    retried: 0,
    failed: 0,
  };

  for (const item of claimed) {
    try {
      const delivery = await repository.deliverOutbox({
        outboxId: item.id,
        workerId,
        notificationId: randomUUID(),
        now: now.toISOString(),
      });
      if (delivery.outcome === "delivered") result.delivered += 1;
      if (delivery.outcome === "discarded") result.discarded += 1;
      if (delivery.outcome === "not_found") result.failed += 1;
    } catch {
      const retryAt = new Date(
        now.getTime() + retryDelayMilliseconds(item.attemptCount),
      ).toISOString();
      const failure = await repository.failOutbox({
        outboxId: item.id,
        workerId,
        maxAttempts,
        retryAt,
        errorCode: "notification_delivery_failed",
        now: now.toISOString(),
      });
      if (failure === "pending") result.retried += 1;
      else result.failed += 1;
    }
  }

  return result;
};
