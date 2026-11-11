"use client";

import { useMemo, useState } from "react";
import { buildSportsWatchCanvaPreparation } from "@/lib/sports-watch/canva-preparation";
import type { SportsWatchCandidate } from "@/types/sports-watch";

type SportsWatchCanvaPreparationPanelProps = {
  candidate: SportsWatchCandidate;
  athleteClub: string | null;
  templateUrl: string | null;
  onClose: () => void;
};

const isHttpUrl = (value: string | null): value is string =>
  Boolean(value && /^https?:\/\//i.test(value));

export function SportsWatchCanvaPreparationPanel({
  candidate,
  athleteClub,
  templateUrl,
  onClose,
}: SportsWatchCanvaPreparationPanelProps) {
  const preparation = useMemo(
    () => buildSportsWatchCanvaPreparation(candidate, athleteClub),
    [athleteClub, candidate],
  );
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const sections = [
    { title: "Informations", fields: preparation.identity },
    { title: "Score collectif", fields: preparation.collective },
    { title: "Statistiques individuelles", fields: preparation.individual },
  ].filter((section) => section.fields.length > 0);

  const copy = async () => {
    setCopyStatus(null);
    try {
      await navigator.clipboard.writeText(preparation.copyText);
      setCopyStatus("Infos copiées.");
    } catch {
      setCopyStatus("Copie impossible. Sélectionnez le texte ci-dessous.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sports-watch-canva-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: "1rem",
        background: "rgba(35, 29, 24, 0.48)",
      }}
    >
      <section
        style={{
          width: "min(100%, 34rem)",
          maxHeight: "calc(100vh - 2rem)",
          overflowY: "auto",
          padding: "1rem",
          borderRadius: "12px",
          background: "#fff",
          boxShadow: "0 18px 50px rgba(35, 29, 24, 0.22)",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <small style={{ color: "#786e66", fontWeight: 700 }}>SPORTS WATCH · BASKET</small>
            <h3 id="sports-watch-canva-title" style={{ margin: "0.2rem 0 0" }}>
              Préparer un visuel Canva
            </h3>
          </div>
          <button type="button" className="card-link-button" onClick={onClose}>
            Fermer
          </button>
        </header>

        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.9rem" }}>
          {sections.map((section) => (
            <section
              key={section.title}
              style={{
                display: "grid",
                gap: "0.35rem",
                padding: "0.7rem",
                border: "1px solid #e7e0d9",
                borderRadius: "8px",
              }}
            >
              <strong style={{ fontSize: "0.78rem", color: "#6d5140" }}>{section.title}</strong>
              {section.fields.map((item) => (
                <div
                  key={`${section.title}-${item.label}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(7rem, 0.8fr) minmax(0, 1.2fr)",
                    gap: "0.5rem",
                    fontSize: "0.82rem",
                  }}
                >
                  <span style={{ color: "#786e66" }}>{item.label}</span>
                  <span>
                    <strong>{item.value}</strong>
                    {item.requiresVerification ? (
                      <small
                        style={{
                          display: "block",
                          marginTop: "0.1rem",
                          color: "#92400e",
                          fontWeight: 700,
                        }}
                      >
                        À vérifier · exclu de la copie
                      </small>
                    ) : null}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>

        <label
          style={{
            display: "grid",
            gap: "0.35rem",
            marginTop: "0.85rem",
            color: "#6d5140",
            fontSize: "0.78rem",
            fontWeight: 700,
          }}
        >
          Texte à copier
          <textarea
            aria-label="Informations Canva à copier"
            readOnly
            rows={Math.max(3, preparation.copyText.split("\n").length)}
            value={preparation.copyText}
            style={{
              width: "100%",
              resize: "vertical",
              padding: "0.65rem",
              border: "1px solid #d8cec4",
              borderRadius: "7px",
              background: "#fff",
              color: "#332d28",
              font: "inherit",
              fontWeight: 500,
            }}
          />
        </label>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.55rem",
            flexWrap: "wrap",
            marginTop: "0.75rem",
          }}
        >
          <button type="button" className="card-link-button sports-action is-primary" onClick={() => void copy()}>
            Copier les infos
          </button>
          {isHttpUrl(templateUrl) ? (
            <a
              className="card-link-button sports-action"
              href={templateUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ouvrir le modèle Canva
            </a>
          ) : (
            <span style={{ color: "#92400e", fontSize: "0.8rem", fontWeight: 700 }}>
              Modèle Canva à configurer
            </span>
          )}
          {copyStatus ? (
            <span role="status" style={{ fontSize: "0.8rem", color: "#166534" }}>
              {copyStatus}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
