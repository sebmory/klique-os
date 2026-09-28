"use client";

import { upload } from "@vercel/blob/client";
import { Download, FileArchive, ImageOff, ImagePlus, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  exportStoryStudioCanvasPng,
  renderStoryStudioFrameToCanvas,
  type StoryStudioRenderDiagnostics,
  type StoryStudioTextBounds,
} from "@/lib/story-studio/browser-renderer";
import { splitStoryStudioText } from "@/lib/story-studio/after-match-mapper";
import { getStoryStudioTemplate, storyStudioTemplates } from "@/lib/story-studio/templates";
import {
  exportStoryStudioProjectZip,
  type StoryStudioZipFrameProgress,
  type StoryStudioZipFrameStatus,
} from "@/lib/story-studio/zip-exporter";
import type { StoryStudioBrandKit } from "@/types/story-studio-brand-kit";
import {
  MAX_STORY_STUDIO_PHOTO_BYTES,
  STORY_STUDIO_PHOTO_CONTENT_TYPES,
  type StoryStudioPhoto,
} from "@/types/story-studio-photo";
import type {
  StoryStudioBrandKitSnapshot,
  StoryStudioFrame,
  StoryStudioProject,
  StoryStudioProjectPayload,
  StoryStudioTextBlock,
} from "@/types/story-studio";
import styles from "./story-studio-preview.module.css";

type StoryStudioSavedEditorProps = {
  projectId: string;
};

type SaveState = "loading" | "saving" | "saved" | "error" | "conflict";
type ZipState = "idle" | "exporting" | "zipping" | "completed" | "error";

const AUTOSAVE_DELAY_MS = 700;
const zipStatusLabels: Record<StoryStudioZipFrameStatus, string> = {
  pending: "En attente",
  rendering: "Rendu PNG…",
  completed: "Ajoutée au ZIP",
  error: "Échec",
};
const frameNavigationLabels: Record<StoryStudioFrame["role"], string> = {
  result: "Résultat",
  context: "Fait marquant",
  poll: "Sondage",
  question: "Question",
};

const normalizeLegacyMappedText = (payload: StoryStudioProjectPayload): StoryStudioProjectPayload => {
  let changed = false;
  const frames = payload.frames.map((frame) => {
    if (frame.text.body.trim() || !frame.text.headline.trim()) return frame;
    const split = splitStoryStudioText(frame.text.headline);
    if (!split.body) return frame;
    changed = true;
    return { ...frame, text: { ...frame.text, ...split } };
  }) as StoryStudioProjectPayload["frames"];
  return changed ? { ...payload, frames } : payload;
};

const snapshotBrandKit = (brandKit: StoryStudioBrandKit): StoryStudioBrandKitSnapshot => ({
  name: brandKit.name,
  primaryColor: brandKit.primaryColor,
  secondaryColor: brandKit.secondaryColor,
  accentColor: brandKit.accentColor,
  textColor: brandKit.textColor,
  mutedTextColor: brandKit.mutedTextColor,
  lightLogoPhotoId: brandKit.lightLogoPhotoId,
  darkLogoPhotoId: brandKit.darkLogoPhotoId,
  lightLogoUrl: brandKit.lightLogoUrl,
  darkLogoUrl: brandKit.darkLogoUrl,
  fontFamily: brandKit.fontFamily,
  signatureMode: brandKit.signatureMode,
});

const responseMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = await response.json() as { message?: string };
    return payload.message || fallback;
  } catch {
    return fallback;
  }
};

export function StoryStudioSavedEditor({ projectId }: StoryStudioSavedEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textDragRef = useRef<{
    pointerId: number;
    block: StoryStudioTextBlock;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const draftRef = useRef<StoryStudioProjectPayload | null>(null);
  const savedPayloadRef = useRef("");
  const versionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const [project, setProject] = useState<StoryStudioProject | null>(null);
  const [draft, setDraft] = useState<StoryStudioProjectPayload | null>(null);
  const [photos, setPhotos] = useState<StoryStudioPhoto[]>([]);
  const [brandKits, setBrandKits] = useState<StoryStudioBrandKit[]>([]);
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [savePulse, setSavePulse] = useState(0);
  const [zipState, setZipState] = useState<ZipState>("idle");
  const [zipProgress, setZipProgress] = useState<StoryStudioZipFrameProgress[]>([]);
  const [selectedTextBlock, setSelectedTextBlock] = useState<StoryStudioTextBlock | null>(null);
  const [textBounds, setTextBounds] = useState<StoryStudioTextBounds | null>(null);
  const [renderDiagnostics, setRenderDiagnostics] = useState<StoryStudioRenderDiagnostics | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setSaveState("loading");
      setSaveError(null);
      try {
        const projectResponse = await fetch(`/api/contents/storage/story-studio/projects/${encodeURIComponent(projectId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!projectResponse.ok) throw new Error(await responseMessage(projectResponse, "Projet indisponible."));
        const projectPayload = await projectResponse.json() as { project: StoryStudioProject };
        const athleteQuery = projectPayload.project.athleteId
          ? `?athleteId=${encodeURIComponent(projectPayload.project.athleteId)}`
          : "";
        const [photosResponse, brandKitsResponse] = await Promise.all([
          fetch(`/api/contents/storage/story-studio/photos${athleteQuery}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/contents/storage/story-studio/brand-kits", {
            credentials: "include",
            cache: "no-store",
          }),
        ]);
        if (!photosResponse.ok) throw new Error(await responseMessage(photosResponse, "Catalogue photo indisponible."));
        if (!brandKitsResponse.ok) throw new Error(await responseMessage(brandKitsResponse, "Brand Kits indisponibles."));
        const photosPayload = await photosResponse.json() as { photos?: StoryStudioPhoto[] };
        const brandKitsPayload = await brandKitsResponse.json() as { brandKits?: StoryStudioBrandKit[] };
        if (!active) return;

        const storedDraft = projectPayload.project.payload;
        const nextDraft = normalizeLegacyMappedText(storedDraft);
        draftRef.current = nextDraft;
        savedPayloadRef.current = JSON.stringify(storedDraft);
        versionRef.current = projectPayload.project.version;
        setProject(projectPayload.project);
        setDraft(nextDraft);
        setPhotos(photosPayload.photos ?? []);
        setBrandKits(brandKitsPayload.brandKits ?? []);
        setSaveState("saved");
      } catch (error) {
        if (!active) return;
        setSaveState("error");
        setSaveError(error instanceof Error ? error.message : "Impossible de charger l'éditeur.");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const saveSnapshot = async (snapshot: StoryStudioProjectPayload) => {
    if (!project || conflictVersion !== null || saveInFlightRef.current) return;
    const fingerprint = JSON.stringify(snapshot);
    if (fingerprint === savedPayloadRef.current) return;

    saveInFlightRef.current = true;
    queuedSaveRef.current = false;
    setSaveState("saving");
    setSaveError(null);
    try {
      const response = await fetch(`/api/contents/storage/story-studio/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: versionRef.current,
          athleteId: project.athleteId,
          status: project.status,
          payload: snapshot,
        }),
      });

      if (response.status === 409) {
        const conflict = await response.json() as { currentVersion?: number; message?: string };
        setConflictVersion(conflict.currentVersion ?? versionRef.current);
        setSaveState("conflict");
        setSaveError(conflict.message || "Conflit de version: les données locales n'ont pas été écrasées.");
        return;
      }
      if (!response.ok) throw new Error(await responseMessage(response, "Enregistrement impossible."));

      const payload = await response.json() as { project: StoryStudioProject };
      versionRef.current = payload.project.version;
      savedPayloadRef.current = fingerprint;
      setProject(payload.project);
      if (JSON.stringify(draftRef.current) === fingerprint) {
        setSaveState("saved");
      } else {
        queuedSaveRef.current = true;
        setSaveState("saving");
      }
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      saveInFlightRef.current = false;
      if (queuedSaveRef.current && conflictVersion === null) {
        queuedSaveRef.current = false;
        setSavePulse((value) => value + 1);
      }
    }
  };

  useEffect(() => {
    if (!project || !draft || conflictVersion !== null) return;
    const fingerprint = JSON.stringify(draft);
    if (fingerprint === savedPayloadRef.current) return;

    const timer = window.setTimeout(() => {
      if (saveInFlightRef.current) {
        queuedSaveRef.current = true;
        return;
      }
      void saveSnapshot(draftRef.current ?? draft);
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [conflictVersion, draft, project, savePulse]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = draft?.frames[selectedFrame];
    if (!canvas || !draft || !frame) return;
    const photoUrl = frame.photo.visible && frame.photo.assetId
      ? photos.find((photo) => photo.id === frame.photo.assetId)?.blobUrl ?? null
      : null;
    let active = true;
    setRenderDiagnostics(null);
    setRendering(true);
    void renderStoryStudioFrameToCanvas({
      canvas,
      frame,
      template: getStoryStudioTemplate(draft.templateKey),
      photoUrl,
      brandKitSnapshot: draft.brandKitSnapshot,
      onTextBounds: (nextBounds) => {
        if (active) setTextBounds(nextBounds);
      },
      onDiagnostics: (diagnostics) => {
        if (active) setRenderDiagnostics(diagnostics);
      },
    }).catch((error) => {
      if (active) setSaveError(error instanceof Error ? error.message : "Rendu impossible.");
    }).finally(() => {
      if (active) setRendering(false);
    });
    return () => {
      active = false;
    };
  }, [draft, photos, selectedFrame]);

  useEffect(() => {
    setSelectedTextBlock(null);
    textDragRef.current = null;
  }, [draft?.templateKey, selectedFrame]);

  const updateActiveFrame = (updater: (frame: StoryStudioFrame) => StoryStudioFrame) => {
    setDraft((current) => {
      if (!current) return current;
      const frames = current.frames.map(
        (frame, index) => index === selectedFrame ? updater(frame) : frame,
      ) as StoryStudioProjectPayload["frames"];
      return { ...current, frames };
    });
  };

  const updateActiveText = (field: "eyebrow" | "headline" | "body" | "interaction", value: string) => {
    updateActiveFrame((frame) => ({ ...frame, text: { ...frame.text, [field]: value } }));
  };

  const updateActiveCrop = (field: "scale" | "x" | "y", value: number) => {
    updateActiveFrame((frame) => ({ ...frame, photo: { ...frame.photo, [field]: value } }));
  };

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height,
    };
  };

  const updateTextPosition = (block: StoryStudioTextBlock, x: number, y: number) => {
    if (!draft || !textBounds) return;
    const templateKey = draft.templateKey;
    const template = getStoryStudioTemplate(templateKey);
    const bound = textBounds[block];
    const safeLeft = template.composition.safeArea.left;
    const safeRight = template.canvas.width - template.composition.safeArea.right;
    const safeTop = template.composition.safeArea.top;
    const safeBottom = template.canvas.height - template.composition.safeArea.bottom;
    const clampedX = template.composition.textAlign === "center"
      ? Math.min(Math.max(x, safeLeft + 80), safeRight - 80)
      : Math.min(Math.max(x, safeLeft), safeRight - 160);
    const clampedY = Math.min(Math.max(y, safeTop), safeBottom - bound.height);

    updateActiveFrame((activeFrame) => ({
      ...activeFrame,
      textLayouts: {
        ...activeFrame.textLayouts,
        [templateKey]: {
          eyebrow: activeFrame.textLayouts?.[templateKey]?.eyebrow ?? textBounds.eyebrow.position,
          headline: activeFrame.textLayouts?.[templateKey]?.headline ?? textBounds.headline.position,
          body: activeFrame.textLayouts?.[templateKey]?.body ?? textBounds.body.position,
          [block]: { x: clampedX, y: clampedY },
        },
      },
    }));
  };

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    if (!point || !textBounds) return;
    const block = (["body", "headline", "eyebrow"] as StoryStudioTextBlock[]).find((candidate) => {
      const bound = textBounds[candidate];
      return point.x >= bound.x && point.x <= bound.x + bound.width
        && point.y >= bound.y && point.y <= bound.y + bound.height;
    }) ?? null;
    setSelectedTextBlock(block);
    if (!block) return;
    const position = textBounds[block].position;
    textDragRef.current = {
      pointerId: event.pointerId,
      block,
      startX: point.x,
      startY: point.y,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = textDragRef.current;
    const point = canvasPoint(event);
    if (!drag || drag.pointerId !== event.pointerId || !point) return;
    updateTextPosition(
      drag.block,
      drag.originX + point.x - drag.startX,
      drag.originY + point.y - drag.startY,
    );
  };

  const onCanvasPointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (textDragRef.current?.pointerId !== event.pointerId) return;
    textDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const resetTextLayout = () => {
    if (!draft) return;
    const templateKey = draft.templateKey;
    updateActiveFrame((activeFrame) => {
      if (!activeFrame.textLayouts?.[templateKey]) return activeFrame;
      const textLayouts = { ...activeFrame.textLayouts };
      delete textLayouts[templateKey];
      return {
        ...activeFrame,
        ...(Object.keys(textLayouts).length > 0 ? { textLayouts } : { textLayouts: undefined }),
      };
    });
    setSelectedTextBlock(null);
  };

  const selectPhoto = (photo: StoryStudioPhoto) => {
    updateActiveFrame((frame) => ({
      ...frame,
      photo: { ...frame.photo, assetId: photo.id, visible: true },
    }));
  };

  const selectBrandKit = (brandKitId: string) => {
    const brandKit = brandKits.find((candidate) => candidate.id === brandKitId);
    setDraft((current) => current ? {
      ...current,
      brandKitId: brandKit?.id ?? null,
      brandKitSnapshot: brandKit ? snapshotBrandKit(brandKit) : null,
    } : current);
  };

  const importPhoto = async (file: File | undefined) => {
    if (!file || !project) return;
    if (file.size > MAX_STORY_STUDIO_PHOTO_BYTES) {
      setSaveError("La photo dépasse la limite de 25 Mo.");
      return;
    }
    if (!STORY_STUDIO_PHOTO_CONTENT_TYPES.includes(file.type as typeof STORY_STUDIO_PHOTO_CONTENT_TYPES[number])) {
      setSaveError("Type d'image non autorisé. Formats acceptés: JPEG, PNG, WebP.");
      return;
    }
    setUploading(true);
    setSaveError(null);
    try {
      const uploadApi = "/api/contents/storage/story-studio/photos";
      const intentResponse = await fetch(uploadApi, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create-upload-intent",
          athleteId: project.athleteId,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!intentResponse.ok) throw new Error(await responseMessage(intentResponse, "Import Blob impossible."));
      const intent = await intentResponse.json() as { pathname: string; uploadIntent: string };
      const blob = await upload(intent.pathname, file, {
        access: "public",
        handleUploadUrl: uploadApi,
        clientPayload: intent.uploadIntent,
        contentType: file.type,
        multipart: true,
      });
      const registrationResponse = await fetch(uploadApi, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "register-upload", uploadIntent: intent.uploadIntent, blob }),
      });
      if (!registrationResponse.ok) {
        throw new Error(await responseMessage(registrationResponse, "Enregistrement de la photo impossible."));
      }
      const payload = await registrationResponse.json() as { photo: StoryStudioPhoto };
      setPhotos((current) => [payload.photo, ...current.filter((photo) => photo.id !== payload.photo.id)]);
      selectPhoto(payload.photo);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Import Blob impossible.");
    } finally {
      setUploading(false);
    }
  };

  const downloadPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    try {
      const blob = await exportStoryStudioCanvasPng(canvas);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `story-${project.id}-frame-${selectedFrame + 1}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Export PNG impossible.");
    }
  };

  const downloadZip = async () => {
    if (!project || !draft || zipState === "exporting" || zipState === "zipping") return;
    setZipState("exporting");
    setZipProgress(draft.frames.map((_, index) => ({ index, status: "pending" })));
    try {
      const blob = await exportStoryStudioProjectZip({
        payload: draft,
        photos,
        onFrameProgress: (progress) => {
          setZipProgress((current) => current.map((item) => item.index === progress.index ? progress : item));
          if (progress.index === draft.frames.length - 1 && progress.status === "completed") {
            setZipState("zipping");
          }
        },
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `stories-${project.id}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      setZipState("completed");
    } catch {
      setZipState("error");
    }
  };

  if (!project || !draft) {
    return (
      <main className={styles.page}>
        <div className={styles.loadingState}>
          {saveState === "loading" ? <LoaderCircle size={24} className={styles.spin} /> : <ImageOff size={24} />}
          <p>{saveError || "Chargement du projet…"}</p>
        </div>
      </main>
    );
  }

  const frame = draft.frames[selectedFrame];
  const activePhoto = frame.photo.assetId ? photos.find((photo) => photo.id === frame.photo.assetId) : null;
  const template = getStoryStudioTemplate(draft.templateKey);
  const zipHasMissingPhoto = draft.frames.some((draftFrame) => (
    !draftFrame.photo.visible
    || !draftFrame.photo.assetId
    || !photos.some((photo) => photo.id === draftFrame.photo.assetId)
  ));
  const zipBusy = zipState === "exporting" || zipState === "zipping";
  const headlineOverflow = renderDiagnostics?.headlineOverflow ?? false;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Story Studio</p>
          <h1>Éditeur 1080 × 1920</h1>
        </div>
        <div className={styles.editorStatus}>
          <span className={styles.template}>{template.label} · V{template.version}</span>
          <span role="status" aria-live="polite" className={styles.saveStatus}>
            {saveState === "saving" ? "Enregistrement…" : saveState === "saved" ? "Enregistré" : ""}
          </span>
        </div>
      </header>

      {conflictVersion !== null && (
        <div className={styles.conflict} role="alert">
          <strong>Conflit 409 · version serveur {conflictVersion}</strong>
          <span>{saveError} Rechargez la page pour choisir explicitement la version serveur.</span>
        </div>
      )}
      {saveError && conflictVersion === null && <div className={styles.error} role="alert"><ImageOff size={20} /><span>{saveError}</span></div>}
      {headlineOverflow && (
        <div className={styles.error} role="alert" id="story-studio-headline-overflow">
          <ImageOff size={20} />
          <span>Le titre reste trop long à la taille minimale lisible. Raccourcissez-le ou déplacez-le avant export.</span>
        </div>
      )}

      <section className={styles.workspace}>
        <div className={styles.stage} aria-busy={rendering}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            aria-label="Story en cours d'édition"
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerEnd}
            onPointerCancel={onCanvasPointerEnd}
          />
          {textBounds && (
            <div className={styles.textSelectionLayer} aria-hidden="true">
              {(Object.entries(textBounds) as [StoryStudioTextBlock, StoryStudioTextBounds[StoryStudioTextBlock]][]).map(([block, bound]) => (
                <span
                  key={block}
                  className={`${styles.textSelection} ${selectedTextBlock === block ? styles.activeTextSelection : ""}`}
                  data-label={block === "eyebrow" ? "SUR-TITRE" : block === "headline" ? "TITRE" : "CORPS"}
                  style={{
                    left: `${bound.x / template.canvas.width * 100}%`,
                    top: `${bound.y / template.canvas.height * 100}%`,
                    width: `${bound.width / template.canvas.width * 100}%`,
                    height: `${bound.height / template.canvas.height * 100}%`,
                  }}
                />
              ))}
            </div>
          )}
          {renderDiagnostics?.stickerZone && (
            <div
              className={styles.stickerGuide}
              aria-label={frame.role === "poll" ? "Zone du sticker Sondage Instagram" : "Zone du sticker Questions Instagram"}
              style={{
                left: `${renderDiagnostics.stickerZone.x / template.canvas.width * 100}%`,
                top: `${renderDiagnostics.stickerZone.y / template.canvas.height * 100}%`,
                width: `${renderDiagnostics.stickerZone.width / template.canvas.width * 100}%`,
                height: `${renderDiagnostics.stickerZone.height / template.canvas.height * 100}%`,
              }}
            >
              <strong>{frame.role === "poll" ? "STICKER SONDAGE" : "STICKER QUESTIONS"}</strong>
              <span>Zone réservée au sticker natif Instagram</span>
              {frame.text.interaction && <small>{frame.text.interaction}</small>}
            </div>
          )}
          {rendering && <div className={styles.rendering}><LoaderCircle size={24} className={styles.spin} /></div>}
        </div>

        <aside className={styles.controls} aria-label="Réglages de la Story active">
          <div className={styles.frameNavigation}>
            <span className={styles.controlLabel}>Frame</span>
            <div className={styles.frameTabs} role="tablist" aria-label="Frames du projet">
              {draft.frames.map((draftFrame, index) => (
                <button
                  key={draftFrame.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedFrame === index}
                  aria-label={`Frame ${index + 1} · ${frameNavigationLabels[draftFrame.role]}`}
                  className={selectedFrame === index ? styles.activeFrame : ""}
                  onClick={() => setSelectedFrame(index)}
                >
                  <span>{index + 1}</span>
                  <small className={styles.frameRole}>{frameNavigationLabels[draftFrame.role]}</small>
                </button>
              ))}
            </div>
          </div>

          <label className={styles.brandKitField}>
            <span className={styles.controlLabel}>Brand Kit</span>
            <select
              aria-label="Brand Kit du projet"
              value={draft.brandKitId ?? ""}
              onChange={(event) => selectBrandKit(event.target.value)}
            >
              <option value="">Aucun Brand Kit</option>
              {brandKits.map((brandKit) => <option key={brandKit.id} value={brandKit.id}>{brandKit.name}</option>)}
            </select>
            {draft.brandKitSnapshot && <small>Snapshot enregistré · {draft.brandKitSnapshot.name}</small>}
          </label>

          <div>
            <span className={styles.controlLabel}>Template</span>
            <div className={styles.templateTabs} role="radiogroup" aria-label="Template graphique">
              {Object.values(storyStudioTemplates).map((templateOption) => (
                <button
                  key={templateOption.key}
                  type="button"
                  role="radio"
                  aria-checked={draft.templateKey === templateOption.key}
                  className={draft.templateKey === templateOption.key ? styles.activeTemplate : ""}
                  onClick={() => setDraft((current) => current ? { ...current, templateKey: templateOption.key } : current)}
                >
                  {templateOption.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.textFields}>
            <label>
              <span className={styles.controlLabel}>Sur-titre</span>
              <input aria-label="Sur-titre de la frame active" value={frame.text.eyebrow} onChange={(event) => updateActiveText("eyebrow", event.target.value)} />
            </label>
            <label>
              <span className={styles.controlLabel}>Titre</span>
              <input aria-label="Titre de la frame active" value={frame.text.headline} onChange={(event) => updateActiveText("headline", event.target.value)} />
            </label>
            <label>
              <span className={styles.controlLabel}>Texte</span>
              <textarea aria-label="Texte de la frame active" rows={4} value={frame.text.body} onChange={(event) => updateActiveText("body", event.target.value)} />
            </label>
            <label>
              <span className={styles.controlLabel}>Interaction ou note source</span>
              <textarea aria-label="Interaction de la frame active" rows={2} value={frame.text.interaction} onChange={(event) => updateActiveText("interaction", event.target.value)} />
            </label>
            <button type="button" className={styles.resetLayoutButton} onClick={resetTextLayout}>
              <RotateCcw size={16} />
              Réinitialiser la disposition
            </button>
          </div>

          <div>
            <span className={styles.controlLabel}>Catalogue photo</span>
            <div className={styles.photoCatalog}>
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  aria-label={`Utiliser la photo ${photo.id}`}
                  aria-pressed={activePhoto?.id === photo.id}
                  className={activePhoto?.id === photo.id ? styles.selectedPhoto : ""}
                  style={{ backgroundImage: `url("${photo.blobUrl}")` }}
                  onClick={() => selectPhoto(photo)}
                />
              ))}
              {photos.length === 0 && <p className={styles.localPhotoStatus}>Aucune photo importée.</p>}
            </div>
            <label className={styles.photoPicker}>
              {uploading ? <LoaderCircle size={18} className={styles.spin} /> : <ImagePlus size={18} />}
              {uploading ? "Import…" : "Importer dans Blob"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(event) => void importPhoto(event.target.files?.[0])}
              />
            </label>
          </div>

          <div className={styles.cropControls}>
            <span className={styles.controlLabel}>Cadrage</span>
            <label>
              <span>Zoom <output>{frame.photo.scale.toFixed(2)}</output></span>
              <input type="range" aria-label="Zoom de la photo" min="1" max="3" step="0.05" value={frame.photo.scale} onChange={(event) => updateActiveCrop("scale", Number(event.target.value))} disabled={!activePhoto} />
            </label>
            <label>
              <span>Horizontal <output>{frame.photo.x.toFixed(2)}</output></span>
              <input type="range" aria-label="Position horizontale de la photo" min="-1" max="1" step="0.05" value={frame.photo.x} onChange={(event) => updateActiveCrop("x", Number(event.target.value))} disabled={!activePhoto} />
            </label>
            <label>
              <span>Vertical <output>{frame.photo.y.toFixed(2)}</output></span>
              <input type="range" aria-label="Position verticale de la photo" min="-1" max="1" step="0.05" value={frame.photo.y} onChange={(event) => updateActiveCrop("y", Number(event.target.value))} disabled={!activePhoto} />
            </label>
          </div>

          <div className={styles.exportActions}>
            <div className={styles.exportButtons}>
              <button
                type="button"
                className={styles.download}
                onClick={() => void downloadPng()}
                disabled={rendering || headlineOverflow}
                aria-describedby={headlineOverflow ? "story-studio-headline-overflow" : undefined}
              >
                <Download size={18} />
                Exporter la frame
              </button>
              <button
                type="button"
                className={styles.download}
                onClick={() => void downloadZip()}
                disabled={zipHasMissingPhoto || zipBusy || headlineOverflow}
                aria-describedby={headlineOverflow
                  ? "story-studio-headline-overflow"
                  : zipHasMissingPhoto ? "story-studio-zip-requirement" : undefined}
              >
                {zipBusy ? <LoaderCircle size={18} className={styles.spin} /> : <FileArchive size={18} />}
                {zipState === "zipping" ? "Assemblage ZIP…" : zipState === "exporting" ? "Export des Stories…" : "Télécharger les 4 Stories"}
              </button>
            </div>
            {zipHasMissingPhoto && (
              <p id="story-studio-zip-requirement" className={styles.exportRequirement}>Une photo est requise sur chaque frame pour créer le ZIP.</p>
            )}
            {zipProgress.length > 0 && (
              <div className={styles.zipProgress} role="status" aria-live="polite">
                <strong>{zipState === "completed" ? "ZIP téléchargé" : zipState === "error" ? "Export interrompu" : "Progression"}</strong>
                <ol>
                  {zipProgress.map((progress) => (
                    <li key={progress.index} data-status={progress.status}>
                      Frame {progress.index + 1} · {zipStatusLabels[progress.status]}
                      {progress.error ? ` · ${progress.error}` : ""}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}