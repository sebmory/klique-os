import { buildMembershipState } from "@/lib/membership";

export type KliquePassViewModel = {
  statusLabel: string;
  adhesionLabel: string;
  validityLabel: string | null;
  isActive: boolean;
  memberId: string;
};

export type BuildKliquePassViewModelInput = {
  athlete: {
    key?: string;
    name?: string;
    sport?: string;
    adhesionDate?: string;
  };
  athleteIndex: number | null;
  now?: Date;
};

const normalize = (value: unknown): string => String(value ?? "").trim();
const formatValue = (value: unknown): string => normalize(value) || "Non renseigné";

export const buildKliquePassViewModel = ({
  athlete,
  athleteIndex,
  now = new Date(),
}: BuildKliquePassViewModelInput): KliquePassViewModel => {
  const state = buildMembershipState({
    startDate: athlete?.adhesionDate,
    isInitialFreeYearEligible: athleteIndex !== null && athleteIndex < 16,
  });

  const currentDate = new Date(now);
  const actualStartDate = state.startDateLabel ?? "Non renseignée";
  const currentYear = currentDate.getFullYear();
  const actualEndDate = state.endDateLabel ?? null;

  return {
    statusLabel: state.statusLabel,
    adhesionLabel: actualStartDate,
    validityLabel: actualEndDate,
    isActive: state.isActive,
    memberId: formatValue(athlete?.key),
  };
};
