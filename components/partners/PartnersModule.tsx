"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Athlete } from "@/types/athlete";
import type { NewPartner, Partner } from "@/types/partner";
import { PartnerService } from "@/services/partner.service";
import { Modal } from "@/components/ui/Modal";

const emptyPartner: NewPartner = {
  name: "",
  category: "Mental",
  expertKlique: true,
  contact: "",
  email: "",
  phone: "",
  website: "",
  instagram: "",
  description: "",
  benefits: "",
  notes: "",
  status: "Actif",
  athletes: "",
};

export function PartnersModule({
  athletes,
  partners,
  source,
  message,
  onRefresh,
}: {
  athletes: Athlete[];
  partners: Partner[];
  source: "google-sheets" | "demo";
  message: string;
  onRefresh: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Partner | null>(null);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [form, setForm] = useState<NewPartner>(emptyPartner);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const categories = [
    "Tous",
    ...Array.from(new Set(partners.map((partner) => partner.category))).filter(Boolean),
  ];

  const visible = useMemo(
    () => PartnerService.filter(partners, search, category),
    [partners, search, category]
  );

  const createPartner = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback("");

    try {
      await PartnerService.create(form);
      setFeedback("Le partenaire a été ajouté.");
      setForm(emptyPartner);
      setShowCreate(false);
      await onRefresh();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Création impossible."
      );
    } finally {
      setSaving(false);
    }
  };

  const savePartner = async () => {
    if (!editing?.row) return;
    setSaving(true);
    setFeedback("");

    try {
      await PartnerService.update({
        row: editing.row,
        name: editing.name,
        category: editing.category,
        expertKlique: editing.expertKlique,
        contact: editing.contact,
        email: editing.email,
        phone: editing.phone,
        website: editing.website,
        instagram: editing.instagram,
        description: editing.description,
        benefits: editing.benefits,
        notes: editing.notes,
        status: editing.status,
        athletes: editing.athletes,
      });

      setFeedback("Le partenaire a été modifié.");
      setEditing(null);
      setSelected(null);
      await onRefresh();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Modification impossible."
      );
    } finally {
      setSaving(false);
    }
  };

  const deletePartner = async (partner: Partner) => {
    if (!partner.row) return;

    const confirmed = window.confirm(
      `Supprimer définitivement ${partner.name} ?`
    );

    if (!confirmed) return;

    setSaving(true);
    setFeedback("");

    try {
      await PartnerService.remove(partner.row);
      setFeedback("Le partenaire a été supprimé.");
      setSelected(null);
      setEditing(null);
      await onRefresh();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Suppression impossible."
      );
    } finally {
      setSaving(false);
    }
  };

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Réseau KLIQUE · V0.11.1.1</p>
          <h2>Partenaires</h2>
          <p>
            Une base simple pour gérer les partenaires et experts KLIQUE.
          </p>
        </div>

        <button className="primary-button" onClick={() => setShowCreate(true)}>
          + Nouveau partenaire
        </button>
      </section>

      {source === "demo" && (
        <div className="connection-banner">
          <strong>Mode démo pour les partenaires</strong>
          <small>{message}</small>
        </div>
      )}

      {feedback && <div className="success-banner">{feedback}</div>}

      <section className="module-kpis">
        <article>
          <span>Partenaires</span>
          <strong>{partners.length}</strong>
          <small>fiches enregistrées</small>
        </article>
        <article>
          <span>Actifs</span>
          <strong>
            {partners.filter((partner) => partner.status === "Actif").length}
          </strong>
          <small>partenaires disponibles</small>
        </article>
        <article>
          <span>Experts KLIQUE</span>
          <strong>
            {partners.filter((partner) => partner.expertKlique).length}
          </strong>
          <small>experts identifiés</small>
        </article>
        <article>
          <span>Catégories</span>
          <strong>
            {new Set(partners.map((partner) => partner.category).filter(Boolean)).size}
          </strong>
          <small>domaines représentés</small>
        </article>
      </section>

      <section className="partner-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un partenaire, un contact ou un e-mail…"
        />

        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>

        <span>{visible.length} résultat(s)</span>
      </section>

      <section className="partner-card-grid">
        {visible.map((partner) => (
          <button
            className="partner-profile-card"
            key={`${partner.row ?? partner.id}-${partner.name}`}
            onClick={() => setSelected(partner)}
          >
            <div className="partner-card-top">
              <div className="partner-avatar">{initials(partner.name)}</div>

              <div className="partner-card-badges">
                {partner.expertKlique && (
                  <span className="expert-badge">Expert KLIQUE</span>
                )}
                <span
                  className={
                    partner.status === "Actif"
                      ? "status-badge"
                      : "status-badge inactive"
                  }
                >
                  {partner.status}
                </span>
              </div>
            </div>

            <div className="partner-card-main">
              <p className="eyebrow">{partner.category || "Autre"}</p>
              <h3>{partner.name}</h3>
              <span>{partner.contact || "Contact à compléter"}</span>
            </div>

            <div className="partner-card-contact">
              <span>{partner.email || "E-mail à compléter"}</span>
              <span>{partner.instagram || "Instagram à compléter"}</span>
            </div>

            <div className="partner-card-footer">
              <span>
                {partner.athletes
                  ? `${partner.athletes.split(",").filter(Boolean).length} athlète(s)`
                  : "Aucun athlète lié"}
              </span>
              <strong>Ouvrir →</strong>
            </div>
          </button>
        ))}
      </section>

      {showCreate && (
        <Modal
          title="Ajouter un partenaire"
          onClose={() => setShowCreate(false)}
        >
          <form className="modal-form partner-form" onSubmit={createPartner}>
            <label>
              <span>Nom</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
              />
            </label>

            <label>
              <span>Catégorie</span>
              <select
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
              >
                <option>Mental</option>
                <option>Nutrition</option>
                <option>Récupération</option>
                <option>Préparation physique</option>
                <option>Physiothérapie</option>
                <option>Média</option>
                <option>Entreprise</option>
                <option>Autre</option>
              </select>
            </label>

            <label>
              <span>Personne de contact</span>
              <input
                value={form.contact}
                onChange={(event) =>
                  setForm({ ...form, contact: event.target.value })
                }
              />
            </label>

            <label>
              <span>Statut</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as NewPartner["status"],
                  })
                }
              >
                <option>Actif</option>
                <option>Inactif</option>
              </select>
            </label>

            <label>
              <span>E-mail</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
              />
            </label>

            <label>
              <span>Téléphone</span>
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
              />
            </label>

            <label>
              <span>Site web</span>
              <input
                value={form.website}
                onChange={(event) =>
                  setForm({ ...form, website: event.target.value })
                }
              />
            </label>

            <label>
              <span>Instagram</span>
              <input
                value={form.instagram}
                onChange={(event) =>
                  setForm({ ...form, instagram: event.target.value })
                }
              />
            </label>

            <label className="partner-checkbox">
              <input
                type="checkbox"
                checked={form.expertKlique}
                onChange={(event) =>
                  setForm({ ...form, expertKlique: event.target.checked })
                }
              />
              <span>Expert KLIQUE</span>
            </label>

            <label className="modal-wide">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </label>

            <label className="modal-wide">
              <span>Avantages pour les membres</span>
              <textarea
                value={form.benefits}
                onChange={(event) =>
                  setForm({ ...form, benefits: event.target.value })
                }
              />
            </label>

            <label className="modal-wide">
              <span>Athlètes suivis</span>
              <input
                list="partner-athletes"
                value={form.athletes}
                onChange={(event) =>
                  setForm({ ...form, athletes: event.target.value })
                }
                placeholder="Noms séparés par des virgules"
              />
              <datalist id="partner-athletes">
                {athletes.map((athlete) => (
                  <option key={athlete.name} value={athlete.name} />
                ))}
              </datalist>
            </label>

            <label className="modal-wide">
              <span>Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </label>

            <div className="modal-actions modal-wide">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowCreate(false)}
              >
                Annuler
              </button>

              <button className="primary-button" disabled={saving}>
                {saving ? "Ajout…" : "Ajouter le partenaire"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <div className="partner-detail">
            <section className="partner-detail-hero">
              <div className="partner-avatar large">
                {initials(selected.name)}
              </div>

              <div>
                <p className="eyebrow">{selected.category}</p>
                <h3>{selected.name}</h3>
                <div className="partner-detail-badges">
                  {selected.expertKlique && (
                    <span className="expert-badge">Expert KLIQUE</span>
                  )}
                  <span
                    className={
                      selected.status === "Actif"
                        ? "status-badge"
                        : "status-badge inactive"
                    }
                  >
                    {selected.status}
                  </span>
                </div>
              </div>
            </section>

            <section className="partner-detail-grid">
              <div>
                <span>Contact</span>
                <strong>{selected.contact || "À compléter"}</strong>
              </div>
              <div>
                <span>E-mail</span>
                <strong>{selected.email || "À compléter"}</strong>
              </div>
              <div>
                <span>Téléphone</span>
                <strong>{selected.phone || "À compléter"}</strong>
              </div>
              <div>
                <span>Instagram</span>
                <strong>{selected.instagram || "À compléter"}</strong>
              </div>
            </section>

            <section className="partner-detail-content">
              <div>
                <span>Description</span>
                <p>{selected.description || "Aucune description."}</p>
              </div>
              <div>
                <span>Avantages</span>
                <p>{selected.benefits || "Aucun avantage renseigné."}</p>
              </div>
              <div>
                <span>Athlètes suivis</span>
                <p>{selected.athletes || "Aucun athlète lié."}</p>
              </div>
              <div>
                <span>Notes</span>
                <p>{selected.notes || "Aucune note."}</p>
              </div>
            </section>

            <div className="modal-actions partner-detail-actions">
              <button
                className="danger-button"
                onClick={() => deletePartner(selected)}
                disabled={saving}
              >
                Supprimer
              </button>

              <button
                className="secondary-button"
                onClick={() => {
                  setEditing({ ...selected });
                  setSelected(null);
                }}
              >
                Modifier
              </button>

              <button
                className="primary-button"
                onClick={() => setSelected(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Modifier ${editing.name}`} onClose={() => setEditing(null)}>
          <div className="modal-form partner-form">
            <label>
              <span>Nom</span>
              <input
                value={editing.name}
                onChange={(event) =>
                  setEditing({ ...editing, name: event.target.value })
                }
              />
            </label>

            <label>
              <span>Catégorie</span>
              <input
                value={editing.category}
                onChange={(event) =>
                  setEditing({ ...editing, category: event.target.value })
                }
              />
            </label>

            <label>
              <span>Contact</span>
              <input
                value={editing.contact}
                onChange={(event) =>
                  setEditing({ ...editing, contact: event.target.value })
                }
              />
            </label>

            <label>
              <span>Statut</span>
              <select
                value={editing.status}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    status: event.target.value as Partner["status"],
                  })
                }
              >
                <option>Actif</option>
                <option>Inactif</option>
              </select>
            </label>

            <label>
              <span>E-mail</span>
              <input
                value={editing.email}
                onChange={(event) =>
                  setEditing({ ...editing, email: event.target.value })
                }
              />
            </label>

            <label>
              <span>Téléphone</span>
              <input
                value={editing.phone}
                onChange={(event) =>
                  setEditing({ ...editing, phone: event.target.value })
                }
              />
            </label>

            <label>
              <span>Site web</span>
              <input
                value={editing.website}
                onChange={(event) =>
                  setEditing({ ...editing, website: event.target.value })
                }
              />
            </label>

            <label>
              <span>Instagram</span>
              <input
                value={editing.instagram}
                onChange={(event) =>
                  setEditing({ ...editing, instagram: event.target.value })
                }
              />
            </label>

            <label className="partner-checkbox">
              <input
                type="checkbox"
                checked={editing.expertKlique}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    expertKlique: event.target.checked,
                  })
                }
              />
              <span>Expert KLIQUE</span>
            </label>

            <label className="modal-wide">
              <span>Description</span>
              <textarea
                value={editing.description}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    description: event.target.value,
                  })
                }
              />
            </label>

            <label className="modal-wide">
              <span>Avantages</span>
              <textarea
                value={editing.benefits}
                onChange={(event) =>
                  setEditing({ ...editing, benefits: event.target.value })
                }
              />
            </label>

            <label className="modal-wide">
              <span>Athlètes suivis</span>
              <input
                value={editing.athletes}
                onChange={(event) =>
                  setEditing({ ...editing, athletes: event.target.value })
                }
              />
            </label>

            <label className="modal-wide">
              <span>Notes</span>
              <textarea
                value={editing.notes}
                onChange={(event) =>
                  setEditing({ ...editing, notes: event.target.value })
                }
              />
            </label>

            <div className="modal-actions modal-wide">
              <button
                className="secondary-button"
                onClick={() => setEditing(null)}
              >
                Annuler
              </button>

              <button
                className="primary-button"
                onClick={savePartner}
                disabled={saving}
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
