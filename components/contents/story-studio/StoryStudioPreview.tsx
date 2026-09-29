"use client";

import { Download, ImageOff, ImagePlus, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  exportStoryStudioCanvasPng,
  renderStoryStudioFrameToCanvas,
} from "@/lib/story-studio/browser-renderer";
import { getStoryStudioTemplate, storyStudioTemplates } from "@/lib/story-studio/templates";
import type { StoryStudioPhoto } from "@/types/story-studio-photo";
import type { StoryStudioProject, StoryStudioTemplateKey } from "@/types/story-studio";
import { DEFAULT_STORY_STUDIO_CANVAS_FORMAT } from "@/types/story-studio";
import styles from "./story-studio-preview.module.css";

type StoryStudioPreviewProps = {
  initialProjectId?: string;
};

type LocalFramePhoto = {
  url: string | null;
  crop: StoryStudioProject["payload"]["frames"][number]["photo"];
};

type LocalFrameText = Pick<StoryStudioProject["payload"]["frames"][number]["text"], "headline" | "body">;

const DEMO_PROJECT: StoryStudioProject = {
  id: "demo",
  workspaceId: "demo",
  userId: "demo",
  mediaId: null,
  sourcePackId: "demo",
  sourceStoriesVariantId: "demo",
  sourceDocumentId: "demo",
  athleteId: null,
  projectType: "after_match",
  templateKey: "editorial_klique",
  status: "draft",
  payload: {
    schemaVersion: 1,
    templateKey: "editorial_klique",
    frames: [
      {
        id: "demo-result",
        order: 1,
        role: "result",
        sourceStoryIndex: 1,
        text: {
          eyebrow: "Après-match",
          headline: "Une victoire qui rassemble",
          body: "Solides jusqu'au bout. Trois points, une équipe, une même énergie.",
          interaction: "",
        },
        photo: { assetId: null, visible: false, scale: 1, x: 0, y: 0 },
        elements: { athleteName: false, score: true, competition: false, logo: true, signature: false, interactionZone: false },
      },
      {
        id: "demo-context",
        order: 2,
        role: "context",
        sourceStoryIndex: 2,
        text: {
          eyebrow: "Le tournant",
          headline: "Tout s'est joué à la 88e",
          body: "Une dernière accélération et le stade a basculé.",
          interaction: "",
        },
        photo: { assetId: null, visible: false, scale: 1.1, x: 0.15, y: 0 },
        elements: { athleteName: false, score: false, competition: false, logo: true, signature: false, interactionZone: false },
      },
      {
        id: "demo-poll",
        order: 3,
        role: "poll",
        sourceStoryIndex: 3,
        text: {
          eyebrow: "Votre avis",
          headline: "Le moment du match ?",
          body: "",
          interaction: "Le but de la victoire",
        },
        photo: { assetId: null, visible: false, scale: 1.2, x: -0.1, y: 0.1 },
        elements: { athleteName: false, score: false, competition: false, logo: true, signature: false, interactionZone: true },
      },
      {
        id: "demo-question",
        order: 4,
        role: "question",
        sourceStoryIndex: 4,
        text: {
          eyebrow: "À vous",
          headline: "Quel joueur vous a impressionné ?",
          body: "Partagez votre choix avec la communauté.",
          interaction: "Répondre",
        },
        photo: { assetId: null, visible: false, scale: 1.05, x: 0, y: -0.1 },
        elements: { athleteName: false, score: false, competition: false, logo: true, signature: false, interactionZone: true },
      },
    ],
  },
  version: 1,
  createdAt: "2026-09-28T00:00:00.000Z",
  updatedAt: "2026-09-28T00:00:00.000Z",
};

const createLocalFramePhotos = (project: StoryStudioProject): LocalFramePhoto[] =>
  project.payload.frames.map((frame) => ({ url: null, crop: { ...frame.photo } }));

const createLocalFrameTexts = (project: StoryStudioProject): LocalFrameText[] =>
  project.payload.frames.map((frame) => ({ headline: frame.text.headline, body: frame.text.body }));

const responseMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = await response.json() as { message?: string };
    return payload.message || fallback;
  } catch {
    return fallback;
  }
};

export function StoryStudioPreview({ initialProjectId = "" }: StoryStudioPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [project, setProject] = useState<StoryStudioProject | null>(DEMO_PROJECT);
  const [photos, setPhotos] = useState<StoryStudioPhoto[]>([]);
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [templateKey, setTemplateKey] = useState<StoryStudioTemplateKey>(DEMO_PROJECT.payload.templateKey);
  const [localFrameTexts, setLocalFrameTexts] = useState<LocalFrameText[]>(() => createLocalFrameTexts(DEMO_PROJECT));
  const [localFramePhotos, setLocalFramePhotos] = useState<LocalFramePhoto[]>(() => createLocalFramePhotos(DEMO_PROJECT));
  const localFramePhotosRef = useRef(localFramePhotos);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProject = async () => {
    const normalizedId = projectId.trim();
    if (!normalizedId) {
      setError("Saisissez un identifiant de projet Story Studio.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const projectResponse = await fetch(`/api/contents/storage/story-studio/projects/${encodeURIComponent(normalizedId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!projectResponse.ok) throw new Error(await responseMessage(projectResponse, "Projet indisponible."));
      const projectPayload = await projectResponse.json() as { project: StoryStudioProject };
      const athleteQuery = projectPayload.project.athleteId
        ? `?athleteId=${encodeURIComponent(projectPayload.project.athleteId)}`
        : "";
      const photosResponse = await fetch(`/api/contents/storage/story-studio/photos${athleteQuery}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!photosResponse.ok) throw new Error(await responseMessage(photosResponse, "Photos indisponibles."));
      const photosPayload = await photosResponse.json() as { photos?: StoryStudioPhoto[] };

      setProject(projectPayload.project);
      setPhotos(photosPayload.photos ?? []);
      setSelectedFrame(0);
      setTemplateKey(projectPayload.project.payload.templateKey);
      setLocalFrameTexts(createLocalFrameTexts(projectPayload.project));
      localFramePhotosRef.current.forEach(({ url }) => {
        if (url) URL.revokeObjectURL(url);
      });
      const nextLocalFramePhotos = createLocalFramePhotos(projectPayload.project);
      localFramePhotosRef.current = nextLocalFramePhotos;
      setLocalFramePhotos(nextLocalFramePhotos);
    } catch (loadError) {
      setProject(null);
      setPhotos([]);
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger le projet.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialProjectId) void loadProject();
    // The initial identifier is intentionally loaded once when opening the preview URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localFramePhotosRef.current = localFramePhotos;
  }, [localFramePhotos]);

  useEffect(() => () => {
    localFramePhotosRef.current.forEach(({ url }) => {
      if (url) URL.revokeObjectURL(url);
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = project?.payload.frames[selectedFrame];
    if (!canvas || !project || !frame) return;

    let active = true;
    const localFramePhoto = localFramePhotos[selectedFrame];
    const localFrameText = localFrameTexts[selectedFrame];
    const photoUrl = localFramePhoto?.url ?? (frame.photo.assetId
      ? photos.find((photo) => photo.id === frame.photo.assetId)?.blobUrl ?? null
      : null);
    const renderedFrame = {
      ...frame,
      text: { ...frame.text, ...localFrameText },
      photo: {
        ...(localFramePhoto?.crop ?? frame.photo),
        visible: Boolean(localFramePhoto?.url) || frame.photo.visible,
      },
    };

    setRendering(true);
    setError(null);
    void renderStoryStudioFrameToCanvas({
      canvas,
      frame: renderedFrame,
      template: getStoryStudioTemplate(
        templateKey,
        project.payload.canvasFormat ?? DEFAULT_STORY_STUDIO_CANVAS_FORMAT,
      ),
      photoUrl,
      brandKitSnapshot: project.payload.brandKitSnapshot,
    }).catch((renderError) => {
      if (active) setError(renderError instanceof Error ? renderError.message : "Rendu impossible.");
    }).finally(() => {
      if (active) setRendering(false);
    });

    return () => {
      active = false;
    };
  }, [localFramePhotos, localFrameTexts, photos, project, selectedFrame, templateKey]);

  const chooseLocalPhoto = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const nextUrl = URL.createObjectURL(file);
    const previousUrl = localFramePhotos[selectedFrame]?.url;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    setLocalFramePhotos((current) => current.map((localFramePhoto, index) =>
      index === selectedFrame ? { ...localFramePhoto, url: nextUrl } : localFramePhoto
    ));
  };

  const updateActiveText = (field: keyof LocalFrameText, value: string) => {
    setLocalFrameTexts((current) => current.map((localFrameText, index) =>
      index === selectedFrame ? { ...localFrameText, [field]: value } : localFrameText
    ));
  };

  const updateActiveCrop = (field: "scale" | "x" | "y", value: number) => {
    setLocalFramePhotos((current) => current.map((localFramePhoto, index) =>
      index === selectedFrame
        ? { ...localFramePhoto, crop: { ...localFramePhoto.crop, [field]: value } }
        : localFramePhoto
    ));
  };

  const downloadPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    setError(null);
    try {
      const blob = await exportStoryStudioCanvasPng(canvas);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `story-${project.id}-frame-${selectedFrame + 1}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export PNG impossible.");
    }
  };

  const frame = project?.payload.frames[selectedFrame] ?? null;
  const localFrameText = localFrameTexts[selectedFrame];
  const localFramePhoto = localFramePhotos[selectedFrame];
  const template = project
    ? getStoryStudioTemplate(templateKey, project.payload.canvasFormat ?? DEFAULT_STORY_STUDIO_CANVAS_FORMAT)
    : null;
  const hasActivePhoto = Boolean(localFramePhoto?.url || frame?.photo.visible);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Story Studio</p>
          <h1>Prévisualisation {template?.canvas.width ?? 1080} × {template?.canvas.height ?? 1920}</h1>
        </div>
        {template && <span className={styles.template}>{template.label} · V{template.version}</span>}
      </header>

      <div className={styles.loaderBar}>
        <label htmlFor="story-studio-project-id">Projet</label>
        <input
          id="story-studio-project-id"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          placeholder="UUID du projet"
        />
        <button type="button" onClick={() => void loadProject()} disabled={loading}>
          {loading ? <LoaderCircle size={18} className={styles.spin} /> : <RefreshCw size={18} />}
          Charger
        </button>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          <ImageOff size={20} />
          <span>{error}</span>
        </div>
      )}

      <section className={styles.workspace}>
        <div
          className={styles.stage}
          aria-busy={rendering}
          style={template ? { aspectRatio: `${template.canvas.width} / ${template.canvas.height}` } : undefined}
        >
          <canvas ref={canvasRef} className={styles.canvas} aria-label="Prévisualisation de la Story sélectionnée" />
          {!project && <p className={styles.empty}>Chargez un projet pour afficher sa première Story.</p>}
          {rendering && <div className={styles.rendering}><LoaderCircle size={24} className={styles.spin} /></div>}
        </div>

        <aside className={styles.controls}>
          <div>
            <span className={styles.controlLabel}>Template</span>
            <div className={styles.templateTabs} role="radiogroup" aria-label="Template graphique">
              {Object.values(storyStudioTemplates).map((templateOption) => (
                <button
                  key={templateOption.key}
                  type="button"
                  role="radio"
                  aria-checked={templateKey === templateOption.key}
                  className={templateKey === templateOption.key ? styles.activeTemplate : ""}
                  onClick={() => setTemplateKey(templateOption.key)}
                >
                  {templateOption.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.textFields}>
            <label>
              <span className={styles.controlLabel}>Titre</span>
              <input
                aria-label="Titre de la frame active"
                value={localFrameText?.headline ?? ""}
                onChange={(event) => updateActiveText("headline", event.target.value)}
              />
            </label>
            <label>
              <span className={styles.controlLabel}>Texte</span>
              <textarea
                aria-label="Texte de la frame active"
                rows={4}
                value={localFrameText?.body ?? ""}
                onChange={(event) => updateActiveText("body", event.target.value)}
              />
            </label>
          </div>

          <div>
            <span className={styles.controlLabel}>Photo</span>
            <label className={styles.photoPicker}>
              <ImagePlus size={18} />
              Choisir une photo locale
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => chooseLocalPhoto(event.target.files?.[0])}
              />
            </label>
            {localFramePhoto?.url && <p className={styles.localPhotoStatus}>Photo locale affichée · aucun upload</p>}
          </div>

          <div className={styles.cropControls}>
            <span className={styles.controlLabel}>Cadrage</span>
            <label>
              <span>Zoom <output>{localFramePhoto?.crop.scale.toFixed(2)}</output></span>
              <input
                type="range"
                aria-label="Zoom de la photo"
                min="1"
                max="3"
                step="0.05"
                value={localFramePhoto?.crop.scale ?? 1}
                onChange={(event) => updateActiveCrop("scale", Number(event.target.value))}
                disabled={!hasActivePhoto}
              />
            </label>
            <label>
              <span>Horizontal <output>{localFramePhoto?.crop.x.toFixed(2)}</output></span>
              <input
                type="range"
                aria-label="Position horizontale de la photo"
                min="-1"
                max="1"
                step="0.05"
                value={localFramePhoto?.crop.x ?? 0}
                onChange={(event) => updateActiveCrop("x", Number(event.target.value))}
                disabled={!hasActivePhoto}
              />
            </label>
            <label>
              <span>Vertical <output>{localFramePhoto?.crop.y.toFixed(2)}</output></span>
              <input
                type="range"
                aria-label="Position verticale de la photo"
                min="-1"
                max="1"
                step="0.05"
                value={localFramePhoto?.crop.y ?? 0}
                onChange={(event) => updateActiveCrop("y", Number(event.target.value))}
                disabled={!hasActivePhoto}
              />
            </label>
          </div>

          <div>
            <span className={styles.controlLabel}>Frame</span>
            <div className={styles.frameTabs} role="tablist" aria-label="Frames du projet">
              {[0, 1, 2, 3].map((index) => (
                <button
                  key={index}
                  type="button"
                  role="tab"
                  aria-selected={selectedFrame === index}
                  className={selectedFrame === index ? styles.activeFrame : ""}
                  onClick={() => setSelectedFrame(index)}
                  disabled={!project}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>

          <dl className={styles.details}>
            <div><dt>Rôle</dt><dd>{frame?.role ?? "—"}</dd></div>
            <div><dt>Photo</dt><dd>{localFramePhoto?.url || frame?.photo.visible ? "Visible" : "Masquée"}</dd></div>
            <div><dt>Format</dt><dd>PNG · {template?.canvas.width ?? 1080} × {template?.canvas.height ?? 1920}</dd></div>
          </dl>

          <button type="button" className={styles.download} onClick={() => void downloadPng()} disabled={!project || rendering || Boolean(error)}>
            <Download size={18} />
            Exporter la frame
          </button>
        </aside>
      </section>
    </main>
  );
}