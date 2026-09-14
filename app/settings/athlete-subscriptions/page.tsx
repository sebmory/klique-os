"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, CalendarDays, CircleX, FileText, UserRoundCheck } from "lucide-react";
import {
  ATHLETE_CONTENT_FORMATS,
  ATHLETE_SUBSCRIPTION_FOUNDER_PLAN,
  ATHLETE_SUBSCRIPTION_PLANS,
} from "@/lib/athlete-subscription-catalog";
import type {
  AthleteSubscriptionContentRequest,
  AthleteSubscriptionContentRequestStatus,
} from "@/lib/athlete-subscription-content-requests/service";
import type {
  AthleteSubscription,
  AthleteSubscriptionAssignmentPlanCode,
  BulkFounderAssignmentResult,
} from "@/lib/athlete-subscriptions/service";
import type { Athlete, AthletesResponse } from "@/types/athlete";
import { Button, Card, Input, Select, Textarea } from "@/src/design-system/components";

type SubscriptionsResponse = {
  subscriptions?: AthleteSubscription[];
  error?: string;
};

type ContentRequestsResponse = {
  requests?: AthleteSubscriptionContentRequest[];
  request?: AthleteSubscriptionContentRequest;
  error?: string;
};

type FormState = {
  athleteId: string;
  planCode: AthleteSubscriptionAssignmentPlanCode;
  startsOn: string;
  endsOn: string;
  isFounder: boolean;
  isComplimentary: boolean;
};

type BulkFounderDraft = {
  startsOn: string;
  endsOn: string;
};

const today = (): string => new Date().toISOString().slice(0, 10);

const addOneYear = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  const year = Number(match[1]) + 1;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};

const toDateInputValue = (value: string): string => {
  const normalized = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(normalized);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const localMatch = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(normalized);
  return localMatch ? `${localMatch[3]}-${localMatch[2]}-${localMatch[1]}` : "";
};

const initialStartDate = today();
const initialForm: FormState = {
  athleteId: "",
  planCode: "essential",
  startsOn: initialStartDate,
  endsOn: addOneYear(initialStartDate),
  isFounder: false,
  isComplimentary: false,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  color: "#374151",
  fontSize: "0.9rem",
  fontWeight: 600,
};

const controlStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "8px",
};

const formatDate = (value: string): string => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
};

const formatPrice = (value: number): string =>
  new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 0,
  }).format(value);

const statusLabels: Record<AthleteSubscription["status"], string> = {
  active: "Actif",
  expired: "Expiré",
  cancelled: "Annulé",
};

const contentRequestStatusLabels: Record<AthleteSubscriptionContentRequestStatus, string> = {
  requested: "Demandé",
  accepted: "Accepté",
  in_progress: "En cours",
  completed: "Terminé",
  declined: "Refusé",
  cancelled: "Annulé",
};

type ContentRequestAction = {
  status: AthleteSubscriptionContentRequestStatus;
  label: string;
};

const contentRequestActions: Partial<Record<AthleteSubscriptionContentRequestStatus, readonly ContentRequestAction[]>> = {
  requested: [
    { status: "accepted", label: "Accepter" },
    { status: "declined", label: "Refuser" },
    { status: "cancelled", label: "Annuler" },
  ],
  accepted: [
    { status: "in_progress", label: "Démarrer" },
    { status: "declined", label: "Refuser" },
    { status: "cancelled", label: "Annuler" },
  ],
  in_progress: [
    { status: "completed", label: "Terminer" },
    { status: "cancelled", label: "Annuler" },
  ],
};

const formatTimestamp = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("fr-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const errorMessageFrom = async (response: Response, fallback: string): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || fallback;
};

export default function AthleteSubscriptionsSettingsPage() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [subscriptions, setSubscriptions] = useState<AthleteSubscription[]>([]);
  const [contentRequests, setContentRequests] = useState<AthleteSubscriptionContentRequest[]>([]);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>(initialForm);
  const [bulkFounderDrafts, setBulkFounderDrafts] = useState<Record<string, BulkFounderDraft>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [transitioningRequestId, setTransitioningRequestId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkFounderAssignmentResult | null>(null);
  const [contentActionError, setContentActionError] = useState<string | null>(null);
  const [contentSuccessMessage, setContentSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [athletesResponse, subscriptionsResponse, contentRequestsResponse] = await Promise.all([
          fetch("/api/athletes", { credentials: "include", cache: "no-store" }),
          fetch("/api/admin/athlete-subscriptions", { credentials: "include", cache: "no-store" }),
          fetch("/api/admin/athlete-subscription-content-requests", { credentials: "include", cache: "no-store" }),
        ]);
        if (!athletesResponse.ok) {
          throw new Error(await errorMessageFrom(athletesResponse, "Impossible de charger les athlètes."));
        }
        if (!subscriptionsResponse.ok) {
          throw new Error(await errorMessageFrom(subscriptionsResponse, "Impossible de charger les abonnements."));
        }
        if (!contentRequestsResponse.ok) {
          throw new Error(await errorMessageFrom(contentRequestsResponse, "Impossible de charger les demandes de contenus personnalisés."));
        }

        const athletesPayload = (await athletesResponse.json()) as AthletesResponse;
        const subscriptionsPayload = (await subscriptionsResponse.json()) as SubscriptionsResponse;
        const contentRequestsPayload = (await contentRequestsResponse.json()) as ContentRequestsResponse;
        if (!active) return;
        setAthletes(Array.isArray(athletesPayload.athletes) ? athletesPayload.athletes : []);
        setSubscriptions(Array.isArray(subscriptionsPayload.subscriptions) ? subscriptionsPayload.subscriptions : []);
        setContentRequests(Array.isArray(contentRequestsPayload.requests) ? contentRequestsPayload.requests : []);
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Impossible de charger les abonnements Athlètes.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const athleteNames = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.key, athlete.name])),
    [athletes],
  );
  const activeAthleteIds = useMemo(
    () => new Set(subscriptions.filter(({ status }) => status === "active").map(({ athleteId }) => athleteId)),
    [subscriptions],
  );
  const eligibleFounderAthletes = useMemo(
    () => athletes.filter(({ key }) => !activeAthleteIds.has(key)),
    [activeAthleteIds, athletes],
  );
  const founderSelected = form.planCode === ATHLETE_SUBSCRIPTION_FOUNDER_PLAN.code;

  const setStartDate = (startsOn: string) => {
    setForm((current) => ({ ...current, startsOn, endsOn: addOneYear(startsOn) }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    setSuccessMessage(null);
    if (!form.athleteId || !form.startsOn || !form.endsOn) {
      setActionError("Complétez l’athlète, la date de début et la date de fin.");
      return;
    }
    if (form.endsOn <= form.startsOn) {
      setActionError("La date de fin doit être postérieure à la date de début.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/athlete-subscriptions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        setActionError(await errorMessageFrom(response, "L’abonnement n’a pas pu être attribué."));
        return;
      }
      const payload = (await response.json()) as { subscription?: AthleteSubscription };
      if (!payload.subscription) throw new Error("Réponse d’attribution incomplète.");
      setSubscriptions((current) => [payload.subscription!, ...current]);
      setSuccessMessage(`Abonnement ${statusLabels[payload.subscription.status].toLowerCase()} attribué avec succès.`);
      setForm((current) => ({
        ...current,
        athleteId: "",
        isFounder: current.planCode === ATHLETE_SUBSCRIPTION_FOUNDER_PLAN.code,
        isComplimentary: current.planCode === ATHLETE_SUBSCRIPTION_FOUNDER_PLAN.code,
      }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "L’abonnement n’a pas pu être attribué.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (subscription: AthleteSubscription) => {
    const athleteName = athleteNames.get(subscription.athleteId) ?? subscription.athleteId;
    if (!window.confirm(`Annuler l’abonnement actif de ${athleteName} ?`)) return;

    setActionError(null);
    setSuccessMessage(null);
    setCancellingId(subscription.id);
    try {
      const response = await fetch("/api/admin/athlete-subscriptions", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", subscriptionId: subscription.id }),
      });
      if (!response.ok) {
        setActionError(await errorMessageFrom(response, "L’abonnement n’a pas pu être annulé."));
        return;
      }
      const payload = (await response.json()) as { subscription?: AthleteSubscription };
      if (!payload.subscription) throw new Error("Réponse d’annulation incomplète.");
      setSubscriptions((current) => current.map((item) => (
        item.id === payload.subscription!.id ? payload.subscription! : item
      )));
      setSuccessMessage(`Abonnement de ${athleteName} annulé.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "L’abonnement n’a pas pu être annulé.");
    } finally {
      setCancellingId(null);
    }
  };

  const toggleBulkFounderAthlete = (athlete: Athlete, checked: boolean) => {
    setBulkFounderDrafts((current) => {
      if (!checked) {
        const next = { ...current };
        delete next[athlete.key];
        return next;
      }
      const startsOn = toDateInputValue(athlete.adhesionDate);
      return { ...current, [athlete.key]: { startsOn, endsOn: addOneYear(startsOn) } };
    });
    setBulkError(null);
    setBulkResult(null);
  };

  const updateBulkFounderDate = (
    athleteId: string,
    field: keyof BulkFounderDraft,
    value: string,
  ) => {
    setBulkFounderDrafts((current) => ({
      ...current,
      [athleteId]: {
        ...current[athleteId],
        [field]: value,
        ...(field === "startsOn" ? { endsOn: addOneYear(value) } : {}),
      },
    }));
  };

  const handleBulkFounderSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBulkError(null);
    setBulkResult(null);
    const assignments = Object.entries(bulkFounderDrafts).map(([athleteId, dates]) => ({
      athleteId,
      ...dates,
    }));
    if (assignments.length === 0) {
      setBulkError("Sélectionnez au moins un athlète.");
      return;
    }
    const missingDateNames = assignments
      .filter(({ startsOn, endsOn }) => !startsOn || !endsOn)
      .map(({ athleteId }) => athleteNames.get(athleteId) ?? athleteId);
    if (missingDateNames.length > 0) {
      setBulkError(`Date d’adhésion manquante pour : ${missingDateNames.join(", ")}.`);
      return;
    }

    setBulkSubmitting(true);
    try {
      const response = await fetch("/api/admin/athlete-subscriptions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_founder", assignments }),
      });
      if (!response.ok) {
        setBulkError(await errorMessageFrom(response, "L’attribution groupée a échoué."));
        return;
      }
      const result = (await response.json()) as BulkFounderAssignmentResult;
      setSubscriptions((current) => [...result.created, ...current]);
      setBulkFounderDrafts({});
      setBulkResult(result);
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "L’attribution groupée a échoué.");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleContentRequestAction = async (
    contentRequest: AthleteSubscriptionContentRequest,
    status: AthleteSubscriptionContentRequestStatus,
  ) => {
    setContentActionError(null);
    setContentSuccessMessage(null);
    setTransitioningRequestId(contentRequest.id);
    try {
      const adminNote = adminNotes[contentRequest.id]?.trim();
      const response = await fetch("/api/admin/athlete-subscription-content-requests", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: contentRequest.id,
          status,
          ...(adminNote ? { adminNote } : {}),
        }),
      });
      if (!response.ok) {
        setContentActionError(await errorMessageFrom(response, "La demande n’a pas pu être mise à jour."));
        return;
      }
      const payload = (await response.json()) as ContentRequestsResponse;
      if (!payload.request) throw new Error("Réponse de mise à jour incomplète.");
      setContentRequests((current) => current.map((item) => (
        item.id === payload.request!.id ? payload.request! : item
      )));
      setAdminNotes((current) => ({ ...current, [contentRequest.id]: "" }));
      setContentSuccessMessage(`Demande mise à jour : ${contentRequestStatusLabels[payload.request.status]}.`);
    } catch (error) {
      setContentActionError(error instanceof Error ? error.message : "La demande n’a pas pu être mise à jour.");
    } finally {
      setTransitioningRequestId(null);
    }
  };

  return (
    <section style={{ display: "grid", gap: "1.25rem", maxWidth: "1180px", margin: "0 auto", padding: "0.5rem 0 2rem" }}>
      <header style={{ display: "grid", gap: "0.45rem" }}>
        <Link href="/settings" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "#6b7280", textDecoration: "none", width: "fit-content", fontSize: "0.88rem" }}>
          <ArrowLeft size={16} aria-hidden="true" /> Paramètres
        </Link>
        <div>
          <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "#6b7280" }}>
            ABONNEMENTS ATHLÈTES
          </p>
          <h1 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.45rem", color: "#111827" }}>Gérer les abonnements</h1>
          <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.6 }}>
            Attribuez les offres annuelles et suivez leur statut pour chaque athlète.
          </p>
        </div>
      </header>

      <Card style={{ padding: "1.15rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)", display: "grid", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <UserRoundCheck size={20} color="#9a6a22" aria-hidden="true" />
          <h2 style={{ margin: 0, fontSize: "1.15rem", color: "#111827" }}>Attribuer un abonnement</h2>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display: "grid", gap: "0.9rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.85rem" }}>
            <label style={fieldStyle}>
              <span>Athlète</span>
              <Select required value={form.athleteId} onChange={(event) => setForm((current) => ({ ...current, athleteId: event.target.value }))} disabled={loading || submitting} style={controlStyle}>
                <option value="">Sélectionner un athlète</option>
                {athletes.map((athlete) => <option key={athlete.key} value={athlete.key}>{athlete.name}</option>)}
              </Select>
            </label>

            <label style={fieldStyle}>
              <span>Abonnement</span>
              <Select
                required
                value={form.planCode}
                onChange={(event) => {
                  const planCode = event.target.value as AthleteSubscriptionAssignmentPlanCode;
                  const isFounderPlan = planCode === ATHLETE_SUBSCRIPTION_FOUNDER_PLAN.code;
                  setForm((current) => ({
                    ...current,
                    planCode,
                    ...(isFounderPlan ? { isFounder: true, isComplimentary: true } : {}),
                  }));
                }}
                disabled={submitting}
                style={controlStyle}
              >
                <optgroup label="Offres commerciales">
                  {ATHLETE_SUBSCRIPTION_PLANS.map((plan) => (
                    <option key={plan.code} value={plan.code}>{plan.name} · {formatPrice(plan.annualPriceChf)}/an</option>
                  ))}
                </optgroup>
                <optgroup label="Accès interne">
                  <option value={ATHLETE_SUBSCRIPTION_FOUNDER_PLAN.code}>
                    {ATHLETE_SUBSCRIPTION_FOUNDER_PLAN.name}
                  </option>
                </optgroup>
              </Select>
            </label>

            <label style={fieldStyle}>
              <span>Début</span>
              <Input required type="date" value={form.startsOn} onChange={(event) => setStartDate(event.target.value)} disabled={submitting} style={controlStyle} />
            </label>

            <label style={fieldStyle}>
              <span>Fin</span>
              <Input required type="date" value={form.endsOn} onChange={(event) => setForm((current) => ({ ...current, endsOn: event.target.value }))} min={form.startsOn} disabled={submitting} style={controlStyle} />
            </label>
          </div>

          <fieldset style={{ display: "flex", flexWrap: "wrap", gap: "1rem", border: 0, padding: 0, margin: 0 }}>
            <legend style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>Modalités</legend>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "#374151", fontWeight: 600, fontSize: "0.9rem" }}>
              <input type="checkbox" checked={form.isFounder} onChange={(event) => setForm((current) => ({ ...current, isFounder: event.target.checked }))} disabled={submitting || founderSelected} />
              Membre fondateur
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "#374151", fontWeight: 600, fontSize: "0.9rem" }}>
              <input type="checkbox" checked={form.isComplimentary} onChange={(event) => setForm((current) => ({ ...current, isComplimentary: event.target.checked }))} disabled={submitting || founderSelected} />
              Offert
            </label>
          </fieldset>

          {founderSelected ? (
            <dl aria-label="Conditions Membre fondateur" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: "0.75rem", margin: 0, paddingTop: "0.85rem", borderTop: "1px solid #e5e7eb" }}>
              {[
                ["Prix", formatPrice(0)],
                ["Remise", "0 %"],
                ["Séances photo", "0"],
                ["Media Days", "0"],
                ["Sessions compétition", "0"],
                ["Contenus personnalisés", "0"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt style={{ color: "#6b7280", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>{label}</dt>
                  <dd style={{ margin: "0.2rem 0 0", color: "#111827", fontWeight: 700 }}>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {actionError ? <p role="alert" style={{ margin: 0, padding: "0.75rem", border: "1px solid #fecaca", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c" }}>{actionError}</p> : null}
          {successMessage ? <p role="status" style={{ margin: 0, padding: "0.75rem", border: "1px solid #bbf7d0", borderRadius: "8px", background: "#f0fdf4", color: "#166534" }}>{successMessage}</p> : null}

          <div>
            <Button type="submit" disabled={loading || submitting} style={{ borderRadius: "8px", padding: "0.7rem 1rem", background: "#111827", color: "#fff", border: "1px solid #111827", fontWeight: 700, opacity: loading || submitting ? 0.65 : 1 }}>
              {submitting ? "Attribution en cours…" : "Attribuer l’abonnement"}
            </Button>
          </div>
        </form>
      </Card>

      <Card style={{ padding: "1.15rem", border: "1px solid #d1d5db", boxShadow: "none", display: "grid", gap: "1rem" }}>
        <div style={{ display: "grid", gap: "0.3rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem", color: "#111827" }}>Attribuer les accès fondateurs</h2>
          <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.55 }}>
            Sélectionnez les athlètes sans abonnement actif. Les dates sont préremplies depuis leur adhésion.
          </p>
        </div>

        <form onSubmit={handleBulkFounderSubmit} noValidate style={{ display: "grid", gap: "0.85rem" }}>
          {eligibleFounderAthletes.length === 0 ? (
            <p style={{ margin: 0, color: "#6b7280" }}>Tous les athlètes ont déjà un abonnement actif.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.65rem" }}>
              {eligibleFounderAthletes.map((athlete) => {
                const draft = bulkFounderDrafts[athlete.key];
                const adhesionDate = toDateInputValue(athlete.adhesionDate);
                return (
                  <div key={athlete.key} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.75rem", alignItems: "end", padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.55rem", color: "#111827", fontWeight: 700, minHeight: "2.5rem" }}>
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner ${athlete.name}`}
                        checked={Boolean(draft)}
                        onChange={(event) => toggleBulkFounderAthlete(athlete, event.target.checked)}
                        disabled={bulkSubmitting}
                      />
                      <span>{athlete.name}</span>
                    </label>
                    <label style={fieldStyle}>
                      <span>Début</span>
                      <Input
                        type="date"
                        aria-label={`Début Founder pour ${athlete.name}`}
                        value={draft?.startsOn ?? adhesionDate}
                        onChange={(event) => updateBulkFounderDate(athlete.key, "startsOn", event.target.value)}
                        disabled={!draft || bulkSubmitting}
                        style={controlStyle}
                      />
                      {!adhesionDate && !draft?.startsOn ? <small style={{ color: "#b91c1c" }}>Date d’adhésion manquante</small> : null}
                    </label>
                    <label style={fieldStyle}>
                      <span>Fin</span>
                      <Input
                        type="date"
                        aria-label={`Fin Founder pour ${athlete.name}`}
                        value={draft?.endsOn ?? addOneYear(adhesionDate)}
                        onChange={(event) => updateBulkFounderDate(athlete.key, "endsOn", event.target.value)}
                        min={draft?.startsOn ?? adhesionDate}
                        disabled={!draft || bulkSubmitting}
                        style={controlStyle}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          {bulkError ? <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{bulkError}</p> : null}
          {bulkResult ? (
            <div role="status" style={{ display: "grid", gap: "0.35rem", color: "#166534" }}>
              <strong>{bulkResult.created.length} créé(s), {bulkResult.skipped.length} ignoré(s), {bulkResult.errors.length} erreur(s).</strong>
              {[...bulkResult.skipped.map(({ athleteId }) => `${athleteNames.get(athleteId) ?? athleteId} : abonnement actif existant.`), ...bulkResult.errors.map(({ athleteId, message }) => `${athleteNames.get(athleteId) ?? athleteId} : ${message}`)].map((message) => <span key={message}>{message}</span>)}
            </div>
          ) : null}

          <Button type="submit" disabled={loading || bulkSubmitting || eligibleFounderAthletes.length === 0} style={{ width: "fit-content" }}>
            {bulkSubmitting ? "Attribution groupée…" : "Attribuer les accès fondateurs"}
          </Button>
        </form>
      </Card>

      <section aria-labelledby="subscriptions-title" style={{ display: "grid", gap: "0.85rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <CalendarDays size={20} color="#9a6a22" aria-hidden="true" />
          <h2 id="subscriptions-title" style={{ margin: 0, fontSize: "1.15rem", color: "#111827" }}>Abonnements du workspace</h2>
        </div>

        {loading ? <p role="status" aria-live="polite" style={{ color: "#6b7280", margin: 0 }}>Chargement des abonnements…</p> : null}
        {loadError ? <p role="alert" style={{ margin: 0, padding: "0.8rem", border: "1px solid #fecaca", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c" }}>{loadError}</p> : null}
        {!loading && !loadError && subscriptions.length === 0 ? (
          <div style={{ padding: "1.25rem", border: "1px dashed #d1d5db", borderRadius: "8px", color: "#6b7280", background: "#fff" }}>
            Aucun abonnement Athlète dans ce workspace.
          </div>
        ) : null}

        {!loading && !loadError ? subscriptions.map((subscription) => {
          const plan = subscription.planCode === ATHLETE_SUBSCRIPTION_FOUNDER_PLAN.code
            ? ATHLETE_SUBSCRIPTION_FOUNDER_PLAN
            : ATHLETE_SUBSCRIPTION_PLANS.find(({ code }) => code === subscription.planCode);
          const active = subscription.status === "active";
          return (
            <Card key={subscription.id} style={{ padding: "1rem", border: "1px solid #e5e7eb", boxShadow: "none", display: "grid", gap: "0.85rem" }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                <div>
                  <h3 style={{ margin: 0, color: "#111827", fontSize: "1rem" }}>{athleteNames.get(subscription.athleteId) ?? subscription.athleteId}</h3>
                  <p style={{ margin: "0.2rem 0 0", color: "#6b7280" }}>{plan?.name ?? subscription.planCode}</p>
                </div>
                <span style={{ display: "inline-flex", padding: "0.25rem 0.6rem", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 700, background: active ? "#ecfdf5" : "#f3f4f6", color: active ? "#047857" : "#6b7280" }}>
                  {statusLabels[subscription.status]}
                </span>
              </div>

              <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: "0.75rem", margin: 0 }}>
                {[
                  ["Dates", `${formatDate(subscription.startsOn)} – ${formatDate(subscription.endsOn)}`],
                  ["Membre fondateur", subscription.isFounder ? "Oui" : "Non"],
                  ["Gratuité", subscription.isComplimentary ? "Offert" : "Payant"],
                  ["Prix catalogue", formatPrice(subscription.priceChf)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt style={{ color: "#6b7280", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>{label}</dt>
                    <dd style={{ margin: "0.2rem 0 0", color: "#111827", fontWeight: 600 }}>{value}</dd>
                  </div>
                ))}
              </dl>

              {active ? (
                <div>
                  <Button type="button" onClick={() => void handleCancel(subscription)} disabled={cancellingId === subscription.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderRadius: "8px", padding: "0.55rem 0.75rem", border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", fontWeight: 700 }}>
                    <CircleX size={16} aria-hidden="true" />
                    {cancellingId === subscription.id ? "Annulation…" : "Annuler l’abonnement"}
                  </Button>
                </div>
              ) : null}
            </Card>
          );
        }) : null}
      </section>

      <section aria-labelledby="content-requests-title" style={{ display: "grid", gap: "0.85rem", paddingTop: "0.5rem", borderTop: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <FileText size={20} color="#9a6a22" aria-hidden="true" />
          <h2 id="content-requests-title" style={{ margin: 0, fontSize: "1.15rem", color: "#111827" }}>
            Demandes de contenus personnalisés
          </h2>
        </div>

        {loading ? <p role="status" aria-live="polite" style={{ color: "#6b7280", margin: 0 }}>Chargement des demandes de contenus…</p> : null}
        {contentActionError ? <p role="alert" style={{ margin: 0, padding: "0.75rem", border: "1px solid #fecaca", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c" }}>{contentActionError}</p> : null}
        {contentSuccessMessage ? <p role="status" style={{ margin: 0, padding: "0.75rem", border: "1px solid #bbf7d0", borderRadius: "8px", background: "#f0fdf4", color: "#166534" }}>{contentSuccessMessage}</p> : null}
        {!loading && !loadError && contentRequests.length === 0 ? (
          <div style={{ padding: "1.25rem", border: "1px dashed #d1d5db", borderRadius: "8px", color: "#6b7280", background: "#fff" }}>
            Aucune demande de contenu personnalisé dans ce workspace.
          </div>
        ) : null}

        {!loading && !loadError ? contentRequests.map((contentRequest) => {
          const format = ATHLETE_CONTENT_FORMATS.find(({ code }) => code === contentRequest.formatCode);
          const actions = contentRequestActions[contentRequest.status] ?? [];
          const transitioning = transitioningRequestId === contentRequest.id;
          return (
            <Card key={contentRequest.id} style={{ padding: "1rem", border: "1px solid #e5e7eb", boxShadow: "none", display: "grid", gap: "0.85rem" }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                <div style={{ display: "grid", gap: "0.2rem" }}>
                  <h3 style={{ margin: 0, color: "#111827", fontSize: "1rem" }}>
                    {athleteNames.get(contentRequest.athleteId) ?? contentRequest.athleteId}
                  </h3>
                  <span style={{ color: "#6b7280" }}>{format?.name ?? contentRequest.formatCode}</span>
                </div>
                <span style={{ display: "inline-flex", padding: "0.25rem 0.6rem", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 700, background: "#f3f4f6", color: "#4b5563" }}>
                  {contentRequestStatusLabels[contentRequest.status]}
                </span>
              </div>

              <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", margin: 0 }}>
                {[
                  ["Note Athlète", contentRequest.athleteNote ?? "Aucune note"],
                  ["Date souhaitée", contentRequest.preferredDate ? formatDate(contentRequest.preferredDate) : "Non renseignée"],
                  ["Date de demande", formatTimestamp(contentRequest.createdAt)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt style={{ color: "#6b7280", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>{label}</dt>
                    <dd style={{ margin: "0.2rem 0 0", color: "#111827", lineHeight: 1.45 }}>{value}</dd>
                  </div>
                ))}
              </dl>

              {contentRequest.adminNote ? (
                <p style={{ margin: 0, padding: "0.7rem", background: "#f9fafb", borderRadius: "8px", color: "#4b5563" }}>
                  <strong>Note Admin :</strong> {contentRequest.adminNote}
                </p>
              ) : null}

              {actions.length > 0 ? (
                <div style={{ display: "grid", gap: "0.65rem" }}>
                  <label style={fieldStyle}>
                    <span>Note Admin facultative</span>
                    <Textarea
                      aria-label={`Note Admin pour ${athleteNames.get(contentRequest.athleteId) ?? contentRequest.athleteId}`}
                      value={adminNotes[contentRequest.id] ?? ""}
                      onChange={(event) => setAdminNotes((current) => ({
                        ...current,
                        [contentRequest.id]: event.target.value,
                      }))}
                      disabled={transitioning}
                      rows={3}
                      style={{ ...controlStyle, resize: "vertical" }}
                    />
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {actions.map((action) => (
                      <Button
                        key={action.status}
                        type="button"
                        onClick={() => void handleContentRequestAction(contentRequest, action.status)}
                        disabled={transitioning}
                        style={{ borderRadius: "8px", padding: "0.55rem 0.75rem", border: "1px solid #d1d5db", background: action.status === "accepted" || action.status === "completed" ? "#111827" : "#fff", color: action.status === "accepted" || action.status === "completed" ? "#fff" : "#374151", fontWeight: 700 }}
                      >
                        {transitioning ? "Mise à jour…" : action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>
          );
        }) : null}
      </section>
    </section>
  );
}