"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Save } from "lucide-react";
import type {
  CarouselStructuredContent,
  ContentVariant,
  PublicationStructuredContent,
  QuoteVisualStructuredContent,
  ReelStructuredContent,
  ShortArticleStructuredContent,
  StoriesStructuredContent,
  TeaserStructuredContent,
} from "@/types/content-variant";

type ContentVariantEditorProps = {
  variant: ContentVariant;
  sourceDocumentUpdatedAt: string;
  onSave: (variant: ContentVariant) => Promise<void>;
  onBackToParameters: () => void;
  onCreateAnother: () => void;
};

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export function ContentVariantEditor({
  variant,
  sourceDocumentUpdatedAt,
  onSave,
  onBackToParameters,
  onCreateAnother,
}: ContentVariantEditorProps) {
  const [draft, setDraft] = useState<ContentVariant>(variant);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sourceChanged = useMemo(() => {
    return sourceDocumentUpdatedAt !== draft.sourceDocumentUpdatedAt;
  }, [draft.sourceDocumentUpdatedAt, sourceDocumentUpdatedAt]);

  useEffect(() => {
    setDraft(variant);
  }, [variant]);

  const notifyCopy = async (text: string, message: string) => {
    const ok = await copyText(text);
    setCopyMessage(ok ? message : "Impossible de copier.");
    setTimeout(() => setCopyMessage(null), 1800);
  };

  const saveAsDraft = async () => {
    setSaving(true);
    try {
      await onSave({
        ...draft,
        status: "draft",
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  const renderStructured = () => {
    if (draft.type === "publication") {
      const value = draft.structuredContent as PublicationStructuredContent;
      return (
        <div className="variant-structured-grid">
          <label><span>Angle</span><textarea className="document-textarea" value={value.angle} onChange={() => {}} readOnly /></label>
          <label><span>Accroche</span><textarea className="document-textarea" value={value.hook} onChange={() => {}} readOnly /></label>
          <label><span>Texte principal</span><textarea className="document-textarea" value={value.body} onChange={() => {}} readOnly /></label>
          <label><span>CTA</span><input className="document-input" value={value.callToAction} onChange={() => {}} readOnly /></label>
          <label><span>Hashtags</span><textarea className="document-textarea" value={value.hashtags.join("\n")} onChange={() => {}} readOnly /></label>
          <label><span>Idee visuelle</span><textarea className="document-textarea" value={value.visualIdea} onChange={() => {}} readOnly /></label>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.body, "Texte principal copie")}>Copier le texte</button>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.hashtags.join(" "), "Hashtags copies")}>Copier les hashtags</button>
        </div>
      );
    }

    if (draft.type === "carousel") {
      const value = draft.structuredContent as CarouselStructuredContent;
      return (
        <div className="variant-structured-grid">
          <label><span>Couverture</span><textarea className="document-textarea" value={value.cover} onChange={() => {}} readOnly /></label>
          <div className="variant-cards-list">
            {value.slides.map((slide) => (
              <article key={slide.index} className="variant-card-item"><strong>Slide {slide.index}</strong><p>{slide.text}</p></article>
            ))}
          </div>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.slides.map((slide) => `Slide ${slide.index}: ${slide.text}`).join("\n\n"), "Slides copies")}>Copier les slides</button>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.caption, "Legende copiee")}>Copier la legende</button>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.callToAction, "CTA copie")}>Copier le CTA</button>
        </div>
      );
    }

    if (draft.type === "reel") {
      const value = draft.structuredContent as ReelStructuredContent;
      return (
        <div className="variant-structured-grid">
          <label><span>Hook</span><textarea className="document-textarea" value={value.hook} onChange={() => {}} readOnly /></label>
          <label><span>Scenario</span><textarea className="document-textarea" value={value.scenario} onChange={() => {}} readOnly /></label>
          <div className="variant-cards-list">
            {value.scenes.map((scene) => (
              <article key={scene.index} className="variant-card-item"><strong>Plan {scene.index}</strong><p>{scene.shot} - {scene.action}</p></article>
            ))}
          </div>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.scenes.map((scene) => `Plan ${scene.index}: ${scene.shot} - ${scene.action}`).join("\n"), "Script copie")}>Copier le script</button>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.caption, "Legende copiee")}>Copier la legende</button>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.callToAction, "CTA copie")}>Copier le CTA</button>
        </div>
      );
    }

    if (draft.type === "stories") {
      const value = draft.structuredContent as StoriesStructuredContent;
      return (
        <div className="variant-structured-grid">
          <div className="variant-cards-list">
            {value.stories.map((story) => (
              <article key={story.index} className="variant-card-item"><strong>Story {story.index} [{story.type}]</strong><p>{story.content}</p></article>
            ))}
          </div>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.stories.map((story) => `Story ${story.index}: ${story.content}`).join("\n\n"), "Stories copiees")}>Copier les stories</button>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.callToAction, "CTA copie")}>Copier le CTA</button>
        </div>
      );
    }

    if (draft.type === "teaser") {
      const value = draft.structuredContent as TeaserStructuredContent;
      return (
        <div className="variant-structured-grid">
          <label><span>Version courte</span><textarea className="document-textarea" value={value.shortVersion} onChange={() => {}} readOnly /></label>
          <label><span>Version moyenne</span><textarea className="document-textarea" value={value.mediumVersion} onChange={() => {}} readOnly /></label>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.shortVersion, "Version courte copiee")}>Copier version courte</button>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.callToAction, "CTA copie")}>Copier le CTA</button>
        </div>
      );
    }

    if (draft.type === "short_article") {
      const value = draft.structuredContent as ShortArticleStructuredContent;
      return (
        <div className="variant-structured-grid">
          <label><span>Chapo</span><textarea className="document-textarea" value={value.chapo} onChange={() => {}} readOnly /></label>
          <label><span>Corps</span><textarea className="document-textarea" value={value.body} onChange={() => {}} readOnly /></label>
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.body, "Corps copie")}>Copier le corps</button>
        </div>
      );
    }

    if (draft.type === "quote_visual") {
      const value = draft.structuredContent as QuoteVisualStructuredContent;
      return (
        <div className="variant-structured-grid">
          {value.hasQuote ? (
            <>
              <blockquote className="variant-quote">"{value.quote}"</blockquote>
              <p>{value.context}</p>
              <p>{value.sourceSection}</p>
              <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(value.quote || "", "Citation copiee")}>Copier la citation</button>
            </>
          ) : (
            <p>{value.messageIfMissing || "Aucune citation directe exploitable n a ete trouvee dans ce document."}</p>
          )}
        </div>
      );
    }

    return <p>Format structure en preparation.</p>;
  };

  return (
    <section className="document-section variant-editor">
      <header className="document-questions-header">
        <h2>Declinaison: {draft.title}</h2>
        <div className="document-question-actions">
          <button type="button" className="contents-ghost-button" onClick={() => notifyCopy(draft.content, "Contenu copie")}> <Copy size={14} aria-hidden /> Copier tout</button>
          <button type="button" className="contents-ghost-button" onClick={onBackToParameters}>Revenir aux parametres</button>
          <button type="button" className="contents-ghost-button" onClick={onCreateAnother}>Creer une autre declinaison</button>
        </div>
      </header>

      {sourceChanged ? <p className="document-unsaved">Le document source a ete modifie depuis la creation de cette declinaison.</p> : null}

      <label className="document-label" htmlFor="variant-title">Titre</label>
      <input id="variant-title" className="document-input" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />

      <label className="document-label" htmlFor="variant-content">Contenu</label>
      <textarea id="variant-content" className="document-textarea" rows={8} value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} />

      {renderStructured()}

      {copyMessage ? <p className="interview-feedback" role="status">{copyMessage}</p> : null}

      <footer className="document-sidebar-actions">
        <button type="button" className="crm-primary-action" onClick={saveAsDraft} disabled={saving}>
          <Save size={15} aria-hidden /> {saving ? "Enregistrement..." : "Enregistrer comme brouillon"}
        </button>
        <small>Genere le {formatDateTime(draft.generationMetadata.generatedAt)} via {draft.generationMetadata.provider}</small>
      </footer>
    </section>
  );
}
