"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Athlete } from "@/types/athlete";
import type { NewShooting, Shooting, ShootingUpdate } from "@/types/shooting";
import { ShootingService } from "@/services/shooting.service";
import { Modal } from "@/components/ui/Modal";

const workflowFields: Array<{
  key: keyof Pick<
    Shooting,
    "importDone" | "sortDone" | "retouchDone" | "exportDone" | "driveDone" | "published"
  >;
  label: string;
}> = [
  { key: "importDone", label: "Import" },
  { key: "sortDone", label: "Tri" },
  { key: "retouchDone", label: "Retouche" },
  { key: "exportDone", label: "Export" },
  { key: "driveDone", label: "Livré / Drive" },
  { key: "published", label: "Publié" },
];

const emptyForm: NewShooting = {
  date: "",
  athlete: "",
  sport: "",
  type: "Portrait",
  place: "",
  objective: "",
  photographer: "Sébastien Mory",
  status: "Planifié",
  photos: 0,
  videos: 0,
  lightroomLink: "",
  driveLink: "",
  clientGalleryLink: "",
  instagramLink: "",
  shootingDone: false,
  importDone: false,
  backupDone: false,
  sortDone: false,
  retouchDone: false,
  exportDone: false,
  driveDone: false,
  publishedInstagram: false,
  publishedFacebook: false,
  publishedLinkedIn: false,
  published: false,
  deliverableClub: false,
  deliverableAthlete: false,
  deliverableSponsor: false,
  deliverableMedia: false,
  deliverableAgency: false,
  deliverableOther: false,
  notes: "",
};

const productionChecklistFields: Array<{
  key: keyof Pick<
    Shooting,
    | "shootingDone"
    | "importDone"
    | "backupDone"
    | "sortDone"
    | "retouchDone"
    | "exportDone"
    | "driveDone"
    | "publishedInstagram"
    | "publishedFacebook"
    | "publishedLinkedIn"
  >;
  label: string;
}> = [
  { key: "shootingDone", label: "Shooting réalisé" },
  { key: "importDone", label: "Photos importées" },
  { key: "backupDone", label: "Sauvegarde effectuée" },
  { key: "sortDone", label: "Tri terminé" },
  { key: "retouchDone", label: "Retouches terminées" },
  { key: "exportDone", label: "Exports terminés" },
  { key: "driveDone", label: "Livraison effectuée" },
  { key: "publishedInstagram", label: "Publication Instagram" },
  { key: "publishedFacebook", label: "Publication Facebook" },
  { key: "publishedLinkedIn", label: "Publication LinkedIn" },
];

const deliverableFields: Array<{
  key: keyof Pick<
    Shooting,
    | "deliverableClub"
    | "deliverableAthlete"
    | "deliverableSponsor"
    | "deliverableMedia"
    | "deliverableAgency"
    | "deliverableOther"
  >;
  label: string;
}> = [
  { key: "deliverableClub", label: "Club" },
  { key: "deliverableAthlete", label: "Athlète" },
  { key: "deliverableSponsor", label: "Sponsor" },
  { key: "deliverableMedia", label: "Média" },
  { key: "deliverableAgency", label: "Agence" },
  { key: "deliverableOther", label: "Autre" },
];

export function ShootingsModule({
  athletes,
  shootings,
  source,
  message,
  onRefresh,
  onOpenAthlete,
  openShootingRow,
  onOpenShootingRow,
}: {
  athletes: Athlete[];
  shootings: Shooting[];
  source: "google-sheets" | "demo";
  message: string;
  onRefresh: () => Promise<void>;
  onOpenAthlete?: (athlete: Athlete) => void;
  openShootingRow?: number | null;
  onOpenShootingRow?: (row: number | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Tous");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Shooting | null>(null);
  const [form, setForm] = useState<NewShooting>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (openShootingRow == null) return;
    const shootingToOpen = shootings.find((item) => item.row === openShootingRow);
    if (shootingToOpen) {
      setSelected({ ...shootingToOpen });
    }
    onOpenShootingRow?.(null);
  }, [openShootingRow, onOpenShootingRow, shootings]);

  const shootingStatus = (shooting: Shooting) =>
    ShootingService.statusFromChecklist(shooting);

  const visible = useMemo(() => {
    return [...shootings]
      .filter((shooting) => {
        const matchesSearch = `${shooting.athlete} ${shooting.type} ${shooting.place} ${shooting.sport}`
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesStatus =
          status === "Tous" || shootingStatus(shooting) === status;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [shootings, search, status]);

  const statuses = [
    "Tous",
    ...Array.from(new Set(shootings.map(shootingStatus))).filter(Boolean),
  ];

  const selectAthlete = (name: string, target: "create" | "edit") => {
    const athlete = athletes.find((item) => item.name === name);
    if (target === "create") {
      setForm((current) => ({ ...current, athlete: name, sport: athlete?.sport ?? "" }));
    } else if (selected) {
      setSelected({ ...selected, athlete: name, sport: athlete?.sport ?? selected.sport });
    }
  };

  const createShooting = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback("");
    try {
      const shootingToCreate: NewShooting = {
        ...form,
        status:
          form.status === "Annulé"
            ? form.status
            : ShootingService.statusFromChecklist(form as Shooting),
      };
      await ShootingService.create(shootingToCreate);
      setFeedback("Le shooting a été créé.");
      setForm(emptyForm);
      setShowCreate(false);
      await onRefresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Création impossible.");
    } finally {
      setSaving(false);
    }
  };

  const saveShooting = async () => {
    if (!selected?.row) return;
    setSaving(true);
    setFeedback("");

    const nextStatus =
      selected.status === "Annulé"
        ? selected.status
        : ShootingService.statusFromChecklist(selected);

    const update: ShootingUpdate = {
      row: selected.row,
      date: selected.date,
      athlete: selected.athlete,
      sport: selected.sport,
      type: selected.type,
      place: selected.place,
      objective: selected.objective,
      photographer: selected.photographer,
      status: nextStatus,
      photos: selected.photos,
      videos: selected.videos,
      lightroomLink: selected.lightroomLink,
      driveLink: selected.driveLink,
      clientGalleryLink: selected.clientGalleryLink,
      instagramLink: selected.instagramLink,
      shootingDone: selected.shootingDone,
      importDone: selected.importDone,
      backupDone: selected.backupDone,
      sortDone: selected.sortDone,
      retouchDone: selected.retouchDone,
      exportDone: selected.exportDone,
      driveDone: selected.driveDone,
      publishedInstagram: selected.publishedInstagram,
      publishedFacebook: selected.publishedFacebook,
      publishedLinkedIn: selected.publishedLinkedIn,
      published: selected.published,
      deliverableClub: selected.deliverableClub,
      deliverableAthlete: selected.deliverableAthlete,
      deliverableSponsor: selected.deliverableSponsor,
      deliverableMedia: selected.deliverableMedia,
      deliverableAgency: selected.deliverableAgency,
      deliverableOther: selected.deliverableOther,
      notes: selected.notes,
    };

    try {
      await ShootingService.update(update);
      setFeedback("Le shooting a été mis à jour.");
      setSelected(null);
      await onRefresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Mise à jour impossible.");
    } finally {
      setSaving(false);
    }
  };

  const deleteShooting = async () => {
    if (!selected?.row) return;
    if (!window.confirm(`Supprimer définitivement le shooting de ${selected.athlete} ?`)) return;
    setSaving(true);
    setFeedback("");
    try {
      await ShootingService.remove(selected.row);
      setFeedback("Le shooting a été supprimé.");
      setSelected(null);
      await onRefresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  };

  const planned = shootings.filter((item) => ShootingService.statusFromChecklist(item) === "Planifié").length;
  const complete = shootings.filter(ShootingService.isComplete).length;
  const toProcess = shootings.filter(
    (item) =>
      ShootingService.statusFromChecklist(item) !== "Planifié" &&
      !ShootingService.isComplete(item) &&
      item.status !== "Annulé"
  ).length;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Production photo · V0.13</p>
          <h2>Shootings</h2>
          <p>Crée, consulte et termine chaque shooting depuis une seule fiche.</p>
        </div>
        <button className="primary-button" onClick={() => setShowCreate(true)}>+ Nouveau shooting</button>
      </section>

      {source === "demo" && <div className="connection-banner"><strong>Mode démo pour les shootings</strong><small>{message}</small></div>}
      {feedback && <div className="success-banner">{feedback}</div>}

      <section className="module-kpis">
        <article><span>Total</span><strong>{shootings.length}</strong><small>shootings enregistrés</small></article>
        <article><span>Planifiés</span><strong>{planned}</strong><small>à venir</small></article>
        <article><span>À traiter</span><strong>{toProcess}</strong><small>workflow incomplet</small></article>
        <article><span>Terminés</span><strong>{complete}</strong><small>livrés ou publiés</small></article>
      </section>

      <section className="module-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un athlète, un sport, un type ou un lieu…" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          {statuses.map((item) => <option key={item}>{item}</option>)}
        </select>
        <span>{visible.length} résultat(s)</span>
      </section>

      {visible.length === 0 ? (
        <section className="shooting-empty-state"><strong>Aucun shooting trouvé.</strong><p>Modifie les filtres ou crée un nouveau shooting.</p></section>
      ) : (
        <section className="shooting-pro-grid">
          {visible.map((shooting, index) => {
            const progress = ShootingService.progress(shooting);
            return (
              <article className="shooting-pro-card" key={`${shooting.row ?? index}-${shooting.athlete}`}>
                <div className="shooting-pro-head">
                  <div>
                    <p className="eyebrow">{ShootingService.formatDate(shooting.date)} · {shooting.sport || "Sport à compléter"}</p>
                    <h3>{shooting.athlete || "Athlète à compléter"}</h3>
                    <span>{shooting.type || "Type à compléter"}</span>
                  </div>
                  <span className="status-chip">{shootingStatus(shooting) || "À définir"}</span>
                </div>
                <div className="shooting-pro-details">
                  <div><span>Lieu</span><strong>{shooting.place || "À compléter"}</strong></div>
                  <div><span>Photos</span><strong>{shooting.photos}</strong></div>
                  <div><span>Vidéos</span><strong>{shooting.videos}</strong></div>
                </div>
                <div className="shooting-workflow">
                  {workflowFields.map((step) => <span className={shooting[step.key] ? "done" : ""} key={step.key}>{step.label}</span>)}
                </div>
                <div className="usage-progress">
                  <div><span>Progression</span><strong>{progress}%</strong></div>
                  <div className="usage-track"><span style={{ width: `${progress}%` }} /></div>
                </div>
                <div className="shooting-pro-actions">
                  <p>{shooting.objective || "Aucun objectif renseigné."}</p>
                  <button onClick={() => setSelected({ ...shooting })}>Ouvrir la fiche →</button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {showCreate && (
        <Modal title="Créer un shooting" onClose={() => setShowCreate(false)}>
          <form className="modal-form" onSubmit={createShooting}>
            <label><span>Athlète</span><select value={form.athlete} onChange={(event) => selectAthlete(event.target.value, "create")} required><option value="">Choisir…</option>{athletes.map((athlete) => <option key={athlete.name}>{athlete.name}</option>)}</select></label>
            <label><span>Date</span><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></label>
            <label><span>Type</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option>Portrait</option><option>Action</option><option>Interview</option><option>Lifestyle</option><option>Sponsor</option><option>Événement</option></select></label>
            <label><span>Lieu</span><input value={form.place} onChange={(event) => setForm({ ...form, place: event.target.value })} /></label>
            <label><span>Photographe</span><input value={form.photographer} onChange={(event) => setForm({ ...form, photographer: event.target.value })} /></label>
            <label className="modal-wide"><span>Objectif</span><textarea value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} /></label>
            <div className="modal-actions modal-wide"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Annuler</button><button className="primary-button" disabled={saving}>{saving ? "Création…" : "Créer"}</button></div>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={`${selected.athlete} · ${selected.type || "Shooting"}`} onClose={() => setSelected(null)}>
          <div className="shooting-editor shooting-editor-complete">
            <section className="shooting-detail-hero">
              <div><p className="eyebrow">{ShootingService.formatDate(selected.date)} · {selected.sport || "Sport à compléter"}</p><h3>{selected.type || "Shooting"}</h3><p>{selected.place || "Lieu à compléter"}</p></div>
              <div><span>Progression</span><strong>{ShootingService.progress(selected)}%</strong></div>
            </section>

            <div className="shooting-core-grid">
              <label><span>Date</span><input type="date" value={selected.date} onChange={(event) => setSelected({ ...selected, date: event.target.value })} /></label>
              <label><span>Athlète</span><select value={selected.athlete} onChange={(event) => selectAthlete(event.target.value, "edit")}>{athletes.map((athlete) => <option key={athlete.name}>{athlete.name}</option>)}</select></label>
              <label><span>Sport</span><input value={selected.sport} onChange={(event) => setSelected({ ...selected, sport: event.target.value })} /></label>
              <label><span>Type</span><input value={selected.type} onChange={(event) => setSelected({ ...selected, type: event.target.value })} /></label>
              <label><span>Lieu</span><input value={selected.place} onChange={(event) => setSelected({ ...selected, place: event.target.value })} /></label>
              <label><span>Photographe</span><input value={selected.photographer} onChange={(event) => setSelected({ ...selected, photographer: event.target.value })} /></label>
              <label><span>Statut</span><select value={selected.status} onChange={(event) => setSelected({ ...selected, status: event.target.value })}><option>Planifié</option><option>En cours</option><option>Terminé</option><option>Annulé</option></select></label>
              <label><span>Photos</span><input type="number" min="0" value={selected.photos} onChange={(event) => setSelected({ ...selected, photos: Number(event.target.value) })} /></label>
              <label><span>Vidéos</span><input type="number" min="0" value={selected.videos} onChange={(event) => setSelected({ ...selected, videos: Number(event.target.value) })} /></label>
            </div>

            <label className="editor-notes"><span>Objectif</span><textarea value={selected.objective} onChange={(event) => setSelected({ ...selected, objective: event.target.value })} /></label>

            <section className="editor-section">
              <div className="section-heading">
                <p className="eyebrow">Médias</p>
                <h3>Liens de diffusion</h3>
              </div>
              <label><span>Lightroom</span><input value={selected.lightroomLink} onChange={(event) => setSelected({ ...selected, lightroomLink: event.target.value })} /></label>
              <label><span>Google Drive</span><input value={selected.driveLink} onChange={(event) => setSelected({ ...selected, driveLink: event.target.value })} /></label>
              <label><span>Galerie client</span><input value={selected.clientGalleryLink} onChange={(event) => setSelected({ ...selected, clientGalleryLink: event.target.value })} /></label>
              <label><span>Instagram</span><input value={selected.instagramLink} onChange={(event) => setSelected({ ...selected, instagramLink: event.target.value })} /></label>
            </section>

            <section className="editor-section">
              <div className="section-heading">
                <p className="eyebrow">Checklist de production</p>
                <h3>Suivi du workflow</h3>
              </div>
              <div className="checkbox-grid">
                {productionChecklistFields.map((step) => (
                  <label key={step.key} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selected[step.key]}
                      onChange={(event) => {
                        const next = {
                          ...selected,
                          [step.key]: event.target.checked,
                        } as Shooting;
                        const nextStatus =
                          selected.status === "Annulé"
                            ? "Annulé"
                            : ShootingService.statusFromChecklist(next);
                        setSelected({ ...next, status: nextStatus });
                      }}
                    />
                    <span>{step.label}</span>
                  </label>
                ))}
              </div>
              <div className="progress-summary">
                <span>Progression</span>
                <strong>{ShootingService.progress(selected)}%</strong>
              </div>
              <div className="usage-track">
                <span style={{ width: `${ShootingService.progress(selected)}%` }} />
              </div>
            </section>

            <section className="editor-section">
              <div className="section-heading">
                <p className="eyebrow">Livrables</p>
                <h3>Destinataires</h3>
              </div>
              <div className="checkbox-grid">
                {deliverableFields.map((item) => (
                  <label key={item.key} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selected[item.key]}
                      onChange={(event) =>
                        setSelected({ ...selected, [item.key]: event.target.checked })
                      }
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <label className="editor-notes"><span>Notes internes</span><textarea value={selected.notes} onChange={(event) => setSelected({ ...selected, notes: event.target.value })} /></label>

            <div className="shooting-linked-actions">
              {onOpenAthlete && athletes.find((athlete) => athlete.name === selected.athlete) && (
                <button className="secondary-button" onClick={() => onOpenAthlete(athletes.find((athlete) => athlete.name === selected.athlete)!)}>Voir la fiche athlète</button>
              )}
            </div>

            <div className="modal-actions shooting-modal-actions">
              <button className="danger-button" onClick={deleteShooting} disabled={saving}>Supprimer</button>
              <div><button className="secondary-button" onClick={() => setSelected(null)}>Annuler</button><button className="primary-button" onClick={saveShooting} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button></div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
