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

function AthleteSelector({
  athletes,
  selectedKeys,
  onChange,
}: {
  athletes: Athlete[];
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const visible = athletes.filter((athlete) =>
    `${athlete.name} ${athlete.sport} ${athlete.club}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const toggle = (key: string) => {
    onChange(
      selectedKeys.includes(key)
        ? selectedKeys.filter((item) => item !== key)
        : [...selectedKeys, key]
    );
  };

  return (
    <div className="athlete-selector modal-wide">
      <div className="athlete-selector-heading">
        <div>
          <span>Athlètes suivis</span>
          <small>{selectedKeys.length} sélectionné(s)</small>
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un athlète…"
        />
      </div>
      <div className="athlete-selector-list">
        {visible.map((athlete) => (
          <label key={athlete.key}>
            <input
              type="checkbox"
              checked={selectedKeys.includes(athlete.key)}
              onChange={() => toggle(athlete.key)}
            />
            <div>
              <strong>{athlete.name}</strong>
              <small>{athlete.sport} · {athlete.club}</small>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

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

  const formAthleteKeys = PartnerService.athleteKeys(form, athletes);
  const editingAthleteKeys = editing
    ? PartnerService.athleteKeys(editing, athletes)
    : [];

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
      setFeedback(error instanceof Error ? error.message : "Création impossible.");
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
      await onRefresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Modification impossible.");
    } finally {
      setSaving(false);
    }
  };

  const deletePartner = async (partner: Partner) => {
    if (!partner.row || !window.confirm(`Supprimer définitivement ${partner.name} ?`)) {
      return;
    }

    setSaving(true);
    setFeedback("");
    try {
      await PartnerService.remove(partner.row);
      setFeedback("Le partenaire a été supprimé.");
      setSelected(null);
      setEditing(null);
      await onRefresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  };

  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  const profileScore = (partner: Partner) => {
    const fields = [
      partner.name,
      partner.category,
      partner.contact,
      partner.email,
      partner.phone,
      partner.website,
      partner.instagram,
      partner.description,
      partner.benefits,
    ];
    return Math.round((fields.filter((value) => String(value).trim()).length / fields.length) * 100);
  };

  const normalizeWebsite = (value: string) => {
    if (!value) return "";
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  };

  const normalizeInstagram = (value: string) => {
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return `https://www.instagram.com/${value.replace(/^@/, "")}`;
  };

  const copyContact = async (partner: Partner) => {
    const lines = [
      partner.name,
      partner.contact && `Contact : ${partner.contact}`,
      partner.email && `E-mail : ${partner.email}`,
      partner.phone && `Téléphone : ${partner.phone}`,
      partner.website && `Site : ${partner.website}`,
      partner.instagram && `Instagram : ${partner.instagram}`,
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setFeedback("Coordonnées copiées.");
    } catch {
      setFeedback("Impossible de copier automatiquement les coordonnées.");
    }
  };

  const openEditing = (partner: Partner) => {
    const normalizedAthletes = PartnerService.encodeAthleteKeys(
      PartnerService.athleteKeys(partner, athletes)
    );
    setEditing({ ...partner, athletes: normalizedAthletes });
    setSelected(null);
  };

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Réseau KLIQUE · V0.11.3</p>
          <h2>Partenaires</h2>
          <p>Des profils experts plus complets, lisibles et directement exploitables.</p>
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
        <article><span>Partenaires</span><strong>{partners.length}</strong><small>fiches enregistrées</small></article>
        <article><span>Actifs</span><strong>{partners.filter((p) => p.status === "Actif").length}</strong><small>partenaires disponibles</small></article>
        <article><span>Experts KLIQUE</span><strong>{partners.filter((p) => p.expertKlique).length}</strong><small>experts identifiés</small></article>
        <article><span>Liaisons</span><strong>{partners.reduce((sum, p) => sum + PartnerService.athleteKeys(p, athletes).length, 0)}</strong><small>athlète ↔ expert</small></article>
      </section>

      <section className="partner-toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un partenaire, un contact ou un e-mail…" />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select>
        <span>{visible.length} résultat(s)</span>
      </section>

      <section className="partner-card-grid">
        {visible.map((partner) => {
          const linkedNames = PartnerService.athleteNames(partner, athletes);
          return (
            <button className="partner-profile-card" key={`${partner.row ?? partner.id}-${partner.name}`} onClick={() => setSelected(partner)}>
              <div className="partner-card-top">
                <div className="partner-avatar">{initials(partner.name)}</div>
                <div className="partner-card-badges">
                  {partner.expertKlique && <span className="expert-badge">Expert KLIQUE</span>}
                  <span className={partner.status === "Actif" ? "status-badge" : "status-badge inactive"}>{partner.status}</span>
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
                <span>{linkedNames.length ? `${linkedNames.length} athlète(s)` : "Aucun athlète lié"}</span>
                <strong>Ouvrir →</strong>
              </div>
            </button>
          );
        })}
      </section>

      {showCreate && (
        <Modal title="Ajouter un partenaire" onClose={() => setShowCreate(false)}>
          <form className="modal-form partner-form" onSubmit={createPartner}>
            <PartnerFields value={form} onChange={setForm} />
            <AthleteSelector
              athletes={athletes}
              selectedKeys={formAthleteKeys}
              onChange={(keys) => setForm({ ...form, athletes: PartnerService.encodeAthleteKeys(keys) })}
            />
            <div className="modal-actions modal-wide">
              <button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Annuler</button>
              <button className="primary-button" disabled={saving}>{saving ? "Ajout…" : "Ajouter le partenaire"}</button>
            </div>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <div className="partner-detail expert-profile">
            <section className="partner-detail-hero expert-profile-hero">
              <div className="partner-avatar large">{initials(selected.name)}</div>
              <div className="expert-profile-identity">
                <p className="eyebrow">{selected.category}</p>
                <h3>{selected.name}</h3>
                <p>{selected.description || "Présentation à compléter."}</p>
                <div className="partner-detail-badges">
                  {selected.expertKlique && <span className="expert-badge">Expert KLIQUE</span>}
                  <span className={selected.status === "Actif" ? "status-badge" : "status-badge inactive"}>{selected.status}</span>
                </div>
              </div>
              <div className="expert-profile-score">
                <span>Profil complété</span>
                <strong>{profileScore(selected)}%</strong>
                <div><i style={{ width: `${profileScore(selected)}%` }} /></div>
              </div>
            </section>

            <section className="expert-action-bar">
              {selected.email && <a href={`mailto:${selected.email}`}>Envoyer un e-mail</a>}
              {selected.phone && <a href={`tel:${selected.phone}`}>Appeler</a>}
              {selected.website && <a href={normalizeWebsite(selected.website)} target="_blank" rel="noreferrer">Site web ↗</a>}
              {selected.instagram && <a href={normalizeInstagram(selected.instagram)} target="_blank" rel="noreferrer">Instagram ↗</a>}
              <button onClick={() => copyContact(selected)}>Copier les coordonnées</button>
            </section>

            <section className="partner-detail-grid expert-contact-grid">
              <div><span>Personne de contact</span><strong>{selected.contact || "À compléter"}</strong></div>
              <div><span>E-mail</span><strong>{selected.email || "À compléter"}</strong></div>
              <div><span>Téléphone</span><strong>{selected.phone || "À compléter"}</strong></div>
              <div><span>Site web</span><strong>{selected.website || "À compléter"}</strong></div>
            </section>

            <section className="expert-profile-layout">
              <div className="expert-profile-main">
                <article className="expert-section-card">
                  <span>Avantages pour les membres KLIQUE</span>
                  <p>{selected.benefits || "Aucun avantage renseigné."}</p>
                </article>

                <article className="expert-section-card">
                  <span>Notes internes</span>
                  <p>{selected.notes || "Aucune note."}</p>
                </article>
              </div>

              <aside className="expert-athletes-card">
                <header>
                  <div>
                    <span>Athlètes accompagnés</span>
                    <strong>{PartnerService.athleteKeys(selected, athletes).length}</strong>
                  </div>
                </header>

                <div className="expert-athlete-list">
                  {PartnerService.athleteKeys(selected, athletes).length ? (
                    PartnerService.athleteKeys(selected, athletes).map((key) => {
                      const athlete = athletes.find((item) => item.key === key);
                      if (!athlete) return null;
                      return (
                        <div key={athlete.key}>
                          <b>{athlete.initials}</b>
                          <span>
                            <strong>{athlete.name}</strong>
                            <small>{athlete.sport} · {athlete.club}</small>
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p>Aucun athlète lié.</p>
                  )}
                </div>
              </aside>
            </section>

            <div className="modal-actions partner-detail-actions">
              <button className="danger-button" onClick={() => deletePartner(selected)} disabled={saving}>Supprimer</button>
              <button className="secondary-button" onClick={() => openEditing(selected)}>Modifier</button>
              <button className="primary-button" onClick={() => setSelected(null)}>Fermer</button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Modifier ${editing.name}`} onClose={() => setEditing(null)}>
          <div className="modal-form partner-form">
            <PartnerFields value={editing} onChange={setEditing} />
            <AthleteSelector
              athletes={athletes}
              selectedKeys={editingAthleteKeys}
              onChange={(keys) => setEditing({ ...editing, athletes: PartnerService.encodeAthleteKeys(keys) })}
            />
            <div className="modal-actions modal-wide">
              <button className="secondary-button" onClick={() => setEditing(null)}>Annuler</button>
              <button className="primary-button" onClick={savePartner} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function PartnerFields<T extends NewPartner | Partner>({
  value,
  onChange,
}: {
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <>
      <label><span>Nom</span><input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} required /></label>
      <label><span>Catégorie</span><select value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value })}>
        <option>Mental</option><option>Nutrition</option><option>Récupération</option><option>Préparation physique</option><option>Physiothérapie</option><option>Média</option><option>Entreprise</option><option>Autre</option>
      </select></label>
      <label><span>Personne de contact</span><input value={value.contact} onChange={(e) => onChange({ ...value, contact: e.target.value })} /></label>
      <label><span>Statut</span><select value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as T["status"] })}><option>Actif</option><option>Inactif</option></select></label>
      <label><span>E-mail</span><input type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} /></label>
      <label><span>Téléphone</span><input value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} /></label>
      <label><span>Site web</span><input value={value.website} onChange={(e) => onChange({ ...value, website: e.target.value })} /></label>
      <label><span>Instagram</span><input value={value.instagram} onChange={(e) => onChange({ ...value, instagram: e.target.value })} /></label>
      <label className="partner-checkbox"><input type="checkbox" checked={value.expertKlique} onChange={(e) => onChange({ ...value, expertKlique: e.target.checked })} /><span>Expert KLIQUE</span></label>
      <label className="modal-wide"><span>Description</span><textarea value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} /></label>
      <label className="modal-wide"><span>Avantages pour les membres</span><textarea value={value.benefits} onChange={(e) => onChange({ ...value, benefits: e.target.value })} /></label>
      <label className="modal-wide"><span>Notes</span><textarea value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} /></label>
    </>
  );
}
