"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  CreativeAvailabilityConflict,
  CreativeAvailabilityInput,
  CreativeAvailabilityOccurrence,
  CreativeAvailabilityRule,
} from "@/lib/creative-availability";

type CreativeOption = {
  id: string;
  displayName: string;
};

type AvailabilityPayload = {
  rules?: CreativeAvailabilityRule[];
  occurrences?: CreativeAvailabilityOccurrence[];
  conflicts?: CreativeAvailabilityConflict[];
  error?: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const futureDate = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const emptyAvailability = (): CreativeAvailabilityInput => ({
  availabilityDate: today(),
  startTime: "09:00",
  endTime: "18:00",
  allDay: false,
  recurrence: "none",
  recurrenceUntil: null,
  exceptionDates: [],
  regions: [],
  missionTypes: ["match_competition", "media_day"],
  internalComment: null,
});

const formatDate = (date: string) => new Intl.DateTimeFormat("fr-CH", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(new Date(`${date}T12:00:00`));

export function CreativeAvailabilityManager({
  admin = false,
}: {
  admin?: boolean;
}) {
  const [rules, setRules] = useState<CreativeAvailabilityRule[]>([]);
  const [occurrences, setOccurrences] = useState<CreativeAvailabilityOccurrence[]>([]);
  const [conflicts, setConflicts] = useState<CreativeAvailabilityConflict[]>([]);
  const [creatives, setCreatives] = useState<CreativeOption[]>([]);
  const [creativeProfileId, setCreativeProfileId] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => futureDate(90));
  const [regionFilter, setRegionFilter] = useState("");
  const [missionFilter, setMissionFilter] = useState("");
  const [form, setForm] = useState<CreativeAvailabilityInput>(emptyAvailability);
  const [regionInput, setRegionInput] = useState("");
  const [exceptionInput, setExceptionInput] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pendingRef = useRef(false);

  const endpoint = admin ? "/api/admin/creative-availability" : "/api/creative/availability";

  const loadCreatives = useCallback(async () => {
    if (!admin) return;
    const response = await fetch("/api/admin/creatives", { cache: "no-store" });
    const payload = await response.json() as { profiles?: CreativeOption[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Impossible de charger les créatifs.");
    const options = (payload.profiles ?? []).map((profile) => ({
      id: profile.id,
      displayName: profile.displayName,
    }));
    setCreatives(options);
  }, [admin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ from, to });
    if (admin && creativeProfileId) params.set("creativeProfileId", creativeProfileId);
    if (admin && regionFilter) params.set("region", regionFilter);
    if (admin && missionFilter) params.set("missionType", missionFilter);
    try {
      const response = await fetch(`${endpoint}?${params}`, { cache: "no-store" });
      const payload = await response.json() as AvailabilityPayload;
      if (!response.ok) throw new Error(payload.error || "Impossible de charger les disponibilités.");
      setRules(payload.rules ?? []);
      setOccurrences(payload.occurrences ?? []);
      setConflicts(payload.conflicts ?? []);
    } finally {
      setLoading(false);
    }
  }, [
    admin,
    creativeProfileId,
    endpoint,
    from,
    missionFilter,
    regionFilter,
    to,
  ]);

  useEffect(() => {
    void Promise.resolve().then(loadCreatives).catch((failure) =>
      setError(failure instanceof Error ? failure.message : "Chargement impossible.")
    );
  }, [loadCreatives]);

  useEffect(() => {
    void Promise.resolve().then(load).catch((failure) =>
      setError(failure instanceof Error ? failure.message : "Chargement impossible.")
    );
  }, [load]);

  const conflictKeys = useMemo(
    () => new Set(conflicts.map((conflict) => `${conflict.creativeProfileId}:${conflict.date}`)),
    [conflicts],
  );

  const resetForm = () => {
    setForm(emptyAvailability());
    setRegionInput("");
    setExceptionInput("");
    setEditingRuleId(null);
  };

  const editRule = (rule: CreativeAvailabilityRule) => {
    setEditingRuleId(rule.id);
    setForm({
      availabilityDate: rule.availabilityDate,
      startTime: rule.startTime,
      endTime: rule.endTime,
      allDay: rule.allDay,
      recurrence: rule.recurrence,
      recurrenceUntil: rule.recurrenceUntil,
      exceptionDates: rule.exceptionDates,
      regions: rule.regions,
      missionTypes: rule.missionTypes,
      internalComment: rule.internalComment,
    });
    setRegionInput(rule.regions.join(", "));
    setExceptionInput(rule.exceptionDates.join(", "));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current || (admin && !creativeProfileId)) return;
    pendingRef.current = true;
    setSubmitting(true);
    setError("");
    setMessage("");
    const availability = {
      ...form,
      regions: regionInput.split(",").map((value) => value.trim()).filter(Boolean),
      exceptionDates: exceptionInput.split(",").map((value) => value.trim()).filter(Boolean),
      startTime: form.allDay ? null : form.startTime,
      endTime: form.allDay ? null : form.endTime,
      recurrenceUntil: form.recurrence === "weekly" ? form.recurrenceUntil : null,
    };
    try {
      const response = await fetch(endpoint, {
        method: editingRuleId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(admin
          ? {
              creativeProfileId,
              ...(editingRuleId ? { ruleId: editingRuleId } : {}),
              availability,
            }
          : editingRuleId
            ? { ruleId: editingRuleId, availability }
            : availability),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.");
      setMessage(editingRuleId ? "Disponibilité modifiée." : "Disponibilité ajoutée.");
      resetForm();
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Enregistrement impossible.");
    } finally {
      pendingRef.current = false;
      setSubmitting(false);
    }
  };

  const remove = async (rule: CreativeAvailabilityRule) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setError("");
    const params = new URLSearchParams({ ruleId: rule.id });
    if (admin) params.set("creativeProfileId", rule.creativeProfileId);
    try {
      const response = await fetch(`${endpoint}?${params}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Suppression impossible.");
      setMessage("Disponibilité supprimée.");
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Suppression impossible.");
    } finally {
      pendingRef.current = false;
    }
  };

  return (
    <section className="creative-availability" aria-labelledby={`availability-title-${admin ? "admin" : "creative"}`}>
      <header className="creative-availability-header">
        <div>
          <p>{admin ? "Pilotage consolidé" : "Mon calendrier"}</p>
          <h2 id={`availability-title-${admin ? "admin" : "creative"}`}>
            Disponibilités des créatifs
          </h2>
          <span>
            Une disponibilité facilite le rapprochement. Elle ne constitue ni une réservation,
            ni une attribution.
          </span>
        </div>
        <strong>Europe/Zurich</strong>
      </header>

      {admin ? (
        <div className="creative-availability-filters">
          <label>
            Créatif
            <select value={creativeProfileId} onChange={(event) => setCreativeProfileId(event.target.value)}>
              <option value="">Tous les créatifs</option>
              {creatives.map((creative) => (
                <option key={creative.id} value={creative.id}>{creative.displayName}</option>
              ))}
            </select>
          </label>
          <label>Du<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>Au<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <label>Région<input value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} /></label>
          <label>
            Mission
            <select value={missionFilter} onChange={(event) => setMissionFilter(event.target.value)}>
              <option value="">Toutes</option>
              <option value="match_competition">Match / compétition</option>
              <option value="media_day">Media Day</option>
            </select>
          </label>
        </div>
      ) : null}

      <form className="creative-availability-form" onSubmit={submit}>
        {admin ? (
          <label>
            Saisie pour
            <select required value={creativeProfileId} onChange={(event) => setCreativeProfileId(event.target.value)}>
              <option value="">Choisir un créatif</option>
              {creatives.map((creative) => (
                <option key={creative.id} value={creative.id}>{creative.displayName}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Date
          <input
            type="date"
            required
            value={form.availabilityDate}
            onChange={(event) => setForm({ ...form, availabilityDate: event.target.value })}
          />
        </label>
        <label className="creative-availability-checkbox">
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(event) => setForm({ ...form, allDay: event.target.checked })}
          />
          Journée entière
        </label>
        {!form.allDay ? (
          <>
            <label>
              Début
              <input
                type="time"
                required
                value={form.startTime ?? ""}
                onChange={(event) => setForm({ ...form, startTime: event.target.value })}
              />
            </label>
            <label>
              Fin
              <input
                type="time"
                required
                value={form.endTime ?? ""}
                onChange={(event) => setForm({ ...form, endTime: event.target.value })}
              />
            </label>
          </>
        ) : null}
        <label>
          Récurrence
          <select
            value={form.recurrence}
            onChange={(event) => setForm({
              ...form,
              recurrence: event.target.value as CreativeAvailabilityInput["recurrence"],
              recurrenceUntil: event.target.value === "weekly" ? form.availabilityDate : null,
            })}
          >
            <option value="none">Aucune</option>
            <option value="weekly">Chaque semaine</option>
          </select>
        </label>
        {form.recurrence === "weekly" ? (
          <label>
            Fin de récurrence
            <input
              type="date"
              required
              min={form.availabilityDate}
              value={form.recurrenceUntil ?? ""}
              onChange={(event) => setForm({ ...form, recurrenceUntil: event.target.value })}
            />
          </label>
        ) : null}
        <label>
          Exceptions
          <input
            value={exceptionInput}
            onChange={(event) => setExceptionInput(event.target.value)}
            placeholder="2026-12-24, 2026-12-31"
          />
          <small>Dates exclues, séparées par une virgule.</small>
        </label>
        <label>
          Régions
          <input
            required
            value={regionInput}
            onChange={(event) => setRegionInput(event.target.value)}
            placeholder="Vaud, Genève"
          />
        </label>
        <fieldset>
          <legend>Types de mission acceptés</legend>
          {([
            ["match_competition", "Match / compétition"],
            ["media_day", "Media Day"],
          ] as const).map(([value, label]) => (
            <label key={value} className="creative-availability-checkbox">
              <input
                type="checkbox"
                checked={form.missionTypes.includes(value)}
                onChange={(event) => setForm({
                  ...form,
                  missionTypes: event.target.checked
                    ? [...new Set([...form.missionTypes, value])]
                    : form.missionTypes.filter((type) => type !== value),
                })}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label>
          Commentaire interne
          <textarea
            maxLength={1000}
            value={form.internalComment ?? ""}
            onChange={(event) => setForm({ ...form, internalComment: event.target.value })}
          />
        </label>
        <div className="creative-availability-actions">
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? "Enregistrement…" : editingRuleId ? "Modifier" : "Ajouter"}
          </button>
          {editingRuleId ? (
            <button type="button" className="secondary-button" onClick={resetForm}>Annuler</button>
          ) : null}
        </div>
      </form>

      {error ? <p className="form-message is-error" role="alert">{error}</p> : null}
      {message ? <p className="form-message is-success" role="status">{message}</p> : null}

      <div className="creative-availability-list" aria-live="polite">
        {loading ? <p>Chargement des disponibilités…</p> : occurrences.length === 0 ? (
          <p>Aucune disponibilité sur cette période.</p>
        ) : occurrences.map((occurrence) => {
          const hasConflict = conflictKeys.has(`${occurrence.creativeProfileId}:${occurrence.date}`);
          return (
            <article key={`${occurrence.ruleId}:${occurrence.date}`} className={hasConflict ? "has-conflict" : ""}>
              <div>
                <strong>{formatDate(occurrence.date)}</strong>
                {admin ? <span>{occurrence.creativeDisplayName}</span> : null}
                <span>
                  {occurrence.allDay
                    ? "Journée entière"
                    : `${occurrence.startTime}–${occurrence.endTime}`}
                </span>
              </div>
              <p>{occurrence.regions.join(", ")} · {occurrence.missionTypes.map((type) =>
                type === "media_day" ? "Media Day" : "Match / compétition"
              ).join(" + ")}</p>
              {hasConflict ? <mark>Mission confirmée ce jour</mark> : null}
              {occurrence.internalComment ? <small>{occurrence.internalComment}</small> : null}
              {occurrence.date === rules.find((rule) => rule.id === occurrence.ruleId)?.availabilityDate ? (
                <div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      const rule = rules.find((item) => item.id === occurrence.ruleId);
                      if (rule) editRule(rule);
                    }}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      const rule = rules.find((item) => item.id === occurrence.ruleId);
                      if (rule) void remove(rule);
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
