"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildSportsWatchTournamentGroups,
  type SportsWatchDisciplineGroup,
} from "@/lib/sports-watch/presentation";
import { Card } from "@/src/design-system/components";
import type {
  IwwfBinding,
  IwwfIdentityVerification,
  SafvBinding,
  SafvTeamVerification,
  SportsWatchCandidate,
  SportsWatchRunResult,
  SportsWatchSourceKey,
  SwissBadmintonBinding,
  SwissBadmintonIdentityVerification,
} from "@/types/sports-watch";

type AthleteSummary = {
  key: string;
  athleteId?: string;
  name: string;
  sport: string;
  club: string;
};

const formatDate = (value: string | null): string => {
  if (!value) return "inconnue";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "inconnue";
  return new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium", timeZone: "UTC" }).format(date);
};

const adminStatusLabels = {
  pending: "En attente",
  validated: "Validé",
  rejected: "Rejeté",
} as const;

const verificationLabels = {
  unverified: "À vérifier",
  verified: "Vérifié",
  disputed: "Contesté",
} as const;

const disciplineLabels = {
  simple: "Simple",
  double: "Double",
  mixte: "Mixte",
} as const;

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

const disciplineSummary = (group: SportsWatchDisciplineGroup): string => {
  const parts = [
    pluralize(group.collectedCount, "match collecté", "matches collectés"),
    pluralize(group.victories, "victoire"),
    pluralize(group.defeats, "défaite"),
  ];
  if (group.forfeits > 0) parts.push(pluralize(group.forfeits, "forfait"));
  if (group.retirements > 0) parts.push(pluralize(group.retirements, "abandon"));
  if (group.unknown > 0) parts.push(pluralize(group.unknown, "résultat non standard"));
  return parts.join(" · ");
};

const sourceOptions: Array<{
  key: SportsWatchSourceKey;
  label: string;
  url: string;
}> = [
  {
    key: "bc-bulle",
    label: "Badminton Club Bulle",
    url: "https://bcbulle.ch/feed/",
  },
  {
    key: "swiss-badminton",
    label: "Swiss Badminton / Tournamentsoftware",
    url: "https://sb.tournamentsoftware.com/",
  },
  {
    key: "iwwf-wakesurf",
    label: "IWWF / Wakesurf",
    url: "https://ems.iwwf.sport/",
  },
  {
    key: "kenpokan",
    label: "Kenpokan Dojo",
    url: "https://kenpokan-dojo.ch/feed/",
  },
  {
    key: "safv",
    label: "SAFV / football américain",
    url: "https://www.safv.ch/spiele-366618v4/",
  },
];

export function SportsWatchAdminCard({ athletes }: { athletes: AthleteSummary[] }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<SportsWatchCandidate[]>([]);
  const [swissBindings, setSwissBindings] = useState<SwissBadmintonBinding[]>([]);
  const [iwwfBindings, setIwwfBindings] = useState<IwwfBinding[]>([]);
  const [safvBindings, setSafvBindings] = useState<SafvBinding[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState("");
  const [selectedSourceKey, setSelectedSourceKey] = useState<SportsWatchSourceKey>("bc-bulle");
  const [swissProfileUrl, setSwissProfileUrl] = useState("");
  const [swissPlayerId, setSwissPlayerId] = useState("");
  const [swissVerification, setSwissVerification] =
    useState<SwissBadmintonIdentityVerification | null>(null);
  const [swissConfigBusy, setSwissConfigBusy] = useState(false);
  const [iwwfProfileUrl, setIwwfProfileUrl] = useState("");
  const [iwwfVerification, setIwwfVerification] =
    useState<IwwfIdentityVerification | null>(null);
  const [iwwfConfigBusy, setIwwfConfigBusy] = useState(false);
  const [safvScheduleUrl, setSafvScheduleUrl] = useState("");
  const [safvTeamName, setSafvTeamName] = useState("");
  const [safvVerification, setSafvVerification] =
    useState<SafvTeamVerification | null>(null);
  const [safvConfigBusy, setSafvConfigBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const athleteOptions = useMemo(
    () => athletes
      .map((athlete) => ({
        id: athlete.athleteId?.trim() || athlete.key.trim(),
        label: `${athlete.name}${athlete.sport ? ` — ${athlete.sport}` : ""}${athlete.club ? ` · ${athlete.club}` : ""}`,
      }))
      .filter((athlete) => athlete.id && athlete.label.trim())
      .sort((left, right) => left.label.localeCompare(right.label, "fr")),
    [athletes],
  );
  const selectedSource = sourceOptions.find((source) => source.key === selectedSourceKey)
    ?? sourceOptions[0];
  const selectedAthlete = athletes.find((athlete) =>
    (athlete.athleteId?.trim() || athlete.key.trim()) === selectedAthleteId);
  const selectedSwissBinding = swissBindings.find((binding) =>
    binding.athleteId === selectedAthleteId);
  const selectedIwwfBinding = iwwfBindings.find((binding) =>
    binding.athleteId === selectedAthleteId);
  const selectedSafvBinding = safvBindings.find((binding) =>
    binding.athleteId === selectedAthleteId);
  const selectedSourceUrl = selectedSourceKey === "swiss-badminton"
    ? selectedSwissBinding?.officialIdentity.profileUrl ?? selectedSource.url
    : selectedSourceKey === "iwwf-wakesurf"
      ? selectedIwwfBinding?.officialIdentity.profileUrl ?? selectedSource.url
      : selectedSourceKey === "safv"
        ? selectedSafvBinding?.officialTeam.scheduleUrl ?? selectedSource.url
    : selectedSource.url;
  const tournamentGroups = useMemo(
    () => buildSportsWatchTournamentGroups(candidates),
    [candidates],
  );

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/sports-watch", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as {
          candidates?: SportsWatchCandidate[];
          swissBindings?: SwissBadmintonBinding[];
          iwwfBindings?: IwwfBinding[];
          safvBindings?: SafvBinding[];
          message?: string;
        };
        if (!response.ok) throw new Error(payload.message || "Impossible de charger la veille sportive.");
        if (active) {
          setCandidates(payload.candidates ?? []);
          setSwissBindings(payload.swissBindings ?? []);
          setIwwfBindings(payload.iwwfBindings ?? []);
          setSafvBindings(payload.safvBindings ?? []);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSwissProfileUrl(selectedSwissBinding?.officialIdentity.profileUrl ?? "");
    setSwissPlayerId(selectedSwissBinding?.officialIdentity.playerId ?? "");
    setSwissVerification(null);
  }, [selectedAthleteId, selectedSwissBinding]);

  useEffect(() => {
    setIwwfProfileUrl(selectedIwwfBinding?.officialIdentity.profileUrl ?? "");
    setIwwfVerification(null);
  }, [selectedAthleteId, selectedIwwfBinding]);

  useEffect(() => {
    setSafvScheduleUrl(selectedSafvBinding?.officialTeam.scheduleUrl ?? "");
    setSafvTeamName(selectedSafvBinding?.officialTeam.teamName ?? "");
    setSafvVerification(null);
  }, [selectedAthleteId, selectedSafvBinding]);

  const updateSwissBinding = (binding: SwissBadmintonBinding) => {
    setSwissBindings((current) => {
      const remaining = current.filter((item) => item.athleteId !== binding.athleteId);
      return [binding, ...remaining];
    });
  };

  const updateIwwfBinding = (binding: IwwfBinding) => {
    setIwwfBindings((current) => {
      const remaining = current.filter((item) => item.athleteId !== binding.athleteId);
      return [binding, ...remaining];
    });
  };

  const updateSafvBinding = (binding: SafvBinding) => {
    setSafvBindings((current) => {
      const remaining = current.filter((item) => item.athleteId !== binding.athleteId);
      return [binding, ...remaining];
    });
  };

  const verifySwissProfile = async () => {
    if (!selectedAthleteId || swissConfigBusy) return;
    setSwissConfigBusy(true);
    setSwissVerification(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/sports-watch/swiss-bindings/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: selectedAthleteId,
          profileUrl: swissProfileUrl,
          playerId: swissPlayerId,
        }),
      });
      const payload = await response.json() as {
        verification?: SwissBadmintonIdentityVerification;
        message?: string;
      };
      if (!response.ok || !payload.verification) {
        throw new Error(payload.message || "Impossible de vérifier le profil officiel.");
      }
      setSwissVerification(payload.verification);
      setSwissPlayerId(payload.verification.officialIdentity.playerId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vérification impossible.");
    } finally {
      setSwissConfigBusy(false);
    }
  };

  const confirmSwissBinding = async () => {
    if (!selectedAthleteId || !swissVerification || swissConfigBusy) return;
    setSwissConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/swiss-bindings/${encodeURIComponent(selectedAthleteId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileUrl: swissProfileUrl,
            playerId: swissPlayerId,
            expectedVersion: selectedSwissBinding?.version ?? 0,
          }),
        },
      );
      const payload = await response.json() as { binding?: SwissBadmintonBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de confirmer le rattachement.");
      }
      updateSwissBinding(payload.binding);
      setSwissVerification(null);
      setMessage("Profil Swiss Badminton vérifié et confirmé.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation impossible.");
    } finally {
      setSwissConfigBusy(false);
    }
  };

  const disableSwissBinding = async () => {
    if (!selectedSwissBinding?.active || swissConfigBusy) return;
    setSwissConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/swiss-bindings/${encodeURIComponent(selectedSwissBinding.athleteId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: selectedSwissBinding.version }),
        },
      );
      const payload = await response.json() as { binding?: SwissBadmintonBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de désactiver le rattachement.");
      }
      updateSwissBinding(payload.binding);
      setMessage("Rattachement désactivé. Les résultats historiques sont conservés.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setSwissConfigBusy(false);
    }
  };

  const verifyIwwfProfile = async () => {
    if (!selectedAthleteId || iwwfConfigBusy) return;
    setIwwfConfigBusy(true);
    setIwwfVerification(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/sports-watch/iwwf-bindings/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: selectedAthleteId,
          profileUrl: iwwfProfileUrl,
        }),
      });
      const payload = await response.json() as {
        verification?: IwwfIdentityVerification;
        message?: string;
      };
      if (!response.ok || !payload.verification) {
        throw new Error(payload.message || "Impossible de vérifier le profil IWWF.");
      }
      setIwwfVerification(payload.verification);
      setIwwfProfileUrl(payload.verification.officialIdentity.profileUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vérification impossible.");
    } finally {
      setIwwfConfigBusy(false);
    }
  };

  const confirmIwwfBinding = async () => {
    if (!selectedAthleteId || !iwwfVerification || iwwfConfigBusy) return;
    setIwwfConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/iwwf-bindings/${encodeURIComponent(selectedAthleteId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileUrl: iwwfProfileUrl,
            expectedVersion: selectedIwwfBinding?.version ?? 0,
          }),
        },
      );
      const payload = await response.json() as { binding?: IwwfBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de confirmer le rattachement IWWF.");
      }
      updateIwwfBinding(payload.binding);
      setIwwfVerification(null);
      setMessage("Profil IWWF vérifié et confirmé.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation impossible.");
    } finally {
      setIwwfConfigBusy(false);
    }
  };

  const disableIwwfBinding = async () => {
    if (!selectedIwwfBinding?.active || iwwfConfigBusy) return;
    setIwwfConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/iwwf-bindings/${encodeURIComponent(selectedIwwfBinding.athleteId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: selectedIwwfBinding.version }),
        },
      );
      const payload = await response.json() as { binding?: IwwfBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de désactiver le rattachement IWWF.");
      }
      updateIwwfBinding(payload.binding);
      setMessage("Rattachement IWWF désactivé. Les résultats historiques sont conservés.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setIwwfConfigBusy(false);
    }
  };

  const verifySafvTeam = async () => {
    if (!selectedAthleteId || safvConfigBusy) return;
    setSafvConfigBusy(true);
    setSafvVerification(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/sports-watch/safv-bindings/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: selectedAthleteId,
          scheduleUrl: safvScheduleUrl,
          teamName: safvTeamName,
        }),
      });
      const payload = await response.json() as {
        verification?: SafvTeamVerification;
        message?: string;
      };
      if (!response.ok || !payload.verification) {
        throw new Error(payload.message || "Impossible de vérifier l’équipe SAFV.");
      }
      setSafvVerification(payload.verification);
      setSafvScheduleUrl(payload.verification.officialTeam.scheduleUrl);
      setSafvTeamName(payload.verification.officialTeam.teamName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vérification impossible.");
    } finally {
      setSafvConfigBusy(false);
    }
  };

  const confirmSafvBinding = async () => {
    if (!selectedAthleteId || !safvVerification || safvConfigBusy) return;
    setSafvConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/safv-bindings/${encodeURIComponent(selectedAthleteId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduleUrl: safvScheduleUrl,
            teamName: safvTeamName,
            expectedVersion: selectedSafvBinding?.version ?? 0,
          }),
        },
      );
      const payload = await response.json() as { binding?: SafvBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de confirmer le rattachement SAFV.");
      }
      updateSafvBinding(payload.binding);
      setSafvVerification(null);
      setMessage("Équipe SAFV vérifiée et confirmée.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation impossible.");
    } finally {
      setSafvConfigBusy(false);
    }
  };

  const disableSafvBinding = async () => {
    if (!selectedSafvBinding?.active || safvConfigBusy) return;
    setSafvConfigBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/safv-bindings/${encodeURIComponent(selectedSafvBinding.athleteId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: selectedSafvBinding.version }),
        },
      );
      const payload = await response.json() as { binding?: SafvBinding; message?: string };
      if (!response.ok || !payload.binding) {
        throw new Error(payload.message || "Impossible de désactiver le rattachement SAFV.");
      }
      updateSafvBinding(payload.binding);
      setMessage("Rattachement SAFV désactivé. Les résultats historiques sont conservés.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setSafvConfigBusy(false);
    }
  };

  const runWatch = async () => {
    if (busy || !selectedAthleteId) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/sports-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKey: selectedSourceKey, athleteId: selectedAthleteId }),
      });
      const payload = await response.json() as { result?: SportsWatchRunResult; message?: string };
      if (!response.ok || !payload.result) {
        throw new Error(payload.message || "Impossible de lancer la veille sportive.");
      }
      setCandidates(payload.result.candidates);
      setMessage(payload.result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Collecte impossible.");
    } finally {
      setBusy(false);
    }
  };

  const review = async (candidate: SportsWatchCandidate, status: "validated" | "rejected") => {
    if (busyCandidateId) return;
    setBusyCandidateId(candidate.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sports-watch/${encodeURIComponent(candidate.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, version: candidate.version }),
      });
      const payload = await response.json() as { candidate?: SportsWatchCandidate; message?: string };
      if (!response.ok || !payload.candidate) {
        throw new Error(payload.message || "Impossible d’enregistrer la décision.");
      }
      setCandidates((current) =>
        current.map((item) => item.id === payload.candidate!.id ? payload.candidate! : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Décision impossible.");
    } finally {
      setBusyCandidateId(null);
    }
  };

  const prepareArticle = (candidate: SportsWatchCandidate) => {
    const query = new URLSearchParams({
      objective: "article",
      subject: candidate.athleteName,
      subjectId: candidate.athleteId,
      contextType: "athlete",
      sportsWatchCandidateId: candidate.id,
    });
    router.push(`/contents/create?${query.toString()}`);
  };

  const renderCandidateActions = (candidate: SportsWatchCandidate) => (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.65rem" }}>
      <button
        type="button"
        className="card-link-button"
        disabled={
          busyCandidateId === candidate.id
          || candidate.attributionStatus === "ambiguous"
        }
        onClick={() => void review(candidate, "validated")}
      >
        Valider
      </button>
      <button
        type="button"
        className="card-link-button"
        disabled={busyCandidateId === candidate.id}
        onClick={() => void review(candidate, "rejected")}
      >
        Rejeter
      </button>
      {candidate.adminStatus === "validated" ? (
        <button
          type="button"
          className="card-link-button"
          onClick={() => prepareArticle(candidate)}
        >
          Préparer un article
        </button>
      ) : null}
      {candidate.attributionStatus === "ambiguous" ? (
        <small style={{ color: "#92400e", alignSelf: "center" }}>
          Validation bloquée : attribution à confirmer.
        </small>
      ) : null}
    </div>
  );

  const renderSourceDetails = (candidate: SportsWatchCandidate) => (
    <details style={{ marginTop: "0.55rem", minWidth: 0 }}>
      <summary style={{ cursor: "pointer", color: "#6b7280", fontSize: "0.78rem", fontWeight: 700 }}>
        Détails et source
      </summary>
      <div style={{ marginTop: "0.45rem", minWidth: 0, overflowWrap: "anywhere" }}>
        <p style={{ margin: "0 0 0.45rem", whiteSpace: "pre-wrap", fontSize: "0.82rem" }}>
          {candidate.excerpt}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.76rem" }}>
          <a href={candidate.articleUrl} target="_blank" rel="noreferrer">Résultat officiel</a>
          <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">{candidate.sourceName}</a>
          <span>Attribution : {candidate.attributionStatus === "matched" ? "concordante" : "à vérifier"}</span>
          <span>Vérification : {verificationLabels[candidate.verificationStatus]}</span>
          <span>Collecte : {formatDate(candidate.collectedAt)}</span>
        </div>
      </div>
    </details>
  );

  return (
    <Card className="workspace-dashboard-card" style={{ minWidth: 0 }}>
      <header className="dashboard-card-head">
        <div>
          <h2>Veille sportive</h2>
          <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.82rem" }}>
            Source sélectionnée :{" "}
            <a href={selectedSourceUrl} target="_blank" rel="noreferrer">{selectedSource.label}</a>
          </p>
        </div>
        <span className="card-pill">{candidates.filter((candidate) => candidate.adminStatus === "pending").length} en attente</span>
      </header>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
        <select
          aria-label="Source de veille"
          value={selectedSourceKey}
          disabled={busy}
          onChange={(event) => setSelectedSourceKey(event.target.value as SportsWatchSourceKey)}
          style={{ minWidth: "16rem", flex: "1 1 16rem" }}
        >
          {sourceOptions.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
        </select>
        <select
          aria-label="Athlète CRM à surveiller"
          value={selectedAthleteId}
          disabled={busy}
          onChange={(event) => setSelectedAthleteId(event.target.value)}
          style={{ minWidth: "16rem", flex: "1 1 16rem" }}
        >
          <option value="">Sélectionner un athlète CRM</option>
          {athleteOptions.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.label}</option>)}
        </select>
        <button
          type="button"
          className="card-link-button"
          disabled={
            busy
            || !selectedAthleteId
            || (selectedSourceKey === "swiss-badminton" && !selectedSwissBinding?.active)
            || (selectedSourceKey === "iwwf-wakesurf" && !selectedIwwfBinding?.active)
            || (selectedSourceKey === "safv" && !selectedSafvBinding?.active)
          }
          onClick={() => void runWatch()}
        >
          {busy ? "Collecte…" : "Lancer la veille"}
        </button>
      </div>

      {selectedSourceKey === "swiss-badminton" ? (
        <details
          style={{
            marginTop: "0.7rem",
            minWidth: 0,
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "0.65rem 0.75rem",
            background: "#fafafa",
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: "0.84rem", fontWeight: 750 }}>
            Profil officiel · {selectedSwissBinding?.active
              ? "rattachement actif"
              : selectedSwissBinding
                ? "rattachement désactivé"
                : "à configurer"}
          </summary>
          <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.76rem" }}>
            Le serveur relit le profil avant chaque confirmation. Le nom seul ne suffit pas ;
            l’URL, l’UUID et l’identifiant joueur sont aussi contrôlés.
          </p>
          {!selectedAthleteId ? (
            <p style={{ margin: 0, fontSize: "0.8rem" }}>
              Sélectionnez d’abord un athlète CRM.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem", minWidth: 0 }}>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                URL officielle Tournamentsoftware
                <input
                  type="url"
                  value={swissProfileUrl}
                  disabled={swissConfigBusy}
                  placeholder="https://sb.tournamentsoftware.com/player-profile/…"
                  onChange={(event) => {
                    setSwissProfileUrl(event.target.value);
                    setSwissVerification(null);
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                Identifiant joueur officiel — facultatif si détecté automatiquement
                <input
                  type="text"
                  inputMode="numeric"
                  value={swissPlayerId}
                  disabled={swissConfigBusy}
                  onChange={(event) => {
                    setSwissPlayerId(event.target.value);
                    setSwissVerification(null);
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="card-link-button"
                  disabled={swissConfigBusy || !swissProfileUrl.trim()}
                  onClick={() => void verifySwissProfile()}
                >
                  {swissConfigBusy ? "Vérification…" : "Vérifier le profil"}
                </button>
                {selectedSwissBinding?.active ? (
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={swissConfigBusy}
                    onClick={() => void disableSwissBinding()}
                  >
                    Désactiver
                  </button>
                ) : null}
              </div>
              {swissVerification ? (
                <div
                  style={{
                    borderLeft: "3px solid #2563eb",
                    paddingLeft: "0.65rem",
                    fontSize: "0.78rem",
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong>Comparaison avant confirmation</strong>
                  <p style={{ margin: "0.35rem 0" }}>
                    Fiche CRM : {selectedAthlete?.name} · {selectedAthlete?.sport || "sport inconnu"}
                    {" · "}{selectedAthlete?.club || "club inconnu"}
                  </p>
                  <p style={{ margin: "0.35rem 0" }}>
                    Profil officiel : {swissVerification.officialIdentity.name}
                    {" · ID "}{swissVerification.officialIdentity.playerId}
                    {" · "}{swissVerification.officialIdentity.club || "club non indiqué"}
                  </p>
                  {swissVerification.clubComparison === "different" ? (
                    <p style={{ margin: "0.35rem 0", color: "#92400e" }}>
                      Le club officiel diffère de la fiche CRM. Cette différence est signalée sans conclure
                      automatiquement à une mauvaise identité.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={swissConfigBusy}
                    onClick={() => void confirmSwissBinding()}
                  >
                    Confirmer explicitement le rattachement
                  </button>
                </div>
              ) : selectedSwissBinding ? (
                <small>
                  {selectedSwissBinding.officialIdentity.name}
                  {" · ID "}{selectedSwissBinding.officialIdentity.playerId}
                  {" · vérifié le "}{formatDate(selectedSwissBinding.verifiedAt)}
                  {!selectedSwissBinding.active
                    ? " · Une nouvelle vérification est obligatoire pour réactiver."
                    : ""}
                </small>
              ) : (
                <small>
                  Aucun rattachement actif : configurez et confirmez le profil avant toute collecte Swiss.
                </small>
              )}
            </div>
          )}
        </details>
      ) : null}

      {selectedSourceKey === "iwwf-wakesurf" ? (
        <details
          style={{
            marginTop: "0.7rem",
            minWidth: 0,
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "0.65rem 0.75rem",
            background: "#fafafa",
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: "0.84rem", fontWeight: 750 }}>
            Profil officiel IWWF · {selectedIwwfBinding?.active
              ? "rattachement actif"
              : selectedIwwfBinding
                ? "rattachement désactivé"
                : "à configurer"}
          </summary>
          <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.76rem" }}>
            Le serveur relit le profil avant chaque confirmation et contrôle le nom ainsi que
            l’identifiant athlète IWWF stable. Les résultats sont ensuite découverts depuis ce profil.
          </p>
          {!selectedAthleteId ? (
            <p style={{ margin: 0, fontSize: "0.8rem" }}>
              Sélectionnez d’abord un athlète CRM.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem", minWidth: 0 }}>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                URL officielle du profil IWWF
                <input
                  type="url"
                  value={iwwfProfileUrl}
                  disabled={iwwfConfigBusy}
                  placeholder="https://ems.iwwf.sport/Athletes/Profile/…"
                  onChange={(event) => {
                    setIwwfProfileUrl(event.target.value);
                    setIwwfVerification(null);
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="card-link-button"
                  disabled={iwwfConfigBusy || !iwwfProfileUrl.trim()}
                  onClick={() => void verifyIwwfProfile()}
                >
                  {iwwfConfigBusy ? "Vérification…" : "Vérifier le profil"}
                </button>
                {selectedIwwfBinding?.active ? (
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={iwwfConfigBusy}
                    onClick={() => void disableIwwfBinding()}
                  >
                    Désactiver
                  </button>
                ) : null}
              </div>
              {iwwfVerification ? (
                <div
                  style={{
                    borderLeft: "3px solid #2563eb",
                    paddingLeft: "0.65rem",
                    fontSize: "0.78rem",
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong>Comparaison avant confirmation</strong>
                  <p style={{ margin: "0.35rem 0" }}>
                    Fiche CRM : {selectedAthlete?.name} · {selectedAthlete?.sport || "sport inconnu"}
                    {" · "}{selectedAthlete?.club || "club inconnu"}
                  </p>
                  <p style={{ margin: "0.35rem 0" }}>
                    Profil officiel : {iwwfVerification.officialIdentity.name}
                    {" · ID "}{iwwfVerification.officialIdentity.athleteId}
                    {iwwfVerification.officialIdentity.birthYear
                      ? ` · naissance ${iwwfVerification.officialIdentity.birthYear}`
                      : ""}
                  </p>
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={iwwfConfigBusy}
                    onClick={() => void confirmIwwfBinding()}
                  >
                    Confirmer explicitement le rattachement
                  </button>
                </div>
              ) : selectedIwwfBinding ? (
                <small>
                  {selectedIwwfBinding.officialIdentity.name}
                  {" · ID "}{selectedIwwfBinding.officialIdentity.athleteId}
                  {" · vérifié le "}{formatDate(selectedIwwfBinding.verifiedAt)}
                  {!selectedIwwfBinding.active
                    ? " · Une nouvelle vérification est obligatoire pour réactiver."
                    : ""}
                </small>
              ) : (
                <small>
                  Aucun rattachement actif : vérifiez puis confirmez le profil avant toute collecte IWWF.
                </small>
              )}
            </div>
          )}
        </details>
      ) : null}

      {selectedSourceKey === "safv" ? (
        <details
          style={{
            marginTop: "0.7rem",
            minWidth: 0,
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "0.65rem 0.75rem",
            background: "#fafafa",
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: "0.84rem", fontWeight: 750 }}>
            Équipe officielle SAFV · {selectedSafvBinding?.active
              ? "rattachement actif"
              : selectedSafvBinding
                ? "rattachement désactivé"
                : "à configurer"}
          </summary>
          <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.76rem" }}>
            Le serveur relit le calendrier avant chaque confirmation. La veille conserve uniquement
            le résultat collectif officiel et ne vérifie aucune participation individuelle.
          </p>
          {!selectedAthleteId ? (
            <p style={{ margin: 0, fontSize: "0.8rem" }}>
              Sélectionnez d’abord un athlète CRM.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem", minWidth: 0 }}>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                URL officielle du calendrier de ligue SAFV
                <input
                  type="url"
                  value={safvScheduleUrl}
                  disabled={safvConfigBusy}
                  placeholder="https://www.safv.ch/spiele-366618v4/leagues/…"
                  onChange={(event) => {
                    setSafvScheduleUrl(event.target.value);
                    setSafvVerification(null);
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem" }}>
                Nom officiel de l’équipe
                <input
                  type="text"
                  value={safvTeamName}
                  disabled={safvConfigBusy}
                  placeholder="LUCAF Owls"
                  onChange={(event) => {
                    setSafvTeamName(event.target.value);
                    setSafvVerification(null);
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="card-link-button"
                  disabled={safvConfigBusy || !safvScheduleUrl.trim() || !safvTeamName.trim()}
                  onClick={() => void verifySafvTeam()}
                >
                  {safvConfigBusy ? "Vérification…" : "Vérifier l’équipe"}
                </button>
                {selectedSafvBinding?.active ? (
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={safvConfigBusy}
                    onClick={() => void disableSafvBinding()}
                  >
                    Désactiver
                  </button>
                ) : null}
              </div>
              {safvVerification ? (
                <div
                  style={{
                    borderLeft: "3px solid #2563eb",
                    paddingLeft: "0.65rem",
                    fontSize: "0.78rem",
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong>Comparaison avant confirmation</strong>
                  <p style={{ margin: "0.35rem 0" }}>
                    Fiche CRM : {selectedAthlete?.name} · {selectedAthlete?.sport || "sport inconnu"}
                    {" · "}{selectedAthlete?.club || "club inconnu"}
                  </p>
                  <p style={{ margin: "0.35rem 0" }}>
                    Équipe officielle : {safvVerification.officialTeam.teamName}
                    {" · "}{safvVerification.officialTeam.competitionName}
                    {" · saison "}{safvVerification.officialTeam.seasonName}
                  </p>
                  {safvVerification.clubComparison === "different" ? (
                    <p style={{ margin: "0.35rem 0", color: "#92400e" }}>
                      Le club CRM diffère de l’équipe officielle. Cette différence est signalée sans
                      déduire une mauvaise identité.
                    </p>
                  ) : null}
                  <p style={{ margin: "0.35rem 0" }}>
                    Résultat collectif — participation individuelle non vérifiée.
                  </p>
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={safvConfigBusy}
                    onClick={() => void confirmSafvBinding()}
                  >
                    Confirmer explicitement le rattachement
                  </button>
                </div>
              ) : selectedSafvBinding ? (
                <small>
                  {selectedSafvBinding.officialTeam.teamName}
                  {" · "}{selectedSafvBinding.officialTeam.competitionName}
                  {" · saison "}{selectedSafvBinding.officialTeam.seasonName}
                  {" · vérifié le "}{formatDate(selectedSafvBinding.verifiedAt)}
                  {!selectedSafvBinding.active
                    ? " · Une nouvelle vérification est obligatoire pour réactiver."
                    : ""}
                </small>
              ) : (
                <small>
                  Aucun rattachement actif : vérifiez puis confirmez l’équipe avant toute collecte SAFV.
                </small>
              )}
            </div>
          )}
        </details>
      ) : null}

      {message ? <p role="status" style={{ color: "#166534", fontSize: "0.84rem" }}>{message}</p> : null}
      {error ? <p role="alert" style={{ color: "#b91c1c", fontSize: "0.84rem" }}>{error}</p> : null}

      <p style={{ margin: "0.65rem 0", color: "#6b7280", fontSize: "0.78rem" }}>
        Valider autorise l’usage éditorial. Cela ne marque pas automatiquement l’information comme vérifiée factuellement.
      </p>

      {tournamentGroups.length > 0 ? (
        <ul className="priority-list" style={{ marginTop: "0.75rem" }}>
          {tournamentGroups.map((group) => (
            <li
              key={group.key}
              className="priority-item"
              style={{ alignItems: "flex-start", gridTemplateColumns: "minmax(0, 1fr)" }}
            >
              <div className="priority-main" style={{ width: "100%", minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{group.athleteName}</strong>
                    <h3 style={{ margin: "0.15rem 0 0", fontSize: "1rem", overflowWrap: "anywhere" }}>
                      {group.competitionName}
                    </h3>
                  </div>
                  <span className="priority-badge">
                    {group.matchCount > 0
                      ? pluralize(group.matchCount, "match", "matches")
                      : pluralize(group.unstructuredCount, "résultat")}
                  </span>
                </div>
                <small>
                  {formatDate(group.eventDateFrom)}
                  {group.eventDateTo && group.eventDateTo !== group.eventDateFrom
                    ? ` au ${formatDate(group.eventDateTo)}`
                    : ""}
                  {" · "}<a href={group.sourceUrl} target="_blank" rel="noreferrer">{group.sourceName}</a>
                </small>
                <div style={{ display: "grid", gap: "0.55rem", marginTop: "0.75rem" }}>
                  {group.disciplines.map((discipline) => (
                    <details
                      key={discipline.discipline}
                      style={{
                        minWidth: 0,
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        padding: "0.65rem 0.75rem",
                        background: "#fafafa",
                      }}
                    >
                      <summary
                        style={{
                          cursor: "pointer",
                          overflowWrap: "anywhere",
                          fontSize: "0.84rem",
                          fontWeight: 750,
                        }}
                      >
                        {disciplineLabels[discipline.discipline]} · {disciplineSummary(discipline)}
                      </summary>
                      <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.72rem" }}>
                        Résumé des matches collectés ; il ne couvre pas nécessairement tout le tournoi.
                      </p>
                      <div style={{ display: "grid", gap: "0.65rem" }}>
                        {discipline.matches.map((match) => (
                          <article
                            key={match.candidate.id}
                            style={{
                              minWidth: 0,
                              borderTop: "1px solid #e5e7eb",
                              paddingTop: "0.65rem",
                              overflowWrap: "anywhere",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                              <strong style={{ fontSize: "0.84rem" }}>
                                {formatDate(match.candidate.eventDateFrom)} · {match.round}
                              </strong>
                              <span className="priority-badge">{match.outcomeLabel}</span>
                            </div>
                            {match.partner ? (
                              <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}>
                                <strong>Partenaire :</strong> {match.partner}
                              </p>
                            ) : null}
                            <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
                              <strong>Adversaire{match.opponents.includes(" et ") ? "s" : ""} :</strong> {match.opponents}
                            </p>
                            <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
                              <strong>Score :</strong> {match.athleteScore}
                            </p>
                            {!match.countedInSummary ? (
                              <p style={{ margin: "0.35rem 0 0", color: "#92400e", fontSize: "0.74rem" }}>
                                Version antérieure — non comptée dans le résumé.
                              </p>
                            ) : null}
                            <div style={{ marginTop: "0.35rem", fontSize: "0.74rem" }}>
                              Statut Admin : {adminStatusLabels[match.candidate.adminStatus]}
                            </div>
                            {renderSourceDetails(match.candidate)}
                            {renderCandidateActions(match.candidate)}
                          </article>
                        ))}
                      </div>
                    </details>
                  ))}
                  {group.unstructuredCandidates.length > 0 ? (
                    <details
                      style={{
                        minWidth: 0,
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        padding: "0.65rem 0.75rem",
                      }}
                    >
                      <summary style={{ cursor: "pointer", fontSize: "0.84rem", fontWeight: 750 }}>
                        Extraits non structurés · {pluralize(group.unstructuredCount, "candidat")}
                      </summary>
                      <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.72rem" }}>
                        Ces extraits sont affichés tels quels et ne sont pas inclus dans le résumé des matches.
                      </p>
                      {group.unstructuredCandidates.map(({ candidate, countedInSummary }) => (
                        <article
                          key={candidate.id}
                          style={{ borderTop: "1px solid #e5e7eb", paddingTop: "0.65rem", overflowWrap: "anywhere" }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                            <strong>{candidate.title}</strong>
                            <span className="priority-badge">{adminStatusLabels[candidate.adminStatus]}</span>
                          </div>
                          <small>Événement : {formatDate(candidate.eventDateFrom)}</small>
                          <p style={{ margin: "0.45rem 0", whiteSpace: "pre-wrap", fontSize: "0.82rem" }}>
                            {candidate.excerpt}
                          </p>
                          {!countedInSummary ? (
                            <p style={{ color: "#92400e", fontSize: "0.74rem" }}>
                              Version antérieure — non comptée.
                            </p>
                          ) : null}
                          {renderSourceDetails(candidate)}
                          {renderCandidateActions(candidate)}
                        </article>
                      ))}
                    </details>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
