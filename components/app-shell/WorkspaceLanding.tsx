"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/src/design-system/components";
import type { Athlete, AthletesResponse, MonthlyFormResponse, WeeklyFormResponse } from "@/types/athlete";
import type { ShootingsResponse, Shooting } from "@/types/shooting";
import type { ContentDocument } from "@/types/content-document";
import { ShootingService } from "@/services/shooting.service";
import { buildMembershipState } from "@/lib/membership";

type WorkspaceLandingProps = {
  sectionTitle?: string;
};

type AthleteOfTheMonthNomination = {
  id: string;
  athleteId: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  nominatedAt: string;
  reason: string | null;
};

type AthleteOfTheMonthWinner = {
  id: string;
  athleteId: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  awardedAt: string;
  description: string | null;
};

type DashboardOpportunity = {
  id: string;
  title: string;
  type: string;
  location: string;
  date: string;
  deadline: string;
  status: "Ouverte" | "Bientôt" | "Fermée" | "Brouillon";
  interestCount: number;
};

type DashboardOpportunityRequest = {
  opportunityId: string;
  status: "requested" | "confirmed" | "declined" | "cancelled";
};

type DashboardOpportunitySlot = {
  opportunityId: string;
  startsAt: string;
  status: "open" | "closed" | "cancelled";
};

type ProcessedWeeklyResponse = {
  athleteId: string;
  responseTimestamp: string;
};

const DRAFT_KEY_PREFIX = "klique.contents.document-editor.draft.v1";
const ATHLETE_OF_THE_MONTH_TYPE = "athlete_of_the_month";
const MONTH_LABELS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];

const normalize = (value: unknown): string => String(value ?? "").trim();

const getWeeklyResponseKey = (athleteId: string, responseTimestamp: string): string =>
  JSON.stringify([athleteId, responseTimestamp]);

const parseDateRank = (value: string): number => {
  const raw = normalize(value);
  if (!raw) return Number.MIN_SAFE_INTEGER;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime()) ? Number.MIN_SAFE_INTEGER : date.getTime();
  }

  const fr = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (fr) {
    const day = Number(fr[1]);
    const month = Number(fr[2]);
    const year = Number(fr[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date.getTime();
    }
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? Number.MIN_SAFE_INTEGER : fallback.getTime();
};

const formatDate = (value: string): string => {
  const rank = parseDateRank(value);
  if (rank === Number.MIN_SAFE_INTEGER) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(rank));
};

const normalizeProductionStatus = (value: string): string => normalize(value)
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

const isActiveProduction = (shooting: Shooting): boolean => {
  const status = normalizeProductionStatus(shooting.status);
  const hasTerminalStatus = ["termine", "archive", "annule", "publie"].some((token) => status.includes(token));
  return !shooting.published && !ShootingService.isComplete(shooting) && !hasTerminalStatus;
};

const getProductionUrgencyRank = (shooting: Shooting): number => {
  const status = normalizeProductionStatus(shooting.status);
  if (["urgent", "retard", "verif", "bloqu", "action"].some((token) => status.includes(token))) return 0;
  if (shooting.shootingDone) return 1;
  if (parseDateRank(shooting.date) <= Date.now()) return 2;
  return 3;
};

const getDocumentTitle = (document: ContentDocument): string => {
  if (document.type === "interview") return normalize(document.sections.title) || "Interview sans titre";
  if (document.type === "publication") return normalize(document.sections.title) || "Publication sans titre";
  return normalize(document.sections.title) || "Reel sans titre";
};

const isMeaningfulWeeklyValue = (value: string): boolean => {
  const normalized = normalize(value);
  return Boolean(normalized) && !["/", "//", "-"].includes(normalized);
};

const isMeaningfulMonthlyValue = (value: string): boolean => {
  const normalized = normalize(value);
  return isMeaningfulWeeklyValue(normalized)
    && !["non", "rien de particulier", "pas en particulier"].includes(normalized.toLowerCase());
};

const getMonthlyInformation = (response: MonthlyFormResponse): Array<{ label: string; value: string }> => {
  const seenValues = new Set<string>();
  return [
    { label: "Dates importantes", value: response.importantDates },
    { label: "Objectif principal", value: response.mainObjective },
    { label: "Autre actualité prévue", value: response.plannedNews },
    { label: "Opportunité ou besoin", value: response.opportunityOrNeed },
    { label: "Moment à couvrir", value: response.momentToCover },
    { label: "Remarque complémentaire", value: response.additionalNote },
  ].filter((item) => {
    if (!isMeaningfulMonthlyValue(item.value)) return false;
    const normalizedValue = normalize(item.value).toLowerCase();
    if (seenValues.has(normalizedValue)) return false;
    seenValues.add(normalizedValue);
    return true;
  });
};

const getMonthlyPreviewInformation = (
  information: Array<{ label: string; value: string }>,
): Array<{ label: string; value: string }> => {
  const priorityLabels = [
    "Opportunité ou besoin",
    "Moment à couvrir",
    "Objectif principal",
    "Dates importantes",
    "Autre actualité prévue",
    "Remarque complémentaire",
  ];

  return [...information]
    .sort((left, right) => priorityLabels.indexOf(left.label) - priorityLabels.indexOf(right.label))
    .slice(0, 2);
};

const hasUsefulWeeklyInformation = (response: WeeklyFormResponse): boolean => {
  return response.contactRequested || [
    response.competition,
    response.result,
    response.notableEvent,
    response.notableEventExplanation,
    response.media,
    response.mediaLink,
    response.appointment,
  ].some(isMeaningfulWeeklyValue);
};

const parseWeeklyResponseDate = (value: string): number | null => {
  const raw = normalize(value);
  const european = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  const parts = european
    ? { year: european[3], month: european[2], day: european[1], hour: european[4], minute: european[5], second: european[6] }
    : iso
      ? { year: iso[1], month: iso[2], day: iso[3], hour: iso[4], minute: iso[5], second: iso[6] }
      : null;
  if (!parts) {
    const fallback = Date.parse(raw);
    return Number.isNaN(fallback) ? null : fallback;
  }
  const parsed = new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour ?? 0),
    Number(parts.minute ?? 0),
    Number(parts.second ?? 0),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

export function WorkspaceLanding({ sectionTitle = "Aujourd'hui" }: WorkspaceLandingProps) {
  const now = new Date();
  const currentAwardMonth = now.getMonth() + 1;
  const currentAwardYear = now.getFullYear();
  const [loading, setLoading] = useState(true);
  const [athletesAvailable, setAthletesAvailable] = useState(false);
  const [productionsAvailable, setProductionsAvailable] = useState(false);
  const [athletes, setAthletes] = useState<AthletesResponse["athletes"]>([]);
  const [shootings, setShootings] = useState<Shooting[]>([]);
  const [savedDocuments, setSavedDocuments] = useState<ContentDocument[]>([]);
  const [opportunities, setOpportunities] = useState<DashboardOpportunity[]>([]);
  const [opportunityRequests, setOpportunityRequests] = useState<DashboardOpportunityRequest[]>([]);
  const [opportunitySlots, setOpportunitySlots] = useState<DashboardOpportunitySlot[]>([]);
  const [monthlyNominations, setMonthlyNominations] = useState<AthleteOfTheMonthNomination[]>([]);
  const [monthlyWinner, setMonthlyWinner] = useState<AthleteOfTheMonthWinner | null>(null);
  const [selectedNomineeAthleteId, setSelectedNomineeAthleteId] = useState("");
  const [selectedWinnerAthleteId, setSelectedWinnerAthleteId] = useState("");
  const [winnerDescription, setWinnerDescription] = useState("");
  const [nominationLoading, setNominationLoading] = useState(false);
  const [nominationError, setNominationError] = useState<string | null>(null);
  const [processedWeeklyResponseKeys, setProcessedWeeklyResponseKeys] = useState<Set<string>>(() => new Set());
  const [processingWeeklyResponseKeys, setProcessingWeeklyResponseKeys] = useState<Set<string>>(() => new Set());
  const [weeklyResponseError, setWeeklyResponseError] = useState<string | null>(null);
  const [processedMonthlyResponseKeys, setProcessedMonthlyResponseKeys] = useState<Set<string>>(() => new Set());
  const [processingMonthlyResponseKeys, setProcessingMonthlyResponseKeys] = useState<Set<string>>(() => new Set());
  const [monthlyResponseError, setMonthlyResponseError] = useState<string | null>(null);
  const [monthlyDetailOverrides, setMonthlyDetailOverrides] = useState<Record<string, boolean>>({});
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loadAthleteOfTheMonth = async () => {
    const response = await fetch(
      `/api/athlete-distinctions?type=${encodeURIComponent(ATHLETE_OF_THE_MONTH_TYPE)}&awardMonth=${currentAwardMonth}&awardYear=${currentAwardYear}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error("Impossible de charger les nominations du mois.");
    }

    const payload = (await response.json()) as {
      nominations?: AthleteOfTheMonthNomination[];
      winner?: AthleteOfTheMonthWinner | null;
    };

    return {
      nominations: Array.isArray(payload.nominations) ? payload.nominations : [],
      winner: payload.winner ?? null,
    };
  };

  useEffect(() => {
    let active = true;

    const loadDashboardData = async () => {
      setLoading(true);

      try {
        const [athletesResponse, shootingsResponse, awardResponse, opportunitiesResponse, opportunitySlotsResponse, processedWeeklyResponsesResponse, processedMonthlyResponsesResponse] = await Promise.all([
          fetch("/api/athletes?weeklyResponseDays=14&monthlyResponseDays=45", { cache: "no-store" }),
          fetch("/api/shootings", { cache: "no-store" }),
          loadAthleteOfTheMonth(),
          fetch("/api/hub-opportunities", { cache: "no-store" }),
          fetch("/api/hub-opportunity-slots", { cache: "no-store" }),
          fetch("/api/weekly-response-processing", { cache: "no-store" }),
          fetch("/api/weekly-response-processing?responseType=monthly", { cache: "no-store" }),
        ]);

        const athletesPayload = (await athletesResponse.json()) as AthletesResponse | { error?: string };
        const shootingsPayload = (await shootingsResponse.json()) as ShootingsResponse | { error?: string };
        const opportunitiesPayload = (await opportunitiesResponse.json()) as { opportunities?: DashboardOpportunity[] };
        const opportunitySlotsPayload = (await opportunitySlotsResponse.json()) as {
          slots?: DashboardOpportunitySlot[];
          requests?: DashboardOpportunityRequest[];
        };
        const processedWeeklyResponsesPayload = (await processedWeeklyResponsesResponse.json()) as {
          processedResponses?: ProcessedWeeklyResponse[];
        };
        const processedMonthlyResponsesPayload = (await processedMonthlyResponsesResponse.json()) as {
          processedResponses?: ProcessedWeeklyResponse[];
        };

        if (!active) return;

        if (athletesResponse.ok && "source" in athletesPayload && athletesPayload.source === "google-sheets") {
          setAthletesAvailable(true);
          setAthletes(athletesPayload.athletes);
        } else {
          setAthletesAvailable(false);
          setAthletes([]);
        }

        if (shootingsResponse.ok && "source" in shootingsPayload && shootingsPayload.source === "google-sheets") {
          setProductionsAvailable(true);
          setShootings(shootingsPayload.shootings);
        } else {
          setProductionsAvailable(false);
          setShootings([]);
        }

        const drafts: ContentDocument[] = [];
        const keys = Object.keys(window.localStorage).filter((key) => key.startsWith(`${DRAFT_KEY_PREFIX}:`));
        for (const key of keys) {
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          try {
            drafts.push(JSON.parse(raw) as ContentDocument);
          } catch {
            // Ignore malformed saved entries.
          }
        }
        setSavedDocuments(
          drafts.sort((a, b) => {
            const aRank = parseDateRank(a.updatedAt || a.createdAt);
            const bRank = parseDateRank(b.updatedAt || b.createdAt);
            return bRank - aRank;
          })
        );

        setMonthlyNominations(awardResponse.nominations);
        setMonthlyWinner(awardResponse.winner);
        setOpportunities(opportunitiesResponse.ok && Array.isArray(opportunitiesPayload.opportunities) ? opportunitiesPayload.opportunities : []);
        setOpportunityRequests(opportunitySlotsResponse.ok && Array.isArray(opportunitySlotsPayload.requests) ? opportunitySlotsPayload.requests : []);
        setOpportunitySlots(opportunitySlotsResponse.ok && Array.isArray(opportunitySlotsPayload.slots) ? opportunitySlotsPayload.slots : []);
        setProcessedWeeklyResponseKeys(new Set(
          processedWeeklyResponsesResponse.ok && Array.isArray(processedWeeklyResponsesPayload.processedResponses)
            ? processedWeeklyResponsesPayload.processedResponses.map((item) => getWeeklyResponseKey(item.athleteId, item.responseTimestamp))
            : [],
        ));
        setProcessedMonthlyResponseKeys(new Set(
          processedMonthlyResponsesResponse.ok && Array.isArray(processedMonthlyResponsesPayload.processedResponses)
            ? processedMonthlyResponsesPayload.processedResponses.map((item) => getWeeklyResponseKey(item.athleteId, item.responseTimestamp))
            : [],
        ));
      } catch {
        if (!active) return;
        setAthletesAvailable(false);
        setProductionsAvailable(false);
        setAthletes([]);
        setShootings([]);
        setSavedDocuments([]);
        setMonthlyNominations([]);
        setMonthlyWinner(null);
        setOpportunities([]);
        setOpportunityRequests([]);
        setOpportunitySlots([]);
        setProcessedWeeklyResponseKeys(new Set());
        setProcessedMonthlyResponseKeys(new Set());
      } finally {
        if (active) {
          setLoading(false);
          setLastRefreshedAt(new Date());
        }
      }
    };

    void loadDashboardData();

    return () => {
      active = false;
    };
  }, []);

  const athletesToFollow = useMemo(() => {
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const renewalWindowEnd = today.getTime() + 30 * 24 * 60 * 60 * 1000;
    const hasRecentResponse = (value: string, days: number): boolean => {
      const responseTime = parseWeeklyResponseDate(value);
      return responseTime !== null && responseTime <= now && responseTime >= now - days * 24 * 60 * 60 * 1000;
    };

    return athletes
      .flatMap((athlete, athleteIndex) => {
        if (!/^(actif|active)(?:\s|$)/i.test(normalize(athlete.status))) return [];

        const reasons: Array<{ priority: number; label: string; tone: string }> = [];
        const membership = buildMembershipState({
          startDate: athlete.adhesionDate,
          isInitialFreeYearEligible: athleteIndex < 16,
        });
        const membershipEndRank = membership.endDateLabel ? parseDateRank(membership.endDateLabel) : Number.MAX_SAFE_INTEGER;

        if (membershipEndRank >= today.getTime() && membershipEndRank <= renewalWindowEnd) {
          reasons.push({ priority: 1, label: `Adhésion à renouveler le ${membership.endDateLabel}`, tone: "priority-urgent" });
        }
        const hasRecentMonthlyResponse = hasRecentResponse(athlete.lastResponseMonthly, 45);
        const hasRecentWeeklyResponse = hasRecentResponse(athlete.lastResponseWeekly, 14);
        if (!hasRecentMonthlyResponse && !hasRecentWeeklyResponse) {
          reasons.push({ priority: 3, label: "Aucun retour récent", tone: "priority-haute" });
        }
        if (reasons.length === 0) return [];

        return [{
          athlete,
          reasons: reasons.sort((left, right) => left.priority - right.priority),
          priority: Math.min(...reasons.map((reason) => reason.priority)),
          membershipEndRank,
        }];
      })
      .sort((left, right) =>
        left.priority - right.priority
        || left.membershipEndRank - right.membershipEndRank
        || left.athlete.name.localeCompare(right.athlete.name, "fr")
      );
  }, [athletes]);

  const weeklyResponses = useMemo(() => {
    const today = new Date();
    const now = today.getTime();
    const rollingWindowStart = now - 14 * 24 * 60 * 60 * 1000;
    return athletes
      .flatMap((athlete) => {
        const response = athlete.weeklyFormResponse;
        if (!response) return [];
        if (processedWeeklyResponseKeys.has(getWeeklyResponseKey(athlete.key, response.timestamp))) return [];
        const responseTime = parseWeeklyResponseDate(response.timestamp);
        if (responseTime === null || responseTime < rollingWindowStart || responseTime > now) return [];
        return [{ athlete, response, responseTime }];
      })
      .sort((a, b) =>
        Number(b.response.contactRequested) - Number(a.response.contactRequested)
        || b.responseTime - a.responseTime
      )
      .slice(0, 4);
  }, [athletes, processedWeeklyResponseKeys]);

  const markWeeklyResponseAsProcessed = async (athleteId: string, responseTimestamp: string) => {
    const responseKey = getWeeklyResponseKey(athleteId, responseTimestamp);
    if (processingWeeklyResponseKeys.has(responseKey)) return;

    setWeeklyResponseError(null);
    setProcessingWeeklyResponseKeys((current) => new Set(current).add(responseKey));

    try {
      const response = await fetch("/api/weekly-response-processing", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId, responseTimestamp }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Impossible de traiter la réponse.");
      }
      setProcessedWeeklyResponseKeys((current) => new Set(current).add(responseKey));
    } catch (error) {
      setWeeklyResponseError(error instanceof Error ? error.message : "Impossible de traiter la réponse.");
    } finally {
      setProcessingWeeklyResponseKeys((current) => {
        const next = new Set(current);
        next.delete(responseKey);
        return next;
      });
    }
  };

  const monthlyResponses = useMemo(() => {
    const now = Date.now();
    const rollingWindowStart = now - 45 * 24 * 60 * 60 * 1000;

    return athletes
      .flatMap((athlete) => {
        const response = athlete.monthlyFormResponse;
        if (!response) return [];
        if (processedMonthlyResponseKeys.has(getWeeklyResponseKey(athlete.key, response.timestamp))) return [];
        const responseTime = parseWeeklyResponseDate(response.timestamp);
        if (responseTime === null || responseTime < rollingWindowStart || responseTime > now) return [];
        const hasPriority = isMeaningfulMonthlyValue(response.opportunityOrNeed) || isMeaningfulMonthlyValue(response.momentToCover);
        return [{ athlete, response, responseTime, hasPriority }];
      })
      .sort((a, b) => Number(b.hasPriority) - Number(a.hasPriority) || b.responseTime - a.responseTime);
  }, [athletes, processedMonthlyResponseKeys]);

  const markMonthlyResponseAsProcessed = async (athleteId: string, responseTimestamp: string) => {
    const responseKey = getWeeklyResponseKey(athleteId, responseTimestamp);
    if (processingMonthlyResponseKeys.has(responseKey)) return;

    setMonthlyResponseError(null);
    setProcessingMonthlyResponseKeys((current) => new Set(current).add(responseKey));

    try {
      const response = await fetch("/api/weekly-response-processing", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId, responseTimestamp, responseType: "monthly" }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Impossible de traiter la réponse.");
      }
      setProcessedMonthlyResponseKeys((current) => new Set(current).add(responseKey));
    } catch (error) {
      setMonthlyResponseError(error instanceof Error ? error.message : "Impossible de traiter la réponse.");
    } finally {
      setProcessingMonthlyResponseKeys((current) => {
        const next = new Set(current);
        next.delete(responseKey);
        return next;
      });
    }
  };

  const activeProductions = useMemo(() => {
    return shootings
      .filter(isActiveProduction)
      .sort((left, right) => {
        const urgencyDifference = getProductionUrgencyRank(left) - getProductionUrgencyRank(right);
        if (urgencyDifference !== 0) return urgencyDifference;
        return parseDateRank(left.date) - parseDateRank(right.date);
      });
  }, [shootings]);

  const recentDocuments = useMemo(() => savedDocuments.slice(0, 4), [savedDocuments]);

  const opportunitiesToFollow = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const requestCounts = opportunityRequests.reduce<Map<string, { total: number; pending: number }>>((counts, request) => {
      if (request.status === "cancelled" || request.status === "declined") return counts;
      const current = counts.get(request.opportunityId) ?? { total: 0, pending: 0 };
      counts.set(request.opportunityId, {
        total: current.total + 1,
        pending: current.pending + (request.status === "requested" ? 1 : 0),
      });
      return counts;
    }, new Map());
    const futureSlotDates = opportunitySlots.reduce<Map<string, number>>((dates, slot) => {
      if (slot.status !== "open") return dates;
      const startsAt = parseDateRank(slot.startsAt);
      if (!Number.isFinite(startsAt) || startsAt === Number.MIN_SAFE_INTEGER || startsAt < Date.now()) return dates;
      const current = dates.get(slot.opportunityId);
      if (current === undefined || startsAt < current) dates.set(slot.opportunityId, startsAt);
      return dates;
    }, new Map());

    return opportunities
      .map((opportunity) => {
        const dateRank = parseDateRank(opportunity.date);
        const futureSlotRank = futureSlotDates.get(opportunity.id);
        const hasValidDateRank = Number.isFinite(dateRank) && dateRank !== Number.MIN_SAFE_INTEGER;
        const hasValidFutureSlotRank = futureSlotRank !== undefined && Number.isFinite(futureSlotRank);
        const hasFutureDate = hasValidDateRank && dateRank >= today.getTime();
        const requests = requestCounts.get(opportunity.id) ?? { total: 0, pending: 0 };
        const responseCount = opportunity.type === "Shooting" && requests.total > 0 ? requests.total : opportunity.interestCount;
        const hasResponseToProcess = opportunity.status === "Ouverte" && (responseCount > 0 || requests.pending > 0);
        const hasFutureProposal = hasFutureDate || hasValidFutureSlotRank;
        const isAwaitingResponse = opportunity.status === "Ouverte" && !hasResponseToProcess && hasFutureProposal;
        const isUpcomingValidated = opportunity.status === "Bientôt" && hasFutureDate;
        const effectiveDateRank = hasFutureDate ? dateRank : hasValidFutureSlotRank ? futureSlotRank : null;
        const hasValidEffectiveDateRank = effectiveDateRank !== null && effectiveDateRank !== undefined && Number.isFinite(effectiveDateRank);
        const effectiveDate = hasValidEffectiveDateRank ? new Date(effectiveDateRank) : null;
        const displayDate = hasFutureDate
          ? opportunity.date
          : effectiveDate && Number.isFinite(effectiveDate.getTime())
            ? effectiveDate.toISOString()
            : null;
        const statusLabel = hasResponseToProcess ? "Réponse à traiter" : isAwaitingResponse ? "En attente de réponse" : "Bientôt";
        const urgency = hasResponseToProcess ? 0 : isAwaitingResponse ? 1 : 2;
        return { ...opportunity, dateRank: hasValidEffectiveDateRank ? effectiveDateRank : Number.MIN_SAFE_INTEGER, displayDate, responseCount, hasResponseToProcess, isAwaitingResponse, isUpcomingValidated, statusLabel, urgency };
      })
      .filter((opportunity) =>
        opportunity.dateRank >= today.getTime()
        && (opportunity.hasResponseToProcess || opportunity.isAwaitingResponse || opportunity.isUpcomingValidated),
      )
      .sort((first, second) => first.urgency - second.urgency || first.dateRank - second.dateRank);
  }, [opportunities, opportunityRequests, opportunitySlots]);

  const monthLabel = useMemo(() => {
    const monthText = MONTH_LABELS[currentAwardMonth - 1] ?? "mois";
    return `${monthText} ${currentAwardYear}`;
  }, [currentAwardMonth, currentAwardYear]);

  const nominatedAthleteIds = useMemo(
    () => new Set(monthlyNominations.map((nomination) => nomination.athleteId)),
    [monthlyNominations],
  );

  const nomineeCandidates = useMemo(() => {
    return athletes.filter((athlete) => !nominatedAthleteIds.has(athlete.key));
  }, [athletes, nominatedAthleteIds]);

  const winnerCandidates = useMemo(() => {
    const byId = new Map(athletes.map((athlete) => [athlete.key, athlete]));
    return monthlyNominations
      .map((nomination) => byId.get(nomination.athleteId))
      .filter((athlete): athlete is Athlete => Boolean(athlete));
  }, [athletes, monthlyNominations]);

  const getAthleteName = (athleteId: string): string => {
    const athlete = athletes.find((item) => item.key === athleteId);
    return athlete?.name || athleteId;
  };

  const refreshAthleteOfTheMonth = async () => {
    const payload = await loadAthleteOfTheMonth();
    setMonthlyNominations(payload.nominations);
    setMonthlyWinner(payload.winner);
  };

  const addNomination = async () => {
    if (!selectedNomineeAthleteId || monthlyWinner || monthlyNominations.length >= 3) {
      return;
    }

    setNominationLoading(true);
    setNominationError(null);

    try {
      const response = await fetch("/api/athlete-distinctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "nominate",
          athleteId: selectedNomineeAthleteId,
          type: ATHLETE_OF_THE_MONTH_TYPE,
          awardMonth: currentAwardMonth,
          awardYear: currentAwardYear,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Impossible d'ajouter le nomine.");
      }

      setSelectedNomineeAthleteId("");
      await refreshAthleteOfTheMonth();
    } catch (error) {
      setNominationError(error instanceof Error ? error.message : "Impossible d'ajouter le nomine.");
    } finally {
      setNominationLoading(false);
    }
  };

  const removeNomination = async (nominationId: string) => {
    if (!nominationId || monthlyWinner) {
      return;
    }

    setNominationLoading(true);
    setNominationError(null);

    try {
      const response = await fetch("/api/athlete-distinctions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-nomination",
          nominationId,
          type: ATHLETE_OF_THE_MONTH_TYPE,
          awardMonth: currentAwardMonth,
          awardYear: currentAwardYear,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Impossible de supprimer le nomine.");
      }

      await refreshAthleteOfTheMonth();
    } catch (error) {
      setNominationError(error instanceof Error ? error.message : "Impossible de supprimer le nomine.");
    } finally {
      setNominationLoading(false);
    }
  };

  const designateWinner = async () => {
    if (!selectedWinnerAthleteId || monthlyWinner || monthlyNominations.length !== 3) {
      return;
    }

    setNominationLoading(true);
    setNominationError(null);

    try {
      const response = await fetch("/api/athlete-distinctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "designate-winner",
          athleteId: selectedWinnerAthleteId,
          type: ATHLETE_OF_THE_MONTH_TYPE,
          awardMonth: currentAwardMonth,
          awardYear: currentAwardYear,
          description: winnerDescription,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Impossible de designer le vainqueur.");
      }

      setWinnerDescription("");
      await refreshAthleteOfTheMonth();
    } catch (error) {
      setNominationError(error instanceof Error ? error.message : "Impossible de designer le vainqueur.");
    } finally {
      setNominationLoading(false);
    }
  };

  const dashboardDateLabel = new Intl.DateTimeFormat("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const lastRefreshedLabel = lastRefreshedAt
    ? new Intl.DateTimeFormat("fr-CH", { hour: "2-digit", minute: "2-digit" }).format(lastRefreshedAt)
    : "en cours";
  const totalToProcess = opportunitiesToFollow.length + weeklyResponses.length + monthlyResponses.length;

  return (
    <section className="workspace-landing">
      <header className="workspace-hero-banner">
        <div className="workspace-hero-content">
          {normalize(sectionTitle).toLowerCase() !== "aujourd'hui" ? (
            <p className="workspace-kicker">{sectionTitle.toUpperCase()}</p>
          ) : null}
          <h1>Bonjour Sébastien</h1>
          <div className="workspace-header-meta">
            <span>{dashboardDateLabel}</span>
            <span>Dernière actualisation à {lastRefreshedLabel}</span>
          </div>
        </div>
      </header>

      <section className="dashboard-summary" aria-label="Synthèse des éléments à traiter">
        <div className="dashboard-summary-total">
          <span>Total à traiter</span>
          <strong>{totalToProcess}</strong>
        </div>
        <div className="dashboard-summary-metrics">
          <div><strong>{opportunitiesToFollow.length}</strong><span>Opportunités</span></div>
          <div><strong>{weeklyResponses.length}</strong><span>Réponses hebdomadaires</span></div>
          <div><strong>{monthlyResponses.length}</strong><span>Réponses mensuelles</span></div>
        </div>
      </section>

      <section className="workspace-dashboard-grid" aria-label="Apercu du dashboard">
        <header className="dashboard-section-heading dashboard-priorities-heading">
          <span>À traiter</span>
          <h2>Priorités du moment</h2>
        </header>
        <header className="dashboard-section-heading dashboard-month-heading">
          <span>Projection</span>
          <h2>Vision du mois</h2>
        </header>
        <header className="dashboard-section-heading dashboard-activity-heading">
          <span>Opérations</span>
          <h2>Suivi de l’activité</h2>
        </header>

        <Card className="workspace-dashboard-card card-priorities dashboard-opportunities-card">
          <header className="dashboard-card-head">
            <h2>Opportunités à suivre</h2>
            <div className="dashboard-card-head-right">
              <span className="card-pill">{opportunitiesToFollow.length} à suivre</span>
            </div>
          </header>

          {opportunitiesToFollow.length > 0 ? (
            <ul className="priority-list">
              {opportunitiesToFollow.map((opportunity) => (
                <li key={opportunity.id} className="priority-item">
                  <span className="priority-check" aria-hidden />
                  <div className="priority-main">
                    <strong>{opportunity.title}</strong>
                    <span className={`priority-badge ${opportunity.hasResponseToProcess ? "priority-urgent" : "priority-normale"}`}>
                      {opportunity.statusLabel}
                    </span>
                    <small>
                      {opportunity.type} · {opportunity.location || "Lieu à définir"} · {opportunity.responseCount} participant{opportunity.responseCount === 1 ? "" : "s"}
                    </small>
                  </div>
                  <small className="priority-date">{opportunity.displayDate ? formatDate(opportunity.displayDate) : "Date inconnue"}</small>
                  <Link href={`/hub?opportunityId=${encodeURIComponent(opportunity.id)}`} className="card-link-button">Gérer</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>Aucune opportunité ne nécessite d’action.</p>
          )}

          <Link href="/hub" className="card-link-button">
            Voir toutes les opportunités
          </Link>
        </Card>

        {athletesAvailable ? (
          <Card className="workspace-dashboard-card card-priorities dashboard-athletes-card">
            <header className="dashboard-card-head">
              <h2>Athlètes à suivre</h2>
              <div className="dashboard-card-head-right">
                <span className="card-pill">{athletesToFollow.length} à suivre</span>
              </div>
            </header>

            {athletesToFollow.length > 0 ? (
              <ul className="priority-list">
                {athletesToFollow.slice(0, 5).map(({ athlete, reasons }) => (
                  <li key={athlete.key} className="priority-item athlete-follow-item">
                    <div className="priority-main">
                      <strong>{athlete.name}</strong>
                      <div className="athlete-follow-reasons">
                        {reasons.map((reason) => (
                          <span key={reason.label} className={`priority-badge ${reason.tone}`}>{reason.label}</span>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aucun athlète ne nécessite de suivi.</p>
            )}

            <Link href="/crm/personnes" className="card-link-button">
              Ouvrir le CRM Athlètes
            </Link>
          </Card>
        ) : null}

        {athletesAvailable ? (
          <Card className="workspace-dashboard-card card-priorities dashboard-award-card">
            <header className="dashboard-card-head">
              <h2>Athlete KLIQUE du mois</h2>
              <div className="dashboard-card-head-right">
                <span className="card-pill">{monthlyNominations.length} / 3 nomines</span>
              </div>
            </header>

            <p style={{ marginTop: 0, color: "#4b5563" }}>Periode en cours: {monthLabel}</p>

            {monthlyWinner ? (
              <div style={{ border: "1px solid #d1fae5", background: "#ecfdf5", borderRadius: "12px", padding: "0.7rem", marginBottom: "0.7rem" }}>
                <strong style={{ color: "#065f46" }}>Vainqueur: {getAthleteName(monthlyWinner.athleteId)}</strong>
                <p style={{ margin: "0.25rem 0 0", color: "#047857" }}>
                  {monthlyWinner.description || "Distinction athlete_of_the_month enregistree."}
                </p>
              </div>
            ) : null}

            {monthlyNominations.length > 0 ? (
              <ul className="priority-list">
                {monthlyNominations.map((nomination) => (
                  <li key={nomination.id} className="priority-item">
                    <span className="priority-check" aria-hidden />
                    <div className="priority-main">
                      <strong>{getAthleteName(nomination.athleteId)}</strong>
                      <small>{nomination.reason || "Nomination athlete_of_the_month"}</small>
                    </div>
                    {!monthlyWinner ? (
                      <button
                        type="button"
                        onClick={() => void removeNomination(nomination.id)}
                        disabled={nominationLoading}
                        style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: "999px", padding: "0.25rem 0.6rem", cursor: "pointer" }}
                      >
                        Retirer
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aucun nomine enregistre pour cette periode.</p>
            )}

            {!monthlyWinner && monthlyNominations.length < 3 ? (
              <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <select
                    value={selectedNomineeAthleteId}
                    onChange={(event) => setSelectedNomineeAthleteId(event.target.value)}
                    style={{ minWidth: "220px", border: "1px solid #d1d5db", borderRadius: "10px", padding: "0.45rem 0.6rem" }}
                  >
                    <option value="">Selectionner un athlete</option>
                    {nomineeCandidates.map((athlete) => (
                      <option key={athlete.key} value={athlete.key}>
                        {athlete.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void addNomination()}
                    disabled={!selectedNomineeAthleteId || nominationLoading}
                    className="card-link-button"
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            ) : null}

            {!monthlyWinner && monthlyNominations.length === 3 ? (
              <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.55rem" }}>
                <strong>Designer le vainqueur</strong>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <select
                    value={selectedWinnerAthleteId}
                    onChange={(event) => setSelectedWinnerAthleteId(event.target.value)}
                    style={{ minWidth: "220px", border: "1px solid #d1d5db", borderRadius: "10px", padding: "0.45rem 0.6rem" }}
                  >
                    <option value="">Choisir parmi les 3 nomines</option>
                    {winnerCandidates.map((athlete) => (
                      <option key={athlete.key} value={athlete.key}>
                        {athlete.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void designateWinner()}
                    disabled={!selectedWinnerAthleteId || nominationLoading}
                    className="card-link-button"
                  >
                    Designer le vainqueur
                  </button>
                </div>
                <input
                  type="text"
                  value={winnerDescription}
                  onChange={(event) => setWinnerDescription(event.target.value)}
                  placeholder="Description optionnelle"
                  style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "0.45rem 0.6rem" }}
                />
              </div>
            ) : null}

            {nominationError ? <p style={{ color: "#b91c1c", marginBottom: 0 }}>{nominationError}</p> : null}
          </Card>
        ) : null}

        {athletesAvailable ? (
          <Card className="workspace-dashboard-card card-priorities dashboard-weekly-card">
            <header className="dashboard-card-head">
              <h2>Réponses hebdomadaires</h2>
              <div className="dashboard-card-head-right">
                <span className="card-pill">{weeklyResponses.length} athlète{weeklyResponses.length === 1 ? "" : "s"}</span>
              </div>
            </header>

            {weeklyResponses.length > 0 ? (
              <ul className="priority-list">
                {weeklyResponses.map(({ athlete, response, responseTime }) => {
                  const responseKey = getWeeklyResponseKey(athlete.key, response.timestamp);
                  const isProcessing = processingWeeklyResponseKeys.has(responseKey);

                  return (
                  <li key={responseKey} className="priority-item weekly-response-item">
                    <input
                      type="checkbox"
                      className="priority-check"
                      checked={isProcessing}
                      disabled={isProcessing}
                      aria-label={`Marquer la réponse de ${athlete.name} comme traitée`}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => void markWeeklyResponseAsProcessed(athlete.key, response.timestamp)}
                    />
                    <div className="priority-main weekly-response-main">
                      <strong>
                        <Link href={`/crm/personnes/${athlete.key}`}>{athlete.name}</Link>
                      </strong>
                      {response.contactRequested ? <span className="priority-badge priority-urgent">Contact demandé</span> : null}
                      {isMeaningfulWeeklyValue(response.competition) ? <small>Compétition : {response.competition}</small> : null}
                      {isMeaningfulWeeklyValue(response.result) ? <small>Résultat : {response.result}</small> : null}
                      {isMeaningfulWeeklyValue(response.notableEvent) ? <small>Actualité : {response.notableEvent}</small> : null}
                      {isMeaningfulWeeklyValue(response.notableEventExplanation) ? <small>Explication : {response.notableEventExplanation}</small> : null}
                      {isMeaningfulWeeklyValue(response.media) ? <small>Média : {response.media}</small> : null}
                      {isMeaningfulWeeklyValue(response.mediaLink) ? <small>Lien : {response.mediaLink}</small> : null}
                      {isMeaningfulWeeklyValue(response.appointment) ? <small>Rendez-vous : {response.appointment}</small> : null}
                      {response.contactRequested && isMeaningfulWeeklyValue(response.quickContactReason) ? <small>Raison du contact : {response.quickContactReason}</small> : null}
                      {!hasUsefulWeeklyInformation(response) ? <small>Aucune actualité signalée</small> : null}
                      <small className="priority-date weekly-response-date">Réponse du {formatDate(new Date(responseTime).toISOString())}</small>
                    </div>
                  </li>
                  );
                })}
              </ul>
            ) : (
              <p>Aucun athlète n’a répondu cette semaine.</p>
            )}
            {weeklyResponseError ? <p style={{ color: "#b91c1c" }}>{weeklyResponseError}</p> : null}
          </Card>
        ) : null}

        {athletesAvailable ? (
          <Card className="workspace-dashboard-card card-priorities monthly-responses-card dashboard-monthly-card">
            <header className="dashboard-card-head">
              <h2>Réponses mensuelles</h2>
              <div className="dashboard-card-head-right">
                <span className="card-pill">{monthlyResponses.length} athlète{monthlyResponses.length === 1 ? "" : "s"}</span>
              </div>
            </header>

            {monthlyResponses.length > 0 ? (
              <ul className="priority-list monthly-responses-list">
                {monthlyResponses.map(({ athlete, response, responseTime, hasPriority }) => {
                  const responseKey = getWeeklyResponseKey(athlete.key, response.timestamp);
                  const isProcessing = processingMonthlyResponseKeys.has(responseKey);
                  const information = getMonthlyInformation(response);
                  const isExpanded = monthlyDetailOverrides[responseKey] ?? hasPriority;
                  const previewInformation = getMonthlyPreviewInformation(information);
                  const visibleInformation = isExpanded ? information : previewInformation;
                  const hasAdditionalInformation = information.length > previewInformation.length;

                  return (
                    <li key={responseKey} className={`priority-item weekly-response-item monthly-response-item${isExpanded ? " is-expanded" : ""}`}>
                      <input
                        type="checkbox"
                        className="priority-check"
                        checked={isProcessing}
                        disabled={isProcessing}
                        aria-label={`Marquer la réponse mensuelle de ${athlete.name} comme traitée`}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => void markMonthlyResponseAsProcessed(athlete.key, response.timestamp)}
                      />
                      <div className="priority-main weekly-response-main">
                        <div className="monthly-response-heading">
                          <strong>
                            <Link href={`/crm/personnes/${athlete.key}`}>{athlete.name}</Link>
                          </strong>
                          <small className="priority-date monthly-response-date">{formatDate(new Date(responseTime).toISOString())}</small>
                        </div>
                        <div className="monthly-response-information">
                          {visibleInformation.map((item) => <small key={item.label}><b>{item.label}</b> : {item.value}</small>)}
                        </div>
                        {information.length === 0 ? <small>Aucune information particulière</small> : null}
                        {hasAdditionalInformation ? (
                          <button
                            type="button"
                            className="monthly-response-toggle"
                            aria-expanded={isExpanded}
                            onClick={() => setMonthlyDetailOverrides((current) => ({ ...current, [responseKey]: !isExpanded }))}
                          >
                            {isExpanded ? "Masquer le détail" : "Voir le détail"}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>Aucune réponse mensuelle à traiter.</p>
            )}
            {monthlyResponseError ? <p style={{ color: "#b91c1c" }}>{monthlyResponseError}</p> : null}
          </Card>
        ) : null}

        {productionsAvailable ? (
          <Card className="workspace-dashboard-card card-projects dashboard-productions-card">
            <header className="dashboard-card-head">
              <h2>Productions</h2>
              <div className="dashboard-card-head-right">
                <span className="card-pill">{activeProductions.length} à finaliser</span>
              </div>
            </header>

            {activeProductions.length > 0 ? (
              <ul className="project-list">
                {activeProductions.slice(0, 4).map((shooting, index) => (
                  <li key={`${shooting.row ?? index}-${shooting.date}-${shooting.athlete}`} className="project-item">
                    <div className="project-main-row">
                      <span className="project-thumbnail" aria-hidden />
                      <div>
                        <strong>{normalize(shooting.athlete) || normalize(shooting.objective) || "Projet non renseigné"}</strong>
                        <small>{normalize(shooting.type) || "Type non renseigné"}</small>
                      </div>
                    </div>
                    <div className="project-meta-row">
                      <small>{ShootingService.stageFromChecklist(shooting)}</small>
                      <small>{formatDate(shooting.date)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aucune production à finaliser.</p>
            )}

            <Link href="/production" className="card-link-button">
              Ouvrir les productions
            </Link>
          </Card>
        ) : null}

        <Card className="workspace-dashboard-card card-activity dashboard-contents-card">
          <header className="dashboard-card-head">
            <h2>Contenus sauvegardes</h2>
            <div className="dashboard-card-head-right">
              <span className="card-pill">{savedDocuments.length} brouillons</span>
            </div>
          </header>

          {recentDocuments.length > 0 ? (
            <ul className="activity-list">
              {recentDocuments.map((document) => (
                <li key={document.id} className="activity-item">
                  <span className="activity-icon" aria-hidden>
                    {document.type.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="activity-content">
                    <p>{getDocumentTitle(document)}</p>
                    <small>{formatDate(document.updatedAt || document.createdAt)}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>Aucun contenu sauvegarde localement pour le moment.</p>
          )}

          <Link href="/contents" className="card-link-button">
            Ouvrir Contenus
          </Link>
        </Card>

        <Card className="workspace-dashboard-card card-events dashboard-shortcuts-card">
          <header className="dashboard-card-head">
            <h2>Raccourcis</h2>
          </header>

          <ul className="events-list">
            <li className="event-item">
              <span className="event-line" aria-hidden>
                <span className="event-dot" />
              </span>
              <div className="event-content">
                <strong>CRM Athletes</strong>
                <span>Gestion des personnes et statuts</span>
              </div>
              <Link href="/crm/personnes" className="card-link-button">Ouvrir</Link>
            </li>
            <li className="event-item">
              <span className="event-line" aria-hidden>
                <span className="event-dot" />
              </span>
              <div className="event-content">
                <strong>Productions</strong>
                <span>Suivi des shootings et livrables</span>
              </div>
              <Link href="/production" className="card-link-button">Ouvrir</Link>
            </li>
            <li className="event-item">
              <span className="event-line" aria-hidden>
                <span className="event-dot" />
              </span>
              <div className="event-content">
                <strong>Contenus</strong>
                <span>Assistant et documents editoriaux</span>
              </div>
              <Link href="/contents" className="card-link-button">Ouvrir</Link>
            </li>
          </ul>
        </Card>

        {!loading && !athletesAvailable && !productionsAvailable ? (
          <Card className="workspace-dashboard-card card-messages dashboard-sources-card">
            <header className="dashboard-card-head">
              <h2>Sources indisponibles</h2>
            </header>
            <p>Les blocs dependants des donnees CRM/Productions ont ete masques temporairement car les sources reelles ne sont pas disponibles.</p>
          </Card>
        ) : null}
      </section>
    </section>
  );
}
