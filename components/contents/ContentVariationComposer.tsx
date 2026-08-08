"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { buildSourceDocumentSnapshot } from "@/services/content-variants/source-snapshot";
import type { ContentDocument, InterviewDocument } from "@/types/content-document";
import type { GenerateContentApiResponse } from "@/types/content-generation";
import type {
  ContentVariationRequest,
  ContentVariant,
  ContentVariantObjective,
  ContentVariantPlatform,
  ContentVariantTone,
  ContentVariantType,
} from "@/types/content-variant";

type ContentVariationComposerProps = {
  document: ContentDocument;
  onClose: () => void;
  onCreated: (variant: ContentVariant) => void;
};

type StepId = "type" | "platform" | "objective" | "parameters" | "generate";

const steps: Array<{ id: StepId; label: string }> = [
  { id: "type", label: "Etape 1" },
  { id: "platform", label: "Etape 2" },
  { id: "objective", label: "Etape 3" },
  { id: "parameters", label: "Etape 4" },
  { id: "generate", label: "Etape 5" },
];

const variationTypeOptions: Array<{ id: ContentVariantType; label: string; description: string }> = [
  { id: "publication", label: "Publication", description: "Post adapte au canal cible." },
  { id: "carousel", label: "Carrousel", description: "Sequence slides avec legende." },
  { id: "reel", label: "Reel", description: "Script vertical avec plans." },
  { id: "stories", label: "Stories", description: "Sequence stories avec interactions." },
  { id: "teaser", label: "Teaser", description: "Version courte et moyenne." },
  { id: "short_article", label: "Article court", description: "Texte editorial bref." },
  { id: "quote_visual", label: "Citation visuelle", description: "Citation exacte uniquement." },
  { id: "podcast_intro", label: "Introduction podcast", description: "Ouverture audio exploitable." },
];

const allPlatformOptions: Array<{ id: ContentVariantPlatform; label: string }> = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube_shorts", label: "YouTube Shorts" },
  { id: "website", label: "Site web" },
  { id: "newsletter", label: "Newsletter" },
  { id: "media", label: "Media" },
  { id: "free", label: "Canal libre" },
];

const objectiveOptions: Array<{ id: ContentVariantObjective; label: string }> = [
  { id: "inform", label: "Informer" },
  { id: "inspire", label: "Inspirer" },
  { id: "present", label: "Presenter" },
  { id: "promote", label: "Promouvoir" },
  { id: "tease", label: "Teaser" },
  { id: "engagement", label: "Developper l engagement" },
  { id: "highlight_subject", label: "Valoriser le sujet" },
  { id: "highlight_partner", label: "Valoriser un partenaire" },
  { id: "traffic", label: "Generer du trafic" },
  { id: "free", label: "Libre" },
];

const toneOptions: Array<{ id: ContentVariantTone; label: string }> = [
  { id: "institutional", label: "Institutionnel" },
  { id: "journalistic", label: "Journalistique" },
  { id: "authentic", label: "Authentique" },
  { id: "inspiring", label: "Inspirant" },
  { id: "dynamic", label: "Dynamique" },
  { id: "casual", label: "Decontracte" },
  { id: "free", label: "Libre" },
];

const platformByType: Record<ContentVariantType, ContentVariantPlatform[]> = {
  publication: ["instagram", "facebook", "linkedin", "website", "newsletter", "media", "free"],
  carousel: ["instagram", "linkedin", "facebook", "website", "free"],
  reel: ["instagram", "tiktok", "youtube_shorts", "facebook", "free"],
  stories: ["instagram", "facebook", "free"],
  teaser: ["instagram", "linkedin", "newsletter", "website", "media", "free"],
  short_article: ["website", "newsletter", "linkedin", "media", "free"],
  quote_visual: ["instagram", "linkedin", "facebook", "website", "free"],
  podcast_intro: ["newsletter", "website", "media", "free"],
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const makeVariantFormatLabel = (type: ContentVariantType): string => {
  if (type === "carousel") return "carousel";
  if (type === "reel") return "short_video";
  if (type === "stories") return "stories";
  if (type === "quote_visual") return "quote_card";
  if (type === "podcast_intro") return "audio_script";
  return "text";
};

export function ContentVariationComposer({ document, onClose, onCreated }: ContentVariationComposerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [variationType, setVariationType] = useState<ContentVariantType | null>(null);
  const [platform, setPlatform] = useState<ContentVariantPlatform | null>(null);
  const [objective, setObjective] = useState<ContentVariantObjective | null>(null);
  const [tone, setTone] = useState<ContentVariantTone>("authentic");
  const [audience, setAudience] = useState("");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [durationSeconds, setDurationSeconds] = useState("30");
  const [slideCount, setSlideCount] = useState("5");
  const [storyCount, setStoryCount] = useState("4");
  const [callToAction, setCallToAction] = useState("");
  const [includeTopics, setIncludeTopics] = useState("");
  const [avoidTopics, setAvoidTopics] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [includePrivateNotes, setIncludePrivateNotes] = useState(false);
  const [includedPrivateNoteQuestionIds, setIncludedPrivateNoteQuestionIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const step = steps[stepIndex];
  const interviewDocument = document.type === "interview" ? document as InterviewDocument : null;

  const platformOptions = useMemo(() => {
    if (!variationType) return [];
    const allowed = new Set(platformByType[variationType]);
    return allPlatformOptions.filter((item) => allowed.has(item.id));
  }, [variationType]);

  const isStepValid = useMemo(() => {
    if (step.id === "type") return Boolean(variationType);
    if (step.id === "platform") return Boolean(platform);
    if (step.id === "objective") return Boolean(objective);
    if (step.id === "parameters") return Boolean(normalize(audience));
    return true;
  }, [audience, objective, platform, step.id, variationType]);

  const parseCsvLines = (value: string): string[] => {
    return value
      .split(/[\n,;|]/)
      .map((item) => normalize(item))
      .filter(Boolean)
      .slice(0, 12);
  };

  const togglePrivateNoteId = (questionId: string) => {
    setIncludedPrivateNoteQuestionIds((current) => {
      if (current.includes(questionId)) {
        return current.filter((id) => id !== questionId);
      }
      return [...current, questionId];
    });
  };

  const createVariation = async () => {
    if (!variationType || !platform || !objective) return;
    setGenerating(true);
    setErrorMessage(null);

    try {
      const snapshot = buildSourceDocumentSnapshot({
        document,
        includePrivateNotes,
        includedPrivateNoteQuestionIds,
      });

      const variationRequest: ContentVariationRequest = {
        sourceDocument: snapshot,
        sourceDocumentId: snapshot.documentId,
        sourceDocumentType: snapshot.documentType,
        selectedContextItems: snapshot.selectedContextItems,
        variationType,
        platform,
        objective,
        tone,
        audience: normalize(audience),
        constraints: {
          language: "fr-CH",
          audience: normalize(audience),
          length,
          durationSeconds: Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : undefined,
          slideCount: Number.isFinite(Number(slideCount)) ? Number(slideCount) : undefined,
          storyCount: Number.isFinite(Number(storyCount)) ? Number(storyCount) : undefined,
          callToAction: normalize(callToAction) || undefined,
          includeTopics: parseCsvLines(includeTopics),
          avoidTopics: parseCsvLines(avoidTopics),
          additionalContext: normalize(additionalContext) || undefined,
          includePrivateNotes,
          includedPrivateNoteQuestionIds: includePrivateNotes ? includedPrivateNoteQuestionIds : [],
        },
        language: "fr-CH",
      };

      const response = await fetch("/api/content/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          operation: "variation",
          variation: variationRequest,
        }),
      });

      const payload = (await response.json()) as GenerateContentApiResponse;
      if (!payload.ok || !("operation" in payload) || payload.operation !== "variation") {
        setErrorMessage(payload.ok ? "Generation de declinaison indisponible." : payload.message);
        setGenerating(false);
        return;
      }

      const now = new Date().toISOString();
      const variant: ContentVariant = {
        id: payload.result.id,
        sourceDocumentId: snapshot.documentId,
        sourceDocumentType: snapshot.documentType,
        sourceDocumentVersionId: snapshot.documentVersionId,
        sourceDocumentUpdatedAt: snapshot.documentUpdatedAt,
        subjectId: snapshot.subjectId,
        type: variationType,
        format: makeVariantFormatLabel(variationType),
        platform,
        objective,
        tone,
        audience: normalize(audience),
        title: payload.result.title,
        content: payload.result.content,
        structuredContent: payload.result.structuredContent,
        status: "draft",
        generationMetadata: payload.result.generationMetadata,
        createdAt: now,
        updatedAt: now,
      };

      onCreated(variant);
      onClose();
    } catch {
      setErrorMessage("Impossible de generer la declinaison.");
    } finally {
      setGenerating(false);
    }
  };

  const renderStep = () => {
    if (step.id === "type") {
      return (
        <section className="creation-panel">
          <header><h3>Choisir un type</h3></header>
          <div className="creation-option-grid">
            {variationTypeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={variationType === option.id ? "creation-option-card is-active" : "creation-option-card"}
                onClick={() => {
                  setVariationType(option.id);
                  setPlatform(null);
                }}
              >
                <strong>{option.label}</strong>
                <p>{option.description}</p>
              </button>
            ))}
          </div>
        </section>
      );
    }

    if (step.id === "platform") {
      return (
        <section className="creation-panel">
          <header><h3>Choisir un canal</h3></header>
          <div className="creation-option-grid">
            {platformOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={platform === option.id ? "creation-option-card is-active" : "creation-option-card"}
                onClick={() => setPlatform(option.id)}
              >
                <strong>{option.label}</strong>
              </button>
            ))}
          </div>
        </section>
      );
    }

    if (step.id === "objective") {
      return (
        <section className="creation-panel">
          <header><h3>Choisir un objectif</h3></header>
          <div className="creation-option-grid">
            {objectiveOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={objective === option.id ? "creation-option-card is-active" : "creation-option-card"}
                onClick={() => setObjective(option.id)}
              >
                <strong>{option.label}</strong>
              </button>
            ))}
          </div>
        </section>
      );
    }

    if (step.id === "parameters") {
      return (
        <section className="creation-panel">
          <header><h3>Parametres</h3></header>
          <div className="creation-fields-grid">
            <label>
              <span>Ton</span>
              <select value={tone} onChange={(event) => setTone(event.target.value as ContentVariantTone)}>
                {toneOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>Audience</span>
              <input type="text" value={audience} onChange={(event) => setAudience(event.target.value)} />
            </label>
            <label>
              <span>Longueur</span>
              <select value={length} onChange={(event) => setLength(event.target.value as "short" | "medium" | "long")}>
                <option value="short">Courte</option>
                <option value="medium">Moyenne</option>
                <option value="long">Longue</option>
              </select>
            </label>
            <label>
              <span>Duree (sec)</span>
              <input type="number" min={10} max={180} value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} />
            </label>
            <label>
              <span>Nombre de slides</span>
              <input type="number" min={2} max={12} value={slideCount} onChange={(event) => setSlideCount(event.target.value)} />
            </label>
            <label>
              <span>Nombre de stories</span>
              <input type="number" min={2} max={12} value={storyCount} onChange={(event) => setStoryCount(event.target.value)} />
            </label>
            <label>
              <span>CTA</span>
              <input type="text" value={callToAction} onChange={(event) => setCallToAction(event.target.value)} />
            </label>
          </div>

          <label className="creation-inline-field">
            <span>Sujets a inclure</span>
            <textarea className="creation-textarea" value={includeTopics} onChange={(event) => setIncludeTopics(event.target.value)} />
          </label>

          <label className="creation-inline-field">
            <span>Elements a eviter</span>
            <textarea className="creation-textarea" value={avoidTopics} onChange={(event) => setAvoidTopics(event.target.value)} />
          </label>

          <label className="creation-inline-field">
            <span>Contexte complementaire</span>
            <textarea className="creation-textarea" value={additionalContext} onChange={(event) => setAdditionalContext(event.target.value)} />
          </label>

          <label className="creation-disabled-check">
            <input
              type="checkbox"
              checked={includePrivateNotes}
              onChange={(event) => {
                setIncludePrivateNotes(event.target.checked);
                if (!event.target.checked) setIncludedPrivateNoteQuestionIds([]);
              }}
            />
            <span>Inclure certaines notes privees</span>
          </label>

          {includePrivateNotes && interviewDocument ? (
            <ul className="creation-context-list">
              {interviewDocument.sections.questions.map((question) => (
                <li key={question.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={includedPrivateNoteQuestionIds.includes(question.id)}
                      onChange={() => togglePrivateNoteId(question.id)}
                    />
                    <span>Q: {question.text || "Question sans texte"}</span>
                  </label>
                  <small>{question.privateNotes || "Aucune note privee"}</small>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      );
    }

    return (
      <section className="creation-panel">
        <header><h3>Recapitulatif</h3></header>
        <dl className="creation-summary-grid">
          <div><dt>Type</dt><dd>{variationType || "-"}</dd></div>
          <div><dt>Canal</dt><dd>{platform || "-"}</dd></div>
          <div><dt>Objectif</dt><dd>{objective || "-"}</dd></div>
          <div><dt>Ton</dt><dd>{tone}</dd></div>
          <div><dt>Audience</dt><dd>{audience || "-"}</dd></div>
          <div><dt>Notes privees</dt><dd>{includePrivateNotes ? `${includedPrivateNoteQuestionIds.length} selectionnees` : "Non"}</dd></div>
        </dl>

        {generating ? (
          <section className="creation-generation-state" aria-live="polite" aria-busy="true">
            <header><h3>Creation de la declinaison</h3></header>
            <ul>
              <li>Analyse du document</li>
              <li>Selection des elements utiles</li>
              <li>Adaptation au format</li>
              <li>Construction du contenu</li>
              <li>Validation editoriale</li>
            </ul>
          </section>
        ) : null}

        {errorMessage ? <p className="creation-error" role="alert">{errorMessage}</p> : null}
      </section>
    );
  };

  return (
    <section className="creation-assistant-screen content-variation-modal" aria-label="Assistant de declinaison">
      <header className="creation-assistant-head">
        <div>
          <h1>Creer une declinaison</h1>
          <p>Transformez le document courant en un format editorial exploitable.</p>
        </div>
        <button type="button" className="contents-ghost-button" onClick={onClose}>Fermer</button>
      </header>

      <nav className="creation-steps-track" aria-label="Progression de l assistant de declinaison">
        {steps.map((item, index) => (
          <div key={item.id} className={index === stepIndex ? "creation-step-pill is-current" : index < stepIndex ? "creation-step-pill is-done" : "creation-step-pill"}>
            <strong>{item.label}</strong>
          </div>
        ))}
      </nav>

      {renderStep()}

      <footer className="creation-footer-actions">
        <button type="button" className="contents-secondary-button" onClick={() => setStepIndex((value) => Math.max(0, value - 1))} disabled={stepIndex === 0 || generating}>
          <ArrowLeft size={15} aria-hidden /> Precedent
        </button>
        <div className="creation-footer-right">
          {step.id === "generate" ? (
            <button type="button" className="crm-primary-action" onClick={createVariation} disabled={generating || !isStepValid}>
              {generating ? <Loader2 size={14} className="is-spinning" aria-hidden /> : null}
              {generating ? "Generation..." : "Lancer la generation"}
            </button>
          ) : (
            <button type="button" className="crm-primary-action" onClick={() => setStepIndex((value) => Math.min(steps.length - 1, value + 1))} disabled={!isStepValid || generating}>
              Suivant <ArrowRight size={15} aria-hidden />
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
