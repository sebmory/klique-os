"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import type { ArticleDocument } from "@/types/content-document";

type ArticleDocumentEditorProps = {
  initialDocument: ArticleDocument;
  onDocumentChange: (document: ArticleDocument) => void;
  onSave: (document: ArticleDocument) => Promise<void>;
};

type SaveState = {
  saving: boolean;
  error: string | null;
  saved: boolean;
};

const withSequentialSectionOrder = (document: ArticleDocument): ArticleDocument => ({
  ...document,
  updatedAt: new Date().toISOString(),
  sections: {
    ...document.sections,
    sections: document.sections.sections.map((section, index) => ({ ...section, order: index + 1 })),
  },
});

const validateArticleDocument = (document: ArticleDocument): string | null => {
  if (!document.sections.title.trim()) return "Le titre de l article est obligatoire.";
  if (!document.sections.lead.trim()) return "Le chapeau de l article est obligatoire.";
  if (!document.sections.conclusion.trim()) return "La conclusion de l article est obligatoire.";
  if (!document.sections.sections.length) return "L article doit contenir au moins une section.";

  for (const [sectionIndex, section] of document.sections.sections.entries()) {
    if (!section.heading.trim()) return `Le titre de la section ${sectionIndex + 1} est obligatoire.`;
    if (!section.paragraphs.length) return `La section ${sectionIndex + 1} doit contenir au moins un paragraphe.`;
    if (section.paragraphs.some((paragraph) => !paragraph.trim())) {
      return `La section ${sectionIndex + 1} contient un paragraphe vide.`;
    }
  }

  return null;
};

const articleTypeLabels: Record<ArticleDocument["sections"]["articleType"], string> = {
  actualite: "Actualité",
  portrait: "Portrait",
  analyse: "Analyse",
  reportage: "Reportage",
};

const articleLengthLabels: Record<ArticleDocument["sections"]["articleLength"], string> = {
  court: "Court",
  moyen: "Moyen",
  long: "Long",
};

export function ArticleDocumentEditor({ initialDocument, onDocumentChange, onSave }: ArticleDocumentEditorProps) {
  const [document, setDocument] = useState<ArticleDocument>(() => withSequentialSectionOrder(initialDocument));
  const [saveState, setSaveState] = useState<SaveState>({ saving: false, error: null, saved: false });

  useEffect(() => {
    setDocument(withSequentialSectionOrder(initialDocument));
  }, [initialDocument]);

  const updateDocument = (updater: (current: ArticleDocument) => ArticleDocument) => {
    setDocument((current) => {
      const next = withSequentialSectionOrder(updater(current));
      onDocumentChange(next);
      return next;
    });
    setSaveState((current) => ({ ...current, saved: false, error: null }));
  };

  const updateSection = (sectionIndex: number, updater: (section: ArticleDocument["sections"]["sections"][number]) => ArticleDocument["sections"]["sections"][number]) => {
    updateDocument((current) => ({
      ...current,
      sections: {
        ...current.sections,
        sections: current.sections.sections.map((section, index) => index === sectionIndex ? updater(section) : section),
      },
    }));
  };

  const moveSection = (sectionIndex: number, direction: -1 | 1) => {
    updateDocument((current) => {
      const destination = sectionIndex + direction;
      if (destination < 0 || destination >= current.sections.sections.length) return current;
      const sections = [...current.sections.sections];
      [sections[sectionIndex], sections[destination]] = [sections[destination], sections[sectionIndex]];
      return { ...current, sections: { ...current.sections, sections } };
    });
  };

  const save = async () => {
    const validationError = validateArticleDocument(document);
    if (validationError) {
      setSaveState({ saving: false, error: validationError, saved: false });
      return;
    }

    setSaveState({ saving: true, error: null, saved: false });
    try {
      await onSave(document);
      setSaveState({ saving: false, error: null, saved: true });
    } catch (error) {
      setSaveState({ saving: false, error: error instanceof Error ? error.message : "Impossible d enregistrer l article.", saved: false });
    }
  };

  return (
    <section className="creation-assistant-screen" aria-label="Editeur Article">
      <header className="creation-assistant-head">
        <div><h1>Éditeur Article</h1><p>{document.sidebar.subject}</p></div>
        <button type="button" className="crm-primary-action" onClick={() => void save()} disabled={saveState.saving}>
          {saveState.saving ? <Loader2 size={16} className="is-spinning" aria-hidden /> : <Save size={16} aria-hidden />}
          {saveState.saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </header>

      {saveState.error ? <p className="creation-error" role="alert">{saveState.error}</p> : null}
      {saveState.saved ? <p className="creation-muted" role="status">Article enregistré.</p> : null}

      <section className="creation-panel" aria-label="Informations Article">
        <dl className="creation-summary-grid">
          <div><dt>Type</dt><dd>{articleTypeLabels[document.sections.articleType]}</dd></div>
          <div><dt>Longueur</dt><dd>{articleLengthLabels[document.sections.articleLength]}</dd></div>
          <div><dt>Estimation</dt><dd>{`${document.sections.estimatedWordCount} mots`}</dd></div>
          <div><dt>Angle</dt><dd>{document.sections.selectedAngle.title}</dd></div>
          <div><dt>Structure</dt><dd>{document.sections.selectedStructure.title}</dd></div>
        </dl>
        {document.sections.usedCitations.length ? <section><h3>Citations utilisées</h3><ul>{document.sections.usedCitations.map((citation) => <li key={`${citation.text}-${citation.author}`}><q>{citation.text}</q> - {citation.author}, {citation.source}</li>)}</ul></section> : null}
        {document.sections.usedSources.length ? <section><h3>Sources utilisées</h3><ul>{document.sections.usedSources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer noopener">{source.title}</a></li>)}</ul></section> : null}
      </section>

      <section className="creation-panel">
        <label className="creation-inline-field"><span>Titre</span><input value={document.sections.title} onChange={(event) => updateDocument((current) => ({ ...current, sections: { ...current.sections, title: event.target.value } }))} /></label>
        <label className="creation-inline-field"><span>Sous-titre (facultatif)</span><input value={document.sections.subtitle ?? ""} onChange={(event) => updateDocument((current) => ({ ...current, sections: { ...current.sections, subtitle: event.target.value || null } }))} /></label>
        <label className="creation-inline-field"><span>Chapeau</span><textarea className="creation-textarea" value={document.sections.lead} onChange={(event) => updateDocument((current) => ({ ...current, sections: { ...current.sections, lead: event.target.value } }))} /></label>
      </section>

      <section style={{ display: "grid", gap: 14 }}>
        {document.sections.sections.map((section, sectionIndex) => (
          <article key={`${section.order}-${sectionIndex}`} className="creation-panel">
            <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <strong>{`Section ${section.order}`}</strong>
              <span style={{ display: "flex", gap: 6 }}>
                <button type="button" className="contents-ghost-button" onClick={() => moveSection(sectionIndex, -1)} disabled={sectionIndex === 0} aria-label="Déplacer la section vers le haut"><ArrowUp size={16} /></button>
                <button type="button" className="contents-ghost-button" onClick={() => moveSection(sectionIndex, 1)} disabled={sectionIndex === document.sections.sections.length - 1} aria-label="Déplacer la section vers le bas"><ArrowDown size={16} /></button>
                <button type="button" className="contents-ghost-button" onClick={() => updateDocument((current) => ({ ...current, sections: { ...current.sections, sections: current.sections.sections.filter((_, index) => index !== sectionIndex) } }))} aria-label="Supprimer la section"><Trash2 size={16} /></button>
              </span>
            </header>
            <label className="creation-inline-field"><span>Titre de section</span><input value={section.heading} onChange={(event) => updateSection(sectionIndex, (current) => ({ ...current, heading: event.target.value }))} /></label>
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <div key={paragraphIndex} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "start", marginTop: 10 }}>
                <textarea className="creation-textarea" aria-label={`Paragraphe ${paragraphIndex + 1} de ${section.heading || "la section"}`} value={paragraph} onChange={(event) => updateSection(sectionIndex, (current) => ({ ...current, paragraphs: current.paragraphs.map((item, index) => index === paragraphIndex ? event.target.value : item) }))} />
                <button type="button" className="contents-ghost-button" onClick={() => updateSection(sectionIndex, (current) => ({ ...current, paragraphs: current.paragraphs.filter((_, index) => index !== paragraphIndex) }))} aria-label="Supprimer le paragraphe"><Trash2 size={16} /></button>
              </div>
            ))}
            <button type="button" className="contents-secondary-button" style={{ marginTop: 10 }} onClick={() => updateSection(sectionIndex, (current) => ({ ...current, paragraphs: [...current.paragraphs, ""] }))}><Plus size={16} aria-hidden /> Ajouter un paragraphe</button>
          </article>
        ))}
      </section>

      <button type="button" className="contents-secondary-button" style={{ marginTop: 14 }} onClick={() => updateDocument((current) => ({ ...current, sections: { ...current.sections, sections: [...current.sections.sections, { order: current.sections.sections.length + 1, heading: "", paragraphs: [""] }] } }))}><Plus size={16} aria-hidden /> Ajouter une section</button>

      <section className="creation-panel" style={{ marginTop: 14 }}>
        <label className="creation-inline-field"><span>Conclusion</span><textarea className="creation-textarea" value={document.sections.conclusion} onChange={(event) => updateDocument((current) => ({ ...current, sections: { ...current.sections, conclusion: event.target.value } }))} /></label>
      </section>
    </section>
  );
}