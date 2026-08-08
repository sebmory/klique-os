"use client";

import { useState } from "react";
import { Copy, ExternalLink, FileImage, Film, FolderOpen } from "lucide-react";
import type { Production } from "@/types/production";
import type { ProductionMediaSummary } from "@/services/production-media";
import { ProductionMediaStatusBadge } from "@/components/production/ProductionMediaStatusBadge";
import { ProductionWorkflowWarnings } from "@/components/production/ProductionWorkflowWarnings";

type ProductionMediaSectionProps = {
  production: Production;
  media: ProductionMediaSummary;
};

const pluralize = (count: number, singular: string, plural: string): string => {
  return `${count} ${count > 1 ? plural : singular}`;
};

const displayStateTone = (state: "completed" | "pending" | "inconsistent"): string => {
  if (state === "completed") return "is-success";
  if (state === "inconsistent") return "is-danger";
  return "is-neutral";
};

const buildCopySummary = (title: string, media: ProductionMediaSummary): string => {
  const driveState = media.hasValidDriveUrl ? "lien disponible" : "aucun lien valide";
  return [
    `Production : ${title}`,
    `Photos : ${media.photoCount}`,
    `Videos : ${media.videoCount}`,
    `Total medias : ${media.totalMediaCount}`,
    `Export : ${media.exportLabel}`,
    `Publication : ${media.publicationLabel}`,
    `Drive : ${driveState}`,
  ].join("\n");
};

export function ProductionMediaSection({ production, media }: ProductionMediaSectionProps) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const copyDriveLink = async () => {
    if (!media.hasValidDriveUrl) return;
    try {
      await navigator.clipboard.writeText(media.driveUrl);
      setFeedback("Lien Drive copie");
      window.setTimeout(() => setFeedback(null), 1600);
    } catch {
      setFeedback("Copie du lien impossible");
      window.setTimeout(() => setFeedback(null), 1600);
    }
  };

  const copySummary = async () => {
    const title = `${production.type} • ${production.athlete}`;
    try {
      await navigator.clipboard.writeText(buildCopySummary(title, media));
      setFeedback("Resume copie");
      window.setTimeout(() => setFeedback(null), 1600);
    } catch {
      setFeedback("Copie du resume impossible");
      window.setTimeout(() => setFeedback(null), 1600);
    }
  };

  return (
    <section className="crm-person-card-shell production-media-section" aria-label="Medias lies">
      <header className="production-media-head">
        <h2>Medias lies</h2>
        <ProductionMediaStatusBadge status={media.mediaStatus} label={media.mediaStatusLabel} />
      </header>

      <div className="production-media-grid">
        <article className="production-media-block">
          <h3>Resume des medias</h3>
          <div className="production-media-counters">
            <div>
              <strong>{media.photoCount}</strong>
              <small>{pluralize(media.photoCount, "photo", "photos")}</small>
              <span aria-hidden><FileImage size={15} /></span>
            </div>
            <div>
              <strong>{media.videoCount}</strong>
              <small>{pluralize(media.videoCount, "video", "videos")}</small>
              <span aria-hidden><Film size={15} /></span>
            </div>
            <div>
              <strong>{media.totalMediaCount}</strong>
              <small>{pluralize(media.totalMediaCount, "media", "medias")}</small>
              <span aria-hidden><FolderOpen size={15} /></span>
            </div>
          </div>
        </article>

        <article className="production-media-block">
          <h3>Stockage</h3>
          {media.hasValidDriveUrl ? (
            <div className="production-storage-state">
              <p><strong>{media.storage.providerLabel}</strong> • {media.storage.resourceType === "folder" ? "Dossier lie" : "Lien lie"}</p>
              <small title={media.driveUrl}>{media.storage.shortUrl}</small>
              <a
                href={media.driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="crm-secondary-action-link"
              >
                <ExternalLink size={14} aria-hidden /> {media.storage.actionLabel}
              </a>
            </div>
          ) : (
            <div className="crm-person-empty-note production-media-empty-inline">
              <p>Aucun espace de stockage lie</p>
              <small>Les medias comptabilises ne possedent pas encore de lien de stockage accessible depuis KLIQUE OS.</small>
            </div>
          )}
        </article>

        <article className="production-media-block">
          <h3>Etat des contenus</h3>
          <dl className="production-media-state-list">
            <div>
              <dt>Export</dt>
              <dd><span className={`production-inline-state ${displayStateTone(media.exportState)}`}>{media.exportLabel}</span></dd>
            </div>
            <div>
              <dt>Publication</dt>
              <dd><span className={`production-inline-state ${displayStateTone(media.publicationState)}`}>{media.publicationLabel}</span></dd>
            </div>
            <div>
              <dt>Disponibilite</dt>
              <dd>{media.availabilityLabel}</dd>
            </div>
          </dl>
        </article>

        <article className="production-media-block">
          <h3>Actions</h3>
          <div className="production-media-actions">
            {media.hasValidDriveUrl ? (
              <a href={media.driveUrl} target="_blank" rel="noopener noreferrer" className="crm-hero-ghost-action">
                <ExternalLink size={15} aria-hidden /> {media.storage.actionLabel}
              </a>
            ) : null}
            {media.hasValidDriveUrl ? (
              <button type="button" className="crm-hero-ghost-action" onClick={copyDriveLink}>
                <Copy size={15} aria-hidden /> Copier le lien Drive
              </button>
            ) : null}
            <button type="button" className="crm-hero-ghost-action" onClick={copySummary}>
              <Copy size={15} aria-hidden /> Copier le resume
            </button>
          </div>
          <p className="production-media-feedback" aria-live="polite">{feedback ?? ""}</p>
        </article>
      </div>

      {!media.hasMedia && !media.hasValidDriveUrl ? (
        <div className="production-media-empty-state">
          <strong>Aucun media renseigne</strong>
          <p>Cette production ne contient actuellement aucun media comptabilise ni dossier lie.</p>
        </div>
      ) : null}

      {media.hasMedia && !media.hasValidDriveUrl ? (
        <div className="production-media-empty-state">
          <strong>Medias a centraliser</strong>
          <p>Des contenus sont comptabilises, mais aucun dossier accessible n est lie a cette production.</p>
        </div>
      ) : null}

      {!media.hasMedia && media.hasValidDriveUrl ? (
        <div className="production-media-empty-state">
          <strong>Dossier lie, comptage indisponible</strong>
          <p>Un espace de stockage existe, mais le nombre de medias n est pas renseigne.</p>
        </div>
      ) : null}

      <ProductionWorkflowWarnings inconsistencies={media.warnings} title="Points a verifier" />

      <p className="production-media-preview-note">Les apercus de fichiers seront disponibles lorsque les medias individuels seront connectes.</p>
    </section>
  );
}
