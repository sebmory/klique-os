"use client";

import { useMemo, useState } from "react";
import type {
  SportsWatchCandidate,
  SportsWatchImport,
  SportsWatchImportConfirmation,
  SportsWatchResultKind,
} from "@/types/sports-watch";

type AthleteSummary = {
  key: string;
  athleteId?: string;
  name: string;
  sport: string;
  club: string;
};

type EditableConfirmation = Omit<SportsWatchImportConfirmation, "resultKind"> & {
  resultKind: SportsWatchResultKind | "";
};

const emptyConfirmation: EditableConfirmation = {
  sourceName: "",
  documentDate: null,
  matchDate: null,
  competition: null,
  participantA: null,
  participantB: null,
  score: null,
  resultKind: "",
  individualParticipationExplicit: false,
  individualEvidence: null,
  individualStatistics: [],
};

const normalizeSport = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const supportedAthlete = (athlete: AthleteSummary): boolean => {
  const sport = normalizeSport(athlete.sport);
  return sport.includes("basket")
    || sport.includes("tennis")
    || (sport.includes("football") && !sport.includes("americain") && !sport.includes("foot us"));
};

const toConfirmation = (imported: SportsWatchImport): EditableConfirmation => {
  const extraction = imported.extraction;
  if (!extraction) return emptyConfirmation;
  return {
    sourceName: extraction.sourceName ?? "",
    documentDate: extraction.documentDate,
    matchDate: extraction.matchDate,
    competition: extraction.competition,
    participantA: extraction.participantA,
    participantB: extraction.participantB,
    score: extraction.score,
    resultKind: extraction.resultKind ?? "",
    individualParticipationExplicit: extraction.individualParticipationExplicit,
    individualEvidence: extraction.individualEvidence,
    individualStatistics: extraction.individualStatistics,
  };
};

const textValue = (value: string | null): string => value ?? "";
const nullable = (value: string): string | null => value.trim() || null;

export function SportsWatchImportPanel({
  athletes,
  onCandidateCreated,
}: {
  athletes: AthleteSummary[];
  onCandidateCreated: (candidate: SportsWatchCandidate) => void;
}) {
  const options = useMemo(
    () => athletes
      .filter(supportedAthlete)
      .map((athlete) => ({
        id: athlete.athleteId?.trim() || athlete.key.trim(),
        label: `${athlete.name} — ${athlete.sport}${athlete.club ? ` · ${athlete.club}` : ""}`,
      }))
      .filter((athlete) => athlete.id)
      .sort((left, right) => left.label.localeCompare(right.label, "fr")),
    [athletes],
  );
  const [athleteId, setAthleteId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [imported, setImported] = useState<SportsWatchImport | null>(null);
  const [confirmation, setConfirmation] = useState<EditableConfirmation>(emptyConfirmation);
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const [busy, setBusy] = useState<"extract" | "confirm" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateText = (
    field: keyof Pick<
      EditableConfirmation,
      "sourceName" | "documentDate" | "matchDate" | "competition" | "participantA" | "participantB" | "score" | "individualEvidence"
    >,
    value: string,
  ) => {
    setConfirmation((current) => ({
      ...current,
      [field]: field === "sourceName" ? value : nullable(value),
    }));
    setHumanConfirmed(false);
  };

  const extract = async () => {
    if (!athleteId || !file || busy) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Le fichier dépasse la limite de 10 Mo.");
      return;
    }
    setBusy("extract");
    setError(null);
    setMessage(null);
    setImported(null);
    try {
      const formData = new FormData();
      formData.set("athleteId", athleteId);
      formData.set("file", file);
      const uploadResponse = await fetch("/api/admin/sports-watch/imports", {
        method: "POST",
        body: formData,
      });
      const uploadPayload = await uploadResponse.json() as {
        imported?: SportsWatchImport;
        message?: string;
      };
      if (!uploadResponse.ok || !uploadPayload.imported) {
        throw new Error(uploadPayload.message || "Impossible d’importer le document.");
      }
      let current = uploadPayload.imported;
      if (!current.extraction && current.status !== "confirmed") {
        const extractionResponse = await fetch(
          `/api/admin/sports-watch/imports/${encodeURIComponent(current.id)}/extract`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedVersion: current.version }),
          },
        );
        const extractionPayload = await extractionResponse.json() as {
          imported?: SportsWatchImport;
          message?: string;
        };
        if (!extractionResponse.ok || !extractionPayload.imported) {
          throw new Error(extractionPayload.message || "Impossible d’extraire les résultats.");
        }
        current = extractionPayload.imported;
      }
      setImported(current);
      setConfirmation(toConfirmation(current));
      setHumanConfirmed(false);
      setMessage(
        current.status === "confirmed"
          ? "Ce document avait déjà été confirmé."
          : "Extraction terminée. Vérifiez chaque champ avant de confirmer.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Extraction impossible.");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (
      !imported
      || imported.status !== "extracted"
      || !confirmation.resultKind
      || !humanConfirmed
      || busy
    ) return;
    setBusy("confirm");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/sports-watch/imports/${encodeURIComponent(imported.id)}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: imported.version,
            confirmation,
          }),
        },
      );
      const payload = await response.json() as {
        imported?: SportsWatchImport;
        candidate?: SportsWatchCandidate;
        message?: string;
      };
      if (!response.ok || !payload.imported || !payload.candidate) {
        throw new Error(payload.message || "Impossible de confirmer le résultat.");
      }
      setImported(payload.imported);
      onCandidateCreated(payload.candidate);
      setMessage("Résultat confirmé et ajouté à la revue, sans vérification factuelle automatique.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation impossible.");
    } finally {
      setBusy(null);
    }
  };

  return (
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
        Importer un résultat
      </summary>
      <p style={{ margin: "0.45rem 0", color: "#6b7280", fontSize: "0.76rem" }}>
        PDF de 5 pages maximum ou image JPEG, PNG, WebP · 10 Mo maximum.
        Un seul appel fournisseur est lancé par clic sur « Extraire les résultats ».
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <select
          aria-label="Athlète CRM pour l’import"
          value={athleteId}
          disabled={Boolean(busy)}
          onChange={(event) => {
            setAthleteId(event.target.value);
            setImported(null);
            setHumanConfirmed(false);
          }}
          style={{ minWidth: "16rem", flex: "1 1 16rem" }}
        >
          <option value="">Sélectionner un athlète basket, football ou tennis</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <input
          aria-label="Document de résultat"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          disabled={Boolean(busy)}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setImported(null);
            setHumanConfirmed(false);
          }}
          style={{ minWidth: 0, flex: "1 1 16rem" }}
        />
        <button
          type="button"
          className="card-link-button"
          disabled={!athleteId || !file || Boolean(busy)}
          onClick={() => void extract()}
        >
          {busy === "extract" ? "Extraction…" : "Extraire les résultats"}
        </button>
      </div>

      {imported?.extraction ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 21rem), 1fr))",
            gap: "0.85rem",
            marginTop: "0.8rem",
            minWidth: 0,
          }}
        >
          <section style={{ minWidth: 0 }}>
            <h3 style={{ margin: "0 0 0.45rem", fontSize: "0.9rem" }}>Document privé</h3>
            {imported.contentType === "application/pdf" ? (
              <iframe
                src={imported.fileHref}
                title={`Document ${imported.originalFilename}`}
                style={{ width: "100%", height: "28rem", border: "1px solid #d1d5db", borderRadius: "8px" }}
              />
            ) : (
              <img
                src={imported.fileHref}
                alt={`Document ${imported.originalFilename}`}
                style={{
                  display: "block",
                  width: "100%",
                  maxHeight: "34rem",
                  objectFit: "contain",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                }}
              />
            )}
            <small style={{ overflowWrap: "anywhere" }}>
              {imported.originalFilename} · accès Admin privé
            </small>
          </section>

          <section style={{ display: "grid", gap: "0.5rem", minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: "0.9rem" }}>Informations à vérifier</h3>
            {imported.extraction.warnings.length > 0 ? (
              <div role="alert" style={{ borderLeft: "3px solid #d97706", paddingLeft: "0.65rem", color: "#92400e" }}>
                <strong>Avertissements</strong>
                <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem" }}>
                  {imported.extraction.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.78rem" }}>
              Source
              <input value={confirmation.sourceName} onChange={(event) => updateText("sourceName", event.target.value)} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem" }}>
              <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.78rem", minWidth: 0 }}>
                Date du document
                <input type="date" value={textValue(confirmation.documentDate)} onChange={(event) => updateText("documentDate", event.target.value)} />
              </label>
              <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.78rem", minWidth: 0 }}>
                Date du match
                <input type="date" value={textValue(confirmation.matchDate)} onChange={(event) => updateText("matchDate", event.target.value)} />
              </label>
            </div>
            {([
              ["competition", "Compétition"],
              ["participantA", "Équipe ou joueur A"],
              ["participantB", "Équipe ou joueur B"],
              ["score", "Score tel qu’affiché"],
            ] as const).map(([field, label]) => (
              <label key={field} style={{ display: "grid", gap: "0.2rem", fontSize: "0.78rem" }}>
                {label}
                <input value={textValue(confirmation[field])} onChange={(event) => updateText(field, event.target.value)} />
              </label>
            ))}
            <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.78rem" }}>
              Type de résultat
              <select
                value={confirmation.resultKind}
                onChange={(event) => {
                  const resultKind = event.target.value as EditableConfirmation["resultKind"];
                  setConfirmation((current) => ({
                    ...current,
                    resultKind,
                    ...(resultKind === "collective_result"
                      ? {
                          individualParticipationExplicit: false,
                          individualEvidence: null,
                          individualStatistics: [],
                        }
                      : {}),
                  }));
                  setHumanConfirmed(false);
                }}
              >
                <option value="">À déterminer</option>
                <option value="collective_result">Résultat collectif</option>
                <option value="participation">Participation individuelle</option>
                <option value="individual_result">Résultat individuel</option>
              </select>
            </label>
            {confirmation.resultKind !== "collective_result" ? (
              <>
                <label style={{ display: "flex", gap: "0.45rem", alignItems: "flex-start", fontSize: "0.78rem" }}>
                  <input
                    type="checkbox"
                    checked={confirmation.individualParticipationExplicit}
                    onChange={(event) => {
                      setConfirmation((current) => ({
                        ...current,
                        individualParticipationExplicit: event.target.checked,
                      }));
                      setHumanConfirmed(false);
                    }}
                  />
                  Le document prouve explicitement la participation de l’athlète
                </label>
                <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.78rem" }}>
                  Preuve individuelle exacte
                  <textarea
                    rows={2}
                    value={textValue(confirmation.individualEvidence)}
                    onChange={(event) => updateText("individualEvidence", event.target.value)}
                  />
                </label>
                <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.78rem" }}>
                  Statistiques individuelles explicites · une par ligne
                  <textarea
                    rows={4}
                    value={confirmation.individualStatistics.join("\n")}
                    onChange={(event) => {
                      setConfirmation((current) => ({
                        ...current,
                        individualStatistics: event.target.value.split(/\r?\n/).filter(Boolean),
                      }));
                      setHumanConfirmed(false);
                    }}
                  />
                </label>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
                Résultat collectif — participation individuelle non vérifiée.
              </p>
            )}
            <label style={{ display: "flex", gap: "0.45rem", alignItems: "flex-start", fontSize: "0.78rem" }}>
              <input
                type="checkbox"
                checked={humanConfirmed}
                disabled={imported.status === "confirmed"}
                onChange={(event) => setHumanConfirmed(event.target.checked)}
              />
              J’ai comparé ces champs au document et je confirme uniquement les valeurs lisibles.
            </label>
            <button
              type="button"
              className="card-link-button"
              disabled={
                imported.status !== "extracted"
                || !confirmation.sourceName.trim()
                || !confirmation.resultKind
                || !humanConfirmed
                || Boolean(busy)
              }
              onClick={() => void confirm()}
            >
              {busy === "confirm" ? "Confirmation…" : "Créer le candidat pour revue"}
            </button>
          </section>
        </div>
      ) : null}
      {message ? <p role="status" style={{ color: "#166534", fontSize: "0.82rem" }}>{message}</p> : null}
      {error ? <p role="alert" style={{ color: "#b91c1c", fontSize: "0.82rem" }}>{error}</p> : null}
    </details>
  );
}
