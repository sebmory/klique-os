"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildSportsWatchTournamentGroups,
  type SportsWatchDisciplineGroup,
} from "@/lib/sports-watch/presentation";
import {
  buildSportsWatchRefreshTasks,
  runSportsWatchRefreshPlan,
  type SportsWatchRefreshExecution,
  type SportsWatchRefreshTask,
} from "@/lib/sports-watch/refresh";
import { isSportCompatibleWithWatchSource } from "@/lib/sports-watch/sport";
import { TodayCollapsibleCard } from "@/components/app-shell/TodayCollapsibleCard";
import { SportsWatchImportPanel } from "@/components/app-shell/SportsWatchImportPanel";
import type {
  BeBasketBinding,
  BeBasketBindingVerification,
  IwwfBinding,
  IwwfIdentityVerification,
  SafvBinding,
  SafvTeamVerification,
  SportsWatchCandidate,
  SportsWatchCollectionSourceKey,
  SportsWatchRunResult,
  SwissBasketballBinding,
  SwissBasketballBindingVerification,
  SwissBadmintonBinding,
  SwissBadmintonIdentityVerification,
} from "@/types/sports-watch";

type AthleteSummary = {
  key: string;
  athleteId?: string;
  name: string;
  sport: string;
  club: string;
  status: string;
};

type SportsWatchDashboardPayload = {
  candidates?: SportsWatchCandidate[];
  swissBindings?: SwissBadmintonBinding[];
  iwwfBindings?: IwwfBinding[];
  safvBindings?: SafvBinding[];
  beBasketBindings?: BeBasketBinding[];
  swissBasketballBindings?: SwissBasketballBinding[];
  message?: string;
};

type SportsWatchRefreshSummary = {
  task: SportsWatchRefreshTask;
  result?: SportsWatchRunResult;
  error?: string;
};

const fetchSportsWatchDashboard = async (): Promise<SportsWatchDashboardPayload> => {
  const response = await fetch("/api/admin/sports-watch", { cache: "no-store" });
  const payload = await response.json() as SportsWatchDashboardPayload;
  if (!response.ok) throw new Error(payload.message || "Impossible de charger la veille sportive.");
  return payload;
};

const formatDate = (value: string | null): string => {
  if (!value) return "inconnue";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "inconnue";
  return new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium", timeZone: "UTC" }).format(date);
};

const adminStatusLabels = {
  pending: "En attente",
  validated: "Validé",
  rejected: "Rejeté",
} as const;

const verificationLabels = {
  unverified: "À vérifier",
  verified: "Vérifié",
  disputed: "Contesté",
} as const;

const disciplineLabels = {
  simple: "Simple",
  double: "Double",
  mixte: "Mixte",
} as const;

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

const disciplineSummary = (group: SportsWatchDisciplineGroup): string => {
  const parts = [
    pluralize(group.collectedCount, "match collecté", "matches collectés"),
    pluralize(group.victories, "victoire"),
    pluralize(group.defeats, "défaite"),
  ];
  if (group.forfeits > 0) parts.push(pluralize(group.forfeits, "forfait"));
  if (group.retirements > 0) parts.push(pluralize(group.retirements, "abandon"));
  if (group.unknown > 0) parts.push(pluralize(group.unknown, "résultat non standard"));
  return parts.join(" · ");
};

const sourceOptions: Array<{
  key: SportsWatchCollectionSourceKey;
  label: string;
  url: string;
}> = [
  {
    key: "bc-bulle",
    label: "Badminton Club Bulle",
    url: "https://bcbulle.ch/feed/",
  },
  {
    key: "swiss-badminton",
    label: "Swiss Badminton / Tournamentsoftware",
    url: "https://sb.tournamentsoftware.com/",
  },
  {
    key: "iwwf-wakesurf",
    label: "IWWF / Wakesurf",
    url: "https://ems.iwwf.sport/",
  },
  {
    key: "kenpokan",
    label: "Kenpokan Dojo",
    url: "https://kenpokan-dojo.ch/feed/",
  },
  {
    key: "safv",
    label: "SAFV / football américain",
    url: "https://www.safv.ch/spiele-366618v4/",
  },
  {
    key: "bebasket",
    label: "BeBasket — source tierce",
    url: "https://www.bebasket.fr/",
  },
  {
    key: "swiss-basketball",
    label: "Swiss Basketball — source officielle",
    url: "https://swiss.basketball/",
  },
];

const refreshSummaryStatus = (summary: SportsWatchRefreshSummary): string => {
  if (summary.error) return "Échec";
  if (!summary.result) return "Échec";
  const partial = summary.result.observations?.some((observation) =>
    observation.status === "binding_error") ?? false;
  const outcome = summary.result.createdCount > 0
    ? pluralize(summary.result.createdCount, "nouveau résultat", "nouveaux résultats")
    : summary.result.recentCount === 0
      ? "Aucun résultat récent"
      : "Inchangé";
  return partial ? `Couverture partielle · ${outcome}` : outcome;
};

export function SportsWatchAdminCard({ athletes }: { athletes: AthleteSummary[] }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<SportsWatchCandidate[]>([]);
  const [view, setView] = useState<"current" | "history">("current");
  const [swissBindings, setSwissBindings] = useState<SwissBadmintonBinding[]>([]);
  const [iwwfBindings, setIwwfBindings] = useState<IwwfBinding[]>([]);
  const [safvBindings, setSafvBindings] = useState<SafvBinding[]>([]);
  const [beBasketBindings, setBeBasketBindings] = useState<BeBasketBinding[]>([]);
  const [swissBasketballBindings, setSwissBasketballBindings] =
    useState<SwissBasketballBinding[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState("");
  const [selectedSourceKey, setSelectedSourceKey] = useState<SportsWatchCollectionSourceKey>("bc-bulle");
  const [swissProfileUrl, setSwissProfileUrl] = useState("");
  const [swissPlayerId, setSwissPlayerId] = useState("");
  const [swissVerification, setSwissVerification] =
    useState<SwissBadmintonIdentityVerification | null>(null);
  const [swissConfigBusy, setSwissConfigBusy] = useState(false);
  const [iwwfProfileUrl, setIwwfProfileUrl] = useState("");
  const [iwwfVerification, setIwwfVerification] =
    useState<IwwfIdentityVerification | null>(null);
  const [iwwfConfigBusy, setIwwfConfigBusy] = useState(false);
  const [safvScheduleUrl, setSafvScheduleUrl] = useState("");
  const [safvTeamName, setSafvTeamName] = useState("");
  const [safvVerification, setSafvVerification] =
    useState<SafvTeamVerification | null>(null);
  const [safvConfigBusy, setSafvConfigBusy] = useState(false);
  const [beBasketCalendarUrl, setBeBasketCalendarUrl] = useState("");
  const [beBasketTeamName, setBeBasketTeamName] = useState("");
  const [beBasketPlayerName, setBeBasketPlayerName] = useState("");
  const [beBasketVerification, setBeBasketVerification] =
    useState<BeBasketBindingVerification | null>(null);
  const [beBasketConfigBusy, setBeBasketConfigBusy] = useState(false);
  const [swissBasketballFederationId, setSwissBasketballFederationId] = useState("12");
  const [swissBasketballSeasonId, setSwissBasketballSeasonId] = useState("");
  const [swissBasketballLeagueId, setSwissBasketballLeagueId] = useState("");
  const [swissBasketballTeamId, setSwissBasketballTeamId] = useState("");
  const [swissBasketballOfficialPlayerId, setSwissBasketballOfficialPlayerId] = useState("");
  const [swissBasketballOfficialPlayerName, setSwissBasketballOfficialPlayerName] = useState("");
  const [swissBasketballIdentityMatchConfirmed, setSwissBasketballIdentityMatchConfirmed] =
    useState(false);
  const [swissBasketballVerification, setSwissBasketballVerification] =
    useState<SwissBasketballBindingVerification | null>(null);
  const [swissBasketballConfigBusy, setSwissBasketballConfigBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const refreshAllLockRef = useRef(false);
  const [refreshAllBusy, setRefreshAllBusy] = useState(false);
  const [refreshAllReady, setRefreshAllReady] = useState(false);
  const [refreshAllProgress, setRefreshAllProgress] = useState({ completed: 0, total: 0 });
  const [refreshAllSummaries, setRefreshAllSummaries] =
    useState<SportsWatchRefreshSummary[]>([]);
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const athleteOptions = useMemo(
    () => athletes
      .filter((athlete) => isSportCompatibleWithWatchSource(athlete.sport, selectedSourceKey))
      .map((athlete) => ({
        id: athlete.athleteId?.trim() || athlete.key.trim(),
        label: `${athlete.name}${athlete.sport ? ` — ${athlete.sport}` : ""}${athlete.club ? ` · ${athlete.club}` : ""}`,
      }))
      .filter((athlete) => athlete.id && athlete.label.trim())
      .sort((left, right) => left.label.localeCompare(right.label, "fr")),
    [athletes, selectedSourceKey],
  );
  const selectedSource = sourceOptions.find((source) => source.key === selectedSourceKey)
    ?? sourceOptions[0];
  const selectedAthlete = athletes.find((athlete) =>
    (athlete.athleteId?.trim() || athlete.key.trim()) === selectedAthleteId);
  const selectedSwissBinding = swissBindings.find((binding) =>
    binding.athleteId === selectedAthleteId);
  const selectedIwwfBinding = iwwfBindings.find((binding) =>
    binding.athleteId === selectedAthleteId);
  const selectedSafvBinding = safvBindings.find((binding) =>
    binding.athleteId === selectedAthleteId);
  const selectedBeBasketBinding = beBasketBindings.find((binding) =>
    binding.athleteId === selectedAthleteId);
  const selectedSwissBasketballBindings = swissBasketballBindings.filter((binding) =>
    binding.athleteId === selectedAthleteId);
  const configuredSwissBasketballBinding = selectedSwissBasketballBindings.find((binding) =>
    binding.officialIdentity.federationId === swissBasketballFederationId.trim()
    && binding.officialIdentity.seasonId === swissBasketballSeasonId.trim()
    && binding.officialIdentity.leagueId === swissBasketballLeagueId.trim()
    && binding.officialIdentity.teamId === swissBasketballTeamId.trim());
  const selectedSourceUrl = selectedSourceKey === "swiss-badminton"
    ? selectedSwissBinding?.officialIdentity.profileUrl ?? selectedSource.url
    : selectedSourceKey === "iwwf-wakesurf"
      ? selectedIwwfBinding?.officialIdentity.profileUrl ?? selectedSource.url
      : selectedSourceKey === "safv"
        ? selectedSafvBinding?.officialTeam.scheduleUrl ?? selectedSource.url
        : selectedSourceKey === "bebasket"
          ? selectedBeBasketBinding?.officialIdentity.calendarUrl ?? selectedSource.url
          : selectedSourceKey === "swiss-basketball"
            ? selectedSwissBasketballBindings.find((binding) => binding.active)
              ?.officialIdentity.scheduleUrl ?? selectedSource.url
    : selectedSource.url;
  const currentCandidates = candidates.filter((candidate) => candidate.adminStatus !== "rejected");
  const historicalCandidates = candidates.filter((candidate) => candidate.adminStatus === "rejected");
  const visibleCandidates = view === "current" ? currentCandidates : historicalCandidates;
  const tournamentGroups = useMemo(
    () => buildSportsWatchTournamentGroups(visibleCandidates),
    [visibleCandidates],
  );
  const refreshAllTasks = useMemo(
    () => buildSportsWatchRefreshTasks({
      athletes,
      swissBindings,
      iwwfBindings,
      safvBindings,
      beBasketBindings,
      swissBasketballBindings,
    }),
    [
      athletes,
      beBasketBindings,
      iwwfBindings,
      safvBindings,
      swissBasketballBindings,
      swissBindings,
    ],
  );

  useEffect(() => {
    let active = true;
    void fetchSportsWatchDashboard()
      .then((payload) => {
        if (active) {
          setCandidates(payload.candidates ?? []);
          setSwissBindings(payload.swissBindings ?? []);
          setIwwfBindings(payload.iwwfBindings ?? []);
          setSafvBindings(payload.safvBindings ?? []);
          setBeBasketBindings(payload.beBasketBindings ?? []);
          setSwissBasketballBindings(payload.swissBasketballBindings ?? []);
          setRefreshAllReady(true);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSwissProfileUrl(selectedSwissBinding?.officialIdentity.profileUrl ?? "");
    setSwissPlayerId(selectedSwissBinding?.officialIdentity.playerId ?? "");
    setSwissVerification(null);
  }, [selectedAthleteId, selectedSwissBinding]);

  useEffect(() => {
    setIwwfProfileUrl(selectedIwwfBinding?.officialIdentity.profileUrl ?? "");
    setIwwfVerification(null);
  }, [selectedAthleteId, selectedIwwfBinding]);

  useEffect(() => {
    setSafvScheduleUrl(selectedSafvBinding?.officialTeam.scheduleUrl ?? "");
    setSafvTeamName(selectedSafvBinding?.officialTeam.teamName ?? "");
    setSafvVerification(null);
  }, [selectedAthleteId, selectedSafvBinding]);

  useEffect(() => {
    setBeBasketCalendarUrl(selectedBeBasketBinding?.officialIdentity.calendarUrl ?? "");
    setBeBasketTeamName(selectedBeBasketBinding?.officialIdentity.teamName ?? "");
    setBeBasketPlayerName(
      selectedBeBasketBinding?.officialIdentity.playerName
        ?? selectedAthlete?.name
        ?? "",
    );
    setBeBasketVerification(null);
  }, [selectedAthlete?.name, selectedAthleteId, selectedBeBasketBinding]);

  const updateSwissBinding = (binding: SwissBadmintonBinding) => {
    setSwissBindings((current) => {
      const remaining = current.filter((item) => item.athleteId !== binding.athleteId);
      return [binding, ...remaining];
    });
  };

  const updateIwwfBinding = (binding: IwwfBinding) => {
    setIwwfBindings((current) => {
      const remaining = current.filter((item) => item.athleteId !== binding.athleteId);
      return [binding, ...remaining];
    });
  };

  const updateSafvBinding = (binding: SafvBinding) => {
    setSafvBindings((current) => {
      const remaining = current.filter((item) => item.athleteId !== binding.athleteId);
      return [binding, ...remaining];
    });
  };

  const updateBeBasketBinding = (binding: BeBasketBinding) => {
    setBeBasketBindings((current) => {
      const remaining = current.filter((item) => item.athleteId !== binding.athleteId);
      return [binding, ...remaining];
    });
  };

  const updateSwissBasketballBinding = (binding: SwissBasketballBinding) => {
    setSwissBasketballBindings((current) => [
      binding,
      ...current.filter((item) => item.id !== binding.id),
    ]);
  };

  const selectAthlete = (athleteId: string) => {
    setSelectedAthleteId(athleteId);
    setSwissBasketballFederationId("12");
    setSwissBasketballSeasonId("");
    setSwissBasketballLeagueId("");
    setSwissBasketballTeamId("");
    setSwissBasketballOfficialPlayerId("");
    setSwissBasketballOfficialPlayerName("");
    setSwissBasketballIdentityMatchConfirmed(false);
    setSwissBasketballVerification(null);
  };

  const verifySwissProfile = async () => {
    if (!selectedAthleteId || swissConfigBusy) return;
    setSwissConfigBusy(true);
    setSwissVerification(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/sports-watch/swiss-bindings/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: selectedAthleteId,
          profileUrl: swissProfileUrl,
          playerId: swissPlayerId,
        }),
      });
      const payload = await response.json() as {
        verification?: SwissBadmintonIdentityVerification;
        message?: string;
      };
      if (!response.ok || !payload.verification) {
        throw new Error(payload.message || "Impossible de vérifier le profil officiel.");
      }
      setSwissVerification(payload.verification);
      setSwissPlayerId(payload.verification.officialIdentity.playerId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vérification impossible.");
    } finally {
      setSwissConfigBusy(false);
    }
  };

  const confirmSwissBinding = async () => {
    if (!selectedAthleteId || !swissVerification || swissConfigBusy) return;
    setSwissConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/swiss-bindings/${encodeURIComponent(selectedAthleteId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileUrl: swissProfileUrl,
            playerId: swissPlayerId,
            expectedVersion: selectedSwissBinding?.version ?? 0,
          }),
        },
      );
      const payload = await response.json() as { binding?: SwissBadmintonBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de confirmer le rattachement.");
      }
      updateSwissBinding(payload.binding);
      setSwissVerification(null);
      setMessage("Profil Swiss Badminton vérifié et confirmé.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation impossible.");
    } finally {
      setSwissConfigBusy(false);
    }
  };

  const disableSwissBinding = async () => {
    if (!selectedSwissBinding?.active || swissConfigBusy) return;
    setSwissConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/swiss-bindings/${encodeURIComponent(selectedSwissBinding.athleteId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: selectedSwissBinding.version }),
        },
      );
      const payload = await response.json() as { binding?: SwissBadmintonBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de désactiver le rattachement.");
      }
      updateSwissBinding(payload.binding);
      setMessage("Rattachement désactivé. Les résultats historiques sont conservés.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setSwissConfigBusy(false);
    }
  };

  const verifyIwwfProfile = async () => {
    if (!selectedAthleteId || iwwfConfigBusy) return;
    setIwwfConfigBusy(true);
    setIwwfVerification(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/sports-watch/iwwf-bindings/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: selectedAthleteId,
          profileUrl: iwwfProfileUrl,
        }),
      });
      const payload = await response.json() as {
        verification?: IwwfIdentityVerification;
        message?: string;
      };
      if (!response.ok || !payload.verification) {
        throw new Error(payload.message || "Impossible de vérifier le profil IWWF.");
      }
      setIwwfVerification(payload.verification);
      setIwwfProfileUrl(payload.verification.officialIdentity.profileUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vérification impossible.");
    } finally {
      setIwwfConfigBusy(false);
    }
  };

  const confirmIwwfBinding = async () => {
    if (!selectedAthleteId || !iwwfVerification || iwwfConfigBusy) return;
    setIwwfConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/iwwf-bindings/${encodeURIComponent(selectedAthleteId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileUrl: iwwfProfileUrl,
            expectedVersion: selectedIwwfBinding?.version ?? 0,
          }),
        },
      );
      const payload = await response.json() as { binding?: IwwfBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de confirmer le rattachement IWWF.");
      }
      updateIwwfBinding(payload.binding);
      setIwwfVerification(null);
      setMessage("Profil IWWF vérifié et confirmé.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation impossible.");
    } finally {
      setIwwfConfigBusy(false);
    }
  };

  const disableIwwfBinding = async () => {
    if (!selectedIwwfBinding?.active || iwwfConfigBusy) return;
    setIwwfConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/iwwf-bindings/${encodeURIComponent(selectedIwwfBinding.athleteId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: selectedIwwfBinding.version }),
        },
      );
      const payload = await response.json() as { binding?: IwwfBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de désactiver le rattachement IWWF.");
      }
      updateIwwfBinding(payload.binding);
      setMessage("Rattachement IWWF désactivé. Les résultats historiques sont conservés.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setIwwfConfigBusy(false);
    }
  };

  const verifySafvTeam = async () => {
    if (!selectedAthleteId || safvConfigBusy) return;
    setSafvConfigBusy(true);
    setSafvVerification(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/sports-watch/safv-bindings/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: selectedAthleteId,
          scheduleUrl: safvScheduleUrl,
          teamName: safvTeamName,
        }),
      });
      const payload = await response.json() as {
        verification?: SafvTeamVerification;
        message?: string;
      };
      if (!response.ok || !payload.verification) {
        throw new Error(payload.message || "Impossible de vérifier l’équipe SAFV.");
      }
      setSafvVerification(payload.verification);
      setSafvScheduleUrl(payload.verification.officialTeam.scheduleUrl);
      setSafvTeamName(payload.verification.officialTeam.teamName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vérification impossible.");
    } finally {
      setSafvConfigBusy(false);
    }
  };

  const confirmSafvBinding = async () => {
    if (!selectedAthleteId || !safvVerification || safvConfigBusy) return;
    setSafvConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/safv-bindings/${encodeURIComponent(selectedAthleteId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduleUrl: safvScheduleUrl,
            teamName: safvTeamName,
            expectedVersion: selectedSafvBinding?.version ?? 0,
          }),
        },
      );
      const payload = await response.json() as { binding?: SafvBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de confirmer le rattachement SAFV.");
      }
      updateSafvBinding(payload.binding);
      setSafvVerification(null);
      setMessage("Équipe SAFV vérifiée et confirmée.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation impossible.");
    } finally {
      setSafvConfigBusy(false);
    }
  };

  const disableSafvBinding = async () => {
    if (!selectedSafvBinding?.active || safvConfigBusy) return;
    setSafvConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/safv-bindings/${encodeURIComponent(selectedSafvBinding.athleteId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: selectedSafvBinding.version }),
        },
      );
      const payload = await response.json() as { binding?: SafvBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de désactiver le rattachement SAFV.");
      }
      updateSafvBinding(payload.binding);
      setMessage("Rattachement SAFV désactivé. Les résultats historiques sont conservés.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setSafvConfigBusy(false);
    }
  };

  const verifyBeBasketIdentity = async () => {
    if (!selectedAthleteId || beBasketConfigBusy) return;
    setBeBasketConfigBusy(true);
    setBeBasketVerification(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/sports-watch/bebasket-bindings/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: selectedAthleteId,
          calendarUrl: beBasketCalendarUrl,
          teamName: beBasketTeamName,
          playerName: beBasketPlayerName,
        }),
      });
      const payload = await response.json() as {
        verification?: BeBasketBindingVerification;
        message?: string;
      };
      if (!response.ok || !payload.verification) {
        throw new Error(payload.message || "Impossible de vérifier le rattachement BeBasket.");
      }
      setBeBasketVerification(payload.verification);
      setBeBasketCalendarUrl(payload.verification.officialIdentity.calendarUrl);
      setBeBasketTeamName(payload.verification.officialIdentity.teamName);
      setBeBasketPlayerName(payload.verification.officialIdentity.playerName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vérification impossible.");
    } finally {
      setBeBasketConfigBusy(false);
    }
  };

  const confirmBeBasketBinding = async () => {
    if (!selectedAthleteId || !beBasketVerification || beBasketConfigBusy) return;
    setBeBasketConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/bebasket-bindings/${encodeURIComponent(selectedAthleteId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            calendarUrl: beBasketCalendarUrl,
            teamName: beBasketTeamName,
            playerName: beBasketPlayerName,
            expectedVersion: selectedBeBasketBinding?.version ?? 0,
          }),
        },
      );
      const payload = await response.json() as { binding?: BeBasketBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de confirmer le rattachement BeBasket.");
      }
      updateBeBasketBinding(payload.binding);
      setBeBasketVerification(null);
      setMessage("Rattachement BeBasket confirmé comme source tierce.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation impossible.");
    } finally {
      setBeBasketConfigBusy(false);
    }
  };

  const disableBeBasketBinding = async () => {
    if (!selectedBeBasketBinding?.active || beBasketConfigBusy) return;
    setBeBasketConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/bebasket-bindings/${encodeURIComponent(selectedBeBasketBinding.athleteId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: selectedBeBasketBinding.version }),
        },
      );
      const payload = await response.json() as { binding?: BeBasketBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de désactiver le rattachement BeBasket.");
      }
      updateBeBasketBinding(payload.binding);
      setMessage("Rattachement BeBasket désactivé. Les résultats historiques sont conservés.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setBeBasketConfigBusy(false);
    }
  };

  const verifySwissBasketballIdentity = async () => {
    if (
      !selectedAthleteId
      || !swissBasketballOfficialPlayerId.trim()
      || !swissBasketballOfficialPlayerName.trim()
      || swissBasketballConfigBusy
    ) return;
    setSwissBasketballConfigBusy(true);
    setSwissBasketballVerification(null);
    setError(null);
    try {
      const response = await fetch(
        "/api/admin/sports-watch/swiss-basketball-bindings/verify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            athleteId: selectedAthleteId,
            federationId: swissBasketballFederationId,
            seasonId: swissBasketballSeasonId,
            leagueId: swissBasketballLeagueId,
            teamId: swissBasketballTeamId,
            officialPlayerId: swissBasketballOfficialPlayerId,
            officialPlayerName: swissBasketballOfficialPlayerName,
          }),
        },
      );
      const payload = await response.json() as {
        verification?: SwissBasketballBindingVerification;
        message?: string;
      };
      if (!response.ok || !payload.verification) {
        throw new Error(payload.message || "Impossible de vérifier le rattachement Swiss Basketball.");
      }
      setSwissBasketballVerification(payload.verification);
      setSwissBasketballFederationId(payload.verification.officialIdentity.federationId);
      setSwissBasketballSeasonId(payload.verification.officialIdentity.seasonId);
      setSwissBasketballLeagueId(payload.verification.officialIdentity.leagueId);
      setSwissBasketballTeamId(payload.verification.officialIdentity.teamId);
      setSwissBasketballOfficialPlayerId(payload.verification.officialIdentity.playerId);
      setSwissBasketballOfficialPlayerName(payload.verification.officialIdentity.playerName);
      setSwissBasketballIdentityMatchConfirmed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vérification impossible.");
    } finally {
      setSwissBasketballConfigBusy(false);
    }
  };

  const confirmSwissBasketballBinding = async () => {
    if (
      !selectedAthleteId
      || !swissBasketballVerification
      || !swissBasketballIdentityMatchConfirmed
      || swissBasketballConfigBusy
    ) return;
    setSwissBasketballConfigBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/sports-watch/swiss-basketball-bindings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: selectedAthleteId,
          federationId: swissBasketballFederationId,
          seasonId: swissBasketballSeasonId,
          leagueId: swissBasketballLeagueId,
          teamId: swissBasketballTeamId,
          officialPlayerId: swissBasketballOfficialPlayerId,
          officialPlayerName: swissBasketballOfficialPlayerName,
          identityMatchConfirmed: swissBasketballIdentityMatchConfirmed,
          expectedVersion: configuredSwissBasketballBinding?.version ?? 0,
        }),
      });
      const payload = await response.json() as {
        binding?: SwissBasketballBinding;
        message?: string;
      };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de confirmer le rattachement Swiss Basketball.");
      }
      updateSwissBasketballBinding(payload.binding);
      setSwissBasketballVerification(null);
      setSwissBasketballIdentityMatchConfirmed(false);
      setMessage("Rattachement Swiss Basketball officiel confirmé.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation impossible.");
    } finally {
      setSwissBasketballConfigBusy(false);
    }
  };

  const disableSwissBasketballBinding = async (binding: SwissBasketballBinding) => {
    if (!binding.active || swissBasketballConfigBusy) return;
    setSwissBasketballConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/swiss-basketball-bindings/${encodeURIComponent(binding.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: binding.version }),
        },
      );
      const payload = await response.json() as {
        binding?: SwissBasketballBinding;
        message?: string;
      };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de désactiver le rattachement Swiss Basketball.");
      }
      updateSwissBasketballBinding(payload.binding);
      setMessage("Rattachement Swiss Basketball désactivé. L’historique est conservé.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setSwissBasketballConfigBusy(false);
    }
  };

  const runRefreshAll = async () => {
    if (
      busy
      || refreshAllLockRef.current
      || !refreshAllReady
      || refreshAllTasks.length === 0
    ) return;
    refreshAllLockRef.current = true;
    setRefreshAllBusy(true);
    setRefreshAllProgress({ completed: 0, total: refreshAllTasks.length });
    setRefreshAllSummaries([]);
    setMessage(null);
    setError(null);
    try {
      const executions = await runSportsWatchRefreshPlan(
        refreshAllTasks,
        async (task) => {
          const response = await fetch("/api/admin/sports-watch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceKey: task.sourceKey,
              athleteId: task.athleteId,
            }),
          });
          const payload = await response.json() as {
            result?: SportsWatchRunResult;
            message?: string;
          };
          if (!response.ok || !payload.result) {
            throw new Error(payload.message || "Impossible de lancer la veille sportive.");
          }
          return payload.result;
        },
        {
          maxConcurrentSources: 3,
          onSettled: (
            execution: SportsWatchRefreshExecution<SportsWatchRunResult>,
            completed,
            total,
          ) => {
            setRefreshAllProgress({ completed, total });
            setRefreshAllSummaries((current) => [
              ...current,
              {
                task: execution.task,
                result: execution.value,
                error: execution.error?.message,
              },
            ]);
          },
        },
      );
      const payload = await fetchSportsWatchDashboard();
      setCandidates(payload.candidates ?? []);
      setSwissBindings(payload.swissBindings ?? []);
      setIwwfBindings(payload.iwwfBindings ?? []);
      setSafvBindings(payload.safvBindings ?? []);
      setBeBasketBindings(payload.beBasketBindings ?? []);
      setSwissBasketballBindings(payload.swissBasketballBindings ?? []);
      const failures = executions.filter((execution) => execution.error).length;
      const createdCount = executions.reduce(
        (total, execution) => total + (execution.value?.createdCount ?? 0),
        0,
      );
      setMessage([
        failures > 0
          ? `Actualisation partielle : ${executions.length} veille${executions.length === 1 ? "" : "s"} traitée${executions.length === 1 ? "" : "s"}.`
          : `Actualisation terminée : ${executions.length} veille${executions.length === 1 ? "" : "s"}.`,
        `${createdCount} nouveau${createdCount === 1 ? "" : "x"} résultat${createdCount === 1 ? "" : "s"}.`,
        failures > 0
          ? `${failures} échec${failures === 1 ? "" : "s"} local${failures === 1 ? "" : "aux"}.`
          : "Aucun échec.",
      ].join(" "));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `Les collectes ont été exécutées, mais leur bilan n’a pas pu être rechargé : ${caught.message}`
          : "Le bilan des collectes n’a pas pu être rechargé.",
      );
    } finally {
      refreshAllLockRef.current = false;
      setRefreshAllBusy(false);
    }
  };

  const runWatch = async () => {
    if (busy || refreshAllBusy || !selectedAthleteId) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/sports-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKey: selectedSourceKey, athleteId: selectedAthleteId }),
      });
      const payload = await response.json() as { result?: SportsWatchRunResult; message?: string };
      if (!response.ok || !payload.result) {
        throw new Error(payload.message || "Impossible de lancer la veille sportive.");
      }
      setCandidates(payload.result.candidates);
      setMessage(payload.result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Collecte impossible.");
    } finally {
      setBusy(false);
    }
  };

  const review = async (candidate: SportsWatchCandidate, status: "validated" | "rejected") => {
    if (busyCandidateId) return;
    setBusyCandidateId(candidate.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sports-watch/${encodeURIComponent(candidate.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, version: candidate.version }),
      });
      const payload = await response.json() as { candidate?: SportsWatchCandidate; message?: string };
      if (!response.ok || !payload.candidate) {
        throw new Error(payload.message || "Impossible d’enregistrer la décision.");
      }
      setCandidates((current) =>
        current.map((item) => item.id === payload.candidate!.id ? payload.candidate! : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Décision impossible.");
    } finally {
      setBusyCandidateId(null);
    }
  };

  const prepareArticle = (candidate: SportsWatchCandidate) => {
    const query = new URLSearchParams({
      objective: "article",
      subject: candidate.athleteName,
      subjectId: candidate.athleteId,
      contextType: "athlete",
      sportsWatchCandidateId: candidate.id,
    });
    router.push(`/contents/create?${query.toString()}`);
  };

  const renderCandidateActions = (candidate: SportsWatchCandidate) => (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.65rem" }}>
      <button
        type="button"
        className="card-link-button"
        disabled={
          busyCandidateId === candidate.id
          || candidate.attributionStatus === "ambiguous"
        }
        onClick={() => void review(candidate, "validated")}
      >
        Valider
      </button>
      <button
        type="button"
        className="card-link-button"
        disabled={busyCandidateId === candidate.id}
        onClick={() => void review(candidate, "rejected")}
      >
        Rejeter
      </button>
      {candidate.adminStatus === "validated" ? (
        <button
          type="button"
          className="card-link-button"
          onClick={() => prepareArticle(candidate)}
        >
          Préparer un article
        </button>
      ) : null}
      {candidate.attributionStatus === "ambiguous" ? (
        <small style={{ color: "#92400e", alignSelf: "center" }}>
          Validation bloquée : attribution à confirmer.
        </small>
      ) : null}
    </div>
  );

  const renderSourceDetails = (candidate: SportsWatchCandidate) => (
    <details style={{ marginTop: "0.55rem", minWidth: 0 }}>
      <summary style={{ cursor: "pointer", color: "#6b7280", fontSize: "0.78rem", fontWeight: 700 }}>
        Détails et source
      </summary>
      <div style={{ marginTop: "0.45rem", minWidth: 0, overflowWrap: "anywhere" }}>
        <p style={{ margin: "0 0 0.45rem", whiteSpace: "pre-wrap", fontSize: "0.82rem" }}>
          {candidate.excerpt}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.76rem" }}>
          <a href={candidate.articleUrl} target="_blank" rel="noreferrer">
            {candidate.sourceName === "BeBasket — source tierce" ? "Feuille BeBasket" : "Résultat officiel"}
          </a>
          <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">{candidate.sourceName}</a>
          <span>Attribution : {candidate.attributionStatus === "matched" ? "concordante" : "à vérifier"}</span>
          <span>Vérification : {verificationLabels[candidate.verificationStatus]}</span>
          <span>Collecte : {formatDate(candidate.collectedAt)}</span>
        </div>
      </div>
    </details>
  );

  return (
    <TodayCollapsibleCard
      storageKey="sports-watch"
      title="Veille sportive"
      description="Résultats collectés à valider ou à exploiter éditorialement."
      attentionCount={currentCandidates.length + (error ? 1 : 0)}
      className="today-sports-watch-card"
    >
      <section
        aria-label="Actualisation de toutes les veilles"
        style={{
          display: "grid",
          gap: "0.65rem",
          marginBottom: "0.85rem",
          padding: "0.75rem",
          border: "1px solid #dbeafe",
          borderRadius: "10px",
          background: "#eff6ff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.65rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong>Actualisation globale</strong>
            <p style={{ margin: "0.2rem 0 0", color: "#475569", fontSize: "0.76rem" }}>
              {refreshAllReady
                ? `${refreshAllTasks.length} veille${refreshAllTasks.length === 1 ? "" : "s"} configurée${refreshAllTasks.length === 1 ? "" : "s"}.`
                : "Chargement des rattachements actifs…"}
            </p>
          </div>
          <button
            type="button"
            className="card-link-button"
            disabled={
              busy
              || refreshAllBusy
              || !refreshAllReady
              || refreshAllTasks.length === 0
            }
            style={{ minHeight: "2.5rem", padding: "0.55rem 0.8rem" }}
            onClick={() => void runRefreshAll()}
          >
            {refreshAllBusy ? "Actualisation…" : "Actualiser toutes les veilles"}
          </button>
        </div>
        {refreshAllProgress.total > 0 ? (
          <div aria-live="polite" style={{ display: "grid", gap: "0.3rem" }}>
            <span style={{ fontSize: "0.76rem", color: "#334155" }}>
              {refreshAllProgress.completed}/{refreshAllProgress.total} veille
              {refreshAllProgress.total === 1 ? "" : "s"} traitée
              {refreshAllProgress.total === 1 ? "" : "s"}
            </span>
            <progress
              aria-label="Progression de l’actualisation des veilles"
              value={refreshAllProgress.completed}
              max={refreshAllProgress.total}
              style={{ width: "100%" }}
            />
          </div>
        ) : null}
        {refreshAllSummaries.length > 0 ? (
          <div
            aria-label="Bilan des veilles actualisées"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 15rem), 1fr))",
              gap: "0.5rem",
            }}
          >
            {refreshAllSummaries.map((summary) => {
              const source = sourceOptions.find((option) => option.key === summary.task.sourceKey);
              return (
                <article
                  key={`${summary.task.sourceKey}:${summary.task.athleteId}`}
                  style={{
                    minWidth: 0,
                    padding: "0.55rem 0.65rem",
                    border: "1px solid #bfdbfe",
                    borderRadius: "8px",
                    background: "#fff",
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong style={{ display: "block", fontSize: "0.78rem" }}>
                    {summary.task.athleteName}
                  </strong>
                  <span style={{ display: "block", color: "#475569", fontSize: "0.72rem" }}>
                    {source?.label ?? summary.task.sourceKey}
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: "0.25rem",
                      color: summary.error ? "#b91c1c" : "#1e3a8a",
                      fontSize: "0.74rem",
                      fontWeight: 700,
                    }}
                  >
                    {refreshSummaryStatus(summary)}
                  </span>
                  <span style={{ display: "block", marginTop: "0.2rem", color: "#64748b", fontSize: "0.7rem" }}>
                    {summary.error ?? summary.result?.message}
                  </span>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
      <details className="today-secondary-action">
        <summary>Configurer une source ou importer un résultat</summary>
        <p style={{ margin: "0.5rem 0", color: "#6b7280", fontSize: "0.82rem" }}>
          Source sélectionnée :{" "}
          <a href={selectedSourceUrl} target="_blank" rel="noreferrer">{selectedSource.label}</a>
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
        <select
          aria-label="Source de veille"
          value={selectedSourceKey}
          disabled={busy || refreshAllBusy}
          onChange={(event) => {
            const sourceKey = event.target.value as SportsWatchCollectionSourceKey;
            setSelectedSourceKey(sourceKey);
            if (
              selectedAthlete
              && !isSportCompatibleWithWatchSource(selectedAthlete.sport, sourceKey)
            ) {
              selectAthlete("");
            }
          }}
          style={{ minWidth: "16rem", flex: "1 1 16rem" }}
        >
          {sourceOptions.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
        </select>
        <select
          aria-label="Athlète CRM à surveiller"
          value={selectedAthleteId}
          disabled={busy || refreshAllBusy}
          onChange={(event) => selectAthlete(event.target.value)}
          style={{ minWidth: "16rem", flex: "1 1 16rem" }}
        >
          <option value="">Sélectionner un athlète CRM</option>
          {athleteOptions.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.label}</option>)}
        </select>
        <button
          type="button"
          className="card-link-button"
          disabled={
            busy
            || refreshAllBusy
            || !selectedAthleteId
            || (selectedSourceKey === "swiss-badminton" && !selectedSwissBinding?.active)
            || (selectedSourceKey === "iwwf-wakesurf" && !selectedIwwfBinding?.active)
            || (selectedSourceKey === "safv" && !selectedSafvBinding?.active)
            || (selectedSourceKey === "bebasket" && !selectedBeBasketBinding?.active)
          }
          onClick={() => void runWatch()}
        >
          {busy ? "Collecte…" : "Lancer la veille"}
        </button>
        </div>
      {athleteOptions.length === 0 ? (
        <p role="status" style={{ margin: "0.5rem 0 0", color: "#92400e", fontSize: "0.8rem" }}>
          Aucun athlète ne correspond au sport de cette source de veille.
        </p>
      ) : null}

      {selectedSourceKey === "swiss-badminton" ? (
        <details
          style={{
            marginTop: "0.7rem",
            minWidth: 0,
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "0.65rem 0.75rem",
            background: "#fafafa",
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: "0.84rem", fontWeight: 750 }}>
            Profil officiel · {selectedSwissBinding?.active
              ? "rattachement actif"
              : selectedSwissBinding
                ? "rattachement désactivé"
                : "à configurer"}
          </summary>
          <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.76rem" }}>
            Le serveur relit le profil avant chaque confirmation. Le nom seul ne suffit pas ;
            l’URL, l’UUID et l’identifiant joueur sont aussi contrôlés.
          </p>
          {!selectedAthleteId ? (
            <p style={{ margin: 0, fontSize: "0.8rem" }}>
              Sélectionnez d’abord un athlète CRM.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem", minWidth: 0 }}>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                URL officielle Tournamentsoftware
                <input
                  type="url"
                  value={swissProfileUrl}
                  disabled={swissConfigBusy}
                  placeholder="https://sb.tournamentsoftware.com/player-profile/…"
                  onChange={(event) => {
                    setSwissProfileUrl(event.target.value);
                    setSwissVerification(null);
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                Identifiant joueur officiel — facultatif si détecté automatiquement
                <input
                  type="text"
                  inputMode="numeric"
                  value={swissPlayerId}
                  disabled={swissConfigBusy}
                  onChange={(event) => {
                    setSwissPlayerId(event.target.value);
                    setSwissVerification(null);
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="card-link-button"
                  disabled={swissConfigBusy || !swissProfileUrl.trim()}
                  onClick={() => void verifySwissProfile()}
                >
                  {swissConfigBusy ? "Vérification…" : "Vérifier le profil"}
                </button>
                {selectedSwissBinding?.active ? (
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={swissConfigBusy}
                    onClick={() => void disableSwissBinding()}
                  >
                    Désactiver
                  </button>
                ) : null}
              </div>
              {swissVerification ? (
                <div
                  style={{
                    borderLeft: "3px solid #2563eb",
                    paddingLeft: "0.65rem",
                    fontSize: "0.78rem",
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong>Comparaison avant confirmation</strong>
                  <p style={{ margin: "0.35rem 0" }}>
                    Fiche CRM : {selectedAthlete?.name} · {selectedAthlete?.sport || "sport inconnu"}
                    {" · "}{selectedAthlete?.club || "club inconnu"}
                  </p>
                  <p style={{ margin: "0.35rem 0" }}>
                    Profil officiel : {swissVerification.officialIdentity.name}
                    {" · ID "}{swissVerification.officialIdentity.playerId}
                    {" · "}{swissVerification.officialIdentity.club || "club non indiqué"}
                  </p>
                  {swissVerification.clubComparison === "different" ? (
                    <p style={{ margin: "0.35rem 0", color: "#92400e" }}>
                      Le club officiel diffère de la fiche CRM. Cette différence est signalée sans conclure
                      automatiquement à une mauvaise identité.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={swissConfigBusy}
                    onClick={() => void confirmSwissBinding()}
                  >
                    Confirmer explicitement le rattachement
                  </button>
                </div>
              ) : selectedSwissBinding ? (
                <small>
                  {selectedSwissBinding.officialIdentity.name}
                  {" · ID "}{selectedSwissBinding.officialIdentity.playerId}
                  {" · vérifié le "}{formatDate(selectedSwissBinding.verifiedAt)}
                  {!selectedSwissBinding.active
                    ? " · Une nouvelle vérification est obligatoire pour réactiver."
                    : ""}
                </small>
              ) : (
                <small>
                  Aucun rattachement actif : configurez et confirmez le profil avant toute collecte Swiss.
                </small>
              )}
            </div>
          )}
        </details>
      ) : null}

      {selectedSourceKey === "iwwf-wakesurf" ? (
        <details
          style={{
            marginTop: "0.7rem",
            minWidth: 0,
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "0.65rem 0.75rem",
            background: "#fafafa",
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: "0.84rem", fontWeight: 750 }}>
            Profil officiel IWWF · {selectedIwwfBinding?.active
              ? "rattachement actif"
              : selectedIwwfBinding
                ? "rattachement désactivé"
                : "à configurer"}
          </summary>
          <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.76rem" }}>
            Le serveur relit le profil avant chaque confirmation et contrôle le nom ainsi que
            l’identifiant athlète IWWF stable. Les résultats sont ensuite découverts depuis ce profil.
          </p>
          {!selectedAthleteId ? (
            <p style={{ margin: 0, fontSize: "0.8rem" }}>
              Sélectionnez d’abord un athlète CRM.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem", minWidth: 0 }}>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                URL officielle du profil IWWF
                <input
                  type="url"
                  value={iwwfProfileUrl}
                  disabled={iwwfConfigBusy}
                  placeholder="https://ems.iwwf.sport/Athletes/Profile/…"
                  onChange={(event) => {
                    setIwwfProfileUrl(event.target.value);
                    setIwwfVerification(null);
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="card-link-button"
                  disabled={iwwfConfigBusy || !iwwfProfileUrl.trim()}
                  onClick={() => void verifyIwwfProfile()}
                >
                  {iwwfConfigBusy ? "Vérification…" : "Vérifier le profil"}
                </button>
                {selectedIwwfBinding?.active ? (
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={iwwfConfigBusy}
                    onClick={() => void disableIwwfBinding()}
                  >
                    Désactiver
                  </button>
                ) : null}
              </div>
              {iwwfVerification ? (
                <div
                  style={{
                    borderLeft: "3px solid #2563eb",
                    paddingLeft: "0.65rem",
                    fontSize: "0.78rem",
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong>Comparaison avant confirmation</strong>
                  <p style={{ margin: "0.35rem 0" }}>
                    Fiche CRM : {selectedAthlete?.name} · {selectedAthlete?.sport || "sport inconnu"}
                    {" · "}{selectedAthlete?.club || "club inconnu"}
                  </p>
                  <p style={{ margin: "0.35rem 0" }}>
                    Profil officiel : {iwwfVerification.officialIdentity.name}
                    {" · ID "}{iwwfVerification.officialIdentity.athleteId}
                    {iwwfVerification.officialIdentity.birthYear
                      ? ` · naissance ${iwwfVerification.officialIdentity.birthYear}`
                      : ""}
                  </p>
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={iwwfConfigBusy}
                    onClick={() => void confirmIwwfBinding()}
                  >
                    Confirmer explicitement le rattachement
                  </button>
                </div>
              ) : selectedIwwfBinding ? (
                <small>
                  {selectedIwwfBinding.officialIdentity.name}
                  {" · ID "}{selectedIwwfBinding.officialIdentity.athleteId}
                  {" · vérifié le "}{formatDate(selectedIwwfBinding.verifiedAt)}
                  {!selectedIwwfBinding.active
                    ? " · Une nouvelle vérification est obligatoire pour réactiver."
                    : ""}
                </small>
              ) : (
                <small>
                  Aucun rattachement actif : vérifiez puis confirmez le profil avant toute collecte IWWF.
                </small>
              )}
            </div>
          )}
        </details>
      ) : null}

      {selectedSourceKey === "safv" ? (
        <details
          style={{
            marginTop: "0.7rem",
            minWidth: 0,
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "0.65rem 0.75rem",
            background: "#fafafa",
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: "0.84rem", fontWeight: 750 }}>
            Équipe officielle SAFV · {selectedSafvBinding?.active
              ? "rattachement actif"
              : selectedSafvBinding
                ? "rattachement désactivé"
                : "à configurer"}
          </summary>
          <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.76rem" }}>
            Le serveur relit le calendrier avant chaque confirmation. La veille conserve uniquement
            le résultat collectif officiel et ne vérifie aucune participation individuelle.
          </p>
          {!selectedAthleteId ? (
            <p style={{ margin: 0, fontSize: "0.8rem" }}>
              Sélectionnez d’abord un athlète CRM.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem", minWidth: 0 }}>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                URL officielle du calendrier de ligue SAFV
                <input
                  type="url"
                  value={safvScheduleUrl}
                  disabled={safvConfigBusy}
                  placeholder="https://www.safv.ch/spiele-366618v4/leagues/…"
                  onChange={(event) => {
                    setSafvScheduleUrl(event.target.value);
                    setSafvVerification(null);
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                Nom officiel de l’équipe
                <input
                  type="text"
                  value={safvTeamName}
                  disabled={safvConfigBusy}
                  placeholder="LUCAF Owls"
                  onChange={(event) => {
                    setSafvTeamName(event.target.value);
                    setSafvVerification(null);
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="card-link-button"
                  disabled={safvConfigBusy || !safvScheduleUrl.trim() || !safvTeamName.trim()}
                  onClick={() => void verifySafvTeam()}
                >
                  {safvConfigBusy ? "Vérification…" : "Vérifier l’équipe"}
                </button>
                {selectedSafvBinding?.active ? (
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={safvConfigBusy}
                    onClick={() => void disableSafvBinding()}
                  >
                    Désactiver
                  </button>
                ) : null}
              </div>
              {safvVerification ? (
                <div
                  style={{
                    borderLeft: "3px solid #2563eb",
                    paddingLeft: "0.65rem",
                    fontSize: "0.78rem",
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong>Comparaison avant confirmation</strong>
                  <p style={{ margin: "0.35rem 0" }}>
                    Fiche CRM : {selectedAthlete?.name} · {selectedAthlete?.sport || "sport inconnu"}
                    {" · "}{selectedAthlete?.club || "club inconnu"}
                  </p>
                  <p style={{ margin: "0.35rem 0" }}>
                    Équipe officielle : {safvVerification.officialTeam.teamName}
                    {" · "}{safvVerification.officialTeam.competitionName}
                    {" · saison "}{safvVerification.officialTeam.seasonName}
                  </p>
                  {safvVerification.clubComparison === "different" ? (
                    <p style={{ margin: "0.35rem 0", color: "#92400e" }}>
                      Le club CRM diffère de l’équipe officielle. Cette différence est signalée sans
                      déduire une mauvaise identité.
                    </p>
                  ) : null}
                  <p style={{ margin: "0.35rem 0" }}>
                    Résultat collectif — participation individuelle non vérifiée.
                  </p>
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={safvConfigBusy}
                    onClick={() => void confirmSafvBinding()}
                  >
                    Confirmer explicitement le rattachement
                  </button>
                </div>
              ) : selectedSafvBinding ? (
                <small>
                  {selectedSafvBinding.officialTeam.teamName}
                  {" · "}{selectedSafvBinding.officialTeam.competitionName}
                  {" · saison "}{selectedSafvBinding.officialTeam.seasonName}
                  {" · vérifié le "}{formatDate(selectedSafvBinding.verifiedAt)}
                  {!selectedSafvBinding.active
                    ? " · Une nouvelle vérification est obligatoire pour réactiver."
                    : ""}
                </small>
              ) : (
                <small>
                  Aucun rattachement actif : vérifiez puis confirmez l’équipe avant toute collecte SAFV.
                </small>
              )}
            </div>
          )}
        </details>
      ) : null}

      {selectedSourceKey === "swiss-basketball" ? (
        <details
          style={{
            marginTop: "0.7rem",
            minWidth: 0,
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "0.65rem 0.75rem",
            background: "#fafafa",
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: "0.84rem", fontWeight: 750 }}>
            Équipes Swiss Basketball · {selectedSwissBasketballBindings.filter((binding) =>
              binding.active).length} active(s)
          </summary>
          <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.76rem" }}>
            Source officielle. Chaque rattachement associe l’athlète CRM à une fédération, une saison,
            une ligue, une équipe et un identifiant joueur vérifiés dans une feuille publique.
            Plusieurs équipes peuvent rester actives simultanément.
          </p>
          {!selectedAthleteId ? (
            <p style={{ margin: 0, fontSize: "0.8rem" }}>
              Sélectionnez d’abord un athlète CRM.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.65rem", minWidth: 0 }}>
              {selectedSwissBasketballBindings.length > 0 ? (
                <div style={{ display: "grid", gap: "0.45rem" }}>
                  {selectedSwissBasketballBindings.map((binding) => (
                    <div
                      key={binding.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                        borderLeft: binding.active ? "3px solid #15803d" : "3px solid #9ca3af",
                        paddingLeft: "0.65rem",
                        fontSize: "0.78rem",
                      }}
                    >
                      <span>
                        <strong>{binding.officialIdentity.teamName}</strong>
                        {" · fédération "}{binding.officialIdentity.federationId}
                        {" · "}{binding.officialIdentity.leagueName}
                        {" · "}{binding.officialIdentity.seasonName}
                        {" · "}{binding.officialIdentity.playerName}
                        {" · joueur "}{binding.officialIdentity.playerId}
                        {!binding.active ? " · désactivé" : ""}
                      </span>
                      {binding.active ? (
                        <button
                          type="button"
                          className="card-link-button"
                          disabled={swissBasketballConfigBusy}
                          onClick={() => void disableSwissBasketballBinding(binding)}
                        >
                          Désactiver
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <small>Aucune équipe Swiss Basketball confirmée pour cet athlète.</small>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "0.55rem",
                }}
              >
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                  Identifiant de fédération
                  <input
                    type="text"
                    inputMode="numeric"
                    value={swissBasketballFederationId}
                    disabled={swissBasketballConfigBusy}
                    onChange={(event) => {
                      setSwissBasketballFederationId(event.target.value);
                      setSwissBasketballVerification(null);
                      setSwissBasketballIdentityMatchConfirmed(false);
                    }}
                  />
                </label>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                  Identifiant de saison
                  <input
                    type="text"
                    inputMode="numeric"
                    value={swissBasketballSeasonId}
                    disabled={swissBasketballConfigBusy}
                    onChange={(event) => {
                      setSwissBasketballSeasonId(event.target.value);
                      setSwissBasketballVerification(null);
                      setSwissBasketballIdentityMatchConfirmed(false);
                    }}
                  />
                </label>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                  Identifiant de ligue
                  <input
                    type="text"
                    inputMode="numeric"
                    value={swissBasketballLeagueId}
                    disabled={swissBasketballConfigBusy}
                    onChange={(event) => {
                      setSwissBasketballLeagueId(event.target.value);
                      setSwissBasketballVerification(null);
                      setSwissBasketballIdentityMatchConfirmed(false);
                    }}
                  />
                </label>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                  Identifiant d’équipe
                  <input
                    type="text"
                    inputMode="numeric"
                    value={swissBasketballTeamId}
                    disabled={swissBasketballConfigBusy}
                    onChange={(event) => {
                      setSwissBasketballTeamId(event.target.value);
                      setSwissBasketballVerification(null);
                      setSwissBasketballIdentityMatchConfirmed(false);
                    }}
                  />
                </label>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                  Identifiant joueur officiel
                  <input
                    type="text"
                    inputMode="numeric"
                    value={swissBasketballOfficialPlayerId}
                    disabled={swissBasketballConfigBusy}
                    onChange={(event) => {
                      setSwissBasketballOfficialPlayerId(event.target.value);
                      setSwissBasketballVerification(null);
                      setSwissBasketballIdentityMatchConfirmed(false);
                    }}
                  />
                </label>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                  Nom officiel complet
                  <input
                    type="text"
                    value={swissBasketballOfficialPlayerName}
                    disabled={swissBasketballConfigBusy}
                    onChange={(event) => {
                      setSwissBasketballOfficialPlayerName(event.target.value);
                      setSwissBasketballVerification(null);
                      setSwissBasketballIdentityMatchConfirmed(false);
                    }}
                  />
                </label>
              </div>
              <button
                type="button"
                className="card-link-button"
                disabled={
                  swissBasketballConfigBusy
                  || !swissBasketballFederationId.trim()
                  || !swissBasketballSeasonId.trim()
                  || !swissBasketballLeagueId.trim()
                  || !swissBasketballTeamId.trim()
                  || !swissBasketballOfficialPlayerId.trim()
                  || !swissBasketballOfficialPlayerName.trim()
                }
                onClick={() => void verifySwissBasketballIdentity()}
              >
                {swissBasketballConfigBusy
                  ? "Vérification…"
                  : "Vérifier fédération, saison, ligue, équipe et joueuse"}
              </button>
              {swissBasketballVerification ? (
                <div
                  style={{
                    borderLeft: "3px solid #2563eb",
                    paddingLeft: "0.65rem",
                    fontSize: "0.78rem",
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong>Comparaison avant confirmation</strong>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "0.55rem",
                      margin: "0.45rem 0",
                    }}
                  >
                    <div>
                      <strong>Identité CRM</strong>
                      <p style={{ margin: "0.2rem 0" }}>
                        {swissBasketballVerification.athlete.name}
                        {" · "}{swissBasketballVerification.athlete.sport || "sport inconnu"}
                        {" · "}{swissBasketballVerification.athlete.club || "club inconnu"}
                      </p>
                    </div>
                    <div>
                      <strong>Identité officielle</strong>
                      <p style={{ margin: "0.2rem 0" }}>
                        {swissBasketballVerification.officialIdentity.playerName}
                        {" · joueur "}{swissBasketballVerification.officialIdentity.playerId}
                        {" · fédération "}{swissBasketballVerification.officialIdentity.federationId}
                        {" · "}{swissBasketballVerification.officialIdentity.teamName}
                        {" · "}{swissBasketballVerification.officialIdentity.leagueName}
                        {" · "}{swissBasketballVerification.officialIdentity.seasonName}
                      </p>
                    </div>
                  </div>
                  <p style={{ margin: "0.35rem 0" }}>
                    La présence, la titularisation et chaque statistique resteront des faits séparés.
                  </p>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.45rem",
                      margin: "0.55rem 0",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={swissBasketballIdentityMatchConfirmed}
                      disabled={swissBasketballConfigBusy}
                      onChange={(event) =>
                        setSwissBasketballIdentityMatchConfirmed(event.target.checked)}
                    />
                    Je confirme explicitement que l’identité CRM et l’identité officielle
                    désignent la même personne.
                  </label>
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={
                      swissBasketballConfigBusy
                      || !swissBasketballIdentityMatchConfirmed
                    }
                    onClick={() => void confirmSwissBasketballBinding()}
                  >
                    Confirmer et ajouter ce rattachement
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </details>
      ) : null}

      {selectedSourceKey === "bebasket" ? (
        <details
          style={{
            marginTop: "0.7rem",
            minWidth: 0,
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "0.65rem 0.75rem",
            background: "#fafafa",
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: "0.84rem", fontWeight: 750 }}>
            Équipe et joueuse BeBasket · {selectedBeBasketBinding?.active
              ? "rattachement actif"
              : selectedBeBasketBinding
                ? "rattachement désactivé"
                : "à configurer"}
          </summary>
          <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.76rem" }}>
            Source : BeBasket — source tierce. La collecte manuelle relit les matches des 30 derniers
            jours et conserve le lien de chaque feuille. La validation éditoriale ne transforme pas
            ces données en faits officiellement corroborés.
          </p>
          {!selectedAthleteId ? (
            <p style={{ margin: 0, fontSize: "0.8rem" }}>
              Sélectionnez d’abord un athlète CRM.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem", minWidth: 0 }}>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                URL du calendrier public de l’équipe BeBasket
                <input
                  type="url"
                  value={beBasketCalendarUrl}
                  disabled={beBasketConfigBusy}
                  placeholder="https://www.bebasket.fr/equipe/…/calendrier"
                  onChange={(event) => {
                    setBeBasketCalendarUrl(event.target.value);
                    setBeBasketVerification(null);
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                Nom de l’équipe sur BeBasket
                <input
                  type="text"
                  value={beBasketTeamName}
                  disabled={beBasketConfigBusy}
                  placeholder="BCF Elfic Fribourg"
                  onChange={(event) => {
                    setBeBasketTeamName(event.target.value);
                    setBeBasketVerification(null);
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                Nom complet de la joueuse sur la feuille
                <input
                  type="text"
                  value={beBasketPlayerName}
                  disabled={beBasketConfigBusy}
                  onChange={(event) => {
                    setBeBasketPlayerName(event.target.value);
                    setBeBasketVerification(null);
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="card-link-button"
                  disabled={
                    beBasketConfigBusy
                    || !beBasketCalendarUrl.trim()
                    || !beBasketTeamName.trim()
                    || !beBasketPlayerName.trim()
                  }
                  onClick={() => void verifyBeBasketIdentity()}
                >
                  {beBasketConfigBusy ? "Vérification…" : "Vérifier le rattachement"}
                </button>
                {selectedBeBasketBinding?.active ? (
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={beBasketConfigBusy}
                    onClick={() => void disableBeBasketBinding()}
                  >
                    Désactiver
                  </button>
                ) : null}
              </div>
              {beBasketVerification ? (
                <div
                  style={{
                    borderLeft: "3px solid #2563eb",
                    paddingLeft: "0.65rem",
                    fontSize: "0.78rem",
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong>Comparaison avant confirmation</strong>
                  <p style={{ margin: "0.35rem 0" }}>
                    Fiche CRM : {selectedAthlete?.name} · {selectedAthlete?.sport || "sport inconnu"}
                    {" · "}{selectedAthlete?.club || "club inconnu"}
                  </p>
                  <p style={{ margin: "0.35rem 0" }}>
                    BeBasket : {beBasketVerification.officialIdentity.teamName}
                    {" · joueuse "}{beBasketVerification.officialIdentity.playerName}
                  </p>
                  <p style={{ margin: "0.35rem 0", color: "#92400e" }}>
                    Source tierce : la présence sur une feuille et ses statistiques resteront non vérifiées.
                  </p>
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={beBasketConfigBusy}
                    onClick={() => void confirmBeBasketBinding()}
                  >
                    Confirmer explicitement le rattachement
                  </button>
                </div>
              ) : selectedBeBasketBinding ? (
                <small>
                  {selectedBeBasketBinding.officialIdentity.teamName}
                  {" · "}{selectedBeBasketBinding.officialIdentity.playerName}
                  {" · vérifié le "}{formatDate(selectedBeBasketBinding.verifiedAt)}
                  {!selectedBeBasketBinding.active
                    ? " · Une nouvelle vérification est obligatoire pour réactiver."
                    : ""}
                </small>
              ) : (
                <small>
                  Aucun rattachement actif : vérifiez puis confirmez l’équipe et la joueuse avant toute collecte.
                </small>
              )}
            </div>
          )}
        </details>
      ) : null}

      <SportsWatchImportPanel
        athletes={athletes}
        onCandidateCreated={(candidate) => {
          setCandidates((current) => [
            candidate,
            ...current.filter((item) => item.id !== candidate.id),
          ]);
        }}
      />
      </details>

      <div className="today-view-switch" aria-label="Vue de la veille sportive">
        <button type="button" aria-pressed={view === "current"} onClick={() => setView("current")}>
          À exploiter ({currentCandidates.length})
        </button>
        <button type="button" aria-pressed={view === "history"} onClick={() => setView("history")}>
          Historique ({historicalCandidates.length})
        </button>
      </div>

      {message ? (
        <p
          role="status"
          style={{
            color: message.startsWith("Actualisation partielle") ? "#92400e" : "#166534",
            fontSize: "0.84rem",
          }}
        >
          {message}
        </p>
      ) : null}
      {error ? <p role="alert" style={{ color: "#b91c1c", fontSize: "0.84rem" }}>{error}</p> : null}

      <p style={{ margin: "0.65rem 0", color: "#6b7280", fontSize: "0.78rem" }}>
        Valider autorise l’usage éditorial. Cela ne marque pas automatiquement l’information comme vérifiée factuellement.
      </p>

      {tournamentGroups.length > 0 ? (
        <ul className="priority-list" style={{ marginTop: "0.75rem" }}>
          {tournamentGroups.map((group) => (
            <li
              key={group.key}
              className="priority-item"
              style={{ alignItems: "flex-start", gridTemplateColumns: "minmax(0, 1fr)" }}
            >
              <div className="priority-main" style={{ width: "100%", minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{group.athleteName}</strong>
                    <h3 style={{ margin: "0.15rem 0 0", fontSize: "1rem", overflowWrap: "anywhere" }}>
                      {group.competitionName}
                    </h3>
                  </div>
                  <span className="priority-badge">
                    {group.matchCount > 0
                      ? pluralize(group.matchCount, "match", "matches")
                      : pluralize(group.unstructuredCount, "résultat")}
                  </span>
                </div>
                <small>
                  {formatDate(group.eventDateFrom)}
                  {group.eventDateTo && group.eventDateTo !== group.eventDateFrom
                    ? ` au ${formatDate(group.eventDateTo)}`
                    : ""}
                  {" · "}<a href={group.sourceUrl} target="_blank" rel="noreferrer">{group.sourceName}</a>
                </small>
                <div style={{ display: "grid", gap: "0.55rem", marginTop: "0.75rem" }}>
                  {group.disciplines.map((discipline) => (
                    <details
                      key={discipline.discipline}
                      style={{
                        minWidth: 0,
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        padding: "0.65rem 0.75rem",
                        background: "#fafafa",
                      }}
                    >
                      <summary
                        style={{
                          cursor: "pointer",
                          overflowWrap: "anywhere",
                          fontSize: "0.84rem",
                          fontWeight: 750,
                        }}
                      >
                        {disciplineLabels[discipline.discipline]} · {disciplineSummary(discipline)}
                      </summary>
                      <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.72rem" }}>
                        Résumé des matches collectés ; il ne couvre pas nécessairement tout le tournoi.
                      </p>
                      <div style={{ display: "grid", gap: "0.65rem" }}>
                        {discipline.matches.map((match) => (
                          <article
                            key={match.candidate.id}
                            style={{
                              minWidth: 0,
                              borderTop: "1px solid #e5e7eb",
                              paddingTop: "0.65rem",
                              overflowWrap: "anywhere",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                              <strong style={{ fontSize: "0.84rem" }}>
                                {formatDate(match.candidate.eventDateFrom)} · {match.round}
                              </strong>
                              <span className="priority-badge">{match.outcomeLabel}</span>
                            </div>
                            {match.partner ? (
                              <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}>
                                <strong>Partenaire :</strong> {match.partner}
                              </p>
                            ) : null}
                            <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
                              <strong>Adversaire{match.opponents.includes(" et ") ? "s" : ""} :</strong> {match.opponents}
                            </p>
                            <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
                              <strong>Score :</strong> {match.athleteScore}
                            </p>
                            {!match.countedInSummary ? (
                              <p style={{ margin: "0.35rem 0 0", color: "#92400e", fontSize: "0.74rem" }}>
                                Version antérieure — non comptée dans le résumé.
                              </p>
                            ) : null}
                            <div style={{ marginTop: "0.35rem", fontSize: "0.74rem" }}>
                              Statut Admin : {adminStatusLabels[match.candidate.adminStatus]}
                            </div>
                            {renderSourceDetails(match.candidate)}
                            {renderCandidateActions(match.candidate)}
                          </article>
                        ))}
                      </div>
                    </details>
                  ))}
                  {group.unstructuredCandidates.length > 0 ? (
                    <details
                      style={{
                        minWidth: 0,
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        padding: "0.65rem 0.75rem",
                      }}
                    >
                      <summary style={{ cursor: "pointer", fontSize: "0.84rem", fontWeight: 750 }}>
                        Extraits non structurés · {pluralize(group.unstructuredCount, "candidat")}
                      </summary>
                      <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.72rem" }}>
                        Ces extraits sont affichés tels quels et ne sont pas inclus dans le résumé des matches.
                      </p>
                      {group.unstructuredCandidates.map(({ candidate, countedInSummary }) => (
                        <article
                          key={candidate.id}
                          style={{ borderTop: "1px solid #e5e7eb", paddingTop: "0.65rem", overflowWrap: "anywhere" }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                            <strong>{candidate.title}</strong>
                            <span className="priority-badge">{adminStatusLabels[candidate.adminStatus]}</span>
                          </div>
                          <small>Événement : {formatDate(candidate.eventDateFrom)}</small>
                          <p style={{ margin: "0.45rem 0", whiteSpace: "pre-wrap", fontSize: "0.82rem" }}>
                            {candidate.excerpt}
                          </p>
                          {!countedInSummary ? (
                            <p style={{ color: "#92400e", fontSize: "0.74rem" }}>
                              Version antérieure — non comptée.
                            </p>
                          ) : null}
                          {renderSourceDetails(candidate)}
                          {renderCandidateActions(candidate)}
                        </article>
                      ))}
                    </details>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>{view === "current"
          ? "Aucun résultat à valider ou exploiter."
          : "Aucun résultat rejeté dans l’historique."}</p>
      )}
    </TodayCollapsibleCard>
  );
}
