"use client";

import { FormEvent, type ReactNode, useMemo, useState } from "react";
import type { Athlete } from "@/types/athlete";
import type { MediaFilter, MediaLot, NewMediaLot } from "@/types/media";
import { MediaService } from "@/services/media.service";
import { Modal } from "@/components/ui/Modal";
import {
  Button,
  Input,
  Modal as DialogSurface,
  Select,
  Textarea,
} from "@/src/design-system/components";

const fieldControlStyle = { width: "100%", borderRadius: "12px", padding: "0.6rem 0.7rem" } as const;

const secondaryButtonStyle = {
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#374151",
  borderRadius: "999px",
  padding: "0.6rem 1rem",
  cursor: "pointer",
  fontWeight: 700,
} as const;

const Field = ({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) => (
  <label style={{ display: "grid", gap: "0.35rem", gridColumn: wide ? "1 / -1" : "auto" }}>
    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#374151" }}>{label}</span>
    {children}
  </label>
);

const emptyForm: NewMediaLot = {
  date: "",
  athlete: "",
  athleteIds: [],
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
  const [athleteQuery, setAthleteQuery] = useState("");
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

  const athleteById = useMemo(() => {
    const index = new Map<string, Athlete>();
    for (const athlete of athletes) index.set(athlete.key, athlete);
    return index;
  }, [athletes]);

  const selectedAthleteIds = useMemo(() => form.athleteIds ?? [], [form.athleteIds]);

  const athleteResults = useMemo(() => {
    const query = athleteQuery.trim().toLowerCase();
    const available = athletes.filter((athlete) => !selectedAthleteIds.includes(athlete.key));
    if (!query) return available.slice(0, 8);
    return available
      .filter((athlete) => `${athlete.name} ${athlete.sport}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [athleteQuery, athletes, selectedAthleteIds]);

  // Le payload conserve les noms dans athlete et les identifiants dans athleteIds.
  const applyAthleteIds = (athleteIds: string[]) => {
    const selected = athleteIds
      .map((athleteId) => athleteById.get(athleteId))
      .filter((athlete): athlete is Athlete => Boolean(athlete));

    setForm((current) => ({
      ...current,
      athlete: selected.map((athlete) => athlete.name).join(", "),
      athleteIds: selected.map((athlete) => athlete.key),
      sport: selected[0]?.sport ?? "",
    }));
  };

  const createLot = async (event: FormEvent) => {
    event.preventDefault();

    if (selectedAthleteIds.length === 0) {
      setFeedback("Sélectionnez au moins un athlète.");
      return;
    }

    const galleryUrl = form.driveLink.trim();
    if (galleryUrl && !galleryUrl.startsWith("https://")) {
      setFeedback("La galerie PhotoDeck doit être une URL https.");
      return;
    }

    setSaving(true);
    setFeedback("");

    try {
      // Le lien part en galleryUrl : l API conserve driveLink pour les anciens lots.
      const payload: NewMediaLot & { galleryUrl: string } = { ...form, driveLink: galleryUrl, galleryUrl };
      await MediaService.create(payload);
      setFeedback("Le lot média a été ajouté dans Google Sheets.");
      setForm(emptyForm);
      setAthleteQuery("");
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
        {visible.map((lot: MediaLot, index: number) => {
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
                    .map((part: string) => part[0])
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
        <div
          role="presentation"
          onMouseDown={() => setShowCreate(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(15, 23, 42, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: "1.5rem",
            overflowY: "auto",
          }}
        >
          <DialogSurface
            aria-modal="true"
            aria-label="Ajouter un lot média"
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              width: "min(920px, 100%)",
              maxHeight: "88vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: "20px",
              border: "1px solid #f0e2d0",
              boxShadow: "0 30px 60px rgba(15, 23, 42, 0.25)",
              padding: "1.4rem",
              display: "grid",
              gap: "1.1rem",
            }}
          >
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.76rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>
                  Banque médias
                </p>
                <h3 style={{ margin: "0.25rem 0 0", fontSize: "1.2rem", color: "#111827" }}>Ajouter un lot média</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                aria-label="Fermer"
                style={{ border: "none", background: "transparent", color: "#6b7280", cursor: "pointer", fontSize: "1.3rem", lineHeight: 1 }}
              >
                ×
              </button>
            </header>

            <form onSubmit={createLot} style={{ display: "grid", gap: "1rem" }}>
              <div style={{ display: "grid", gap: "0.6rem", padding: "0.9rem", border: "1px solid #f0e2d0", borderRadius: "16px", background: "#fffdf9" }}>
                <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>Athlètes concernés</p>

                {selectedAthleteIds.length > 0 ? (
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {selectedAthleteIds.map((athleteId) => {
                      const label = athleteById.get(athleteId)?.name ?? athleteId;
                      return (
                        <span
                          key={athleteId}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "#eff6ff", color: "#1d4ed8", borderRadius: "999px", padding: "0.35rem 0.65rem", fontWeight: 700, fontSize: "0.88rem" }}
                        >
                          {label}
                          <button
                            type="button"
                            aria-label={`Retirer ${label}`}
                            onClick={() => applyAthleteIds(selectedAthleteIds.filter((entry) => entry !== athleteId))}
                            style={{ border: "none", background: "transparent", color: "#1d4ed8", cursor: "pointer", fontWeight: 700 }}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9rem" }}>Aucun athlète associé pour l’instant.</p>
                )}

                <Input
                  placeholder="Rechercher un athlète…"
                  value={athleteQuery}
                  onChange={(event) => setAthleteQuery(event.target.value)}
                  style={{ ...fieldControlStyle, maxWidth: "420px" }}
                />

                {athleteResults.length > 0 ? (
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {athleteResults.map((athlete) => (
                      <button
                        key={athlete.key}
                        type="button"
                        onClick={() => {
                          applyAthleteIds([...selectedAthleteIds, athlete.key]);
                          setAthleteQuery("");
                        }}
                        style={secondaryButtonStyle}
                      >
                        + {athlete.name}
                        {athlete.sport ? <span style={{ color: "#6b7280", fontWeight: 600 }}> · {athlete.sport}</span> : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: "#6b7280", fontSize: "0.88rem" }}>Aucun athlète ne correspond à cette recherche.</p>
                )}
              </div>

              <div style={{ display: "grid", gap: "0.8rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <Field label="Date">
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(event) => setForm({ ...form, date: event.target.value })}
                    required
                    style={fieldControlStyle}
                  />
                </Field>

                <Field label="Événement">
                  <Input
                    value={form.event}
                    onChange={(event) => setForm({ ...form, event: event.target.value })}
                    required
                    style={fieldControlStyle}
                  />
                </Field>

                <Field label="Type">
                  <Select
                    value={form.mediaType}
                    onChange={(event) => setForm({ ...form, mediaType: event.target.value })}
                    style={fieldControlStyle}
                  >
                    <option>Photos</option>
                    <option>Vidéos</option>
                    <option>Photos + vidéos</option>
                    <option>Graphismes</option>
                    <option>Mixte</option>
                  </Select>
                </Field>

                <Field label="Total fichiers">
                  <Input
                    type="number"
                    min="0"
                    value={form.totalFiles}
                    onChange={(event) => setForm({ ...form, totalFiles: Number(event.target.value) })}
                    style={fieldControlStyle}
                  />
                </Field>

                <Field label="Premium total">
                  <Input
                    type="number"
                    min="0"
                    value={form.premiumTotal}
                    onChange={(event) => setForm({ ...form, premiumTotal: Number(event.target.value) })}
                    style={fieldControlStyle}
                  />
                </Field>

                <Field label="Verticales">
                  <Input
                    type="number"
                    min="0"
                    value={form.vertical}
                    onChange={(event) => setForm({ ...form, vertical: Number(event.target.value) })}
                    style={fieldControlStyle}
                  />
                </Field>

                <Field label="Horizontales">
                  <Input
                    type="number"
                    min="0"
                    value={form.horizontal}
                    onChange={(event) => setForm({ ...form, horizontal: Number(event.target.value) })}
                    style={fieldControlStyle}
                  />
                </Field>

                <Field label="Carrées">
                  <Input
                    type="number"
                    min="0"
                    value={form.square}
                    onChange={(event) => setForm({ ...form, square: Number(event.target.value) })}
                    style={fieldControlStyle}
                  />
                </Field>

                <Field label="Vidéos">
                  <Input
                    type="number"
                    min="0"
                    value={form.videos}
                    onChange={(event) => setForm({ ...form, videos: Number(event.target.value) })}
                    style={fieldControlStyle}
                  />
                </Field>

                <Field label="Fichiers utilisés">
                  <Input
                    type="number"
                    min="0"
                    value={form.filesUsed}
                    onChange={(event) => setForm({ ...form, filesUsed: Number(event.target.value) })}
                    style={fieldControlStyle}
                  />
                </Field>

                <Field label="Premium utilisés">
                  <Input
                    type="number"
                    min="0"
                    value={form.premiumUsed}
                    onChange={(event) => setForm({ ...form, premiumUsed: Number(event.target.value) })}
                    style={fieldControlStyle}
                  />
                </Field>

                <Field label="Droits d’utilisation" wide>
                  <Select
                    value={form.rights}
                    onChange={(event) => setForm({ ...form, rights: event.target.value })}
                    required
                    style={fieldControlStyle}
                  >
                    <option value="KLIQUE + athlète">KLIQUE + athlète</option>
                    <option value="KLIQUE + athlète + médias">KLIQUE + athlète + médias</option>
                  </Select>
                </Field>

                <Field label="Galerie PhotoDeck" wide>
                  <Input
                    type="url"
                    value={form.driveLink}
                    onChange={(event) => setForm({ ...form, driveLink: event.target.value })}
                    placeholder="https://klique.photodeck.com/..."
                    style={fieldControlStyle}
                  />
                </Field>

                <Field label="Notes" wide>
                  <Textarea
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    style={{ ...fieldControlStyle, minHeight: "86px", resize: "vertical" }}
                  />
                </Field>
              </div>

              {feedback ? (
                <p role="alert" style={{ margin: 0, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", padding: "0.7rem 0.85rem" }}>
                  {feedback}
                </p>
              ) : null}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", flexWrap: "wrap" }}>
                <Button type="button" onClick={() => setShowCreate(false)} style={secondaryButtonStyle}>
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  style={{
                    borderRadius: "999px",
                    padding: "0.6rem 1.1rem",
                    background: "#f59e0b",
                    color: "#fff",
                    border: "none",
                    fontWeight: 700,
                    opacity: saving ? 0.6 : 1,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "Enregistrement…" : "Ajouter le lot"}
                </Button>
              </div>
            </form>
          </DialogSurface>
        </div>
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
