"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Athlete } from "@/types/athlete";
import type { MediaFilter, MediaLot, NewMediaLot } from "@/types/media";
import { MediaService } from "@/services/media.service";
import { Modal } from "@/components/ui/Modal";

const emptyForm: NewMediaLot = {
  date: "",
  athlete: "",
  sport: "",
  mediaType: "Photos",
  event: "",
  place: "",
  totalFiles: 0,
  vertical: 0,
  horizontal: 0,
  square: 0,
  premiumTotal: 0,
  filesUsed: 0,
  premiumUsed: 0,
  favorites: 0,
  videos: 0,
  source: "Sébastien Mory",
  driveLink: "",
  lastUse: "",
  associatedContent: "",
  rights: "KLIQUE + athlète",
  notes: "",
};

const defaultFilter: MediaFilter = {
  search: "",
  sport: "Tous",
  orientation: "Tous",
  quality: "Tous",
};

export function MediaCenterModule({
  athletes,
  media,
  source,
  message,
  onRefresh,
}: {
  athletes: Athlete[];
  media: MediaLot[];
  source: "google-sheets" | "demo";
  message: string;
  onRefresh: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<MediaFilter>(defaultFilter);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<MediaLot | null>(null);
  const [form, setForm] = useState<NewMediaLot>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const visible = useMemo(
    () => MediaService.filter(media, filter),
    [media, filter]
  );

  const sports = [
    "Tous",
    ...Array.from(new Set(media.map((lot) => lot.sport))).filter(Boolean),
  ];

  const selectAthlete = (name: string) => {
    const athlete = athletes.find((item) => item.name === name);
    setForm((current) => ({
      ...current,
      athlete: name,
      sport: athlete?.sport ?? "",
    }));
  };

  const createLot = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback("");

    try {
      await MediaService.create(form);
      setFeedback("Le lot média a été ajouté dans Google Sheets.");
      setForm(emptyForm);
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

  const totals = {
    files: media.reduce((sum, lot) => sum + lot.filesRemaining, 0),
    premium: media.reduce((sum, lot) => sum + lot.premiumRemaining, 0),
    favorites: media.reduce((sum, lot) => sum + lot.favorites, 0),
    videos: media.reduce((sum, lot) => sum + lot.videos, 0),
  };

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Banque média Premium · V0.8</p>
          <h2>Media Center</h2>
          <p>
            Recherche, filtres, favoris, Premium, orientations et accès direct
            aux dossiers Drive.
          </p>
        </div>
        <button className="primary-button" onClick={() => setShowCreate(true)}>
          + Ajouter un lot
        </button>
      </section>

      {source === "demo" && (
        <div className="connection-banner">
          <strong>Mode démo pour le Media Center</strong>
          <small>{message}</small>
        </div>
      )}

      {feedback && <div className="success-banner">{feedback}</div>}

      <section className="module-kpis">
        <article>
          <span>Fichiers disponibles</span>
          <strong>{totals.files}</strong>
          <small>non utilisés</small>
        </article>
        <article>
          <span>Premium restants</span>
          <strong>{totals.premium}</strong>
          <small>contenus prioritaires</small>
        </article>
        <article>
          <span>Favoris</span>
          <strong>{totals.favorites}</strong>
          <small>images sélectionnées</small>
        </article>
        <article>
          <span>Vidéos</span>
          <strong>{totals.videos}</strong>
          <small>séquences disponibles</small>
        </article>
      </section>

      <section className="media-filter-panel">
        <input
          value={filter.search}
          onChange={(event) =>
            setFilter({ ...filter, search: event.target.value })
          }
          placeholder="Rechercher un athlète, un shooting, un lieu…"
        />

        <select
          value={filter.sport}
          onChange={(event) =>
            setFilter({ ...filter, sport: event.target.value })
          }
        >
          {sports.map((sport) => (
            <option key={sport}>{sport}</option>
          ))}
        </select>

        <select
          value={filter.orientation}
          onChange={(event) =>
            setFilter({
              ...filter,
              orientation: event.target.value as MediaFilter["orientation"],
            })
          }
        >
          <option>Tous</option>
          <option>Vertical</option>
          <option>Horizontal</option>
          <option>Carré</option>
          <option>Vidéo</option>
        </select>

        <select
          value={filter.quality}
          onChange={(event) =>
            setFilter({
              ...filter,
              quality: event.target.value as MediaFilter["quality"],
            })
          }
        >
          <option>Tous</option>
          <option>Premium</option>
          <option>À renouveler</option>
          <option>Disponible</option>
        </select>

        <button
          className="secondary-button"
          onClick={() => setFilter(defaultFilter)}
        >
          Réinitialiser
        </button>
      </section>

      <section className="media-results-heading">
        <div>
          <strong>{visible.length}</strong>
          <span>lot(s) média</span>
        </div>
        <p>
          Clique sur une carte pour ouvrir sa fiche détaillée.
        </p>
      </section>

      <section className="media-gallery-grid">
        {visible.map((lot, index) => {
          const usage = MediaService.usagePercent(lot);
          const health = MediaService.health(lot);

          return (
            <button
              className="media-gallery-card"
              key={`${lot.row ?? index}-${lot.athlete}-${lot.event}`}
              onClick={() => setSelected(lot)}
            >
              <div className={`media-visual media-visual-${health}`}>
                <div className="media-visual-top">
                  <span>{lot.mediaType || "Média"}</span>
                  <span>{lot.date || "Sans date"}</span>
                </div>

                <div className="media-monogram">
                  {lot.athlete
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </div>

                <div className="media-format-badges">
                  {lot.vertical > 0 && <span>{lot.vertical} V</span>}
                  {lot.horizontal > 0 && <span>{lot.horizontal} H</span>}
                  {lot.square > 0 && <span>{lot.square} C</span>}
                  {lot.videos > 0 && <span>{lot.videos} vidéos</span>}
                </div>
              </div>

              <div className="media-gallery-body">
                <div className="media-gallery-title">
                  <div>
                    <p className="eyebrow">{lot.athlete}</p>
                    <h3>{lot.event || "Lot sans nom"}</h3>
                  </div>
                  <span className={`health-pill ${health}`}>
                    {health === "solid"
                      ? "Solide"
                      : health === "correct"
                      ? "Correct"
                      : health === "fragile"
                      ? "Fragile"
                      : "Critique"}
                  </span>
                </div>

                <p>
                  {lot.place || "Lieu à compléter"} ·{" "}
                  {lot.sport || "Sport à compléter"}
                </p>

                <div className="media-gallery-stats">
                  <div>
                    <span>Restants</span>
                    <strong>{lot.filesRemaining}</strong>
                  </div>
                  <div>
                    <span>Premium</span>
                    <strong>{lot.premiumRemaining}</strong>
                  </div>
                  <div>
                    <span>Favoris</span>
                    <strong>{lot.favorites}</strong>
                  </div>
                </div>

                <div className="usage-progress">
                  <div>
                    <span>Utilisation</span>
                    <strong>{usage}%</strong>
                  </div>
                  <div className="usage-track">
                    <span style={{ width: `${usage}%` }} />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {showCreate && (
        <Modal title="Ajouter un lot média" onClose={() => setShowCreate(false)}>
          <form className="modal-form media-modal-form" onSubmit={createLot}>
            <label>
              <span>Athlète</span>
              <select
                value={form.athlete}
                onChange={(event) => selectAthlete(event.target.value)}
                required
              >
                <option value="">Choisir…</option>
                {athletes.map((athlete) => (
                  <option key={athlete.name}>{athlete.name}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Date</span>
              <input
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
                required
              />
            </label>

            <label>
              <span>Événement</span>
              <input
                value={form.event}
                onChange={(event) =>
                  setForm({ ...form, event: event.target.value })
                }
                required
              />
            </label>

            <label>
              <span>Type</span>
              <select
                value={form.mediaType}
                onChange={(event) =>
                  setForm({ ...form, mediaType: event.target.value })
                }
              >
                <option>Photos</option>
                <option>Vidéos</option>
                <option>Photos + vidéos</option>
                <option>Graphismes</option>
                <option>Mixte</option>
              </select>
            </label>

            <label>
              <span>Total fichiers</span>
              <input
                type="number"
                min="0"
                value={form.totalFiles}
                onChange={(event) =>
                  setForm({
                    ...form,
                    totalFiles: Number(event.target.value),
                  })
                }
              />
            </label>

            <label>
              <span>Premium total</span>
              <input
                type="number"
                min="0"
                value={form.premiumTotal}
                onChange={(event) =>
                  setForm({
                    ...form,
                    premiumTotal: Number(event.target.value),
                  })
                }
              />
            </label>

            <label>
              <span>Verticales</span>
              <input
                type="number"
                min="0"
                value={form.vertical}
                onChange={(event) =>
                  setForm({ ...form, vertical: Number(event.target.value) })
                }
              />
            </label>

            <label>
              <span>Horizontales</span>
              <input
                type="number"
                min="0"
                value={form.horizontal}
                onChange={(event) =>
                  setForm({
                    ...form,
                    horizontal: Number(event.target.value),
                  })
                }
              />
            </label>

            <label>
              <span>Carrées</span>
              <input
                type="number"
                min="0"
                value={form.square}
                onChange={(event) =>
                  setForm({ ...form, square: Number(event.target.value) })
                }
              />
            </label>

            <label>
              <span>Vidéos</span>
              <input
                type="number"
                min="0"
                value={form.videos}
                onChange={(event) =>
                  setForm({ ...form, videos: Number(event.target.value) })
                }
              />
            </label>

            <label>
              <span>Fichiers utilisés</span>
              <input
                type="number"
                min="0"
                value={form.filesUsed}
                onChange={(event) =>
                  setForm({
                    ...form,
                    filesUsed: Number(event.target.value),
                  })
                }
              />
            </label>

            <label>
              <span>Premium utilisés</span>
              <input
                type="number"
                min="0"
                value={form.premiumUsed}
                onChange={(event) =>
                  setForm({
                    ...form,
                    premiumUsed: Number(event.target.value),
                  })
                }
              />
            </label>

            <label className="modal-wide">
              <span>Lien Google Drive</span>
              <input
                value={form.driveLink}
                onChange={(event) =>
                  setForm({ ...form, driveLink: event.target.value })
                }
                placeholder="https://drive.google.com/..."
              />
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
                {saving ? "Enregistrement…" : "Ajouter le lot"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal
          title={`${selected.athlete} · ${selected.event}`}
          onClose={() => setSelected(null)}
        >
          <div className="media-detail-modal">
            <div className="media-detail-hero">
              <div className="media-monogram large">
                {selected.athlete
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div>
                <p className="eyebrow">{selected.sport}</p>
                <h3>{selected.event}</h3>
                <p>{selected.place || "Lieu non renseigné"}</p>
              </div>
            </div>

            <section className="media-detail-grid">
              <div>
                <span>Total</span>
                <strong>{selected.totalFiles}</strong>
              </div>
              <div>
                <span>Restants</span>
                <strong>{selected.filesRemaining}</strong>
              </div>
              <div>
                <span>Premium restants</span>
                <strong>{selected.premiumRemaining}</strong>
              </div>
              <div>
                <span>Favoris</span>
                <strong>{selected.favorites}</strong>
              </div>
              <div>
                <span>Verticales</span>
                <strong>{selected.vertical}</strong>
              </div>
              <div>
                <span>Horizontales</span>
                <strong>{selected.horizontal}</strong>
              </div>
            </section>

            <section className="media-detail-info">
              <div>
                <span>Droits</span>
                <strong>{selected.rights || "À vérifier"}</strong>
              </div>
              <div>
                <span>Dernière utilisation</span>
                <strong>{selected.lastUse || "Jamais"}</strong>
              </div>
              <div>
                <span>Contenu associé</span>
                <strong>{selected.associatedContent || "Aucun"}</strong>
              </div>
            </section>

            <div className="modal-actions">
              {selected.driveLink && (
                <a
                  href={selected.driveLink}
                  target="_blank"
                  rel="noreferrer"
                  className="primary-button media-drive-button"
                >
                  Ouvrir le dossier Drive
                </a>
              )}
              <button
                className="secondary-button"
                onClick={() => setSelected(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
