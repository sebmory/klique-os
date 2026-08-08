"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

type EntitySelectorRenderState = {
  selected: boolean;
  active: boolean;
};

type EntitySelectorProps<T> = {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  items: T[];
  selectedId?: string;
  loading: boolean;
  errorMessage: string | null;
  onRetry?: () => void;
  onSelect: (item: T) => void;
  getItemId: (item: T) => string;
  getItemSearchText: (item: T) => string;
  renderItem: (item: T, state: EntitySelectorRenderState) => ReactNode;
  renderSelection?: (item: T) => ReactNode;
  emptyMessage: string;
  noResultsMessage: string;
  emptyAction?: ReactNode;
  onOpen?: () => void;
};

const normalize = (value: string): string => value.trim().toLowerCase();

export function EntitySelector<T>(props: EntitySelectorProps<T>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();

  const selectedItem = useMemo(() => {
    if (!props.selectedId) return null;
    return props.items.find((item) => props.getItemId(item) === props.selectedId) ?? null;
  }, [props]);

  const filteredItems = useMemo(() => {
    const q = normalize(query);
    if (!q) return props.items;
    return props.items.filter((item) => normalize(props.getItemSearchText(item)).includes(q));
  }, [props, query]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
  }, [open]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const openMenu = () => {
    props.onOpen?.();
    setOpen(true);
    setActiveIndex(0);
  };

  const selectByIndex = (index: number) => {
    const item = filteredItems[index];
    if (!item) return;
    props.onSelect(item);
    setOpen(false);
  };

  const activeOptionId = filteredItems[activeIndex] ? `${listboxId}-option-${props.getItemId(filteredItems[activeIndex])}` : undefined;

  return (
    <div ref={rootRef} className="creation-entity-selector">
      <label className="creation-entity-label">{props.label}</label>

      {selectedItem && !open ? (
        <div className="creation-selected-card" aria-live="polite">
          <div className="creation-selected-main">{props.renderSelection ? props.renderSelection(selectedItem) : props.renderItem(selectedItem, { selected: true, active: false })}</div>
          <button type="button" className="contents-ghost-button" onClick={openMenu}>
            Changer
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className={open ? "creation-selector-trigger is-open" : "creation-selector-trigger"}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            openMenu();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (!open) openMenu();
            }
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        >
          <span>{props.placeholder}</span>
          <ChevronDown size={16} aria-hidden />
        </button>
      )}

      {open ? (
        <section className="creation-selector-panel" role="dialog" aria-label={props.label}>
          <div className="creation-selector-search-wrap">
            <Search size={15} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              className="creation-selector-search"
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              aria-autocomplete="list"
              placeholder={props.searchPlaceholder}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((current) => Math.min(current + 1, Math.max(filteredItems.length - 1, 0)));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((current) => Math.max(current - 1, 0));
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  selectByIndex(activeIndex);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeAndFocusTrigger();
                }
                if (event.key === "Tab") {
                  setOpen(false);
                }
              }}
            />
          </div>

          {props.loading ? (
            <div className="creation-selector-skeleton" aria-live="polite" aria-busy="true">
              <span className="creation-selector-skeleton-row" />
              <span className="creation-selector-skeleton-row" />
              <span className="creation-selector-skeleton-row" />
            </div>
          ) : null}

          {!props.loading && props.errorMessage ? (
            <div className="creation-selector-state" role="alert">
              <p>Impossible de charger les personnes</p>
              {props.onRetry ? (
                <button type="button" className="contents-ghost-button" onClick={props.onRetry}>
                  Reessayer
                </button>
              ) : null}
            </div>
          ) : null}

          {!props.loading && !props.errorMessage ? (
            <>
              {props.items.length === 0 ? (
                <div className="creation-selector-state">
                  <p>{props.emptyMessage}</p>
                  {props.emptyAction}
                </div>
              ) : null}

              {props.items.length > 0 && filteredItems.length === 0 ? (
                <div className="creation-selector-state">
                  <p>{props.noResultsMessage}</p>
                </div>
              ) : null}

              {filteredItems.length > 0 ? (
                <ul id={listboxId} role="listbox" aria-label={props.label} className="creation-selector-list">
                  {filteredItems.map((item, index) => {
                    const id = props.getItemId(item);
                    const selected = props.selectedId === id;
                    const active = index === activeIndex;
                    return (
                      <li key={id}>
                        <button
                          id={`${listboxId}-option-${id}`}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={selected ? active ? "creation-selector-option is-selected is-active" : "creation-selector-option is-selected" : active ? "creation-selector-option is-active" : "creation-selector-option"}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => {
                            props.onSelect(item);
                            setOpen(false);
                          }}
                        >
                          {props.renderItem(item, { selected, active })}
                          {selected ? <Check size={15} aria-hidden /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
