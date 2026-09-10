"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input, Textarea } from "@/src/design-system/components";
import { MediaDeskMediaScreen } from "@/components/media-desk/MediaDeskMediaScreen";
import { MediaRequestsAdminSection } from "@/components/media-desk/MediaRequestsAdminSection";

type MediaSubjectStatus = "draft" | "published" | "archived";

type MediaRequestType = "interview" | "reaction" | "reportage" | "images" | "podcast";

type MediaSubject = {
  id: string;
  title: string;
  summary: string;
  angle: string;
  sport: string | null;
  location: string | null;
  date: string | null;
  coverImageUrl: string | null;
  availableRequestTypes: MediaRequestType[];
  athleteIds: string[];
  status: MediaSubjectStatus;
  publishedAt: string | null;
  updatedAt: string;
};

type AthleteOption = { key: string; name: string; sport: string };

type StatusFilter = "all" | MediaSubjectStatus;

type SubjectFormState = {
  title: string;
  summary: string;
  angle: string;
  sport: string;
  location: string;
  date: string;
  coverImageUrl: string;
  availableRequestTypes: MediaRequestType[];
  athleteIds: string[];
  status: MediaSubjectStatus;
};

const REQUEST_TYPES: Array<{ value: MediaRequestType; label: string }> = [
  { value: "interview", label: "Interview" },
  { value: "reaction", label: "Réaction" },
  { value: "reportage", label: "Reportage" },
  { value: "images", label: "Images" },
  { value: "podcast", label: "Podcast" },
];

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "draft", label: "Brouillons" },
  { value: "published", label: "Publiés" },
  { value: "archived", label: "Archivés" },
];

const STATUS_STYLE: Record<MediaSubjectStatus, { label: string; background: string; color: string }> = {
  draft: { label: "Brouillon", background: "#fffbeb", color: "#b45309" },
  published: { label: "Publié", background: "#ecfdf5", color: "#047857" },
  archived: { label: "Archivé", background: "#f3f4f6", color: "#4b5563" },
};

const createEmptyForm = (): SubjectFormState => ({
  title: "",
  summary: "",
  angle: "",
  sport: "",
  location: "",
  date: new Date().toISOString().slice(0, 10),
  coverImageUrl: "",
  availableRequestTypes: ["interview"],
  athleteIds: [],
  status: "draft",
});

const normalizeDateValue = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const isoPrefix = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return isoPrefix ? isoPrefix[1] : "";
};

const formatDateLabel = (value: string | null): string => {
  const normalized = normalizeDateValue(value);
  if (!normalized) return "Sans date";
  const [year, month, day] = normalized.split("-");
  return `${day}.${month}.${year}`;
};

const isHttpsUrl = (value: string): boolean => value.trim().startsWith("https://");

const inputStyle = { width: "100%", borderRadius: "14px" } as const;

const selectStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "0.75rem 0.9rem",
  color: "#111827",
  background: "white",
} as const;

const secondaryButtonStyle = {
  border: "1px solid #e5e7eb",
  background: "white",
  color: "#374151",
  borderRadius: "999px",
  padding: "0.55rem 0.8rem",
  cursor: "pointer",
  fontWeight: 700,
} as const;

const SubjectCover = ({ url, width }: { url: string; width: number }) => (
  <div
    style={{
      position: "relative",
      width: `${width}px`,
      flex: `0 0 ${width}px`,
      aspectRatio: "3 / 4",
      borderRadius: "6px 14px 14px 6px",
      overflow: "hidden",
      background: "#f3f4f6",
      boxShadow: "0 18px 32px rgba(15, 23, 42, 0.22), 0 2px 6px rgba(15, 23, 42, 0.12)",
    }}
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    <span
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "6px 14px 14px 6px",
        background:
          "linear-gradient(90deg, rgba(15,23,42,0.34) 0%, rgba(15,23,42,0.10) 4%, rgba(255,255,255,0.16) 7%, rgba(255,255,255,0) 16%)",
        boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.24)",
        pointerEvents: "none",
      }}
    />
  </div>
);

export default function MediaDeskPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isActiveMedia, setIsActiveMedia] = useState(false);
  const [subjects, setSubjects] = useState<MediaSubject[]>([]);
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [form, setForm] = useState<SubjectFormState>(createEmptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [athleteQuery, setAthleteQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadAccess = async () => {
      try {
        const response = await fetch("/api/clerk/access", { credentials: "include", cache: "no-store" });
        if (!response.ok) {
          if (active) setIsAdmin(false);
          return;
        }
        const payload = (await response.json()) as {
          permissions?: { isAdmin?: boolean | null; isActive?: boolean | null; isMedia?: boolean | null } | null;
        };
        if (!active) return;
        setIsAdmin(Boolean(payload?.permissions?.isAdmin && payload?.permissions?.isActive));
        setIsActiveMedia(Boolean(payload?.permissions?.isMedia && payload?.permissions?.isActive));
      } catch {
        if (active) setIsAdmin(false);
      }
    };

    void loadAccess();
    return () => {
      active = false;
    };
  }, []);

  const loadSubjects = async () => {
    const response = await fetch("/api/media-subjects", { credentials: "include", cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; subjects?: MediaSubject[]; message?: string }
      | null;

    if (!response.ok || !payload?.ok || !Array.isArray(payload.subjects)) {
      throw new Error(payload?.message || "Les sujets n’ont pas pu être chargés.");
    }

    setSubjects(payload.subjects);
  };

  useEffect(() => {
    if (isAdmin !== true) return;
    let active = true;

    const loadAll = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await loadSubjects();
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Chargement impossible.");
      }

      try {
        const response = await fetch("/api/athletes", { credentials: "include", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { athletes?: Array<{ key?: string; name?: string; sport?: string }> }
          | null;
        if (active && Array.isArray(payload?.athletes)) {
          setAthletes(
            payload.athletes
              .map((athlete) => ({
                key: String(athlete.key ?? "").trim(),
                name: String(athlete.name ?? "").trim(),
                sport: String(athlete.sport ?? "").trim(),
              }))
              .filter((athlete) => athlete.key && athlete.name)
              .sort((a, b) => a.name.localeCompare(b.name, "fr")),
          );
        }
      } catch {
        if (active) setAthletes([]);
      }

      if (active) setLoading(false);
    };

    void loadAll();
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const athleteNameById = useMemo(() => {
    const index = new Map<string, string>();
    for (const athlete of athletes) index.set(athlete.key, athlete.name);
    return index;
  }, [athletes]);

  const visibleSubjects = useMemo(
    () => (statusFilter === "all" ? subjects : subjects.filter((subject) => subject.status === statusFilter)),
    [statusFilter, subjects],
  );

  const athleteResults = useMemo(() => {
    const query = athleteQuery.trim().toLowerCase();
    const available = athletes.filter((athlete) => !form.athleteIds.includes(athlete.key));
    if (!query) return available.slice(0, 8);
    return available
      .filter((athlete) => `${athlete.name} ${athlete.sport}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [athleteQuery, athletes, form.athleteIds]);

  const openComposer = (subject?: MediaSubject) => {
    setActionError(null);
    setFormError(null);
    setAthleteQuery("");
    if (subject) {
      setEditingSubjectId(subject.id);
      setForm({
        title: subject.title,
        summary: subject.summary,
        angle: subject.angle,
        sport: subject.sport ?? "",
        location: subject.location ?? "",
        date: normalizeDateValue(subject.date),
        coverImageUrl: subject.coverImageUrl ?? "",
        availableRequestTypes: subject.availableRequestTypes,
        athleteIds: subject.athleteIds,
        status: subject.status,
      });
    } else {
      setEditingSubjectId(null);
      setForm(createEmptyForm());
    }
    setIsComposerOpen(true);
  };

  const closeComposer = () => {
    setIsComposerOpen(false);
    setEditingSubjectId(null);
    setForm(createEmptyForm());
    setFormError(null);
    setAthleteQuery("");
  };

  const toggleRequestType = (type: MediaRequestType) => {
    setForm((current) => ({
      ...current,
      availableRequestTypes: current.availableRequestTypes.includes(type)
        ? current.availableRequestTypes.filter((entry) => entry !== type)
        : [...current.availableRequestTypes, type],
    }));
  };

  const buildPayload = () => ({
    title: form.title.trim(),
    summary: form.summary.trim(),
    angle: form.angle.trim(),
    sport: form.sport.trim() || null,
    location: form.location.trim() || null,
    date: form.date || null,
    coverImageUrl: form.coverImageUrl.trim() || null,
    availableRequestTypes: form.availableRequestTypes,
    athleteIds: form.athleteIds,
    status: form.status,
  });

  const handleSave = async () => {
    if (saving) return;

    if (!form.title.trim() || !form.summary.trim() || !form.angle.trim()) {
      setFormError("Titre, résumé et angle sont obligatoires.");
      return;
    }
    if (form.availableRequestTypes.length === 0) {
      setFormError("Sélectionnez au moins un type de demande média.");
      return;
    }
    if (form.coverImageUrl.trim() && !isHttpsUrl(form.coverImageUrl)) {
      setFormError("Le visuel doit être une URL https.");
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/media-subjects", {
        method: editingSubjectId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingSubjectId ? { subjectId: editingSubjectId, ...buildPayload() } : buildPayload()),
      });

      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        setFormError(payload?.message || "Le sujet n’a pas pu être enregistré.");
        return;
      }

      await loadSubjects();
      closeComposer();
    } catch {
      setFormError("Le sujet n’a pas pu être enregistré. Veuillez réessayer.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (subject: MediaSubject, status: MediaSubjectStatus) => {
    setActionError(null);
    setPendingSubjectId(subject.id);
    try {
      const response = await fetch("/api/media-subjects", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: subject.id,
          title: subject.title,
          summary: subject.summary,
          angle: subject.angle,
          sport: subject.sport,
          location: subject.location,
          date: subject.date,
          coverImageUrl: subject.coverImageUrl,
          availableRequestTypes: subject.availableRequestTypes,
          athleteIds: subject.athleteIds,
          status,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        setActionError(payload?.message || "Le statut n’a pas pu être modifié.");
        return;
      }

      await loadSubjects();
    } catch {
      setActionError("Le statut n’a pas pu être modifié. Veuillez réessayer.");
    } finally {
      setPendingSubjectId(null);
    }
  };

  const handleDelete = async (subject: MediaSubject) => {
    if (!window.confirm(`Supprimer définitivement le sujet « ${subject.title} » ?`)) return;

    setActionError(null);
    setPendingSubjectId(subject.id);
    try {
      const response = await fetch(`/api/media-subjects?subjectId=${encodeURIComponent(subject.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        setActionError(payload?.message || "Le sujet n’a pas pu être supprimé.");
        return;
      }
      await loadSubjects();
    } catch {
      setActionError("Le sujet n’a pas pu être supprimé. Veuillez réessayer.");
    } finally {
      setPendingSubjectId(null);
    }
  };

  if (isActiveMedia) {
    return <MediaDeskMediaScreen />;
  }

  if (isAdmin === false) {
    return (
      <div style={{ display: "grid", gap: "1rem" }}>
        <Card style={{ padding: "1.15rem", border: "1px solid #f0e2d0" }}>
          <h1 style={{ margin: 0, fontSize: "1.25rem", color: "#111827" }}>Media Desk</h1>
          <p style={{ margin: "0.4rem 0 0", color: "#6b7280" }}>
            Cet espace est réservé aux administrateurs actifs de KLIQUE OS.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Card
        style={{
          padding: "1.15rem",
          display: "grid",
          gap: "1rem",
          border: "1px solid #f0e2d0",
          boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>
              MEDIA DESK
            </p>
            <h1 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.35rem", color: "#111827" }}>Sujets proposés aux médias</h1>
            <p style={{ margin: 0, color: "#6b7280", maxWidth: "760px", lineHeight: 1.6 }}>
              Préparez les sujets, choisissez les athlètes concernés et ouvrez les types de demandes disponibles. Seuls les
              sujets publiés seront visibles par les médias.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => openComposer()}
            style={{ borderRadius: "999px", padding: "0.72rem 0.95rem", background: "#f59e0b", color: "#fff", border: "none" }}
          >
            Ajouter un sujet
          </Button>
        </div>

        {isComposerOpen ? (
          <Card style={{ padding: "1rem", display: "grid", gap: "0.9rem", border: "1px solid #f0e2d0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#111827" }}>
                {editingSubjectId ? "Modifier le sujet" : "Nouveau sujet"}
              </h2>
              <button type="button" onClick={closeComposer} style={{ border: "none", background: "transparent", color: "#6b7280", cursor: "pointer", fontWeight: 700 }}>
                Fermer
              </button>
            </div>

            <div style={{ display: "grid", gap: "0.8rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <Input placeholder="Titre" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} style={inputStyle} />
              <Input placeholder="Sport" value={form.sport} onChange={(event) => setForm((current) => ({ ...current, sport: event.target.value }))} style={inputStyle} />
              <Input placeholder="Lieu" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} style={inputStyle} />
              <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} style={inputStyle} />
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as MediaSubjectStatus }))}
                style={selectStyle}
              >
                <option value="draft">Brouillon</option>
                <option value="published">Publié</option>
                <option value="archived">Archivé</option>
              </select>
              <Input
                placeholder="Visuel (URL https, facultatif)"
                value={form.coverImageUrl}
                onChange={(event) => setForm((current) => ({ ...current, coverImageUrl: event.target.value }))}
                style={inputStyle}
              />
            </div>

            <Textarea
              placeholder="Résumé du sujet"
              value={form.summary}
              onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
              style={{ minHeight: "86px", width: "100%", borderRadius: "14px" }}
            />
            <Textarea
              placeholder="Angle éditorial proposé"
              value={form.angle}
              onChange={(event) => setForm((current) => ({ ...current, angle: event.target.value }))}
              style={{ minHeight: "86px", width: "100%", borderRadius: "14px" }}
            />

            <div style={{ display: "grid", gap: "0.6rem", padding: "0.9rem", border: "1px solid #f0e2d0", borderRadius: "16px", background: "#fffdf9" }}>
              <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>Athlètes concernés</p>
              {form.athleteIds.length > 0 ? (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {form.athleteIds.map((athleteId) => (
                    <span key={athleteId} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "#eff6ff", color: "#1d4ed8", borderRadius: "999px", padding: "0.35rem 0.65rem", fontWeight: 700, fontSize: "0.88rem" }}>
                      {athleteNameById.get(athleteId) ?? athleteId}
                      <button
                        type="button"
                        aria-label={`Retirer ${athleteNameById.get(athleteId) ?? athleteId}`}
                        onClick={() => setForm((current) => ({ ...current, athleteIds: current.athleteIds.filter((entry) => entry !== athleteId) }))}
                        style={{ border: "none", background: "transparent", color: "#1d4ed8", cursor: "pointer", fontWeight: 700 }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9rem" }}>Aucun athlète associé pour l’instant.</p>
              )}

              <Input
                placeholder="Rechercher un athlète…"
                value={athleteQuery}
                onChange={(event) => setAthleteQuery(event.target.value)}
                style={{ ...inputStyle, maxWidth: "420px" }}
              />

              {athleteResults.length > 0 ? (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {athleteResults.map((athlete) => (
                    <button
                      key={athlete.key}
                      type="button"
                      onClick={() => {
                        setForm((current) => ({ ...current, athleteIds: [...current.athleteIds, athlete.key] }));
                        setAthleteQuery("");
                      }}
                      style={secondaryButtonStyle}
                    >
                      + {athlete.name}
                      {athlete.sport ? <span style={{ color: "#6b7280", fontWeight: 600 }}> · {athlete.sport}</span> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, color: "#6b7280", fontSize: "0.88rem" }}>Aucun athlète ne correspond à cette recherche.</p>
              )}
            </div>

            <div style={{ display: "grid", gap: "0.55rem", padding: "0.9rem", border: "1px solid #f0e2d0", borderRadius: "16px", background: "#fffdf9" }}>
              <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>Types de demandes disponibles</p>
              <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap" }}>
                {REQUEST_TYPES.map((type) => (
                  <label key={type.value} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "#374151", fontWeight: 600, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={form.availableRequestTypes.includes(type.value)}
                      onChange={() => toggleRequestType(type.value)}
                    />
                    {type.label}
                  </label>
                ))}
              </div>
            </div>

            {formError ? (
              <p role="alert" style={{ margin: 0, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", padding: "0.7rem 0.85rem" }}>
                {formError}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap", alignItems: "center" }}>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{ borderRadius: "999px", padding: "0.72rem 0.92rem", background: "#f59e0b", color: "#fff", border: "none", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
              >
                {saving ? "Enregistrement…" : editingSubjectId ? "Enregistrer les modifications" : "Créer le sujet"}
              </Button>
              <button type="button" onClick={closeComposer} style={secondaryButtonStyle}>
                Annuler
              </button>
            </div>
          </Card>
        ) : null}

        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((filter) => {
            const isActive = filter.value === statusFilter;
            const count = filter.value === "all" ? subjects.length : subjects.filter((subject) => subject.status === filter.value).length;
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
                style={{
                  border: isActive ? "1px solid #f59e0b" : "1px solid #e5e7eb",
                  background: isActive ? "#fff7ed" : "white",
                  color: isActive ? "#92400e" : "#374151",
                  borderRadius: "999px",
                  padding: "0.58rem 0.8rem",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {filter.label} ({count})
              </button>
            );
          })}
        </div>

        {actionError ? (
          <p role="alert" style={{ margin: 0, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", padding: "0.7rem 0.85rem" }}>
            {actionError}
          </p>
        ) : null}
      </Card>

      {loadError ? (
        <Card style={{ padding: "1rem", border: "1px solid #fecaca", background: "#fef2f2" }}>
          <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{loadError}</p>
        </Card>
      ) : null}

      {loading || isAdmin === null ? (
        <Card style={{ padding: "1rem", border: "1px solid #efe3d4" }}>
          <p style={{ margin: 0, color: "#6b7280" }}>Chargement des sujets…</p>
        </Card>
      ) : visibleSubjects.length === 0 ? (
        <Card style={{ padding: "1rem", border: "1px solid #efe3d4" }}>
          <p style={{ margin: 0, color: "#6b7280" }}>Aucun sujet dans cette vue pour le moment.</p>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {visibleSubjects.map((subject) => {
            const statusStyle = STATUS_STYLE[subject.status];
            const isPending = pendingSubjectId === subject.id;

            return (
              <Card
                key={subject.id}
                style={{ padding: "1rem", display: "flex", gap: "1.1rem", alignItems: "flex-start", flexWrap: "wrap", border: "1px solid #efe3d4", boxShadow: "0 20px 40px rgba(15, 23, 42, 0.05)", borderRadius: "20px", background: "#fffdf9" }}
              >
                {subject.coverImageUrl ? <SubjectCover url={subject.coverImageUrl} width={148} /> : null}

                <div style={{ display: "grid", gap: "0.7rem", alignContent: "start", flex: "1 1 280px", minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.6rem", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                      <Badge style={{ background: statusStyle.background, color: statusStyle.color, padding: "0.35rem 0.65rem" }}>
                        {statusStyle.label}
                      </Badge>
                      {subject.sport ? (
                        <Badge style={{ background: "#eff6ff", color: "#1d4ed8", padding: "0.35rem 0.65rem" }}>{subject.sport}</Badge>
                      ) : null}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: "0.8rem", fontWeight: 600 }}>{formatDateLabel(subject.date)}</div>
                  </div>

                  <div>
                    <h3 style={{ margin: "0 0 0.35rem", fontSize: "1.08rem", color: "#111827", lineHeight: 1.3 }}>{subject.title}</h3>
                    <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6 }}>{subject.summary}</p>
                  </div>

                  <div style={{ display: "grid", gap: "0.35rem", color: "#374151", fontSize: "0.92rem" }}>
                    <div><strong style={{ color: "#111827" }}>Angle :</strong> {subject.angle}</div>
                    {subject.location ? <div><strong style={{ color: "#111827" }}>Lieu :</strong> {subject.location}</div> : null}
                    <div>
                      <strong style={{ color: "#111827" }}>Athlètes :</strong>{" "}
                      {subject.athleteIds.length > 0
                        ? subject.athleteIds.map((athleteId) => athleteNameById.get(athleteId) ?? athleteId).join(", ")
                        : "Aucun"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                    {REQUEST_TYPES.filter((type) => subject.availableRequestTypes.includes(type.value)).map((type) => (
                      <span key={type.value} style={{ background: "#f3f4f6", color: "#374151", borderRadius: "999px", padding: "0.3rem 0.6rem", fontWeight: 700, fontSize: "0.82rem" }}>
                        {type.label}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
                    {subject.status !== "published" ? (
                      <Button
                        type="button"
                        onClick={() => changeStatus(subject, "published")}
                        disabled={isPending}
                        style={{ borderRadius: "999px", padding: "0.6rem 0.9rem", background: "#f59e0b", color: "#fff", border: "none", opacity: isPending ? 0.6 : 1 }}
                      >
                        Publier
                      </Button>
                    ) : (
                      <button type="button" onClick={() => changeStatus(subject, "draft")} disabled={isPending} style={secondaryButtonStyle}>
                        Repasser en brouillon
                      </button>
                    )}
                    {subject.status !== "archived" ? (
                      <button type="button" onClick={() => changeStatus(subject, "archived")} disabled={isPending} style={secondaryButtonStyle}>
                        Archiver
                      </button>
                    ) : null}
                    <button type="button" onClick={() => openComposer(subject)} disabled={isPending} style={secondaryButtonStyle}>
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(subject)}
                      disabled={isPending}
                      style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "999px", padding: "0.55rem 0.8rem", cursor: "pointer", fontWeight: 700 }}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <MediaRequestsAdminSection />
    </div>
  );
}
