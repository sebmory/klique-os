"use client";

import { useEffect, useRef, useState } from "react";
import type { AthleteNewsReport } from "@/types/athlete-news-report";

const statusLabel = {
  new: "Nouveau",
  preparing: "En préparation",
  processed: "Traité",
} as const;

export function AthleteNewsReportsCard() {
  const [reports, setReports] = useState<AthleteNewsReport[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const requestIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    let active = true;
    void fetch("/api/athlete-news-reports", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { reports?: AthleteNewsReport[]; message?: string };
        if (!response.ok) throw new Error(payload.message || "Impossible de charger vos actualités.");
        if (active) setReports(payload.reports ?? []);
      })
      .catch((error: unknown) => {
        if (active) setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Chargement impossible." });
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.set("clientRequestId", requestIdRef.current);
      formData.set("message", message);
      formData.set("eventDate", eventDate);
      formData.set("externalUrl", externalUrl);
      if (photo) formData.set("photo", photo);
      const response = await fetch("/api/athlete-news-reports", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json() as { report?: AthleteNewsReport; message?: string };
      if (!response.ok || !payload.report) {
        throw new Error(payload.message || "Impossible de transmettre cette actualité.");
      }
      setReports((current) => [
        payload.report!,
        ...current.filter((item) => item.id !== payload.report!.id),
      ]);
      setMessage("");
      setEventDate("");
      setExternalUrl("");
      setPhoto(null);
      requestIdRef.current = crypto.randomUUID();
      setFeedback({
        kind: "success",
        message: "Actualité transmise à KLIQUE. Elle sera examinée avant publication.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Impossible de transmettre cette actualité.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Mes actualités KLIQUE"
      style={{
        border: "1px solid rgba(232, 184, 75, 0.35)",
        borderRadius: "18px",
        background: "linear-gradient(145deg, rgba(232,184,75,0.11), rgba(255,255,255,0.03))",
        padding: "1rem",
        color: "#f8fafc",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Une actualité à partager ?</h2>
          <p style={{ margin: "0.25rem 0 0", color: "#a1a1aa", fontSize: "0.86rem" }}>
            Transmets-la à KLIQUE pour examen éditorial.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          style={{
            border: 0,
            borderRadius: "999px",
            background: "#e8b84b",
            color: "#111827",
            padding: "0.65rem 1rem",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          J’ai une actu
        </button>
      </div>

      {expanded ? (
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
          <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.86rem", fontWeight: 700 }}>
            Message court
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={600}
              required
              rows={4}
              placeholder="Que s’est-il passé ?"
              style={{ borderRadius: "12px", border: "1px solid #3f3f46", background: "#111217", color: "#f8fafc", padding: "0.75rem", resize: "vertical" }}
            />
          </label>
          <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.86rem", fontWeight: 700 }}>
            Date de l’événement
            <input
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              required
              style={{ borderRadius: "12px", border: "1px solid #3f3f46", background: "#111217", color: "#f8fafc", padding: "0.7rem" }}
            />
          </label>
          <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.86rem", fontWeight: 700 }}>
            Lien facultatif
            <input
              type="url"
              inputMode="url"
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.target.value)}
              placeholder="https://…"
              style={{ borderRadius: "12px", border: "1px solid #3f3f46", background: "#111217", color: "#f8fafc", padding: "0.7rem" }}
            />
          </label>
          <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.86rem", fontWeight: 700 }}>
            Photo facultative
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            />
            <small style={{ color: "#a1a1aa" }}>JPEG, PNG ou WebP, 10 Mo maximum. Fichier privé.</small>
          </label>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !message.trim() || !eventDate}
            style={{
              border: 0,
              borderRadius: "12px",
              background: busy || !message.trim() || !eventDate ? "#52525b" : "#e8b84b",
              color: "#111827",
              padding: "0.75rem",
              fontWeight: 800,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Transmission…" : "Transmettre à KLIQUE"}
          </button>
        </div>
      ) : null}

      {feedback ? (
        <p role="status" style={{ margin: "0.75rem 0 0", color: feedback.kind === "success" ? "#86efac" : "#fca5a5", fontSize: "0.88rem" }}>
          {feedback.message}
        </p>
      ) : null}

      {reports.length > 0 ? (
        <details style={{ marginTop: "0.9rem" }}>
          <summary style={{ cursor: "pointer", color: "#e8b84b", fontWeight: 700 }}>
            Mes signalements ({reports.length})
          </summary>
          <ul style={{ display: "grid", gap: "0.6rem", listStyle: "none", padding: 0, margin: "0.75rem 0 0" }}>
            {reports.map((report) => (
              <li key={report.id} style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "0.65rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <strong>{new Intl.DateTimeFormat("fr-CH").format(new Date(`${report.eventDate}T00:00:00`))}</strong>
                  <span style={{ color: "#e8b84b", fontSize: "0.8rem" }}>{statusLabel[report.status]}</span>
                </div>
                <p style={{ margin: "0.3rem 0 0", color: "#d4d4d8", whiteSpace: "pre-wrap" }}>{report.message}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
