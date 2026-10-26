"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/src/design-system/components";
import type { SportsWatchCandidate, SportsWatchRunResult } from "@/types/sports-watch";

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

export function SportsWatchAdminCard({ athletes }: { athletes: AthleteSummary[] }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<SportsWatchCandidate[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState("");
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

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/sports-watch", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { candidates?: SportsWatchCandidate[]; message?: string };
        if (!response.ok) throw new Error(payload.message || "Impossible de charger la veille sportive.");
        if (active) setCandidates(payload.candidates ?? []);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      });
    return () => {
      active = false;
    };
  }, []);

  const runWatch = async () => {
    if (busy || !selectedAthleteId) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/sports-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId: selectedAthleteId }),
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

  return (
    <Card className="workspace-dashboard-card" style={{ minWidth: 0 }}>
      <header className="dashboard-card-head">
        <div>
          <h2>Veille sportive</h2>
          <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.82rem" }}>
            Source consultée : <a href="https://bcbulle.ch/feed/" target="_blank" rel="noreferrer">Badminton Club Bulle</a>
          </p>
        </div>
        <span className="card-pill">{candidates.filter((candidate) => candidate.adminStatus === "pending").length} en attente</span>
      </header>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
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
          disabled={busy || !selectedAthleteId}
          onClick={() => void runWatch()}
        >
          {busy ? "Collecte…" : "Lancer la veille"}
        </button>
      </div>

      {message ? <p role="status" style={{ color: "#166534", fontSize: "0.84rem" }}>{message}</p> : null}
      {error ? <p role="alert" style={{ color: "#b91c1c", fontSize: "0.84rem" }}>{error}</p> : null}

      <p style={{ margin: "0.65rem 0", color: "#6b7280", fontSize: "0.78rem" }}>
        Valider autorise l’usage éditorial. Cela ne marque pas automatiquement l’information comme vérifiée factuellement.
      </p>

      {candidates.length > 0 ? (
        <ul className="priority-list" style={{ marginTop: "0.75rem" }}>
          {candidates.map((candidate) => (
            <li
              key={candidate.id}
              className="priority-item"
              style={{ alignItems: "flex-start", gridTemplateColumns: "minmax(0, 1fr)" }}
            >
              <div className="priority-main" style={{ width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                  <strong>{candidate.athleteName} · {candidate.title}</strong>
                  <span className="priority-badge">{adminStatusLabels[candidate.adminStatus]}</span>
                </div>
                <small>
                  Publication : {formatDate(candidate.publicationDate)} · Événement : {formatDate(candidate.eventDateFrom)}
                  {candidate.eventDateTo && candidate.eventDateTo !== candidate.eventDateFrom ? ` au ${formatDate(candidate.eventDateTo)}` : ""}
                  {" · "}Collecte : {formatDate(candidate.collectedAt)}
                </small>
                <p style={{ margin: "0.45rem 0", whiteSpace: "pre-wrap" }}>{candidate.excerpt}</p>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.8rem" }}>
                  <a href={candidate.articleUrl} target="_blank" rel="noreferrer">Voir la source</a>
                  <span>Attribution : {candidate.attributionStatus === "matched" ? "concordante" : "à vérifier"}</span>
                  <span>Vérification factuelle : {verificationLabels[candidate.verificationStatus]}</span>
                  {candidate.supersedesCandidateId ? <span>Version modifiée</span> : null}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.65rem" }}>
                  <button
                    type="button"
                    className="card-link-button"
                    disabled={busyCandidateId === candidate.id}
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
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
