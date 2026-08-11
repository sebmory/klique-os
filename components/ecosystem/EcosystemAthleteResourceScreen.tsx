"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Globe, Mail } from "lucide-react";
import { EcosystemService } from "@/services/ecosystem.service";
import type { EcosystemListResponse, EcosystemResource } from "@/types/ecosystem";

type EcosystemAthleteResourceScreenProps = {
  id: string;
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const hasRealEcosystemSource = (payload: EcosystemListResponse): boolean => payload.source === "google-sheets";

const typeLabel = (type: string): string => {
  const normalized = normalize(type)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized === "expert") return "Expert";
  return "Partenaire";
};

const benefit = (resource: EcosystemResource): string => normalize(resource.memberOffer);

const publicContact = (resource: EcosystemResource): string => {
  const name = normalize(resource.contactName);
  const role = normalize(resource.contactRole);
  if (name && role) return `${name} · ${role}`;
  if (name) return name;
  return "Non renseigné";
};

const normalizeUrl = (value: string): string => {
  const text = normalize(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
};

const cleanPhone = (value: string): string => value.replace(/[^+\d]/g, "").trim();
const isValidPhone = (value: string): boolean => cleanPhone(value).replace(/\D/g, "").length >= 6;

export function EcosystemAthleteResourceScreen({ id }: EcosystemAthleteResourceScreenProps) {
  const [resources, setResources] = useState<EcosystemResource[]>([]);
  const [source, setSource] = useState<"google-sheets" | "demo">("google-sheets");
  const [sourceMessage, setSourceMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setErrorMessage(null);
      setSource("google-sheets");
      setSourceMessage("");

      try {
        const response = await EcosystemService.list();
        if (!active) return;

        setSource(response.source);
        setSourceMessage(response.message ?? "");
        if (hasRealEcosystemSource(response)) {
          setResources(response.resources);
        } else {
          setResources([]);
        }
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger cette ressource.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [retryToken]);

  const resource = useMemo(() => {
    const key = decodeURIComponent(id);
    return resources.find((item) => item.id === key || item.slug === key) ?? null;
  }, [id, resources]);

  if (loading) {
    return (
      <section className="crm-partner-page" aria-live="polite" aria-busy="true">
        <section className="crm-person-skeleton">
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <span className="crm-skeleton-label">Chargement de la fiche ressource...</span>
        </section>
      </section>
    );
  }

  if (errorMessage || !resource) {
    const isRealDataUnavailable = !errorMessage && source !== "google-sheets";
    return (
      <section className="crm-partner-page">
        <section className="crm-error-state" aria-live="assertive">
          <h2>{isRealDataUnavailable ? "Donnees indisponibles" : "Ressource introuvable"}</h2>
          <p>
            {isRealDataUnavailable
              ? "Données Écosystème réelles indisponibles"
              : errorMessage ?? "Aucune ressource ne correspond à cette URL."}
          </p>
          {isRealDataUnavailable && sourceMessage ? <p>{sourceMessage}</p> : null}
          <div className="crm-person-error-actions">
            <Link href="/athlete/ecosysteme" className="crm-secondary-action-link">
              Retour à l’écosystème
            </Link>
            <button type="button" onClick={() => setRetryToken((value) => value + 1)}>
              Reessayer
            </button>
          </div>
        </section>
      </section>
    );
  }

  const resourceType = typeLabel(resource.type);
  const websiteHref = normalizeUrl(resource.website);
  const emailHref = normalize(resource.email) ? `mailto:${normalize(resource.email)}` : "";
  const phoneText = normalize(resource.phone) || normalize(resource.raw?.phone);
  const phoneValue = phoneText ? cleanPhone(phoneText) : "";
  const phoneHref = phoneValue && isValidPhone(phoneValue) ? `tel:${phoneValue}` : "";
  const benefitText = benefit(resource);
  const aboutParts = [resource.expertise, resource.services, resource.deliverables]
    .map((value) => normalize(value))
    .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index)
    .filter((value) => normalize(value) !== normalize(benefitText));

  const showPublicBadge = hasRealEcosystemSource({ resources, source, message: sourceMessage });

  return (
    <section className="crm-partner-page">
      <section style={{ maxWidth: "860px", margin: "0 auto", width: "100%" }}>
        <article className="crm-person-card-shell" style={{ display: "grid", gap: "1rem", padding: "1rem" }}>
          <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "0.85rem", alignItems: "center", minWidth: 0 }}>
              <span className="crm-person-portrait crm-partner-portrait" aria-hidden>
                {normalize(resource.name)
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase() ?? "")
                  .join("")}
              </span>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0 }}>{resource.name}</h1>
                <p style={{ margin: "0.35rem 0 0", color: "#6b7280" }}>{normalize(resource.category) || "Non renseigné"}</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
              <small className="crm-partner-priority-badge">{resourceType}</small>
              {showPublicBadge ? <small className="crm-partner-priority-badge">Public</small> : null}
            </div>
          </header>

          {benefitText ? (
            <section style={{ border: "1px solid #f6d4b0", background: "#fff7ed", borderRadius: "14px", padding: "0.9rem" }}>
              <h2 style={{ margin: "0 0 0.45rem", fontSize: "0.95rem", color: "#9a3412", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Avantage KLIQUE
              </h2>
              <p style={{ margin: 0, color: "#c2410c", lineHeight: 1.7, fontSize: "1.03rem", fontWeight: 700 }}>{benefitText}</p>
            </section>
          ) : null}

          <section style={{ display: "grid", gap: "0.55rem" }}>
            <h2 style={{ margin: 0, fontSize: "1rem" }}>Contact</h2>
            <div style={{ display: "grid", gap: "0.4rem", color: "#4b5563", lineHeight: 1.6 }}>
              <div><strong style={{ color: "#111827" }}>Contact:</strong> {publicContact(resource)}</div>
              <div>
                <strong style={{ color: "#111827" }}>Email:</strong>{" "}
                {emailHref ? <a href={emailHref} style={{ color: "inherit", textDecoration: "underline" }}>{normalize(resource.email)}</a> : "Non renseigné"}
              </div>
              {phoneHref ? (
                <div>
                  <strong style={{ color: "#111827" }}>Téléphone:</strong>{" "}
                  <a href={phoneHref} style={{ color: "inherit", textDecoration: "underline" }}>{phoneText}</a>
                </div>
              ) : null}
              <div>
                <strong style={{ color: "#111827" }}>Site:</strong>{" "}
                {websiteHref ? <a href={websiteHref} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>{normalize(resource.website)}</a> : "Non renseigné"}
              </div>
            </div>
          </section>

          {aboutParts.length > 0 ? (
            <section style={{ display: "grid", gap: "0.45rem" }}>
              <h2 style={{ margin: 0, fontSize: "1rem" }}>À propos / services</h2>
              {aboutParts.map((item) => (
                <p key={item} style={{ margin: 0, color: "#4b5563", lineHeight: 1.7 }}>{item}</p>
              ))}
            </section>
          ) : null}

          <section style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
            {emailHref ? (
              <a className="crm-secondary-action-link" href={emailHref}>
                <Mail size={14} aria-hidden /> Envoyer un email
              </a>
            ) : null}
            {websiteHref ? (
              <a className="crm-secondary-action-link" href={websiteHref} target="_blank" rel="noreferrer">
                <Globe size={14} aria-hidden /> Ouvrir le site
              </a>
            ) : null}
            <Link href="/athlete/ecosysteme" className="crm-secondary-action-link">
              <ArrowLeft size={14} aria-hidden /> Retour à l’écosystème
            </Link>
          </section>
        </article>
      </section>
    </section>
  );
}
