"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CreditCard } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type {
  AthleteMembership,
  AthleteMembershipKind,
  AthleteMembershipPaymentMode,
  AthleteMembershipStatus,
  CurrentAthleteMembership,
} from "@/lib/athlete-memberships";
import type { AthleteMembershipPlan } from "@/lib/athlete-credits";
import type { AthleteCreditType } from "@/lib/athlete-credits";
import type { AthleteMembershipServiceSummary } from "@/lib/athlete-membership-service-summary";
import { ATHLETE_SUBSCRIPTION_SUMMARY, formatAthleteSubscriptionPrice } from "@/lib/athlete-subscription-terms";

type MembershipForm = {
  membershipKind: AthleteMembershipKind;
  status: AthleteMembershipStatus;
  startsAt: string;
  endsAt: string;
  autoRenew: boolean;
  paymentMode: AthleteMembershipPaymentMode | "";
  planCode: string;
};

type RealizationForm = {
  realizationId: string;
  creditType: AthleteCreditType;
  label: string;
  occurredOn: string;
  note: string;
};

const kindLabels: Record<AthleteMembershipKind, string> = {
  founder: "Fondateur",
  subscription: "Abonnement",
  trial: "Essai",
  manual: "Manuelle",
};

const statusLabels: Record<AthleteMembershipStatus | "unknown", string> = {
  active: "Active",
  scheduled: "Future",
  expired: "Expirée",
  cancelled: "Annulée",
  past_due: "Paiement en retard",
  unknown: "Aucune adhésion",
};

const toDateTimeLocal = (value: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const formatDate = (value: string | null): string => {
  if (!value) return "Non renseignée";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
};

const formatExpiration = (days: number | null): string => {
  if (days === null) return "Sans échéance";
  if (days < 0) return `Expirée depuis ${Math.abs(days)} jour${Math.abs(days) === 1 ? "" : "s"}`;
  if (days === 0) return "Expire aujourd’hui";
  return `Expire dans ${days} jour${days === 1 ? "" : "s"}`;
};

const subscriptionEnd = (startsAt: string, plan: AthleteMembershipPlan | undefined): string => {
  if (!startsAt || !plan?.durationMonths) return "";
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCMonth(date.getUTCMonth() + plan.durationMonths);
  return toDateTimeLocal(date.toISOString());
};

const createForm = (membership: CurrentAthleteMembership, plans: AthleteMembershipPlan[]): MembershipForm => {
  const record = membership.membership;
  const planCode = record?.planCode ?? plans[0]?.code ?? "";
  return {
    membershipKind: record?.membershipKind ?? "manual",
    status: record?.status ?? "active",
    startsAt: toDateTimeLocal(record?.startsAt ?? membership.startsAt),
    endsAt: toDateTimeLocal(record?.endsAt ?? membership.endsAt),
    autoRenew: record?.autoRenew ?? false,
    paymentMode: record?.paymentInstallments === 1 ? "annual" : record?.paymentInstallments === 12 ? "monthly_12" : "",
    planCode,
  };
};

export function AthleteMembershipAdminCard({ athleteId }: { athleteId: string }) {
  const [membership, setMembership] = useState<CurrentAthleteMembership | null>(null);
  const [plans, setPlans] = useState<AthleteMembershipPlan[]>([]);
  const [serviceSummary, setServiceSummary] = useState<AthleteMembershipServiceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<MembershipForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [realizationForm, setRealizationForm] = useState<RealizationForm | null>(null);
  const [realizationSaving, setRealizationSaving] = useState(false);
  const [realizationError, setRealizationError] = useState("");
  const realizationSubmittingRef = useRef(false);

  const loadMembership = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/athletes/${encodeURIComponent(athleteId)}/membership`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        membership?: CurrentAthleteMembership;
        plans?: AthleteMembershipPlan[];
        serviceSummary?: AthleteMembershipServiceSummary | null;
        error?: string;
      } | null;
      if (!response.ok || !payload?.membership) throw new Error(payload?.error || "Impossible de charger l’adhésion.");
      setMembership(payload.membership);
      setPlans(payload.plans ?? []);
      setServiceSummary(payload.serviceSummary ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger l’adhésion.");
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => {
    void loadMembership();
  }, [loadMembership]);

  const openManagement = () => {
    if (!membership) return;
    setForm(createForm(membership, plans));
    setSaveError("");
    setShowModal(true);
  };

  const saveMembership = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!membership || !form) return;
    setSaving(true);
    setSaveError("");
    try {
      const existing = membership.origin === "neon" ? membership.membership : null;
      const response = await fetch(`/api/admin/athletes/${encodeURIComponent(athleteId)}/membership`, {
        method: existing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(existing ? { membershipId: existing.id } : {}),
          ...form,
          planCode: form.planCode.trim() || null,
          endsAt: form.membershipKind === "subscription"
            ? subscriptionEnd(form.startsAt, plans.find((plan) => plan.code === form.planCode)) || null
            : form.endsAt || null,
          paymentMode: form.paymentMode || null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { membership?: AthleteMembership; error?: string } | null;
      if (!response.ok || !payload?.membership) throw new Error(payload?.error || "Impossible d’enregistrer l’adhésion.");
      await loadMembership();
      setShowModal(false);
    } catch (saveFailure) {
      setSaveError(saveFailure instanceof Error ? saveFailure.message : "Impossible d’enregistrer l’adhésion.");
    } finally {
      setSaving(false);
    }
  };

  const openRealization = (creditType: AthleteCreditType, label: string) => {
    setRealizationForm({
      realizationId: crypto.randomUUID(),
      creditType,
      label,
      occurredOn: new Date().toISOString().slice(0, 10),
      note: "",
    });
    setRealizationError("");
  };

  const saveRealization = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!serviceSummary || !realizationForm || realizationSubmittingRef.current) return;
    realizationSubmittingRef.current = true;
    setRealizationSaving(true);
    setRealizationError("");
    try {
      const response = await fetch(
        `/api/admin/athletes/${encodeURIComponent(athleteId)}/membership/realizations`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            realizationId: realizationForm.realizationId,
            membershipId: serviceSummary.membershipId,
            creditType: realizationForm.creditType,
            occurredAt: `${realizationForm.occurredOn}T12:00:00.000Z`,
            note: realizationForm.note.trim() || null,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Impossible d’enregistrer la réalisation.");
      setRealizationForm(null);
      await loadMembership();
    } catch (failure) {
      setRealizationError(
        failure instanceof Error ? failure.message : "Impossible d’enregistrer la réalisation.",
      );
    } finally {
      realizationSubmittingRef.current = false;
      setRealizationSaving(false);
    }
  };

  const record = membership?.membership ?? null;

  return (
    <>
      <article className="crm-person-card-shell">
        <header><h2>Adhésion KLIQUE</h2></header>
        {loading ? <p>Chargement de l’adhésion…</p> : error ? (
          <div style={{ display: "grid", gap: "0.6rem" }}>
            <p style={{ margin: 0, color: "#b91c1c" }}>{error}</p>
            <button type="button" className="crm-secondary-action-link" onClick={() => void loadMembership()}>Réessayer</button>
          </div>
        ) : membership ? (
          <div style={{ display: "grid", gap: "0.85rem" }}>
            {membership.origin === "historical" ? (
              <strong style={{ color: "#92400e" }}>Calcul historique</strong>
            ) : null}
            <dl className="crm-person-info-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div><dt><CreditCard size={14} aria-hidden />Type</dt><dd>{record ? kindLabels[record.membershipKind] : "Calcul historique"}</dd></div>
              <div><dt>Statut</dt><dd>{statusLabels[membership.status]}</dd></div>
              <div><dt>Début</dt><dd>{formatDate(membership.startsAt)}</dd></div>
              <div><dt>Fin</dt><dd>{formatDate(membership.endsAt)}</dd></div>
              <div><dt>Renouvellement</dt><dd>{record?.autoRenew ? "Automatique" : "Non automatique"}</dd></div>
              <div><dt>Source</dt><dd>{record?.source || "Calcul historique"}</dd></div>
              {record?.planCode ? <div><dt>Plan</dt><dd>{plans.find((plan) => plan.code === record.planCode)?.name ?? record.planCode}</dd></div> : null}
              {record?.paymentInstallments ? <div><dt>Paiement</dt><dd>{record.paymentInstallments === 12 ? "Ancienne modalité : 12 échéances" : "Paiement annuel"}</dd></div> : null}
            </dl>
            {serviceSummary ? (
              <section aria-labelledby={`athlete-service-summary-${athleteId}`} style={{ display: "grid", gap: "0.8rem", borderTop: "1px solid #e5e7eb", paddingTop: "0.85rem" }}>
                <div>
                  <h3 id={`athlete-service-summary-${athleteId}`} style={{ margin: 0, fontSize: "1rem" }}>Suivi des prestations</h3>
                  <p style={{ margin: "0.25rem 0 0", color: "#4b5563" }}>
                    Du {formatDate(serviceSummary.startsAt)} au {formatDate(serviceSummary.endsAt)} · {formatExpiration(serviceSummary.expiresInDays)}
                  </p>
                </div>

                <div style={{ display: "grid", gap: "0.45rem" }}>
                  <strong>Prestations incluses</strong>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                      <thead>
                        <tr>
                          {["Type", "Quota", "Réservé", "Utilisé", "Disponible", "Expiration", "Action"].map((label) => (
                            <th key={label} scope="col" style={{ textAlign: "left", padding: "0.4rem", borderBottom: "1px solid #e5e7eb" }}>{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {serviceSummary.included.map((right) => (
                          <tr key={right.creditType}>
                            <th scope="row" style={{ textAlign: "left", padding: "0.4rem" }}>{right.label}</th>
                            <td style={{ padding: "0.4rem" }}>{right.quota}</td>
                            <td style={{ padding: "0.4rem" }}>{right.reserved}</td>
                            <td style={{ padding: "0.4rem" }}>{right.used}</td>
                            <td style={{ padding: "0.4rem" }}><strong>{right.available}</strong></td>
                            <td style={{ padding: "0.4rem" }}>{formatDate(right.expiresAt)}</td>
                            <td style={{ padding: "0.4rem" }}>
                              {right.available > 0 ? (
                                <button
                                  type="button"
                                  className="crm-secondary-action-link"
                                  onClick={() => openRealization(right.creditType, right.label)}
                                  disabled={realizationSaving}
                                >
                                  Enregistrer une réalisation
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ display: "grid", gap: "0.25rem" }}>
                  <strong>Demandes en attente</strong>
                  <span>
                    {serviceSummary.pendingRequests.total} au total · {serviceSummary.pendingRequests.received} reçue(s) · {serviceSummary.pendingRequests.toConfirm} à confirmer
                  </span>
                </div>

                <div style={{ display: "grid", gap: "0.45rem" }}>
                  <strong>Prestations achetées</strong>
                  {serviceSummary.purchases.length === 0 ? (
                    <span style={{ color: "#6b7280" }}>Aucune prestation achetée sur cette adhésion.</span>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                        <thead>
                          <tr>
                            {["Prestation", "Payé", "Livré", "Restant", "Expiration"].map((label) => (
                              <th key={label} scope="col" style={{ textAlign: "left", padding: "0.4rem", borderBottom: "1px solid #e5e7eb" }}>{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {serviceSummary.purchases.map((purchase) => (
                            <tr key={purchase.purchaseId}>
                              <th scope="row" style={{ textAlign: "left", padding: "0.4rem" }}>{purchase.productName}</th>
                              <td style={{ padding: "0.4rem" }}>{purchase.paid}</td>
                              <td style={{ padding: "0.4rem" }}>{purchase.delivered}</td>
                              <td style={{ padding: "0.4rem" }}><strong>{purchase.remaining}</strong></td>
                              <td style={{ padding: "0.4rem" }}>
                                {formatDate(purchase.expiresAt)}{purchase.expired ? " · Expirée" : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            ) : record && membership.isActive ? (
              <p style={{ margin: 0, color: "#6b7280" }}>Aucune synthèse de prestations disponible pour cette adhésion.</p>
            ) : null}
            <button type="button" className="crm-secondary-action-link" onClick={openManagement}>Gérer l’adhésion</button>
          </div>
        ) : null}
      </article>

      {showModal && form ? (
        <Modal title="Gérer l’adhésion" onClose={() => !saving && setShowModal(false)}>
          <form className="modal-form" onSubmit={saveMembership}>
            <label>Type
              <select value={form.membershipKind} onChange={(event) => {
                const membershipKind = event.target.value as AthleteMembershipKind;
                setForm({
                  ...form,
                  membershipKind,
                  status: membershipKind === "subscription" && !record ? "scheduled" : form.status,
                  planCode: membershipKind === "subscription" ? form.planCode || plans[0]?.code || "" : form.planCode,
                  paymentMode: membershipKind === "subscription" ? form.paymentMode || "annual" : "",
                });
              }}>
                {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Statut
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AthleteMembershipStatus })}>
                {Object.entries(statusLabels).filter(([value]) => value !== "unknown").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Date de début<input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} required /></label>
            {form.membershipKind === "subscription" ? (
              <>
                <label>Date de fin
                  <input type="datetime-local" value={subscriptionEnd(form.startsAt, plans.find((plan) => plan.code === form.planCode))} readOnly />
                </label>
                <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "0.65rem" }}>
                  <legend style={{ marginBottom: "0.45rem", fontWeight: 700 }}>Plan</legend>
                  <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.55 }}>{ATHLETE_SUBSCRIPTION_SUMMARY}</p>
                  {plans.map((plan) => (
                    <label key={plan.code} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.65rem", alignItems: "start", border: form.planCode === plan.code ? "2px solid #111827" : "1px solid #d1d5db", borderRadius: 8, padding: "0.8rem", cursor: "pointer" }}>
                      <input type="radio" name="planCode" value={plan.code} checked={form.planCode === plan.code} onChange={() => setForm({ ...form, planCode: plan.code })} required />
                      <span style={{ display: "grid", gap: "0.25rem" }}>
                        <strong>{plan.name}</strong>
                        <span>{plan.annualPriceChf === null ? "Tarif non disponible" : formatAthleteSubscriptionPrice(plan.annualPriceChf)}</span>
                        <span>{plan.productionCredits ?? 0} crédit(s) production · {plan.customContentCredits ?? 0} crédit(s) contenu personnalisé · Vidéo {plan.videoAllowed ? "incluse" : "non incluse"}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <strong>Paiement annuel en une fois</strong>
                {form.status === "scheduled" ? <p style={{ margin: 0, color: "#4b5563" }}>L’adhésion et ses crédits resteront inactifs jusqu’à la confirmation du paiement. Sélectionnez « Active » après vérification d’un paiement reçu hors ligne.</p> : null}
              </>
            ) : (
              <label>Date de fin<input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input type="checkbox" checked={form.autoRenew} onChange={(event) => setForm({ ...form, autoRenew: event.target.checked })} />
              Renouvellement automatique
            </label>
            {saveError ? <p role="alert" style={{ color: "#b91c1c" }}>{saveError}</p> : null}
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowModal(false)} disabled={saving}>Annuler</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {realizationForm ? (
        <Modal
          title={`Enregistrer une réalisation · ${realizationForm.label}`}
          onClose={() => !realizationSaving && setRealizationForm(null)}
        >
          <form className="modal-form" onSubmit={saveRealization}>
            <label>Date réelle
              <input
                type="date"
                value={realizationForm.occurredOn}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setRealizationForm({
                  ...realizationForm,
                  occurredOn: event.target.value,
                })}
                disabled={realizationSaving}
                required
              />
            </label>
            <label>Note facultative
              <textarea
                value={realizationForm.note}
                onChange={(event) => setRealizationForm({
                  ...realizationForm,
                  note: event.target.value,
                })}
                disabled={realizationSaving}
                maxLength={2_000}
                rows={4}
              />
            </label>
            {realizationError ? <p role="alert" style={{ color: "#b91c1c" }}>{realizationError}</p> : null}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setRealizationForm(null)}
                disabled={realizationSaving}
              >
                Annuler
              </button>
              <button type="submit" className="primary-button" disabled={realizationSaving}>
                {realizationSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}