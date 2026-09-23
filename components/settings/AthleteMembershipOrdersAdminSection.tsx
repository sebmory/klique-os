"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BadgeCheck, ReceiptText } from "lucide-react";
import type { Athlete } from "@/types/athlete";
import { Button, Card, Select } from "@/src/design-system/components";

type OrderStatus = "pending" | "paid" | "cancelled" | "expired";
type PlanCode = "essential" | "impact" | "signature";

type AdminMembershipOrder = {
  id: string;
  publicReference: string;
  athleteId: string;
  athleteName: string;
  planCode: PlanCode;
  planName: string;
  annualPriceChf: number;
  durationMonths: number;
  productionCredits: number;
  customContentCredits: number;
  videoAllowed: boolean;
  paymentMethod: "twint_business";
  status: OrderStatus;
  membershipId: string | null;
  expiresAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type OrdersResponse = {
  orders?: AdminMembershipOrder[];
  error?: string;
};

type Filters = {
  status: OrderStatus | "all";
  planCode: PlanCode | "all";
  athleteId: string;
};

type Props = {
  athletes: Athlete[];
  onMembershipsRefresh: () => Promise<void>;
  enabled?: boolean;
};

export const TWINT_CONFIRMATION_WARNING = "Confirmez uniquement après avoir vérifié dans TWINT Business que le montant et la référence correspondent à cette commande. Cette action active immédiatement le Pass et attribue les crédits.";

const initialFilters: Filters = { status: "pending", planCode: "all", athleteId: "" };

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  color: "#374151",
  fontSize: "0.9rem",
  fontWeight: 600,
};

const statusLabels: Record<OrderStatus, string> = {
  pending: "En attente",
  paid: "Payée",
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

export default function AthleteMembershipOrdersAdminSection({
  athletes,
  onMembershipsRefresh,
  enabled = true,
}: Props) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [orders, setOrders] = useState<AdminMembershipOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const activeConfirmations = useRef(new Set<string>());

  const loadOrders = async (currentFilters: Filters, signal?: AbortSignal) => {
    const searchParams = new URLSearchParams();
    if (currentFilters.status !== "all") searchParams.set("status", currentFilters.status);
    if (currentFilters.planCode !== "all") searchParams.set("planCode", currentFilters.planCode);
    if (currentFilters.athleteId) searchParams.set("athleteId", currentFilters.athleteId);
    const query = searchParams.toString();
    const response = await fetch(`/api/admin/athlete-membership-orders${query ? `?${query}` : ""}`, {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      throw new Error(await errorMessageFrom(response, "Impossible de charger les commandes TWINT."));
    }
    const payload = (await response.json()) as OrdersResponse;
    if (!Array.isArray(payload.orders)) throw new Error("Impossible de charger les commandes TWINT.");
    setOrders(payload.orders);
  };

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void loadOrders(filters, controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Impossible de charger les commandes TWINT.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, filters]);

  const confirmPayment = async (order: AdminMembershipOrder) => {
    if (activeConfirmations.current.has(order.id)) return;
    if (!window.confirm(TWINT_CONFIRMATION_WARNING)) return;

    activeConfirmations.current.add(order.id);
    setConfirmingId(order.id);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(
        `/api/admin/athlete-membership-orders/${encodeURIComponent(order.id)}/confirm`,
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
      await Promise.all([loadOrders(filters), onMembershipsRefresh()]);
      setSuccessMessage(`Paiement confirmé pour ${order.athleteName} · ${order.planName}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Le paiement n’a pas pu être confirmé.");
    } finally {
      activeConfirmations.current.delete(order.id);
      setConfirmingId(null);
    }
  };

  return (
    <section aria-labelledby="membership-orders-title" style={{ display: "grid", gap: "0.85rem", paddingTop: "0.5rem", borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
        <ReceiptText size={20} color="#9a6a22" aria-hidden="true" />
        <h2 id="membership-orders-title" style={{ margin: 0, fontSize: "1.15rem", color: "#111827" }}>
          Commandes d’adhésion TWINT
        </h2>
      </div>

      <div aria-label="Filtres des commandes d’adhésion" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.75rem" }}>
        <label style={fieldStyle}>
          <span>Statut</span>
          <Select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as Filters["status"] }))}>
            <option value="pending">En attente</option>
            <option value="paid">Payée</option>
            <option value="cancelled">Annulée</option>
            <option value="expired">Expirée</option>
            <option value="all">Tous les statuts</option>
          </Select>
        </label>
        <label style={fieldStyle}>
          <span>Offre</span>
          <Select value={filters.planCode} onChange={(event) => setFilters((current) => ({ ...current, planCode: event.target.value as Filters["planCode"] }))}>
            <option value="all">Toutes les offres</option>
            <option value="essential">Essentiel</option>
            <option value="impact">Impact</option>
            <option value="signature">Signature</option>
          </Select>
        </label>
        <label style={fieldStyle}>
          <span>Athlète</span>
          <Select value={filters.athleteId} onChange={(event) => setFilters((current) => ({ ...current, athleteId: event.target.value }))}>
            <option value="">Tous les Athlètes</option>
            {athletes.map((athlete) => <option key={athlete.key} value={athlete.key}>{athlete.name}</option>)}
          </Select>
        </label>
      </div>

      {loading ? <p role="status" aria-live="polite" style={{ margin: 0, color: "#6b7280" }}>Chargement des commandes TWINT…</p> : null}
      {loadError ? <p role="alert" style={{ margin: 0, padding: "0.75rem", border: "1px solid #fecaca", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c" }}>{loadError}</p> : null}
      {actionError ? <p role="alert" style={{ margin: 0, padding: "0.75rem", border: "1px solid #fecaca", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c" }}>{actionError}</p> : null}
      {successMessage ? <p role="status" style={{ margin: 0, padding: "0.75rem", border: "1px solid #bbf7d0", borderRadius: "8px", background: "#f0fdf4", color: "#166534" }}>{successMessage}</p> : null}

      {!loading && !loadError && orders.length === 0 ? (
        <div style={{ padding: "1.25rem", border: "1px dashed #d1d5db", borderRadius: "8px", color: "#6b7280", background: "#fff" }}>
          Aucune commande ne correspond à ces filtres.
        </div>
      ) : null}

      {!loading && !loadError ? orders.map((order) => {
        const confirming = confirmingId === order.id;
        return (
          <Card key={order.id} style={{ padding: "1rem", border: "1px solid #e5e7eb", boxShadow: "none", display: "grid", gap: "0.85rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
              <div>
                <h3 style={{ margin: 0, color: "#111827", fontSize: "1rem" }}>{order.athleteName}</h3>
                <p style={{ margin: "0.2rem 0 0", color: "#6b7280" }}>{order.planName}</p>
              </div>
              <span style={{ display: "inline-flex", padding: "0.25rem 0.6rem", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 700, background: order.status === "pending" ? "#fffbeb" : order.status === "paid" ? "#ecfdf5" : "#f3f4f6", color: order.status === "pending" ? "#92400e" : order.status === "paid" ? "#047857" : "#6b7280" }}>
                {statusLabels[order.status]}
              </span>
            </div>

            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: "0.75rem", margin: 0 }}>
              {[
                ["Montant", formatAmount(order.annualPriceChf)],
                ["Référence TWINT", order.publicReference],
                ["Créée le", formatDateTime(order.createdAt)],
                ["Expire le", formatDateTime(order.expiresAt)],
                ["Crédits production", String(order.productionCredits)],
                ["Crédits contenus", String(order.customContentCredits)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt style={{ color: "#6b7280", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>{label}</dt>
                  <dd style={{ margin: "0.2rem 0 0", color: "#111827", fontWeight: 600, overflowWrap: "anywhere" }}>{value}</dd>
                </div>
              ))}
            </dl>

            {order.status === "pending" ? (
              <div>
                <Button
                  type="button"
                  onClick={() => void confirmPayment(order)}
                  disabled={confirming}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderRadius: "8px", padding: "0.55rem 0.75rem", border: "1px solid #166534", background: "#166534", color: "#fff", fontWeight: 700, opacity: confirming ? 0.65 : 1 }}
                >
                  <BadgeCheck size={16} aria-hidden="true" />
                  {confirming ? "Confirmation…" : "Confirmer le paiement"}
                </Button>
              </div>
            ) : null}
          </Card>
        );
      }) : null}
    </section>
  );
}