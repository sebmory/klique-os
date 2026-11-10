"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  CanonicalCreativeMission,
  CanonicalCreativeMissionCounts,
  CanonicalCreativeMissionState,
  CanonicalCreativeMissionView,
} from "@/lib/canonical-creative-missions";
import type {
  OperationalCreativeCandidate,
  OperationalMissionSearchMode,
  OperationalMissionType,
} from "@/lib/operational-creative-missions";
import type { AthletesResponse } from "@/types/athlete";
import { projectCanonicalMissionJourney } from "@/lib/mission-journey";

type MissionsPayload = {
  missions?: CanonicalCreativeMission[];
  counts?: CanonicalCreativeMissionCounts;
  candidates?: OperationalCreativeCandidate[];
  error?: string;
};

type FormState = {
  title: string;
  missionType: OperationalMissionType;
  athleteIds: string[];
  scheduledAt: string;
  periodEndsAt: string;
  locationName: string;
  region: string;
  deliverables: string;
  contextNotes: string;
  usageRights: string;
  budgetChf: string;
  expensesCovered: boolean;
  expenseTerms: string;
  responseDeadline: string;
  searchMode: OperationalMissionSearchMode;
};

const emptyCounts: CanonicalCreativeMissionCounts = {
  to_process: 0,
  to_organize: 0,
  in_progress: 0,
  history: 0,
};

const emptyForm = (): FormState => ({
  title: "",
  missionType: "media_day",
  athleteIds: [],
  scheduledAt: "",
  periodEndsAt: "",
  locationName: "",
  region: "",
  deliverables: "",
  contextNotes: "",
  usageRights: "",
  budgetChf: "",
  expensesCovered: false,
  expenseTerms: "",
  responseDeadline: "",
  searchMode: "targeted_creatives",
});

const views: Array<{ value: CanonicalCreativeMissionView; label: string }> = [
  { value: "to_process", label: "À traiter" },
  { value: "to_organize", label: "À organiser" },
  { value: "in_progress", label: "En cours" },
  { value: "history", label: "Historique" },
];

const stateLabels: Record<CanonicalCreativeMissionState, string> = {
  review: "À examiner",
  organize: "À organiser",
  proposed: "Proposition envoyée",
  confirmation_pending: "Confirmation en attente",
  confirmed: "Confirmée",
  in_progress: "En cours",
  review_delivery: "Livraison à vérifier",
  changes_requested: "Modifications demandées",
  completed: "Terminée",
  closed_without_action: "Classée sans suite",
  cancelled: "Annulée",
};

const missionTypeLabels: Record<CanonicalCreativeMission["missionType"], string> = {
  media_day: "Media Day",
  match_competition: "Photos en match",
  video: "Vidéo",
  interview: "Interview",
  production: "Production",
  other: "Autre",
};

const originLabels: Record<CanonicalCreativeMission["originKind"], string> = {
  projection: "Projection canonique",
  athlete_request: "Demande Athlète",
  admin: "Besoin Admin",
  production: "Production existante",
  historical: "Historique régularisé",
};

const sourceLabels: Record<CanonicalCreativeMission["sources"][number]["type"], string> = {
  athlete_service_request: "Demande historique",
  athlete_session_request: "Demande Athlète",
  production_brief: "Brief Production",
  production_sheet: "Production Google Sheets",
};

const normalizeSearch = (value: string): string =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr").trim();

export const filterCanonicalMissions = ({
  missions,
  view,
  query,
}: {
  missions: CanonicalCreativeMission[];
  view: CanonicalCreativeMissionView;
  query: string;
}): CanonicalCreativeMission[] => {
  const normalizedQuery = normalizeSearch(query);
  return missions.filter((mission) => {
    if (mission.view !== view) return false;
    if (!normalizedQuery) return true;
    return normalizeSearch([
      mission.title,
      mission.region,
      mission.locationName,
      mission.creative?.name,
      ...mission.athletes.flatMap((athlete) => [athlete.id, athlete.name]),
      ...mission.services.map((service) => service.productName),
      ...mission.sources.map((source) => sourceLabels[source.type]),
    ].filter(Boolean).join(" ")).includes(normalizedQuery);
  });
};

const formatDate = (value: string | null): string => {
  if (!value) return "À définir";
  return new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
};

const localInputValue = (value: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const toIso = (value: string): string | null =>
  value ? new Date(value).toISOString() : null;

const formFromMission = (mission: CanonicalCreativeMission): FormState => ({
  title: mission.title,
  missionType: mission.missionType === "production" ? "other" : mission.missionType,
  athleteIds: mission.athletes.map((athlete) => athlete.id),
  scheduledAt: localInputValue(mission.scheduledAt),
  periodEndsAt: localInputValue(mission.periodEndsAt),
  locationName: mission.locationName ?? "",
  region: mission.region ?? "",
  deliverables: mission.deliverables ?? "",
  contextNotes: mission.contextNotes ?? "",
  usageRights: mission.usageRights ?? "",
  budgetChf: mission.budgetAmountMinor === null
    ? ""
    : String(mission.budgetAmountMinor / 100),
  expensesCovered: mission.expensesCovered === true,
  expenseTerms: mission.expenseTerms ?? "",
  responseDeadline: localInputValue(mission.responseDeadline),
  searchMode: mission.searchMode ?? "targeted_creatives",
});

const creativeTypeMatches = (
  mission: CanonicalCreativeMission,
  candidate: OperationalCreativeCandidate,
) => {
  if (candidate.creativeType === "both") return true;
  if (["video", "interview"].includes(mission.missionType)) {
    return candidate.creativeType === "videographer";
  }
  return candidate.creativeType === "photographer";
};

const candidateStatus = (
  mission: CanonicalCreativeMission,
  candidate: OperationalCreativeCandidate,
  relevantSpecialties: string[],
): { compatible: boolean; availability: string } => {
  const region = mission.region?.trim().toLocaleLowerCase("fr") ?? "";
  const regionMatch = !region || candidate.coverageAreas.some(
    (area) => area.trim().toLocaleLowerCase("fr") === region,
  );
  const specialtyMatch = relevantSpecialties.length === 0 || candidate.specialties.some(
    (specialty) => relevantSpecialties.includes(normalizeSearch(specialty)),
  );
  const compatible = regionMatch && specialtyMatch && creativeTypeMatches(mission, candidate);
  if (!mission.scheduledAt) {
    return {
      compatible,
      availability: candidate.generalAvailability
        ? `Disponibilité générale : ${candidate.generalAvailability}`
        : "Disponibilité non renseignée",
    };
  }
  const date = mission.scheduledAt.slice(0, 10);
  const periodEnd = mission.periodEndsAt?.slice(0, 10) ?? date;
  const occurrence = candidate.availability.find(
    (item) => item.date >= date && item.date <= periodEnd,
  );
  const conflict = candidate.conflicts.some(
    (item) => item.date >= date && item.date <= periodEnd,
  );
  if (conflict) return { compatible, availability: "Conflit confirmé à cette date" };
  if (occurrence) return { compatible, availability: "Disponible sur la période" };
  return {
    compatible,
    availability: candidate.generalAvailability
      ? `Aucune plage précise · ${candidate.generalAvailability}`
      : "Disponibilité non renseignée",
  };
};

const stateLabel = (mission: CanonicalCreativeMission): string => {
  if (mission.regularizationStatus === "historical_completed") {
    return "Terminée — historique régularisé";
  }
  if (mission.regularizationStatus === "historical_closed_without_action") {
    return "Classée sans suite — historique régularisé";
  }
  return stateLabels[mission.state];
};

export function AdminMissionsScreen() {
  const [missions, setMissions] = useState<CanonicalCreativeMission[]>([]);
  const [counts, setCounts] = useState<CanonicalCreativeMissionCounts>(emptyCounts);
  const [candidates, setCandidates] = useState<OperationalCreativeCandidate[]>([]);
  const [athletes, setAthletes] = useState<AthletesResponse["athletes"]>([]);
  const [activeView, setActiveView] = useState<CanonicalCreativeMissionView>("to_process");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [selectedRecipients, setSelectedRecipients] = useState<Record<string, string[]>>({});
  const creationKey = useRef(crypto.randomUUID());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [missionsResponse, athletesResponse] = await Promise.all([
        fetch("/api/admin/missions", { credentials: "include", cache: "no-store" }),
        fetch("/api/athletes", { credentials: "include", cache: "no-store" }),
      ]);
      const missionsPayload = await missionsResponse.json().catch(() => null) as MissionsPayload | null;
      if (!missionsResponse.ok) {
        throw new Error(missionsPayload?.error || "Impossible de charger les missions créatives.");
      }
      setMissions(missionsPayload?.missions ?? []);
      setCounts(missionsPayload?.counts ?? emptyCounts);
      setCandidates(missionsPayload?.candidates ?? []);
      if (athletesResponse.ok) {
        const athletePayload = await athletesResponse.json().catch(() => null) as AthletesResponse | null;
        setAthletes(athletePayload?.athletes ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load).catch((failure) => {
      setError(failure instanceof Error ? failure.message : "Chargement impossible.");
      setLoading(false);
    });
  }, [load]);

  const visibleMissions = useMemo(
    () => filterCanonicalMissions({ missions, view: activeView, query }),
    [activeView, missions, query],
  );
  const editingMission = editingMissionId
    ? missions.find((mission) => mission.id === editingMissionId) ?? null
    : null;
  const athleteNames = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.key, athlete.name])),
    [athletes],
  );

  const missionPayload = (idempotencyKey: string) => ({
    idempotencyKey,
    title: form.title,
    missionType: form.missionType,
    athletes: form.athleteIds.map((id) => ({
      id,
      name: athleteNames.get(id) ?? null,
    })),
    scheduledAt: toIso(form.scheduledAt),
    periodEndsAt: toIso(form.periodEndsAt),
    locationName: form.locationName || null,
    region: form.region || null,
    deliverables: form.deliverables || null,
    contextNotes: form.contextNotes || null,
    usageRights: form.usageRights || null,
    budgetAmountMinor: form.budgetChf
      ? Math.round(Number(form.budgetChf) * 100)
      : null,
    expensesCovered: form.expensesCovered,
    expenseTerms: form.expenseTerms || null,
    responseDeadline: toIso(form.responseDeadline),
    searchMode: form.searchMode,
  });

  const submitMission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const idempotencyKey = creationKey.current;
    try {
      const response = await fetch("/api/admin/missions", {
        method: editingMissionId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editingMissionId
          ? {
              action: "update",
              missionId: editingMissionId,
              idempotencyKey,
              mission: missionPayload(idempotencyKey),
            }
          : missionPayload(idempotencyKey)),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Enregistrement impossible.");
      creationKey.current = crypto.randomUUID();
      setForm(emptyForm());
      setEditingMissionId(null);
      setFormOpen(false);
      setMessage(editingMissionId ? "Mission modifiée." : "Brouillon de mission créé.");
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (body: Record<string, unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/missions", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          ...body,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Action impossible.");
      setMessage(success);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (mission: CanonicalCreativeMission) => {
    setEditingMissionId(mission.id);
    setForm(formFromMission(mission));
    creationKey.current = crypto.randomUUID();
    setFormOpen(true);
  };

  const productionInput = (mission: CanonicalCreativeMission, recipients: string[]) => ({
    idempotencyKey: crypto.randomUUID(),
    creativeType: ["video", "interview"].includes(mission.missionType)
      ? "video"
      : mission.missionType === "match_competition"
        ? "photo"
        : "photo_video",
    selectedPeriodStart: mission.missionType === "media_day" ? mission.scheduledAt : null,
    deliveryDueDate: null,
    responseDeadline: mission.responseDeadline,
    compensation: mission.budgetAmountMinor === null
      ? { type: "unpaid_collaboration", amountMinor: null, currency: null }
      : {
          type: "paid_mandate",
          amountMinor: mission.budgetAmountMinor,
          currency: "CHF",
        },
    expensesCovered: mission.expensesCovered === true,
    expenseTerms: mission.expenseTerms ?? "",
    creditsAndUsage: mission.usageRights ?? "",
    necessaryContactDetails: null,
    recipientIds: recipients,
  });

  return (
    <section className="admin-missions-screen" aria-labelledby="admin-missions-title">
      <header className="admin-missions-header">
        <div>
          <p>Missions créatives</p>
          <h1 id="admin-missions-title">Pilotage unifié des missions</h1>
          <span>Une seule vue pour décider, organiser et suivre le moteur Production/Créatifs.</span>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setEditingMissionId(null);
            setForm(emptyForm());
            creationKey.current = crypto.randomUUID();
            setFormOpen((value) => !value);
          }}
        >
          Créer une mission
        </button>
      </header>

      {formOpen ? (
        <form className="admin-mission-form" onSubmit={submitMission}>
          <header>
            <div>
              <small>{editingMission ? originLabels[editingMission.originKind] : "Besoin Admin"}</small>
              <h2>{editingMissionId ? "Modifier la mission" : "Créer une mission"}</h2>
            </div>
            <button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>
              Fermer
            </button>
          </header>
          <div className="admin-mission-form-grid">
            <label>Titre<input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label>Type<select value={form.missionType} onChange={(event) => setForm({ ...form, missionType: event.target.value as OperationalMissionType })}>
              <option value="media_day">Media Day</option>
              <option value="match_competition">Photos en match</option>
              <option value="video">Vidéo</option>
              <option value="interview">Interview</option>
              <option value="other">Autre</option>
            </select></label>
            <label>Athlètes facultatifs<select multiple disabled={editingMission?.originKind === "athlete_request"} value={form.athleteIds} onChange={(event) => setForm({ ...form, athleteIds: [...event.target.selectedOptions].map((option) => option.value) })}>
              {athletes.map((athlete) => <option key={athlete.key} value={athlete.key}>{athlete.name}</option>)}
            </select></label>
            <label>Début<input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} /></label>
            <label>Fin de période<input type="datetime-local" value={form.periodEndsAt} onChange={(event) => setForm({ ...form, periodEndsAt: event.target.value })} /></label>
            <label>Lieu<input value={form.locationName} onChange={(event) => setForm({ ...form, locationName: event.target.value })} /></label>
            <label>Région<input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></label>
            <label>Budget CHF, facultatif<input type="number" min="0" step="0.05" value={form.budgetChf} onChange={(event) => setForm({ ...form, budgetChf: event.target.value })} /></label>
            <label>Date limite de réponse<input type="datetime-local" value={form.responseDeadline} onChange={(event) => setForm({ ...form, responseDeadline: event.target.value })} /></label>
            <label>Mode de recherche<select value={form.searchMode} onChange={(event) => setForm({ ...form, searchMode: event.target.value as OperationalMissionSearchMode })}>
              <option value="single_creative">Proposer à un créatif précis</option>
              <option value="targeted_creatives">Ouvrir à plusieurs créatifs ciblés</option>
              <option value="direct_assignment">Affecter via le workflow existant</option>
            </select></label>
          </div>
          <label>Prestations ou livrables<textarea value={form.deliverables} onChange={(event) => setForm({ ...form, deliverables: event.target.value })} /></label>
          <label>Contexte ou consignes<textarea value={form.contextNotes} onChange={(event) => setForm({ ...form, contextNotes: event.target.value })} /></label>
          <label>Conditions et droits d’utilisation<textarea value={form.usageRights} onChange={(event) => setForm({ ...form, usageRights: event.target.value })} /></label>
          <label className="admin-mission-checkbox"><input type="checkbox" checked={form.expensesCovered} onChange={(event) => setForm({ ...form, expensesCovered: event.target.checked })} />Frais pris en charge</label>
          <label>Conditions de frais<textarea value={form.expenseTerms} onChange={(event) => setForm({ ...form, expenseTerms: event.target.value })} /></label>
          <footer>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer le brouillon"}
            </button>
            <span>Les champs opérationnels peuvent être complétés avant la proposition.</span>
          </footer>
        </form>
      ) : null}

      <section className="admin-missions-toolbar" aria-label="Recherche et vues des missions">
        <label className="admin-missions-search">
          <span>Rechercher</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Athlète, mission, région ou créatif" />
        </label>
        <div className="admin-missions-filters" role="group" aria-label="Vues des missions">
          {views.map((view) => (
            <button key={view.value} type="button" className={activeView === view.value ? "is-active" : undefined} aria-pressed={activeView === view.value} onClick={() => setActiveView(view.value)}>
              {view.label} <span>{counts[view.value]}</span>
            </button>
          ))}
        </div>
      </section>

      {error && missions.length > 0 ? <p className="form-message is-error" role="alert">{error}</p> : null}
      {message ? <p className="form-message is-success" role="status">{message}</p> : null}

      {loading ? (
        <section className="admin-missions-state" aria-live="polite" aria-busy="true">
          <strong>Chargement des missions créatives…</strong>
        </section>
      ) : error && missions.length === 0 ? (
        <section className="admin-missions-state is-error" role="alert">
          <strong>Chargement impossible.</strong>
          <p>{error}</p>
          <button type="button" onClick={() => void load().catch((failure) => {
            setError(failure instanceof Error ? failure.message : "Chargement impossible.");
          })}>Réessayer</button>
        </section>
      ) : visibleMissions.length === 0 ? (
        <section className="admin-missions-state">
          <strong>Aucune mission créative dans cette vue.</strong>
          <p>Les disponibilités créatives ne sont jamais transformées en missions.</p>
        </section>
      ) : (
        <ul className="admin-missions-list">
          {visibleMissions.map((mission) => {
            const journey = projectCanonicalMissionJourney(mission);
            const requestSource = mission.sources.find((source) => source.type === "athlete_session_request");
            const briefSource = mission.sources.find((source) => source.type === "production_brief");
            const selected = selectedRecipients[mission.id] ?? [];
            const missionText = normalizeSearch([
              mission.title,
              mission.contextNotes,
              mission.deliverables,
              ...mission.sources.map((source) => JSON.stringify(source.snapshot)),
            ].filter(Boolean).join(" "));
            const relevantSpecialties = [...new Set(candidates.flatMap(
              (candidate) => candidate.specialties.map(normalizeSearch)
                .filter((specialty) => specialty && missionText.includes(specialty)),
            ))];
            const compatibleCandidates = candidates
              .map((candidate) => ({
                candidate,
                ...candidateStatus(mission, candidate, relevantSpecialties),
              }))
              .sort((left, right) => Number(right.compatible) - Number(left.compatible));
            return (
              <li className="admin-mission-card" key={mission.id}>
                <header>
                  <div>
                    <small>{originLabels[mission.originKind]}</small>
                    <h2>{mission.title}</h2>
                  </div>
                  <span className={`admin-mission-state-badge is-${mission.state}`}>
                    {mission.regularizationStatus === "none" ? journey.label : stateLabel(mission)}
                  </span>
                </header>

                <dl>
                  <div><dt>Athlète{mission.athletes.length > 1 ? "s" : ""}</dt><dd className="admin-mission-athletes">
                    {mission.athletes.length > 0 ? mission.athletes.map((athlete) => (
                      <Link key={athlete.id} href={`/crm/personnes/${encodeURIComponent(athlete.id)}`}>
                        {athlete.name ?? athleteNames.get(athlete.id) ?? athlete.id}
                      </Link>
                    )) : "Aucun athlète"}</dd></div>
                  <div><dt>Date</dt><dd>{formatDate(mission.scheduledAt ?? mission.occurredAt)}</dd></div>
                  <div><dt>Créatif</dt><dd>{mission.creative ? `${mission.creative.name} — ${mission.creative.kind === "historical" ? "créatif historique déclaré" : "créatif opérationnel"}` : "À définir"}</dd></div>
                  <div><dt>Prochaine action</dt><dd>{journey.nextAction}</dd></div>
                  <div><dt>Acteur attendu</dt><dd>{journey.expectedActor ?? "Aucun"}</dd></div>
                  {mission.blockingReason ? <div><dt>Blocage</dt><dd>{mission.blockingReason}</dd></div> : null}
                </dl>

                <details className="admin-mission-journey">
                  <summary>Voir le parcours</summary>
                  <section className="mission-journey-summary" aria-label="Résumé opérationnel">
                    <h3>Résumé opérationnel</h3>
                    <p>{journey.description}</p>
                    <dl>
                      <div><dt>Type</dt><dd>{missionTypeLabels[mission.missionType]}</dd></div>
                      <div><dt>Lieu</dt><dd>{[mission.locationName, mission.region].filter(Boolean).join(" · ") || "À définir"}</dd></div>
                      <div><dt>Livrables</dt><dd>{mission.deliverables ?? (mission.services.map((service) => service.productName).join(" · ") || "À définir")}</dd></div>
                    </dl>
                    <ol className="mission-journey-timeline" aria-label="Timeline métier">
                      {journey.timeline.map((item) => (
                        <li key={item.id} data-status={item.status}>
                          <span>{item.label}</span>
                          <small>{item.description}</small>
                          {item.occurredAt ? <time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time> : null}
                        </li>
                      ))}
                    </ol>
                    {journey.warnings.length > 0 ? (
                      <aside className="mission-journey-warnings" aria-label="Incohérences détectées">
                        <strong>Informations à vérifier</strong>
                        <ul>{journey.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                      </aside>
                    ) : null}
                    <nav className="mission-journey-source-links" aria-label="Objets sources">
                      {requestSource ? <Link href="/today">Voir la demande source</Link> : null}
                      {briefSource ? <Link href="/production">Voir le brief Production</Link> : null}
                    </nav>
                  </section>

                {mission.state === "review" && requestSource ? (
                  <section className="admin-mission-actions">
                    <button type="button" className="primary-button" disabled={busy} onClick={() => void mutate({ action: "organize_request", missionId: mission.id, requestId: requestSource.id }, "Demande déplacée dans À organiser.")}>Organiser cette demande</button>
                    <label>Motif ou complément<textarea value={reasons[mission.id] ?? ""} onChange={(event) => setReasons({ ...reasons, [mission.id]: event.target.value })} /></label>
                    <button type="button" className="secondary-button" disabled={busy || !(reasons[mission.id] ?? "").trim()} onClick={() => void mutate({ action: "request_complement", missionId: mission.id, requestId: requestSource.id, reason: reasons[mission.id] }, "Complément demandé à l’Athlète.")}>Demander un complément</button>
                    <button type="button" className="secondary-button" disabled={busy || !(reasons[mission.id] ?? "").trim()} onClick={() => void mutate({ action: "close_request", missionId: mission.id, requestId: requestSource.id, reason: reasons[mission.id] }, "Demande classée sans suite.")}>Classer sans suite</button>
                  </section>
                ) : null}

                {mission.state === "organize" ? (
                  <section className="admin-mission-organization">
                    <header>
                      <div><h3>Créatifs compatibles</h3><p>La disponibilité aide au choix mais ne bloque jamais l’Admin.</p></div>
                      <button type="button" className="secondary-button" onClick={() => openEdit(mission)}>Modifier</button>
                    </header>
                    <div className="admin-mission-candidates">
                      {compatibleCandidates.map(({ candidate, compatible, availability }) => (
                        <label key={candidate.id} className={compatible ? "is-compatible" : undefined}>
                          <input type="checkbox" checked={selected.includes(candidate.id)} onChange={(event) => setSelectedRecipients({
                            ...selectedRecipients,
                            [mission.id]: event.target.checked
                              ? [...selected, candidate.id]
                              : selected.filter((id) => id !== candidate.id),
                          })} />
                          <span><strong>{candidate.displayName}</strong><small>{candidate.creativeType} · {candidate.coverageAreas.join(", ") || "Région non renseignée"} · {candidate.specialties.join(", ") || "Spécialités non renseignées"}</small><em>{availability}</em></span>
                        </label>
                      ))}
                    </div>
                    <div className="admin-mission-actions">
                      <button type="button" className="primary-button" disabled={busy || selected.length === 0 || !mission.region || !mission.contextNotes || !mission.deliverables || !mission.usageRights || !mission.expenseTerms} title={!mission.region || !mission.contextNotes || !mission.deliverables || !mission.usageRights || !mission.expenseTerms ? "Complétez la région, le contexte, les livrables, les droits et les conditions de frais." : undefined} onClick={() => void mutate(
                        requestSource
                          ? { action: "propose_athlete", missionId: mission.id, requestId: requestSource.id, production: productionInput(mission, selected) }
                          : { action: "propose_admin", missionId: mission.id, recipientIds: selected },
                        "Mission proposée via Production/Créatifs.",
                      )}>Proposer la mission</button>
                      <button type="button" className="secondary-button" disabled title="L’affectation directe reste soumise aux règles du workflow Production/Créatifs.">Affecter</button>
                      <label>Motif de classement<textarea value={reasons[mission.id] ?? ""} onChange={(event) => setReasons({ ...reasons, [mission.id]: event.target.value })} /></label>
                      <button type="button" className="secondary-button" disabled={busy || !(reasons[mission.id] ?? "").trim()} onClick={() => void mutate(
                        requestSource
                          ? { action: "close_request", missionId: mission.id, requestId: requestSource.id, reason: reasons[mission.id] }
                          : { action: "close", missionId: mission.id, reason: reasons[mission.id] },
                        "Mission classée sans suite.",
                      )}>Classer sans suite</button>
                    </div>
                  </section>
                ) : null}

                {mission.state === "proposed" && briefSource ? (
                  <section className="admin-mission-actions">
                    <p>Les candidatures et affectations restent gérées par le moteur Production/Créatifs.</p>
                    {compatibleCandidates.map(({ candidate }) => (
                      <button key={candidate.id} type="button" className="secondary-button" disabled={busy} onClick={() => void mutate({ action: "assign", missionId: mission.id, briefId: briefSource.id, creativeProfileId: candidate.id }, `${candidate.displayName} affecté via le workflow existant.`)}>
                        Affecter {candidate.displayName}
                      </button>
                    ))}
                  </section>
                ) : null}

                <details className="admin-mission-details">
                  <summary>Détails techniques</summary>
                  {mission.regularizationNote ? <section><h3>Régularisation</h3><p>{mission.regularizationNote}</p></section> : null}
                  <section><h3>Sources</h3><ul>{mission.sources.map((source) => (
                    <li key={`${source.type}:${source.id}`}><strong>{sourceLabels[source.type]}</strong><code>{source.id}</code><pre>{JSON.stringify(source.snapshot, null, 2)}</pre></li>
                  ))}</ul></section>
                  <section><h3>Journal</h3><ol>{mission.events.map((event) => (
                    <li key={`${event.action}:${event.createdAt}`}><strong>{event.action}</strong><span>{formatDate(event.createdAt)}</span>{event.note ? <p>{event.note}</p> : null}</li>
                  ))}</ol></section>
                </details>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
