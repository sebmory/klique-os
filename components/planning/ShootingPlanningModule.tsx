"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Shooting } from "@/types/shooting";
import type {
  NewShootingPlanning,
  PlanningStepKey,
  ShootingPlanning,
} from "@/types/planning";
import { PlanningService } from "@/services/planning.service";
import { Modal } from "@/components/ui/Modal";

const emptyPlanning: NewShootingPlanning = {
  shootingRow: undefined,
  athlete: "",
  sport: "",
  title: "",
  date: "",
  shootingTime: "14:00",
  place: "",
  travelMinutes: 30,
  setupMinutes: 20,
  shootingMinutes: 75,
  selectionMinutes: 45,
  editingMinutes: 90,
  exportMinutes: 20,
  uploadMinutes: 25,
  publicationTime: "19:00",
  status: "Planifié",
  notes: "",
  departureDone: false,
  arrivalDone: false,
  setupDone: false,
  shootingDone: false,
  selectionDone: false,
  editingDone: false,
  exportDone: false,
  uploadDone: false,
  publicationDone: false,
};

export function ShootingPlanningModule({
  shootings,
  planning,
  source,
  message,
  onRefresh,
}: {
  shootings: Shooting[];
  planning: ShootingPlanning[];
  source: "google-sheets" | "demo";
  message: string;
  onRefresh: () => Promise<void>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<ShootingPlanning | null>(null);
  const [form, setForm] = useState<NewShootingPlanning>(emptyPlanning);
  const [filter, setFilter] = useState("Tous");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const visible = useMemo(
    () =>
      [...planning]
        .filter((item) => filter === "Tous" || item.status === filter)
        .sort((a, b) =>
          `${a.date}T${a.shootingTime}`.localeCompare(
            `${b.date}T${b.shootingTime}`
          )
        ),
    [planning, filter]
  );

  const selectShooting = (rowValue: string) => {
    const row = Number(rowValue);
    const shooting = shootings.find((item) => item.row === row);

    if (!shooting) {
      setForm(emptyPlanning);
      return;
    }

    setForm({
      ...emptyPlanning,
      shootingRow: shooting.row,
      athlete: shooting.athlete,
      sport: shooting.sport,
      title: shooting.type || "Shooting",
      date: shooting.date,
      place: shooting.place,
      notes: shooting.objective,
    });
  };

  const createPlanning = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback("");

    try {
      await PlanningService.create(form);
      setFeedback("Le planning a été créé dans Google Sheets.");
      setForm(emptyPlanning);
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

  const toggleStep = async (
    key: PlanningStepKey,
    value: boolean
  ) => {
    if (!selected?.row) return;

    const next = { ...selected, [key]: value };
    setSelected(next);
    setSaving(true);

    try {
      await PlanningService.update({ row: selected.row, [key]: value });
      await onRefresh();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Mise à jour impossible."
      );
    } finally {
      setSaving(false);
    }
  };

  const totalMinutes = planning.reduce(
    (sum, item) => sum + PlanningService.totalMinutes(item),
    0
  );

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Assistant de production · V0.10.1</p>
          <h2>Planning shooting</h2>
          <p>
            Une timeline automatique avant, pendant et après chaque séance.
          </p>
        </div>
        <button className="primary-button" onClick={() => setShowCreate(true)}>
          + Créer un planning
        </button>
      </section>

      {source === "demo" && (
        <div className="connection-banner">
          <strong>Mode démo pour le planning</strong>
          <small>{message}</small>
        </div>
      )}

      {feedback && <div className="success-banner">{feedback}</div>}

      <section className="module-kpis">
        <article>
          <span>Plannings</span>
          <strong>{planning.length}</strong>
          <small>journées organisées</small>
        </article>
        <article>
          <span>Temps planifié</span>
          <strong>{Math.round(totalMinutes / 60)} h</strong>
          <small>trajets et production</small>
        </article>
        <article>
          <span>À réaliser</span>
          <strong>
            {planning.filter((item) => PlanningService.progress(item) < 100).length}
          </strong>
          <small>plannings actifs</small>
        </article>
        <article>
          <span>Terminés</span>
          <strong>
            {planning.filter((item) => PlanningService.progress(item) === 100).length}
          </strong>
          <small>journées complètes</small>
        </article>
      </section>

      <section className="planning-toolbar">
        <div>
          <span>Afficher</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option>Tous</option>
            <option>Planifié</option>
            <option>En cours</option>
            <option>Terminé</option>
            <option>Annulé</option>
          </select>
        </div>
        <p>{visible.length} planning(s)</p>
      </section>

      <section className="planning-grid">
        {visible.map((item, index) => {
          const timeline = PlanningService.timeline(item);
          const progress = PlanningService.progress(item);

          return (
            <article className="planning-card" key={`${item.row ?? index}-${item.id}`}>
              <header className="planning-card-header">
                <div>
                  <p className="eyebrow">{item.date} · {item.sport}</p>
                  <h3>{item.athlete}</h3>
                  <span>{item.title} · {item.place || "Lieu à compléter"}</span>
                </div>
                <span className="status-chip">{item.status}</span>
              </header>

              <div className="planning-summary">
                <div>
                  <span>Début shooting</span>
                  <strong>{item.shootingTime}</strong>
                </div>
                <div>
                  <span>Temps total</span>
                  <strong>{Math.round(PlanningService.totalMinutes(item) / 60 * 10) / 10} h</strong>
                </div>
                <div>
                  <span>Publication</span>
                  <strong>{item.publicationTime || "À définir"}</strong>
                </div>
              </div>

              <div className="planning-progress">
                <div>
                  <span>Avancement</span>
                  <strong>{progress}%</strong>
                </div>
                <div className="usage-track">
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className="planning-mini-timeline">
                {timeline.slice(0, 5).map((step) => (
                  <div key={step.key} className={item[step.key] ? "done" : ""}>
                    <span>{step.time}</span>
                    <strong>{step.label}</strong>
                  </div>
                ))}
              </div>

              <button className="planning-open" onClick={() => setSelected({ ...item })}>
                Ouvrir le planning complet →
              </button>
            </article>
          );
        })}
      </section>

      {showCreate && (
        <Modal title="Créer un planning shooting" onClose={() => setShowCreate(false)}>
          <form className="modal-form planning-form" onSubmit={createPlanning}>
            <label className="modal-wide">
              <span>Shooting existant</span>
              <select
                value={form.shootingRow ?? ""}
                onChange={(event) => selectShooting(event.target.value)}
              >
                <option value="">Choisir un shooting…</option>
                {shootings.map((shooting, index) => (
                  <option
                    key={`${shooting.row ?? index}-${shooting.athlete}`}
                    value={shooting.row}
                  >
                    {shooting.date} · {shooting.athlete} · {shooting.type}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Athlète</span>
              <input
                value={form.athlete}
                onChange={(event) => setForm({ ...form, athlete: event.target.value })}
                required
              />
            </label>

            <label>
              <span>Titre</span>
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                required
              />
            </label>

            <label>
              <span>Date</span>
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
                required
              />
            </label>

            <label>
              <span>Heure du shooting</span>
              <input
                type="time"
                value={form.shootingTime}
                onChange={(event) => setForm({ ...form, shootingTime: event.target.value })}
                required
              />
            </label>

            <label>
              <span>Trajet (minutes)</span>
              <input
                type="number"
                min="0"
                value={form.travelMinutes}
                onChange={(event) => setForm({ ...form, travelMinutes: Number(event.target.value) })}
              />
            </label>

            <label>
              <span>Installation</span>
              <input
                type="number"
                min="0"
                value={form.setupMinutes}
                onChange={(event) => setForm({ ...form, setupMinutes: Number(event.target.value) })}
              />
            </label>

            <label>
              <span>Durée shooting</span>
              <input
                type="number"
                min="0"
                value={form.shootingMinutes}
                onChange={(event) => setForm({ ...form, shootingMinutes: Number(event.target.value) })}
              />
            </label>

            <label>
              <span>Tri / sélection</span>
              <input
                type="number"
                min="0"
                value={form.selectionMinutes}
                onChange={(event) => setForm({ ...form, selectionMinutes: Number(event.target.value) })}
              />
            </label>

            <label>
              <span>Retouche</span>
              <input
                type="number"
                min="0"
                value={form.editingMinutes}
                onChange={(event) => setForm({ ...form, editingMinutes: Number(event.target.value) })}
              />
            </label>

            <label>
              <span>Export</span>
              <input
                type="number"
                min="0"
                value={form.exportMinutes}
                onChange={(event) => setForm({ ...form, exportMinutes: Number(event.target.value) })}
              />
            </label>

            <label>
              <span>Upload / sauvegarde</span>
              <input
                type="number"
                min="0"
                value={form.uploadMinutes}
                onChange={(event) => setForm({ ...form, uploadMinutes: Number(event.target.value) })}
              />
            </label>

            <label>
              <span>Heure publication</span>
              <input
                type="time"
                value={form.publicationTime}
                onChange={(event) => setForm({ ...form, publicationTime: event.target.value })}
              />
            </label>

            <label className="modal-wide">
              <span>Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>

            <div className="modal-actions modal-wide">
              <button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>
                Annuler
              </button>
              <button className="primary-button" disabled={saving}>
                {saving ? "Création…" : "Créer la timeline"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal
          title={`${selected.athlete} · ${selected.title}`}
          onClose={() => setSelected(null)}
        >
          <div className="planning-detail">
            <section className="planning-detail-hero">
              <div>
                <p className="eyebrow">{selected.date} · {selected.sport}</p>
                <h3>{selected.title}</h3>
                <p>{selected.place || "Lieu à compléter"}</p>
              </div>
              <div>
                <span>Progression</span>
                <strong>{PlanningService.progress(selected)}%</strong>
              </div>
            </section>

            <section className="planning-timeline">
              {PlanningService.timeline(selected).map((step) => (
                <label
                  key={step.key}
                  className={selected[step.key] ? "done" : ""}
                >
                  <input
                    type="checkbox"
                    checked={selected[step.key]}
                    onChange={(event) =>
                      toggleStep(
                        step.key as PlanningStepKey,
                        event.target.checked
                      )
                    }
                    disabled={saving}
                  />
                  <span className="planning-time">{step.time}</span>
                  <div>
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                  </div>
                </label>
              ))}
            </section>

            {selected.notes && (
              <div className="planning-notes">
                <span>Notes</span>
                <p>{selected.notes}</p>
              </div>
            )}

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setSelected(null)}>
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
