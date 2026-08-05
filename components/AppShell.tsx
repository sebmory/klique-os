"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Athlete, AthletesResponse } from "@/types/athlete";
import type {
  NewShooting,
  Shooting,
  ShootingsResponse,
} from "@/types/shooting";
import type { MediaLot, MediaResponse, NewMediaLot } from "@/types/media";
import { MediaCenterModule } from "@/components/media/MediaCenterModule";
import { CalendarModule } from "@/components/calendar/CalendarModule";
import type { CalendarEvent, CalendarResponse } from "@/types/calendar";
import { ShootingsModule } from "@/components/shootings/ShootingsModule";

const navigation = [
  "Dashboard",
  "Athlètes",
  "Shootings",
  "Workflow",
  "Banque médias",
  "Calendrier",
  "Centre média IA",
  "Paramètres",
];

const emptyMediaForm: NewMediaLot = {
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

const emptyForm: NewShooting = {
  date: "",
  athlete: "",
  sport: "",
  type: "Portrait",
  place: "",
  objective: "",
  photographer: "Sébastien Mory",
};

export function AppShell() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [shootings, setShootings] = useState<Shooting[]>([]);
  const [media, setMedia] = useState<MediaLot[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [dataSource, setDataSource] =
    useState<"google-sheets" | "demo">("demo");
  const [shootingSource, setShootingSource] =
    useState<"google-sheets" | "demo">("demo");
  const [mediaSource, setMediaSource] =
    useState<"google-sheets" | "demo">("demo");
  const [calendarSource, setCalendarSource] =
    useState<"google-sheets" | "demo">("demo");
  const [dataMessage, setDataMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [athletesResponse, shootingsResponse, mediaResponse, calendarResponse] = await Promise.all([
        fetch("/api/athletes", { cache: "no-store" }),
        fetch("/api/shootings", { cache: "no-store" }),
        fetch("/api/media", { cache: "no-store" }),
        fetch("/api/calendar", { cache: "no-store" }),
      ]);

      const athleteData = (await athletesResponse.json()) as AthletesResponse;
      const shootingData =
        (await shootingsResponse.json()) as ShootingsResponse;
      const mediaData = (await mediaResponse.json()) as MediaResponse;
      const calendarData = (await calendarResponse.json()) as CalendarResponse;

      setAthletes(athleteData.athletes);
      setShootings(shootingData.shootings);
      setMedia(mediaData.media);
      setCalendarEvents(calendarData.events);
      setDataSource(athleteData.source);
      setShootingSource(shootingData.source);
      setMediaSource(mediaData.source);
      setCalendarSource(calendarData.source);
      setDataMessage(
        [athleteData.message, shootingData.message, mediaData.message, calendarData.message].filter(Boolean).join(" · ")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalMedia = media.reduce((sum, lot) => sum + lot.filesRemaining, 0);
  const totalPremium = media.reduce(
    (sum, lot) => sum + lot.premiumRemaining,
    0
  );

  const workflow = useMemo(
    () =>
      shootings.map((shooting) => {
        const steps = [
          shooting.importDone,
          shooting.sortDone,
          shooting.retouchDone,
          shooting.exportDone,
          shooting.driveDone,
          shooting.published,
        ];
        const completed = steps.filter(Boolean).length;
        const progress = Math.round((completed / steps.length) * 100);
        const stage =
          !shooting.importDone
            ? "Import"
            : !shooting.sortDone
            ? "Tri"
            : !shooting.retouchDone
            ? "Retouche"
            : !shooting.exportDone
            ? "Export"
            : !shooting.driveDone
            ? "Drive"
            : !shooting.published
            ? "Publication"
            : "Terminé";
        return { ...shooting, progress, stage };
      }),
    [shootings]
  );

  const stats = [
    { label: "Athlètes", value: String(athletes.length), note: "membres actifs" },
    {
      label: "Shootings",
      value: String(shootings.length),
      note: `${shootings.filter((s) => !s.published).length} à traiter`,
    },
    {
      label: "Médias",
      value: totalMedia.toLocaleString("fr-CH"),
      note: `${totalPremium} Premium`,
    },
    {
      label: "Workflow",
      value: String(workflow.filter((item) => item.progress < 100).length),
      note: "projets actifs",
    },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">KQ</div>
          <div>
            <strong>KLIQUE OS</strong>
            <span>Where Sport Connects.</span>
          </div>
        </div>

        <nav className="navigation">
          {navigation.map((item) => (
            <button
              key={item}
              className={activePage === item ? "nav-item active" : "nav-item"}
              onClick={() => {
                setActivePage(item);
                setSelectedAthlete(null);
              }}
            >
              <span className="nav-dot" />
              {item}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="profile-avatar">SM</div>
          <div>
            <strong>Sébastien</strong>
            <span>Administrateur</span>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">KLIQUE OS · VERSION 0.4</p>
            <h1>{selectedAthlete ? "Fiche athlète" : activePage}</h1>
          </div>
          <div className="topbar-actions">
            <span
              className={
                dataSource === "google-sheets" &&
                shootingSource === "google-sheets" &&
                mediaSource === "google-sheets" &&
                calendarSource === "google-sheets"
                  ? "data-source connected"
                  : "data-source demo"
              }
              title={dataMessage}
            >
              {dataSource === "google-sheets" &&
              shootingSource === "google-sheets" &&
              mediaSource === "google-sheets" &&
              calendarSource === "google-sheets"
                ? "● Google Sheets"
                : "● Connexion partielle"}
            </span>
            <button className="primary-button" onClick={() => setActivePage("Shootings")}>
              + Nouveau
            </button>
          </div>
        </header>

        <main className="content">
          {loading ? (
            <section className="loading-page">
              <div className="loader" />
              <h2>Chargement de KLIQUE OS…</h2>
            </section>
          ) : selectedAthlete ? (
            <AthleteDetail athlete={selectedAthlete} onBack={() => setSelectedAthlete(null)} />
          ) : activePage === "Dashboard" ? (
            <Dashboard stats={stats} workflow={workflow} />
          ) : activePage === "Athlètes" ? (
            <AthletesPage athletes={athletes} onSelect={setSelectedAthlete} />
          ) : activePage === "Shootings" ? (
            <ShootingsModule
              athletes={athletes}
              shootings={shootings}
              source={shootingSource}
              message={dataMessage}
              onRefresh={loadData}
            />
          ) : activePage === "Workflow" ? (
            <WorkflowPage workflow={workflow} />
          ) : activePage === "Banque médias" ? (
            <MediaCenterModule
              athletes={athletes}
              media={media}
              source={mediaSource}
              message={dataMessage}
              onRefresh={loadData}
            />
          ) : activePage === "Calendrier" ? (
            <CalendarModule
              athletes={athletes}
              events={calendarEvents}
              source={calendarSource}
              message={dataMessage}
              onRefresh={loadData}
            />
          ) : (
            <section className="empty-page">
              <div className="brand-mark large">KQ</div>
              <p className="eyebrow">Version 0.4</p>
              <h2>{activePage}</h2>
              <p>Ce module sera connecté dans la prochaine version.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function Dashboard({
  stats,
  workflow,
}: {
  stats: { label: string; value: string; note: string }[];
  workflow: Array<Shooting & { progress: number; stage: string }>;
}) {
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Cockpit opérationnel</p>
          <h2>Bonjour Sébastien.</h2>
          <p>Les données ci-dessous sont maintenant calculées depuis KLIQUE OS.</p>
        </div>
      </section>

      <section className="stats-grid">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.note}</small>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Production</p>
              <h3>Projets à poursuivre</h3>
            </div>
          </div>
          <div className="task-list">
            {workflow
              .filter((item) => item.progress < 100)
              .slice(0, 5)
              .map((item) => (
                <div className="task-row" key={`${item.date}-${item.athlete}`}>
                  <span className="task-check" />
                  <div>
                    <strong>{item.athlete} · {item.type}</strong>
                    <small>{item.stage} · {item.progress}%</small>
                  </div>
                  <span className="priority moyenne">{item.stage}</span>
                </div>
              ))}
          </div>
        </article>

        <article className="panel premium-insight">
          <div className="insight-icon">✦</div>
          <p className="eyebrow">Version 0.4</p>
          <h3>Écriture Google Sheets activée</h3>
          <p>
            Le formulaire Nouveau shooting crée maintenant une vraie ligne
            dans l’onglet 16_Shootings.
          </p>
        </article>
      </section>
    </>
  );
}

function AthletesPage({
  athletes,
  onSelect,
}: {
  athletes: Athlete[];
  onSelect: (athlete: Athlete) => void;
}) {
  const [search, setSearch] = useState("");
  const [sport, setSport] = useState("Tous");
  const sports = ["Tous", ...Array.from(new Set(athletes.map((a) => a.sport))).filter(Boolean)];
  const visible = athletes.filter(
    (athlete) =>
      (sport === "Tous" || athlete.sport === sport) &&
      `${athlete.name} ${athlete.club}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Réseau KLIQUE</p>
          <h2>Athlètes</h2>
          <p>Les profils sont lus directement depuis Google Sheets.</p>
        </div>
      </section>
      <section className="athlete-toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" />
        <select value={sport} onChange={(e) => setSport(e.target.value)}>
          {sports.map((item) => <option key={item}>{item}</option>)}
        </select>
        <div className="athlete-count"><strong>{visible.length}</strong><span>athlètes affichés</span></div>
      </section>
      <section className="athlete-grid">
        {visible.map((athlete) => (
          <button className="athlete-card" key={athlete.name} onClick={() => onSelect(athlete)}>
            <div className="athlete-card-top">
              <div className="athlete-avatar">{athlete.initials}</div>
              <span className="status-badge">{athlete.status}</span>
            </div>
            <div className="athlete-main">
              <h3>{athlete.name}</h3>
              <p>{athlete.sport || "Sport à compléter"}</p>
              <span>{athlete.club || "Club à compléter"}</span>
            </div>
            <div className="athlete-meta">
              <div><span>Dernier shooting</span><strong>{athlete.lastShoot}</strong></div>
              <div><span>Médias</span><strong>{athlete.media}</strong></div>
              <div><span>Premium</span><strong>{athlete.premium}</strong></div>
            </div>
            <div className="coverage-row">
              <div><span>Couverture média</span><strong>{athlete.coverage}/100</strong></div>
              <div className="coverage-track"><span className={`coverage-fill ${athlete.tone}`} style={{ width: `${athlete.coverage}%` }} /></div>
            </div>
          </button>
        ))}
      </section>
    </>
  );
}

function ShootingsPage({
  athletes,
  shootings,
  source,
  message,
  onCreated,
}: {
  athletes: Athlete[];
  shootings: Shooting[];
  source: "google-sheets" | "demo";
  message: string;
  onCreated: () => Promise<void>;
}) {
  const [form, setForm] = useState<NewShooting>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback("");
    const response = await fetch("/api/shootings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = await response.json();
    if (!response.ok) {
      setFeedback(result.error ?? "Erreur lors de la création.");
    } else {
      setFeedback("Shooting créé dans Google Sheets.");
      setForm(emptyForm);
      await onCreated();
      setShowForm(false);
    }
    setSaving(false);
  };

  const selectAthlete = (name: string) => {
    const athlete = athletes.find((item) => item.name === name);
    setForm((current) => ({
      ...current,
      athlete: name,
      sport: athlete?.sport ?? "",
    }));
  };

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Production KLIQUE</p>
          <h2>Shootings</h2>
          <p>Lecture et création directe dans l’onglet 16_Shootings.</p>
        </div>
        <button className="primary-button" onClick={() => setShowForm(!showForm)}>
          + Nouveau shooting
        </button>
      </section>

      {source === "demo" && (
        <div className="connection-banner">
          <strong>Mode démo pour les shootings</strong>
          <small>{message}</small>
        </div>
      )}

      {feedback && <div className="success-banner">{feedback}</div>}

      {showForm && (
        <form className="creation-panel" onSubmit={submit}>
          <div className="section-heading">
            <div><p className="eyebrow">Écriture Google Sheets</p><h3>Nouveau shooting</h3></div>
          </div>
          <div className="creation-grid">
            <label>
              <span>Athlète</span>
              <select value={form.athlete} onChange={(e) => selectAthlete(e.target.value)} required>
                <option value="">Choisir…</option>
                {athletes.map((athlete) => <option key={athlete.name}>{athlete.name}</option>)}
              </select>
            </label>
            <label><span>Date</span><input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} required /></label>
            <label><span>Type</span><select value={form.type} onChange={(e) => setForm({...form, type: e.target.value})}><option>Portrait</option><option>Action</option><option>Interview</option><option>Sponsor</option><option>Lifestyle</option></select></label>
            <label><span>Lieu</span><input value={form.place} onChange={(e) => setForm({...form, place: e.target.value})} /></label>
            <label className="wide-field"><span>Objectif</span><input value={form.objective} onChange={(e) => setForm({...form, objective: e.target.value})} /></label>
            <label><span>Photographe</span><input value={form.photographer} onChange={(e) => setForm({...form, photographer: e.target.value})} /></label>
            <button className="primary-button create-submit" disabled={saving}>
              {saving ? "Création…" : "Créer dans Google Sheets"}
            </button>
          </div>
        </form>
      )}

      <section className="module-kpis">
        <article><span>Total</span><strong>{shootings.length}</strong><small>shootings enregistrés</small></article>
        <article><span>Planifiés</span><strong>{shootings.filter((s) => s.status === "Planifié").length}</strong><small>à venir</small></article>
        <article><span>À importer</span><strong>{shootings.filter((s) => !s.importDone).length}</strong><small>workflow</small></article>
        <article><span>Terminés</span><strong>{shootings.filter((s) => s.published).length}</strong><small>publiés</small></article>
      </section>

      <section className="data-table-card">
        <div className="data-table shooting-table">
          <div className="table-head">
            <span>Date</span><span>Athlète</span><span>Type</span><span>Lieu</span><span>Statut</span><span>Photos</span><span />
          </div>
          {shootings.map((shooting, index) => (
            <div className="table-row" key={`${shooting.row ?? index}-${shooting.athlete}`}>
              <strong>{shooting.date}</strong>
              <span>{shooting.athlete}</span>
              <span>{shooting.type}</span>
              <span>{shooting.place}</span>
              <span className="status-chip">{shooting.status}</span>
              <span>{shooting.photos}</span>
              <button className="row-action">Ouvrir →</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function WorkflowPage({
  workflow,
}: {
  workflow: Array<Shooting & { progress: number; stage: string }>;
}) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Centre de production</p>
          <h2>Workflow</h2>
          <p>Calculé automatiquement depuis les colonnes Oui / Non de 16_Shootings.</p>
        </div>
      </section>
      <section className="workflow-stage-grid">
        {["Import", "Tri", "Retouche", "Export", "Drive", "Publication"].map((stage) => (
          <article key={stage}><span>{stage}</span><strong>{workflow.filter((item) => item.stage === stage).length}</strong></article>
        ))}
      </section>
      <section className="workflow-list">
        {workflow.map((item, index) => (
          <article className="workflow-project" key={`${item.row ?? index}-${item.athlete}`}>
            <div className="workflow-project-head">
              <div><span className="eyebrow">{item.athlete}</span><h3>{item.type || "Shooting"}</h3></div>
              <span className="status-chip">{item.stage}</span>
            </div>
            <div className="workflow-meta">
              <div><span>Date</span><strong>{item.date}</strong></div>
              <div><span>Objectif</span><strong>{item.objective || "À compléter"}</strong></div>
              <div><span>Progression</span><strong>{item.progress}%</strong></div>
            </div>
            <div className="workflow-progress"><span style={{ width: `${item.progress}%` }} /></div>
          </article>
        ))}
      </section>
    </>
  );
}

function MediaLibraryPage({
  athletes,
  media,
  source,
  message,
  onCreated,
}: {
  athletes: Athlete[];
  media: MediaLot[];
  source: "google-sheets" | "demo";
  message: string;
  onCreated: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("Tous");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewMediaLot>(emptyMediaForm);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const visible = media.filter((lot) => {
    const matchesSearch = `${lot.athlete} ${lot.event} ${lot.mediaType}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesFormat =
      format === "Tous" ||
      (format === "Vertical" && lot.vertical > 0) ||
      (format === "Horizontal" && lot.horizontal > 0) ||
      (format === "Vidéo" && lot.videos > 0);
    return matchesSearch && matchesFormat;
  });

  const selectAthlete = (name: string) => {
    const athlete = athletes.find((item) => item.name === name);
    setForm((current) => ({
      ...current,
      athlete: name,
      sport: athlete?.sport ?? "",
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback("");

    const response = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = await response.json();

    if (!response.ok) {
      setFeedback(result.error ?? "Impossible d’ajouter le lot.");
    } else {
      setFeedback("Lot média ajouté dans Google Sheets.");
      setForm(emptyMediaForm);
      await onCreated();
      setShowForm(false);
    }

    setSaving(false);
  };

  const remainingFiles = media.reduce(
    (sum, lot) => sum + lot.filesRemaining,
    0
  );
  const remainingPremium = media.reduce(
    (sum, lot) => sum + lot.premiumRemaining,
    0
  );
  const videos = media.reduce((sum, lot) => sum + lot.videos, 0);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Media Center · Version 0.5</p>
          <h2>Banque médias</h2>
          <p>
            Gestion réelle des shootings, stocks restants, formats, Premium et
            liens Drive.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => setShowForm(!showForm)}
        >
          + Ajouter un lot
        </button>
      </section>

      {source === "demo" && (
        <div className="connection-banner">
          <strong>Mode démo pour la Banque médias</strong>
          <small>{message}</small>
        </div>
      )}

      {feedback && <div className="success-banner">{feedback}</div>}

      {showForm && (
        <form className="creation-panel media-creation-panel" onSubmit={submit}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nouveau lot</p>
              <h3>Enregistrer un shooting ou un export</h3>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowForm(false)}
            >
              Fermer
            </button>
          </div>

          <div className="creation-grid media-form-grid">
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
              <span>Type de média</span>
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
              <span>Shooting / événement</span>
              <input
                value={form.event}
                onChange={(event) =>
                  setForm({ ...form, event: event.target.value })
                }
                required
              />
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

            <label>
              <span>Coups de cœur</span>
              <input
                type="number"
                min="0"
                value={form.favorites}
                onChange={(event) =>
                  setForm({
                    ...form,
                    favorites: Number(event.target.value),
                  })
                }
              />
            </label>

            <label className="wide-field">
              <span>Lien Drive / dossier</span>
              <input
                value={form.driveLink}
                onChange={(event) =>
                  setForm({ ...form, driveLink: event.target.value })
                }
                placeholder="https://drive.google.com/..."
              />
            </label>

            <label>
              <span>Droits</span>
              <select
                value={form.rights}
                onChange={(event) =>
                  setForm({ ...form, rights: event.target.value })
                }
              >
                <option>KLIQUE uniquement</option>
                <option>KLIQUE + athlète</option>
                <option>KLIQUE + partenaire</option>
                <option>Tous supports autorisés</option>
                <option>Autorisation à vérifier</option>
              </select>
            </label>

            <button
              className="primary-button create-submit"
              disabled={saving}
            >
              {saving ? "Enregistrement…" : "Ajouter à Google Sheets"}
            </button>
          </div>
        </form>
      )}

      <section className="module-kpis">
        <article>
          <span>Lots enregistrés</span>
          <strong>{media.length}</strong>
          <small>shootings ou exports</small>
        </article>
        <article>
          <span>Fichiers restants</span>
          <strong>{remainingFiles}</strong>
          <small>encore exploitables</small>
        </article>
        <article>
          <span>Premium restants</span>
          <strong>{remainingPremium}</strong>
          <small>contenus prioritaires</small>
        </article>
        <article>
          <span>Vidéos</span>
          <strong>{videos}</strong>
          <small>séquences disponibles</small>
        </article>
      </section>

      <section className="module-toolbar media-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un athlète ou un shooting…"
        />
        <select
          value={format}
          onChange={(event) => setFormat(event.target.value)}
        >
          <option>Tous</option>
          <option>Vertical</option>
          <option>Horizontal</option>
          <option>Vidéo</option>
        </select>
        <span>{visible.length} lot(s)</span>
      </section>

      <section className="library-grid media-center-grid">
        {visible.map((lot, index) => {
          const usedRatio =
            lot.totalFiles > 0
              ? Math.round((lot.filesUsed / lot.totalFiles) * 100)
              : 0;

          return (
            <article
              className="library-card media-center-card"
              key={`${lot.row ?? index}-${lot.athlete}-${lot.event}`}
            >
              <div className="library-preview media-center-preview">
                <div className="preview-topline">
                  <span>{lot.mediaType || "Média"}</span>
                  <span>{lot.date || "Sans date"}</span>
                </div>

                <div className="library-monogram">
                  {lot.athlete
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </div>

                <div className="preview-formats">
                  <span>{lot.vertical} V</span>
                  <span>{lot.horizontal} H</span>
                  <span>{lot.videos} vidéos</span>
                </div>
              </div>

              <div className="library-body">
                <div className="media-card-heading">
                  <div>
                    <p className="eyebrow">{lot.athlete}</p>
                    <h3>{lot.event || "Lot sans nom"}</h3>
                  </div>
                  <span
                    className={
                      lot.premiumRemaining <= 3
                        ? "quality-badge renew"
                        : "quality-badge"
                    }
                  >
                    {lot.premiumRemaining} Premium
                  </span>
                </div>

                <p className="media-place">
                  {lot.place || "Lieu non renseigné"} · {lot.rights || "Droits à vérifier"}
                </p>

                <div className="library-numbers">
                  <div>
                    <span>Total</span>
                    <strong>{lot.totalFiles}</strong>
                  </div>
                  <div>
                    <span>Restants</span>
                    <strong>{lot.filesRemaining}</strong>
                  </div>
                  <div>
                    <span>Favoris</span>
                    <strong>{lot.favorites}</strong>
                  </div>
                </div>

                <div className="usage-progress">
                  <div>
                    <span>Utilisation</span>
                    <strong>{usedRatio}%</strong>
                  </div>
                  <div className="usage-track">
                    <span style={{ width: `${Math.min(100, usedRatio)}%` }} />
                  </div>
                </div>

                <div className="media-card-actions">
                  {lot.driveLink ? (
                    <a
                      href={lot.driveLink}
                      target="_blank"
                      rel="noreferrer"
                      className="drive-link"
                    >
                      Ouvrir Drive ↗
                    </a>
                  ) : (
                    <span className="missing-link">Aucun lien Drive</span>
                  )}
                  <button className="library-open">Détails →</button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}

function AthleteDetail({
  athlete,
  onBack,
}: {
  athlete: Athlete;
  onBack: () => void;
}) {
  const recommendation =
    athlete.coverage < 35
      ? "Programmer un premier shooting complet."
      : athlete.premium < 5
      ? "Créer davantage de contenus Premium."
      : "Aucune action urgente.";

  return (
    <>
      <button className="back-button" onClick={onBack}>← Retour aux athlètes</button>
      <section className="premium-athlete-hero">
        <div className="premium-hero-main">
          <div className="athlete-avatar premium">{athlete.initials}</div>
          <div className="premium-identity">
            <div className="premium-kicker"><span className="status-badge">{athlete.status}</span><span>{athlete.sport}</span></div>
            <h2>{athlete.name}</h2>
            <p>{athlete.club}</p>
          </div>
        </div>
        <div className="premium-score-card">
          <span>Indice KLIQUE</span><strong>{athlete.coverage}</strong><small>Couverture média</small>
          <div className="premium-score-track"><span style={{ width: `${athlete.coverage}%` }} /></div>
        </div>
      </section>
      <section className="premium-command-bar">
        <div><span>Médias</span><strong>{athlete.media}</strong></div>
        <div><span>Premium</span><strong>{athlete.premium}</strong></div>
        <div><span>Dernier shooting</span><strong>{athlete.lastShoot}</strong></div>
        <div><span>Instagram</span><strong>{athlete.instagram || "À compléter"}</strong></div>
      </section>
      <section className="premium-overview-grid">
        <article className="panel premium-panel">
          <p className="eyebrow">Recommandation</p>
          <h3>{recommendation}</h3>
          <div className="premium-info-list">
            <div><span>E-mail</span><strong>{athlete.email || "À compléter"}</strong></div>
            <div><span>Téléphone</span><strong>{athlete.phone || "À compléter"}</strong></div>
            <div><span>Objectif</span><strong>{athlete.objective || "À définir"}</strong></div>
            <div><span>Long terme</span><strong>{athlete.longTerm || "À définir"}</strong></div>
          </div>
        </article>
        <article className="panel premium-insight">
          <div className="insight-icon">✦</div>
          <p className="eyebrow">Analyse KLIQUE</p>
          <h3>{athlete.nextAction || recommendation}</h3>
          <p>Cette fiche est alimentée par la base réelle Google Sheets.</p>
        </article>
      </section>
    </>
  );
}
