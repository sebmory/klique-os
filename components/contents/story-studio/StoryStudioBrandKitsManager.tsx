"use client";

import { upload } from "@vercel/blob/client";
import { ImagePlus, LoaderCircle, LockKeyhole, Plus, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  storyStudioBrandKitFonts,
  storyStudioBrandKitSignatureModes,
  type StoryStudioBrandKit,
  type StoryStudioBrandKitInput,
} from "@/types/story-studio-brand-kit";
import {
  MAX_STORY_STUDIO_PHOTO_BYTES,
  STORY_STUDIO_PHOTO_CONTENT_TYPES,
  type StoryStudioPhoto,
} from "@/types/story-studio-photo";
import styles from "./story-studio-brand-kits.module.css";

type LogoField = "lightLogoPhotoId" | "darkLogoPhotoId";

const emptyKit: StoryStudioBrandKitInput = {
  name: "",
  primaryColor: "#000000",
  secondaryColor: "#FFFFFF",
  accentColor: "#F2B800",
  textColor: "#FFFFFF",
  mutedTextColor: "#D9D9D9",
  lightLogoPhotoId: null,
  darkLogoPhotoId: null,
  fontFamily: "Georgia",
  signatureMode: "visible",
};

const colors: Array<{ key: keyof Pick<StoryStudioBrandKitInput, "primaryColor" | "secondaryColor" | "accentColor" | "textColor" | "mutedTextColor">; label: string }> = [
  { key: "primaryColor", label: "Principale" },
  { key: "secondaryColor", label: "Secondaire" },
  { key: "accentColor", label: "Accent" },
  { key: "textColor", label: "Texte" },
  { key: "mutedTextColor", label: "Texte secondaire" },
];

const signatureLabels = {
  visible: "Visible",
  discreet: "Discrète",
  hidden: "Masquée",
} as const;

const responseMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) return fallback;
    const body = await response.text();
    if (!body.trim()) return fallback;
    return (JSON.parse(body) as { message?: string }).message || fallback;
  } catch {
    return fallback;
  }
};

const readJsonResponse = async <Payload,>(response: Response, fallback: string): Promise<Payload> => {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) throw new Error(fallback);
  const body = await response.text();
  if (!body.trim()) throw new Error(fallback);
  try {
    return JSON.parse(body) as Payload;
  } catch {
    throw new Error(fallback);
  }
};

const toInput = (kit: StoryStudioBrandKit): StoryStudioBrandKitInput => ({
  name: kit.name,
  primaryColor: kit.primaryColor,
  secondaryColor: kit.secondaryColor,
  accentColor: kit.accentColor,
  textColor: kit.textColor,
  mutedTextColor: kit.mutedTextColor,
  lightLogoPhotoId: kit.lightLogoPhotoId,
  darkLogoPhotoId: kit.darkLogoPhotoId,
  fontFamily: kit.fontFamily,
  signatureMode: kit.signatureMode,
});

type LogoPickerProps = {
  label: string;
  field: LogoField;
  selectedId: string | null;
  photos: StoryStudioPhoto[];
  uploading: LogoField | null;
  onSelect: (field: LogoField, photoId: string | null) => void;
  onImport: (field: LogoField, file: File | undefined) => void;
};

function LogoPicker({ label, field, selectedId, photos, uploading, onSelect, onImport }: LogoPickerProps) {
  return (
    <fieldset className={styles.logoPicker}>
      <legend>{label}</legend>
      <div className={styles.logoGrid}>
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            aria-label={`${label} · ${photo.id}`}
            aria-pressed={selectedId === photo.id}
            className={selectedId === photo.id ? styles.selectedLogo : ""}
            style={{ backgroundImage: `url("${photo.blobUrl}")` }}
            onClick={() => onSelect(field, photo.id)}
          />
        ))}
      </div>
      <div className={styles.logoActions}>
        <label className={styles.importButton}>
          {uploading === field ? <LoaderCircle size={16} className={styles.spin} /> : <ImagePlus size={16} />}
          {uploading === field ? "Import…" : "Importer"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading !== null}
            onChange={(event) => onImport(field, event.target.files?.[0])}
          />
        </label>
        <button type="button" className={styles.clearButton} onClick={() => onSelect(field, null)} disabled={!selectedId} title="Retirer le logo">
          <X size={16} />
        </button>
      </div>
    </fieldset>
  );
}

export function StoryStudioBrandKitsManager() {
  const [brandKits, setBrandKits] = useState<StoryStudioBrandKit[]>([]);
  const [photos, setPhotos] = useState<StoryStudioPhoto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StoryStudioBrandKitInput>(emptyKit);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<LogoField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedKit = brandKits.find((kit) => kit.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [kitsResponse, photosResponse] = await Promise.all([
          fetch("/api/contents/storage/story-studio/brand-kits", { credentials: "include", cache: "no-store" }),
          fetch("/api/contents/storage/story-studio/photos", { credentials: "include", cache: "no-store" }),
        ]);
        if (!kitsResponse.ok) throw new Error(await responseMessage(kitsResponse, "Brand Kits indisponibles."));
        if (!photosResponse.ok) throw new Error(await responseMessage(photosResponse, "Catalogue photo indisponible."));
        const kitsPayload = await kitsResponse.json() as { brandKits?: StoryStudioBrandKit[] };
        const photosPayload = await photosResponse.json() as { photos?: StoryStudioPhoto[] };
        if (!active) return;
        const kits = kitsPayload.brandKits ?? [];
        const initialKit = kits.find((kit) => kit.isDefault) ?? kits[0] ?? null;
        setBrandKits(kits);
        setPhotos(photosPayload.photos ?? []);
        setSelectedId(initialKit?.id ?? null);
        setDraft(initialKit ? toInput(initialKit) : emptyKit);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const selectKit = (kit: StoryStudioBrandKit) => {
    setSelectedId(kit.id);
    setDraft(toInput(kit));
    setError(null);
    setMessage(null);
  };

  const startCreation = () => {
    setSelectedId(null);
    setDraft({ ...emptyKit });
    setError(null);
    setMessage(null);
  };

  const updateDraft = <Key extends keyof StoryStudioBrandKitInput>(key: Key, value: StoryStudioBrandKitInput[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        selectedId
          ? `/api/contents/storage/story-studio/brand-kits/${encodeURIComponent(selectedId)}`
          : "/api/contents/storage/story-studio/brand-kits",
        {
          method: selectedId ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      if (!response.ok) throw new Error(await responseMessage(response, "Enregistrement impossible."));
      const payload = await response.json() as { brandKit: StoryStudioBrandKit };
      setBrandKits((current) => {
        const exists = current.some((kit) => kit.id === payload.brandKit.id);
        return exists
          ? current.map((kit) => kit.id === payload.brandKit.id ? payload.brandKit : kit)
          : [...current, payload.brandKit];
      });
      setSelectedId(payload.brandKit.id);
      setDraft(toInput(payload.brandKit));
      setMessage(selectedId ? "Brand Kit enregistré." : "Brand Kit créé.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const importLogo = async (field: LogoField, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_STORY_STUDIO_PHOTO_BYTES) {
      setError("Le logo dépasse la limite de 25 Mo.");
      return;
    }
    if (!STORY_STUDIO_PHOTO_CONTENT_TYPES.includes(file.type as typeof STORY_STUDIO_PHOTO_CONTENT_TYPES[number])) {
      setError("Type d'image non autorisé. Formats acceptés: JPEG, PNG, WebP.");
      return;
    }
    setUploading(field);
    setError(null);
    try {
      const uploadApi = "/api/contents/storage/story-studio/photos";
      const intentResponse = await fetch(uploadApi, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create-upload-intent",
          athleteId: null,
          assetKind: "brandKitLogo",
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!intentResponse.ok) throw new Error(await responseMessage(intentResponse, "Import du logo impossible."));
      const intent = await readJsonResponse<{ pathname: string; uploadIntent: string }>(intentResponse, "Import du logo impossible.");
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
        throw new Error(await responseMessage(registrationResponse, "Enregistrement du logo impossible."));
      }
      const payload = await readJsonResponse<{ photo: StoryStudioPhoto }>(registrationResponse, "Enregistrement du logo impossible.");
      setPhotos((current) => [payload.photo, ...current.filter((photo) => photo.id !== payload.photo.id)]);
      updateDraft(field, payload.photo.id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Import du logo impossible.");
    } finally {
      setUploading(null);
    }
  };

  const photoUrl = (id: string | null) => photos.find((photo) => photo.id === id)?.blobUrl ?? null;
  const lightLogoUrl = photoUrl(draft.lightLogoPhotoId);
  const darkLogoUrl = photoUrl(draft.darkLogoPhotoId);

  if (loading) {
    return <main className={styles.page}><div className={styles.loading}><LoaderCircle size={22} className={styles.spin} />Chargement des Brand Kits…</div></main>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Story Studio</p>
          <h1>Brand Kits</h1>
        </div>
        <button type="button" className={styles.newButton} onClick={startCreation}><Plus size={18} />Nouveau kit</button>
      </header>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {message && <div className={styles.success} role="status">{message}</div>}

      <div className={styles.layout}>
        <nav className={styles.kitList} aria-label="Brand Kits du workspace">
          {brandKits.map((kit) => (
            <button
              key={kit.id}
              type="button"
              className={selectedId === kit.id ? styles.activeKit : ""}
              onClick={() => selectKit(kit)}
            >
              <span className={styles.swatches}>
                <i style={{ background: kit.primaryColor }} />
                <i style={{ background: kit.secondaryColor }} />
                <i style={{ background: kit.accentColor }} />
              </span>
              <span>{kit.name}</span>
              {kit.isDefault && <LockKeyhole size={15} aria-label="Kit par défaut protégé" />}
            </button>
          ))}
        </nav>

        <section className={styles.editor}>
          <div className={styles.formColumn}>
            <label className={styles.field}>
              <span>Nom</span>
              <input
                aria-label="Nom du Brand Kit"
                value={draft.name}
                disabled={selectedKit?.isDefault}
                onChange={(event) => updateDraft("name", event.target.value)}
              />
              {selectedKit?.isDefault && <small>Le nom KLIQUE est protégé.</small>}
            </label>

            <fieldset className={styles.colorFields}>
              <legend>Couleurs</legend>
              {colors.map(({ key, label }) => (
                <label key={key}>
                  <input type="color" aria-label={`Couleur ${label}`} value={draft[key]} onChange={(event) => updateDraft(key, event.target.value.toUpperCase())} />
                  <span>{label}</span>
                  <output>{draft[key]}</output>
                </label>
              ))}
            </fieldset>

            <label className={styles.field}>
              <span>Police</span>
              <select aria-label="Police du Brand Kit" value={draft.fontFamily} onChange={(event) => updateDraft("fontFamily", event.target.value as StoryStudioBrandKitInput["fontFamily"])}>
                {storyStudioBrandKitFonts.map((font) => <option key={font} value={font}>{font}</option>)}
              </select>
            </label>

            <fieldset className={styles.signatureModes}>
              <legend>Signature KLIQUE</legend>
              <div>
                {storyStudioBrandKitSignatureModes.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={draft.signatureMode === mode}
                    className={draft.signatureMode === mode ? styles.activeMode : ""}
                    onClick={() => updateDraft("signatureMode", mode)}
                  >
                    {signatureLabels[mode]}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className={styles.logoColumns}>
              <LogoPicker label="Logo clair" field="lightLogoPhotoId" selectedId={draft.lightLogoPhotoId} photos={photos} uploading={uploading} onSelect={updateDraft} onImport={(field, file) => void importLogo(field, file)} />
              <LogoPicker label="Logo foncé" field="darkLogoPhotoId" selectedId={draft.darkLogoPhotoId} photos={photos} uploading={uploading} onSelect={updateDraft} onImport={(field, file) => void importLogo(field, file)} />
            </div>

            <button type="button" className={styles.saveButton} onClick={() => void save()} disabled={saving || !draft.name.trim()}>
              {saving ? <LoaderCircle size={18} className={styles.spin} /> : <Save size={18} />}
              {saving ? "Enregistrement…" : selectedId ? "Enregistrer le kit" : "Créer le kit"}
            </button>
          </div>

          <aside className={styles.preview} aria-label="Aperçu du Brand Kit" style={{ fontFamily: draft.fontFamily }}>
            <div className={styles.previewPrimary} style={{ background: draft.primaryColor, color: draft.textColor }}>
              <span className={styles.previewAccent} style={{ background: draft.accentColor }} />
              {lightLogoUrl && <span className={styles.previewLogo} style={{ backgroundImage: `url("${lightLogoUrl}")` }} />}
              <small style={{ color: draft.mutedTextColor }}>APRÈS-MATCH</small>
              <strong>{draft.name || "Nouveau Brand Kit"}</strong>
              <p>Une identité cohérente pour chaque Story.</p>
              {draft.signatureMode !== "hidden" && <b style={{ opacity: draft.signatureMode === "discreet" ? 0.45 : 1 }}>KLIQUE</b>}
            </div>
            <div className={styles.previewSecondary} style={{ background: draft.secondaryColor }}>
              {darkLogoUrl && <span className={styles.previewLogo} style={{ backgroundImage: `url("${darkLogoUrl}")` }} />}
              <i style={{ background: draft.accentColor }} />
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}