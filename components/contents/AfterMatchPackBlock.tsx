"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Film, GalleryVerticalEnd, RefreshCw, Sparkles } from "lucide-react";
import type { PublicationDocument } from "@/types/content-document";

type PackStatus = "pending" | "generating" | "partial" | "completed" | "failed";
type DeliverableStatus = "pending" | "generating" | "completed" | "failed";
type Deliverable = "reel" | "stories";

type PublicPack = {
  id: string;
  kind: "after_match";
  status: PackStatus;
  source: {
    documentId: string;
    revision: number;
    versionId: string;
    updatedAt: string;
  };
  reel: { status: DeliverableStatus; variantId?: string; errorCode?: string };
  stories: { status: DeliverableStatus; variantId?: string; errorCode?: string };
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type PackResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  pack?: PublicPack | null;
};

type AfterMatchPackBlockProps = {
  document: PublicationDocument;
  isPersistedInCloud: boolean;
  hasUnsavedChanges: boolean;
  sourceDocumentRevision?: number | null;
  onOpenSource: () => void;
  onOpenVariant: (variantId: string) => Promise<void>;
};

export const AFTER_MATCH_PACK_POLL_INTERVAL_MS = 3000;

const statusLabel = (deliverable: Deliverable, status: DeliverableStatus): string => {
  if (status === "pending") return "À créer";
  if (status === "generating") return "Génération en cours";
  if (status === "completed") return deliverable === "stories" ? "Prêtes" : "Prêt";
  return "Échec";
};

const globalStatusMessage = (status: PackStatus): string => {
  if (status === "pending") return "Le Pack est prêt à être lancé.";
  if (status === "generating") return "Création du Pack en cours…";
  if (status === "partial") return "Une partie du Pack est prête. Vous pouvez relancer uniquement le contenu manquant.";
  if (status === "completed") return "Votre Pack Après-match est prêt.";
  return "Le Pack n’a pas pu être terminé.";
};

const globalStatusLabel = (status: PackStatus): string => {
  if (status === "pending") return "Prêt";
  if (status === "generating") return "En cours";
  if (status === "partial") return "Partiel";
  if (status === "completed") return "Prêt";
  return "Échec";
};

const userErrorMessage = (status: number, code?: string): string => {
  if (status === 402) return "Crédits IA insuffisants pour créer ce contenu.";
  if (status === 409 && code === "SOURCE_VERSION_CONFLICT") {
    return "La Publication a été modifiée. Enregistrez-la ou rechargez-la avant de continuer.";
  }
  if (status === 409 && code === "PACK_IN_PROGRESS") return "La création est déjà en cours. Son suivi a été restauré.";
  if (status === 404) return "Le Pack ou la Publication est introuvable.";
  return "Échec temporaire. Réessayez plus tard. Si le problème persiste, contactez KLIQUE.";
};

const readPayload = async (response: Response): Promise<PackResponse> => {
  try {
    return await response.json() as PackResponse;
  } catch {
    return {};
  }
};

export function AfterMatchPackBlock({
  document,
  isPersistedInCloud,
  hasUnsavedChanges,
  sourceDocumentRevision,
  onOpenSource,
  onOpenVariant,
}: AfterMatchPackBlockProps) {
  const [pack, setPack] = useState<PublicPack | null>(null);
  const [resolvedRevision, setResolvedRevision] = useState<number | null>(sourceDocumentRevision ?? null);
  const [loading, setLoading] = useState(false);
  const [busyDeliverable, setBusyDeliverable] = useState<Deliverable | "pack" | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMedia, setIsMedia] = useState(false);
  const busyRef = useRef(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const canUsePack = isPersistedInCloud && !hasUnsavedChanges;

  useEffect(() => {
    setResolvedRevision(sourceDocumentRevision ?? null);
  }, [sourceDocumentRevision, document.id]);

  useEffect(() => {
    if (!canUsePack) return;
    const controller = new AbortController();

    const identifyMedia = async () => {
      try {
        const response = await fetch("/api/ai-credits/balance", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as { ok?: boolean } | null;
        if (!controller.signal.aborted) setIsMedia(response.ok && payload?.ok === true);
      } catch {
        if (!controller.signal.aborted) setIsMedia(false);
      }
    };

    void identifyMedia();
    return () => controller.abort();
  }, [canUsePack, document.id]);

  useEffect(() => {
    if (!canUsePack) {
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const restore = async () => {
      setLoading(true);
      setError(null);
      try {
        let revision = sourceDocumentRevision ?? null;
        if (revision === null) {
          const draftResponse = await fetch(`/api/contents/storage/drafts/${encodeURIComponent(document.id)}`, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          });
          const draftPayload = await draftResponse.json().catch(() => null) as { version?: number } | null;
          if (!draftResponse.ok || !Number.isSafeInteger(draftPayload?.version) || Number(draftPayload?.version) < 1) {
            throw new Error("SOURCE_REVISION_UNAVAILABLE");
          }
          revision = Number(draftPayload?.version);
        }

        const query = new URLSearchParams({
          sourceDocumentId: document.id,
          sourceDocumentRevision: String(revision),
        });
        const response = await fetch(`/api/contents/packs/after-match?${query.toString()}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await readPayload(response);
        if (!response.ok) throw new Error(userErrorMessage(response.status, payload.code));
        if (!active) return;
        setResolvedRevision(revision);
        setPack(payload.pack ?? null);
      } catch (caught) {
        if (!active || controller.signal.aborted) return;
        setError(caught instanceof Error && caught.message !== "SOURCE_REVISION_UNAVAILABLE"
          ? caught.message
          : "Impossible de restaurer le Pack pour le moment.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void restore();
    return () => {
      active = false;
      controller.abort();
    };
  }, [canUsePack, document.activeVersionId, document.id, document.updatedAt, sourceDocumentRevision]);

  useEffect(() => {
    if (pack?.status !== "generating") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch(`/api/contents/packs/after-match/${encodeURIComponent(pack.id)}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await readPayload(response);
        if (!response.ok) throw new Error(userErrorMessage(response.status, payload.code));
        if (!active || !payload.pack) return;
        setPack(payload.pack);
        if (payload.pack.status === "generating") {
          timer = setTimeout(() => void poll(), AFTER_MATCH_PACK_POLL_INTERVAL_MS);
        }
      } catch (caught) {
        if (!active || controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : userErrorMessage(500));
      }
    };

    timer = setTimeout(() => void poll(), AFTER_MATCH_PACK_POLL_INTERVAL_MS);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [pack?.id, pack?.status]);

  useEffect(() => {
    if (confirmationOpen) confirmButtonRef.current?.focus();
  }, [confirmationOpen]);

  useEffect(() => {
    if (error) feedbackRef.current?.focus();
  }, [error]);

  const finishRequest = (nextPack: PublicPack | null | undefined) => {
    if (nextPack !== undefined) setPack(nextPack);
    requestAnimationFrame(() => statusRef.current?.focus());
  };

  const createPack = async () => {
    if (busyRef.current || resolvedRevision === null) return;
    busyRef.current = true;
    setBusyDeliverable("pack");
    setError(null);
    try {
      const response = await fetch("/api/contents/packs/after-match", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceDocumentId: document.id,
          sourceDocumentRevision: resolvedRevision,
          sourceDocumentVersionId: document.activeVersionId,
          sourceDocumentUpdatedAt: document.updatedAt,
        }),
      });
      const payload = await readPayload(response);
      if (response.status === 409 && payload.code === "PACK_IN_PROGRESS" && payload.pack) {
        finishRequest(payload.pack);
      } else if (!response.ok) {
        if (payload.pack) setPack(payload.pack);
        throw new Error(userErrorMessage(response.status, payload.code));
      } else {
        finishRequest(payload.pack);
      }
      setConfirmationOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : userErrorMessage(500));
    } finally {
      busyRef.current = false;
      setBusyDeliverable(null);
    }
  };

  const resumeDeliverable = async (deliverable: Deliverable) => {
    if (busyRef.current || !pack || pack[deliverable].status !== "failed") return;
    busyRef.current = true;
    setBusyDeliverable(deliverable);
    setError(null);
    try {
      const response = await fetch(`/api/contents/packs/after-match/${encodeURIComponent(pack.id)}/resume`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deliverables: [deliverable] }),
      });
      const payload = await readPayload(response);
      if (response.status === 409 && payload.code === "PACK_IN_PROGRESS" && payload.pack) {
        finishRequest(payload.pack);
      } else if (!response.ok) {
        if (payload.pack) setPack(payload.pack);
        throw new Error(userErrorMessage(response.status, payload.code));
      } else {
        finishRequest(payload.pack);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : userErrorMessage(500));
    } finally {
      busyRef.current = false;
      setBusyDeliverable(null);
    }
  };

  const openVariant = async (variantId: string) => {
    setError(null);
    try {
      await onOpenVariant(variantId);
    } catch {
      setError("Impossible d’ouvrir ce contenu pour le moment.");
    }
  };

  const reelStatus = pack?.reel.status ?? "pending";
  const storiesStatus = pack?.stories.status ?? "pending";

  return (
    <section
      className="document-section after-match-pack"
      aria-labelledby="after-match-pack-title"
      aria-busy={loading || busyDeliverable !== null || pack?.status === "generating"}
    >
      <header className="after-match-pack-header">
        <div>
          <p className="document-editor-kicker">APRÈS-MATCH</p>
          <h2 id="after-match-pack-title">Pack Après-match</h2>
        </div>
        {pack ? <span className={`after-match-pack-status is-${pack.status}`}>{globalStatusLabel(pack.status)}</span> : null}
      </header>

      <p>Transformez cette publication en script de Reel et en séquence de Stories, à partir des mêmes informations de match.</p>

      {!canUsePack ? (
        <p className="after-match-pack-disabled">Enregistrez cette publication avant de créer ou reprendre son Pack.</p>
      ) : loading ? (
        <p role="status" aria-live="polite">Restauration du Pack…</p>
      ) : (
        <>
          <p ref={statusRef} tabIndex={-1} className="after-match-pack-message" role="status" aria-live="polite">
            {pack ? globalStatusMessage(pack.status) : "Le Pack est prêt à être lancé."}
          </p>

          <div className="after-match-pack-items">
            <article className="after-match-pack-item">
              <FileText size={18} aria-hidden />
              <div><strong>Publication</strong><span>Prête</span></div>
              <button type="button" className="contents-ghost-button" onClick={onOpenSource}>Modifier la publication</button>
            </article>
            <article className="after-match-pack-item">
              <Film size={18} aria-hidden />
              <div><strong>Reel</strong><span>{statusLabel("reel", reelStatus)}</span></div>
              {reelStatus === "completed" && pack?.reel.variantId ? (
                <button type="button" className="contents-ghost-button" onClick={() => void openVariant(pack.reel.variantId!)}>Ouvrir le Reel</button>
              ) : reelStatus === "failed" ? (
                <button type="button" className="contents-ghost-button" disabled={busyDeliverable !== null} onClick={() => void resumeDeliverable("reel")}>
                  <RefreshCw size={14} aria-hidden /> {busyDeliverable === "reel" ? "Relance…" : "Relancer le Reel"}
                </button>
              ) : null}
            </article>
            <article className="after-match-pack-item">
              <GalleryVerticalEnd size={18} aria-hidden />
              <div><strong>Stories</strong><span>{statusLabel("stories", storiesStatus)}</span></div>
              {storiesStatus === "completed" && pack?.stories.variantId ? (
                <button type="button" className="contents-ghost-button" onClick={() => void openVariant(pack.stories.variantId!)}>Ouvrir les Stories</button>
              ) : storiesStatus === "failed" ? (
                <button type="button" className="contents-ghost-button" disabled={busyDeliverable !== null} onClick={() => void resumeDeliverable("stories")}>
                  <RefreshCw size={14} aria-hidden /> {busyDeliverable === "stories" ? "Relance…" : "Relancer les Stories"}
                </button>
              ) : null}
            </article>
          </div>

          {(!pack || pack.status === "pending") ? (
            <div className="after-match-pack-create">
              {isMedia ? <p>Cette opération peut utiliser deux crédits IA.</p> : null}
              <button
                ref={createButtonRef}
                type="button"
                className="crm-primary-action"
                disabled={busyDeliverable !== null || resolvedRevision === null}
                onClick={() => setConfirmationOpen(true)}
              >
                <Sparkles size={15} aria-hidden /> Créer le Pack Après-match
              </button>
            </div>
          ) : null}
        </>
      )}

      {error ? <p ref={feedbackRef} tabIndex={-1} className="document-save-error" role="alert">{error}</p> : null}

      {confirmationOpen ? (
        <div className="after-match-pack-confirmation" role="dialog" aria-modal="true" aria-labelledby="after-match-pack-confirmation-title">
          <div className="after-match-pack-confirmation-panel">
            <h3 id="after-match-pack-confirmation-title">Créer le Pack Après-match</h3>
            <p>KLIQUE va créer un script de Reel et une séquence de Stories à partir de cette publication.</p>
            {isMedia ? <p>Cette opération peut utiliser deux crédits IA.</p> : null}
            <div className="after-match-pack-confirmation-actions">
              <button
                type="button"
                className="contents-ghost-button"
                disabled={busyDeliverable !== null}
                onClick={() => {
                  setConfirmationOpen(false);
                  requestAnimationFrame(() => createButtonRef.current?.focus());
                }}
              >
                Annuler
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                className="crm-primary-action"
                disabled={busyDeliverable !== null}
                onClick={() => void createPack()}
              >
                {busyDeliverable === "pack" ? "Création…" : "Confirmer la création"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}