"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input } from "@/src/design-system/components";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const errorByStatus: Record<number, string> = {
  400: "Adresse email invalide.",
  401: "Votre session a expiré. Reconnectez-vous puis réessayez.",
  403: "Seul un administrateur actif peut inviter un média.",
  409: "Cette adresse a déjà une invitation en attente ou un accès actif.",
  500: "L’invitation n’a pas pu être envoyée. Réessayez plus tard.",
};

export function MediaInviteSection() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadAccess = async () => {
      try {
        const response = await fetch("/api/clerk/access", { credentials: "include", cache: "no-store" });
        if (!response.ok) return;

        const payload = (await response.json()) as {
          permissions?: { isAdmin?: boolean | null; isActive?: boolean | null } | null;
        };

        if (!active) return;
        setIsAdmin(Boolean(payload?.permissions?.isAdmin && payload?.permissions?.isActive));
      } catch {
        if (active) setIsAdmin(false);
      }
    };

    void loadAccess();

    return () => {
      active = false;
    };
  }, []);

  if (!isAdmin) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !emailPattern.test(trimmedEmail)) {
      setErrorMessage("Saisissez une adresse email valide.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/media/invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setErrorMessage(payload?.error || errorByStatus[response.status] || "L’invitation n’a pas pu être envoyée.");
        return;
      }

      setEmail("");
      setSuccessMessage(`Invitation envoyée à ${trimmedEmail}.`);
    } catch {
      setErrorMessage("L’invitation n’a pas pu être envoyée. Vérifiez votre connexion.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card style={{ padding: "1.15rem", display: "grid", gap: "0.9rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
      <div>
        <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>
          ACCÈS MÉDIAS
        </p>
        <h2 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.2rem", color: "#111827" }}>Inviter un média</h2>
        <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.6, maxWidth: "70ch" }}>
          L’invité recevra un email officiel Clerk. Après acceptation et connexion, son accès média est activé et il arrive
          directement dans l’espace Contenus.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.7rem" }} noValidate>
        <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600, maxWidth: "420px" }}>
          <span>Adresse email</span>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
            placeholder="prenom.nom@media.ch"
            style={{ width: "100%", borderRadius: "14px" }}
          />
        </label>

        {errorMessage ? (
          <p role="alert" style={{ margin: 0, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", padding: "0.7rem 0.85rem" }}>
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p role="status" style={{ margin: 0, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", borderRadius: "12px", padding: "0.7rem 0.85rem" }}>
            {successMessage}
          </p>
        ) : null}

        <div>
          <Button
            type="submit"
            disabled={submitting}
            style={{
              borderRadius: "999px",
              padding: "0.7rem 1.05rem",
              background: "linear-gradient(135deg, #111827 0%, #374151 100%)",
              color: "#fff",
              border: "1px solid #111827",
              fontWeight: 700,
              opacity: submitting ? 0.7 : 1,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Envoi en cours…" : "Envoyer l’invitation"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
