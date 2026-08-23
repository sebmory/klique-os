"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input } from "@/src/design-system/components";
import { MEDIA_SUBSCRIPTION_PLANS, getMediaSubscriptionPlan } from "@/lib/media-subscriptions/plans";

type MediaAccount = {
  clerkUserId: string;
  email: string | null;
};

type CreditPeriod = {
  id: string;
  periodStart: string;
  periodEnd: string;
  creditsGranted: number;
};

type CreditState = {
  loading: boolean;
  errorMessage: string | null;
  period: CreditPeriod | null;
  balance: number;
};

type UsageOperation = {
  operation: string;
  totalEvents: number;
  totalTokens: number;
  estimatedCostMicroUsd: number;
};

type UsageState = {
  loading: boolean;
  errorMessage: string | null;
  totalEvents: number;
  totalTokens: number;
  estimatedCostMicroUsd: number;
  uncostedEvents: number;
  byOperation: UsageOperation[];
};

type MediaSubscription = {
  id: string;
  clerkUserId: string;
  planCode: string;
  status: string;
  billingProvider: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
};

const formatDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const formatCredits = (value: number): string => `${value} ${value > 1 ? "crédits" : "crédit"}`;

const formatNumber = (value: number): string => value.toLocaleString("fr-CH");

// Les couts sont stockes en microusd par le serveur; aucune tarification n est recalculee ici.
const formatMicroUsd = (value: number): string =>
  (value / 1_000_000).toLocaleString("fr-CH", { style: "currency", currency: "USD", maximumFractionDigits: 4 });

const operationLabels: Record<string, string> = {
  generate_interview: "Génération interview",
  generate_publication: "Génération publication",
  generate_reel: "Génération reel",
  publication_angles: "Angles éditoriaux",
  publication_regenerate_one: "Rerédaction d’une proposition",
  variation: "Déclinaison",
  external_context_search: "Recherche de contexte externe",
  external_web_search: "Recherche web",
  external_normalization: "Normalisation des sources",
};

const formatOperation = (operation: string): string => operationLabels[operation] ?? operation;

const periodErrorByStatus: Record<number, string> = {
  400: "Données invalides : vérifiez l’offre et les dates.",
  401: "Votre session a expiré. Reconnectez-vous puis réessayez.",
  403: "Seul un administrateur actif peut activer une offre.",
  409: "Offre incompatible avec la période de crédits existante.",
  500: "L’offre n’a pas pu être activée. Réessayez plus tard.",
};

const subscriptionStatusLabels: Record<string, string> = {
  trialing: "Essai",
  active: "Active",
  past_due: "Paiement en retard",
  canceled: "Annulée",
  expired: "Expirée",
};

const formatSubscriptionStatus = (status: string): string => subscriptionStatusLabels[status] ?? status;

const formatChf = (priceCents: number): string =>
  (priceCents / 100).toLocaleString("fr-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 2 });

const formatPlanOption = (planCode: string): string => {
  const plan = getMediaSubscriptionPlan(planCode);
  if (!plan) return planCode;
  return `${plan.label} — ${formatChf(plan.priceCentsChf)}/mois · ${formatCredits(plan.creditsPerPeriod)}`;
};

type PlanFormState = {
  planCode: string;
  periodStart: string;
  periodEnd: string;
};

const emptyPlanForm: PlanFormState = { planCode: MEDIA_SUBSCRIPTION_PLANS[0].code, periodStart: "", periodEnd: "" };

const adjustmentErrorByStatus: Record<number, string> = {
  400: "Ajustement invalide : vérifiez la quantité et la période active.",
  401: "Votre session a expiré. Reconnectez-vous puis réessayez.",
  403: "Seul un administrateur actif peut ajuster les crédits.",
  409: "Solde insuffisant pour ce retrait.",
  500: "L’ajustement n’a pas pu être appliqué. Réessayez plus tard.",
};

type AdjustmentFormState = {
  mode: "add" | "remove";
  amount: string;
};

const emptyAdjustmentForm: AdjustmentFormState = { mode: "add", amount: "" };

// L API attend un ISO complet; la date saisie est ancree a minuit UTC.
const toIsoDate = (value: string): string => `${value}T00:00:00.000Z`;

export function MediaCreditsSection() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [mediaAccounts, setMediaAccounts] = useState<MediaAccount[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [creditsByUser, setCreditsByUser] = useState<Record<string, CreditState>>({});
  const [usageByUser, setUsageByUser] = useState<Record<string, UsageState>>({});
  const [refreshToken, setRefreshToken] = useState(0);
  const [subscriptionsByUser, setSubscriptionsByUser] = useState<Record<string, MediaSubscription>>({});
  const [openFormFor, setOpenFormFor] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlanForm);
  const [periodSubmitting, setPeriodSubmitting] = useState(false);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [openAdjustmentFor, setOpenAdjustmentFor] = useState<string | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentFormState>(emptyAdjustmentForm);
  const [adjustmentSubmitting, setAdjustmentSubmitting] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadAccess = async () => {
      try {
        const response = await fetch("/api/clerk/access", { credentials: "include", cache: "no-store" });
        if (!response.ok) return;

        const payload = (await response.json()) as {
          permissions?: { isAdmin?: boolean | null; isActive?: boolean | null } | null;
        };

        if (!active) return;
        setIsAdmin(Boolean(payload?.permissions?.isAdmin && payload?.permissions?.isActive));
      } catch {
        if (active) setIsAdmin(false);
      }
    };

    void loadAccess();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    let active = true;

    const loadMedia = async () => {
      setListLoading(true);
      try {
        const response = await fetch("/api/media/access", { credentials: "include", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; media?: MediaAccount[]; message?: string }
          | null;

        if (!active) return;

        if (!response.ok || !payload?.ok || !Array.isArray(payload.media)) {
          setListError(payload?.message || "Impossible de charger les médias actifs.");
          setMediaAccounts([]);
          return;
        }

        setListError(null);
        setMediaAccounts(payload.media);
      } catch {
        if (active) {
          setListError("Impossible de charger les médias actifs.");
          setMediaAccounts([]);
        }
      } finally {
        if (active) setListLoading(false);
      }
    };

    void loadMedia();

    return () => {
      active = false;
    };
  }, [isAdmin, refreshToken]);

  useEffect(() => {
    if (!isAdmin) return;

    let active = true;

    const loadSubscriptions = async () => {
      try {
        const response = await fetch("/api/media-subscriptions", { credentials: "include", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; subscriptions?: MediaSubscription[] }
          | null;

        if (!active) return;

        if (!response.ok || !payload?.ok || !Array.isArray(payload.subscriptions)) {
          setSubscriptionsByUser({});
          return;
        }

        const indexed: Record<string, MediaSubscription> = {};
        for (const subscription of payload.subscriptions) {
          indexed[subscription.clerkUserId] = subscription;
        }
        setSubscriptionsByUser(indexed);
      } catch {
        if (active) setSubscriptionsByUser({});
      }
    };

    void loadSubscriptions();

    return () => {
      active = false;
    };
  }, [isAdmin, refreshToken]);

  useEffect(() => {
    if (!isAdmin || mediaAccounts.length === 0) return;

    let active = true;

    const loadBalances = async () => {
      for (const account of mediaAccounts) {
        if (!active) return;

        setCreditsByUser((current) => ({
          ...current,
          [account.clerkUserId]: { loading: true, errorMessage: null, period: null, balance: 0 },
        }));

        try {
          const response = await fetch(
            `/api/ai-credits/balance?clerkUserId=${encodeURIComponent(account.clerkUserId)}`,
            { credentials: "include", cache: "no-store" },
          );
          const payload = (await response.json().catch(() => null)) as
            | { ok?: boolean; period?: CreditPeriod | null; balance?: number; message?: string }
            | null;

          if (!active) return;

          if (!response.ok || !payload?.ok) {
            setCreditsByUser((current) => ({
              ...current,
              [account.clerkUserId]: {
                loading: false,
                errorMessage: payload?.message || "Solde indisponible.",
                period: null,
                balance: 0,
              },
            }));
            continue;
          }

          setCreditsByUser((current) => ({
            ...current,
            [account.clerkUserId]: {
              loading: false,
              errorMessage: null,
              period: payload.period ?? null,
              balance: typeof payload.balance === "number" ? payload.balance : 0,
            },
          }));
        } catch {
          if (!active) return;
          setCreditsByUser((current) => ({
            ...current,
            [account.clerkUserId]: { loading: false, errorMessage: "Solde indisponible.", period: null, balance: 0 },
          }));
        }
      }
    };

    void loadBalances();

    return () => {
      active = false;
    };
  }, [isAdmin, mediaAccounts]);

  // Signature stable des periodes actives pour eviter de relancer l usage a chaque mise a jour de solde.
  const activePeriodSignature = useMemo(
    () =>
      mediaAccounts
        .map((account) => {
          const period = creditsByUser[account.clerkUserId]?.period;
          return period ? `${account.clerkUserId}|${period.periodStart}|${period.periodEnd}` : "";
        })
        .filter(Boolean)
        .join(";"),
    [mediaAccounts, creditsByUser],
  );

  useEffect(() => {
    if (!isAdmin || !activePeriodSignature) return;

    let active = true;

    const loadUsage = async () => {
      const entries = activePeriodSignature.split(";").map((entry) => entry.split("|"));

      for (const [clerkUserId, periodStart, periodEnd] of entries) {
        if (!active) return;

        setUsageByUser((current) => ({
          ...current,
          [clerkUserId]: { loading: true, errorMessage: null, totalEvents: 0, totalTokens: 0, estimatedCostMicroUsd: 0, uncostedEvents: 0, byOperation: [] },
        }));

        try {
          const params = new URLSearchParams({ clerkUserId, from: periodStart, to: periodEnd });
          const response = await fetch(`/api/ai-usage/summary?${params.toString()}`, {
            credentials: "include",
            cache: "no-store",
          });
          const payload = (await response.json().catch(() => null)) as
            | {
                ok?: boolean;
                message?: string;
                summary?: {
                  totalEvents?: number;
                  totalTokens?: number;
                  estimatedCostMicroUsd?: number;
                  uncostedEvents?: number;
                  byOperation?: UsageOperation[];
                };
              }
            | null;

          if (!active) return;

          if (!response.ok || !payload?.ok || !payload.summary) {
            setUsageByUser((current) => ({
              ...current,
              [clerkUserId]: {
                loading: false,
                errorMessage: payload?.message || "Consommation indisponible.",
                totalEvents: 0,
                totalTokens: 0,
                estimatedCostMicroUsd: 0,
                uncostedEvents: 0,
                byOperation: [],
              },
            }));
            continue;
          }

          setUsageByUser((current) => ({
            ...current,
            [clerkUserId]: {
              loading: false,
              errorMessage: null,
              totalEvents: payload.summary?.totalEvents ?? 0,
              totalTokens: payload.summary?.totalTokens ?? 0,
              estimatedCostMicroUsd: payload.summary?.estimatedCostMicroUsd ?? 0,
              uncostedEvents: payload.summary?.uncostedEvents ?? 0,
              byOperation: Array.isArray(payload.summary?.byOperation) ? payload.summary.byOperation : [],
            },
          }));
        } catch {
          if (!active) return;
          setUsageByUser((current) => ({
            ...current,
            [clerkUserId]: {
              loading: false,
              errorMessage: "Consommation indisponible.",
              totalEvents: 0,
              totalTokens: 0,
              estimatedCostMicroUsd: 0,
              uncostedEvents: 0,
              byOperation: [],
            },
          }));
        }
      }
    };

    void loadUsage();

    return () => {
      active = false;
    };
  }, [isAdmin, activePeriodSignature, refreshToken]);

  if (!isAdmin) {
    return null;
  }

  const openPlanForm = (clerkUserId: string, initialPlanCode?: string) => {
    setOpenFormFor(clerkUserId);
    setOpenAdjustmentFor(null);
    setPlanForm({
      ...emptyPlanForm,
      planCode: initialPlanCode && getMediaSubscriptionPlan(initialPlanCode) ? initialPlanCode : emptyPlanForm.planCode,
    });
    setPeriodError(null);
  };

  const closePlanForm = () => {
    setOpenFormFor(null);
    setPlanForm(emptyPlanForm);
    setPeriodError(null);
  };

  const submitPlan = async (
    event: React.FormEvent<HTMLFormElement>,
    clerkUserId: string,
    existingCreditPeriodId: string | null,
  ) => {
    event.preventDefault();
    setPeriodError(null);

    if (!getMediaSubscriptionPlan(planForm.planCode)) {
      setPeriodError("Sélectionnez une offre valide.");
      return;
    }

    if (!existingCreditPeriodId) {
      if (!planForm.periodStart || !planForm.periodEnd) {
        setPeriodError("Renseignez une date de début et une date de fin.");
        return;
      }

      if (Date.parse(toIsoDate(planForm.periodStart)) >= Date.parse(toIsoDate(planForm.periodEnd))) {
        setPeriodError("La date de début doit être antérieure à la date de fin.");
        return;
      }
    }

    setPeriodSubmitting(true);

    try {
      const response = await fetch("/api/media-subscriptions/manual", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          existingCreditPeriodId
            ? { clerkUserId, planCode: planForm.planCode, existingCreditPeriodId }
            : {
                clerkUserId,
                planCode: planForm.planCode,
                periodStart: toIsoDate(planForm.periodStart),
                periodEnd: toIsoDate(planForm.periodEnd),
              },
        ),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setPeriodError(payload?.message || periodErrorByStatus[response.status] || "L’offre n’a pas pu être activée.");
        return;
      }

      closePlanForm();
      setRefreshToken((current) => current + 1);
    } catch {
      setPeriodError("L’offre n’a pas pu être activée. Vérifiez votre connexion.");
    } finally {
      setPeriodSubmitting(false);
    }
  };

  const openAdjustmentForm = (clerkUserId: string) => {
    setOpenAdjustmentFor(clerkUserId);
    setOpenFormFor(null);
    setAdjustmentForm(emptyAdjustmentForm);
    setAdjustmentError(null);
  };

  const closeAdjustmentForm = () => {
    setOpenAdjustmentFor(null);
    setAdjustmentForm(emptyAdjustmentForm);
    setAdjustmentError(null);
  };

  const submitAdjustment = async (event: React.FormEvent<HTMLFormElement>, clerkUserId: string, currentBalance: number) => {
    event.preventDefault();
    setAdjustmentError(null);

    const amount = Number(adjustmentForm.amount);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
      setAdjustmentError("La quantité doit être un entier strictement positif.");
      return;
    }

    if (adjustmentForm.mode === "remove" && amount > currentBalance) {
      setAdjustmentError("Le retrait ne peut pas dépasser le solde actuel.");
      return;
    }

    setAdjustmentSubmitting(true);

    try {
      const response = await fetch("/api/ai-credits/adjustments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clerkUserId,
          creditDelta: adjustmentForm.mode === "add" ? amount : -amount,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setAdjustmentError(payload?.message || adjustmentErrorByStatus[response.status] || "L’ajustement n’a pas pu être appliqué.");
        return;
      }

      closeAdjustmentForm();
      setRefreshToken((current) => current + 1);
    } catch {
      setAdjustmentError("L’ajustement n’a pas pu être appliqué. Vérifiez votre connexion.");
    } finally {
      setAdjustmentSubmitting(false);
    }
  };

  return (
    <Card style={{ padding: "1.15rem", display: "grid", gap: "0.9rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
      <div>
        <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>
          ACCÈS MÉDIAS
        </p>
        <h2 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.2rem", color: "#111827" }}>Crédits IA</h2>
        <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.6, maxWidth: "70ch" }}>
          Consultation du solde de crédits IA de chaque média actif du workspace.
        </p>
      </div>

      {listLoading ? <p style={{ margin: 0, color: "#6b7280" }}>Chargement des médias actifs…</p> : null}

      {listError ? (
        <p role="alert" style={{ margin: 0, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", padding: "0.7rem 0.85rem" }}>
          {listError}
        </p>
      ) : null}

      {!listLoading && !listError && mediaAccounts.length === 0 ? (
        <p style={{ margin: 0, color: "#6b7280" }}>Aucun média actif dans ce workspace.</p>
      ) : null}

      <div style={{ display: "grid", gap: "0.7rem" }}>
        {mediaAccounts.map((account) => {
          const credits = creditsByUser[account.clerkUserId];
          const usage = usageByUser[account.clerkUserId];
          const subscription = subscriptionsByUser[account.clerkUserId] ?? null;
          const subscriptionPlan = subscription ? getMediaSubscriptionPlan(subscription.planCode) : null;
          const canRenewManually = subscription?.billingProvider === "manual" && !credits?.period;

          return (
            <div
              key={account.clerkUserId}
              style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.85rem 0.95rem", display: "grid", gap: "0.45rem" }}
            >
              <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>{account.email || account.clerkUserId}</p>

              {subscription ? (
                <dl style={{ margin: 0, display: "grid", gap: "0.25rem", color: "#374151", fontSize: "0.9rem" }}>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <dt style={{ color: "#6b7280" }}>Offre :</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>
                      {subscriptionPlan?.label ?? subscription.planCode} · {formatSubscriptionStatus(subscription.status)}
                    </dd>
                  </div>
                  {subscriptionPlan ? (
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <dt style={{ color: "#6b7280" }}>Tarif :</dt>
                      <dd style={{ margin: 0, fontWeight: 600 }}>
                        {formatChf(subscriptionPlan.priceCentsChf)}/mois · {formatCredits(subscriptionPlan.creditsPerPeriod)} par période
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              {!credits || credits.loading ? (
                <p style={{ margin: 0, color: "#6b7280" }}>Chargement du solde…</p>
              ) : credits.errorMessage ? (
                <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{credits.errorMessage}</p>
              ) : credits.period ? (
                <dl style={{ margin: 0, display: "grid", gap: "0.25rem", color: "#374151", fontSize: "0.9rem" }}>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <dt style={{ color: "#6b7280" }}>Crédits disponibles :</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{formatCredits(credits.balance)}</dd>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <dt style={{ color: "#6b7280" }}>Crédits accordés :</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{formatCredits(credits.period.creditsGranted)}</dd>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <dt style={{ color: "#6b7280" }}>Période :</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>
                      {formatDate(credits.period.periodStart)} – {formatDate(credits.period.periodEnd)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p style={{ margin: 0, color: "#6b7280" }}>Aucune période active</p>
              )}

              {credits && !credits.loading && !credits.errorMessage && credits.period ? (
                <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "0.5rem", display: "grid", gap: "0.3rem" }}>
                  <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6b7280" }}>
                    Consommation IA de la période
                  </p>

                  {!usage || usage.loading ? (
                    <p style={{ margin: 0, color: "#6b7280" }}>Chargement de la consommation…</p>
                  ) : usage.errorMessage ? (
                    <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{usage.errorMessage}</p>
                  ) : usage.totalEvents === 0 ? (
                    <p style={{ margin: 0, color: "#6b7280" }}>Aucun événement IA sur cette période.</p>
                  ) : (
                    <dl style={{ margin: 0, display: "grid", gap: "0.25rem", color: "#374151", fontSize: "0.9rem" }}>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <dt style={{ color: "#6b7280" }}>Événements IA :</dt>
                        <dd style={{ margin: 0, fontWeight: 600 }}>{formatNumber(usage.totalEvents)}</dd>
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <dt style={{ color: "#6b7280" }}>Tokens :</dt>
                        <dd style={{ margin: 0, fontWeight: 600 }}>{formatNumber(usage.totalTokens)}</dd>
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <dt style={{ color: "#6b7280" }}>Coût estimé :</dt>
                        <dd style={{ margin: 0, fontWeight: 600 }}>{formatMicroUsd(usage.estimatedCostMicroUsd)}</dd>
                      </div>
                      {usage.uncostedEvents > 0 ? (
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <dt style={{ color: "#6b7280" }}>Événements sans coût :</dt>
                          <dd style={{ margin: 0, fontWeight: 600 }}>{formatNumber(usage.uncostedEvents)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  )}

                  {usage && !usage.loading && !usage.errorMessage && usage.byOperation.length > 0 ? (
                    <ul style={{ margin: "0.15rem 0 0", padding: 0, listStyle: "none", display: "grid", gap: "0.15rem" }}>
                      {usage.byOperation.map((entry) => (
                        <li
                          key={entry.operation}
                          style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", color: "#374151", fontSize: "0.85rem" }}
                        >
                          <span style={{ fontWeight: 600 }}>{formatOperation(entry.operation)}</span>
                          <span style={{ color: "#6b7280" }}>
                            {formatNumber(entry.totalEvents)} évt · {formatNumber(entry.totalTokens)} tokens ·{" "}
                            {formatMicroUsd(entry.estimatedCostMicroUsd)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {credits && !credits.loading && !credits.errorMessage && credits.period ? (
                openAdjustmentFor === account.clerkUserId ? (
                  <form
                    onSubmit={(event) => submitAdjustment(event, account.clerkUserId, credits.balance)}
                    style={{ display: "grid", gap: "0.5rem", borderTop: "1px solid #e5e7eb", paddingTop: "0.5rem" }}
                    noValidate
                  >
                    <div style={{ display: "flex", gap: "0.9rem", color: "#374151", fontSize: "0.85rem", fontWeight: 600 }}>
                      <label style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                        <input
                          type="radio"
                          name={`adjustment-mode-${account.clerkUserId}`}
                          checked={adjustmentForm.mode === "add"}
                          onChange={() => setAdjustmentForm((current) => ({ ...current, mode: "add" }))}
                          disabled={adjustmentSubmitting}
                        />
                        <span>Ajouter</span>
                      </label>
                      <label style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                        <input
                          type="radio"
                          name={`adjustment-mode-${account.clerkUserId}`}
                          checked={adjustmentForm.mode === "remove"}
                          onChange={() => setAdjustmentForm((current) => ({ ...current, mode: "remove" }))}
                          disabled={adjustmentSubmitting}
                        />
                        <span>Retirer</span>
                      </label>
                    </div>

                    <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.85rem", fontWeight: 600, maxWidth: "280px" }}>
                      <span>Quantité</span>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={adjustmentForm.amount}
                        onChange={(event) => setAdjustmentForm((current) => ({ ...current, amount: event.target.value }))}
                        disabled={adjustmentSubmitting}
                        style={{ width: "100%", borderRadius: "14px" }}
                      />
                    </label>

                    <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>
                      Solde actuel : {formatCredits(credits.balance)} · Solde estimé :{" "}
                      {formatCredits(
                        Math.max(
                          0,
                          credits.balance +
                            (adjustmentForm.mode === "add" ? 1 : -1) * (Number.isFinite(Number(adjustmentForm.amount)) ? Number(adjustmentForm.amount) : 0),
                        ),
                      )}
                    </p>

                    {adjustmentError ? (
                      <p role="alert" style={{ margin: 0, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", padding: "0.6rem 0.75rem" }}>
                        {adjustmentError}
                      </p>
                    ) : null}

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <Button
                        type="submit"
                        disabled={adjustmentSubmitting}
                        style={{
                          borderRadius: "999px",
                          padding: "0.55rem 0.95rem",
                          background: "linear-gradient(135deg, #111827 0%, #374151 100%)",
                          color: "#fff",
                          border: "1px solid #111827",
                          fontWeight: 700,
                          opacity: adjustmentSubmitting ? 0.7 : 1,
                          cursor: adjustmentSubmitting ? "not-allowed" : "pointer",
                        }}
                      >
                        {adjustmentSubmitting ? "Ajustement…" : "Confirmer"}
                      </Button>
                      <Button
                        type="button"
                        onClick={closeAdjustmentForm}
                        disabled={adjustmentSubmitting}
                        style={{
                          borderRadius: "999px",
                          padding: "0.55rem 0.95rem",
                          background: "#fff",
                          color: "#374151",
                          border: "1px solid #d1d5db",
                          fontWeight: 600,
                        }}
                      >
                        Annuler
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <Button
                      type="button"
                      onClick={() => openAdjustmentForm(account.clerkUserId)}
                      style={{
                        borderRadius: "999px",
                        padding: "0.55rem 0.95rem",
                        background: "#fff",
                        color: "#111827",
                        border: "1px solid #d1d5db",
                        fontWeight: 700,
                      }}
                    >
                      Ajuster les crédits
                    </Button>
                  </div>
                )
              ) : null}

              {credits && !credits.loading && !credits.errorMessage && (!subscription || canRenewManually) ? (
                openFormFor === account.clerkUserId ? (
                  <form
                    onSubmit={(event) => submitPlan(event, account.clerkUserId, credits.period?.id ?? null)}
                    style={{ display: "grid", gap: "0.6rem" }}
                    noValidate
                  >
                    <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.85rem", fontWeight: 600, maxWidth: "360px" }}>
                      <span>Offre</span>
                      <select
                        value={planForm.planCode}
                        onChange={(event) => setPlanForm((current) => ({ ...current, planCode: event.target.value }))}
                        disabled={periodSubmitting}
                        style={{ width: "100%", borderRadius: "14px", padding: "0.55rem 0.7rem", border: "1px solid #d1d5db" }}
                      >
                        {MEDIA_SUBSCRIPTION_PLANS.map((plan) => (
                          <option key={plan.code} value={plan.code}>
                            {formatPlanOption(plan.code)}
                          </option>
                        ))}
                      </select>
                    </label>

                    {getMediaSubscriptionPlan(planForm.planCode) ? (
                      <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>
                        {formatChf(getMediaSubscriptionPlan(planForm.planCode)!.priceCentsChf)}/mois ·{" "}
                        {formatCredits(getMediaSubscriptionPlan(planForm.planCode)!.creditsPerPeriod)} par période
                      </p>
                    ) : null}

                    {credits.period ? (
                      <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>
                        Période de crédits existante : {formatDate(credits.period.periodStart)} – {formatDate(credits.period.periodEnd)} ·{" "}
                        {formatCredits(credits.period.creditsGranted)}
                      </p>
                    ) : (
                      <>
                        <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.85rem", fontWeight: 600, maxWidth: "280px" }}>
                          <span>Date de début</span>
                          <Input
                            type="date"
                            value={planForm.periodStart}
                            onChange={(event) => setPlanForm((current) => ({ ...current, periodStart: event.target.value }))}
                            disabled={periodSubmitting}
                            style={{ width: "100%", borderRadius: "14px" }}
                          />
                        </label>

                        <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.85rem", fontWeight: 600, maxWidth: "280px" }}>
                          <span>Date de fin</span>
                          <Input
                            type="date"
                            value={planForm.periodEnd}
                            onChange={(event) => setPlanForm((current) => ({ ...current, periodEnd: event.target.value }))}
                            disabled={periodSubmitting}
                            style={{ width: "100%", borderRadius: "14px" }}
                          />
                        </label>
                      </>
                    )}

                    {periodError ? (
                      <p role="alert" style={{ margin: 0, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", padding: "0.6rem 0.75rem" }}>
                        {periodError}
                      </p>
                    ) : null}

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <Button
                        type="submit"
                        disabled={periodSubmitting}
                        style={{
                          borderRadius: "999px",
                          padding: "0.55rem 0.95rem",
                          background: "linear-gradient(135deg, #111827 0%, #374151 100%)",
                          color: "#fff",
                          border: "1px solid #111827",
                          fontWeight: 700,
                          opacity: periodSubmitting ? 0.7 : 1,
                          cursor: periodSubmitting ? "not-allowed" : "pointer",
                        }}
                      >
                        {periodSubmitting ? "Activation…" : "Confirmer"}
                      </Button>
                      <Button
                        type="button"
                        onClick={closePlanForm}
                        disabled={periodSubmitting}
                        style={{
                          borderRadius: "999px",
                          padding: "0.55rem 0.95rem",
                          background: "#fff",
                          color: "#374151",
                          border: "1px solid #d1d5db",
                          fontWeight: 600,
                        }}
                      >
                        Annuler
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <Button
                      type="button"
                      onClick={() => openPlanForm(account.clerkUserId, subscription?.planCode)}
                      style={{
                        borderRadius: "999px",
                        padding: "0.55rem 0.95rem",
                        background: "#fff",
                        color: "#111827",
                        border: "1px solid #d1d5db",
                        fontWeight: 700,
                      }}
                    >
                      {subscription ? "Renouveler ou changer l’offre" : credits.period ? "Associer une offre" : "Activer une offre"}
                    </Button>
                  </div>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
