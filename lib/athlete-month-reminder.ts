import {
  getDistinctionByPeriod,
  listDistinctionNominationsByPeriod,
} from "@/lib/athlete-distinctions/service";

export const ATHLETE_OF_THE_MONTH_TYPE = "athlete_of_the_month";
export const ATHLETE_MONTH_TIME_ZONE = "Europe/Zurich";

export type AthleteMonthReminderStatus =
  | "prepare"
  | "draft"
  | "published"
  | "announce"
  | "overdue";

export type AthleteMonthVoteState = {
  nominationCount: number;
  winnerAnnounced: boolean;
};

export type AthleteMonthReminder = {
  status: AthleteMonthReminderStatus;
  rewardMonth: number;
  rewardYear: number;
  label: string;
  timingLabel: string;
  priority: "urgente" | "haute" | "normale";
  actionCount: number;
};

type AwardPeriod = {
  month: number;
  year: number;
};

type AthleteMonthReminderDependencies = {
  listNominations: typeof listDistinctionNominationsByPeriod;
  getWinner: typeof getDistinctionByPeriod;
};

const defaultDependencies: AthleteMonthReminderDependencies = {
  listNominations: listDistinctionNominationsByPeriod,
  getWinner: getDistinctionByPeriod,
};

const monthFormatter = new Intl.DateTimeFormat("fr-CH", {
  month: "long",
  timeZone: "UTC",
});

const zurichFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ATHLETE_MONTH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const getZurichDate = (now: Date): { day: number; month: number; year: number } => {
  const parts = Object.fromEntries(
    zurichFormatter.formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    day: parts.day,
    month: parts.month,
    year: parts.year,
  };
};

const shiftPeriod = ({ month, year }: AwardPeriod, offset: number): AwardPeriod => {
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return {
    month: shifted.getUTCMonth() + 1,
    year: shifted.getUTCFullYear(),
  };
};

const formatMonth = ({ month, year }: AwardPeriod): string =>
  monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));

const formatRewardMonth = (period: AwardPeriod): string => {
  const month = formatMonth(period);
  return /^[aeiouyàâäéèêëîïôöùûü]/i.test(month) ? `d’${month}` : `de ${month}`;
};

const announcementReminder = (
  rewardPeriod: AwardPeriod,
  announcementPeriod: AwardPeriod,
  overdue: boolean,
): AthleteMonthReminder => ({
  status: overdue ? "overdue" : "announce",
  rewardMonth: rewardPeriod.month,
  rewardYear: rewardPeriod.year,
  label: `Annoncer l’Athlète du mois ${formatRewardMonth(rewardPeriod)}`,
  timingLabel: `À annoncer avant le 5 ${formatMonth(announcementPeriod)}`,
  priority: overdue ? "urgente" : "haute",
  actionCount: 1,
});

export const resolveAthleteMonthReminder = ({
  now,
  current,
  previous,
}: {
  now: Date;
  current: AthleteMonthVoteState;
  previous: AthleteMonthVoteState;
}): AthleteMonthReminder | null => {
  const zurichDate = getZurichDate(now);
  const currentPeriod = { month: zurichDate.month, year: zurichDate.year };
  const previousPeriod = shiftPeriod(currentPeriod, -1);

  if (!previous.winnerAnnounced) {
    return announcementReminder(previousPeriod, currentPeriod, zurichDate.day >= 6);
  }

  if (current.winnerAnnounced) {
    return null;
  }

  if (current.nominationCount >= 3) {
    const announcementPeriod = shiftPeriod(currentPeriod, 1);
    return {
      status: "published",
      rewardMonth: currentPeriod.month,
      rewardYear: currentPeriod.year,
      label: "Vote de l’Athlète du mois en cours",
      timingLabel: `Annonce du vainqueur prévue du 1er au 5 ${formatMonth(announcementPeriod)}`,
      priority: "normale",
      actionCount: 0,
    };
  }

  if (current.nominationCount > 0) {
    return {
      status: "draft",
      rewardMonth: currentPeriod.month,
      rewardYear: currentPeriod.year,
      label: "Finaliser et annoncer le vote",
      timingLabel: "Compléter les 3 nominations avant l’ouverture du vote",
      priority: "haute",
      actionCount: 1,
    };
  }

  if (zurichDate.day < 25) {
    return null;
  }

  return {
    status: "prepare",
    rewardMonth: currentPeriod.month,
    rewardYear: currentPeriod.year,
    label: "Préparer le vote de l’Athlète du mois",
    timingLabel: `Vote du mois ${formatRewardMonth(currentPeriod)}`,
    priority: "haute",
    actionCount: 1,
  };
};

export const loadAthleteMonthReminder = async (
  workspaceId: string,
  now = new Date(),
  dependencies: AthleteMonthReminderDependencies = defaultDependencies,
): Promise<AthleteMonthReminder | null> => {
  const zurichDate = getZurichDate(now);
  const currentPeriod = { month: zurichDate.month, year: zurichDate.year };
  const previousPeriod = shiftPeriod(currentPeriod, -1);
  const [currentNominations, currentWinner, previousNominations, previousWinner] = await Promise.all([
    dependencies.listNominations(
      ATHLETE_OF_THE_MONTH_TYPE,
      currentPeriod.month,
      currentPeriod.year,
      workspaceId,
    ),
    dependencies.getWinner(
      ATHLETE_OF_THE_MONTH_TYPE,
      currentPeriod.month,
      currentPeriod.year,
      workspaceId,
    ),
    dependencies.listNominations(
      ATHLETE_OF_THE_MONTH_TYPE,
      previousPeriod.month,
      previousPeriod.year,
      workspaceId,
    ),
    dependencies.getWinner(
      ATHLETE_OF_THE_MONTH_TYPE,
      previousPeriod.month,
      previousPeriod.year,
      workspaceId,
    ),
  ]);

  return resolveAthleteMonthReminder({
    now,
    current: {
      nominationCount: currentNominations.length,
      winnerAnnounced: Boolean(currentWinner),
    },
    previous: {
      nominationCount: previousNominations.length,
      winnerAnnounced: Boolean(previousWinner),
    },
  });
};
