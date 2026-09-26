"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { BadgeCheck, ReceiptText, UserRoundCheck } from "lucide-react";
import type { Athlete } from "@/types/athlete";
import { Button, Card, Input, Select } from "@/src/design-system/components";

type ProspectOrderStatus = "pending_payment" | "paid_awaiting_form" | "activated" | "cancelled" | "expired";
type PlanCode = "essential" | "impact" | "signature";

type AdminProspectOrder = {
  id: string;
  publicReference: string;
  verifiedEmail: string;
  fullName: string;
  phone: string | null;
  planCode: PlanCode;
  planName: string;
  annualPriceChf: number;
  paymentMethod: "twint_business";
  status: ProspectOrderStatus;
  expiresAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type OrdersResponse = {
  orders?: AdminProspectOrder[];
  error?: string;
};

type Filters = {
  status: ProspectOrderStatus | "all";
  email: string;
  planCode: PlanCode | "all";
};

type Props = {
  athletes: Athlete[];
  onMembershipsRefresh: () => Promise<void>;
};

export const PROSPECT_PAYMENT_CONFIRMATION_WARNING = "Confirmez uniquement après avoir vérifié la réception du paiement TWINT. Cette action indiquera que le formulaire d’adhésion doit maintenant être envoyé manuellement.";
export const PROSPECT_PAYMENT_CONFIRMED_LABEL = "Paiement confirmé — formulaire à envoyer";
export const PROSPECT_ACTIVATION_CONFIRMATION_WARNING = "Cette action va activer définitivement le Pass, créer l’adhésion, attribuer les crédits prévus et ouvrir l’accès Athlete. Confirmez que le formulaire d’adhésion a été reçu et validé.";

const initialFilters: Filters = { status: "pending_payment", email: "", planCode: "all" };

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

const statusLabels: Record<ProspectOrderStatus, string> = {
  pending_payment: "Paiement en attente",
  paid_awaiting_form: PROSPECT_PAYMENT_CONFIRMED_LABEL,
  activated: "Traitement terminé",
  cancelled: "Annulée",
  expired: "Expirée",
};

const formatAmount = (value: number): string => new Intl.NumberFormat("fr-CH", {
  style: "currency",
  currency: "CHF",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

const formatDateTime = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("fr-CH", {
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

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export default function AthleteMembershipProspectOrdersAdminSection({
  athletes,
  onMembershipsRefresh,
}: Props) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [orders, setOrders] = useState<AdminProspectOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [activatingIds, setActivatingIds] = useState<Set<string>>(() => new Set());
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<Record<string, string>>({});
  const [activatedOrderIds, setActivatedOrderIds] = useState<Set<string>>(() => new Set());
  const activeConfirmations = useRef(new Set<string>());
  const activeActivations = useRef(new Set<string>());
  const canonicalAthletes = useMemo(
    () => athletes.filter((athlete) => typeof athlete.row === "number" && athlete.row > 0),
    [athletes],
  );

  const loadOrders = async (currentFilters: Filters, signal?: AbortSignal) => {
    const searchParams = new URLSearchParams();
    if (currentFilters.status !== "all") searchParams.set("status", currentFilters.status);
    if (currentFilters.email.trim()) searchParams.set("email", currentFilters.email.trim());
    if (currentFilters.planCode !== "all") searchParams.set("planCode", currentFilters.planCode);
    const query = searchParams.toString();
    const response = await fetch(`/api/admin/athlete-membership-prospect-orders${query ? `?${query}` : ""}`, {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      throw new Error(await errorMessageFrom(response, "Impossible de charger les commandes publiques."));
    }
    const payload = (await response.json()) as OrdersResponse;
    if (!Array.isArray(payload.orders)) throw new Error("Impossible de charger les commandes publiques.");
    setOrders(payload.orders);
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void loadOrders(filters, controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Impossible de charger les commandes publiques.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters]);

  useEffect(() => {
    setSelectedAthleteIds((current) => {
      const next = { ...current };
      let changed = false;
      orders.forEach((order) => {
        if (order.status !== "paid_awaiting_form" || Object.hasOwn(current, order.id)) return;
        const matches = canonicalAthletes.filter(
          (athlete) => normalizeEmail(athlete.email) === normalizeEmail(order.verifiedEmail),
        );
        if (matches.length === 1) {
          next[order.id] = matches[0].key;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [canonicalAthletes, orders]);

  const applyEmailFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFilters((current) => ({ ...current, email: String(formData.get("email") ?? "").trim() }));
  };

  const confirmPayment = async (order: AdminProspectOrder) => {
    if (activeConfirmations.current.has(order.id)) return;
    if (!window.confirm(PROSPECT_PAYMENT_CONFIRMATION_WARNING)) return;

    activeConfirmations.current.add(order.id);
    setConfirmingId(order.id);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(
        `/api/admin/athlete-membership-prospect-orders/${encodeURIComponent(order.id)}/confirm-payment`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      if (!response.ok) {
        throw new Error(await errorMessageFrom(response, "Le paiement n’a pas pu être confirmé."));
      }
      setSuccessMessage(`${PROSPECT_PAYMENT_CONFIRMED_LABEL} pour ${order.fullName}.`);
      await loadOrders(filters);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Le paiement n’a pas pu être confirmé.");
    } finally {
      activeConfirmations.current.delete(order.id);
      setConfirmingId(null);
    }
  };

  const activatePass = async (order: AdminProspectOrder, athlete: Athlete) => {
    if (activeActivations.current.has(order.id)) return;
    if (!window.confirm(PROSPECT_ACTIVATION_CONFIRMATION_WARNING)) return;

    activeActivations.current.add(order.id);
    setActivatingIds((current) => new Set(current).add(order.id));
    setActionError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(
        `/api/admin/athlete-membership-prospect-orders/${encodeURIComponent(order.id)}/activate`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ athleteId: athlete.key }),
        },
      );
      if (!response.ok) {
        throw new Error(await errorMessageFrom(response, "Le Pass n’a pas pu être activé."));
      }
      setActivatedOrderIds((current) => new Set(current).add(order.id));
      await Promise.all([loadOrders(filters), onMembershipsRefresh()]);
      setSuccessMessage(`Pass activé pour ${athlete.name}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Le Pass n’a pas pu être activé.");
    } finally {
      activeActivations.current.delete(order.id);
      setActivatingIds((current) => {
        const next = new Set(current);
        next.delete(order.id);
        return next;
      });
    }
  };

  return (
    <section aria-labelledby="prospect-orders-title" style={{ display: "grid", gap: "0.85rem", paddingTop: "0.5rem", borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "grid", gap: "0.45rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <ReceiptText size={20} color="#9a6a22" aria-hidden="true" />
          <h2 id="prospect-orders-title" style={{ margin: 0, fontSize: "1.15rem", color: "#111827" }}>
            Commandes publiques à traiter
          </h2>
        </div>
        <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.55 }}>
          Ces personnes ont commandé un Pass depuis la page publique. Vérifiez le paiement TWINT avant de confirmer, puis envoyez manuellement le formulaire d’adhésion.
        </p>
      </div>

      <div aria-label="Filtres des commandes publiques" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.75rem", alignItems: "end" }}>
        <label style={fieldStyle}>
          <span>Statut</span>
          <Select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as Filters["status"] }))} style={controlStyle}>
            <option value="pending_payment">Paiement en attente</option>
            <option value="paid_awaiting_form">Paiement confirmé — formulaire à envoyer</option>
            <option value="activated">Traitement terminé</option>
            <option value="cancelled">Annulées</option>
            <option value="expired">Expirées</option>
            <option value="all">Tous les statuts</option>
          </Select>
        </label>
        <label style={fieldStyle}>
          <span>Offre</span>
          <Select value={filters.planCode} onChange={(event) => setFilters((current) => ({ ...current, planCode: event.target.value as Filters["planCode"] }))} style={controlStyle}>
            <option value="all">Toutes les offres</option>
            <option value="essential">Essentiel</option>
            <option value="impact">Impact</option>
            <option value="signature">Signature</option>
          </Select>
        </label>
        <form onSubmit={applyEmailFilter} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.5rem", alignItems: "end" }}>
          <label style={fieldStyle}>
            <span>E-mail vérifié</span>
            <Input name="email" type="email" defaultValue={filters.email} placeholder="prospect@exemple.ch" style={controlStyle} />
          </label>
          <Button type="submit" style={{ minHeight: "40px", borderRadius: "8px", padding: "0.55rem 0.75rem", border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 700 }}>
            Rechercher
          </Button>
        </form>
      </div>

      {loading ? <p role="status" aria-live="polite" style={{ margin: 0, color: "#6b7280" }}>Chargement des commandes publiques…</p> : null}
      {loadError ? <p role="alert" style={{ margin: 0, padding: "0.75rem", border: "1px solid #fecaca", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c" }}>{loadError}</p> : null}
      {actionError ? <p role="alert" style={{ margin: 0, padding: "0.75rem", border: "1px solid #fecaca", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c" }}>{actionError}</p> : null}
      {successMessage ? <p role="status" style={{ margin: 0, padding: "0.75rem", border: "1px solid #bbf7d0", borderRadius: "8px", background: "#f0fdf4", color: "#166534" }}>{successMessage}</p> : null}

      {!loading && !loadError && orders.length === 0 ? (
        <div style={{ padding: "1.25rem", border: "1px dashed #d1d5db", borderRadius: "8px", color: "#6b7280", background: "#fff" }}>
          Aucune commande publique ne correspond à ces filtres.
        </div>
      ) : null}

      {!loading && !loadError ? orders.map((order) => {
        const confirming = confirmingId === order.id;
        const activating = activatingIds.has(order.id);
        const selectedAthleteId = selectedAthleteIds[order.id] ?? "";
        const selectedAthlete = canonicalAthletes.find((athlete) => athlete.key === selectedAthleteId) ?? null;
        const matchingAthletes = canonicalAthletes.filter(
          (athlete) => normalizeEmail(athlete.email) === normalizeEmail(order.verifiedEmail),
        );
        const uniquelyMatchedByEmail = matchingAthletes.length === 1
          && matchingAthletes[0].key === selectedAthleteId;
        const emailMismatch = selectedAthlete !== null
          && normalizeEmail(selectedAthlete.email) !== normalizeEmail(order.verifiedEmail);
        const locallyActivated = activatedOrderIds.has(order.id);
        return (
          <Card key={order.id} style={{ padding: "1rem", border: "1px solid #e5e7eb", boxShadow: "none", display: "grid", gap: "0.85rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
              <div style={{ display: "grid", gap: "0.2rem" }}>
                <h3 style={{ margin: 0, color: "#111827", fontSize: "1rem" }}>{order.fullName}</h3>
                <span style={{ color: "#4b5563", overflowWrap: "anywhere" }}>{order.verifiedEmail}</span>
                {order.phone ? <span style={{ color: "#6b7280" }}>{order.phone}</span> : null}
              </div>
              <span style={{ display: "inline-flex", padding: "0.25rem 0.6rem", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 700, background: order.status === "pending_payment" ? "#fffbeb" : order.status === "paid_awaiting_form" ? "#ecfdf5" : "#f3f4f6", color: order.status === "pending_payment" ? "#92400e" : order.status === "paid_awaiting_form" ? "#047857" : "#6b7280" }}>
                {statusLabels[order.status]}
              </span>
            </div>

            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: "0.75rem", margin: 0 }}>
              {[
                ["Offre", order.planName],
                ["Montant", formatAmount(order.annualPriceChf)],
                ["Référence TWINT", order.publicReference],
                ["Commandée le", formatDateTime(order.createdAt)],
                ["Expire le", formatDateTime(order.expiresAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt style={{ color: "#6b7280", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>{label}</dt>
                  <dd style={{ margin: "0.2rem 0 0", color: "#111827", fontWeight: 600, overflowWrap: "anywhere" }}>{value}</dd>
                </div>
              ))}
            </dl>

            {order.status === "pending_payment" ? (
              <div>
                <Button
                  type="button"
                  onClick={() => void confirmPayment(order)}
                  disabled={confirming}
                  aria-busy={confirming}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderRadius: "8px", padding: "0.55rem 0.75rem", border: "1px solid #166534", background: "#166534", color: "#fff", fontWeight: 700, opacity: confirming ? 0.65 : 1 }}
                >
                  <BadgeCheck size={16} aria-hidden="true" />
                  {confirming ? "Confirmation en cours…" : "Confirmer le paiement"}
                </Button>
              </div>
            ) : null}

            {order.status === "paid_awaiting_form" && !locallyActivated ? (
              <div style={{ display: "grid", gap: "0.75rem", paddingTop: "0.2rem", borderTop: "1px solid #e5e7eb" }}>
                <div style={{ display: "grid", gap: "0.25rem" }}>
                  <span style={{ color: "#6b7280", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase" }}>E-mail vérifié de la commande</span>
                  <strong style={{ color: "#111827", overflowWrap: "anywhere" }}>{order.verifiedEmail}</strong>
                </div>
                <label style={fieldStyle}>
                  <span>Fiche Athlete canonique</span>
                  <Select
                    aria-label={`Fiche Athlete canonique pour ${order.fullName}`}
                    value={selectedAthleteId}
                    onChange={(event) => setSelectedAthleteIds((current) => ({
                      ...current,
                      [order.id]: event.target.value,
                    }))}
                    disabled={activating}
                    style={controlStyle}
                  >
                    <option value="">Sélectionner une fiche Athlete</option>
                    {canonicalAthletes.map((athlete) => (
                      <option key={athlete.key} value={athlete.key}>
                        {athlete.name} — {athlete.email}
                      </option>
                    ))}
                  </Select>
                </label>

                {selectedAthlete ? (
                  <div style={{ display: "grid", gap: "0.25rem", padding: "0.75rem", border: `1px solid ${emailMismatch ? "#fecaca" : "#bbf7d0"}`, borderRadius: "8px", background: emailMismatch ? "#fef2f2" : "#f0fdf4" }}>
                    <strong style={{ color: "#111827" }}>{selectedAthlete.name}</strong>
                    <span style={{ color: "#4b5563", overflowWrap: "anywhere" }}>{selectedAthlete.email}</span>
                    {uniquelyMatchedByEmail ? (
                      <span style={{ color: "#166534", fontSize: "0.85rem" }}>Présélection automatique : correspondance unique sur l’e-mail exact.</span>
                    ) : null}
                    {emailMismatch ? (
                      <div role="alert" style={{ display: "grid", gap: "0.25rem", color: "#b91c1c", fontSize: "0.88rem" }}>
                        <span>E-mail commande : {order.verifiedEmail}</span>
                        <span>E-mail fiche Athlete : {selectedAthlete.email}</span>
                        <span>Corrigez la fiche dans 02_Athlètes, synchronisez les données, puis réessayez.</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.65rem" }}>
                  <Button
                    type="button"
                    onClick={() => selectedAthlete && void activatePass(order, selectedAthlete)}
                    disabled={!selectedAthlete || emailMismatch || activating}
                    aria-busy={activating}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderRadius: "8px", padding: "0.55rem 0.75rem", border: "1px solid #166534", background: "#166534", color: "#fff", fontWeight: 700, opacity: !selectedAthlete || emailMismatch || activating ? 0.65 : 1 }}
                  >
                    <UserRoundCheck size={16} aria-hidden="true" />
                    {activating ? "Activation en cours…" : "Activer le Pass"}
                  </Button>
                  {activating ? <span role="status" aria-live="polite" style={{ color: "#4b5563" }}>Activation du Pass en cours…</span> : null}
                </div>
              </div>
            ) : null}

            {order.status === "activated" || locallyActivated ? (
              <p role="status" style={{ margin: 0, color: "#166534", fontWeight: 700 }}>Pass activé</p>
            ) : null}
          </Card>
        );
      }) : null}
    </section>
  );
}