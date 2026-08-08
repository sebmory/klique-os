"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Camera, MapPin, UserRound } from "lucide-react";
import type { Production } from "@/types/production";
import { ProductionService } from "@/services/production.service";

type ProductionDetailPlaceholderScreenProps = {
  id: string;
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const parseDate = (value: string): string => {
  const raw = normalize(value);
  if (!raw) return "Non renseigne";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
    }
  }

  return raw;
};

export function ProductionDetailPlaceholderScreen({ id }: ProductionDetailPlaceholderScreenProps) {
  const [items, setItems] = useState<Production[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const payload = await ProductionService.list();
        if (!active) return;
        setItems(payload.productions);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger cette production.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const production = useMemo(() => items.find((item) => item.id === id) ?? null, [id, items]);

  if (loading) {
    return (
      <section className="crm-partner-page" aria-live="polite" aria-busy="true">
        <section className="crm-person-skeleton">
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <span className="crm-skeleton-label">Chargement de la production...</span>
        </section>
      </section>
    );
  }

  if (errorMessage || !production) {
    return (
      <section className="crm-partner-page">
        <section className="crm-error-state" aria-live="assertive">
          <h2>Production introuvable</h2>
          <p>{errorMessage ?? "Aucune production ne correspond a cette URL."}</p>
          <div className="crm-person-error-actions">
            <Link href="/production" className="crm-secondary-action-link">Retour a la production</Link>
            <button type="button" onClick={() => window.location.reload()}>Reessayer</button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="crm-partner-page">
      <div className="crm-partner-head-nav">
        <Link href="/production" className="crm-secondary-action-link">
          <ArrowLeft size={15} aria-hidden /> Retour a la production
        </Link>
      </div>

      <header className="crm-person-hero crm-partner-hero">
        <div className="crm-person-hero-main crm-partner-hero-main">
          <span className="crm-person-portrait crm-partner-portrait" aria-hidden>
            <Camera size={24} />
          </span>

          <div className="crm-person-title-wrap crm-partner-title-wrap">
            <div>
              <h1>{production.type}</h1>
              <p>{production.athlete} · {production.sport}</p>
            </div>
            <small className="crm-partner-priority-badge">{production.statut}</small>
          </div>

          <div className="crm-person-contact-row crm-partner-contact-row">
            <span className="crm-person-contact-pill"><CalendarDays size={14} aria-hidden /><span>{parseDate(production.date)}</span></span>
            <span className="crm-person-contact-pill"><MapPin size={14} aria-hidden /><span>{production.lieu}</span></span>
            <span className="crm-person-contact-pill"><UserRound size={14} aria-hidden /><span>{production.photographe}</span></span>
          </div>
        </div>
      </header>

      <section className="crm-person-card-shell">
        <header>
          <h2>Résumé</h2>
        </header>
        <p className="crm-person-notes-text">{production.objectif}</p>
        <div className="crm-person-empty-note">
          <p>La fiche Production sera développée au Sprint 3.2.</p>
        </div>
      </section>
    </section>
  );
}
