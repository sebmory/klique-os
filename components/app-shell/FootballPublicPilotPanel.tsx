"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  FootballCandidateReconciliationView,
  FootballCollectionReport,
  FootballPublicBinding,
  FootballPublicTeamDiscovery,
  FootballReconciliationDecision,
  FootballSourceSuggestion,
  SportsWatchRunResult,
} from "@/types/sports-watch";

type AthleteSummary = {
  key: string;
  athleteId?: string;
  name: string;
  sport: string;
  club: string;
  status: string;
};

type PilotPayload = {
  bindings?: FootballPublicBinding[];
  reconciliations?: FootballCandidateReconciliationView[];
  sourceSuggestions?: FootballSourceSuggestion[];
  message?: string;
};

const normalize = (value: string): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const decisionLabels: Record<Exclude<FootballReconciliationDecision, "pending">, string> = {
  keep_manual: "Même événement — conserver le manuel",
  keep_automatic: "Même événement — conserver la source automatique",
  complete_manual: "Même événement — compléter le manuel",
  different_events: "Événements différents",
  examine_later: "Examiner plus tard",
};

const sourceStatusLabel = {
  available: "Disponible",
  unavailable: "Indisponible",
  failed: "Échec",
} as const;

export function FootballPublicPilotPanel({ athletes }: { athletes: AthleteSummary[] }) {
  const matheus = useMemo(() => athletes.find((athlete) =>
    normalize(athlete.name).includes("matheus monteiro")
    && normalize(athlete.sport).includes("football")
    && !normalize(athlete.sport).includes("americain")), [athletes]);
  const athleteId = matheus?.athleteId?.trim() || matheus?.key.trim() || "";
  const [bindings, setBindings] = useState<FootballPublicBinding[]>([]);
  const [reconciliations, setReconciliations] =
    useState<FootballCandidateReconciliationView[]>([]);
  const [sourceSuggestions, setSourceSuggestions] = useState<FootballSourceSuggestion[]>([]);
  const [discovery, setDiscovery] = useState<FootballPublicTeamDiscovery | null>(null);
  const [teamId, setTeamId] = useState("xh89ete5");
  const [playerId, setPlayerId] = useState("");
  const [affTeamId, setAffTeamId] = useState("");
  const [affPlayerId, setAffPlayerId] = useState("");
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [report, setReport] = useState<FootballCollectionReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const binding = bindings.find((item) => item.athleteId === athleteId);

  const load = async () => {
    if (!athleteId) return;
    const response = await fetch("/api/admin/sports-watch/football-bindings", {
      cache: "no-store",
    });
    const payload = await response.json() as PilotPayload;
    if (!response.ok) throw new Error(payload.message || "Chargement du pilote impossible.");
    const nextBindings = payload.bindings ?? [];
    setBindings(nextBindings);
    setReconciliations(payload.reconciliations ?? []);
    setSourceSuggestions(payload.sourceSuggestions ?? []);
    const nextBinding = nextBindings.find((item) => item.athleteId === athleteId);
    if (nextBinding) {
      setTeamId(nextBinding.footstatsTeamId);
      setPlayerId(nextBinding.footstatsPlayerId ?? "");
      setAffTeamId(nextBinding.affTeamId ?? "");
      setAffPlayerId(nextBinding.affPlayerId ?? "");
    }
  };

  useEffect(() => {
    if (!athleteId) return;
    let active = true;
    void fetch("/api/admin/sports-watch/football-bindings", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as PilotPayload;
        if (!response.ok) {
          throw new Error(payload.message || "Chargement du pilote impossible.");
        }
        if (!active) return;
        const nextBindings = payload.bindings ?? [];
        setBindings(nextBindings);
        setReconciliations(payload.reconciliations ?? []);
        setSourceSuggestions(payload.sourceSuggestions ?? []);
        const nextBinding = nextBindings.find((item) => item.athleteId === athleteId);
        if (nextBinding) {
          setTeamId(nextBinding.footstatsTeamId);
          setPlayerId(nextBinding.footstatsPlayerId ?? "");
          setAffTeamId(nextBinding.affTeamId ?? "");
          setAffPlayerId(nextBinding.affPlayerId ?? "");
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Chargement impossible.");
        }
      });
    return () => {
      active = false;
    };
  }, [athleteId]);

  const discover = async () => {
    if (!athleteId || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/sports-watch/football-bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId, teamId }),
      });
      const payload = await response.json() as {
        discovery?: FootballPublicTeamDiscovery;
        message?: string;
      };
      if (!response.ok || !payload.discovery) {
        throw new Error(payload.message || "Découverte Footstats impossible.");
      }
      setDiscovery(payload.discovery);
      setIdentityConfirmed(false);
      setMessage("Équipe et effectif publics relus. Choisissez explicitement Matheus.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Découverte impossible.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (status: "draft" | "verified" | "ambiguous") => {
    if (!athleteId || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/sports-watch/football-bindings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          teamId,
          selectedPlayerId: playerId || null,
          affTeamId: affTeamId || null,
          affPlayerId: affPlayerId || null,
          status,
          identityMatchConfirmed: identityConfirmed,
          expectedVersion: binding?.version ?? 0,
        }),
      });
      const payload = await response.json() as {
        binding?: FootballPublicBinding;
        message?: string;
      };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Enregistrement impossible.");
      }
      setBindings((current) => [
        payload.binding!,
        ...current.filter((item) => item.athleteId !== payload.binding!.athleteId),
      ]);
      setDiscovery(null);
      setIdentityConfirmed(false);
      setMessage(status === "verified"
        ? "Rattachement vérifié. La collecte planifiée peut maintenant l’utiliser."
        : status === "ambiguous"
          ? "Correspondance refusée comme ambiguë. Le planificateur l’ignorera."
          : "Brouillon enregistré. Le planificateur l’ignorera.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!binding || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/sports-watch/football-bindings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          expectedVersion: binding.version,
        }),
      });
      const payload = await response.json() as {
        binding?: FootballPublicBinding;
        message?: string;
      };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Désactivation impossible.");
      }
      setBindings((current) => [
        payload.binding!,
        ...current.filter((item) => item.athleteId !== payload.binding!.athleteId),
      ]);
      setMessage("Rattachement désactivé. Les candidats et l’historique sont conservés.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setBusy(false);
    }
  };

  const collect = async () => {
    if (!binding || binding.status !== "verified" || busy) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const response = await fetch("/api/admin/sports-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKey: "football-public", athleteId }),
      });
      const payload = await response.json() as {
        result?: SportsWatchRunResult;
        message?: string;
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.message || "Collecte impossible.");
      }
      setReport(payload.result.footballReport ?? null);
      setMessage(payload.result.message);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Collecte impossible.");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (
    reconciliation: FootballCandidateReconciliationView,
    decision: Exclude<FootballReconciliationDecision, "pending">,
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/football-reconciliations/${encodeURIComponent(reconciliation.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            expectedVersion: reconciliation.version,
          }),
        },
      );
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Décision impossible.");
      await load();
      setMessage("Décision de rapprochement enregistrée dans l’historique.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Décision impossible.");
    } finally {
      setBusy(false);
    }
  };

  const decideSourceSuggestion = async (
    suggestion: FootballSourceSuggestion,
    decision: "attached" | "rejected",
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/football-source-suggestions/${encodeURIComponent(suggestion.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, expectedVersion: suggestion.version }),
        },
      );
      const payload = await response.json() as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "Décision de rattachement impossible.");
      }
      await load();
      setMessage(decision === "attached"
        ? "La source publique a été rattachée sans écraser la saisie manuelle."
        : "La proposition de rattachement a été refusée.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Décision impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="today-secondary-action">
      <summary>Pilote football public — Matheus Monteiro</summary>
      <p style={{ color: "#475569", fontSize: "0.8rem" }}>
        Footstats — page publique, source tierce non officielle. Le résultat d’équipe ne
        prouve jamais la participation individuelle. Feuille officielle AFF indisponible —
        participation à compléter manuellement. Aucun contournement du HTTP 403 n’est tenté.
      </p>
      {!matheus ? (
        <p style={{ color: "#92400e" }}>
          Matheus Monteiro n’est pas présent parmi les athlètes actifs de cet espace.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem", minWidth: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
              gap: "0.65rem",
            }}
          >
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
              Athlète pilote
              <input value={`${matheus.name} — ${matheus.club}`} readOnly />
            </label>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
              Identifiant équipe Footstats
              <input
                value={teamId}
                disabled={busy}
                onChange={(event) => {
                  setTeamId(event.target.value);
                  setDiscovery(null);
                }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="card-link-button" disabled={busy} onClick={discover}>
              {busy ? "Lecture…" : "Découvrir l’équipe et l’effectif"}
            </button>
            {binding?.status === "verified" ? (
              <button type="button" className="card-link-button" disabled={busy} onClick={collect}>
                Lancer la collecte pilote
              </button>
            ) : null}
            {binding && binding.status !== "disabled" ? (
              <button type="button" className="card-link-button" disabled={busy} onClick={disable}>
                Désactiver
              </button>
            ) : null}
          </div>
          {binding ? (
            <p style={{ margin: 0, fontSize: "0.78rem" }}>
              Statut : <strong>{binding.status}</strong> · équipe {binding.footstatsTeamName}
              {" · "}{binding.competition} · {binding.season}
              {binding.footstatsPlayerName ? ` · joueur ${binding.footstatsPlayerName}` : ""}
            </p>
          ) : null}
          {discovery ? (
            <section
              style={{
                display: "grid",
                gap: "0.65rem",
                minWidth: 0,
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                padding: "0.75rem",
              }}
            >
              <strong>{discovery.teamName} · {discovery.competition} · {discovery.season}</strong>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                Joueur choisi explicitement dans l’effectif public
                <select
                  value={playerId}
                  disabled={busy}
                  onChange={(event) => {
                    setPlayerId(event.target.value);
                    setIdentityConfirmed(false);
                  }}
                >
                  <option value="">Aucun joueur confirmé</option>
                  {discovery.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.shirtNumber ? `#${player.shirtNumber} · ` : ""}
                      {player.name}{player.position ? ` · ${player.position}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
                  gap: "0.65rem",
                }}
              >
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                  Identifiant équipe AFF — facultatif, non vérifié
                  <input value={affTeamId} disabled={busy} onChange={(event) => setAffTeamId(event.target.value)} />
                </label>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                  Identifiant joueur AFF — facultatif, non vérifié
                  <input value={affPlayerId} disabled={busy} onChange={(event) => setAffPlayerId(event.target.value)} />
                </label>
              </div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.45rem", fontSize: "0.78rem" }}>
                <input
                  type="checkbox"
                  checked={identityConfirmed}
                  disabled={busy || !playerId}
                  onChange={(event) => setIdentityConfirmed(event.target.checked)}
                />
                Je confirme que le joueur choisi est bien Matheus Monteiro. Le nom seul
                n’est pas utilisé pour confirmer ce rattachement.
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button type="button" className="card-link-button" disabled={busy} onClick={() => void save("draft")}>
                  Enregistrer en brouillon
                </button>
                <button type="button" className="card-link-button" disabled={busy} onClick={() => void save("ambiguous")}>
                  Refuser comme ambigu
                </button>
                <button
                  type="button"
                  className="card-link-button"
                  disabled={busy || !playerId || !identityConfirmed}
                  onClick={() => void save("verified")}
                >
                  Confirmer le rattachement
                </button>
              </div>
            </section>
          ) : null}
          {report ? (
            <section aria-label="Rapport de collecte football" style={{ fontSize: "0.78rem" }}>
              <strong>{report.partialCoverage ? "Couverture partielle" : "Couverture complète"}</strong>
              <p>
                Matchs examinés : {report.matchesExamined} · feuilles : {report.lineupsFound}
                {" · "}présences nominatives : {report.namedPresenceFound}
                {" · "}candidats : {report.candidatesProposed} · doublons : {report.duplicates}
              </p>
              <ul>
                {report.sourcesQueried.map((source) => (
                  <li key={source.source}>
                    {source.source === "footstats" ? "Footstats" : "AFF"} :
                    {" "}{sourceStatusLabel[source.status]} — {source.detail}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {sourceSuggestions.length > 0 ? (
            <section style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
              <h4 style={{ margin: 0 }}>Sources publiques à rattacher</h4>
              {sourceSuggestions.map((suggestion) => (
                <article
                  key={suggestion.id}
                  style={{
                    display: "grid",
                    gap: "0.45rem",
                    padding: "0.65rem",
                    border: "1px solid #fed7aa",
                    borderRadius: "8px",
                    background: "#fff7ed",
                  }}
                >
                  <strong>{suggestion.manualCandidate.title}</strong>
                  <span style={{ fontSize: "0.76rem" }}>
                    {suggestion.evidence.eventDate} · {suggestion.evidence.team}
                    {" — "}{suggestion.evidence.opponent} · {suggestion.evidence.score}
                  </span>
                  <span style={{ fontSize: "0.74rem" }}>
                    Champs identiques : {suggestion.comparison.identical.join(", ")}.
                    {" "}Compléments : {suggestion.comparison.complementary.join(", ") || "aucun"}.
                    {" "}Contradictions : {suggestion.comparison.contradictions.join(", ") || "aucune"}.
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="card-link-button sports-action is-primary"
                      disabled={busy}
                      onClick={() => void decideSourceSuggestion(suggestion, "attached")}
                    >
                      Rattacher la source Footstats publique
                    </button>
                    <button
                      type="button"
                      className="card-link-button sports-action"
                      disabled={busy}
                      onClick={() => void decideSourceSuggestion(suggestion, "rejected")}
                    >
                      Ne pas rattacher
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ) : null}
          {reconciliations.length > 0 ? (
            <section style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
              <h4 style={{ margin: 0 }}>Rapprochements manuel / automatique</h4>
              {reconciliations.map((item) => (
                <article
                  key={item.id}
                  style={{
                    display: "grid",
                    gap: "0.55rem",
                    minWidth: 0,
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    padding: "0.75rem",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
                      gap: "0.65rem",
                    }}
                  >
                    <div>
                      <strong>Candidat manuel</strong>
                      <p>{item.manualCandidate.title}</p>
                      <small>
                        {item.manualCandidate.eventDateFrom} · {item.manualCandidate.sourceName}
                      </small>
                    </div>
                    <div>
                      <strong>Candidat Footstats/AFF</strong>
                      <p>{item.automaticCandidate.title}</p>
                      <small>
                        {item.automaticCandidate.eventDateFrom} · {item.automaticCandidate.sourceName}
                      </small>
                    </div>
                  </div>
                  <div style={{ fontSize: "0.75rem" }}>
                    <strong>Identiques :</strong> {item.comparison.identical.join(", ") || "aucun"}
                    <br />
                    <strong>Complémentaires :</strong> {item.comparison.complementary.join(", ") || "aucun"}
                    <br />
                    <strong>Contradictions :</strong> {item.comparison.contradictions.join(", ") || "aucune"}
                  </div>
                  <p style={{ margin: 0, fontSize: "0.75rem" }}>
                    Décision actuelle : <strong>{item.decision}</strong>. Aucun contenu n’est
                    fusionné silencieusement ; le candidat manuel reste prioritaire tant que la
                    décision est pending ou examine_later.
                  </p>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {(Object.keys(decisionLabels) as Array<Exclude<FootballReconciliationDecision, "pending">>)
                      .map((decision) => (
                        <button
                          key={decision}
                          type="button"
                          className="card-link-button"
                          disabled={busy}
                          onClick={() => void decide(item, decision)}
                        >
                          {decisionLabels[decision]}
                        </button>
                      ))}
                  </div>
                </article>
              ))}
            </section>
          ) : null}
        </div>
      )}
      {message ? <p role="status" style={{ color: "#166534" }}>{message}</p> : null}
      {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
    </details>
  );
}
