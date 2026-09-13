"use client";

import { useState } from "react";
import { Button, Card, Input, Select, Textarea } from "@/src/design-system/components";

type RecipientRole = "athlete" | "media" | "partner_expert" | "all";

type AnnouncementResponse = {
  ok?: boolean;
  message?: string;
  recipientCount?: number;
};

const fieldStyle = {
  display: "grid",
  gap: "0.35rem",
  color: "#374151",
  fontSize: "0.9rem",
  fontWeight: 600,
} as const;

const controlStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "8px",
} as const;

const isInternalHref = (value: string): boolean => value.startsWith("/") && !value.startsWith("//");

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [actionHref, setActionHref] = useState("");
  const [recipientRole, setRecipientRole] = useState<RecipientRole>("all");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedTitle = title.trim();
    const normalizedHref = actionHref.trim();
    if (!normalizedTitle) {
      setErrorMessage("Le titre est obligatoire.");
      return;
    }
    if (!normalizedHref || !isInternalHref(normalizedHref)) {
      setErrorMessage("Le lien doit être un chemin interne commençant par /.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: normalizedTitle,
          body: message.trim() || undefined,
          actionHref: normalizedHref,
          recipientRoles: [recipientRole],
        }),
      });
      const payload = (await response.json().catch(() => null)) as AnnouncementResponse | null;

      if (!response.ok) {
        setErrorMessage(payload?.message || "L’annonce n’a pas pu être envoyée.");
        return;
      }

      const recipientCount = typeof payload?.recipientCount === "number" ? payload.recipientCount : 0;
      setSuccessMessage(
        `Annonce envoyée à ${recipientCount} destinataire${recipientCount > 1 ? "s" : ""}.`,
      );
      setTitle("");
      setMessage("");
      setActionHref("");
    } catch {
      setErrorMessage("L’annonce n’a pas pu être envoyée. Vérifiez votre connexion.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section style={{ display: "grid", gap: "1rem", maxWidth: "860px", margin: "0 auto", padding: "0.5rem 0" }}>
      <header>
        <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>
          NOTIFICATIONS
        </p>
        <h1 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.35rem", color: "#111827" }}>Notifications Admin</h1>
      </header>

      <Card style={{ padding: "1.15rem", display: "grid", gap: "1rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
        <div>
          <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.2rem", color: "#111827" }}>Envoyer une annonce</h2>
          <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.6 }}>
            L’annonce sera envoyée aux accès actifs du workspace sélectionné.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display: "grid", gap: "0.85rem" }}>
          <label style={fieldStyle}>
            <span>Titre</span>
            <Input
              required
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={submitting}
              maxLength={160}
              style={controlStyle}
            />
          </label>

          <label style={fieldStyle}>
            <span>Message <span style={{ color: "#6b7280", fontWeight: 400 }}>(facultatif)</span></span>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={submitting}
              rows={5}
              maxLength={2000}
              style={{ ...controlStyle, resize: "vertical" }}
            />
          </label>

          <div style={{ display: "grid", gap: "0.85rem", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label style={fieldStyle}>
              <span>Lien interne</span>
              <Input
                required
                type="text"
                value={actionHref}
                onChange={(event) => setActionHref(event.target.value)}
                disabled={submitting}
                placeholder="/today"
                style={controlStyle}
              />
            </label>

            <label style={fieldStyle}>
              <span>Destinataires</span>
              <Select
                required
                value={recipientRole}
                onChange={(event) => setRecipientRole(event.target.value as RecipientRole)}
                disabled={submitting}
                style={controlStyle}
              >
                <option value="athlete">Athlètes</option>
                <option value="media">Médias</option>
                <option value="partner_expert">Partenaires/Experts</option>
                <option value="all">Tous</option>
              </Select>
            </label>
          </div>

          {errorMessage ? (
            <p role="alert" style={{ margin: 0, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "0.7rem 0.85rem" }}>
              {errorMessage}
            </p>
          ) : null}

          {successMessage ? (
            <p role="status" style={{ margin: 0, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", borderRadius: "8px", padding: "0.7rem 0.85rem" }}>
              {successMessage}
            </p>
          ) : null}

          <div>
            <Button
              type="submit"
              disabled={submitting}
              style={{
                borderRadius: "8px",
                padding: "0.7rem 1.05rem",
                background: "#111827",
                color: "#fff",
                border: "1px solid #111827",
                fontWeight: 700,
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Envoi en cours…" : "Envoyer l’annonce"}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}