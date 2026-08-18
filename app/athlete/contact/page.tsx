"use client";

import { useState } from "react";

const KLIQUE_GOLD = "#e8b84b";
const SURFACE_BORDER = "rgba(255, 255, 255, 0.09)";
const SURFACE_BG = "rgba(255, 255, 255, 0.035)";
const TEXT_MUTED = "#9ca3af";

const SUBJECT_MAX_LENGTH = 150;
const MESSAGE_MAX_LENGTH = 3000;

const categories = [
  { value: "content_photo", label: "Photo et contenu" },
  { value: "support", label: "Accompagnement KLIQUE" },
  { value: "partner_benefit", label: "Avantage partenaire" },
  { value: "technical", label: "Problème technique" },
  { value: "other", label: "Autre demande" },
] as const;

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  borderRadius: "14px",
  border: `1px solid ${SURFACE_BORDER}`,
  background: "rgba(10, 11, 15, 0.75)",
  color: "#f8fafc",
  padding: "0.75rem 0.9rem",
  fontSize: "0.95rem",
  fontFamily: "inherit",
  outline: "none",
};

const labelStyle = {
  display: "block",
  margin: "0 0 0.4rem",
  color: "#e5e7eb",
  fontSize: "0.85rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
};

const counterStyle = {
  margin: "0.35rem 0 0",
  color: TEXT_MUTED,
  fontSize: "0.76rem",
  textAlign: "right" as const,
};

export default function AthleteContactPage() {
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (!category) {
      setErrorMessage("Veuillez sélectionner une catégorie.");
      return;
    }
    if (!trimmedSubject) {
      setErrorMessage("Le sujet est obligatoire.");
      return;
    }
    if (trimmedSubject.length > SUBJECT_MAX_LENGTH) {
      setErrorMessage(`Le sujet ne peut pas dépasser ${SUBJECT_MAX_LENGTH} caractères.`);
      return;
    }
    if (!trimmedMessage) {
      setErrorMessage("Le message est obligatoire.");
      return;
    }
    if (trimmedMessage.length > MESSAGE_MAX_LENGTH) {
      setErrorMessage(`Le message ne peut pas dépasser ${MESSAGE_MAX_LENGTH} caractères.`);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/contact-requests", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject: trimmedSubject, message: trimmedMessage }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Votre demande n’a pas pu être envoyée.");
      }

      setCategory("");
      setSubject("");
      setMessage("");
      setSuccessMessage("Votre demande a bien été envoyée. L’équipe KLIQUE vous répondra prochainement.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Votre demande n’a pas pu être envoyée.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      style={{
        padding: "1.5rem",
        maxWidth: "1180px",
        margin: "0 auto",
        display: "grid",
        gap: "1.25rem",
        background: "#0a0b0f",
        borderRadius: "24px",
      }}
    >
      <header style={{ display: "grid", gap: "0.5rem" }}>
        <p
          style={{
            margin: 0,
            fontSize: "0.76rem",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: TEXT_MUTED,
            fontWeight: 700,
          }}
        >
          Espace Athlete
        </p>
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Contacter KLIQUE</h1>
        <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.95rem", lineHeight: 1.5, maxWidth: "62ch" }}>
          Une question, un besoin ou un imprévu ? Envoyez votre demande à l’équipe KLIQUE.
        </p>
      </header>

      <article
        style={{
          border: `1px solid ${SURFACE_BORDER}`,
          borderRadius: "22px",
          background: "linear-gradient(160deg, #14151a 0%, #0e0f13 60%, #0a0b0f 100%)",
          padding: "1.5rem",
          boxShadow: "0 24px 60px -30px rgba(0, 0, 0, 0.85)",
        }}
        className="athlete-contact-card"
      >
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1.1rem" }} noValidate>
          <div>
            <label htmlFor="contact-category" style={labelStyle}>
              Catégorie
            </label>
            <select
              id="contact-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
              disabled={submitting}
              style={fieldStyle}
            >
              <option value="">Sélectionnez une catégorie</option>
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="contact-subject" style={labelStyle}>
              Sujet
            </label>
            <input
              id="contact-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={SUBJECT_MAX_LENGTH}
              required
              disabled={submitting}
              placeholder="Résumez votre demande en une phrase"
              style={fieldStyle}
            />
            <p style={counterStyle}>
              {subject.length} / {SUBJECT_MAX_LENGTH}
            </p>
          </div>

          <div>
            <label htmlFor="contact-message" style={labelStyle}>
              Message
            </label>
            <textarea
              id="contact-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={MESSAGE_MAX_LENGTH}
              required
              disabled={submitting}
              rows={8}
              placeholder="Décrivez votre demande avec le plus de détails possible"
              style={{ ...fieldStyle, resize: "vertical", minHeight: "180px", lineHeight: 1.6 }}
            />
            <p style={counterStyle}>
              {message.length} / {MESSAGE_MAX_LENGTH}
            </p>
          </div>

          {errorMessage ? (
            <p
              role="alert"
              style={{
                margin: 0,
                borderRadius: "14px",
                border: "1px solid rgba(248, 113, 113, 0.35)",
                background: "rgba(248, 113, 113, 0.12)",
                color: "#fecaca",
                padding: "0.8rem 0.9rem",
                fontSize: "0.9rem",
                lineHeight: 1.5,
              }}
            >
              {errorMessage}
            </p>
          ) : null}

          {successMessage ? (
            <p
              role="status"
              style={{
                margin: 0,
                borderRadius: "14px",
                border: "1px solid rgba(232, 184, 75, 0.45)",
                background: "rgba(232, 184, 75, 0.14)",
                color: KLIQUE_GOLD,
                padding: "0.8rem 0.9rem",
                fontSize: "0.9rem",
                lineHeight: 1.5,
              }}
            >
              {successMessage}
            </p>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end" }} className="athlete-contact-actions">
            <button
              type="submit"
              disabled={submitting}
              style={{
                borderRadius: "999px",
                border: "1px solid rgba(232, 184, 75, 0.45)",
                background: submitting ? "rgba(232, 184, 75, 0.18)" : KLIQUE_GOLD,
                color: submitting ? "#f8fafc" : "#0a0b0f",
                fontWeight: 800,
                fontSize: "0.95rem",
                letterSpacing: "0.02em",
                padding: "0.75rem 1.5rem",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.75 : 1,
                transition: "opacity 150ms ease, background 150ms ease",
              }}
            >
              {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
            </button>
          </div>
        </form>
      </article>

      <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.82rem", background: SURFACE_BG, borderRadius: "14px", padding: "0.75rem 0.9rem" }}>
        Votre demande est transmise avec votre profil athlète KLIQUE.
      </p>

      <style>{`
        @media (max-width: 860px) {
          .athlete-contact-card {
            padding: 1.1rem !important;
          }
          .athlete-contact-actions {
            justify-content: stretch !important;
          }
          .athlete-contact-actions button {
            width: 100% !important;
          }
        }
      `}</style>
    </section>
  );
}
