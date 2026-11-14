"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, Newspaper, PenLine, Save } from "lucide-react";
import {
  SPORTS_BRIEF_ANGLES,
  availableBriefAngles,
  generateSportsBriefText,
  isVerifiedBriefFact,
  type SportsBriefAngleId,
} from "@/lib/sports-watch/brief-text-generator";
import {
  briefCandidateIdFromDocument,
  briefFieldsFromDocument,
  briefSourceFromCandidate,
  buildSportsBriefDocument,
  isSportsBriefDocument,
  type SportsBriefDraftFields,
} from "@/lib/sports-watch/brief-document";
import type { ArticleDocument, ContentDocument } from "@/types/content-document";
import type { SportsWatchBriefCandidate, SportsWatchBriefContext } from "@/types/sports-watch";

type SportsBriefScreenProps = {
  initialCandidateId?: string;
  initialDocumentId?: string;
};

type DraftPersistence = {
  documentId: string;
  version: number;
  document: ArticleDocument;
};

const emptyFields: SportsBriefDraftFields = { title: "", lead: "", body: "" };

const dateLabel = (value: string | null): string => {
  if (!value) return "Date inconnue";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
};

const verificationBadge = (status: SportsWatchBriefCandidate["verificationStatus"]) =>
  status === "verified"
    ? { label: "Faits vérifiés", className: "is-verified" }
    : status === "disputed"
      ? { label: "Faits contestés", className: "is-disputed" }
      : { label: "À vérifier", className: "is-unverified" };

export function SportsBriefScreen({
  initialCandidateId,
  initialDocumentId,
}: SportsBriefScreenProps) {
  const [context, setContext] = useState<SportsWatchBriefContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    initialCandidateId ?? null,
  );
  const [fields, setFields] = useState<SportsBriefDraftFields>(emptyFields);
  const [angleId, setAngleId] = useState<SportsBriefAngleId | null>(null);
  const [persistence, setPersistence] = useState<DraftPersistence | null>(null);
  const [documentSource, setDocumentSource] = useState<ArticleDocument | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmGeneration, setConfirmGeneration] = useState(false);
  // La requête de contexte force la réhydratation serveur : l’identifiant transmis par
  // l’URL ou le brouillon est revalidé dans l’espace de travail courant avant tout affichage.
  const [contextRequest, setContextRequest] = useState<{ candidateId: string | null } | null>(
    initialDocumentId ? null : { candidateId: initialCandidateId ?? null },
  );
  const loadedDocumentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!contextRequest) return;

    let active = true;

    const loadContext = async () => {
      setContextLoading(true);
      setContextError(null);
      try {
        const params = new URLSearchParams();
        if (contextRequest.candidateId) params.set("candidateId", contextRequest.candidateId);
        const query = params.toString();
        const response = await fetch(
          `/api/admin/sports-watch/brief-context${query ? `?${query}` : ""}`,
          { cache: "no-store", credentials: "include" },
        );
        const payload = await response.json() as {
          context?: SportsWatchBriefContext;
          message?: string;
        };
        if (!response.ok || !payload.context) {
          throw new Error(payload.message || "Impossible de charger les actualités éligibles.");
        }
        if (!active) return;
        setContext(payload.context);
        setSelectedCandidateId((current) => current ?? payload.context!.selectedCandidateId);
      } catch (error) {
        if (!active) return;
        setContext(null);
        setContextError(
          error instanceof Error ? error.message : "Impossible de charger les actualités éligibles.",
        );
      } finally {
        if (active) setContextLoading(false);
      }
    };

    void loadContext();

    return () => {
      active = false;
    };
  }, [contextRequest]);

  useEffect(() => {
    if (!initialDocumentId) return;
    if (loadedDocumentIdRef.current === initialDocumentId) return;
    loadedDocumentIdRef.current = initialDocumentId;

    void (async () => {
      try {
        const response = await fetch(
          `/api/contents/storage/drafts/${encodeURIComponent(initialDocumentId)}`,
          { cache: "no-store", credentials: "include" },
        );
        const payload = await response.json() as {
          document?: ContentDocument;
          version?: number;
          message?: string;
        };
        if (!response.ok || !payload.document || typeof payload.version !== "number") {
          throw new Error(payload.message || "Brouillon introuvable.");
        }
        if (!isSportsBriefDocument(payload.document)) {
          throw new Error("Ce brouillon n’est pas une brève sportive.");
        }
        const document = payload.document as ArticleDocument;
        setPersistence({
          documentId: document.id,
          version: payload.version,
          document,
        });
        setDocumentSource(document);
        setFields(briefFieldsFromDocument(document));
        const storedAngle = document.sections.selectedAngle.id as SportsBriefAngleId;
        setAngleId(SPORTS_BRIEF_ANGLES[storedAngle] ? storedAngle : null);
        const candidateId = briefCandidateIdFromDocument(document);
        setSelectedCandidateId(candidateId);
        setContextRequest({ candidateId });
      } catch (error) {
        setContextLoading(false);
        setDocumentError(
          error instanceof Error ? error.message : "Impossible d’ouvrir le brouillon.",
        );
      }
    })();
  }, [initialDocumentId]);

  const candidates = useMemo(() => context?.candidates ?? [], [context]);
  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null,
    [candidates, selectedCandidateId],
  );

  const angles = useMemo(
    () => (selectedCandidate ? availableBriefAngles(selectedCandidate) : []),
    [selectedCandidate],
  );

  // L’angle effectif est dérivé au rendu : un choix invalide pour l’actualité
  // sélectionnée retombe sur le premier angle disponible. Sans fait vérifié,
  // la rédaction manuelle reste possible sous l’angle « Actualité » par défaut.
  const effectiveAngleId = useMemo(() => {
    if (angleId && angles.some((angle) => angle.id === angleId)) return angleId;
    if (angles.length > 0) return angles[0].id;
    return selectedCandidate ? SPORTS_BRIEF_ANGLES.news.id : null;
  }, [angleId, angles, selectedCandidate]);

  const selectedAngle = effectiveAngleId ? SPORTS_BRIEF_ANGLES[effectiveAngleId] : null;
  const hasText = Boolean(fields.title.trim() || fields.lead.trim() || fields.body.trim());
  // La rédaction assistée exige un angle fondé sur des faits vérifiés ;
  // l’angle manuel par défaut ne la réactive pas.
  const canGenerate = Boolean(
    selectedCandidate
    && effectiveAngleId
    && angles.some((angle) => angle.id === effectiveAngleId),
  );
  const canSave = Boolean(
    selectedCandidate
    && selectedAngle
    && fields.title.trim()
    && fields.lead.trim()
    && fields.body.trim(),
  );

  const updateField = (key: keyof SportsBriefDraftFields) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFields((current) => ({ ...current, [key]: event.target.value }));
      setSaveState("idle");
      setConfirmGeneration(false);
    };

  const applyGeneration = () => {
    if (!selectedCandidate || !effectiveAngleId || !canGenerate) return;
    if (hasText && !confirmGeneration) {
      setConfirmGeneration(true);
      return;
    }
    setConfirmGeneration(false);
    try {
      setFields(generateSportsBriefText(selectedCandidate, effectiveAngleId));
      setSaveState("idle");
      setSaveMessage(null);
    } catch (error) {
      setSaveState("error");
      setSaveMessage(
        error instanceof Error ? error.message : "La rédaction automatique a échoué.",
      );
    }
  };

  const copyDraft = async () => {
    const text = [fields.title, fields.lead, fields.body].filter(Boolean).join("\n\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setSaveState("error");
      setSaveMessage("La copie dans le presse-papiers a échoué.");
    }
  };

  const saveDraft = async () => {
    if (!selectedCandidate || !selectedAngle || !canSave) return;
    setSaveState("saving");
    setSaveMessage(null);
    try {
      const now = new Date().toISOString();
      const documentId = persistence?.documentId
        ?? `brief-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`}`;
      const document = buildSportsBriefDocument({
        id: documentId,
        now,
        fields,
        angle: selectedAngle,
        source: briefSourceFromCandidate(selectedCandidate),
        existing: persistence?.document,
      });
      const response = persistence
        ? await fetch(`/api/contents/storage/drafts/${encodeURIComponent(documentId)}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ document, expectedVersion: persistence.version }),
          })
        : await fetch("/api/contents/storage/drafts", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ document }),
          });
      const payload = await response.json() as {
        ok?: boolean;
        version?: number;
        document?: ContentDocument;
        message?: string;
      };
      if (!response.ok || typeof payload.version !== "number" || !payload.document) {
        throw new Error(payload.message || "L’enregistrement du brouillon a échoué.");
      }
      setPersistence({
        documentId,
        version: payload.version,
        document: payload.document as ArticleDocument,
      });
      setSaveState("saved");
      setSaveMessage("Brouillon enregistré avec sa source.");
    } catch (error) {
      setSaveState("error");
      setSaveMessage(
        error instanceof Error ? error.message : "L’enregistrement du brouillon a échoué.",
      );
    }
  };

  const badge = selectedCandidate ? verificationBadge(selectedCandidate.verificationStatus) : null;

  return (
    <section className="sports-brief-screen">
      <header className="sports-brief-header">
        <div>
          <Link href="/contents" className="sports-brief-back">
            <ArrowLeft size={15} aria-hidden /> Studio
          </Link>
          <h1>Brève sportive</h1>
          <p>
            Une actualité vérifiée d’un côté, votre texte de l’autre. Le brouillon reste chez vous :
            aucune publication automatique.
          </p>
        </div>
        {persistence ? (
          <span className="sports-brief-saved-chip">
            <Check size={14} aria-hidden /> Brouillon lié · version {persistence.version}
          </span>
        ) : null}
      </header>

      {documentError ? (
        <p role="alert" className="sports-brief-error">{documentError}</p>
      ) : null}

      {contextLoading ? (
        <article className="sports-brief-empty" aria-live="polite">
          Chargement des actualités éligibles…
        </article>
      ) : contextError ? (
        <article className="sports-brief-empty" role="alert">
          <strong>{contextError}</strong>
          {documentSource ? (
            <p>
              Source enregistrée avec le brouillon :{" "}
              {documentSource.sections.usedSources[0]?.title ?? "inconnue"}.
            </p>
          ) : null}
          <button
            type="button"
            className="contents-ghost-button"
            onClick={() => setContextRequest({ candidateId: selectedCandidateId })}
          >
            Réessayer
          </button>
        </article>
      ) : !selectedCandidate ? (
        <section className="sports-brief-picker" aria-labelledby="sports-brief-picker-title">
          <h2 id="sports-brief-picker-title">Choisir une actualité éligible</h2>
          <p>Seules les actualités validées dans Sports Watch peuvent nourrir une brève.</p>
          {candidates.length === 0 ? (
            <article className="sports-brief-empty">
              <strong>Aucune actualité éligible pour le moment.</strong>
              <p>
                Validez une actualité dans <Link href="/sports-watch">Sports Watch</Link> puis
                revenez préparer la brève.
              </p>
            </article>
          ) : (
            <ul className="sports-brief-candidate-list">
              {candidates.map((candidate) => {
                const candidateBadge = verificationBadge(candidate.verificationStatus);
                return (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      className="sports-brief-candidate"
                      onClick={() => setSelectedCandidateId(candidate.id)}
                    >
                      <span className="sports-brief-candidate-head">
                        <strong>{candidate.athleteName}</strong>
                        <span className={`sports-brief-badge ${candidateBadge.className}`}>
                          {candidateBadge.label}
                        </span>
                      </span>
                      <span className="sports-brief-candidate-title">{candidate.title}</span>
                      <span className="sports-brief-candidate-meta">
                        {candidate.sourceName} · {dateLabel(candidate.eventDateFrom
                          ?? candidate.publicationDate ?? candidate.collectedAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <div className="sports-brief-workspace">
          <section className="sports-brief-facts" aria-labelledby="sports-brief-facts-title">
            <header className="sports-brief-panel-head">
              <h2 id="sports-brief-facts-title">
                <Newspaper size={16} aria-hidden /> Faits et source
              </h2>
              {badge ? (
                <span className={`sports-brief-badge ${badge.className}`}>{badge.label}</span>
              ) : null}
            </header>

            <article className="sports-brief-source-card">
              <strong>{selectedCandidate.title}</strong>
              <p className="sports-brief-candidate-meta">
                {selectedCandidate.athleteName} · {selectedCandidate.sourceName} ·{" "}
                {dateLabel(selectedCandidate.eventDateFrom
                  ?? selectedCandidate.publicationDate ?? selectedCandidate.collectedAt)}
              </p>
              <a
                href={selectedCandidate.articleUrl}
                target="_blank"
                rel="noreferrer"
                className="sports-brief-source-link"
              >
                Consulter la source <ExternalLink size={13} aria-hidden />
              </a>
            </article>

            {selectedCandidate.verifiedStatistics.length > 0 ? (
              <div className="sports-brief-stats">
                <h3>Statistiques vérifiées</h3>
                <ul>
                  {selectedCandidate.verifiedStatistics.map((statistic) => (
                    <li key={`${statistic.label}-${statistic.value}`}>
                      <strong>{statistic.value}</strong> {statistic.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <ul className="sports-brief-fact-list">
              {selectedCandidate.materials.map((material) => {
                const verified = isVerifiedBriefFact(material);
                return (
                  <li
                    key={material.id}
                    className={verified ? "is-verified" : "is-unverified"}
                  >
                    <span className="sports-brief-fact-status">
                      {verified ? "Fait vérifié" : "À vérifier — exclu de la génération"}
                    </span>
                    <p>{material.text}</p>
                    <small>{material.provenance}</small>
                  </li>
                );
              })}
            </ul>

            {context && candidates.length > 1 && !initialCandidateId ? (
              <button
                type="button"
                className="contents-ghost-button"
                onClick={() => {
                  setSelectedCandidateId(null);
                  setConfirmGeneration(false);
                }}
              >
                Choisir une autre actualité
              </button>
            ) : null}
          </section>

          <section className="sports-brief-editor" aria-labelledby="sports-brief-editor-title">
            <header className="sports-brief-panel-head">
              <h2 id="sports-brief-editor-title">
                <PenLine size={16} aria-hidden /> Brouillon
              </h2>
            </header>

            <div className="sports-brief-angles" role="radiogroup" aria-label="Angle éditorial">
              {angles.length === 0 ? (
                <>
                  <p className="sports-brief-angles-empty">
                    Aucun fait vérifié : rédigez librement sous l’angle « Actualité »,
                    la génération automatique est désactivée.
                  </p>
                  <button
                    type="button"
                    role="radio"
                    aria-checked
                    className="sports-brief-angle is-active"
                    title={SPORTS_BRIEF_ANGLES.news.intent}
                  >
                    {SPORTS_BRIEF_ANGLES.news.title}
                  </button>
                </>
              ) : (
                angles.map((angle) => (
                  <button
                    key={angle.id}
                    type="button"
                    role="radio"
                    aria-checked={effectiveAngleId === angle.id}
                    className={`sports-brief-angle${effectiveAngleId === angle.id ? " is-active" : ""}`}
                    onClick={() => {
                      setAngleId(angle.id);
                      setConfirmGeneration(false);
                    }}
                    title={angle.intent}
                  >
                    {angle.title}
                  </button>
                ))
              )}
            </div>

            <div className="sports-brief-generate">
              <button
                type="button"
                className="sports-brief-primary-button"
                disabled={!canGenerate}
                onClick={applyGeneration}
              >
                {confirmGeneration
                  ? "Confirmer : remplacer le texte actuel"
                  : "Rédiger à partir des faits vérifiés"}
              </button>
              <small>Rédaction locale et déterministe — aucun crédit IA consommé.</small>
              {confirmGeneration ? (
                <button
                  type="button"
                  className="contents-ghost-button"
                  onClick={() => setConfirmGeneration(false)}
                >
                  Conserver mon texte
                </button>
              ) : null}
            </div>

            <label className="sports-brief-field">
              <span>Titre</span>
              <input
                type="text"
                value={fields.title}
                onChange={updateField("title")}
                placeholder="Titre de la brève"
              />
            </label>

            <label className="sports-brief-field">
              <span>Chapô</span>
              <textarea
                rows={2}
                value={fields.lead}
                onChange={updateField("lead")}
                placeholder="Une ou deux phrases qui résument l’essentiel."
              />
            </label>

            <label className="sports-brief-field">
              <span>Corps de texte</span>
              <textarea
                rows={10}
                value={fields.body}
                onChange={updateField("body")}
                placeholder="Le détail factuel, avec la source."
              />
            </label>

            <footer className="sports-brief-actions">
              <button
                type="button"
                className="contents-ghost-button"
                disabled={!hasText}
                onClick={() => void copyDraft()}
              >
                <Copy size={14} aria-hidden /> {copied ? "Texte copié" : "Copier le texte"}
              </button>
              <button
                type="button"
                className="sports-brief-primary-button"
                disabled={!canSave || saveState === "saving"}
                onClick={() => void saveDraft()}
              >
                <Save size={14} aria-hidden />{" "}
                {saveState === "saving"
                  ? "Enregistrement…"
                  : persistence
                    ? "Mettre à jour le brouillon"
                    : "Enregistrer le brouillon"}
              </button>
            </footer>

            {saveMessage ? (
              <p
                className={saveState === "error" ? "sports-brief-error" : "sports-brief-success"}
                role={saveState === "error" ? "alert" : "status"}
              >
                {saveMessage}
              </p>
            ) : null}
          </section>
        </div>
      )}
    </section>
  );
}
