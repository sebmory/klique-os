"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CanonicalCreativeMission,
  CanonicalCreativeMissionCounts,
  CanonicalCreativeMissionState,
  CanonicalCreativeMissionView,
} from "@/lib/canonical-creative-missions";
import type { AthletesResponse } from "@/types/athlete";

type MissionsPayload = {
  missions?: CanonicalCreativeMission[];
  counts?: CanonicalCreativeMissionCounts;
  error?: string;
};

const emptyCounts: CanonicalCreativeMissionCounts = {
  to_process: 0,
  to_organize: 0,
  in_progress: 0,
  history: 0,
};

const views: Array<{ value: CanonicalCreativeMissionView; label: string }> = [
  { value: "to_process", label: "À traiter" },
  { value: "to_organize", label: "À organiser" },
  { value: "in_progress", label: "En cours" },
  { value: "history", label: "Historique" },
];

const stateLabels: Record<CanonicalCreativeMissionState, string> = {
  review: "À examiner",
  organize: "À organiser",
  proposed: "Proposée",
  confirmed: "Confirmée",
  in_progress: "En cours",
  review_delivery: "À valider",
  completed: "Terminée",
  closed_without_action: "Classée sans suite",
};

const missionTypeLabels: Record<CanonicalCreativeMission["missionType"], string> = {
  media_day: "Media Day",
  match_competition: "Match / compétition",
  production: "Production",
  other: "Autre",
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
      mission.creative?.name,
      ...mission.athletes.flatMap((athlete) => [athlete.id, athlete.name]),
      ...mission.services.map((service) => service.productName),
      ...mission.sources.map((source) => sourceLabels[source.type]),
    ].filter(Boolean).join(" ")).includes(normalizedQuery);
  });
};

const formatDate = (mission: CanonicalCreativeMission): string => {
  const value = mission.occurredAt ?? mission.scheduledAt;
  if (!value) return "À définir";
  return new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "long",
  }).format(new Date(value));
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

const originLabel = (mission: CanonicalCreativeMission): string => {
  const origins = [...new Set(mission.sources.map((source) => sourceLabels[source.type]))];
  return origins.length > 0 ? origins.join(" · ") : "Projection canonique";
};

const prettySourceSnapshot = (
  source: CanonicalCreativeMission["sources"][number],
): string => JSON.stringify(source.snapshot, null, 2);

export function AdminMissionsScreen() {
  const [missions, setMissions] = useState<CanonicalCreativeMission[]>([]);
  const [counts, setCounts] = useState<CanonicalCreativeMissionCounts>(emptyCounts);
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({});
  const [activeView, setActiveView] = useState<CanonicalCreativeMissionView>("to_process");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

      if (athletesResponse.ok) {
        const athletesPayload = await athletesResponse.json().catch(() => null) as AthletesResponse | null;
        setAthleteNames(Object.fromEntries(
          (athletesPayload?.athletes ?? [])
            .filter((athlete) => athlete.key && athlete.name)
            .map((athlete) => [athlete.key, athlete.name]),
        ));
      } else {
        setAthleteNames({});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch((failure) => {
        setError(failure instanceof Error ? failure.message : "Impossible de charger les missions créatives.");
        setLoading(false);
      });
  }, [load]);

  const visibleMissions = useMemo(
    () => filterCanonicalMissions({ missions, view: activeView, query }),
    [activeView, missions, query],
  );

  return (
    <section className="admin-missions-screen" aria-labelledby="admin-missions-title">
      <header className="admin-missions-header">
        <div>
          <p>Missions créatives</p>
          <h1 id="admin-missions-title">Pilotage unifié des missions</h1>
          <span>Demandes, organisation, exécution et historique dans une seule projection métier.</span>
        </div>
      </header>

      <section className="admin-missions-toolbar" aria-label="Recherche et vues des missions">
        <label className="admin-missions-search">
          <span>Rechercher</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Athlète, mission, prestation, Production ou créatif"
          />
        </label>
        <div className="admin-missions-filters" role="group" aria-label="Vues des missions">
          {views.map((view) => (
            <button
              key={view.value}
              type="button"
              className={activeView === view.value ? "is-active" : undefined}
              aria-pressed={activeView === view.value}
              onClick={() => setActiveView(view.value)}
            >
              {view.label} <span>{counts[view.value]}</span>
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <section className="admin-missions-state" aria-live="polite" aria-busy="true">
          <strong>Chargement des missions créatives…</strong>
          <p>La projection métier et son journal sont en cours de chargement.</p>
        </section>
      ) : error ? (
        <section className="admin-missions-state is-error" role="alert">
          <strong>Impossible de charger les missions.</strong>
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>Réessayer</button>
        </section>
      ) : visibleMissions.length === 0 ? (
        <section className="admin-missions-state">
          <strong>{missions.length === 0 ? "Aucune mission créative." : "Aucun résultat dans cette vue."}</strong>
          <p>
            {missions.length === 0
              ? "Les demandes et besoins apparaîtront ici dès leur création."
              : "Modifiez la recherche ou sélectionnez une autre vue."}
          </p>
        </section>
      ) : (
        <ul className="admin-missions-list">
          {visibleMissions.map((mission) => (
            <li className="admin-mission-card" key={mission.id}>
              <header>
                <div>
                  <small>{originLabel(mission)}</small>
                  <h2>{mission.title}</h2>
                </div>
                <span className={`admin-mission-state-badge is-${mission.state}`}>
                  {stateLabel(mission)}
                </span>
              </header>

              <dl>
                <div>
                  <dt>Athlète{mission.athletes.length > 1 ? "s" : ""}</dt>
                  <dd className="admin-mission-athletes">
                    {mission.athletes.map((athlete) => (
                      <Link key={athlete.id} href={`/crm/personnes/${encodeURIComponent(athlete.id)}`}>
                        {athlete.name ?? athleteNames[athlete.id] ?? athlete.id}
                      </Link>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{formatDate(mission)}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{missionTypeLabels[mission.missionType]}</dd>
                </div>
                <div>
                  <dt>Prestations</dt>
                  <dd>
                    {mission.services.length > 0
                      ? mission.services.map((service) => service.productName).join(" · ")
                      : "Aucune prestation historique"}
                  </dd>
                </div>
                <div>
                  <dt>Créatif</dt>
                  <dd>
                    {mission.creative
                      ? `${mission.creative.name} — ${
                          mission.creative.kind === "historical"
                            ? "créatif historique déclaré"
                            : "créatif opérationnel"
                        }`
                      : "À définir"}
                  </dd>
                </div>
                <div>
                  <dt>Prochaine action</dt>
                  <dd>{mission.nextAction}</dd>
                </div>
              </dl>

              <details className="admin-mission-details">
                <summary>Détails techniques et journal</summary>
                {mission.regularizationNote ? (
                  <section>
                    <h3>Régularisation</h3>
                    <p>{mission.regularizationNote}</p>
                    {mission.occurredAtSource === "historicalRealizationAt_best_available" ? (
                      <p>
                        Date réelle fondée sur <code>historicalRealizationAt</code>,
                        meilleure date historique disponible.
                      </p>
                    ) : null}
                  </section>
                ) : null}
                <section>
                  <h3>Sources</h3>
                  <ul>
                    {mission.sources.map((source) => (
                      <li key={`${source.type}:${source.id}`}>
                        <strong>{sourceLabels[source.type]}</strong>
                        {source.type === "athlete_service_request" ? (
                          <Link href={`/crm/demandes?tab=services&requestId=${encodeURIComponent(source.id)}`}>
                            Voir la demande source
                          </Link>
                        ) : null}
                        <pre>{prettySourceSnapshot(source)}</pre>
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3>Journal</h3>
                  <ol>
                    {mission.events.map((event) => (
                      <li key={`${event.action}:${event.createdAt}`}>
                        <strong>{event.action}</strong>
                        <span>{new Intl.DateTimeFormat("fr-CH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(event.createdAt))}</span>
                        {event.note ? <p>{event.note}</p> : null}
                      </li>
                    ))}
                  </ol>
                </section>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
