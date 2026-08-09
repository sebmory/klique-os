"use client";

import { useMemo, useState } from "react";
import { Edit2, Plus, Save, Trash2, X } from "lucide-react";
import { createProductionNote, parseProductionNotes, type ProductionNote } from "@/services/production-notes";
import type { Production } from "@/types/production";
import { ShootingService } from "@/services/shooting.service";

type ProductionNotesCardProps = {
  production: Production;
  onChange?: (production: Production) => void;
};

const formatDate = (value: string): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
};

export function ProductionNotesCard({ production, onChange }: ProductionNotesCardProps) {
  const [notes, setNotes] = useState<ProductionNote[]>(() => parseProductionNotes((production.raw.notes as unknown) ?? ""));
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydratedNotes = useMemo(() => parseProductionNotes((production.raw.notes as unknown) ?? ""), [production.raw.notes]);

  const persistNotes = async (nextNotes: ProductionNote[]) => {
    if (!production.row) return;
    setSaving(true);
    setError(null);
    try {
      await ShootingService.update({ row: production.row, notes: JSON.stringify(nextNotes) });
      const updatedProduction = { ...production, raw: { ...production.raw, notes: JSON.stringify(nextNotes) } };
      setNotes(nextNotes);
      onChange?.(updatedProduction);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’enregistrer la note.");
    } finally {
      setSaving(false);
    }
  };

  const startAdd = () => {
    setEditingId("new");
    setDraft("");
    setError(null);
  };

  const startEdit = (note: ProductionNote) => {
    setEditingId(note.id);
    setDraft(note.content);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
    setError(null);
  };

  const saveCurrent = async () => {
    const content = draft.trim();
    if (!content) return;

    const nextNotes = editingId && editingId !== "new"
      ? notes.map((note) => note.id === editingId ? { ...note, content, updatedAt: new Date().toISOString() } : note)
      : [createProductionNote(content), ...notes];

    await persistNotes(nextNotes);
    setEditingId(null);
    setDraft("");
  };

  const removeNote = async (noteId: string) => {
    const nextNotes = notes.filter((note) => note.id !== noteId);
    await persistNotes(nextNotes);
  };

  const visibleNotes = hydratedNotes.length ? hydratedNotes : notes;

  return (
    <article className="crm-person-card-shell">
      <header>
        <h2>Notes</h2>
      </header>

      {error ? <p className="crm-skeleton-label">{error}</p> : null}

      {visibleNotes.length ? (
        <div className="crm-production-notes-list">
          {visibleNotes.map((note) => (
            <div key={note.id} className="crm-person-note-item">
              <div className="crm-person-note-meta">
                <strong>{formatDate(note.updatedAt || note.createdAt)}</strong>
              </div>
              {editingId === note.id ? (
                <div className="modal-form">
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} />
                  <div className="modal-actions modal-wide">
                    <button type="button" className="secondary-button" onClick={cancelEdit}>
                      <X size={14} /> Annuler
                    </button>
                    <button type="button" className="primary-button" onClick={saveCurrent} disabled={saving || !draft.trim()}>
                      <Save size={14} /> Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="crm-person-notes-text">{note.content}</p>
                  <div className="modal-actions modal-wide">
                    <button type="button" className="secondary-button" onClick={() => startEdit(note)}>
                      <Edit2 size={14} /> Modifier
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void removeNote(note.id)} disabled={saving}>
                      <Trash2 size={14} /> Supprimer
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="crm-person-empty-note crm-production-empty-note-compact">
          <p>Aucune note pour le moment</p>
        </div>
      )}

      {editingId === "new" ? (
        <div className="modal-form">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} placeholder="Écrivez une note…" />
          <div className="modal-actions modal-wide">
            <button type="button" className="secondary-button" onClick={cancelEdit}>
              <X size={14} /> Annuler
            </button>
            <button type="button" className="primary-button" onClick={() => void saveCurrent()} disabled={saving || !draft.trim()}>
              <Save size={14} /> Enregistrer
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="crm-secondary-action-link" onClick={startAdd}>
          <Plus size={14} /> Ajouter une note
        </button>
      )}
    </article>
  );
}
