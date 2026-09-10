"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input, Select, Textarea } from "@/src/design-system/components";

type MediaDayStatus = "draft" | "open" | "completed" | "cancelled";

type MediaDayAthleteStatus = "invited" | "confirmed" | "declined" | "completed";

type MediaDayAthlete = {
  athleteId: string;
  status: MediaDayAthleteStatus;
  slotStart: string | null;
  slotEnd: string | null;
  respondedAt: string | null;
  adminNote: string | null;
};

type MediaDay = {
  id: string;
  title: string;
  description: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  capacity: number | null;
  status: MediaDayStatus;
  athleteIds: string[];
  athletes: MediaDayAthlete[];
};

type AthleteOption = { key: string; name: string; sport: string };

type FormAthlete = { athleteId: string; slotStart: string; slotEnd: string; adminNote: string };

type FormState = {
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  capacity: string;
  status: MediaDayStatus;
  athletes: FormAthlete[];
};

type StatusFilter = "all" | MediaDayStatus;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Toutes" },
  { value: "draft", label: "Brouillons" },
  { value: "open", label: "Ouvertes" },
  { value: "completed", label: "Terminées" },
  { value: "cancelled", label: "Annulées" },
];

const STATUS_STYLE: Record<MediaDayStatus, { label: string; background: string; color: string }> = {
  draft: { label: "Brouillon", background: "#fffbeb", color: "#b45309" },
  open: { label: "Ouverte", background: "#ecfdf5", color: "#047857" },
  completed: { label: "Terminée", background: "#f3f4f6", color: "#4b5563" },
  cancelled: { label: "Annulée", background: "#fef2f2", color: "#b91c1c" },
};

const ATHLETE_STATUS_LABELS: Record<MediaDayAthleteStatus, string> = {
  invited: "invité",
  confirmed: "confirmé",
  declined: "refusé",
  completed: "terminé",
};

const inputStyle = { width: "100%", borderRadius: "12px", padding: "0.6rem 0.7rem" } as const;

const secondaryButtonStyle = {
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#374151",
  borderRadius: "999px",
  padding: "0.55rem 0.85rem",
  cursor: "pointer",
  fontWeight: 700,
} as const;

const primaryButtonStyle = {
  borderRadius: "999px",
  padding: "0.6rem 1rem",
  background: "#f59e0b",
  color: "#fff",
  border: "none",
  fontWeight: 700,
} as const;

const filterButtonStyle = (active: boolean) =>
  ({
    borderRadius: "999px",
    padding: "0.5rem 0.85rem",
    fontWeight: 700,
    fontSize: "0.85rem",
    cursor: "pointer",
    border: active ? "1px solid #f59e0b" : "1px solid #efe3d4",
    background: active ? "#f59e0b" : "#fff",
    color: active ? "#fff" : "#6b7280",
  }) as const;

const createEmptyForm = (): FormState => ({
  title: "",
  description: "",
  date: new Date().toISOString().slice(0, 10),
  startTime: "",
  endTime: "",
  location: "",
  capacity: "",
  status: "draft",
  athletes: [],
});

const formatDateLabel = (value: string | null): string => {
  const isoPrefix = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim()) : null;
  return isoPrefix ? `${isoPrefix[3]}.${isoPrefix[2]}.${isoPrefix[1]}` : "Sans date";
};

const formatHoursLabel = (start: string | null, end: string | null): string => {
  if (start && end) return `${start} – ${end}`;
  return start || end || "Horaires à définir";
};

export default function MediaDaysPage() {
  const [mediaDays, setMediaDays] = useState<MediaDay[]>([]);
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(createEmptyForm());
  const [athleteQuery, setAthleteQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadMediaDays = useCallback(async () => {
    const response = await fetch("/api/media-days", { credentials: "include", cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; mediaDays?: MediaDay[]; message?: string }
      | null;

    if (!response.ok || !payload?.ok || !Array.isArray(payload.mediaDays)) {
      throw new Error(payload?.message || "Les journées média n’ont pas pu être chargées.");
    }

    setMediaDays(payload.mediaDays);
  }, []);

  useEffect(() => {
    let active = true;

    const loadAll = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await loadMediaDays();
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
  }, [loadMediaDays]);

  const athleteNameById = useMemo(() => {
    const index = new Map<string, string>();
    for (const athlete of athletes) index.set(athlete.key, athlete.name);
    return index;
  }, [athletes]);

  const visibleMediaDays = useMemo(
    () => (statusFilter === "all" ? mediaDays : mediaDays.filter((mediaDay) => mediaDay.status === statusFilter)),
    [mediaDays, statusFilter],
  );

  const counts = useMemo(() => {
    const index = new Map<MediaDayStatus, number>();
    for (const mediaDay of mediaDays) index.set(mediaDay.status, (index.get(mediaDay.status) ?? 0) + 1);
    return index;
  }, [mediaDays]);

  const athleteResults = useMemo(() => {
    const query = athleteQuery.trim().toLowerCase();
    const selected = new Set(form.athletes.map((athlete) => athlete.athleteId));
    const available = athletes.filter((athlete) => !selected.has(athlete.key));
    if (!query) return available.slice(0, 8);
    return available
      .filter((athlete) => `${athlete.name} ${athlete.sport}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [athleteQuery, athletes, form.athletes]);

  const openComposer = (mediaDay?: MediaDay) => {
    setActionError(null);
    setFormError(null);
    setAthleteQuery("");

    if (mediaDay) {
      setEditingId(mediaDay.id);
      setForm({
        title: mediaDay.title,
        description: mediaDay.description,
        date: mediaDay.date ?? "",
        startTime: mediaDay.startTime ?? "",
        endTime: mediaDay.endTime ?? "",
        location: mediaDay.location ?? "",
        capacity: mediaDay.capacity === null ? "" : String(mediaDay.capacity),
        status: mediaDay.status,
        athletes: mediaDay.athletes.map((athlete) => ({
          athleteId: athlete.athleteId,
          slotStart: athlete.slotStart ?? "",
          slotEnd: athlete.slotEnd ?? "",
          adminNote: athlete.adminNote ?? "",
        })),
      });
    } else {
      setEditingId(null);
      setForm(createEmptyForm());
    }

    setIsComposerOpen(true);
  };

  const closeComposer = () => {
    setIsComposerOpen(false);
    setEditingId(null);
    setForm(createEmptyForm());
    setAthleteQuery("");
    setFormError(null);
  };

  const updateAthlete = (athleteId: string, patch: Partial<FormAthlete>) => {
    setForm((current) => ({
      ...current,
      athletes: current.athletes.map((athlete) =>
        athlete.athleteId === athleteId ? { ...athlete, ...patch } : athlete,
      ),
    }));
  };

  const buildPayload = (form: FormState) => ({
    title: form.title.trim(),
    description: form.description.trim(),
    date: form.date || null,
    startTime: form.startTime || null,
    endTime: form.endTime || null,
    location: form.location.trim() || null,
    capacity: form.capacity.trim() === "" ? null : Number(form.capacity),
    status: form.status,
    athletes: form.athletes.map((athlete) => ({
      athleteId: athlete.athleteId,
      slotStart: athlete.slotStart || null,
      slotEnd: athlete.slotEnd || null,
      adminNote: athlete.adminNote.trim() || null,
    })),
  });

  const handleSave = async () => {
    if (saving) return;

    if (!form.title.trim() || !form.description.trim() || !form.date) {
      setFormError("Titre, description et date sont obligatoires.");
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      const payload = buildPayload(form);
      const response = await fetch("/api/media-days", {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { mediaDayId: editingId, ...payload } : payload),
      });

      const result = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !result?.ok) {
        setFormError(result?.message || "La journée média n’a pas pu être enregistrée.");
        return;
      }

      await loadMediaDays();
      closeComposer();
    } catch {
      setFormError("La journée média n’a pas pu être enregistrée. Veuillez réessayer.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (mediaDay: MediaDay, status: MediaDayStatus) => {
    if (pendingId) return;

    setActionError(null);
    setPendingId(mediaDay.id);
    try {
      const response = await fetch("/api/media-days", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaDayId: mediaDay.id,
          title: mediaDay.title,
          description: mediaDay.description,
          date: mediaDay.date,
          startTime: mediaDay.startTime,
          endTime: mediaDay.endTime,
          location: mediaDay.location,
          capacity: mediaDay.capacity,
          status,
          athletes: mediaDay.athletes.map((athlete) => ({
            athleteId: athlete.athleteId,
            slotStart: athlete.slotStart,
            slotEnd: athlete.slotEnd,
            adminNote: athlete.adminNote,
          })),
        }),
      });

      const result = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !result?.ok) {
        setActionError(result?.message || "Le statut n’a pas pu être modifié.");
        return;
      }

      await loadMediaDays();
    } catch {
      setActionError("Le statut n’a pas pu être modifié. Veuillez réessayer.");
    } finally {
      setPendingId(null);
    }
  };

  const handleDelete = async (mediaDay: MediaDay) => {
    if (pendingId) return;
    if (!window.confirm(`Supprimer définitivement la journée « ${mediaDay.title} » ?`)) return;

    setActionError(null);
    setPendingId(mediaDay.id);
    try {
      const response = await fetch(`/api/media-days?mediaDayId=${encodeURIComponent(mediaDay.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !result?.ok) {
        setActionError(result?.message || "La journée média n’a pas pu être supprimée.");
        return;
      }

      await loadMediaDays();
    } catch {
      setActionError("La journée média n’a pas pu être supprimée. Veuillez réessayer.");
    } finally {
      setPendingId(null);
    }
  };

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
              MEDIA DAYS
            </p>
            <h1 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.35rem", color: "#111827" }}>Journées média</h1>
            <p style={{ margin: 0, color: "#6b7280", maxWidth: "760px", lineHeight: 1.6 }}>
              Organisez les journées média, invitez les athlètes et suivez leurs réponses. Seules les journées ouvertes
              sont visibles par les athlètes invités.
            </p>
          </div>
          <Button type="button" onClick={() => openComposer()} style={primaryButtonStyle}>
            + Nouvelle journée
          </Button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((filter) => {
            const count = filter.value === "all" ? mediaDays.length : counts.get(filter.value) ?? 0;
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
                style={filterButtonStyle(statusFilter === filter.value)}
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

      {isComposerOpen ? (
        <Card
          style={{
            padding: "1.15rem",
            display: "grid",
            gap: "1rem",
            border: "1px solid #f0e2d0",
            boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#111827" }}>
              {editingId ? "Modifier la journée" : "Nouvelle journée média"}
            </h2>
            <button type="button" onClick={closeComposer} style={{ border: "none", background: "transparent", color: "#6b7280", cursor: "pointer", fontWeight: 700 }}>
              Fermer
            </button>
          </div>

          <div style={{ display: "grid", gap: "0.8rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#374151" }}>Titre</span>
              <Input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#374151" }}>Date</span>
              <Input
                type="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#374151" }}>Heure de début</span>
              <Input
                type="time"
                value={form.startTime}
                onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#374151" }}>Heure de fin</span>
              <Input
                type="time"
                value={form.endTime}
                onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#374151" }}>Lieu</span>
              <Input
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#374151" }}>Capacité</span>
              <Input
                type="number"
                min="1"
                value={form.capacity}
                onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#374151" }}>Statut</span>
              <Select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as MediaDayStatus }))}
                style={inputStyle}
              >
                <option value="draft">Brouillon</option>
                <option value="open">Ouverte</option>
                <option value="completed">Terminée</option>
                <option value="cancelled">Annulée</option>
              </Select>
            </label>
          </div>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#374151" }}>Description</span>
            <Textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              style={{ ...inputStyle, minHeight: "86px", resize: "vertical" }}
            />
          </label>

          <div style={{ display: "grid", gap: "0.6rem", padding: "0.9rem", border: "1px solid #f0e2d0", borderRadius: "16px", background: "#fffdf9" }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>Athlètes invités</p>

            {form.athletes.length > 0 ? (
              <div style={{ display: "grid", gap: "0.6rem" }}>
                {form.athletes.map((athlete) => (
                  <div
                    key={athlete.athleteId}
                    style={{ display: "grid", gap: "0.5rem", padding: "0.7rem", border: "1px solid #efe3d4", borderRadius: "14px", background: "#fff" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                      <strong style={{ color: "#111827" }}>{athleteNameById.get(athlete.athleteId) ?? athlete.athleteId}</strong>
                      <button
                        type="button"
                        aria-label={`Retirer ${athleteNameById.get(athlete.athleteId) ?? athlete.athleteId}`}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            athletes: current.athletes.filter((entry) => entry.athleteId !== athlete.athleteId),
                          }))
                        }
                        style={{ border: "none", background: "transparent", color: "#b91c1c", cursor: "pointer", fontWeight: 700 }}
                      >
                        Retirer
                      </button>
                    </div>

                    <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                      <label style={{ display: "grid", gap: "0.3rem" }}>
                        <span style={{ fontSize: "0.8rem", color: "#6b7280", fontWeight: 600 }}>Créneau début</span>
                        <Input
                          type="time"
                          value={athlete.slotStart}
                          onChange={(event) => updateAthlete(athlete.athleteId, { slotStart: event.target.value })}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: "grid", gap: "0.3rem" }}>
                        <span style={{ fontSize: "0.8rem", color: "#6b7280", fontWeight: 600 }}>Créneau fin</span>
                        <Input
                          type="time"
                          value={athlete.slotEnd}
                          onChange={(event) => updateAthlete(athlete.athleteId, { slotEnd: event.target.value })}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: "grid", gap: "0.3rem" }}>
                        <span style={{ fontSize: "0.8rem", color: "#6b7280", fontWeight: 600 }}>Note admin</span>
                        <Input
                          value={athlete.adminNote}
                          onChange={(event) => updateAthlete(athlete.athleteId, { adminNote: event.target.value })}
                          style={inputStyle}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9rem" }}>Aucun athlète invité pour l’instant.</p>
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
                      setForm((current) => ({
                        ...current,
                        athletes: [...current.athletes, { athleteId: athlete.key, slotStart: "", slotEnd: "", adminNote: "" }],
                      }));
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

          {formError ? (
            <p role="alert" style={{ margin: 0, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", padding: "0.7rem 0.85rem" }}>
              {formError}
            </p>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", flexWrap: "wrap" }}>
            <Button type="button" onClick={closeComposer} style={secondaryButtonStyle}>
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ ...primaryButtonStyle, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "Enregistrement…" : editingId ? "Enregistrer les modifications" : "Créer la journée"}
            </Button>
          </div>
        </Card>
      ) : null}

      {loadError ? (
        <Card style={{ padding: "1rem", border: "1px solid #fecaca", background: "#fef2f2" }}>
          <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>
            {loadError}
          </p>
        </Card>
      ) : null}

      {loading ? (
        <Card style={{ padding: "1rem", border: "1px solid #efe3d4" }}>
          <p style={{ margin: 0, color: "#6b7280" }}>Chargement des journées média…</p>
        </Card>
      ) : visibleMediaDays.length === 0 && !loadError ? (
        <Card style={{ padding: "1rem", border: "1px solid #efe3d4" }}>
          <p style={{ margin: 0, color: "#6b7280" }}>Aucune journée média dans cette vue pour le moment.</p>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {visibleMediaDays.map((mediaDay) => {
            const statusStyle = STATUS_STYLE[mediaDay.status];
            const isPending = pendingId === mediaDay.id;

            return (
              <Card
                key={mediaDay.id}
                style={{
                  padding: "1rem",
                  display: "grid",
                  gap: "0.7rem",
                  border: "1px solid #efe3d4",
                  boxShadow: "0 20px 40px rgba(15, 23, 42, 0.05)",
                  borderRadius: "20px",
                  background: "#fffdf9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.6rem", flexWrap: "wrap" }}>
                  <Badge style={{ background: statusStyle.background, color: statusStyle.color, padding: "0.35rem 0.65rem" }}>
                    {statusStyle.label}
                  </Badge>
                  <div style={{ color: "#6b7280", fontSize: "0.8rem", fontWeight: 600 }}>{formatDateLabel(mediaDay.date)}</div>
                </div>

                <div>
                  <h3 style={{ margin: "0 0 0.35rem", fontSize: "1.08rem", color: "#111827", lineHeight: 1.3 }}>{mediaDay.title}</h3>
                  <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{mediaDay.description}</p>
                </div>

                <div style={{ display: "grid", gap: "0.35rem", color: "#374151", fontSize: "0.92rem" }}>
                  <div>
                    <strong style={{ color: "#111827" }}>Horaires :</strong> {formatHoursLabel(mediaDay.startTime, mediaDay.endTime)}
                  </div>
                  <div>
                    <strong style={{ color: "#111827" }}>Lieu :</strong> {mediaDay.location || "À définir"}
                  </div>
                  <div>
                    <strong style={{ color: "#111827" }}>Capacité :</strong>{" "}
                    {mediaDay.capacity === null ? "Non plafonnée" : `${mediaDay.capacity} athlètes`}
                  </div>
                  <div>
                    <strong style={{ color: "#111827" }}>Athlètes :</strong>{" "}
                    {mediaDay.athletes.length > 0
                      ? mediaDay.athletes
                          .map((athlete) => {
                            const name = athleteNameById.get(athlete.athleteId) ?? athlete.athleteId;
                            const slot = athlete.slotStart && athlete.slotEnd ? ` ${athlete.slotStart}–${athlete.slotEnd}` : "";
                            return `${name} (${ATHLETE_STATUS_LABELS[athlete.status]})${slot}`;
                          })
                          .join(", ")
                      : "Aucun"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
                  {mediaDay.status !== "open" ? (
                    <Button
                      type="button"
                      onClick={() => changeStatus(mediaDay, "open")}
                      disabled={isPending}
                      style={{ ...primaryButtonStyle, opacity: isPending ? 0.6 : 1 }}
                    >
                      Ouvrir
                    </Button>
                  ) : null}
                  {mediaDay.status !== "completed" ? (
                    <button type="button" onClick={() => changeStatus(mediaDay, "completed")} disabled={isPending} style={secondaryButtonStyle}>
                      Terminer
                    </button>
                  ) : null}
                  {mediaDay.status !== "cancelled" ? (
                    <button type="button" onClick={() => changeStatus(mediaDay, "cancelled")} disabled={isPending} style={secondaryButtonStyle}>
                      Annuler la journée
                    </button>
                  ) : null}
                  <button type="button" onClick={() => openComposer(mediaDay)} disabled={isPending} style={secondaryButtonStyle}>
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(mediaDay)}
                    disabled={isPending}
                    style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "999px", padding: "0.55rem 0.85rem", cursor: "pointer", fontWeight: 700 }}
                  >
                    Supprimer
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
