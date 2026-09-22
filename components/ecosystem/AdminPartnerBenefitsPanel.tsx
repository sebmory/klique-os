"use client";

import { type FormEvent, useEffect, useState } from "react";
import { CalendarClock, Check, Pencil, Plus, Power, X } from "lucide-react";

type UsagePolicy = "once_lifetime" | "once_per_membership" | "unlimited";
type BenefitStatus = "active" | "inactive";

type AdminPartnerBenefit = {
  id: string;
  workspaceId: string;
  partnerId: string;
  title: string;
  details: string;
  usagePolicy: UsagePolicy;
  validFrom: string;
  expiresAt: string | null;
  status: BenefitStatus;
  createdAt: string;
  updatedAt: string;
};

type BenefitForm = {
  title: string;
  details: string;
  usagePolicy: UsagePolicy;
  validFrom: string;
  expiresAt: string;
  status: BenefitStatus;
};

const emptyForm = (): BenefitForm => ({
  title: "",
  details: "",
  usagePolicy: "once_per_membership",
  validFrom: "",
  expiresAt: "",
  status: "active",
});

const policyLabels: Record<UsagePolicy, string> = {
  once_lifetime: "Utilisation unique",
  once_per_membership: "Une fois par période d’adhésion",
  unlimited: "Utilisation illimitée",
};

const toLocalDateTime = (value: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const toIsoDateTime = (value: string): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const formatDateTime = (value: string | null): string => {
  if (!value) return "Sans échéance";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date invalide";
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const readResponse = async <T,>(response: Response): Promise<T> => {
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || "Une erreur est survenue.");
  return payload;
};

export function AdminPartnerBenefitsPanel({ partnerId }: { partnerId: string }) {
  const [benefits, setBenefits] = useState<AdminPartnerBenefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<BenefitForm>(emptyForm);

  const loadBenefits = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/partner-benefits?partnerId=${encodeURIComponent(partnerId)}`,
        { credentials: "include", cache: "no-store" },
      );
      const payload = await readResponse<{ benefits: AdminPartnerBenefit[] }>(response);
      setBenefits(payload.benefits);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger les avantages.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBenefits();
  }, [partnerId]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setShowForm(true);
  };

  const startEdit = (benefit: AdminPartnerBenefit) => {
    setEditingId(benefit.id);
    setForm({
      title: benefit.title,
      details: benefit.details,
      usagePolicy: benefit.usagePolicy,
      validFrom: toLocalDateTime(benefit.validFrom),
      expiresAt: toLocalDateTime(benefit.expiresAt),
      status: benefit.status,
    });
    setError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm());
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validFrom = toIsoDateTime(form.validFrom);
    const expiresAt = toIsoDateTime(form.expiresAt);
    if (!validFrom || (form.expiresAt && !expiresAt)) {
      setError("Les dates sont invalides.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const url = editingId
        ? `/api/admin/partner-benefits?partnerId=${encodeURIComponent(partnerId)}&benefitId=${encodeURIComponent(editingId)}`
        : "/api/admin/partner-benefits";
      const body = {
        ...(editingId ? {} : { partnerId }),
        title: form.title,
        details: form.details,
        usagePolicy: form.usagePolicy,
        validFrom,
        expiresAt,
        status: form.status,
      };
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await readResponse<{ benefit: AdminPartnerBenefit }>(response);
      setBenefits((current) => editingId
        ? current.map((benefit) => benefit.id === payload.benefit.id ? payload.benefit : benefit)
        : [payload.benefit, ...current]);
      closeForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d’enregistrer l’avantage.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (benefit: AdminPartnerBenefit) => {
    setSaving(true);
    setError(null);
    try {
      const url = `/api/admin/partner-benefits?partnerId=${encodeURIComponent(partnerId)}&benefitId=${encodeURIComponent(benefit.id)}`;
      const response = await fetch(url, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(benefit.status === "active" ? { action: "deactivate" } : { status: "active" }),
      });
      const payload = await readResponse<{ benefit: AdminPartnerBenefit }>(response);
      setBenefits((current) => current.map((item) => item.id === payload.benefit.id ? payload.benefit : item));
      if (editingId === benefit.id) closeForm();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Impossible de modifier le statut.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="crm-person-card-shell crm-partner-span-full partner-benefits-admin" aria-labelledby="partner-benefits-title">
      <header className="partner-benefits-admin-head">
        <div>
          <h2 id="partner-benefits-title">Avantages KLIQUE</h2>
          <p>Catalogue réservé aux membres et administré pour ce partenaire.</p>
        </div>
        <button type="button" className="crm-primary-action" onClick={startCreate} disabled={saving}>
          <Plus size={16} aria-hidden /> Nouvel avantage
        </button>
      </header>

      {error ? <p className="partner-benefits-admin-error" role="alert">{error}</p> : null}

      <div className={`partner-benefits-admin-layout${showForm ? " has-form" : ""}`}>
        <div className="partner-benefits-admin-list" aria-live="polite">
          {loading ? <p>Chargement des avantages…</p> : null}
          {!loading && benefits.length === 0 ? <p className="partner-benefits-admin-empty">Aucun avantage configuré.</p> : null}
          {benefits.map((benefit) => (
            <section className="partner-benefit-admin-item" key={benefit.id}>
              <div className="partner-benefit-admin-title">
                <div>
                  <h3>{benefit.title}</h3>
                  <span className={`partner-benefit-admin-status is-${benefit.status}`}>
                    {benefit.status === "active" ? "Actif" : "Inactif"}
                  </span>
                </div>
                <div className="partner-benefit-admin-actions">
                  <button type="button" aria-label={`Modifier ${benefit.title}`} onClick={() => startEdit(benefit)} disabled={saving}>
                    <Pencil size={15} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${benefit.status === "active" ? "Désactiver" : "Activer"} ${benefit.title}`}
                    onClick={() => void toggleStatus(benefit)}
                    disabled={saving}
                  >
                    <Power size={15} aria-hidden />
                  </button>
                </div>
              </div>
              <p>{benefit.details}</p>
              <div className="partner-benefit-admin-meta">
                <strong><Check size={14} aria-hidden />{policyLabels[benefit.usagePolicy]}</strong>
                <span><CalendarClock size={14} aria-hidden />Échéance : {formatDateTime(benefit.expiresAt)}</span>
              </div>
            </section>
          ))}
        </div>

        {showForm ? (
          <form className="partner-benefits-admin-form" onSubmit={submit}>
            <header>
              <h3>{editingId ? "Modifier l’avantage" : "Créer un avantage"}</h3>
              <button type="button" aria-label="Fermer le formulaire" onClick={closeForm}><X size={16} aria-hidden /></button>
            </header>
            <label><span>Titre</span><input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label><span>Détails</span><textarea required maxLength={5000} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /></label>
            <label>
              <span>Politique d’utilisation</span>
              <select value={form.usagePolicy} onChange={(event) => setForm({ ...form, usagePolicy: event.target.value as UsagePolicy })}>
                <option value="once_lifetime">Utilisation unique</option>
                <option value="once_per_membership">Une fois par période d’adhésion</option>
                <option value="unlimited">Utilisation illimitée</option>
              </select>
            </label>
            <div className="partner-benefits-admin-dates">
              <label><span>Valide dès le</span><input type="datetime-local" required value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} /></label>
              <label><span>Échéance éventuelle</span><input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label>
            </div>
            <label>
              <span>Statut</span>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as BenefitStatus })}>
                <option value="active">Actif</option>
                <option value="inactive">Inactif</option>
              </select>
            </label>
            <div className="partner-benefits-admin-form-actions">
              <button type="button" onClick={closeForm}>Annuler</button>
              <button type="submit" className="crm-primary-action" disabled={saving}>
                {saving ? "Enregistrement…" : editingId ? "Enregistrer" : "Créer"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </article>
  );
}