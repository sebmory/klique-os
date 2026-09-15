"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input } from "@/src/design-system/components";
import { ClubRosterAdmin } from "@/components/settings/ClubRosterAdmin";

type ProvisionedClub = {
  workspaceId: string;
  name: string;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
  teamCount: number;
};

type ClubApiPayload = {
  clubs?: ProvisionedClub[];
  club?: ProvisionedClub;
  error?: string;
  code?: string;
};

type Feedback = {
  kind: "success" | "conflict" | "error";
  message: string;
};

const initialForm = {
  id: "elfic-fribourg",
  name: "Elfic Fribourg",
  teamName: "Équipe première",
  season: "2026-2027",
};

const fieldStyle = {
  display: "grid",
  gap: "0.35rem",
  color: "#374151",
  fontSize: "0.9rem",
  fontWeight: 600,
} as const;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "8px",
} as const;

const feedbackStyles = {
  success: { border: "#bbf7d0", background: "#f0fdf4", color: "#166534" },
  conflict: { border: "#fde68a", background: "#fffbeb", color: "#92400e" },
  error: { border: "#fecaca", background: "#fef2f2", color: "#b91c1c" },
} as const;

const sortClubs = (clubs: ProvisionedClub[]): ProvisionedClub[] =>
  [...clubs].sort((left, right) => left.name.localeCompare(right.name, "fr"));

export function ClubAdminSection() {
  const [clubs, setClubs] = useState<ProvisionedClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    let active = true;

    const loadClubs = async () => {
      try {
        const response = await fetch("/api/admin/clubs", {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as ClubApiPayload | null;
        if (!active) return;

        if (!response.ok || !Array.isArray(payload?.clubs)) {
          setLoadError(payload?.error || "Impossible de charger les clubs provisionnés.");
          return;
        }

        setClubs(sortClubs(payload.clubs));
      } catch {
        if (active) setLoadError("Impossible de charger les clubs provisionnés. Vérifiez votre connexion.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadClubs();
    return () => { active = false; };
  }, []);

  const updateField = (field: keyof typeof initialForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const createClub = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    const body = {
      id: form.id.trim().toLowerCase(),
      name: form.name.trim(),
      teamName: form.teamName.trim(),
      season: form.season.trim(),
    };

    if (!body.id || !body.name || !body.teamName || !body.season) {
      setFeedback({ kind: "error", message: "Tous les champs sont obligatoires." });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/clubs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as ClubApiPayload | null;

      if (!response.ok || !payload?.club) {
        if (response.status === 409 || payload?.code === "conflict") {
          setFeedback({
            kind: "conflict",
            message: payload?.error || "Cet identifiant ou ce nom est déjà utilisé.",
          });
          return;
        }
        setFeedback({
          kind: "error",
          message: payload?.error || "Le club n’a pas pu être créé.",
        });
        return;
      }

      setClubs((current) => sortClubs([
        ...current.filter((club) => club.workspaceId !== payload.club?.workspaceId),
        payload.club!,
      ]));
      setFeedback({ kind: "success", message: `${payload.club.name} a été provisionné.` });
    } catch {
      setFeedback({ kind: "error", message: "Le club n’a pas pu être créé. Vérifiez votre connexion." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card style={{ padding: "1.15rem", display: "grid", gap: "1rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
      <div>
        <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.2rem", color: "#111827" }}>Clubs</h2>
        <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.6 }}>
          Provisionnez un workspace Club avec son profil et sa première équipe.
        </p>
      </div>

      <form onSubmit={createClub} noValidate style={{ display: "grid", gap: "0.85rem" }}>
        <div style={{ display: "grid", gap: "0.85rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={fieldStyle}>
            <span>Identifiant</span>
            <Input
              required
              name="id"
              value={form.id}
              onChange={(event) => updateField("id", event.target.value)}
              disabled={submitting}
              maxLength={80}
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span>Nom</span>
            <Input
              required
              name="name"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              disabled={submitting}
              maxLength={160}
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span>Première équipe</span>
            <Input
              required
              name="teamName"
              value={form.teamName}
              onChange={(event) => updateField("teamName", event.target.value)}
              disabled={submitting}
              maxLength={120}
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span>Saison</span>
            <Input
              required
              name="season"
              value={form.season}
              onChange={(event) => updateField("season", event.target.value)}
              disabled={submitting}
              maxLength={40}
              style={inputStyle}
            />
          </label>
        </div>

        {feedback ? (
          <p
            role={feedback.kind === "success" ? "status" : "alert"}
            data-state={feedback.kind}
            style={{
              margin: 0,
              border: `1px solid ${feedbackStyles[feedback.kind].border}`,
              background: feedbackStyles[feedback.kind].background,
              color: feedbackStyles[feedback.kind].color,
              borderRadius: "8px",
              padding: "0.7rem 0.85rem",
            }}
          >
            {feedback.message}
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
            {submitting ? "Provisionnement…" : "Créer le club"}
          </Button>
        </div>
      </form>

      <div style={{ display: "grid", gap: "0.6rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", color: "#111827" }}>Clubs provisionnés</h3>
        {loading ? <p role="status" style={{ margin: 0, color: "#6b7280" }}>Chargement des clubs…</p> : null}
        {loadError ? <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{loadError}</p> : null}
        {!loading && !loadError && clubs.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280" }}>Aucun club provisionné.</p>
        ) : null}
        {!loading && !loadError && clubs.length > 0 ? (
          <div style={{ display: "grid", borderTop: "1px solid #e5e7eb" }}>
            {clubs.map((club) => (
              <div
                key={club.workspaceId}
                data-club-id={club.workspaceId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: "0.75rem",
                  alignItems: "center",
                  padding: "0.8rem 0",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: "#111827" }}>{club.name}</strong>
                  <p style={{ margin: "0.2rem 0 0", color: "#6b7280", overflowWrap: "anywhere" }}>
                    {club.workspaceId}
                  </p>
                </div>
                <span style={{ color: "#374151", whiteSpace: "nowrap" }}>
                  {club.teamCount} équipe{club.teamCount > 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <ClubRosterAdmin clubs={clubs} />
    </Card>
  );
}