"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Lock, MoreHorizontal, PenLine, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import type {
  ContentDocument,
  InterviewDocument,
  InterviewDocumentQuestion,
  PublicationDocument,
  ReelDocument,
} from "@/types/content-document";
import type { ContentVariant } from "@/types/content-variant";
import { ContentVariationComposer } from "@/components/contents/ContentVariationComposer";
import { ContentVariantEditor } from "@/components/contents/ContentVariantEditor";
import { ContentVariantRepositoryService } from "@/services/content-variants/repository";
import type { ContentDocumentDraftSaveResult } from "@/services/content-documents/draft-service";

type ContentDocumentEditorProps = {
  initialDocument: ContentDocument;
  onSaveDraft: (document: ContentDocument) => Promise<ContentDocumentDraftSaveResult>;
  onRegenerateDocument?: () => Promise<ContentDocument>;
};

type SaveState = {
  saving: boolean;
  savedAt: string | null;
  error: string | null;
};

type CopyState = {
  key: string;
  message: string;
};

const STATUS_OPTIONS: Array<{ value: ContentDocument["status"]; label: string }> = [
  { value: "draft", label: "Brouillon" },
  { value: "in_progress", label: "En cours" },
  { value: "final", label: "Finalise" },
  { value: "archived", label: "Archive" },
];

const statusLabel = (status: ContentDocument["status"]): string => {
  if (status === "draft") return "Brouillon";
  if (status === "in_progress") return "En cours";
  if (status === "final") return "Finalise";
  return "Archive";
};

const sourceLabel = (source: "crm" | "temporary"): string => {
  if (source === "crm") return "CRM";
  return "Sujet temporaire";
};

const statusToneClass = (status: ContentDocument["status"]): string => {
  if (status === "draft") return "is-draft";
  if (status === "in_progress") return "is-progress";
  if (status === "final") return "is-final";
  return "is-archived";
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

const stableSerialize = (document: ContentDocument): string => JSON.stringify(document);

const createEmptyQuestion = (index: number): InterviewDocumentQuestion => ({
  id: `manual-${Date.now()}-${index}`,
  text: "",
  purpose: "",
  topic: "",
  followUps: [""],
  locked: false,
  privateNotes: "",
});

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const copyQuestionsText = (document: InterviewDocument): string => {
  return document.sections.questions
    .map((question, index) => {
      const followUps = question.followUps.filter(Boolean);
      const followUpBlock = followUps.length ? `\nRelances:\n${followUps.map((item) => `- ${item}`).join("\n")}` : "";
      return `${index + 1}. ${question.text}\nObjectif: ${question.purpose}${followUpBlock}`;
    })
    .join("\n\n");
};

const copyAllText = (document: InterviewDocument): string => {
  return [
    `Titre: ${document.sections.title}`,
    "",
    "Angle editorial:",
    document.sections.editorialAngle,
    "",
    "Introduction:",
    document.sections.introduction,
    "",
    "Questions:",
    copyQuestionsText(document),
    "",
    "Conclusion:",
    document.sections.conclusion,
  ].join("\n");
};

const copyPublicationText = (document: PublicationDocument): string => {
  const lines = [
    `Titre: ${document.sections.title}`,
    "",
    "Angle editorial:",
    document.sections.editorialAngle,
    "",
    "Accroche:",
    document.sections.hook,
    "",
    "Texte:",
    document.sections.text,
  ];

  if (document.sections.cta.trim()) {
    lines.push("", "CTA:", document.sections.cta);
  }

  if (document.sections.hashtags.length > 0) {
    lines.push("", "Hashtags:", document.sections.hashtags.join(" "));
  }

  lines.push(
    "",
    "Suggestion visuelle:",
    document.sections.visualSuggestion,
  );

  return lines.join("\n");
};

const copyReelText = (document: ReelDocument): string => {
  const sceneLines = document.sections.scenes.flatMap((scene) => [
    `Scene ${scene.order} (${scene.durationSeconds}s)`,
    `- Role: ${scene.role || "-"}`,
    `- Plan: ${scene.shotPlan}`,
    `- Action: ${scene.action}`,
    `- Texte ecran: ${scene.onScreenText}`,
    `- Voix off/dialogue: ${scene.voiceOver || "-"}`,
    `- B-roll: ${scene.bRoll}`,
    `- Transition: ${scene.transition}`,
    `- Ambiance/musique: ${scene.ambianceMusic}`,
    `- Direction: ${scene.direction || "-"}`,
    "",
  ]);

  const lines = [
    `Titre: ${document.sections.title}`,
    "",
    "Angle editorial:",
    document.sections.editorialAngle,
    "",
    "Hook:",
    document.sections.hook,
    "",
    "Concept:",
    document.sections.concept,
    "",
    "Scenes:",
    ...sceneLines,
  ];

  if (document.sections.cta.trim()) {
    lines.push("", "CTA:", document.sections.cta);
  }

  lines.push("", "Legende:", document.sections.caption);

  if (document.sections.hashtags.length > 0) {
    lines.push("", "Hashtags:", document.sections.hashtags.join(" "));
  }

  lines.push("", "Cover:", document.sections.coverIdea);
  return lines.join("\n");
};

const withUpdatedTimestamp = <T extends ContentDocument>(document: T): T => {
  return {
    ...document,
    updatedAt: new Date().toISOString(),
  };
};

export function ContentDocumentEditor({ initialDocument, onSaveDraft, onRegenerateDocument }: ContentDocumentEditorProps) {
  const [document, setDocument] = useState<ContentDocument>(initialDocument);
  const [isEditing, setIsEditing] = useState(false);
  const [baselineSnapshot, setBaselineSnapshot] = useState(stableSerialize(initialDocument));
  const [saveState, setSaveState] = useState<SaveState>({ saving: false, savedAt: null, error: null });
  const [copyState, setCopyState] = useState<CopyState | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [openedNotes, setOpenedNotes] = useState<Record<string, boolean>>({});
  const [activeQuestionEditorId, setActiveQuestionEditorId] = useState<string | null>(null);
  const [showContextDetails, setShowContextDetails] = useState(false);
  const [variants, setVariants] = useState<ContentVariant[]>([]);
  const [showVariationComposer, setShowVariationComposer] = useState(false);
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);

  const interviewDocument = document.type === "interview" ? document : null;
  const publicationDocument = document.type === "publication" ? document : null;
  const reelDocument = document.type === "reel" ? document : null;

  const hasUnsavedChanges = stableSerialize(document) !== baselineSnapshot;
  const selectedContextItems = interviewDocument?.contextUsage.selectedItems ?? [];
  const activeVariant = variants.find((item) => item.id === activeVariantId) ?? null;

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    let cancelled = false;

    const loadVariants = async () => {
      const items = await ContentVariantRepositoryService.listBySourceDocument(document.id);
      if (cancelled) return;
      setVariants(items);
    };

    void loadVariants();

    return () => {
      cancelled = true;
    };
  }, [document.id]);

  const setInterviewDocument = (updater: (current: InterviewDocument) => InterviewDocument) => {
    setDocument((current) => {
      if (current.type !== "interview") return current;
      return withUpdatedTimestamp(updater(current));
    });
  };

  const setPublicationDocument = (updater: (current: PublicationDocument) => PublicationDocument) => {
    setDocument((current) => {
      if (current.type !== "publication") return current;
      return withUpdatedTimestamp(updater(current));
    });
  };

  const setReelDocument = (updater: (current: ReelDocument) => ReelDocument) => {
    setDocument((current) => {
      if (current.type !== "reel") return current;
      return withUpdatedTimestamp(updater(current));
    });
  };

  const updateStatus = (status: ContentDocument["status"]) => {
    setDocument((current) => {
      if (current.type === "interview") {
        return withUpdatedTimestamp({
          ...current,
          status,
        });
      }
      if (current.type === "publication") {
        return withUpdatedTimestamp({
          ...current,
          status,
        });
      }
      if (current.type === "reel") {
        return withUpdatedTimestamp({
          ...current,
          status,
        });
      }
      return current;
    });
  };

  const updateField = (field: "title" | "editorialAngle" | "introduction" | "conclusion", value: string) => {
    setInterviewDocument((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [field]: value,
      },
    }));
  };

  const updatePublicationField = (
    field: "title" | "editorialAngle" | "hook" | "text" | "cta" | "visualSuggestion" | "editorialNote",
    value: string
  ) => {
    setPublicationDocument((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [field]: value,
      },
    }));
  };

  const updateReelField = (
    field: "title" | "editorialAngle" | "hook" | "concept" | "cta" | "caption" | "coverIdea",
    value: string
  ) => {
    setReelDocument((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [field]: value,
      },
    }));
  };

  const updateReelSceneField = (
    sceneId: string,
    field: "durationSeconds" | "role" | "shotPlan" | "action" | "onScreenText" | "voiceOver" | "bRoll" | "transition" | "ambianceMusic" | "direction",
    value: string
  ) => {
    setReelDocument((current) => ({
      ...current,
      sections: {
        ...current.sections,
        scenes: current.sections.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          if (field === "durationSeconds") {
            const parsed = Number(value);
            return {
              ...scene,
              durationSeconds: Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : scene.durationSeconds,
            };
          }
          if (field === "direction") {
            const next = value.trim();
            return {
              ...scene,
              direction: next || undefined,
            };
          }
          return {
            ...scene,
            [field]: value,
          };
        }),
      },
    }));
  };

  const updateQuestion = (questionId: string, updater: (question: InterviewDocumentQuestion) => InterviewDocumentQuestion) => {
    setInterviewDocument((current) => ({
      ...current,
      sections: {
        ...current.sections,
        questions: current.sections.questions.map((question) => (question.id === questionId ? updater(question) : question)),
      },
    }));
  };

  const addQuestion = (targetIndex: number) => {
    setInterviewDocument((current) => {
      const next = [...current.sections.questions];
      next.splice(targetIndex, 0, createEmptyQuestion(targetIndex));
      return {
        ...current,
        sections: {
          ...current.sections,
          questions: next,
        },
      };
    });
  };

  const removeQuestion = (questionId: string) => {
    setInterviewDocument((current) => ({
      ...current,
      sections: {
        ...current.sections,
        questions: current.sections.questions.filter((question) => question.id !== questionId),
      },
    }));
  };

  const focusQuestionEditor = (questionId: string) => {
    const target = window.document.getElementById(`question-text-${questionId}`) as HTMLTextAreaElement | null;
    if (!target) return;
    target.focus();
    target.select();
  };

  const updateFollowUp = (questionId: string, followUpIndex: number, value: string) => {
    updateQuestion(questionId, (current) => ({
      ...current,
      followUps: current.followUps.map((item, index) => (index === followUpIndex ? value : item)),
    }));
  };

  const addFollowUp = (questionId: string) => {
    updateQuestion(questionId, (current) => ({
      ...current,
      followUps: [...current.followUps, ""],
    }));
  };

  const removeFollowUp = (questionId: string, followUpIndex: number) => {
    updateQuestion(questionId, (current) => {
      const next = current.followUps.filter((_, index) => index !== followUpIndex);
      return {
        ...current,
        followUps: next.length ? next : [""],
      };
    });
  };

  const copyToClipboard = async (key: string, text: string, successMessage: string) => {
    const ok = await copyText(text);
    setCopyState({ key, message: ok ? successMessage : "Impossible de copier le contenu." });
    setTimeout(() => {
      setCopyState((state) => (state?.key === key ? null : state));
    }, 1800);
  };

  const saveDraft = async () => {
    setSaveState({ saving: true, savedAt: saveState.savedAt, error: null });
    try {
      const result = await onSaveDraft(document);
      setBaselineSnapshot(stableSerialize(document));
      const cloudError =
        result.cloud.status === "conflict"
          ? result.cloud.message || "Conflit de version cloud detecte."
          : result.cloud.status === "unavailable"
            ? result.cloud.message || "Synchronisation cloud indisponible."
            : null;

      setSaveState({
        saving: false,
        savedAt: new Date().toISOString(),
        error: cloudError,
      });
    } catch {
      setSaveState({ saving: false, savedAt: saveState.savedAt, error: "Impossible d enregistrer le brouillon." });
    }
  };

  const regenerateDocument = async () => {
    if (!onRegenerateDocument || regenerating) return;
    setRegenerating(true);
    setSaveState((state) => ({ ...state, error: null }));
    try {
      const next = await onRegenerateDocument();
      setDocument(next);
      setBaselineSnapshot(stableSerialize(next));
    } catch {
      setSaveState((state) => ({ ...state, error: "Impossible de regenerer le document." }));
    } finally {
      setRegenerating(false);
    }
  };

  const saveVariant = async (variant: ContentVariant) => {
    await ContentVariantRepositoryService.save(variant);
    setVariants((current) => {
      const index = current.findIndex((item) => item.id === variant.id);
      if (index < 0) return [variant, ...current];
      const next = [...current];
      next[index] = variant;
      return next;
    });
    setActiveVariantId(variant.id);
  };

  const handleVariantCreated = async (variant: ContentVariant) => {
    await saveVariant(variant);
    setShowVariationComposer(false);
  };

  if (!interviewDocument && !publicationDocument && !reelDocument) {
    return null;
  }

  if (reelDocument) {
    return (
      <section className="document-editor" aria-label="Editeur de document">
        <header className="document-editor-hero">
          <div className="document-hero-main">
            <div className="document-editor-kicker-row">
              <p className="document-editor-kicker">REEL</p>
              <span className={`document-status-chip ${statusToneClass(reelDocument.status)}`}>{statusLabel(reelDocument.status)}</span>
              <span className="document-mode-chip">Mode: {isEditing ? "Edition" : "Lecture"}</span>
            </div>
            <div className="document-title-wrap">
              {isEditing ? (
                <input
                  id="document-title"
                  className="document-title-input"
                  value={reelDocument.sections.title}
                  onChange={(event) => updateReelField("title", event.target.value)}
                  aria-label="Titre du document"
                />
              ) : (
                <h1>{reelDocument.sections.title || "Sans titre"}</h1>
              )}
            </div>
            <div className="document-editor-meta-row">
              <span>Sujet: {reelDocument.sidebar.subject}</span>
              <span>Cree le: {formatDateTime(reelDocument.createdAt)}</span>
              <span>Derniere modification: {formatDateTime(reelDocument.updatedAt)}</span>
              <span>{hasUnsavedChanges ? "Modifications non enregistrees" : "Enregistre"}</span>
            </div>
          </div>

          <div className="document-editor-actions-bar" aria-label="Actions principales du document">
            {isEditing ? (
              <button type="button" className="crm-primary-action" onClick={saveDraft} disabled={saveState.saving}>
                <Save size={15} aria-hidden /> {saveState.saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            ) : (
              <button type="button" className="crm-primary-action" onClick={() => setIsEditing(true)}>
                <PenLine size={15} aria-hidden /> Modifier
              </button>
            )}

            <button
              type="button"
              className="contents-secondary-button"
              onClick={() => copyToClipboard("copy-reel", copyReelText(reelDocument), "Reel copie")}
            >
              <Copy size={15} aria-hidden /> Copier
            </button>

            {isEditing ? (
              <button type="button" className="contents-ghost-button" onClick={() => setIsEditing(false)}>
                Terminer l edition
              </button>
            ) : null}
          </div>
        </header>

        {copyState ? (
          <p className="interview-feedback" role="status">
            <Check size={14} aria-hidden /> {copyState.message}
          </p>
        ) : null}

        <div className="document-editor-layout">
          <main className="document-main" aria-label="Document editorial">
            <section className="document-section document-prose-section">
              <h2>Angle editorial</h2>
              {isEditing ? (
                <textarea className="document-prose-editor" rows={3} value={reelDocument.sections.editorialAngle} onChange={(event) => updateReelField("editorialAngle", event.target.value)} />
              ) : (
                <p>{reelDocument.sections.editorialAngle || "Aucun angle editorial"}</p>
              )}
            </section>

            <section className="document-section document-prose-section">
              <h2>Hook</h2>
              {isEditing ? (
                <textarea className="document-prose-editor" rows={3} value={reelDocument.sections.hook} onChange={(event) => updateReelField("hook", event.target.value)} />
              ) : (
                <p>{reelDocument.sections.hook || "Aucun hook"}</p>
              )}
            </section>

            <section className="document-section document-prose-section">
              <h2>Concept</h2>
              {isEditing ? (
                <textarea className="document-prose-editor" rows={4} value={reelDocument.sections.concept} onChange={(event) => updateReelField("concept", event.target.value)} />
              ) : (
                <p>{reelDocument.sections.concept || "Aucun concept"}</p>
              )}
            </section>

            <section className="document-section document-prose-section">
              <h2>Deroule scene par scene</h2>
              <div>
                {reelDocument.sections.scenes.map((scene) => (
                  <article key={scene.id} className="document-section document-prose-section">
                    <h3>{`Scene ${scene.order}`}</h3>
                    <div className="creation-fields-grid">
                      <label>
                        <span>Duree (s)</span>
                        {isEditing ? (
                          <input
                            type="number"
                            min={1}
                            value={scene.durationSeconds}
                            onChange={(event) => updateReelSceneField(scene.id, "durationSeconds", event.target.value)}
                          />
                        ) : (
                          <p>{scene.durationSeconds}</p>
                        )}
                      </label>

                      <label>
                        <span>Role</span>
                        {isEditing ? (
                          <input type="text" value={scene.role} onChange={(event) => updateReelSceneField(scene.id, "role", event.target.value)} />
                        ) : (
                          <p>{scene.role || "-"}</p>
                        )}
                      </label>
                    </div>

                    <label className="creation-inline-field">
                      <span>Plan</span>
                      {isEditing ? (
                        <textarea className="document-prose-editor" rows={2} value={scene.shotPlan} onChange={(event) => updateReelSceneField(scene.id, "shotPlan", event.target.value)} />
                      ) : (
                        <p>{scene.shotPlan || "-"}</p>
                      )}
                    </label>

                    <label className="creation-inline-field">
                      <span>Action</span>
                      {isEditing ? (
                        <textarea className="document-prose-editor" rows={2} value={scene.action} onChange={(event) => updateReelSceneField(scene.id, "action", event.target.value)} />
                      ) : (
                        <p>{scene.action || "-"}</p>
                      )}
                    </label>

                    <label className="creation-inline-field">
                      <span>Texte ecran</span>
                      {isEditing ? (
                        <textarea className="document-prose-editor" rows={2} value={scene.onScreenText} onChange={(event) => updateReelSceneField(scene.id, "onScreenText", event.target.value)} />
                      ) : (
                        <p>{scene.onScreenText || "-"}</p>
                      )}
                    </label>

                    <label className="creation-inline-field">
                      <span>Voix off / dialogue</span>
                      {isEditing ? (
                        <textarea className="document-prose-editor" rows={2} value={scene.voiceOver} onChange={(event) => updateReelSceneField(scene.id, "voiceOver", event.target.value)} />
                      ) : (
                        <p>{scene.voiceOver || "-"}</p>
                      )}
                    </label>

                    <label className="creation-inline-field">
                      <span>B-roll</span>
                      {isEditing ? (
                        <textarea className="document-prose-editor" rows={2} value={scene.bRoll} onChange={(event) => updateReelSceneField(scene.id, "bRoll", event.target.value)} />
                      ) : (
                        <p>{scene.bRoll || "-"}</p>
                      )}
                    </label>

                    <label className="creation-inline-field">
                      <span>Transition</span>
                      {isEditing ? (
                        <textarea className="document-prose-editor" rows={2} value={scene.transition} onChange={(event) => updateReelSceneField(scene.id, "transition", event.target.value)} />
                      ) : (
                        <p>{scene.transition || "-"}</p>
                      )}
                    </label>

                    <label className="creation-inline-field">
                      <span>Ambiance</span>
                      {isEditing ? (
                        <textarea className="document-prose-editor" rows={2} value={scene.ambianceMusic} onChange={(event) => updateReelSceneField(scene.id, "ambianceMusic", event.target.value)} />
                      ) : (
                        <p>{scene.ambianceMusic || "-"}</p>
                      )}
                    </label>

                    <label className="creation-inline-field">
                      <span>Direction (optionnel)</span>
                      {isEditing ? (
                        <textarea className="document-prose-editor" rows={2} value={scene.direction || ""} onChange={(event) => updateReelSceneField(scene.id, "direction", event.target.value)} />
                      ) : (
                        <p>{scene.direction || "-"}</p>
                      )}
                    </label>
                  </article>
                ))}
              </div>
            </section>

            <section className="document-section document-prose-section">
              <h2>Legende</h2>
              {isEditing ? (
                <textarea className="document-prose-editor" rows={4} value={reelDocument.sections.caption} onChange={(event) => updateReelField("caption", event.target.value)} />
              ) : (
                <p>{reelDocument.sections.caption || "Aucune legende"}</p>
              )}
            </section>

            {isEditing || reelDocument.sections.cta.trim() ? (
              <section className="document-section document-prose-section">
                <h2>CTA</h2>
                {isEditing ? (
                  <textarea className="document-prose-editor" rows={3} value={reelDocument.sections.cta} onChange={(event) => updateReelField("cta", event.target.value)} />
                ) : (
                  <p>{reelDocument.sections.cta}</p>
                )}
              </section>
            ) : null}

            {isEditing || reelDocument.sections.hashtags.length > 0 ? (
              <section className="document-section document-prose-section">
                <h2>Hashtags</h2>
                {isEditing ? (
                  <textarea
                    className="document-prose-editor"
                    rows={2}
                    value={reelDocument.sections.hashtags.join(" ")}
                    onChange={(event) =>
                      setReelDocument((current) => ({
                        ...current,
                        sections: {
                          ...current.sections,
                          hashtags: event.target.value.split(/\s+/).map((item) => item.trim()).filter(Boolean),
                        },
                      }))
                    }
                  />
                ) : (
                  <p>{reelDocument.sections.hashtags.join(" ")}</p>
                )}
              </section>
            ) : null}

            <section className="document-section document-prose-section">
              <h2>Idee de cover</h2>
              {isEditing ? (
                <textarea className="document-prose-editor" rows={4} value={reelDocument.sections.coverIdea} onChange={(event) => updateReelField("coverIdea", event.target.value)} />
              ) : (
                <p>{reelDocument.sections.coverIdea || "Aucune idee de cover"}</p>
              )}
            </section>
          </main>

          <aside className="document-sidebar" aria-label="Informations et contexte">
            <section className="document-sidebar-group">
              <h3>Sujet</h3>
              <div className="document-sidebar-subject-row">
                <span className="document-sidebar-avatar">{(reelDocument.sidebar.subject || "--").slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{reelDocument.sidebar.subject}</strong>
                  <p>{sourceLabel(reelDocument.sidebar.source)}</p>
                </div>
              </div>
            </section>

            <section className="document-sidebar-group">
              <h3>Parametres editoriaux</h3>
              <dl className="document-sidebar-rows">
                <div><dt>Objectif</dt><dd>{reelDocument.sidebar.objective}</dd></div>
                <div><dt>Ton</dt><dd>{reelDocument.sidebar.tone}</dd></div>
                <div><dt>Audience</dt><dd>{reelDocument.sidebar.audience}</dd></div>
                <div><dt>Plateforme</dt><dd>{reelDocument.sidebar.platform || "instagram"}</dd></div>
                <div><dt>Duree</dt><dd>{reelDocument.sidebar.length || "30s"}</dd></div>
                <div><dt>Format</dt><dd>{reelDocument.sidebar.format || "face_camera"}</dd></div>
              </dl>
            </section>

            <section className="document-sidebar-group">
              <h3>Generation</h3>
              <dl className="document-sidebar-rows">
                <div><dt>Provider</dt><dd>{reelDocument.sidebar.provider}</dd></div>
                <div><dt>Modele</dt><dd>{reelDocument.sidebar.model}</dd></div>
                <div><dt>Date</dt><dd>{formatDateTime(reelDocument.sidebar.generatedAt)}</dd></div>
                <div><dt>Version</dt><dd>{reelDocument.metadata.templateVersion}</dd></div>
              </dl>
            </section>

            <section className="document-sidebar-group">
              <h3>Etat du document</h3>
              <div className="document-status-picker" role="group" aria-label="Statut du document">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={reelDocument.status === option.value ? "document-status-option is-active" : "document-status-option"}
                    onClick={() => updateStatus(option.value)}
                    disabled={!isEditing}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {hasUnsavedChanges ? <p className="document-unsaved">Modifications non enregistrees</p> : <p className="document-saved">Enregistre</p>}
              {saveState.savedAt ? <p className="document-saved-at">Dernier enregistrement: {formatDateTime(saveState.savedAt)}</p> : null}
              {saveState.error ? <p className="document-save-error" role="alert">{saveState.error}</p> : null}
            </section>
          </aside>
        </div>
      </section>
    );
  }

  if (publicationDocument) {
    return (
      <section className="document-editor" aria-label="Editeur de document">
        <header className="document-editor-hero">
          <div className="document-hero-main">
            <div className="document-editor-kicker-row">
              <p className="document-editor-kicker">PUBLICATION</p>
              <span className={`document-status-chip ${statusToneClass(publicationDocument.status)}`}>{statusLabel(publicationDocument.status)}</span>
              <span className="document-mode-chip">Mode: {isEditing ? "Edition" : "Lecture"}</span>
            </div>
            <div className="document-title-wrap">
              {isEditing ? (
                <input
                  id="document-title"
                  className="document-title-input"
                  value={publicationDocument.sections.title}
                  onChange={(event) => updatePublicationField("title", event.target.value)}
                  aria-label="Titre du document"
                />
              ) : (
                <h1>{publicationDocument.sections.title || "Sans titre"}</h1>
              )}
            </div>
            <div className="document-editor-meta-row">
              <span>Sujet: {publicationDocument.sidebar.subject}</span>
              <span>Cree le: {formatDateTime(publicationDocument.createdAt)}</span>
              <span>Derniere modification: {formatDateTime(publicationDocument.updatedAt)}</span>
              <span>{hasUnsavedChanges ? "Modifications non enregistrees" : "Enregistre"}</span>
            </div>
          </div>

          <div className="document-editor-actions-bar" aria-label="Actions principales du document">
            {isEditing ? (
              <button type="button" className="crm-primary-action" onClick={saveDraft} disabled={saveState.saving}>
                <Save size={15} aria-hidden /> {saveState.saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            ) : (
              <button type="button" className="crm-primary-action" onClick={() => setIsEditing(true)}>
                <PenLine size={15} aria-hidden /> Modifier
              </button>
            )}

            <button
              type="button"
              className="contents-secondary-button"
              onClick={() => copyToClipboard("copy-publication", copyPublicationText(publicationDocument), "Publication copiee")}
            >
              <Copy size={15} aria-hidden /> Copier
            </button>

            {isEditing ? (
              <button type="button" className="contents-ghost-button" onClick={() => setIsEditing(false)}>
                Terminer l edition
              </button>
            ) : null}

            {isEditing && onRegenerateDocument ? (
              <button
                type="button"
                className="contents-ghost-button"
                onClick={regenerateDocument}
                disabled={regenerating}
              >
                <Sparkles size={14} aria-hidden /> {regenerating ? "Generation..." : "IA"}
              </button>
            ) : null}
          </div>
        </header>

        {copyState ? (
          <p className="interview-feedback" role="status">
            <Check size={14} aria-hidden /> {copyState.message}
          </p>
        ) : null}

        <div className="document-editor-layout">
          <main className="document-main" aria-label="Document editorial">
            <section className="document-section document-prose-section">
              <h2>Angle editorial</h2>
              {isEditing ? (
                <textarea
                  className="document-prose-editor"
                  rows={3}
                  value={publicationDocument.sections.editorialAngle}
                  onChange={(event) => updatePublicationField("editorialAngle", event.target.value)}
                />
              ) : (
                <p className="document-angle-read">{publicationDocument.sections.editorialAngle || "Aucun angle editorial"}</p>
              )}
            </section>

            <section className="document-section document-prose-section">
              <h2>Accroche</h2>
              {isEditing ? (
                <textarea className="document-prose-editor" rows={3} value={publicationDocument.sections.hook} onChange={(event) => updatePublicationField("hook", event.target.value)} />
              ) : (
                <p>{publicationDocument.sections.hook || "Aucune accroche"}</p>
              )}
            </section>

            <section className="document-section document-prose-section">
              <h2>Texte</h2>
              {isEditing ? (
                <textarea className="document-prose-editor" rows={8} value={publicationDocument.sections.text} onChange={(event) => updatePublicationField("text", event.target.value)} />
              ) : (
                <p>{publicationDocument.sections.text || "Aucun texte"}</p>
              )}
            </section>

            {isEditing || publicationDocument.sections.cta.trim() ? (
              <section className="document-section document-prose-section">
                <h2>CTA</h2>
                {isEditing ? (
                  <textarea className="document-prose-editor" rows={3} value={publicationDocument.sections.cta} onChange={(event) => updatePublicationField("cta", event.target.value)} />
                ) : (
                  <p>{publicationDocument.sections.cta}</p>
                )}
              </section>
            ) : null}

            {isEditing || publicationDocument.sections.hashtags.length > 0 ? (
              <section className="document-section document-prose-section">
                <h2>Hashtags</h2>
                {isEditing ? (
                  <textarea
                    className="document-prose-editor"
                    rows={2}
                    value={publicationDocument.sections.hashtags.join(" ")}
                    onChange={(event) =>
                      setPublicationDocument((current) => ({
                        ...current,
                        sections: {
                          ...current.sections,
                          hashtags: event.target.value.split(/\s+/).map((item) => item.trim()).filter(Boolean),
                        },
                      }))
                    }
                  />
                ) : (
                  <p>{publicationDocument.sections.hashtags.join(" ")}</p>
                )}
              </section>
            ) : null}

            <section className="document-section document-prose-section">
              <h2>Suggestion visuelle</h2>
              {isEditing ? (
                <textarea className="document-prose-editor" rows={4} value={publicationDocument.sections.visualSuggestion} onChange={(event) => updatePublicationField("visualSuggestion", event.target.value)} />
              ) : (
                <p>{publicationDocument.sections.visualSuggestion || "Aucune suggestion"}</p>
              )}
            </section>

            {isEditing ? (
              <section className="document-section document-prose-section" hidden aria-hidden="true">
                <h2>Note editoriale</h2>
                <textarea className="document-prose-editor" rows={4} value={publicationDocument.sections.editorialNote} onChange={(event) => updatePublicationField("editorialNote", event.target.value)} />
              </section>
            ) : null}
          </main>

          <aside className="document-sidebar" aria-label="Informations et contexte">
            <section className="document-sidebar-group">
              <h3>Sujet</h3>
              <div className="document-sidebar-subject-row">
                <span className="document-sidebar-avatar">{(publicationDocument.sidebar.subject || "--").slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{publicationDocument.sidebar.subject}</strong>
                  <p>{sourceLabel(publicationDocument.sidebar.source)}</p>
                </div>
              </div>
            </section>

            <section className="document-sidebar-group">
              <h3>Parametres editoriaux</h3>
              <dl className="document-sidebar-rows">
                <div><dt>Objectif</dt><dd>{publicationDocument.sidebar.objective}</dd></div>
                <div><dt>Ton</dt><dd>{publicationDocument.sidebar.tone}</dd></div>
                <div><dt>Audience</dt><dd>{publicationDocument.sidebar.audience}</dd></div>
                <div><dt>Plateforme</dt><dd>{publicationDocument.sidebar.platform || publicationDocument.sidebar.format}</dd></div>
                <div><dt>Longueur</dt><dd>{publicationDocument.sidebar.length || "medium"}</dd></div>
              </dl>
            </section>

            <section className="document-sidebar-group">
              <h3>Generation</h3>
              <dl className="document-sidebar-rows">
                <div><dt>Provider</dt><dd>{publicationDocument.sidebar.provider}</dd></div>
                <div><dt>Modele</dt><dd>{publicationDocument.sidebar.model}</dd></div>
                <div><dt>Date</dt><dd>{formatDateTime(publicationDocument.sidebar.generatedAt)}</dd></div>
                <div><dt>Version</dt><dd>{publicationDocument.metadata.templateVersion}</dd></div>
              </dl>
            </section>

            <section className="document-sidebar-group">
              <h3>Etat du document</h3>
              <div className="document-status-picker" role="group" aria-label="Statut du document">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={publicationDocument.status === option.value ? "document-status-option is-active" : "document-status-option"}
                    onClick={() => updateStatus(option.value)}
                    disabled={!isEditing}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {hasUnsavedChanges ? <p className="document-unsaved">Modifications non enregistrees</p> : <p className="document-saved">Enregistre</p>}
              {saveState.savedAt ? <p className="document-saved-at">Dernier enregistrement: {formatDateTime(saveState.savedAt)}</p> : null}
              {saveState.error ? <p className="document-save-error" role="alert">{saveState.error}</p> : null}
            </section>
          </aside>
        </div>
      </section>
    );
  }

  if (!interviewDocument) {
    return null;
  }

  return (
    <section className="document-editor" aria-label="Editeur de document">
      <header className="document-editor-hero">
        <div className="document-hero-main">
          <div className="document-editor-kicker-row">
            <p className="document-editor-kicker">INTERVIEW</p>
            <span className={`document-status-chip ${statusToneClass(interviewDocument.status)}`}>{statusLabel(interviewDocument.status)}</span>
            <span className="document-mode-chip">Mode: {isEditing ? "Edition" : "Lecture"}</span>
          </div>

          <div className="document-title-wrap">
            {isEditing ? (
              <input
                id="document-title"
                className="document-title-input"
                value={interviewDocument.sections.title}
                onChange={(event) => updateField("title", event.target.value)}
                aria-label="Titre du document"
              />
            ) : (
              <h1>{interviewDocument.sections.title || "Sans titre"}</h1>
            )}
          </div>

          <div className="document-editor-meta-row">
            <span>Sujet: {interviewDocument.sidebar.subject}</span>
            <span>Cree le: {formatDateTime(interviewDocument.createdAt)}</span>
            <span>Derniere modification: {formatDateTime(interviewDocument.updatedAt)}</span>
            <span>{hasUnsavedChanges ? "Modifications non enregistrees" : "Enregistre"}</span>
          </div>
        </div>

        <div className="document-editor-actions-bar" aria-label="Actions principales du document">
          {isEditing ? (
            <button type="button" className="crm-primary-action" onClick={saveDraft} disabled={saveState.saving}>
              <Save size={15} aria-hidden /> {saveState.saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          ) : (
            <button type="button" className="crm-primary-action" onClick={() => setIsEditing(true)}>
              <PenLine size={15} aria-hidden /> Modifier
            </button>
          )}

          <button
            type="button"
            className="contents-secondary-button"
            onClick={() => copyToClipboard("copy-all", copyAllText(interviewDocument), "Document copie")}
          >
            <Copy size={15} aria-hidden /> Copier
          </button>

          {isEditing ? (
            <button type="button" className="contents-ghost-button" onClick={() => setIsEditing(false)}>
              Terminer l edition
            </button>
          ) : null}

          <details className="document-inline-menu">
            <summary className="contents-ghost-button">
              <MoreHorizontal size={15} aria-hidden /> Plus
            </summary>
            <div className="document-inline-menu-panel">
              <button
                type="button"
                className="contents-ghost-button"
                onClick={() => copyToClipboard("copy-questions", copyQuestionsText(interviewDocument), "Questions copiees")}
              >
                Copier les questions
              </button>
              <button
                type="button"
                className="contents-ghost-button"
                onClick={() => copyToClipboard("copy-title", interviewDocument.sections.title, "Titre copie")}
              >
                Copier le titre
              </button>
              <button
                type="button"
                className="contents-ghost-button"
                onClick={() => copyToClipboard("copy-introduction", interviewDocument.sections.introduction, "Introduction copiee")}
              >
                Copier l introduction
              </button>
              <button
                type="button"
                className="contents-ghost-button"
                onClick={() => copyToClipboard("duplicate", copyAllText(interviewDocument), "Contenu duplique dans le presse-papiers")}
              >
                Dupliquer
              </button>
              <button type="button" className="contents-ghost-button" onClick={() => updateStatus("archived")}>Archiver</button>
            </div>
          </details>

          {isEditing && onRegenerateDocument ? (
            <button
              type="button"
              className="contents-ghost-button"
              onClick={regenerateDocument}
              disabled={regenerating}
            >
              <Sparkles size={14} aria-hidden /> {regenerating ? "Generation..." : "IA"}
            </button>
          ) : null}

          {!isEditing ? (
            <button type="button" className="contents-ghost-button" onClick={() => setIsEditing(true)}>
              Modifier
            </button>
          ) : null}

        </div>
      </header>

      {copyState ? (
        <p className="interview-feedback" role="status">
          <Check size={14} aria-hidden /> {copyState.message}
        </p>
      ) : null}

      <div className="document-editor-layout">
        <main className="document-main" aria-label="Document editorial">
          <section className="document-section document-prose-section" aria-labelledby="document-angle-title">
            <h2 id="document-angle-title">Angle editorial</h2>
            {isEditing ? (
              <textarea
                id="document-angle"
                className="document-prose-editor"
                rows={3}
                value={interviewDocument.sections.editorialAngle}
                onChange={(event) => updateField("editorialAngle", event.target.value)}
              />
            ) : (
              <p className="document-angle-read">{interviewDocument.sections.editorialAngle || "Aucun angle editorial"}</p>
            )}
          </section>

          <section className="document-section document-prose-section" aria-labelledby="document-intro-title">
            <h2 id="document-intro-title">Introduction</h2>
            {isEditing ? (
              <textarea
                id="document-intro"
                className="document-prose-editor document-intro-editor"
                rows={4}
                value={interviewDocument.sections.introduction}
                onChange={(event) => updateField("introduction", event.target.value)}
              />
            ) : (
              <p className="document-intro-read">{interviewDocument.sections.introduction || "Aucune introduction"}</p>
            )}
          </section>

          <section className="document-section document-questions-section" aria-labelledby="document-questions-title">
            <div className="document-questions-header">
              <h2 id="document-questions-title">Questions</h2>
              {isEditing ? (
                <button
                  type="button"
                  className="contents-secondary-button"
                  onClick={() => addQuestion(interviewDocument.sections.questions.length)}
                >
                  <Plus size={15} aria-hidden /> Ajouter une question
                </button>
              ) : null}
            </div>

            <div className="document-question-list">
              {interviewDocument.sections.questions.map((question, index) => {
                const hasPrivateNote = Boolean(question.privateNotes.trim());

                return (
                  <article key={question.id} className="document-question-card">
                    <header className="document-question-card-header">
                      <div className="document-question-index-wrap">
                        <span className="document-question-number">{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <p className="document-question-topic">{question.topic || "Theme libre"}</p>
                          {question.locked ? <span className="document-lock-chip"><Lock size={13} aria-hidden /> Verrouillee</span> : null}
                        </div>
                      </div>

                      <div className="document-question-actions-compact">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="contents-ghost-button"
                              onClick={() => {
                                setActiveQuestionEditorId(question.id);
                                focusQuestionEditor(question.id);
                              }}
                            >
                              Modifier
                            </button>
                            <button type="button" className="contents-ghost-button" disabled title="Disponible dans un prochain sprint">
                              <Sparkles size={14} aria-hidden /> IA
                            </button>
                          </>
                        ) : null}

                        <details className="document-inline-menu">
                          <summary className="contents-ghost-button" aria-label={`Menu question ${index + 1}`}>
                            <MoreHorizontal size={15} aria-hidden /> Plus
                          </summary>
                          <div className="document-inline-menu-panel">
                            {isEditing ? (
                              <>
                                <button type="button" className="contents-ghost-button" onClick={() => addQuestion(index)}>
                                  Ajouter avant
                                </button>
                                <button type="button" className="contents-ghost-button" onClick={() => addQuestion(index + 1)}>
                                  Ajouter apres
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              className="contents-ghost-button"
                              onClick={() => copyToClipboard(`question-${question.id}`, question.text, "Question copiee")}
                            >
                              Copier
                            </button>
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  className="contents-ghost-button"
                                  onClick={() =>
                                    updateQuestion(question.id, (current) => ({
                                      ...current,
                                      locked: !current.locked,
                                    }))
                                  }
                                >
                                  {question.locked ? "Deverrouiller" : "Verrouiller"}
                                </button>
                                <button
                                  type="button"
                                  className="contents-ghost-button"
                                  onClick={() => setOpenedNotes((current) => ({ ...current, [question.id]: !current[question.id] }))}
                                >
                                  {openedNotes[question.id] ? "Masquer la note" : "Ajouter une note"}
                                </button>
                                <button
                                  type="button"
                                  className="contents-ghost-button is-danger"
                                  onClick={() => removeQuestion(question.id)}
                                  aria-label={`Supprimer la question ${index + 1}`}
                                >
                                  Supprimer
                                </button>
                              </>
                            ) : null}
                          </div>
                        </details>
                      </div>
                    </header>

                    {isEditing && activeQuestionEditorId === question.id ? (
                      <textarea
                        id={`question-text-${question.id}`}
                        className="document-question-editor"
                        rows={3}
                        value={question.text}
                        onChange={(event) =>
                          updateQuestion(question.id, (current) => ({
                            ...current,
                            text: event.target.value,
                          }))
                        }
                      />
                    ) : (
                      <p
                        className="document-question-text"
                        onClick={() => {
                          if (!isEditing) return;
                          setActiveQuestionEditorId(question.id);
                        }}
                      >
                        {question.text || "Question vide"}
                      </p>
                    )}

                    <div className="document-question-purpose-wrap">
                      <span>Objectif editorial</span>
                      {isEditing ? (
                        <textarea
                          id={`question-purpose-${question.id}`}
                          className="document-question-sub-editor"
                          rows={2}
                          value={question.purpose}
                          onChange={(event) =>
                            updateQuestion(question.id, (current) => ({
                              ...current,
                              purpose: event.target.value,
                            }))
                          }
                        />
                      ) : (
                        <p>{question.purpose || "Aucun objectif editorial"}</p>
                      )}
                    </div>

                    {isEditing ? (
                      <label className="document-inline-label" htmlFor={`question-topic-${question.id}`}>
                        Theme
                        <input
                          id={`question-topic-${question.id}`}
                          className="document-inline-input"
                          value={question.topic}
                          onChange={(event) =>
                            updateQuestion(question.id, (current) => ({
                              ...current,
                              topic: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ) : null}

                    <div className="document-followups-wrap">
                      <span>Relances</span>
                      {isEditing ? (
                        <ul className="document-followups-edit-list">
                          {question.followUps.map((followUp, followUpIndex) => (
                            <li key={`${question.id}-followup-${followUpIndex}`}>
                              <input
                                className="document-inline-input"
                                value={followUp}
                                onChange={(event) => updateFollowUp(question.id, followUpIndex, event.target.value)}
                                aria-label={`Relance ${followUpIndex + 1}`}
                              />
                              <button
                                type="button"
                                className="contents-ghost-button is-danger"
                                onClick={() => removeFollowUp(question.id, followUpIndex)}
                                aria-label={`Supprimer la relance ${followUpIndex + 1}`}
                              >
                                <Trash2 size={13} aria-hidden />
                              </button>
                            </li>
                          ))}
                          <li>
                            <button type="button" className="contents-ghost-button" onClick={() => addFollowUp(question.id)}>
                              <Plus size={14} aria-hidden /> Ajouter une relance
                            </button>
                          </li>
                        </ul>
                      ) : (
                        <ul className="document-followups-read-list">
                          {question.followUps.filter((item) => item.trim().length > 0).length ? (
                            question.followUps
                              .filter((item) => item.trim().length > 0)
                              .map((item, followUpIndex) => <li key={`${question.id}-read-followup-${followUpIndex}`}>{item}</li>)
                          ) : (
                            <li>Aucune relance</li>
                          )}
                        </ul>
                      )}
                    </div>

                    {isEditing ? (
                      <details className="document-private-note-panel" open={openedNotes[question.id]}>
                        <summary>Note privee</summary>
                        <p>Cette note reste locale et n est pas incluse dans la generation sans action explicite.</p>
                        <textarea
                          id={`question-notes-${question.id}`}
                          className="document-prose-editor document-private-notes"
                          rows={3}
                          value={question.privateNotes}
                          onChange={(event) =>
                            updateQuestion(question.id, (current) => ({
                              ...current,
                              privateNotes: event.target.value,
                            }))
                          }
                        />
                      </details>
                    ) : hasPrivateNote ? (
                      <p className="document-private-note-indicator">Note privee disponible</p>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {isEditing ? (
              <button
                type="button"
                className="contents-secondary-button"
                onClick={() => addQuestion(interviewDocument.sections.questions.length)}
              >
                <Plus size={15} aria-hidden /> Ajouter une question
              </button>
            ) : null}
          </section>

          <section className="document-section document-prose-section" aria-labelledby="document-conclusion-title">
            <h2 id="document-conclusion-title">Conclusion</h2>
            {isEditing ? (
              <textarea
                id="document-conclusion"
                className="document-prose-editor"
                rows={4}
                value={interviewDocument.sections.conclusion}
                onChange={(event) => updateField("conclusion", event.target.value)}
              />
            ) : (
              <p className="document-conclusion-read">{interviewDocument.sections.conclusion || "Aucune conclusion"}</p>
            )}
          </section>

          <section className="document-section" aria-labelledby="document-variations-title">
            <div className="document-questions-header">
              <h2 id="document-variations-title">Declinaisons liees</h2>
              {isEditing ? (
                <button type="button" className="crm-primary-action" onClick={() => setShowVariationComposer(true)}>
                  Creer une declinaison
                </button>
              ) : null}
            </div>

            {variants.length === 0 ? (
              <p className="creation-muted">Aucune declinaison creee</p>
            ) : (
              <ul className="creation-context-list">
                {variants.map((variant) => (
                  <li key={variant.id}>
                    <strong>{variant.type} - {variant.title}</strong>
                    <small>{variant.platform} | {variant.status} | {formatDateTime(variant.createdAt)}</small>
                    <button type="button" className="contents-ghost-button" onClick={() => setActiveVariantId(variant.id)}>
                      Ouvrir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {activeVariant ? (
            <ContentVariantEditor
              variant={activeVariant}
              sourceDocumentUpdatedAt={interviewDocument.updatedAt}
              onSave={saveVariant}
              onBackToParameters={() => setShowVariationComposer(true)}
              onCreateAnother={() => setShowVariationComposer(true)}
            />
          ) : null}

          {showVariationComposer ? (
            <ContentVariationComposer
              document={interviewDocument}
              onClose={() => setShowVariationComposer(false)}
              onCreated={(variant) => {
                void handleVariantCreated(variant);
              }}
            />
          ) : null}
        </main>

        <aside className="document-sidebar" aria-label="Informations et contexte">
          <section className="document-sidebar-group">
            <h3>Sujet</h3>
            <div className="document-sidebar-subject-row">
              <span className="document-sidebar-avatar">{(interviewDocument.sidebar.subject || "--").slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{interviewDocument.sidebar.subject}</strong>
                <p>{sourceLabel(interviewDocument.sidebar.source)}</p>
              </div>
            </div>
          </section>

          <section className="document-sidebar-group">
            <h3>Parametres editoriaux</h3>
            <dl className="document-sidebar-rows">
              <div><dt>Type</dt><dd>{interviewDocument.sidebar.interviewType}</dd></div>
              <div><dt>Ton</dt><dd>{interviewDocument.sidebar.tone}</dd></div>
              <div><dt>Audience</dt><dd>{interviewDocument.sidebar.audience}</dd></div>
              <div><dt>Format</dt><dd>{interviewDocument.sidebar.format}</dd></div>
              <div><dt>Questions</dt><dd>{interviewDocument.sections.questions.length}</dd></div>
              <div><dt>Template</dt><dd>{interviewDocument.sidebar.templateVersion}</dd></div>
            </dl>
          </section>

          <section className="document-sidebar-group">
            <h3>Generation</h3>
            <dl className="document-sidebar-rows">
              <div><dt>Provider</dt><dd>{interviewDocument.sidebar.provider}</dd></div>
              <div><dt>Modele</dt><dd>{interviewDocument.sidebar.model}</dd></div>
              <div><dt>Date</dt><dd>{formatDateTime(interviewDocument.sidebar.generatedAt)}</dd></div>
              <div><dt>Version</dt><dd>{interviewDocument.metadata.templateVersion}</dd></div>
            </dl>
          </section>

          <section className="document-sidebar-group">
            <h3>Contexte utilise</h3>
            <dl className="document-sidebar-rows">
              <div><dt>Elements</dt><dd>{selectedContextItems.length}</dd></div>
              <div><dt>Sources externes</dt><dd>{interviewDocument.contextUsage.usedSourceIds.length}</dd></div>
              <div><dt>Periode</dt><dd>{interviewDocument.contextUsage.dateRange ? `${interviewDocument.contextUsage.dateRange.from} -> ${interviewDocument.contextUsage.dateRange.to}` : "Non definie"}</dd></div>
              <div><dt>Date recherche</dt><dd>{interviewDocument.contextUsage.researchedAt ? formatDateTime(interviewDocument.contextUsage.researchedAt) : "Non definie"}</dd></div>
            </dl>
            <button
              type="button"
              className="contents-ghost-button"
              onClick={() => setShowContextDetails((value) => !value)}
            >
              Voir le contexte
            </button>
            {showContextDetails ? (
              <ul className="document-context-list">
                {selectedContextItems.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{item.summary}</span>
                    <small>{item.sourceName}{item.publishedAt ? ` | ${item.publishedAt}` : ""}</small>
                    {item.sourceUrl ? (
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">Voir la source</a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="document-sidebar-group">
            <h3>Etat du document</h3>
            <div className="document-status-picker" role="group" aria-label="Statut du document">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={interviewDocument.status === option.value ? "document-status-option is-active" : "document-status-option"}
                  onClick={() => updateStatus(option.value)}
                  disabled={!isEditing}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {hasUnsavedChanges ? <p className="document-unsaved">Modifications non enregistrees</p> : <p className="document-saved">Enregistre</p>}
            {saveState.savedAt ? <p className="document-saved-at">Dernier enregistrement: {formatDateTime(saveState.savedAt)}</p> : null}
            <p className="document-note-hint">Les notes privees restent locales et ne sont jamais envoyees au moteur IA automatiquement.</p>
            {saveState.error ? <p className="document-save-error" role="alert">{saveState.error}</p> : null}
          </section>
        </aside>
      </div>
    </section>
  );
}
