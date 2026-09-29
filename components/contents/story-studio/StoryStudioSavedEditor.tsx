"use client";

import { upload } from "@vercel/blob/client";
import { Download, FileArchive, ImageOff, ImagePlus, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  clampStoryStudioSubjectPosition,
  exportStoryStudioCanvasPng,
  renderStoryStudioFrameToCanvas,
  type StoryStudioLogoBounds,
  type StoryStudioRenderDiagnostics,
  type StoryStudioSubjectBounds,
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
  StoryStudioCanvasFormat,
  StoryStudioBrandKitSnapshot,
  StoryStudioFrame,
  StoryStudioMatchCard,
  StoryStudioProject,
  StoryStudioProjectPayload,
  StoryStudioTextBlock,
} from "@/types/story-studio";
import { DEFAULT_STORY_STUDIO_CANVAS_FORMAT, getStoryStudioLayoutKey } from "@/types/story-studio";
import type { StoryStudioFrameModel, StoryStudioFrameModelInput } from "@/types/story-studio-frame-model";
import styles from "./story-studio-preview.module.css";

type StoryStudioSavedEditorProps = {
  projectId: string;
};

type SaveState = "loading" | "saving" | "saved" | "error" | "conflict";
type ZipState = "idle" | "exporting" | "zipping" | "completed" | "error";
type FrameModelPanel = "closed" | "save" | "apply";
type MatchLogoAsset = { id: string; url: string; name: string };

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

const isAllowedMatchLogoPath = (pathname: string) => pathname.startsWith("story-studio/brand-kit-logos/");

const isAllowedMatchLogoUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.endsWith(".blob.vercel-storage.com")
      && (url.pathname.startsWith("/story-studio/photos/") || url.pathname.startsWith("/story-studio/brand-kit-logos/"));
  } catch {
    return false;
  }
};

type MatchLogoPickerProps = {
  label: string;
  assets: MatchLogoAsset[];
  selectedId: string | null;
  selectedUrl: string | null;
  onSelect: (asset: MatchLogoAsset | null) => void;
};

function MatchLogoPicker({ label, assets, selectedId, selectedUrl, onSelect }: MatchLogoPickerProps) {
  const selectedAsset = assets.find((asset) => asset.id === selectedId) ?? null;
  const previewUrl = selectedAsset?.url ?? selectedUrl;
  const previewName = selectedAsset?.name ?? (previewUrl ? "Logo sélectionné" : "Aucun");

  return (
    <fieldset className={styles.matchLogoPicker} aria-label={label}>
      <legend>{label}</legend>
      <div className={styles.matchLogoPreview}>
        {previewUrl ? <img src={previewUrl} alt="" /> : <ImageOff size={22} aria-hidden="true" />}
        <span>{previewName}</span>
      </div>
      <div className={styles.matchLogoOptions}>
        <button
          type="button"
          aria-label={`${label} : Aucun`}
          aria-pressed={selectedId === null}
          onClick={() => onSelect(null)}
        >
          <span className={styles.matchLogoThumbnail}><ImageOff size={20} aria-hidden="true" /></span>
          <span>Aucun</span>
        </button>
        {assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            aria-label={`${label} : ${asset.name}`}
            aria-pressed={selectedId === asset.id}
            onClick={() => onSelect(asset)}
          >
            <span className={styles.matchLogoThumbnail}><img src={asset.url} alt="" /></span>
            <span>{asset.name}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

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
  const logoDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    scale: number;
  } | null>(null);
  const subjectDragRef = useRef<{
    pointerId: number;
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
  const [frameModels, setFrameModels] = useState<StoryStudioFrameModel[]>([]);
  const [frameModelPanel, setFrameModelPanel] = useState<FrameModelPanel>("closed");
  const [frameModelName, setFrameModelName] = useState("");
  const [pendingFrameModelId, setPendingFrameModelId] = useState("");
  const [frameModelBusy, setFrameModelBusy] = useState(false);
  const [frameModelMessage, setFrameModelMessage] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingSubject, setUploadingSubject] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [savePulse, setSavePulse] = useState(0);
  const [zipState, setZipState] = useState<ZipState>("idle");
  const [zipProgress, setZipProgress] = useState<StoryStudioZipFrameProgress[]>([]);
  const [selectedTextBlock, setSelectedTextBlock] = useState<StoryStudioTextBlock | null>(null);
  const [textBounds, setTextBounds] = useState<StoryStudioTextBounds | null>(null);
  const [logoBounds, setLogoBounds] = useState<StoryStudioLogoBounds | null>(null);
  const [subjectBounds, setSubjectBounds] = useState<StoryStudioSubjectBounds | null>(null);
  const [selectedLogo, setSelectedLogo] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(false);
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
        const [photosResponse, brandKitsResponse, frameModelsResponse] = await Promise.all([
          fetch(`/api/contents/storage/story-studio/photos${athleteQuery}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/contents/storage/story-studio/brand-kits", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/contents/storage/story-studio/frame-models", {
            credentials: "include",
            cache: "no-store",
          }),
        ]);
        if (!photosResponse.ok) throw new Error(await responseMessage(photosResponse, "Catalogue photo indisponible."));
        if (!brandKitsResponse.ok) throw new Error(await responseMessage(brandKitsResponse, "Brand Kits indisponibles."));
        if (!frameModelsResponse.ok) throw new Error(await responseMessage(frameModelsResponse, "Modèles de frame indisponibles."));
        const photosPayload = await photosResponse.json() as { photos?: StoryStudioPhoto[] };
        const brandKitsPayload = await brandKitsResponse.json() as { brandKits?: StoryStudioBrandKit[] };
        const frameModelsPayload = await frameModelsResponse.json() as { frameModels?: StoryStudioFrameModel[] };
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
        setFrameModels(frameModelsPayload.frameModels ?? []);
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
    setLogoBounds(null);
    setSubjectBounds(null);
    setRendering(true);
    void renderStoryStudioFrameToCanvas({
      canvas,
      frame,
      template: getStoryStudioTemplate(
        draft.templateKey,
        draft.canvasFormat ?? DEFAULT_STORY_STUDIO_CANVAS_FORMAT,
      ),
      photoUrl,
      brandKitSnapshot: draft.brandKitSnapshot,
      onTextBounds: (nextBounds) => {
        if (active) setTextBounds(nextBounds);
      },
      onLogoBounds: (nextBounds) => {
        if (active) setLogoBounds(nextBounds);
      },
      onSubjectBounds: (nextBounds) => {
        if (active) setSubjectBounds(nextBounds);
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
    setSelectedLogo(false);
    setSelectedSubject(false);
    textDragRef.current = null;
    logoDragRef.current = null;
    subjectDragRef.current = null;
  }, [draft?.canvasFormat, draft?.templateKey, selectedFrame]);

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

  const updateActiveMatchCard = (updater: (matchCard: StoryStudioMatchCard) => StoryStudioMatchCard) => {
    updateActiveFrame((frame) => frame.matchCard ? { ...frame, matchCard: updater(frame.matchCard) } : frame);
  };

  const saveActiveFrameModel = async () => {
    if (!draft || !frameModelName.trim() || (draft.canvasFormat ?? DEFAULT_STORY_STUDIO_CANVAS_FORMAT) !== "1080x1350") return;
    const frame = draft.frames[selectedFrame];
    const layoutKey = getStoryStudioLayoutKey("1080x1350", draft.templateKey);
    const input: StoryStudioFrameModelInput = {
      name: frameModelName.trim(),
      content: {
        schemaVersion: 1,
        canvasFormat: "1080x1350",
        templateKey: draft.templateKey,
        brandKitId: draft.brandKitId ?? null,
        brandKitSnapshot: draft.brandKitSnapshot ?? null,
        frame: {
          text: frame.text,
          elements: frame.elements,
          ...(frame.textLayouts?.[layoutKey] ? { textLayout: frame.textLayouts[layoutKey] } : {}),
          ...(frame.logoLayouts?.[layoutKey] ? { logoLayout: frame.logoLayouts[layoutKey] } : {}),
        },
      },
    };
    setFrameModelBusy(true);
    setFrameModelMessage(null);
    try {
      const response = await fetch("/api/contents/storage/story-studio/frame-models", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "Impossible d'enregistrer le modèle."));
      const payload = await response.json() as { frameModel: StoryStudioFrameModel };
      setFrameModels((current) => [...current, payload.frameModel].sort((left, right) => left.name.localeCompare(right.name, "fr")));
      setFrameModelName("");
      setFrameModelPanel("closed");
      setFrameModelMessage("Modèle enregistré dans le workspace.");
    } catch (error) {
      setFrameModelMessage(error instanceof Error ? error.message : "Impossible d'enregistrer le modèle.");
    } finally {
      setFrameModelBusy(false);
    }
  };

  const applyPendingFrameModel = () => {
    const model = frameModels.find((candidate) => candidate.id === pendingFrameModelId);
    if (!model) return;
    const layoutKey = getStoryStudioLayoutKey("1080x1350", model.content.templateKey);
    setDraft((current) => {
      if (!current || (current.canvasFormat ?? DEFAULT_STORY_STUDIO_CANVAS_FORMAT) !== "1080x1350") return current;
      const frames = current.frames.map((currentFrame, index) => {
        if (index !== selectedFrame) return currentFrame;
        const textLayouts = { ...currentFrame.textLayouts };
        const logoLayouts = { ...currentFrame.logoLayouts };
        if (model.content.frame.textLayout) textLayouts[layoutKey] = model.content.frame.textLayout;
        else delete textLayouts[layoutKey];
        if (model.content.frame.logoLayout) logoLayouts[layoutKey] = model.content.frame.logoLayout;
        else delete logoLayouts[layoutKey];
        return {
          ...currentFrame,
          text: model.content.frame.text,
          elements: model.content.frame.elements,
          ...(Object.keys(textLayouts).length > 0 ? { textLayouts } : { textLayouts: undefined }),
          ...(Object.keys(logoLayouts).length > 0 ? { logoLayouts } : { logoLayouts: undefined }),
        };
      }) as StoryStudioProjectPayload["frames"];
      return {
        ...current,
        templateKey: model.content.templateKey,
        brandKitId: model.content.brandKitId,
        brandKitSnapshot: model.content.brandKitSnapshot,
        frames,
      };
    });
    setFrameModelPanel("closed");
    setPendingFrameModelId("");
    setFrameModelMessage(`Modèle « ${model.name} » appliqué.`);
  };

  const addMatchCard = () => {
    if (!draft || (draft.canvasFormat ?? DEFAULT_STORY_STUDIO_CANVAS_FORMAT) !== "1080x1350") return;
    const brandLogoPhotoId = draft.brandKitSnapshot?.lightLogoPhotoId ?? draft.brandKitSnapshot?.darkLogoPhotoId ?? null;
    const brandLogoUrl = draft.brandKitSnapshot?.lightLogoUrl ?? draft.brandKitSnapshot?.darkLogoUrl ?? null;
    updateActiveFrame((frame) => ({
      ...frame,
      matchCard: {
        competition: "",
        homeTeam: {
          name: draft.brandKitSnapshot?.name ?? "Équipe domicile",
          logoPhotoId: brandLogoPhotoId,
          logoUrl: brandLogoUrl,
        },
        awayTeam: { name: "Équipe extérieure", logoPhotoId: null, logoUrl: null },
        homeScore: 0,
        awayScore: 0,
      },
    }));
  };

  const updateMatchTeamLogo = (team: "homeTeam" | "awayTeam", asset: MatchLogoAsset | null) => {
    updateActiveMatchCard((matchCard) => ({
      ...matchCard,
      [team]: {
        ...matchCard[team],
        logoPhotoId: asset?.id ?? null,
        logoUrl: asset?.url ?? null,
      },
    }));
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
    const canvasFormat = draft.canvasFormat ?? DEFAULT_STORY_STUDIO_CANVAS_FORMAT;
    const layoutKey = getStoryStudioLayoutKey(canvasFormat, templateKey);
    const template = getStoryStudioTemplate(templateKey, canvasFormat);
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
        [layoutKey]: {
          eyebrow: activeFrame.textLayouts?.[layoutKey]?.eyebrow ?? textBounds.eyebrow.position,
          headline: activeFrame.textLayouts?.[layoutKey]?.headline ?? textBounds.headline.position,
          body: activeFrame.textLayouts?.[layoutKey]?.body ?? textBounds.body.position,
          [block]: { x: clampedX, y: clampedY },
        },
      },
    }));
  };

  const updateLogoLayout = (x: number, y: number, scale: number) => {
    if (!draft) return;
    const templateKey = draft.templateKey;
    const canvasFormat = draft.canvasFormat ?? DEFAULT_STORY_STUDIO_CANVAS_FORMAT;
    const layoutKey = getStoryStudioLayoutKey(canvasFormat, templateKey);
    const template = getStoryStudioTemplate(templateKey, canvasFormat);
    const width = template.composition.logo.width * scale;
    const height = template.composition.logo.height * scale;
    updateActiveFrame((activeFrame) => ({
      ...activeFrame,
      logoLayouts: {
        ...activeFrame.logoLayouts,
        [layoutKey]: {
          x: Math.min(Math.max(x, 0), template.canvas.width - width),
          y: Math.min(Math.max(y, 0), template.canvas.height - height),
          scale,
        },
      },
    }));
  };

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    if (!point) return;
    if (logoBounds
      && point.x >= logoBounds.x && point.x <= logoBounds.x + logoBounds.width
      && point.y >= logoBounds.y && point.y <= logoBounds.y + logoBounds.height) {
      setSelectedTextBlock(null);
      setSelectedLogo(true);
      logoDragRef.current = {
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        originX: logoBounds.layout.x,
        originY: logoBounds.layout.y,
        scale: logoBounds.layout.scale,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (subjectBounds
      && point.x >= subjectBounds.x && point.x <= subjectBounds.x + subjectBounds.width
      && point.y >= subjectBounds.y && point.y <= subjectBounds.y + subjectBounds.height) {
      setSelectedTextBlock(null);
      setSelectedLogo(false);
      setSelectedSubject(true);
      subjectDragRef.current = {
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        originX: subjectBounds.layout.x,
        originY: subjectBounds.layout.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (!textBounds) return;
    const block = (["body", "headline", "eyebrow"] as StoryStudioTextBlock[]).find((candidate) => {
      const bound = textBounds[candidate];
      return point.x >= bound.x && point.x <= bound.x + bound.width
        && point.y >= bound.y && point.y <= bound.y + bound.height;
    }) ?? null;
    setSelectedTextBlock(block);
    setSelectedLogo(false);
    setSelectedSubject(false);
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
    const logoDrag = logoDragRef.current;
    const point = canvasPoint(event);
    if (logoDrag && logoDrag.pointerId === event.pointerId && point) {
      updateLogoLayout(
        logoDrag.originX + point.x - logoDrag.startX,
        logoDrag.originY + point.y - logoDrag.startY,
        logoDrag.scale,
      );
      return;
    }
    const subjectDrag = subjectDragRef.current;
    if (subjectDrag && subjectDrag.pointerId === event.pointerId && point && subjectBounds) {
      const canvasFormat = draft?.canvasFormat ?? DEFAULT_STORY_STUDIO_CANVAS_FORMAT;
      const canvas = getStoryStudioTemplate(draft?.templateKey ?? "editorial_klique", canvasFormat).canvas;
      const position = clampStoryStudioSubjectPosition(
        subjectDrag.originX + point.x - subjectDrag.startX,
        subjectDrag.originY + point.y - subjectDrag.startY,
        subjectBounds.renderedWidth,
        subjectBounds.renderedHeight,
        canvas.width,
        canvas.height,
      );
      updateActiveFrame((activeFrame) => activeFrame.subjectLayer ? {
        ...activeFrame,
        subjectLayer: {
          ...activeFrame.subjectLayer,
          x: position.x,
          y: position.y,
        },
      } : activeFrame);
      return;
    }
    const drag = textDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !point) return;
    updateTextPosition(
      drag.block,
      drag.originX + point.x - drag.startX,
      drag.originY + point.y - drag.startY,
    );
  };

  const onCanvasPointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (textDragRef.current?.pointerId === event.pointerId) textDragRef.current = null;
    else if (logoDragRef.current?.pointerId === event.pointerId) logoDragRef.current = null;
    else if (subjectDragRef.current?.pointerId === event.pointerId) subjectDragRef.current = null;
    else return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const resetLayout = () => {
    if (!draft) return;
    const templateKey = draft.templateKey;
    const canvasFormat = draft.canvasFormat ?? DEFAULT_STORY_STUDIO_CANVAS_FORMAT;
    const layoutKey = getStoryStudioLayoutKey(canvasFormat, templateKey);
    updateActiveFrame((activeFrame) => {
      const hasLegacyLayout = canvasFormat === DEFAULT_STORY_STUDIO_CANVAS_FORMAT
        && (activeFrame.textLayouts?.[templateKey] || activeFrame.logoLayouts?.[templateKey]);
      if (!activeFrame.textLayouts?.[layoutKey] && !activeFrame.logoLayouts?.[layoutKey] && !hasLegacyLayout) return activeFrame;
      const textLayouts = { ...activeFrame.textLayouts };
      const logoLayouts = { ...activeFrame.logoLayouts };
      delete textLayouts[layoutKey];
      delete logoLayouts[layoutKey];
      if (canvasFormat === DEFAULT_STORY_STUDIO_CANVAS_FORMAT) {
        delete textLayouts[templateKey];
        delete logoLayouts[templateKey];
      }
      return {
        ...activeFrame,
        ...(Object.keys(textLayouts).length > 0 ? { textLayouts } : { textLayouts: undefined }),
        ...(Object.keys(logoLayouts).length > 0 ? { logoLayouts } : { logoLayouts: undefined }),
      };
    });
    setSelectedTextBlock(null);
    setSelectedLogo(false);
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

  const importSubject = async (file: File | undefined) => {
    if (!file || !project) return;
    if (file.type !== "image/png") {
      setSaveError("Le sujet détouré doit être un PNG transparent.");
      return;
    }
    if (file.size > MAX_STORY_STUDIO_PHOTO_BYTES) {
      setSaveError("Le sujet détouré dépasse la limite de 25 Mo.");
      return;
    }
    setUploadingSubject(true);
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
          assetKind: "subjectLayer",
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!intentResponse.ok) throw new Error(await responseMessage(intentResponse, "Import du sujet impossible."));
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
      if (!registrationResponse.ok) throw new Error(await responseMessage(registrationResponse, "Enregistrement du sujet impossible."));
      const payload = await registrationResponse.json() as { photo: StoryStudioPhoto };
      setPhotos((current) => [payload.photo, ...current.filter((photo) => photo.id !== payload.photo.id)]);
      updateActiveFrame((activeFrame) => ({
        ...activeFrame,
        subjectLayer: { photoId: payload.photo.id, url: payload.photo.blobUrl, x: 180, y: 240, scale: 1 },
      }));
      setSelectedSubject(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Import du sujet impossible.");
    } finally {
      setUploadingSubject(false);
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
  const matchLogoAssetsById = new Map<string, MatchLogoAsset>();
  photos.forEach((photo) => {
    if (photo.workspaceId !== project.workspaceId || !isAllowedMatchLogoPath(photo.blobPathname)) return;
    matchLogoAssetsById.set(photo.id, {
      id: photo.id,
      url: photo.blobUrl,
      name: `Logo workspace ${matchLogoAssetsById.size + 1}`,
    });
  });
  brandKits.forEach((brandKit) => {
    if (brandKit.workspaceId !== project.workspaceId) return;
    const brandLogos = [
      { id: brandKit.lightLogoPhotoId, url: brandKit.lightLogoUrl, name: `${brandKit.name} · clair` },
      { id: brandKit.darkLogoPhotoId, url: brandKit.darkLogoUrl, name: `${brandKit.name} · foncé` },
    ];
    brandLogos.forEach((logo) => {
      if (logo.id && logo.url && isAllowedMatchLogoUrl(logo.url)) {
        matchLogoAssetsById.set(logo.id, { id: logo.id, url: logo.url, name: logo.name });
      }
    });
  });
  const matchLogoAssets = [...matchLogoAssetsById.values()];
  const activePhoto = frame.photo.assetId ? photos.find((photo) => photo.id === frame.photo.assetId) : null;
  const canvasFormat = draft.canvasFormat ?? DEFAULT_STORY_STUDIO_CANVAS_FORMAT;
  const template = getStoryStudioTemplate(draft.templateKey, canvasFormat);
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
          <h1>Éditeur {template.canvas.width} × {template.canvas.height}</h1>
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
        <div className={styles.stage} aria-busy={rendering} style={{ aspectRatio: `${template.canvas.width} / ${template.canvas.height}` }}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            aria-label="Story en cours d'édition"
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerEnd}
            onPointerCancel={onCanvasPointerEnd}
          />
          {(textBounds || logoBounds || subjectBounds) && (
            <div className={styles.textSelectionLayer} aria-hidden="true">
              {textBounds && (Object.entries(textBounds) as [StoryStudioTextBlock, StoryStudioTextBounds[StoryStudioTextBlock]][]).map(([block, bound]) => (
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
              {logoBounds && (
                <span
                  className={`${styles.textSelection} ${selectedLogo ? styles.activeTextSelection : ""}`}
                  data-label="LOGO"
                  style={{
                    left: `${logoBounds.x / template.canvas.width * 100}%`,
                    top: `${logoBounds.y / template.canvas.height * 100}%`,
                    width: `${logoBounds.width / template.canvas.width * 100}%`,
                    height: `${logoBounds.height / template.canvas.height * 100}%`,
                  }}
                />
              )}
              {subjectBounds && (
                <span
                  className={`${styles.subjectSelection} ${selectedSubject ? styles.activeSubjectSelection : ""}`}
                  data-label="SUJET"
                  style={{
                    left: `${subjectBounds.x / template.canvas.width * 100}%`,
                    top: `${subjectBounds.y / template.canvas.height * 100}%`,
                    width: `${subjectBounds.width / template.canvas.width * 100}%`,
                    height: `${subjectBounds.height / template.canvas.height * 100}%`,
                  }}
                />
              )}
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
            <span className={styles.controlLabel}>Format</span>
            <div className={styles.templateTabs} role="radiogroup" aria-label="Format du projet">
              {([
                ["1080x1920", "Story · 1080 × 1920"],
                ["1080x1350", "Portrait · 1080 × 1350"],
              ] as const satisfies ReadonlyArray<readonly [StoryStudioCanvasFormat, string]>).map(([format, label]) => (
                <button
                  key={format}
                  type="button"
                  role="radio"
                  aria-checked={canvasFormat === format}
                  className={canvasFormat === format ? styles.activeTemplate : ""}
                  onClick={() => setDraft((current) => current ? { ...current, canvasFormat: format } : current)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

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

          {canvasFormat === "1080x1350" && (
            <section className={styles.frameModelTools} aria-label="Modèles de frame">
              <span className={styles.controlLabel}>Modèles de frame</span>
              <div className={styles.frameModelCommands}>
                <button
                  type="button"
                  onClick={() => {
                    setFrameModelPanel("save");
                    setFrameModelMessage(null);
                  }}
                >
                  Enregistrer comme modèle
                </button>
                <button
                  type="button"
                  disabled={frameModels.length === 0}
                  onClick={() => {
                    setFrameModelPanel("apply");
                    setPendingFrameModelId("");
                    setFrameModelMessage(null);
                  }}
                >
                  Appliquer un modèle
                </button>
              </div>

              {frameModelPanel === "save" && (
                <div className={styles.frameModelPanel}>
                  <label>
                    <span>Nom du modèle</span>
                    <input
                      aria-label="Nom du modèle de frame"
                      maxLength={80}
                      value={frameModelName}
                      onChange={(event) => setFrameModelName(event.target.value)}
                    />
                  </label>
                  <p>La photo et les données du match ne seront pas enregistrées.</p>
                  <div className={styles.frameModelActions}>
                    <button type="button" onClick={() => setFrameModelPanel("closed")}>Annuler</button>
                    <button
                      type="button"
                      disabled={frameModelBusy || !frameModelName.trim()}
                      onClick={() => void saveActiveFrameModel()}
                    >
                      {frameModelBusy ? "Enregistrement…" : "Enregistrer le modèle"}
                    </button>
                  </div>
                </div>
              )}

              {frameModelPanel === "apply" && (
                <div className={styles.frameModelPanel}>
                  <label>
                    <span>Modèle</span>
                    <select
                      aria-label="Modèle de frame à appliquer"
                      value={pendingFrameModelId}
                      onChange={(event) => setPendingFrameModelId(event.target.value)}
                    >
                      <option value="">Choisir un modèle</option>
                      {frameModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                    </select>
                  </label>
                  {pendingFrameModelId && (
                    <div className={styles.frameModelConfirmation} role="alertdialog" aria-label="Confirmer l’application du modèle">
                      <strong>Champs remplacés après confirmation</strong>
                      <ul>
                        <li>Style visuel du projet</li>
                        <li>Brand Kit par défaut du projet</li>
                        <li>Textes de la frame active</li>
                        <li>Visibilité des éléments de la frame active</li>
                        <li>Positions des textes et du logo de la frame active</li>
                      </ul>
                      <p>La photo du projet et les données du match restent inchangées.</p>
                      <div className={styles.frameModelActions}>
                        <button type="button" onClick={() => setFrameModelPanel("closed")}>Annuler</button>
                        <button type="button" onClick={applyPendingFrameModel}>Confirmer l’application</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {frameModelMessage && <p className={styles.frameModelMessage} role="status">{frameModelMessage}</p>}
            </section>
          )}

          {logoBounds && (
            <div className={styles.cropControls}>
              <label>
                <span>Taille du logo <output>{logoBounds.layout.scale.toFixed(2)}×</output></span>
                <input
                  aria-label="Taille du logo du Brand Kit"
                  type="range"
                  min="0.25"
                  max="4"
                  step="0.05"
                  value={logoBounds.layout.scale}
                  onChange={(event) => updateLogoLayout(
                    logoBounds.layout.x,
                    logoBounds.layout.y,
                    Number(event.target.value),
                  )}
                />
              </label>
            </div>
          )}

          {canvasFormat === "1080x1350" && !frame.matchCard && (
            <button type="button" className={styles.resetLayoutButton} onClick={addMatchCard}>
              Ajouter un bloc match
            </button>
          )}

          {canvasFormat === "1080x1350" && frame.matchCard && (
            <div className={styles.textFields}>
              <span className={styles.controlLabel}>Bloc match</span>
              <label>
                <span>Compétition</span>
                <input
                  aria-label="Compétition du match"
                  maxLength={120}
                  value={frame.matchCard.competition}
                  onChange={(event) => updateActiveMatchCard((matchCard) => ({ ...matchCard, competition: event.target.value }))}
                />
              </label>
              <label>
                <span>Équipe domicile</span>
                <input
                  aria-label="Équipe domicile"
                  maxLength={80}
                  value={frame.matchCard.homeTeam.name}
                  onChange={(event) => updateActiveMatchCard((matchCard) => ({
                    ...matchCard,
                    homeTeam: { ...matchCard.homeTeam, name: event.target.value },
                  }))}
                />
              </label>
              <MatchLogoPicker
                label="Logo domicile"
                assets={matchLogoAssets}
                selectedId={frame.matchCard.homeTeam.logoPhotoId}
                selectedUrl={frame.matchCard.homeTeam.logoUrl}
                onSelect={(asset) => updateMatchTeamLogo("homeTeam", asset)}
              />
              <label>
                <span>Score domicile</span>
                <input
                  aria-label="Score domicile"
                  type="number"
                  min="0"
                  max="99"
                  value={frame.matchCard.homeScore}
                  onChange={(event) => updateActiveMatchCard((matchCard) => ({
                    ...matchCard,
                    homeScore: Math.min(99, Math.max(0, Math.trunc(Number(event.target.value) || 0))),
                  }))}
                />
              </label>
              <label>
                <span>Équipe extérieure</span>
                <input
                  aria-label="Équipe extérieure"
                  maxLength={80}
                  value={frame.matchCard.awayTeam.name}
                  onChange={(event) => updateActiveMatchCard((matchCard) => ({
                    ...matchCard,
                    awayTeam: { ...matchCard.awayTeam, name: event.target.value },
                  }))}
                />
              </label>
              <MatchLogoPicker
                label="Logo extérieur"
                assets={matchLogoAssets}
                selectedId={frame.matchCard.awayTeam.logoPhotoId}
                selectedUrl={frame.matchCard.awayTeam.logoUrl}
                onSelect={(asset) => updateMatchTeamLogo("awayTeam", asset)}
              />
              <label>
                <span>Score extérieur</span>
                <input
                  aria-label="Score extérieur"
                  type="number"
                  min="0"
                  max="99"
                  value={frame.matchCard.awayScore}
                  onChange={(event) => updateActiveMatchCard((matchCard) => ({
                    ...matchCard,
                    awayScore: Math.min(99, Math.max(0, Math.trunc(Number(event.target.value) || 0))),
                  }))}
                />
              </label>
              <button
                type="button"
                className={styles.resetLayoutButton}
                onClick={() => updateActiveFrame(({ matchCard: _matchCard, ...activeFrame }) => activeFrame)}
              >
                Retirer le bloc match
              </button>
            </div>
          )}

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
            <button type="button" className={styles.resetLayoutButton} onClick={resetLayout}>
              <RotateCcw size={16} />
              Réinitialiser la disposition
            </button>
          </div>

          <div>
            <span className={styles.controlLabel}>Catalogue photo</span>
            <div className={styles.photoCatalog}>
              {photos.filter((photo) => photo.blobPathname.startsWith("story-studio/photos/")).map((photo) => (
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
            <span className={styles.controlLabel}>Sujet détouré</span>
            <label className={styles.photoPicker}>
              {uploadingSubject ? <LoaderCircle size={18} className={styles.spin} /> : <ImagePlus size={18} />}
              {uploadingSubject ? "Import…" : frame.subjectLayer ? "Remplacer le PNG" : "Importer un PNG transparent"}
              <input
                type="file"
                accept="image/png"
                disabled={uploadingSubject}
                onChange={(event) => void importSubject(event.target.files?.[0])}
              />
            </label>
            {frame.subjectLayer && (
              <>
                <label>
                  <span>Taille <output>{frame.subjectLayer.scale.toFixed(2)}×</output></span>
                  <input
                    type="range"
                    aria-label="Taille du sujet détouré"
                    min="0.1"
                    max="4"
                    step="0.05"
                    value={frame.subjectLayer.scale}
                    onChange={(event) => updateActiveFrame((activeFrame) => activeFrame.subjectLayer ? {
                      ...activeFrame,
                      subjectLayer: { ...activeFrame.subjectLayer, scale: Number(event.target.value) },
                    } : activeFrame)}
                  />
                </label>
                <button
                  type="button"
                  className={styles.resetLayoutButton}
                  onClick={() => updateActiveFrame(({ subjectLayer: _subjectLayer, ...activeFrame }) => activeFrame)}
                >
                  Retirer le sujet détouré
                </button>
              </>
            )}
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