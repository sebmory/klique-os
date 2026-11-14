"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildSportsWatchAthleteGroups,
  buildSportsWatchCandidateViews,
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
import { SportsWatchManualEntryPanel } from "@/components/app-shell/SportsWatchManualEntryPanel";
import { FootballPublicPilotPanel } from "@/components/app-shell/FootballPublicPilotPanel";
import { SportsWatchResultsPresentation } from "@/components/app-shell/sports-watch/SportsWatchResultsPresentation";
import { SportsWatchCanvaPreparationPanel } from "@/components/app-shell/sports-watch/SportsWatchCanvaPreparationPanel";
import { isBasketballSportsWatchCandidate } from "@/lib/sports-watch/canva-preparation";
import type {
  BeBasketBinding,
  BeBasketBindingVerification,
  IwwfBinding,
  IwwfIdentityVerification,
  SafvBinding,
  SafvTeamVerification,
  SportsWatchAdminStatus,
  SportsWatchArticlePrefill,
  SportsWatchAthleteCandidateTotals,
  SportsWatchCandidate,
  SportsWatchCandidateDashboard,
  SportsWatchCandidateGroup,
  SportsWatchCandidatePage,
  SportsWatchCandidateTotals,
  SportsWatchCollectionSourceKey,
  SportsWatchRefreshBatchSummary,
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
  workspaceId?: string;
  candidates?: SportsWatchCandidate[];
  candidateDashboard?: SportsWatchCandidateDashboard;
  swissBindings?: SwissBadmintonBinding[];
  iwwfBindings?: IwwfBinding[];
  safvBindings?: SafvBinding[];
  beBasketBindings?: BeBasketBinding[];
  swissBasketballBindings?: SwissBasketballBinding[];
  latestRefresh?: SportsWatchRefreshBatchSummary | null;
  message?: string;
};

type SportsWatchPageState = Record<SportsWatchCandidateGroup, {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}>;

const emptyCandidateTotals = (): SportsWatchCandidateTotals => ({
  pending: 0,
  validated: 0,
  exploited: 0,
  rejected: 0,
  dismissed: 0,
  superseded: 0,
  supersededPending: 0,
  supersededValidated: 0,
});

const emptyPageState = (): SportsWatchPageState => ({
  pending: { nextCursor: null, hasMore: false, limit: 20 },
  validated: { nextCursor: null, hasMore: false, limit: 20 },
  history: { nextCursor: null, hasMore: false, limit: 20 },
});

const candidateGroup = (status: SportsWatchAdminStatus): SportsWatchCandidateGroup =>
  status === "pending" ? "pending" : status === "validated" ? "validated" : "history";

const candidateDashboardState = (payload: SportsWatchDashboardPayload): {
  candidates: SportsWatchCandidate[];
  totals: SportsWatchCandidateTotals;
  athleteTotals: SportsWatchAthleteCandidateTotals[];
  pages: SportsWatchPageState;
} => {
  if (payload.candidateDashboard) {
    const { pages, totals, athleteTotals } = payload.candidateDashboard;
    return {
      candidates: [...pages.pending.items, ...pages.validated.items, ...pages.history.items],
      totals,
      athleteTotals,
      pages: {
        pending: {
          nextCursor: pages.pending.nextCursor,
          hasMore: pages.pending.hasMore,
          limit: pages.pending.limit,
        },
        validated: {
          nextCursor: pages.validated.nextCursor,
          hasMore: pages.validated.hasMore,
          limit: pages.validated.limit,
        },
        history: {
          nextCursor: pages.history.nextCursor,
          hasMore: pages.history.hasMore,
          limit: pages.history.limit,
        },
      },
    };
  }
  const candidates = payload.candidates ?? [];
  const totals = emptyCandidateTotals();
  for (const candidate of candidates) totals[candidate.adminStatus] += 1;
  const views = buildSportsWatchCandidateViews(candidates);
  totals.superseded = [...views.supersededIds]
    .filter((id) => {
      const candidate = candidates.find((item) => item.id === id);
      return candidate?.adminStatus === "pending" || candidate?.adminStatus === "validated";
    })
    .length;
  totals.supersededPending = candidates.filter((candidate) =>
    candidate.adminStatus === "pending" && views.supersededIds.has(candidate.id)).length;
  totals.supersededValidated = candidates.filter((candidate) =>
    candidate.adminStatus === "validated" && views.supersededIds.has(candidate.id)).length;
  return {
    candidates,
    totals,
    athleteTotals: [],
    pages: emptyPageState(),
  };
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

const fetchSportsWatchPage = async (
  group: SportsWatchCandidateGroup,
  cursor: string,
  limit: number,
): Promise<SportsWatchCandidatePage> => {
  const query = new URLSearchParams({ group, cursor, limit: String(limit) });
  const response = await fetch(`/api/admin/sports-watch?${query}`, { cache: "no-store" });
  const payload = await response.json() as { page?: SportsWatchCandidatePage; message?: string };
  if (!response.ok || !payload.page) {
    throw new Error(payload.message || "Impossible de charger davantage d’actualités.");
  }
  return payload.page;
};

const formatDate = (value: string | null): string => {
  if (!value) return "inconnue";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "inconnue";
  return new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium", timeZone: "UTC" }).format(date);
};

const verificationLabels = {
  unverified: "À vérifier",
  verified: "Vérifié",
  disputed: "Contesté",
} as const;

const basketballCanvaTemplateUrl =
  process.env.NEXT_PUBLIC_SPORTS_WATCH_BASKETBALL_CANVA_TEMPLATE_URL?.trim() || null;

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

const athleteCardsStorageKey = (workspaceId: string): string =>
  `klique.today.sports-watch.athletes.open.v1:${workspaceId}`;

const readOpenAthleteIds = (workspaceId: string): Set<string> => {
  if (!workspaceId || typeof window === "undefined") return new Set();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(athleteCardsStorageKey(workspaceId)) ?? "[]");
    return new Set(Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : []);
  } catch {
    return new Set();
  }
};

const writeOpenAthleteIds = (workspaceId: string, athleteIds: Set<string>): void => {
  if (!workspaceId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      athleteCardsStorageKey(workspaceId),
      JSON.stringify(Array.from(athleteIds)),
    );
  } catch {
    // La préférence locale ne doit pas bloquer la veille.
  }
};

type SportsWatchNavigationState = {
  view: "current" | "history";
  selectedAthleteId: string;
  selectedSourceKey: SportsWatchCollectionSourceKey;
  scrollY: number;
};

const navigationStorageKey = (workspaceId: string): string =>
  `klique.today.sports-watch.navigation.v1:${workspaceId}`;

const readNavigationState = (workspaceId: string): SportsWatchNavigationState | null => {
  if (!workspaceId || typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(navigationStorageKey(workspaceId)) ?? "null",
    ) as Partial<SportsWatchNavigationState> | null;
    if (!parsed || (parsed.view !== "current" && parsed.view !== "history")) return null;
    const selectedSourceKey = sourceOptions.some((source) => source.key === parsed.selectedSourceKey)
      ? parsed.selectedSourceKey
      : "bc-bulle";
    return {
      view: parsed.view,
      selectedAthleteId: typeof parsed.selectedAthleteId === "string"
        ? parsed.selectedAthleteId
        : "",
      selectedSourceKey: selectedSourceKey as SportsWatchCollectionSourceKey,
      scrollY: typeof parsed.scrollY === "number" && parsed.scrollY >= 0 ? parsed.scrollY : 0,
    };
  } catch {
    return null;
  }
};

const writeNavigationState = (
  workspaceId: string,
  state: Omit<SportsWatchNavigationState, "scrollY">,
): void => {
  if (!workspaceId || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(navigationStorageKey(workspaceId), JSON.stringify({
      ...state,
      scrollY: window.scrollY,
    }));
  } catch {
    // La navigation reste utilisable lorsque le stockage de session est indisponible.
  }
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

type SportsWatchWarningGroup = {
  reason: string;
  url: string;
  count: number;
  details: string[];
};

const warningReason = (warning: string | undefined): string => {
  const value = warning?.trim() || "Rencontre inexploitable.";
  return value
    .split(/\s+Rencontre\s*:/i, 1)[0]
    .replace(/\s+URL\s*:.*$/i, "")
    .trim();
};

const groupedWarnings = (summary: SportsWatchRefreshSummary): SportsWatchWarningGroup[] => {
  const groups = new Map<string, SportsWatchWarningGroup>();
  for (const observation of summary.result?.observations ?? []) {
    if (observation.status !== "binding_error") continue;
    const reason = warningReason(observation.warning);
    const url = observation.matchUrl;
    const key = `${reason}|${url}`;
    const detail = [
      observation.title.trim(),
      observation.eventDate ? formatDate(observation.eventDate) : "",
    ].filter(Boolean).join(" · ");
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (detail && !existing.details.includes(detail)) existing.details.push(detail);
    } else {
      groups.set(key, {
        reason,
        url,
        count: 1,
        details: detail ? [detail] : [],
      });
    }
  }
  return [...groups.values()];
};

const scheduledStatusLabel = {
  running: "En cours",
  completed: "Complète",
  partial: "Partielle",
  failed: "Échec",
} as const;

export function SportsWatchAdminCard({ athletes }: { athletes: AthleteSummary[] }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<SportsWatchCandidate[]>([]);
  const [footballCompletionCandidate, setFootballCompletionCandidate] =
    useState<SportsWatchCandidate | null>(null);
  const [candidateTotals, setCandidateTotals] =
    useState<SportsWatchCandidateTotals>(emptyCandidateTotals);
  const [athleteCandidateTotals, setAthleteCandidateTotals] =
    useState<SportsWatchAthleteCandidateTotals[]>([]);
  const [candidatePages, setCandidatePages] = useState<SportsWatchPageState>(emptyPageState);
  const [loadingCandidateGroup, setLoadingCandidateGroup] =
    useState<SportsWatchCandidateGroup | null>(null);
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
  const [refreshAllDetailsOpen, setRefreshAllDetailsOpen] = useState(false);
  const [latestRefresh, setLatestRefresh] = useState<SportsWatchRefreshBatchSummary | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [navigationReady, setNavigationReady] = useState(false);
  const [openAthleteIds, setOpenAthleteIds] = useState<Set<string>>(new Set());
  const busyCandidateIdRef = useRef<string | null>(null);
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [articleTransferBusy, setArticleTransferBusy] = useState(false);
  const [potentialDuplicates, setPotentialDuplicates] =
    useState<SportsWatchArticlePrefill["potentialDuplicates"]>([]);
  const [dismissUndoCandidate, setDismissUndoCandidate] =
    useState<SportsWatchCandidate | null>(null);
  const [canvaCandidate, setCanvaCandidate] = useState<SportsWatchCandidate | null>(null);
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
  const candidateViews = useMemo(() => buildSportsWatchCandidateViews(candidates), [candidates]);
  const currentCandidates = candidateViews.current;
  const historicalCandidates = candidateViews.history;
  const visibleCandidates = view === "current" ? currentCandidates : historicalCandidates;
  const athleteGroups = useMemo(
    () => buildSportsWatchAthleteGroups(
      visibleCandidates,
      candidates,
      athleteCandidateTotals.length > 0 ? athleteCandidateTotals : undefined,
    ),
    [athleteCandidateTotals, candidates, visibleCandidates],
  );
  const crmAthleteNames = useMemo(() => new Map(
    athletes.map((athlete) => [
      athlete.athleteId?.trim() || athlete.key.trim(),
      athlete.name,
    ]),
  ), [athletes]);
  const refreshAllFailureCount = refreshAllSummaries.filter((summary) => summary.error).length;
  const refreshAllExcludedCount = refreshAllSummaries.reduce(
    (total, summary) => total + (summary.result?.observations?.filter((observation) =>
      observation.status === "binding_error").length ?? 0),
    0,
  );
  const refreshAllPartial = refreshAllFailureCount > 0 || refreshAllExcludedCount > 0;
  const refreshAllCreatedCount = refreshAllSummaries.reduce(
    (total, summary) => total + (summary.result?.createdCount ?? 0),
    0,
  );
  const refreshAllComplete = !refreshAllBusy
    && refreshAllProgress.total > 0
    && refreshAllProgress.completed === refreshAllProgress.total;
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
          const resolvedWorkspaceId = payload.workspaceId ?? "";
          const dashboard = candidateDashboardState(payload);
          const navigation = readNavigationState(resolvedWorkspaceId);
          setWorkspaceId(resolvedWorkspaceId);
          setOpenAthleteIds(readOpenAthleteIds(resolvedWorkspaceId));
          if (navigation) {
            const navigationSwissBinding = payload.swissBindings?.find((binding) =>
              binding.athleteId === navigation.selectedAthleteId);
            const navigationIwwfBinding = payload.iwwfBindings?.find((binding) =>
              binding.athleteId === navigation.selectedAthleteId);
            const navigationSafvBinding = payload.safvBindings?.find((binding) =>
              binding.athleteId === navigation.selectedAthleteId);
            const navigationBeBasketBinding = payload.beBasketBindings?.find((binding) =>
              binding.athleteId === navigation.selectedAthleteId);
            setView(navigation.view);
            setSelectedAthleteId(navigation.selectedAthleteId);
            setSelectedSourceKey(navigation.selectedSourceKey);
            setSwissProfileUrl(navigationSwissBinding?.officialIdentity.profileUrl ?? "");
            setSwissPlayerId(navigationSwissBinding?.officialIdentity.playerId ?? "");
            setIwwfProfileUrl(navigationIwwfBinding?.officialIdentity.profileUrl ?? "");
            setSafvScheduleUrl(navigationSafvBinding?.officialTeam.scheduleUrl ?? "");
            setSafvTeamName(navigationSafvBinding?.officialTeam.teamName ?? "");
            setBeBasketCalendarUrl(navigationBeBasketBinding?.officialIdentity.calendarUrl ?? "");
            setBeBasketTeamName(navigationBeBasketBinding?.officialIdentity.teamName ?? "");
            setBeBasketPlayerName(
              navigationBeBasketBinding?.officialIdentity.playerName ?? "",
            );
            if (navigation.scrollY > 0) {
              window.requestAnimationFrame(() => window.scrollTo({ top: navigation.scrollY }));
            }
          }
          setNavigationReady(true);
          setCandidates(dashboard.candidates);
          setCandidateTotals(dashboard.totals);
          setAthleteCandidateTotals(dashboard.athleteTotals);
          setCandidatePages(dashboard.pages);
          setSelectedCandidateIds(new Set());
          setSwissBindings(payload.swissBindings ?? []);
          setIwwfBindings(payload.iwwfBindings ?? []);
          setSafvBindings(payload.safvBindings ?? []);
          setBeBasketBindings(payload.beBasketBindings ?? []);
          setSwissBasketballBindings(payload.swissBasketballBindings ?? []);
          setLatestRefresh(payload.latestRefresh ?? null);
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
    if (!navigationReady || !workspaceId) return;
    writeNavigationState(workspaceId, { view, selectedAthleteId, selectedSourceKey });
  }, [navigationReady, selectedAthleteId, selectedSourceKey, view, workspaceId]);

  const updateSwissBinding = (binding: SwissBadmintonBinding) => {
    setSwissBindings((current) => {
      const remaining = current.filter((item) => item.athleteId !== binding.athleteId);
      return [binding, ...remaining];
    });
    if (binding.athleteId === selectedAthleteId) {
      setSwissProfileUrl(binding.officialIdentity.profileUrl);
      setSwissPlayerId(binding.officialIdentity.playerId);
      setSwissVerification(null);
    }
  };

  const updateIwwfBinding = (binding: IwwfBinding) => {
    setIwwfBindings((current) => {
      const remaining = current.filter((item) => item.athleteId !== binding.athleteId);
      return [binding, ...remaining];
    });
    if (binding.athleteId === selectedAthleteId) {
      setIwwfProfileUrl(binding.officialIdentity.profileUrl);
      setIwwfVerification(null);
    }
  };

  const updateSafvBinding = (binding: SafvBinding) => {
    setSafvBindings((current) => {
      const remaining = current.filter((item) => item.athleteId !== binding.athleteId);
      return [binding, ...remaining];
    });
    if (binding.athleteId === selectedAthleteId) {
      setSafvScheduleUrl(binding.officialTeam.scheduleUrl);
      setSafvTeamName(binding.officialTeam.teamName);
      setSafvVerification(null);
    }
  };

  const updateBeBasketBinding = (binding: BeBasketBinding) => {
    setBeBasketBindings((current) => {
      const remaining = current.filter((item) => item.athleteId !== binding.athleteId);
      return [binding, ...remaining];
    });
    if (binding.athleteId === selectedAthleteId) {
      setBeBasketCalendarUrl(binding.officialIdentity.calendarUrl);
      setBeBasketTeamName(binding.officialIdentity.teamName);
      setBeBasketPlayerName(binding.officialIdentity.playerName);
      setBeBasketVerification(null);
    }
  };

  const updateSwissBasketballBinding = (binding: SwissBasketballBinding) => {
    setSwissBasketballBindings((current) => [
      binding,
      ...current.filter((item) => item.id !== binding.id),
    ]);
  };

  const selectAthlete = (athleteId: string) => {
    const athlete = athletes.find((item) =>
      (item.athleteId?.trim() || item.key.trim()) === athleteId);
    const swissBinding = swissBindings.find((binding) => binding.athleteId === athleteId);
    const iwwfBinding = iwwfBindings.find((binding) => binding.athleteId === athleteId);
    const safvBinding = safvBindings.find((binding) => binding.athleteId === athleteId);
    const beBasketBinding = beBasketBindings.find((binding) => binding.athleteId === athleteId);
    setSelectedAthleteId(athleteId);
    setSwissProfileUrl(swissBinding?.officialIdentity.profileUrl ?? "");
    setSwissPlayerId(swissBinding?.officialIdentity.playerId ?? "");
    setSwissVerification(null);
    setIwwfProfileUrl(iwwfBinding?.officialIdentity.profileUrl ?? "");
    setIwwfVerification(null);
    setSafvScheduleUrl(safvBinding?.officialTeam.scheduleUrl ?? "");
    setSafvTeamName(safvBinding?.officialTeam.teamName ?? "");
    setSafvVerification(null);
    setBeBasketCalendarUrl(beBasketBinding?.officialIdentity.calendarUrl ?? "");
    setBeBasketTeamName(beBasketBinding?.officialIdentity.teamName ?? "");
    setBeBasketPlayerName(beBasketBinding?.officialIdentity.playerName ?? athlete?.name ?? "");
    setBeBasketVerification(null);
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
    setRefreshAllDetailsOpen(false);
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
      const dashboard = candidateDashboardState(payload);
      setCandidates(dashboard.candidates);
      setCandidateTotals(dashboard.totals);
      setAthleteCandidateTotals(dashboard.athleteTotals);
      setCandidatePages(dashboard.pages);
      setSelectedCandidateIds(new Set());
      setSwissBindings(payload.swissBindings ?? []);
      setIwwfBindings(payload.iwwfBindings ?? []);
      setSafvBindings(payload.safvBindings ?? []);
      setBeBasketBindings(payload.beBasketBindings ?? []);
      setSwissBasketballBindings(payload.swissBasketballBindings ?? []);
      setLatestRefresh(payload.latestRefresh ?? null);
      const failures = executions.filter((execution) => execution.error).length;
      const excludedCount = executions.reduce(
        (total, execution) => total + (execution.value?.observations?.filter((observation) =>
          observation.status === "binding_error").length ?? 0),
        0,
      );
      const createdCount = executions.reduce(
        (total, execution) => total + (execution.value?.createdCount ?? 0),
        0,
      );
      setMessage([
        failures > 0 || excludedCount > 0
          ? `Actualisation partielle : ${executions.length} veille${executions.length === 1 ? "" : "s"} traitée${executions.length === 1 ? "" : "s"}.`
          : `Actualisation terminée : ${executions.length} veille${executions.length === 1 ? "" : "s"}.`,
        `${createdCount} nouveau${createdCount === 1 ? "" : "x"} résultat${createdCount === 1 ? "" : "s"}.`,
        `${excludedCount} rencontre${excludedCount === 1 ? "" : "s"} écartée${excludedCount === 1 ? "" : "s"}.`,
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
      const refreshedPayload = await fetchSportsWatchDashboard();
      const dashboard = candidateDashboardState(refreshedPayload);
      setCandidates(dashboard.candidates);
      setCandidateTotals(dashboard.totals);
      setAthleteCandidateTotals(dashboard.athleteTotals);
      setCandidatePages(dashboard.pages);
      setMessage(payload.result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Collecte impossible.");
    } finally {
      setBusy(false);
    }
  };

  const loadMoreCandidates = async (group: SportsWatchCandidateGroup) => {
    const pageState = candidatePages[group];
    if (!pageState.hasMore || !pageState.nextCursor || loadingCandidateGroup) return;
    setLoadingCandidateGroup(group);
    setError(null);
    try {
      const page = await fetchSportsWatchPage(group, pageState.nextCursor, pageState.limit);
      setCandidates((current) => {
        const byId = new Map(current.map((candidate) => [candidate.id, candidate]));
        for (const candidate of page.items) byId.set(candidate.id, candidate);
        return [...byId.values()];
      });
      setCandidatePages((current) => ({
        ...current,
        [group]: {
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          limit: page.limit,
        },
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chargement impossible.");
    } finally {
      setLoadingCandidateGroup(null);
    }
  };

  const moveCandidateLocally = (
    previous: SportsWatchCandidate,
    next: SportsWatchCandidate,
  ) => {
    const previousStatus = previous.adminStatus;
    const nextStatus = next.adminStatus;
    setCandidates((current) =>
      current.map((item) => item.id === next.id ? next : item));
    if (previousStatus === nextStatus) return;
    setCandidateTotals((current) => ({
      ...current,
      [previousStatus]: Math.max(0, current[previousStatus] - 1),
      [nextStatus]: current[nextStatus] + 1,
    }));
    setAthleteCandidateTotals((current) => {
      const nextTotals = [...current];
      const index = nextTotals.findIndex((total) => total.athleteId === next.athleteId);
      const existing = index >= 0
        ? nextTotals[index]
        : {
            athleteId: next.athleteId,
            athleteName: next.athleteName,
            pending: 0,
            validated: 0,
          };
      const updated = { ...existing };
      if (previousStatus === "pending") updated.pending = Math.max(0, updated.pending - 1);
      if (previousStatus === "validated") {
        updated.validated = Math.max(0, updated.validated - 1);
      }
      if (nextStatus === "pending") updated.pending += 1;
      if (nextStatus === "validated") updated.validated += 1;
      if (index >= 0) nextTotals[index] = updated;
      else nextTotals.push(updated);
      return nextTotals;
    });
  };

  const review = async (
    candidate: SportsWatchCandidate,
    status: "validated" | "exploited" | "rejected" | "dismissed",
  ) => {
    if (busyCandidateIdRef.current) return;
    busyCandidateIdRef.current = candidate.id;
    setBusyCandidateId(candidate.id);
    setError(null);
    setDismissUndoCandidate(null);
    const optimisticDismissal = status === "dismissed"
      ? { ...candidate, adminStatus: "dismissed" as const, version: candidate.version + 1 }
      : null;
    if (optimisticDismissal) {
      moveCandidateLocally(candidate, optimisticDismissal);
    }
    if (status !== "validated") {
      setSelectedCandidateIds((current) => {
        const next = new Set(current);
        next.delete(candidate.id);
        return next;
      });
    }
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
      if (optimisticDismissal) {
        setCandidates((current) =>
          current.map((item) => item.id === payload.candidate!.id ? payload.candidate! : item));
      } else {
        moveCandidateLocally(candidate, payload.candidate);
      }
      if (status === "dismissed") {
        setMessage("Actualité classée comme non exploitée.");
        setDismissUndoCandidate(payload.candidate);
      } else if (candidate.adminStatus === "dismissed" && status === "validated") {
        setMessage("Actualité restaurée dans À exploiter.");
      }
    } catch (caught) {
      if (optimisticDismissal) {
        moveCandidateLocally(optimisticDismissal, candidate);
      }
      setError(caught instanceof Error ? caught.message : "Décision impossible.");
    } finally {
      busyCandidateIdRef.current = null;
      setBusyCandidateId(null);
    }
  };

  const resolveFootballCandidate = async (
    candidate: SportsWatchCandidate,
    resolution: "participation_unverifiable" | "not_exploitable" | "incorrect",
  ) => {
    if (busyCandidateIdRef.current) return;
    busyCandidateIdRef.current = candidate.id;
    setBusyCandidateId(candidate.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/football-candidates/${encodeURIComponent(candidate.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "resolve",
            expectedVersion: candidate.version,
            resolution,
          }),
        },
      );
      const payload = await response.json() as {
        candidate?: SportsWatchCandidate;
        message?: string;
      };
      if (!response.ok || !payload.candidate) {
        throw new Error(payload.message || "Impossible d’enregistrer la décision football.");
      }
      moveCandidateLocally(candidate, payload.candidate);
      setMessage(resolution === "participation_unverifiable"
        ? "Participation classée comme non vérifiable."
        : resolution === "incorrect"
          ? "Événement classé comme incorrect."
          : "Événement classé comme non exploitable.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Décision impossible.");
    } finally {
      busyCandidateIdRef.current = null;
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
    writeNavigationState(workspaceId, { view, selectedAthleteId, selectedSourceKey });
    router.push(`/contents/create?${query.toString()}`);
  };

  const prepareInterview = (candidate: SportsWatchCandidate) => {
    const query = new URLSearchParams({
      objective: "interview",
      subject: candidate.athleteName,
      subjectId: candidate.athleteId,
      contextType: "athlete",
      sportsWatchCandidateId: candidate.id,
    });
    writeNavigationState(workspaceId, { view, selectedAthleteId, selectedSourceKey });
    router.push(`/contents/create?${query.toString()}`);
  };

  const toggleArticleSelection = (candidateId: string, selected: boolean) => {
    setSelectedCandidateIds((current) => {
      const next = new Set(current);
      if (selected) next.add(candidateId);
      else next.delete(candidateId);
      return next;
    });
    setPotentialDuplicates([]);
    setError(null);
  };

  const prepareSelectedArticle = async (confirmDistinct = false) => {
    const candidateIds = [...selectedCandidateIds];
    if (candidateIds.length === 0 || articleTransferBusy) return;
    setArticleTransferBusy(true);
    setPotentialDuplicates([]);
    setError(null);
    try {
      const suffix = confirmDistinct ? "?confirmDistinct=true" : "";
      const response = await fetch(`/api/admin/sports-watch/article-prefill${suffix}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds }),
      });
      const payload = await response.json() as {
        prefill?: SportsWatchArticlePrefill;
        message?: string;
      };
      if (response.status === 409 && payload.prefill?.potentialDuplicates.length) {
        setPotentialDuplicates(payload.prefill.potentialDuplicates);
        return;
      }
      if (!response.ok || !payload.prefill) {
        throw new Error(payload.message || "Impossible de préparer la sélection.");
      }
      const selectedCandidates = candidateIds.flatMap((candidateId) => {
        const candidate = candidates.find((item) => item.id === candidateId);
        return candidate ? [candidate] : [];
      });
      const athleteIds = [...new Set(selectedCandidates.map((candidate) => candidate.athleteId))];
      const singleAthlete = athleteIds.length === 1
        ? selectedCandidates.find((candidate) => candidate.athleteId === athleteIds[0]) ?? null
        : null;
      const query = new URLSearchParams({
        objective: "article",
        subject: singleAthlete
          ? singleAthlete.athleteName
          : `Bilan de ${athleteIds.length} athlètes`,
        contextType: singleAthlete ? "athlete" : "other",
        sportsWatchCandidateIds: candidateIds.join(","),
      });
      if (singleAthlete) query.set("subjectId", singleAthlete.athleteId);
      if (confirmDistinct) query.set("sportsWatchDistinctConfirmed", "true");
      writeNavigationState(workspaceId, { view, selectedAthleteId, selectedSourceKey });
      router.push(`/contents/create?${query.toString()}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de préparer la sélection.");
    } finally {
      setArticleTransferBusy(false);
    }
  };

  const setAthleteCardOpen = (athleteId: string, open: boolean) => {
    setOpenAthleteIds((current) => {
      const next = new Set(current);
      if (open) next.add(athleteId);
      else next.delete(athleteId);
      writeOpenAthleteIds(workspaceId, next);
      return next;
    });
  };

  const renderCandidateActions = (candidate: SportsWatchCandidate) => {
    const superseded = candidateViews.supersededIds.has(candidate.id);
    const athlete = athletes.find((item) =>
      (item.athleteId?.trim() || item.key.trim()) === candidate.athleteId);
    const basketballCandidate = isBasketballSportsWatchCandidate(candidate, athlete?.sport);
    const collectiveFootballCandidate = Boolean(
      candidate.footballEvidence
      && !candidate.manualEntry
      && candidate.adminStatus === "pending"
      && !superseded,
    );
    return (
      <div className="sports-candidate-actions">
        {candidate.adminStatus === "validated" && !superseded ? (
          <label className="sports-candidate-select">
            <input
              type="checkbox"
              checked={selectedCandidateIds.has(candidate.id)}
              disabled={articleTransferBusy}
              onChange={(event) => toggleArticleSelection(candidate.id, event.target.checked)}
            />
            Sélectionner
          </label>
        ) : null}
        {collectiveFootballCandidate ? (
          <>
            <button
              type="button"
              className="card-link-button sports-action is-primary"
              disabled={busyCandidateId === candidate.id}
              onClick={() => setFootballCompletionCandidate(candidate)}
            >
              Compléter avec Footstats Pro
            </button>
            <button
              type="button"
              className="card-link-button sports-action"
              disabled={busyCandidateId === candidate.id}
              onClick={() =>
                void resolveFootballCandidate(candidate, "participation_unverifiable")}
            >
              Participation non vérifiable
            </button>
            <button
              type="button"
              className="card-link-button sports-action"
              disabled={busyCandidateId === candidate.id}
              onClick={() => void resolveFootballCandidate(candidate, "not_exploitable")}
            >
              Ne pas exploiter
            </button>
            <button
              type="button"
              className="card-link-button sports-action"
              disabled={busyCandidateId === candidate.id}
              onClick={() => void resolveFootballCandidate(candidate, "incorrect")}
            >
              Événement incorrect
            </button>
          </>
        ) : candidate.adminStatus === "pending" && !superseded ? (
          <>
            <button
              type="button"
              className="card-link-button sports-action is-primary"
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
              className="card-link-button sports-action"
              disabled={busyCandidateId === candidate.id}
              onClick={() => void review(candidate, "rejected")}
            >
              Rejeter
            </button>
          </>
        ) : null}
        {candidate.adminStatus === "validated" && !superseded ? (
          <>
            <button
              type="button"
              className="card-link-button sports-action"
              disabled={busyCandidateId === candidate.id}
              onClick={() => void review(candidate, "exploited")}
            >
              Marquer comme exploité
            </button>
            <button
              type="button"
              className="card-link-button sports-action"
              disabled={busyCandidateId === candidate.id}
              onClick={() => void review(candidate, "dismissed")}
            >
              Ne pas exploiter
            </button>
          </>
        ) : null}
        {candidate.adminStatus === "exploited" && !superseded ? (
          <button
            type="button"
            className="card-link-button sports-action"
            disabled={busyCandidateId === candidate.id}
            onClick={() => void review(candidate, "validated")}
          >
            Remettre à exploiter
          </button>
        ) : null}
        {candidate.adminStatus === "dismissed" && !superseded ? (
          <button
            type="button"
            className="card-link-button sports-action"
            disabled={busyCandidateId === candidate.id}
            onClick={() => void review(candidate, "validated")}
          >
            Restaurer dans À exploiter
          </button>
        ) : null}
        {candidate.adminStatus === "validated" && !superseded && basketballCandidate ? (
          <button
            type="button"
            className="card-link-button sports-action"
            disabled={busyCandidateId === candidate.id}
            onClick={() => setCanvaCandidate(candidate)}
          >
            Préparer un visuel Canva
          </button>
        ) : null}
        {candidate.adminStatus === "validated" || candidate.adminStatus === "exploited" ? (
          <>
            <button
              type="button"
              className="card-link-button sports-action"
              disabled={busyCandidateId === candidate.id}
              onClick={() => prepareInterview(candidate)}
            >
              Préparer une interview
            </button>
            <button
              type="button"
              className="card-link-button sports-action is-primary"
              disabled={busyCandidateId === candidate.id}
              onClick={() => prepareArticle(candidate)}
            >
              Préparer un article
            </button>
          </>
        ) : null}
      {candidate.attributionStatus === "ambiguous" ? (
        <small style={{ color: "#92400e", alignSelf: "center" }}>
          Validation bloquée : attribution à confirmer.
        </small>
      ) : null}
      </div>
    );
  };

  const renderSourceDetails = (candidate: SportsWatchCandidate) => (
    <details className="sports-source-details">
      <summary>
        Source et détails
      </summary>
      <div style={{ marginTop: "0.45rem", minWidth: 0, overflowWrap: "anywhere" }}>
        <p style={{ margin: "0 0 0.45rem", whiteSpace: "pre-wrap", fontSize: "0.82rem" }}>
          {candidate.excerpt}
        </p>
        {candidate.manualEntry ? (
          <div
            style={{
              display: "grid",
              gap: "0.25rem",
              marginBottom: "0.5rem",
              padding: "0.55rem",
              borderRadius: "7px",
              background: "#f8fafc",
              fontSize: "0.76rem",
            }}
          >
            <strong>Provenance manuelle</strong>
            <span>Mode : {candidate.manualEntry.mode}</span>
            {candidate.manualEntry.sourceReference ? (
              <span>Référence : {candidate.manualEntry.sourceReference}</span>
            ) : null}
            {candidate.footballEvidence ? (
              <div
                style={{
                  display: "grid",
                  gap: "0.25rem",
                  marginBottom: "0.5rem",
                  padding: "0.55rem",
                  borderRadius: "7px",
                  background: "#fff7ed",
                  fontSize: "0.76rem",
                }}
              >
                <strong>Provenance du résultat collectif</strong>
                <span>Footstats — page publique, source tierce non officielle</span>
                <span>Référence : {candidate.footballEvidence.publicReference}</span>
                <span>
                  Feuille officielle AFF indisponible — participation à compléter manuellement.
                </span>
                {candidate.footballCompletion ? (
                  <>
                    <strong>Provenance des statistiques individuelles</strong>
                    <span>Footstats Pro — saisie manuelle Admin, source tierce non officielle</span>
                    <span>
                      Complément enregistré le {formatDate(candidate.footballCompletion.completedAt)}.
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}
            {candidate.manualEntry.football?.footstatsPlayerId ? (
              <span>Identifiant joueur Footstats : {candidate.manualEntry.football.footstatsPlayerId}</span>
            ) : null}
            {candidate.manualEntry.football?.footstatsTeamId ? (
              <span>Identifiant équipe Footstats : {candidate.manualEntry.football.footstatsTeamId}</span>
            ) : null}
            {candidate.manualEntry.internalNote ? (
              <span><strong>Note interne Admin :</strong> {candidate.manualEntry.internalNote}</span>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.76rem" }}>
          {isHttpUrl(candidate.articleUrl) ? (
            <a href={candidate.articleUrl} target="_blank" rel="noreferrer">
              {candidate.manualEntry
                ? "Ouvrir la référence"
                : candidate.sourceName === "BeBasket — source tierce"
                  ? "Feuille BeBasket"
                  : candidate.footballEvidence
                    ? "Ouvrir la source publique"
                  : "Résultat officiel"}
            </a>
          ) : null}
          {isHttpUrl(candidate.sourceUrl) && candidate.sourceUrl !== candidate.articleUrl ? (
            <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">{candidate.sourceName}</a>
          ) : (
            <span>{candidate.sourceName}</span>
          )}
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
      attentionCount={
        candidateTotals.pending
        + candidateTotals.validated
        - candidateTotals.superseded
        + (error ? 1 : 0)
      }
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
        {latestRefresh ? (
          <details
            style={{
              padding: "0.6rem",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              background: "#fff",
            }}
          >
            <summary style={{ cursor: "pointer", fontSize: "0.78rem", fontWeight: 700 }}>
              Dernière exécution automatique · {scheduledStatusLabel[latestRefresh.status]}
              {" · "}{formatDate(latestRefresh.completedAt ?? latestRefresh.startedAt)}
            </summary>
            <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.55rem" }}>
              <p style={{ margin: 0, color: "#475569", fontSize: "0.76rem" }}>
                {latestRefresh.completedCount}/{latestRefresh.taskCount} veille
                {latestRefresh.taskCount === 1 ? "" : "s"} terminée
                {latestRefresh.taskCount === 1 ? "" : "s"}
                {" · "}{pluralize(latestRefresh.createdCount, "nouveau résultat", "nouveaux résultats")}
                {" · "}{pluralize(latestRefresh.failedCount, "échec")}
              </p>
              {latestRefresh.message ? (
                <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: "0.76rem" }}>
                  {latestRefresh.message}
                </p>
              ) : null}
              {latestRefresh.tasks.map((task) => (
                <div
                  key={`${latestRefresh.id}:${task.sourceKey}:${task.athleteId}`}
                  style={{ padding: "0.45rem", border: "1px solid #e2e8f0", borderRadius: "7px" }}
                >
                  <strong style={{ fontSize: "0.76rem" }}>{task.athleteName}</strong>
                  <p style={{ margin: "0.15rem 0 0", color: "#475569", fontSize: "0.73rem" }}>
                    {sourceOptions.find((source) => source.key === task.sourceKey)?.label ?? task.sourceKey}
                    {" · "}{task.status === "completed"
                      ? task.createdCount > 0
                        ? pluralize(task.createdCount, "nouveau résultat", "nouveaux résultats")
                        : "Inchangé"
                      : task.status === "failed"
                        ? "Échec"
                        : "En attente"}
                    {task.message ? ` · ${task.message}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </details>
        ) : null}
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
        {refreshAllComplete ? (
          <div
            style={{
              display: "grid",
              gap: "0.5rem",
              padding: refreshAllPartial ? "0.65rem" : 0,
              border: refreshAllPartial ? "1px solid #f59e0b" : 0,
              borderRadius: refreshAllPartial ? "8px" : 0,
              background: refreshAllPartial ? "#fffbeb" : "transparent",
            }}
          >
            <p
              role="status"
              style={{
                margin: 0,
                color: refreshAllPartial ? "#92400e" : "#1e3a8a",
                fontSize: "0.78rem",
                fontWeight: refreshAllPartial ? 700 : 400,
              }}
            >
              {pluralize(refreshAllCreatedCount, "nouveau résultat", "nouveaux résultats")}
              {" · "}{pluralize(refreshAllExcludedCount, "rencontre écartée", "rencontres écartées")}
              {" · "}{pluralize(refreshAllFailureCount, "échec")}
            </p>
            {refreshAllPartial ? (
              <p role="alert" style={{ margin: 0, color: "#92400e", fontSize: "0.76rem", fontWeight: 700 }}>
                Couverture partielle : certaines rencontres ont été écartées ou certaines veilles ont échoué.
              </p>
            ) : null}
            <button
              type="button"
              className="card-link-button"
              aria-expanded={refreshAllDetailsOpen}
              aria-controls="sports-watch-refresh-details"
              onClick={() => setRefreshAllDetailsOpen((open) => !open)}
            >
              Voir le détail des {refreshAllSummaries.length} veille
              {refreshAllSummaries.length === 1 ? "" : "s"}
            </button>
            {refreshAllDetailsOpen ? (
              <div
                id="sports-watch-refresh-details"
                aria-label="Bilan des veilles actualisées"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 15rem), 1fr))",
                  gap: "0.5rem",
                }}
              >
                {refreshAllSummaries.map((summary) => {
                  const source = sourceOptions.find((option) => option.key === summary.task.sourceKey);
                  const warningGroups = groupedWarnings(summary);
                  const partial = warningGroups.length > 0;
                  return (
                    <article
                      key={`${summary.task.sourceKey}:${summary.task.athleteId}`}
                      style={{
                        minWidth: 0,
                        padding: "0.55rem 0.65rem",
                        border: `1px solid ${partial ? "#f59e0b" : "#bfdbfe"}`,
                        borderRadius: "8px",
                        background: partial ? "#fffbeb" : "#fff",
                        overflowWrap: "anywhere",
                      }}
                    >
                      <strong style={{ display: "block", fontSize: "0.78rem" }}>
                        {summary.task.athleteName}
                      </strong>
                      <a
                        href={summary.result?.sourceUrl ?? source?.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "block", color: "#1d4ed8", fontSize: "0.72rem" }}
                      >
                        {source?.label ?? summary.task.sourceKey}
                      </a>
                      <span
                        style={{
                          display: "block",
                          marginTop: "0.25rem",
                          color: summary.error ? "#b91c1c" : partial ? "#92400e" : "#1e3a8a",
                          fontSize: "0.74rem",
                          fontWeight: 700,
                        }}
                      >
                        {refreshSummaryStatus(summary)}
                      </span>
                      <span style={{ display: "block", marginTop: "0.2rem", color: "#64748b", fontSize: "0.7rem" }}>
                        {summary.error ?? summary.result?.message}
                      </span>
                      {warningGroups.length > 0 ? (
                        <details style={{ marginTop: "0.4rem", color: "#78350f", fontSize: "0.7rem" }}>
                          <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                            {pluralize(
                              warningGroups.reduce((total, group) => total + group.count, 0),
                              "rencontre écartée",
                              "rencontres écartées",
                            )}
                          </summary>
                          <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1rem" }}>
                            {warningGroups.map((group) => (
                              <li key={`${group.reason}:${group.url}`} style={{ marginTop: "0.3rem" }}>
                                <strong>{group.count}× {group.reason}</strong>
                                {" · "}
                                <a href={group.url} target="_blank" rel="noreferrer">Source</a>
                                {group.details.length > 0 ? (
                                  <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1rem" }}>
                                    {group.details.map((detail) => <li key={detail}>{detail}</li>)}
                                  </ul>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      <SportsWatchManualEntryPanel
        key={footballCompletionCandidate?.id ?? "manual-entry"}
        athletes={athletes}
        completionCandidate={footballCompletionCandidate}
        onCompletionCancelled={() => setFootballCompletionCandidate(null)}
        onCandidateCreated={(candidate, created, replacedCandidateId) => {
          setCandidates((current) => [
            candidate,
            ...current.filter((item) =>
              item.id !== candidate.id && item.id !== replacedCandidateId),
          ]);
          if (replacedCandidateId) {
            const previous = candidates.find((item) => item.id === replacedCandidateId);
            if (previous) {
              setCandidateTotals((current) => ({
                ...current,
                [previous.adminStatus]: Math.max(0, current[previous.adminStatus] - 1),
                [candidate.adminStatus]: current[candidate.adminStatus] + 1,
                superseded: current.superseded + 1,
                supersededPending: current.supersededPending + 1,
              }));
              if (previous.adminStatus !== candidate.adminStatus) {
                setAthleteCandidateTotals((current) => current.map((total) =>
                  total.athleteId === candidate.athleteId
                    ? {
                        ...total,
                        pending: Math.max(
                          0,
                          total.pending
                            - (previous.adminStatus === "pending" ? 1 : 0)
                            + (candidate.adminStatus === "pending" ? 1 : 0),
                        ),
                        validated: Math.max(
                          0,
                          total.validated
                            - (previous.adminStatus === "validated" ? 1 : 0)
                            + (candidate.adminStatus === "validated" ? 1 : 0),
                        ),
                      }
                    : total));
              }
            }
            return;
          }
          if (!created) return;
          setCandidateTotals((current) => ({
            ...current,
            [candidate.adminStatus]: current[candidate.adminStatus] + 1,
          }));
          setAthleteCandidateTotals((current) => {
            const index = current.findIndex((total) => total.athleteId === candidate.athleteId);
            if (index < 0) {
              return [...current, {
                athleteId: candidate.athleteId,
                athleteName: candidate.athleteName,
                pending: candidate.adminStatus === "pending" ? 1 : 0,
                validated: candidate.adminStatus === "validated" ? 1 : 0,
              }];
            }
            return current.map((total, currentIndex) =>
              currentIndex === index
                ? {
                    ...total,
                    pending: total.pending + (candidate.adminStatus === "pending" ? 1 : 0),
                    validated: total.validated + (candidate.adminStatus === "validated" ? 1 : 0),
                  }
                : total);
          });
        }}
      />
      <FootballPublicPilotPanel athletes={athletes} />
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
          setCandidateTotals((current) => ({
            ...current,
            pending: current.pending + 1,
          }));
          setAthleteCandidateTotals((current) => {
            const index = current.findIndex((total) => total.athleteId === candidate.athleteId);
            if (index < 0) {
              return [...current, {
                athleteId: candidate.athleteId,
                athleteName: candidate.athleteName,
                pending: 1,
                validated: 0,
              }];
            }
            return current.map((total, currentIndex) =>
              currentIndex === index ? { ...total, pending: total.pending + 1 } : total);
          });
        }}
      />
      </details>

      <div className="today-view-switch" aria-label="Vue de la veille sportive">
        <button type="button" aria-pressed={view === "current"} onClick={() => setView("current")}>
          À exploiter ({candidateTotals.pending + candidateTotals.validated - candidateTotals.superseded})
        </button>
        <button type="button" aria-pressed={view === "history"} onClick={() => setView("history")}>
          Historique ({
            candidateTotals.exploited
            + candidateTotals.rejected
            + candidateTotals.dismissed
            + candidateTotals.superseded
          })
        </button>
      </div>

      {selectedCandidateIds.size > 0 ? (
        <section
          className="sports-watch-article-selection-bar"
          aria-label="Préparation d’un article avec les résultats sélectionnés"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.65rem",
            flexWrap: "wrap",
            margin: "0.7rem 0",
            padding: "0.6rem 0.7rem",
            border: "1px solid #bfdbfe",
            borderRadius: "9px",
            background: "#eff6ff",
          }}
        >
          <strong style={{ fontSize: "0.82rem" }}>
            {pluralize(selectedCandidateIds.size, "résultat sélectionné", "résultats sélectionnés")}
          </strong>
          <div
            className="sports-watch-article-selection-actions"
            style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
          >
            <button
              type="button"
              className="card-link-button"
              disabled={articleTransferBusy}
              onClick={() => {
                setSelectedCandidateIds(new Set());
                setPotentialDuplicates([]);
              }}
            >
              Tout désélectionner
            </button>
            <button
              type="button"
              className="card-link-button"
              disabled={articleTransferBusy}
              onClick={() => void prepareSelectedArticle()}
            >
              {articleTransferBusy ? "Vérification…" : "Préparer un article"}
            </button>
          </div>
        </section>
      ) : null}

      {potentialDuplicates.length > 0 ? (
        <section
          role="alert"
          style={{
            display: "grid",
            gap: "0.55rem",
            margin: "0.7rem 0",
            padding: "0.7rem",
            border: "1px solid #f59e0b",
            borderRadius: "9px",
            background: "#fffbeb",
          }}
        >
          <strong>Doublons potentiels à vérifier</strong>
          <p style={{ margin: 0, fontSize: "0.8rem" }}>
            Désélectionnez le résultat à écarter, ou confirmez que les résultats décrivent des événements distincts.
            Aucune statistique contradictoire ne sera fusionnée.
          </p>
          {potentialDuplicates.map((duplicate) => (
            <div key={duplicate.id} style={{ fontSize: "0.78rem" }}>
              <span>{duplicate.reason}</span>
              <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
                {duplicate.candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <strong>{candidate.sourceName}</strong> · {candidate.title}
                    {" · "}
                    <button
                      type="button"
                      className="card-link-button"
                      onClick={() => toggleArticleSelection(candidate.id, false)}
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <button
            type="button"
            className="card-link-button"
            disabled={articleTransferBusy}
            onClick={() => void prepareSelectedArticle(true)}
          >
            Confirmer des événements distincts
          </button>
        </section>
      ) : null}

      {message ? (
        <div
          role="status"
          style={{
            color: message.startsWith("Actualisation partielle") ? "#92400e" : "#166534",
            fontSize: "0.84rem",
            display: "flex",
            alignItems: "center",
            gap: "0.55rem",
            flexWrap: "wrap",
          }}
        >
          <span>{message}</span>
          {dismissUndoCandidate ? (
            <button
              type="button"
              className="card-link-button"
              disabled={busyCandidateId === dismissUndoCandidate.id}
              onClick={() => void review(dismissUndoCandidate, "validated")}
            >
              Annuler
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert" style={{ color: "#b91c1c", fontSize: "0.84rem" }}>{error}</p> : null}

      <p style={{ margin: "0.65rem 0", color: "#6b7280", fontSize: "0.78rem" }}>
        Valider autorise l’usage éditorial. Cela ne marque pas automatiquement l’information comme vérifiée factuellement.
      </p>

      {athleteGroups.length > 0 ? (
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
          {athleteGroups.map((athleteGroup) => (
            <details
              key={athleteGroup.athleteId}
              data-sports-athlete-id={athleteGroup.athleteId}
              open={openAthleteIds.has(athleteGroup.athleteId)}
              onToggle={(event) =>
                setAthleteCardOpen(athleteGroup.athleteId, event.currentTarget.open)}
              style={{
                border: "1px solid #dbe3ee",
                borderRadius: "10px",
                background: "#fff",
                overflow: "hidden",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.65rem",
                  flexWrap: "wrap",
                  padding: "0.8rem",
                  fontWeight: 750,
                }}
              >
                <span>{crmAthleteNames.get(athleteGroup.athleteId) ?? athleteGroup.athleteName}</span>
                <span style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <span className="priority-badge">
                    À vérifier : {athleteGroup.pendingCount}
                  </span>
                  <span className="priority-badge">
                    À exploiter : {athleteGroup.exploitableCount}
                  </span>
                </span>
              </summary>
              <SportsWatchResultsPresentation
                athleteGroup={athleteGroup}
                formatDate={formatDate}
                renderActions={renderCandidateActions}
                renderSourceDetails={renderSourceDetails}
              />
            </details>
          ))}
        </div>
      ) : (
        <p>{view === "current"
          ? "Aucun résultat à valider ou exploiter."
          : "Aucun résultat exploité, rejeté ou remplacé dans l’historique."}</p>
      )}
      <div
        aria-label="Pagination des actualités"
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginTop: "0.8rem",
        }}
      >
        {(view === "current"
          ? (["pending", "validated"] as const)
          : (["history"] as const)).map((group) => {
          const loaded = candidates.filter((candidate) =>
            candidateGroup(candidate.adminStatus) === group).length;
          const total = group === "history"
            ? candidateTotals.exploited
              + candidateTotals.rejected
              + candidateTotals.dismissed
              + candidateTotals.superseded
            : candidateTotals[group] - (group === "pending"
              ? candidateTotals.supersededPending
              : candidateTotals.supersededValidated);
          const label = group === "pending"
            ? "actualités à vérifier"
            : group === "validated"
              ? "actualités à exploiter"
              : "actualités de l’historique";
          return (
            <button
              key={group}
              type="button"
              className="card-link-button"
              disabled={!candidatePages[group].hasMore || loadingCandidateGroup !== null}
              onClick={() => void loadMoreCandidates(group)}
            >
              {loadingCandidateGroup === group
                ? "Chargement…"
                : candidatePages[group].hasMore
                  ? `Charger plus · ${loaded}/${total} ${label}`
                  : `${loaded}/${total} ${label}`}
            </button>
          );
        })}
      </div>
      {canvaCandidate ? (
        <SportsWatchCanvaPreparationPanel
          candidate={canvaCandidate}
          athleteClub={athletes.find((athlete) =>
            (athlete.athleteId?.trim() || athlete.key.trim()) === canvaCandidate.athleteId
          )?.club ?? null}
          templateUrl={basketballCanvaTemplateUrl}
          onClose={() => setCanvaCandidate(null)}
        />
      ) : null}
    </TodayCollapsibleCard>
  );
}
