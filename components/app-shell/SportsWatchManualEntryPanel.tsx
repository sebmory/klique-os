"use client";

import { useMemo, useState } from "react";
import {
  canGenerateSportsWatchManualText,
  generateSportsWatchManualText,
  type SportsWatchManualTextGenerationInput,
} from "@/lib/sports-watch/manual-entry-text-generator";
import { normalizeSportsWatchSport } from "@/lib/sports-watch/sport";
import type {
  SportsWatchCandidate,
  SportsWatchManualEntryDuplicate,
  SportsWatchManualNewsType,
  SportsWatchParticipationStatus,
} from "@/types/sports-watch";

type AthleteSummary = {
  key: string;
  athleteId?: string;
  name: string;
  sport: string;
  club: string;
  status: string;
};

type CustomStatistic = {
  label: string;
  value: string;
  unit: string;
};

const newsTypes: Array<{ value: SportsWatchManualNewsType; label: string }> = [
  { value: "result_match", label: "Résultat ou match" },
  { value: "individual_performance", label: "Performance individuelle" },
  { value: "selection_callup", label: "Sélection ou convocation" },
  { value: "transfer_signing", label: "Transfert ou signature" },
  { value: "injury_return", label: "Blessure ou retour" },
  { value: "distinction", label: "Distinction" },
  { value: "record", label: "Record" },
  { value: "other_news", label: "Autre actualité" },
];

const participationOptions: Array<{
  value: SportsWatchParticipationStatus;
  label: string;
}> = [
  { value: "starter", label: "Titulaire" },
  { value: "entered", label: "Entré en jeu" },
  { value: "unused_substitute", label: "Remplaçant sans entrer" },
  { value: "unknown", label: "Participation inconnue" },
];

const initialNumbers = {
  minutes: "",
  goals: "",
  assists: "",
  yellowCards: "",
  redCards: "",
};

const initialBasketball = {
  starter: "",
  minutes: "",
  points: "",
  rebounds: "",
  assists: "",
  steals: "",
  blocks: "",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
  gap: "0.65rem",
  minWidth: 0,
} as const;

const labelStyle = {
  display: "grid",
  gap: "0.25rem",
  minWidth: 0,
  fontSize: "0.78rem",
} as const;

const nullableNumber = (value: string): number | null =>
  value.trim() === "" ? null : Number(value);

const newIdempotencyKey = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
};

const conflictAthletes = new Map([
  ["raphael-monty", "Le rattachement actif pointe vers « Monty Dimitri ». Revalidez l’identité avant exploitation."],
  ["armand-angha", "Le club CRM et l’équipe Swiss Basketball configurée sont différents."],
  ["anastacia-fischer", "Le club CRM et le club Swiss Badminton configuré sont différents."],
  ["yann-tercier", "Le club est signalé différent par le comparateur, probablement à cause du libellé."],
]);

const conflictWarning = (athlete: AthleteSummary | undefined): string | null => {
  if (!athlete) return null;
  const id = athlete.athleteId?.trim() || athlete.key.trim();
  return conflictAthletes.get(id) ?? null;
};

const NumberField = ({
  label,
  value,
  onChange,
  maximum = 300,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maximum?: number;
  disabled?: boolean;
}) => (
  <label style={labelStyle}>
    {label}
    <input
      type="number"
      min="0"
      max={maximum}
      step="1"
      inputMode="numeric"
      value={value}
      disabled={disabled}
      placeholder="Inconnu"
      onChange={(event) => onChange(event.target.value)}
    />
  </label>
);

export function SportsWatchManualEntryPanel({
  athletes,
  onCandidateCreated,
  completionCandidate = null,
  onCompletionCancelled,
}: {
  athletes: AthleteSummary[];
  onCandidateCreated: (
    candidate: SportsWatchCandidate,
    created: boolean,
    replacedCandidateId?: string,
  ) => void;
  completionCandidate?: SportsWatchCandidate | null;
  onCompletionCancelled?: () => void;
}) {
  const options = useMemo(
    () => athletes
      .filter((athlete) =>
        ["actif", "active"].includes(normalizeSportsWatchSport(athlete.status)))
      .map((athlete) => ({
        ...athlete,
        id: athlete.athleteId?.trim() || athlete.key.trim(),
      }))
      .filter((athlete) => athlete.id)
      .sort((left, right) => left.name.localeCompare(right.name, "fr")),
    [athletes],
  );
  const completion = completionCandidate?.footballEvidence ?? null;
  const [athleteId, setAthleteId] = useState(completionCandidate?.athleteId ?? "");
  const [eventDate, setEventDate] = useState(completion?.eventDate ?? "");
  const [newsType, setNewsType] = useState<SportsWatchManualNewsType>("result_match");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [competition, setCompetition] = useState(completion?.competition ?? "");
  const [opponent, setOpponent] = useState(completion?.opponent ?? "");
  const [score, setScore] = useState(completion?.score ?? "");
  const [source, setSource] = useState(completion ? "Footstats Pro" : "");
  const [sourceReference, setSourceReference] = useState(completion?.publicReference ?? "");
  const [internalNote, setInternalNote] = useState("");
  const [initialStatus, setInitialStatus] = useState<"pending" | "validated">("pending");
  const [team, setTeam] = useState(completion?.team ?? "");
  const [participationStatus, setParticipationStatus] =
    useState<SportsWatchParticipationStatus>("unknown");
  const [footballNumbers, setFootballNumbers] = useState(initialNumbers);
  const [footstatsReference, setFootstatsReference] =
    useState(completion?.publicReference ?? "");
  const [footstatsPlayerId, setFootstatsPlayerId] =
    useState(completion?.footstatsPlayerId ?? "");
  const [footstatsTeamId, setFootstatsTeamId] =
    useState(completion?.footstatsTeamId ?? "");
  const [basketball, setBasketball] = useState(initialBasketball);
  const [statistics, setStatistics] = useState<CustomStatistic[]>([]);
  const [titleEdited, setTitleEdited] = useState(false);
  const [summaryEdited, setSummaryEdited] = useState(false);
  const [confirmRegeneration, setConfirmRegeneration] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [duplicates, setDuplicates] = useState<SportsWatchManualEntryDuplicate[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const athlete = options.find((item) => item.id === athleteId);
  const normalizedSport = normalizeSportsWatchSport(athlete?.sport ?? "");
  const isFootball = normalizedSport.includes("football")
    && !normalizedSport.includes("americain")
    && !normalizedSport.includes("foot us");
  const isBasketball = normalizedSport.includes("basket");
  const warning = conflictWarning(athlete);
  const manualFootball = isFootball ? {
    team: team || null,
    participationStatus,
    minutes: nullableNumber(footballNumbers.minutes),
    goals: nullableNumber(footballNumbers.goals),
    assists: nullableNumber(footballNumbers.assists),
    yellowCards: nullableNumber(footballNumbers.yellowCards),
    redCards: nullableNumber(footballNumbers.redCards),
    opponent: opponent || null,
    score: score || null,
    competition: competition || null,
    footstatsReference: footstatsReference || null,
    footstatsPlayerId: footstatsPlayerId || null,
    footstatsTeamId: footstatsTeamId || null,
  } : null;
  const manualBasketball = isBasketball ? {
    starter: basketball.starter === "" ? null : basketball.starter === "yes",
    minutes: nullableNumber(basketball.minutes),
    points: nullableNumber(basketball.points),
    rebounds: nullableNumber(basketball.rebounds),
    assists: nullableNumber(basketball.assists),
    steals: nullableNumber(basketball.steals),
    blocks: nullableNumber(basketball.blocks),
  } : null;
  const manualStatistics = statistics.map((statistic) => ({
    label: statistic.label,
    value: statistic.value,
    unit: statistic.unit || null,
  }));
  const generationInput: SportsWatchManualTextGenerationInput = {
    athlete: {
      name: athlete?.name ?? "",
      sport: athlete?.sport ?? "",
      club: athlete?.club ?? "",
    },
    eventDate,
    newsType,
    competition: competition || null,
    opponent: opponent || null,
    score: score || null,
    football: manualFootball,
    basketball: manualBasketball,
    statistics: manualStatistics,
  };
  const generationAvailable = canGenerateSportsWatchManualText(generationInput);

  const reset = () => {
    setEventDate("");
    setNewsType("result_match");
    setTitle("");
    setSummary("");
    setCompetition("");
    setOpponent("");
    setScore("");
    setSource("");
    setSourceReference("");
    setInternalNote("");
    setInitialStatus("pending");
    setTeam("");
    setParticipationStatus("unknown");
    setFootballNumbers(initialNumbers);
    setFootstatsReference("");
    setFootstatsPlayerId("");
    setFootstatsTeamId("");
    setBasketball(initialBasketball);
    setStatistics([]);
    setTitleEdited(false);
    setSummaryEdited(false);
    setConfirmRegeneration(false);
    setDuplicates([]);
    setIdempotencyKey(newIdempotencyKey());
  };

  const updateFootballNumber = (field: keyof typeof initialNumbers, value: string) => {
    setFootballNumbers((current) => ({ ...current, [field]: value }));
  };

  const updateBasketball = (field: keyof typeof initialBasketball, value: string) => {
    setBasketball((current) => ({ ...current, [field]: value }));
  };

  const applyGeneratedText = () => {
    const generated = generateSportsWatchManualText(generationInput);
    if (!generated) return;
    setTitle(generated.title);
    setSummary(generated.summary);
    setTitleEdited(false);
    setSummaryEdited(false);
    setConfirmRegeneration(false);
    setError(null);
    setMessage("Proposition générée. Le titre et le résumé restent modifiables.");
  };

  const requestTextGeneration = () => {
    if (!generationAvailable) return;
    if (titleEdited || summaryEdited) {
      setConfirmRegeneration(true);
      return;
    }
    applyGeneratedText();
  };

  const submit = async (allowPotentialDuplicate = false) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const entry = {
        athleteId,
        eventDate,
        newsType,
        title,
        summary,
        competition: isFootball ? null : competition || null,
        opponent: isFootball ? null : opponent || null,
        score: isFootball ? null : score || null,
        source: source || null,
        sourceReference: sourceReference || null,
        internalNote: internalNote || null,
        initialStatus,
        idempotencyKey,
        allowPotentialDuplicate,
        football: manualFootball,
        basketball: manualBasketball,
        statistics: manualStatistics,
      };
      const response = await fetch(completionCandidate
        ? `/api/admin/sports-watch/football-candidates/${completionCandidate.id}`
        : "/api/admin/sports-watch/manual-entry", {
        method: completionCandidate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completionCandidate
          ? {
              action: "complete",
              expectedVersion: completionCandidate.version,
              entry,
            }
          : entry),
      });
      const payload = await response.json() as {
        ok?: boolean;
        candidate?: SportsWatchCandidate;
        created?: boolean;
        error?: {
          message?: string;
          duplicates?: SportsWatchManualEntryDuplicate[];
        };
        message?: string;
      };
      if (response.status === 409 && payload.error?.duplicates?.length) {
        setDuplicates(payload.error.duplicates);
        setError(payload.error.message ?? "Une actualité proche existe déjà.");
        return;
      }
      if (!response.ok || !payload.candidate) {
        throw new Error(
          payload.error?.message
          || payload.message
          || "Impossible d’ajouter l’actualité.",
        );
      }
      if (completionCandidate) {
        onCandidateCreated(payload.candidate, false, completionCandidate.id);
      } else {
        onCandidateCreated(payload.candidate, payload.created === true);
      }
      setMessage(completionCandidate
        ? "Le candidat a été enrichi sans créer de second événement visible."
        : payload.created
        ? initialStatus === "pending"
          ? "Actualité ajoutée dans À vérifier."
          : "Actualité ajoutée dans Validée et à exploiter."
        : "Cette saisie existait déjà. Aucun doublon n’a été créé.");
      if (completionCandidate) onCompletionCancelled?.();
      else reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d’ajouter l’actualité.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details
      data-sports-watch-manual-entry
      open={completionCandidate ? true : undefined}
      style={{
        marginTop: "0.7rem",
        minWidth: 0,
        border: "1px solid #bfdbfe",
        borderRadius: "8px",
        padding: "0.65rem 0.75rem",
        background: "#eff6ff",
      }}
    >
      <summary style={{ cursor: "pointer", fontSize: "0.84rem", fontWeight: 800 }}>
        {completionCandidate ? "Compléter avec Footstats Pro" : "Ajouter une actualité"}
      </summary>
      <form
        style={{ display: "grid", gap: "0.8rem", marginTop: "0.75rem", minWidth: 0 }}
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
      >
        <div style={gridStyle}>
          <label style={labelStyle}>
            Athlète *
            <select
              aria-label="Athlète pour l’actualité manuelle"
              required
              value={athleteId}
              disabled={busy || Boolean(completionCandidate)}
              onChange={(event) => {
                setAthleteId(event.target.value);
                setDuplicates([]);
              }}
            >
              <option value="">Sélectionner…</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} — {option.sport}{option.club ? ` · ${option.club}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Date de l’événement *
            <input
              type="date"
              required
              value={eventDate}
              disabled={busy || Boolean(completionCandidate)}
              onChange={(event) => setEventDate(event.target.value)}
            />
          </label>
          <label style={labelStyle}>
            Type d’actualité *
            <select
              required
              value={newsType}
              disabled={busy || Boolean(completionCandidate)}
              onChange={(event) =>
                setNewsType(event.target.value as SportsWatchManualNewsType)}
            >
              {newsTypes.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Statut initial *
            <select
              value={initialStatus}
              disabled={busy}
              onChange={(event) =>
                setInitialStatus(event.target.value as "pending" | "validated")}
            >
              <option value="pending">À vérifier</option>
              <option value="validated">Validée et à exploiter</option>
            </select>
          </label>
        </div>

        {warning ? (
          <p role="alert" style={{ margin: 0, color: "#92400e", fontSize: "0.78rem" }}>
            <strong>Configuration Sports Watch à revalider :</strong> {warning}
          </p>
        ) : null}

        {!isFootball ? (
          <div style={gridStyle}>
            <label style={labelStyle}>
              Compétition
              <input
                type="text"
                maxLength={160}
                value={competition}
                disabled={busy || Boolean(completionCandidate)}
                onChange={(event) => setCompetition(event.target.value)}
              />
            </label>
            <label style={labelStyle}>
              Adversaire
              <input
                type="text"
                maxLength={200}
                value={opponent}
                disabled={busy || Boolean(completionCandidate)}
                onChange={(event) => setOpponent(event.target.value)}
              />
            </label>
            <label style={labelStyle}>
              Score de l’athlète ou de son équipe
              <input
                type="text"
                maxLength={80}
                value={score}
                disabled={busy || Boolean(completionCandidate)}
                placeholder="Inconnu"
                onChange={(event) => setScore(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        <div style={gridStyle}>
          <label style={labelStyle}>
            Source
            <input
              type="text"
              maxLength={160}
              value={source}
              disabled={busy || Boolean(completionCandidate)}
              placeholder="Ex. Footstats Pro"
              onChange={(event) => setSource(event.target.value)}
            />
          </label>
          <label style={labelStyle}>
            URL ou référence
            <input
              type="text"
              maxLength={1000}
              value={sourceReference}
              disabled={busy || Boolean(completionCandidate)}
              onChange={(event) => setSourceReference(event.target.value)}
            />
          </label>
        </div>
        {normalizeSportsWatchSport(source) === "footstats pro" ? (
          <p style={{ margin: 0, color: "#92400e", fontSize: "0.78rem" }}>
            <strong>Footstats Pro — saisie manuelle Admin, source tierce non officielle.</strong>
            {" "}Le statut factuel restera « À vérifier », même si le candidat est directement validé.
          </p>
        ) : null}
        {normalizeSportsWatchSport(source).includes("bebasket") ? (
          <p role="alert" style={{ margin: 0, color: "#92400e", fontSize: "0.78rem" }}>
            Le collecteur BeBasket est signalé en erreur. Cette saisie ne modifie pas sa configuration.
          </p>
        ) : null}

        {isFootball ? (
          <fieldset style={{ minWidth: 0, border: "1px solid #bfdbfe", borderRadius: "8px" }}>
            <legend style={{ fontSize: "0.82rem", fontWeight: 750 }}>
              {completionCandidate ? "Football · complément Footstats Pro" : "Football · facultatif"}
            </legend>
            <div style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
              <div style={gridStyle}>
                <label style={labelStyle}>
                  Club ou équipe
                  <input
                    type="text"
                    maxLength={160}
                    value={team}
                    disabled={busy || Boolean(completionCandidate)}
                    onChange={(event) => setTeam(event.target.value)}
                  />
                </label>
                <label style={labelStyle}>
                  Compétition
                  <input
                    type="text"
                    maxLength={160}
                    value={competition}
                    disabled={busy || Boolean(completionCandidate)}
                    onChange={(event) => setCompetition(event.target.value)}
                  />
                </label>
                <label style={labelStyle}>
                  Adversaire
                  <input
                    type="text"
                    maxLength={200}
                    value={opponent}
                    disabled={busy || Boolean(completionCandidate)}
                    onChange={(event) => setOpponent(event.target.value)}
                  />
                </label>
                <label style={labelStyle}>
                  Score collectif
                  <input
                    type="text"
                    maxLength={80}
                    value={score}
                    disabled={busy || Boolean(completionCandidate)}
                    placeholder="Inconnu"
                    onChange={(event) => setScore(event.target.value)}
                  />
                </label>
              </div>
              <fieldset style={{ minWidth: 0, border: 0, padding: 0 }}>
                <legend style={{ fontSize: "0.78rem", fontWeight: 700 }}>Participation</legend>
                <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
                  {participationOptions.map((option) => (
                    <label key={option.value} style={{ fontSize: "0.76rem" }}>
                      <input
                        type="radio"
                        name="manual-football-participation"
                        value={option.value}
                        checked={participationStatus === option.value}
                        disabled={busy}
                        onChange={() => setParticipationStatus(option.value)}
                      />{" "}
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div style={gridStyle}>
                <NumberField
                  label="Minutes jouées"
                  value={footballNumbers.minutes}
                  disabled={
                    busy
                    || (participationStatus !== "starter" && participationStatus !== "entered")
                  }
                  onChange={(value) => updateFootballNumber("minutes", value)}
                />
                <NumberField
                  label="Buts"
                  value={footballNumbers.goals}
                  maximum={100}
                  disabled={busy}
                  onChange={(value) => updateFootballNumber("goals", value)}
                />
                <NumberField
                  label="Passes décisives"
                  value={footballNumbers.assists}
                  maximum={100}
                  disabled={busy}
                  onChange={(value) => updateFootballNumber("assists", value)}
                />
                <NumberField
                  label="Cartons jaunes"
                  value={footballNumbers.yellowCards}
                  maximum={20}
                  disabled={busy}
                  onChange={(value) => updateFootballNumber("yellowCards", value)}
                />
                <NumberField
                  label="Cartons rouges"
                  value={footballNumbers.redCards}
                  maximum={20}
                  disabled={busy}
                  onChange={(value) => updateFootballNumber("redCards", value)}
                />
              </div>
              <div style={gridStyle}>
                <label style={labelStyle}>
                  Référence Footstats
                  <input
                    type="text"
                    maxLength={1000}
                    value={footstatsReference}
                    disabled={busy || Boolean(completionCandidate)}
                    onChange={(event) => setFootstatsReference(event.target.value)}
                  />
                </label>
                <label style={labelStyle}>
                  Identifiant joueur Footstats
                  <input
                    type="text"
                    maxLength={100}
                    value={footstatsPlayerId}
                    disabled={busy || Boolean(completionCandidate)}
                    onChange={(event) => setFootstatsPlayerId(event.target.value)}
                  />
                </label>
                <label style={labelStyle}>
                  Identifiant équipe Footstats
                  <input
                    type="text"
                    maxLength={100}
                    value={footstatsTeamId}
                    disabled={busy || Boolean(completionCandidate)}
                    onChange={(event) => setFootstatsTeamId(event.target.value)}
                  />
                </label>
              </div>
              <small>
                Une présence sur la feuille ou un score collectif ne prouve aucune participation.
                Les champs laissés vides restent inconnus, jamais égaux à zéro.
              </small>
            </div>
          </fieldset>
        ) : null}

        {isBasketball ? (
          <fieldset style={{ minWidth: 0, border: "1px solid #bfdbfe", borderRadius: "8px" }}>
            <legend style={{ fontSize: "0.82rem", fontWeight: 750 }}>
              Basketball · facultatif
            </legend>
            <div style={gridStyle}>
              <label style={labelStyle}>
                Titulaire
                <select
                  value={basketball.starter}
                  disabled={busy}
                  onChange={(event) => updateBasketball("starter", event.target.value)}
                >
                  <option value="">Inconnu</option>
                  <option value="yes">Oui</option>
                  <option value="no">Non</option>
                </select>
              </label>
              {([
                ["minutes", "Minutes"],
                ["points", "Points"],
                ["rebounds", "Rebonds"],
                ["assists", "Passes"],
                ["steals", "Interceptions"],
                ["blocks", "Contres"],
              ] as const).map(([field, label]) => (
                <NumberField
                  key={field}
                  label={label}
                  value={basketball[field]}
                  disabled={busy}
                  onChange={(value) => updateBasketball(field, value)}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset style={{ minWidth: 0, border: "1px solid #dbe3ee", borderRadius: "8px" }}>
          <legend style={{ fontSize: "0.82rem", fontWeight: 750 }}>
            Statistiques complémentaires · facultatif
          </legend>
          <div style={{ display: "grid", gap: "0.55rem", minWidth: 0 }}>
            {statistics.map((statistic, index) => (
              <div key={index} style={gridStyle}>
                <label style={labelStyle}>
                  Libellé {index + 1}
                  <input
                    type="text"
                    maxLength={80}
                    required
                    value={statistic.label}
                    disabled={busy}
                    onChange={(event) => setStatistics((current) =>
                      current.map((item, currentIndex) =>
                        currentIndex === index
                          ? { ...item, label: event.target.value }
                          : item))}
                  />
                </label>
                <label style={labelStyle}>
                  Valeur {index + 1}
                  <input
                    type="text"
                    maxLength={120}
                    required
                    value={statistic.value}
                    disabled={busy}
                    onChange={(event) => setStatistics((current) =>
                      current.map((item, currentIndex) =>
                        currentIndex === index
                          ? { ...item, value: event.target.value }
                          : item))}
                  />
                </label>
                <label style={labelStyle}>
                  Unité {index + 1}
                  <input
                    type="text"
                    maxLength={40}
                    value={statistic.unit}
                    disabled={busy}
                    onChange={(event) => setStatistics((current) =>
                      current.map((item, currentIndex) =>
                        currentIndex === index
                          ? { ...item, unit: event.target.value }
                          : item))}
                  />
                </label>
                <button
                  type="button"
                  className="card-link-button"
                  disabled={busy}
                  onClick={() =>
                    setStatistics((current) => current.filter((_, currentIndex) =>
                      currentIndex !== index))}
                >
                  Retirer
                </button>
              </div>
            ))}
            <button
              type="button"
              className="card-link-button"
              disabled={busy || statistics.length >= 12}
              onClick={() =>
                setStatistics((current) => [...current, { label: "", value: "", unit: "" }])}
            >
              Ajouter une statistique
            </button>
          </div>
        </fieldset>

        <section
          style={{
            display: "grid",
            gap: "0.55rem",
            padding: "0.65rem",
            border: "1px solid #bfdbfe",
            borderRadius: "8px",
            background: "#f8fbff",
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="card-link-button"
              disabled={busy || !generationAvailable}
              onClick={requestTextGeneration}
            >
              {title.trim() || summary.trim()
                ? "Régénérer"
                : "Générer le titre et le résumé"}
            </button>
            {!generationAvailable ? (
              <small>
                Renseignez l’athlète, la date et au moins un fait sportif explicite.
              </small>
            ) : null}
          </div>
          {confirmRegeneration ? (
            <div
              role="alert"
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                flexWrap: "wrap",
                color: "#92400e",
                fontSize: "0.78rem",
              }}
            >
              <strong>Remplacer le titre et le résumé modifiés ?</strong>
              <button
                type="button"
                className="card-link-button"
                disabled={busy}
                onClick={applyGeneratedText}
              >
                Confirmer la régénération
              </button>
              <button
                type="button"
                className="card-link-button"
                disabled={busy}
                onClick={() => setConfirmRegeneration(false)}
              >
                Annuler
              </button>
            </div>
          ) : null}
        </section>

        <label style={labelStyle}>
          Titre *
          <input
            type="text"
            required
            maxLength={300}
            value={title}
            disabled={busy}
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleEdited(true);
              setConfirmRegeneration(false);
            }}
          />
        </label>
        <label style={labelStyle}>
          Résumé factuel *
          <textarea
            required
            maxLength={3000}
            rows={4}
            value={summary}
            disabled={busy}
            onChange={(event) => {
              setSummary(event.target.value);
              setSummaryEdited(true);
              setConfirmRegeneration(false);
            }}
          />
        </label>

        <label style={labelStyle}>
          Note interne Admin
          <textarea
            rows={3}
            maxLength={1500}
            value={internalNote}
            disabled={busy}
            onChange={(event) => setInternalNote(event.target.value)}
          />
          <small>Cette note reste dans Sports Watch et n’est pas transférée à l’article.</small>
        </label>

        {duplicates.length > 0 ? (
          <section
            role="alert"
            style={{
              display: "grid",
              gap: "0.45rem",
              border: "1px solid #f59e0b",
              borderRadius: "8px",
              padding: "0.65rem",
              background: "#fffbeb",
            }}
          >
            <strong>Rapprochement nécessaire</strong>
            {duplicates.map((duplicate) => (
              <div key={duplicate.candidateId} style={{ fontSize: "0.76rem" }}>
                {duplicate.reason} <strong>{duplicate.sourceName}</strong> · {duplicate.title}
              </div>
            ))}
            <button
              type="button"
              className="card-link-button"
              disabled={busy}
              onClick={() => void submit(true)}
            >
              Créer malgré le rapprochement
            </button>
          </section>
        ) : null}

        {message ? <p role="status" style={{ margin: 0, color: "#166534" }}>{message}</p> : null}
        {error ? <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{error}</p> : null}

        <button
          type="submit"
          className="card-link-button sports-action is-primary"
          disabled={busy}
        >
          {busy
            ? "Enregistrement…"
            : completionCandidate
              ? "Enrichir le candidat"
              : "Ajouter l’actualité"}
        </button>
        {completionCandidate ? (
          <button
            type="button"
            className="card-link-button sports-action"
            disabled={busy}
            onClick={onCompletionCancelled}
          >
            Annuler
          </button>
        ) : null}
      </form>
    </details>
  );
}
