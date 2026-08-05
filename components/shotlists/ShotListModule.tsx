"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Shooting } from "@/types/shooting";
import type { NewShotListItem, ShotListItem } from "@/types/shotlist";
import { ShotListService } from "@/services/shotlist.service";
import { Modal } from "@/components/ui/Modal";

const emptyItem: NewShotListItem = {
  shootingRow: undefined,
  athlete: "",
  sport: "",
  shootingTitle: "",
  category: "Portrait",
  title: "",
  priority: "Moyenne",
  done: false,
  notes: "",
  order: 1,
};

export function ShotListModule({
  shootings,
  items,
  source,
  message,
  onRefresh,
}: {
  shootings: Shooting[];
  items: ShotListItem[];
  source: "google-sheets" | "demo";
  message: string;
  onRefresh: () => Promise<void>;
}) {
  const [selectedShooting, setSelectedShooting] = useState("Tous");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<NewShotListItem>(emptyItem);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const visible = useMemo(() => {
    const filtered =
      selectedShooting === "Tous"
        ? items
        : items.filter(
            (item) => String(item.shootingRow ?? "") === selectedShooting
          );

    return [...filtered].sort((a, b) => a.order - b.order);
  }, [items, selectedShooting]);

  const groups = useMemo(() => {
    return visible.reduce<Record<string, ShotListItem[]>>((acc, item) => {
      const key = item.category || "Autre";
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [visible]);

  const createItem = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback("");

    try {
      await ShotListService.create(form);
      setFeedback("L’élément a été ajouté à la Shot List.");
      setForm(emptyItem);
      setShowCreate(false);
      await onRefresh();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Création impossible."
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (item: ShotListItem) => {
    if (!item.row) return;
    setSaving(true);
    setFeedback("");

    try {
      await ShotListService.update({
        row: item.row,
        done: !item.done,
      });
      await onRefresh();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Mise à jour impossible."
      );
    } finally {
      setSaving(false);
    }
  };

  const chooseShooting = (rowValue: string) => {
    const row = Number(rowValue);
    const shooting = shootings.find((item) => item.row === row);

    setForm({
      ...emptyItem,
      shootingRow: shooting?.row,
      athlete: shooting?.athlete ?? "",
      sport: shooting?.sport ?? "",
      shootingTitle: shooting?.type ?? "",
      order:
        items.filter((item) => item.shootingRow === shooting?.row).length + 1,
    });
  };

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Smart Shot List · V0.10.3 Sprint 1</p>
          <h2>Shot List</h2>
          <p>
            Crée, classe et coche les images à réaliser pour chaque shooting.
          </p>
        </div>
        <button className="primary-button" onClick={() => setShowCreate(true)}>
          + Ajouter une image
        </button>
      </section>

      {source === "demo" && (
        <div className="connection-banner">
          <strong>Mode démo pour la Shot List</strong>
          <small>{message}</small>
        </div>
      )}

      {feedback && <div className="success-banner">{feedback}</div>}

      <section className="module-kpis">
        <article>
          <span>Total</span>
          <strong>{visible.length}</strong>
          <small>images prévues</small>
        </article>
        <article>
          <span>Réalisées</span>
          <strong>{visible.filter((item) => item.done).length}</strong>
          <small>cases cochées</small>
        </article>
        <article>
          <span>Restantes</span>
          <strong>{visible.filter((item) => !item.done).length}</strong>
          <small>à produire</small>
        </article>
        <article>
          <span>Progression</span>
          <strong>{ShotListService.progress(visible)}%</strong>
          <small>couverture actuelle</small>
        </article>
      </section>

      <section className="shotlist-toolbar">
        <label>
          <span>Shooting</span>
          <select
            value={selectedShooting}
            onChange={(event) => setSelectedShooting(event.target.value)}
          >
            <option>Tous</option>
            {shootings.map((shooting, index) => (
              <option
                key={`${shooting.row ?? index}-${shooting.athlete}`}
                value={String(shooting.row ?? "")}
              >
                {shooting.date} · {shooting.athlete} · {shooting.type}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="shotlist-groups">
        {Object.entries(groups).map(([category, categoryItems]) => (
          <article className="shotlist-group" key={category}>
            <header>
              <div>
                <p className="eyebrow">Catégorie</p>
                <h3>{category}</h3>
              </div>
              <span>
                {categoryItems.filter((item) => item.done).length}/
                {categoryItems.length}
              </span>
            </header>

            <div className="shotlist-items">
              {categoryItems.map((item) => (
                <button
                  className={`shotlist-item ${item.done ? "done" : ""}`}
                  key={`${item.row}-${item.id}`}
                  onClick={() => toggleDone(item)}
                  disabled={saving}
                >
                  <span className="shotlist-check">
                    {item.done ? "✓" : ""}
                  </span>

                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.athlete || "Général"} ·{" "}
                      {item.shootingTitle || "Shooting"}
                    </small>
                    {item.notes && <p>{item.notes}</p>}
                  </div>

                  <span className={`priority ${item.priority.toLowerCase()}`}>
                    {item.priority}
                  </span>
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>

      {showCreate && (
        <Modal title="Ajouter une image à la Shot List" onClose={() => setShowCreate(false)}>
          <form className="modal-form" onSubmit={createItem}>
            <label className="modal-wide">
              <span>Shooting</span>
              <select
                value={form.shootingRow ?? ""}
                onChange={(event) => chooseShooting(event.target.value)}
              >
                <option value="">Aucun shooting lié</option>
                {shootings.map((shooting, index) => (
                  <option
                    key={`${shooting.row ?? index}-${shooting.athlete}`}
                    value={shooting.row}
                  >
                    {shooting.date} · {shooting.athlete} · {shooting.type}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Catégorie</span>
              <select
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
              >
                <option>Portrait</option>
                <option>Action</option>
                <option>Détails</option>
                <option>Réseaux sociaux</option>
                <option>Sponsor</option>
                <option>Vidéo</option>
                <option>Autre</option>
              </select>
            </label>

            <label>
              <span>Priorité</span>
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm({
                    ...form,
                    priority: event.target.value as NewShotListItem["priority"],
                  })
                }
              >
                <option>Faible</option>
                <option>Moyenne</option>
                <option>Haute</option>
                <option>Urgente</option>
              </select>
            </label>

            <label className="modal-wide">
              <span>Image à réaliser</span>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="Portrait vertical, célébration, sponsor…"
                required
              />
            </label>

            <label className="modal-wide">
              <span>Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </label>

            <div className="modal-actions modal-wide">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowCreate(false)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={saving}>
                {saving ? "Ajout…" : "Ajouter"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
