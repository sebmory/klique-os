"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminCreativeMissionListItem,
  AdminCreativeMissionQueueStatus,
} from "@/lib/admin-creative-missions";
import type { AthletesResponse } from "@/types/athlete";

type MissionFilter = "all" | AdminCreativeMissionQueueStatus;

type MissionsPayload = {
  missions?: AdminCreativeMissionListItem[];
  error?: string;
};

const filters: Array<{ value: MissionFilter; label: string }> = [
  { value: "all", label: "Toutes" },
  { value: "to_prepare", label: "À préparer" },
  { value: "to_assign", label: "À affecter" },
  { value: "awaiting_creative", label: "En attente du créatif" },
  { value: "in_progress", label: "En cours" },
  { value: "delivery_review", label: "Livraison à vérifier" },
  { value: "changes_requested", label: "Modifications demandées" },
  { value: "completed", label: "Terminées" },
  { value: "cancelled", label: "Annulées" },
];

const adminActionStatuses = new Set<AdminCreativeMissionQueueStatus>([
  "to_prepare",
  "to_assign",
  "delivery_review",
]);

const missionStatusLabels: Record<NonNullable<AdminCreativeMissionListItem["missionStatus"]>, string> = {
  draft: "Brouillon",
  ready: "Prête",
  cancelled: "Annulée",
};

const responseLabels: Record<AdminCreativeMissionListItem["responseStatus"], string> = {
  pending: "En attente",
  accepted: "Acceptée",
  refused: "Refusée",
};

const executionLabels: Record<NonNullable<AdminCreativeMissionListItem["executionStatus"]>, string> = {
  accepted: "Acceptée",
  in_progress: "En cours",
  delivered: "Livrée",
  changes_requested: "Modifications demandées",
  completed: "Terminée",
};

const normalizeSearch = (value: string): string =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr").trim();

export const filterAdminMissions = ({
  missions,
  filter,
  query,
}: {
  missions: AdminCreativeMissionListItem[];
  filter: MissionFilter;
  query: string;
}): AdminCreativeMissionListItem[] => {
  const normalizedQuery = normalizeSearch(query);
  return missions.filter((mission) => {
    if (filter !== "all" && mission.queueStatus !== filter) return false;
    if (!normalizedQuery) return true;
    return normalizeSearch([
      mission.reference,
      mission.title,
      mission.discipline,
      mission.locationName,
      mission.creative?.displayName,
    ].filter(Boolean).join(" ")).includes(normalizedQuery);
  });
};

const formatMissionDate = (value: string | null, startTime: string | null): string => {
  if (!value) return "Date à définir";
  const [year, month, day] = value.split("-");
  const date = year && month && day ? `${day}.${month}.${year}` : value;
  return startTime ? `${date} · ${startTime}` : date;
};

const formatUpdatedAt = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() === 0) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

export function AdminMissionsScreen() {
  const [missions, setMissions] = useState<AdminCreativeMissionListItem[]>([]);
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<MissionFilter>("all");
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
      const missionsPayload = (await missionsResponse.json().catch(() => null)) as MissionsPayload | null;
      if (!missionsResponse.ok) {
        throw new Error(missionsPayload?.error || "Impossible de charger les missions créatives.");
      }
      setMissions(missionsPayload?.missions ?? []);

      if (athletesResponse.ok) {
        const athletesPayload = (await athletesResponse.json().catch(() => null)) as AthletesResponse | null;
        if (athletesPayload?.source === "google-sheets") {
          setAthleteNames(Object.fromEntries(
            (athletesPayload.athletes ?? [])
              .filter((athlete) => athlete.key && athlete.name)
              .map((athlete) => [athlete.key, athlete.name]),
          ));
        } else {
          setAthleteNames({});
        }
      } else {
        setAthleteNames({});
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Impossible de charger les missions créatives.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const counts = useMemo(() => {
    const next = Object.fromEntries(filters.map((filter) => [filter.value, 0])) as Record<MissionFilter, number>;
    next.all = missions.length;
    for (const mission of missions) next[mission.queueStatus] += 1;
    return next;
  }, [missions]);

  const visibleMissions = useMemo(
    () => filterAdminMissions({ missions, filter: activeFilter, query }),
    [activeFilter, missions, query],
  );

  return (
    <section className="admin-missions-screen" aria-labelledby="admin-missions-title">
      <header className="admin-missions-header">
        <div>
          <p>Missions créatives</p>
          <h1 id="admin-missions-title">Suivi centralisé des missions</h1>
          <span>Affectations, réponses, exécutions et livraisons issues des demandes de prestations.</span>
        </div>
      </header>

      <section className="admin-missions-toolbar" aria-label="Recherche et filtres des missions">
        <label className="admin-missions-search">
          <span>Rechercher</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Référence, titre, discipline, lieu ou créatif"
          />
        </label>
        <div className="admin-missions-filters" role="group" aria-label="Filtrer par état">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={activeFilter === filter.value ? "is-active" : undefined}
              aria-pressed={activeFilter === filter.value}
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label} <span>{counts[filter.value]}</span>
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <section className="admin-missions-state" aria-live="polite" aria-busy="true">
          <strong>Chargement des missions créatives…</strong>
          <p>Les affectations et livraisons sont en cours de regroupement.</p>
        </section>
      ) : error ? (
        <section className="admin-missions-state is-error" role="alert">
          <strong>Impossible de charger les missions.</strong>
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>Réessayer</button>
        </section>
      ) : visibleMissions.length === 0 ? (
        <section className="admin-missions-state">
          <strong>{missions.length === 0 ? "Aucune mission créative." : "Aucun résultat."}</strong>
          <p>
            {missions.length === 0
              ? "Les demandes de prestations apparaîtront ici dès leur création."
              : "Modifiez la recherche ou sélectionnez un autre état."}
          </p>
        </section>
      ) : (
        <ul className="admin-missions-list">
          {visibleMissions.map((mission) => {
            const athleteName = athleteNames[mission.athleteId];
            const requestHref = `/crm/demandes?tab=services&requestId=${encodeURIComponent(mission.requestId)}`;
            const isAdminAction = adminActionStatuses.has(mission.queueStatus);
            return (
              <li key={mission.requestId} className="admin-mission-card">
                <header>
                  <div>
                    <small>{mission.reference ?? "Fiche à créer"}</small>
                    <h2>{mission.title}</h2>
                  </div>
                  {isAdminAction ? (
                    <Link
                      href={requestHref}
                      className={`admin-mission-priority is-admin-action is-${mission.queueStatus}`}
                      aria-label={`${mission.nextAction} pour ${mission.title}`}
                    >
                      {mission.nextAction}
                    </Link>
                  ) : (
                    <span className={`admin-mission-priority is-informational is-${mission.queueStatus}`}>
                      {mission.nextAction}
                    </span>
                  )}
                </header>

                <dl>
                  <div><dt>Discipline</dt><dd>{mission.discipline ?? "À définir"}</dd></div>
                  <div><dt>Date</dt><dd>{formatMissionDate(mission.missionDate, mission.startTime)}</dd></div>
                  <div><dt>Lieu</dt><dd>{mission.locationName ?? "À définir"}</dd></div>
                  <div>
                    <dt>Athlète</dt>
                    <dd>
                      {athleteName ? (
                        <Link href={`/crm/personnes/${encodeURIComponent(mission.athleteId)}`}>{athleteName}</Link>
                      ) : "Identité non disponible"}
                    </dd>
                  </div>
                  <div><dt>Créatif affecté</dt><dd>{mission.creative?.displayName ?? "Non affecté"}</dd></div>
                  <div><dt>Fiche</dt><dd>{mission.missionStatus ? missionStatusLabels[mission.missionStatus] : "À créer"}</dd></div>
                  <div><dt>Réponse</dt><dd>{responseLabels[mission.responseStatus]}</dd></div>
                  <div><dt>Exécution</dt><dd>{mission.executionStatus ? executionLabels[mission.executionStatus] : "Non démarrée"}</dd></div>
                  <div><dt>Dernière mise à jour</dt><dd>{formatUpdatedAt(mission.lastUpdatedAt)}</dd></div>
                </dl>

                <footer>
                  <Link href={requestHref}>
                    Ouvrir la demande
                  </Link>
                </footer>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
