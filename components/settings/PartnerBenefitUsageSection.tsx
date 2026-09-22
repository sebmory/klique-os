"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Card, Select, Table } from "@/src/design-system/components";
import type {
  PartnerBenefitReservationAuditRecord,
  PartnerBenefitReservationAuditStatus,
} from "@/lib/partner-benefits/admin-reservation-audit-service";

type AuditPayload = {
  reservations?: PartnerBenefitReservationAuditRecord[];
  error?: string;
};

type AuditFilters = {
  partnerId: string;
  athleteId: string;
  status: string;
};

type FilterOption = { id: string; label: string };

const emptyFilters: AuditFilters = { partnerId: "", athleteId: "", status: "" };

const statusLabels: Record<PartnerBenefitReservationAuditStatus, string> = {
  reserved: "Réservé",
  used: "Utilisé",
  cancelled: "Annulé",
  expired: "Expiré",
};

const statusStyles: Record<PartnerBenefitReservationAuditStatus, { background: string; color: string }> = {
  reserved: { background: "#eff6ff", color: "#1d4ed8" },
  used: { background: "#ecfdf5", color: "#047857" },
  cancelled: { background: "#fef2f2", color: "#b91c1c" },
  expired: { background: "#f3f4f6", color: "#4b5563" },
};

const actorRoleLabels = {
  admin: "Admin",
  athlete: "Athlète",
  partner_expert: "Partenaire/Expert",
  media: "Média",
} as const;

const formatDateTime = (value: string | null): string => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const mergeOptions = (current: FilterOption[], incoming: FilterOption[]): FilterOption[] => {
  const byId = new Map(current.map((option) => [option.id, option]));
  for (const option of incoming) byId.set(option.id, option);
  return [...byId.values()].sort((left, right) => left.label.localeCompare(right.label, "fr"));
};

const labelStyle = {
  display: "grid",
  gap: "0.35rem",
  minWidth: 0,
  color: "#374151",
  fontSize: "0.82rem",
  fontWeight: 700,
} as const;

const selectStyle = {
  width: "100%",
  minHeight: "40px",
  borderRadius: "8px",
  background: "#fff",
} as const;

const headCellStyle = {
  padding: "0.7rem 0.75rem",
  textAlign: "left",
  color: "#6b7280",
  fontSize: "0.72rem",
  fontWeight: 800,
  textTransform: "uppercase",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
} as const;

const cellStyle = {
  padding: "0.85rem 0.75rem",
  borderBottom: "1px solid #f3f4f6",
  color: "#374151",
  fontSize: "0.86rem",
  verticalAlign: "top",
} as const;

export function PartnerBenefitUsageSection() {
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [reservations, setReservations] = useState<PartnerBenefitReservationAuditRecord[]>([]);
  const [partnerOptions, setPartnerOptions] = useState<FilterOption[]>([]);
  const [athleteOptions, setAthleteOptions] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadReservations = async () => {
      setLoading(true);
      setError(null);
      const query = new URLSearchParams();
      if (filters.partnerId) query.set("partnerId", filters.partnerId);
      if (filters.athleteId) query.set("athleteId", filters.athleteId);
      if (filters.status) query.set("status", filters.status);
      const suffix = query.size > 0 ? `?${query.toString()}` : "";

      try {
        const response = await fetch(`/api/admin/partner-benefit-reservations${suffix}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as AuditPayload | null;
        if (!response.ok || !Array.isArray(payload?.reservations)) {
          setReservations([]);
          setError(payload?.error || "Impossible de charger l’utilisation des avantages partenaires.");
          return;
        }

        setReservations(payload.reservations);
        setPartnerOptions((current) => mergeOptions(current, payload.reservations!.map((reservation) => ({
          id: reservation.partnerId,
          label: reservation.partnerName,
        }))));
        setAthleteOptions((current) => mergeOptions(current, payload.reservations!.map((reservation) => ({
          id: reservation.athleteId,
          label: reservation.athleteName,
        }))));
      } catch (loadError) {
        if ((loadError as { name?: string })?.name !== "AbortError") {
          setReservations([]);
          setError("Impossible de charger l’utilisation des avantages partenaires. Vérifiez votre connexion.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadReservations();
    return () => controller.abort();
  }, [filters]);

  const updateFilter = (name: keyof AuditFilters, value: string) => {
    setFilters((current) => ({ ...current, [name]: value }));
  };

  return (
    <Card
      aria-labelledby="partner-benefit-usage-title"
      style={{
        padding: "1.15rem",
        display: "grid",
        gap: "1rem",
        border: "1px solid #dfe7e2",
        boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.7rem" }}>
        <span
          aria-hidden="true"
          style={{ display: "grid", placeItems: "center", width: "34px", height: "34px", flex: "0 0 auto", borderRadius: "8px", background: "#e8f3ed", color: "#166534" }}
        >
          <History size={18} />
        </span>
        <div>
          <h2 id="partner-benefit-usage-title" style={{ margin: "0 0 0.3rem", fontSize: "1.15rem", color: "#111827" }}>
            Utilisation des avantages partenaires
          </h2>
          <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.5, fontSize: "0.9rem" }}>
            Journal des réservations et de leurs transitions.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <label style={labelStyle}>
          <span>Partenaire</span>
          <Select
            aria-label="Filtrer par partenaire"
            value={filters.partnerId}
            onChange={(event) => updateFilter("partnerId", event.target.value)}
            style={selectStyle}
          >
            <option value="">Tous les partenaires</option>
            {partnerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </Select>
        </label>
        <label style={labelStyle}>
          <span>Athlète</span>
          <Select
            aria-label="Filtrer par Athlète"
            value={filters.athleteId}
            onChange={(event) => updateFilter("athleteId", event.target.value)}
            style={selectStyle}
          >
            <option value="">Tous les Athlètes</option>
            {athleteOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </Select>
        </label>
        <label style={labelStyle}>
          <span>Statut</span>
          <Select
            aria-label="Filtrer par statut"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
            style={selectStyle}
          >
            <option value="">Tous les statuts</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </label>
      </div>

      {loading ? (
        <p role="status" style={{ margin: 0, padding: "1.5rem 0", color: "#6b7280", textAlign: "center" }}>
          Chargement des réservations…
        </p>
      ) : error ? (
        <p role="alert" style={{ margin: 0, padding: "0.85rem", border: "1px solid #fecaca", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c" }}>
          {error}
        </p>
      ) : reservations.length === 0 ? (
        <p style={{ margin: 0, padding: "1.5rem 0", color: "#6b7280", textAlign: "center" }}>
          Aucune réservation ne correspond aux filtres sélectionnés.
        </p>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
          <Table style={{ width: "100%", minWidth: "1020px", borderCollapse: "collapse", background: "#fff" }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                {[
                  "Partenaire", "Athlète", "Avantage", "Statut",
                  "Réservation", "Échéance", "Utilisation", "Historique",
                ].map((label) => <th key={label} style={headCellStyle}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {reservations.map((reservation) => (
                <tr key={reservation.id}>
                  <td style={cellStyle}><strong style={{ color: "#111827" }}>{reservation.partnerName}</strong></td>
                  <td style={cellStyle}><strong style={{ color: "#111827" }}>{reservation.athleteName}</strong></td>
                  <td style={{ ...cellStyle, minWidth: "180px" }}>
                    <strong style={{ display: "block", color: "#111827" }}>{reservation.benefit.title}</strong>
                    <span style={{ display: "block", marginTop: "0.2rem", color: "#6b7280", lineHeight: 1.4 }}>{reservation.benefit.details}</span>
                  </td>
                  <td style={cellStyle}>
                    <span style={{ display: "inline-flex", padding: "0.25rem 0.5rem", borderRadius: "999px", fontSize: "0.76rem", fontWeight: 800, ...statusStyles[reservation.status] }}>
                      {statusLabels[reservation.status]}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>{formatDateTime(reservation.reservedAt)}</td>
                  <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>{formatDateTime(reservation.expiresAt)}</td>
                  <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>{formatDateTime(reservation.usedAt)}</td>
                  <td style={{ ...cellStyle, minWidth: "230px" }}>
                    <details>
                      <summary style={{ color: "#166534", fontWeight: 700, cursor: "pointer" }}>
                        {reservation.history.length} transition{reservation.history.length > 1 ? "s" : ""}
                      </summary>
                      <ol style={{ margin: "0.7rem 0 0", paddingLeft: "1.15rem", display: "grid", gap: "0.65rem" }}>
                        {reservation.history.map((event) => (
                          <li key={event.id} style={{ lineHeight: 1.4 }}>
                            <strong style={{ color: "#111827" }}>{statusLabels[event.newStatus]}</strong>
                            <span style={{ display: "block", color: "#6b7280", fontSize: "0.78rem" }}>
                              {formatDateTime(event.occurredAt)} · {actorRoleLabels[event.actorRole]}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}