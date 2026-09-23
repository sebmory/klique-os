"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, CalendarDays, CircleX, FileText, UserRoundCheck } from "lucide-react";
import { ATHLETE_CONTENT_FORMATS } from "@/lib/athlete-subscription-catalog";
import type {
  AthleteSubscriptionContentRequest,
  AthleteSubscriptionContentRequestStatus,
} from "@/lib/athlete-subscription-content-requests/service";
import type {
  AdminAthleteMembership,
  AthleteMembershipPlatformAccessStatus,
  AthleteMembershipStatus,
} from "@/lib/athlete-memberships";
import type { AthleteMembershipPlan } from "@/lib/athlete-credits";
import type { Athlete, AthletesResponse } from "@/types/athlete";
import { Button, Card, Input, Select, Textarea } from "@/src/design-system/components";
import AthleteMembershipOrdersAdminSection from "@/components/settings/AthleteMembershipOrdersAdminSection";

type SubscriptionsResponse = {
  memberships?: AdminAthleteMembership[];
  plans?: AthleteMembershipPlan[];
  error?: string;
};

type ContentRequestsResponse = {
  requests?: AthleteSubscriptionContentRequest[];
  request?: AthleteSubscriptionContentRequest;
  error?: string;
};

type FormState = {
  athleteId: string;
  planCode: string;
  startsOn: string;
  endsOn: string;
};

type FounderInviteFeedback = {
  pending: boolean;
  error: string | null;
  success: string | null;
};

type PlatformAccessFilter =
  | "all"
  | "without_active_access"
  | "not_invited"
  | "invited"
  | "active";

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

const initialStartDate = today();
const initialForm: FormState = {
  athleteId: "",
  planCode: "essential",
  startsOn: initialStartDate,
  endsOn: addOneYear(initialStartDate),
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

const formatDate = (value: string | null): string => {
  if (!value) return "Sans échéance";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
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

const statusLabels: Record<AthleteMembershipStatus, string> = {
  active: "Actif",
  scheduled: "Planifié",
  expired: "Expiré",
  cancelled: "Annulé",
  past_due: "Paiement en retard",
};

const platformAccessLabels: Record<AthleteMembershipPlatformAccessStatus, string> = {
  active: "Accès actif",
  inactive: "Accès inactif",
  invited: "Invitation envoyée",
  accepted_without_access: "Invitation acceptée — accès manquant",
  not_invited: "Non invité",
};

const platformAccessFilters: ReadonlyArray<{ value: PlatformAccessFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "without_active_access", label: "Sans accès actif" },
  { value: "not_invited", label: "Non invités" },
  { value: "invited", label: "Invitations en attente" },
  { value: "active", label: "Accès actifs" },
];

const getFounderPlatformAccess = (membership: AdminAthleteMembership) => membership.platformAccess;

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
  const [memberships, setMemberships] = useState<AdminAthleteMembership[]>([]);
  const [plans, setPlans] = useState<AthleteMembershipPlan[]>([]);
  const [contentRequests, setContentRequests] = useState<AthleteSubscriptionContentRequest[]>([]);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [transitioningRequestId, setTransitioningRequestId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [contentActionError, setContentActionError] = useState<string | null>(null);
  const [contentSuccessMessage, setContentSuccessMessage] = useState<string | null>(null);
  const [platformAccessFilter, setPlatformAccessFilter] = useState<PlatformAccessFilter>("all");
  const [founderInviteFeedback, setFounderInviteFeedback] = useState<Record<string, FounderInviteFeedback>>({});

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
        setMemberships(Array.isArray(subscriptionsPayload.memberships) ? subscriptionsPayload.memberships : []);
        setPlans(Array.isArray(subscriptionsPayload.plans) ? subscriptionsPayload.plans : []);
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
  const founderSelected = form.planCode === "founder";
  const founderAccessCounts = useMemo(() => {
    const counts: Record<AthleteMembershipPlatformAccessStatus, number> = {
      active: 0,
      inactive: 0,
      invited: 0,
      accepted_without_access: 0,
      not_invited: 0,
    };
    memberships.forEach((membership) => {
      const access = getFounderPlatformAccess(membership);
      if (access) counts[access.status] += 1;
    });
    return counts;
  }, [memberships]);
  const visibleMemberships = useMemo(() => {
    if (platformAccessFilter === "all") return memberships;
    return memberships.filter((membership) => {
      const access = getFounderPlatformAccess(membership);
      if (!access) return false;
      if (platformAccessFilter === "without_active_access") return access.status !== "active";
      return access.status === platformAccessFilter;
    });
  }, [platformAccessFilter, memberships]);

  const setStartDate = (startsOn: string) => {
    setForm((current) => ({ ...current, startsOn, endsOn: addOneYear(startsOn) }));
  };

  const refreshMemberships = async () => {
    const response = await fetch("/api/admin/athlete-subscriptions", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await errorMessageFrom(response, "Les adhésions n’ont pas pu être actualisées."));
    const payload = (await response.json()) as SubscriptionsResponse;
    if (!Array.isArray(payload.memberships)) throw new Error("Les adhésions n’ont pas pu être actualisées.");
    setMemberships(payload.memberships);
    if (Array.isArray(payload.plans)) setPlans(payload.plans);
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
      const response = await fetch(`/api/admin/athletes/${encodeURIComponent(form.athleteId)}/membership`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipKind: founderSelected ? "founder" : "subscription",
          planCode: founderSelected ? null : form.planCode,
          status: "active",
          startsAt: form.startsOn,
          endsAt: form.endsOn,
          autoRenew: false,
          paymentMode: founderSelected ? null : "annual",
        }),
      });
      if (!response.ok) {
        setActionError(await errorMessageFrom(response, "L’adhésion n’a pas pu être attribuée."));
        return;
      }
      await refreshMemberships();
      setSuccessMessage("Adhésion active attribuée avec succès.");
      setForm((current) => ({ ...current, athleteId: "" }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "L’adhésion n’a pas pu être attribuée.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (membership: AdminAthleteMembership) => {
    const athleteName = athleteNames.get(membership.athleteId) ?? membership.athleteId;
    if (!window.confirm(`Annuler l’adhésion active de ${athleteName} ?`)) return;

    setActionError(null);
    setSuccessMessage(null);
    setCancellingId(membership.id);
    try {
      const response = await fetch(`/api/admin/athletes/${encodeURIComponent(membership.athleteId)}/membership`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: membership.id,
          membershipKind: membership.membershipKind,
          planCode: membership.planCode,
          status: "cancelled",
          startsAt: membership.startsAt,
          endsAt: membership.endsAt,
          autoRenew: false,
          paymentMode: membership.paymentInstallments === 1 ? "annual" : membership.paymentInstallments === 12 ? "monthly_12" : null,
        }),
      });
      if (!response.ok) {
        setActionError(await errorMessageFrom(response, "L’adhésion n’a pas pu être annulée."));
        return;
      }
      await refreshMemberships();
      setSuccessMessage(`Adhésion de ${athleteName} annulée.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "L’adhésion n’a pas pu être annulée.");
    } finally {
      setCancellingId(null);
    }
  };

  const handleFounderInvite = async (membership: AdminAthleteMembership, resend: boolean) => {
    const athleteName = athleteNames.get(membership.athleteId) ?? membership.athleteId;
    setFounderInviteFeedback((current) => ({
      ...current,
      [membership.id]: { pending: true, error: null, success: null },
    }));

    try {
      const response = await fetch("/api/athletes/invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId: membership.athleteId, resend }),
      });
      if (!response.ok) {
        throw new Error(await errorMessageFrom(
          response,
          resend ? "Impossible de renvoyer l’invitation." : "Impossible d’envoyer l’invitation.",
        ));
      }

      await refreshMemberships();
      setFounderInviteFeedback((current) => ({
        ...current,
        [membership.id]: {
          pending: false,
          error: null,
          success: resend
            ? `Invitation renvoyée à ${athleteName}.`
            : `Invitation envoyée à ${athleteName}.`,
        },
      }));
    } catch (error) {
      setFounderInviteFeedback((current) => ({
        ...current,
        [membership.id]: {
          pending: false,
          error: error instanceof Error ? error.message : "L’invitation n’a pas pu être envoyée.",
          success: null,
        },
      }));
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
            ADHÉSIONS ATHLÈTES
          </p>
          <h1 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.45rem", color: "#111827" }}>Gérer les adhésions</h1>
          <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.6 }}>
            Attribuez les offres annuelles et suivez leur statut pour chaque athlète.
          </p>
        </div>
      </header>

      <Card style={{ padding: "1.15rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)", display: "grid", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <UserRoundCheck size={20} color="#9a6a22" aria-hidden="true" />
          <h2 style={{ margin: 0, fontSize: "1.15rem", color: "#111827" }}>Attribuer une adhésion</h2>
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
                  setForm((current) => ({ ...current, planCode: event.target.value }));
                }}
                disabled={submitting}
                style={controlStyle}
              >
                <optgroup label="Offres commerciales">
                  {plans.map((plan) => (
                    <option key={plan.code} value={plan.code}>{plan.name} · {formatPrice(plan.annualPriceChf ?? 0)}/an</option>
                  ))}
                </optgroup>
                <optgroup label="Accès interne">
                  <option value="founder">Membre fondateur</option>
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
              {submitting ? "Attribution en cours…" : "Attribuer l’adhésion"}
            </Button>
          </div>
        </form>
      </Card>

      <AthleteMembershipOrdersAdminSection
        athletes={athletes}
        onMembershipsRefresh={refreshMemberships}
        enabled={!loading}
      />

      <section aria-labelledby="subscriptions-title" style={{ display: "grid", gap: "0.85rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <CalendarDays size={20} color="#9a6a22" aria-hidden="true" />
          <h2 id="subscriptions-title" style={{ margin: 0, fontSize: "1.15rem", color: "#111827" }}>Adhésions du workspace</h2>
        </div>

        {!loading && !loadError && memberships.length > 0 ? (
          <div style={{ display: "grid", gap: "0.85rem" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "0.95rem", color: "#111827" }}>Accès plateforme des membres Founder actifs</h3>
              <dl aria-label="Récapitulatif des accès plateforme" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.6rem", margin: "0.65rem 0 0" }}>
                {(Object.keys(platformAccessLabels) as AthleteMembershipPlatformAccessStatus[]).map((status) => (
                  <div key={status} style={{ padding: "0.7rem 0.8rem", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff" }}>
                    <dt style={{ color: "#6b7280", fontSize: "0.75rem", fontWeight: 700 }}>{platformAccessLabels[status]}</dt>
                    <dd style={{ margin: "0.2rem 0 0", color: "#111827", fontSize: "1.1rem", fontWeight: 800 }}>{founderAccessCounts[status]}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div role="group" aria-label="Filtrer les abonnements par accès plateforme" style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
              {platformAccessFilters.map((filter) => {
                const selected = platformAccessFilter === filter.value;
                return (
                  <Button
                    key={filter.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPlatformAccessFilter(filter.value)}
                    style={{ padding: "0.45rem 0.7rem", borderRadius: "8px", border: `1px solid ${selected ? "#111827" : "#d1d5db"}`, background: selected ? "#111827" : "#fff", color: selected ? "#fff" : "#374151", fontWeight: 700 }}
                  >
                    {filter.label}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : null}

        {loading ? <p role="status" aria-live="polite" style={{ color: "#6b7280", margin: 0 }}>Chargement des adhésions…</p> : null}
        {loadError ? <p role="alert" style={{ margin: 0, padding: "0.8rem", border: "1px solid #fecaca", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c" }}>{loadError}</p> : null}
        {!loading && !loadError && memberships.length === 0 ? (
          <div style={{ padding: "1.25rem", border: "1px dashed #d1d5db", borderRadius: "8px", color: "#6b7280", background: "#fff" }}>
            Aucune adhésion Athlète dans ce workspace.
          </div>
        ) : null}

        {!loading && !loadError && memberships.length > 0 && visibleMemberships.length === 0 ? (
          <div style={{ padding: "1.25rem", border: "1px dashed #d1d5db", borderRadius: "8px", color: "#6b7280", background: "#fff" }}>
            Aucune adhésion ne correspond à ce filtre.
          </div>
        ) : null}

        {!loading && !loadError ? visibleMemberships.map((membership) => {
          const active = membership.isActive;
          const platformAccess = getFounderPlatformAccess(membership);
          const inviteFeedback = founderInviteFeedback[membership.id];
          const canInvite = platformAccess?.status === "not_invited";
          const canResendInvite = platformAccess?.status === "invited";
          return (
            <Card key={membership.id} style={{ padding: "1rem", border: "1px solid #e5e7eb", boxShadow: "none", display: "grid", gap: "0.85rem" }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                <div>
                  <h3 style={{ margin: 0, color: "#111827", fontSize: "1rem" }}>{athleteNames.get(membership.athleteId) ?? membership.athleteId}</h3>
                  <p style={{ margin: "0.2rem 0 0", color: "#6b7280" }}>{membership.plan?.name ?? (membership.membershipKind === "founder" ? "Membre fondateur" : membership.membershipKind)}</p>
                </div>
                <span style={{ display: "inline-flex", padding: "0.25rem 0.6rem", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 700, background: active ? "#ecfdf5" : "#f3f4f6", color: active ? "#047857" : "#6b7280" }}>
                  {statusLabels[membership.effectiveStatus]}
                </span>
              </div>

              <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: "0.75rem", margin: 0 }}>
                {[
                  ["Dates", `${formatDate(membership.startsAt)} – ${formatDate(membership.endsAt)}`],
                  ["Type", membership.membershipKind === "founder" ? "Fondateur" : "Abonnement"],
                  ["Prix annuel", membership.plan?.annualPriceChf == null ? "Offert" : formatPrice(membership.plan.annualPriceChf)],
                  ["Renouvellement", membership.autoRenew ? "Automatique" : "Manuel"],
                  ["Solde production", String(membership.balance.production)],
                  ["Solde contenus", String(membership.balance.customContent)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt style={{ color: "#6b7280", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>{label}</dt>
                    <dd style={{ margin: "0.2rem 0 0", color: "#111827", fontWeight: 600 }}>{value}</dd>
                  </div>
                ))}
              </dl>

              {platformAccess ? (
                <div style={{ display: "grid", gap: "0.6rem", padding: "0.7rem 0.8rem", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#f9fafb" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.55rem 0.8rem" }}>
                    <strong style={{ color: platformAccess.status === "active" ? "#047857" : "#92400e", fontSize: "0.88rem" }}>
                      {platformAccessLabels[platformAccess.status]}
                    </strong>
                    {platformAccess.email ? (
                      <span style={{ color: "#4b5563", fontSize: "0.88rem", overflowWrap: "anywhere" }}>{platformAccess.email}</span>
                    ) : null}
                    {canInvite || canResendInvite ? (
                      <Button
                        type="button"
                        onClick={() => void handleFounderInvite(membership, canResendInvite)}
                        disabled={inviteFeedback?.pending === true}
                        style={{ marginLeft: "auto", borderRadius: "8px", padding: "0.45rem 0.7rem", border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700, opacity: inviteFeedback?.pending ? 0.65 : 1 }}
                      >
                        {inviteFeedback?.pending
                          ? "Envoi en cours…"
                          : canResendInvite
                            ? "Renvoyer l’invitation"
                            : "Inviter"}
                      </Button>
                    ) : null}
                  </div>
                  {inviteFeedback?.error ? <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: "0.85rem" }}>{inviteFeedback.error}</p> : null}
                  {inviteFeedback?.success ? <p role="status" style={{ margin: 0, color: "#166534", fontSize: "0.85rem" }}>{inviteFeedback.success}</p> : null}
                </div>
              ) : null}

              {active ? (
                <div>
                  <Button type="button" onClick={() => void handleCancel(membership)} disabled={cancellingId === membership.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderRadius: "8px", padding: "0.55rem 0.75rem", border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", fontWeight: 700 }}>
                    <CircleX size={16} aria-hidden="true" />
                    {cancellingId === membership.id ? "Annulation…" : "Annuler l’adhésion"}
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