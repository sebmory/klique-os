"use client";

import { useId, useState } from "react";
import type { EditorialGenerationMetadata } from "@/types/content-generation";

const confidenceLabels = {
  high: "Élevée",
  medium: "Moyenne",
  low: "Faible",
  unknown: "Inconnue",
} as const;

export function EditorialReliabilityPanel({
  metadata,
}: {
  metadata?: EditorialGenerationMetadata;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  if (!metadata) return null;

  const needsVerification = metadata.generationMode === "limited"
    || metadata.warnings.length > 0
    || metadata.missingInformation.length > 0
    || metadata.contradictions.length > 0;

  return (
    <section className="interview-section" data-testid="editorial-reliability-panel">
      <button
        type="button"
        className="contents-ghost-button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
      >
        Fiabilité et sources
      </button>
      <div id={contentId} hidden={!expanded}>
        <p>
          <strong>Mode :</strong>{" "}
          {metadata.generationMode === "ready" ? "Génération complète" : "Génération limitée"}
        </p>
        <p>
          <strong>Confiance :</strong>{" "}
          {confidenceLabels[metadata.confidence.level]} ({metadata.confidence.score}/100)
        </p>
        {metadata.confidence.explanation.length ? (
          <ul>
            {metadata.confidence.explanation.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        ) : null}
        {metadata.usedSources.length ? (
          <section>
            <h3>Sources utilisées</h3>
            <ul>
              {metadata.usedSources.map((source) => (
                <li key={`${source.name}-${source.url ?? "interne"}`}>
                  {source.url
                    ? <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a>
                    : source.name}
                  {source.official ? " — source officielle" : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {metadata.missingInformation.length ? (
          <section>
            <h3>Informations manquantes</h3>
            <ul>{metadata.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ) : null}
        {metadata.contradictions.length ? (
          <section>
            <h3>Contradictions non tranchées</h3>
            <ul>{metadata.contradictions.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ) : null}
        {metadata.warnings.length ? (
          <section>
            <h3>Avertissements éditoriaux</h3>
            <ul>{metadata.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </section>
        ) : null}
        {needsVerification ? <p><strong>Certains éléments restent à vérifier avant publication.</strong></p> : null}
      </div>
    </section>
  );
}
