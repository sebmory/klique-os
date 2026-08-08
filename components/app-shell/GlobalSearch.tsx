"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { commandEntries } from "./data";
import { Search } from "./icons";

const groupedOrder = ["Personnes", "Organisations", "Projets", "Medias", "Actions rapides"] as const;

const isMac = () => {
  if (typeof window === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(window.navigator.platform);
};

type GlobalSearchProps = {
  compact?: boolean;
};

export function GlobalSearch({ compact = false }: GlobalSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const wantsPalette = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (wantsPalette) {
        event.preventDefault();
        setActiveIndex(0);
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return commandEntries;
    return commandEntries.filter((entry) => entry.label.toLowerCase().includes(keyword));
  }, [query]);

  const grouped = useMemo(() => {
    return groupedOrder
      .map((category) => ({
        category,
        entries: filtered.filter((entry) => entry.category === category),
      }))
      .filter((group) => group.entries.length > 0);
  }, [filtered]);

  const flatEntries = useMemo(() => grouped.flatMap((group) => group.entries), [grouped]);

  useEffect(() => {
    if (!open) return;

    const onPaletteKeys = (event: KeyboardEvent) => {
      if (!flatEntries.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((value) => (value + 1) % flatEntries.length);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((value) => (value - 1 + flatEntries.length) % flatEntries.length);
      }
      if (event.key === "Enter") {
        const entry = flatEntries[activeIndex];
        if (!entry) return;
        event.preventDefault();
        router.push(entry.href);
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onPaletteKeys);
    return () => window.removeEventListener("keydown", onPaletteKeys);
  }, [activeIndex, flatEntries, open, router]);

  const shortcut = isMac() ? "⌘ K" : "Ctrl K";

  return (
    <>
      {compact ? (
        <button
          type="button"
          className="header-icon-button"
          onClick={() => {
            setActiveIndex(0);
            setOpen(true);
          }}
          aria-label="Ouvrir la recherche"
        >
          <Search className="app-icon" />
        </button>
      ) : (
        <button
          type="button"
          className="global-search-trigger"
          onClick={() => {
            setActiveIndex(0);
            setOpen(true);
          }}
          aria-label="Ouvrir la recherche globale"
        >
          <Search className="app-icon" />
          <span>Rechercher dans KLIQUE...</span>
          <kbd>{shortcut}</kbd>
        </button>
      )}

      {open ? (
        <div className="command-overlay" role="presentation" onClick={() => setOpen(false)}>
          <section
            className="command-palette"
            role="dialog"
            aria-label="Command palette"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <Search className="app-icon" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                placeholder="Rechercher dans KLIQUE..."
                autoFocus
                aria-label="Rechercher une commande"
              />
            </header>

            <div className="command-results">
              {grouped.length === 0 ? (
                <p className="command-empty">Aucun resultat pour cette recherche.</p>
              ) : (
                grouped.map((group) => (
                  <div key={group.category} className="command-group">
                    <p>{group.category}</p>
                    <ul role="listbox" aria-label={group.category}>
                      {group.entries.map((entry) => (
                        <li key={entry.id}>
                          <Link
                            href={entry.href}
                            onClick={() => setOpen(false)}
                            className={flatEntries[activeIndex]?.id === entry.id ? "is-selected" : undefined}
                            role="option"
                            aria-selected={flatEntries[activeIndex]?.id === entry.id}
                          >
                            {entry.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
