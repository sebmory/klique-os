"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, LockKeyhole, X } from "lucide-react";
import type { AthleteMemberService, AthleteMemberServicesProjection } from "@/lib/athlete-service-catalog";
import {
  getAthleteServiceRequestOptions,
  getAthleteServiceRequestProductLabel,
  getAthleteServiceRequestStatusLabel,
} from "@/lib/athlete-service-request-presentation";
import type {
  AthleteServiceRequestClientFulfillmentMode,
  PublicAthleteServiceRequest,
} from "@/lib/athlete-service-requests";

type ServicesPayload = AthleteMemberServicesProjection & { error?: string };
type RequestsPayload = {
  requests?: PublicAthleteServiceRequest[];
  request?: PublicAthleteServiceRequest;
  error?: string;
};

const GOLD = "#e8b84b";
const BORDER = "rgba(255, 255, 255, 0.09)";
const MUTED = "#9ca3af";

const formatRights = (quantity: number, singular: string, plural: string) =>
  `${quantity} ${quantity === 1 ? singular : plural}`;

const formatUsage = (required: number, available: number, type: "production" | "custom_content") => {
  const availableLabel = `${available} disponible${available === 1 ? "" : "s"}`;
  if (type === "production" && required === 1 && available === 1) {
    return `Utilise votre production incluse — ${availableLabel}`;
  }
  const rightLabel = type === "production"
    ? `${required} production${required === 1 ? "" : "s"} incluse${required === 1 ? "" : "s"}`
    : `${required} contenu${required === 1 ? "" : "s"} personnalisé${required === 1 ? "" : "s"}`;
  return `Utilise ${rightLabel} — ${availableLabel}`;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "long", year: "numeric" }).format(date);
};

export default function AthleteServicesPage() {
  const [catalog, setCatalog] = useState<AthleteMemberServicesProjection | null>(null);
  const [requests, setRequests] = useState<PublicAthleteServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<AthleteMemberService | null>(null);
  const [fulfillmentMode, setFulfillmentMode] = useState<AthleteServiceRequestClientFulfillmentMode | null>(null);
  const [message, setMessage] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [catalogResult, requestsResult] = await Promise.allSettled([
        fetch("/api/athlete/services", { credentials: "include", cache: "no-store" }),
        fetch("/api/athlete/service-requests", { credentials: "include", cache: "no-store" }),
      ]);
      if (!active) return;

      if (catalogResult.status === "fulfilled") {
        const payload = (await catalogResult.value.json().catch(() => null)) as ServicesPayload | null;
        if (catalogResult.value.ok && payload?.membership && Array.isArray(payload.services)) {
          setCatalog({ membership: payload.membership, services: payload.services });
        } else setErrorMessage(payload?.error || "Impossible de charger les services membres.");
      } else setErrorMessage("Impossible de charger les services membres.");
      setLoading(false);

      if (requestsResult.status === "fulfilled") {
        const payload = (await requestsResult.value.json().catch(() => null)) as RequestsPayload | null;
        if (requestsResult.value.ok && Array.isArray(payload?.requests)) setRequests(payload.requests);
        else setRequestsError(payload?.error || "Impossible de charger vos demandes.");
      } else setRequestsError("Impossible de charger vos demandes.");
      setRequestsLoading(false);
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedService) return;

    const frame = window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formRef.current
        ?.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled])")
        ?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedService]);

  const openForm = (service: AthleteMemberService) => {
    const options = getAthleteServiceRequestOptions(service, catalog?.membership.active === true);
    if (options.length === 0) return;
    setSelectedService(service);
    setFulfillmentMode(options[0].mode);
    setMessage("");
    setPreferredDate("");
    setSubmitError(null);
    setSuccessMessage(null);
  };

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || !selectedService || !fulfillmentMode) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/athlete/service-requests", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productCode: selectedService.code,
          fulfillmentMode,
          ...(message.trim() ? { message: message.trim() } : {}),
          ...(preferredDate ? { preferredDate } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as RequestsPayload | null;
      if (!response.ok || !payload?.request) throw new Error(payload?.error || "Impossible d’envoyer votre demande.");
      setRequests((current) => [payload.request!, ...current]);
      setSuccessMessage(`Votre demande pour « ${selectedService.name} » a bien été reçue.`);
      setSelectedService(null);
      setMessage("");
      setPreferredDate("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Impossible d’envoyer votre demande.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const selectedOptions = selectedService
    ? getAthleteServiceRequestOptions(selectedService, catalog?.membership.active === true)
    : [];

  return (
    <section style={{ padding: "1.5rem", maxWidth: "1180px", margin: "0 auto", display: "grid", gap: "1.25rem", background: "#0a0b0f", borderRadius: "24px" }}>
      <header style={{ display: "grid", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontSize: "0.76rem", textTransform: "uppercase", letterSpacing: "0.14em", color: MUTED, fontWeight: 700 }}>Espace Athlète</p>
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Services membres</h1>
        <p style={{ margin: 0, color: MUTED, fontSize: "0.95rem", lineHeight: 1.5, maxWidth: "68ch" }}>
          Votre abonnement comprend des services inclus chaque année. Les services indiqués comme inclus peuvent être demandés sans paiement supplémentaire et utilisent l’un de vos droits disponibles. Vous pouvez également commander des prestations supplémentaires aux tarifs membres affichés.
        </p>
        {catalog ? <p style={{ margin: "0.2rem 0 0", color: "#d1d5db", fontSize: "0.9rem" }}>
          {catalog.membership.active
            ? `Avec votre abonnement${catalog.membership.planName ? ` ${catalog.membership.planName}` : ""}, il vous reste ${formatRights(catalog.membership.productionCreditBalance, "production", "productions")} et ${formatRights(catalog.membership.customContentCreditBalance, "contenu personnalisé", "contenus personnalisés")}.`
            : "Aucune adhésion active"}
        </p> : null}
        <aside style={{ marginTop: "0.45rem", padding: "0.85rem 0.95rem", border: `1px solid ${BORDER}`, borderRadius: "8px", background: "rgba(255, 255, 255, 0.035)", display: "grid", gap: "0.3rem" }}>
          <strong style={{ color: "#f8fafc", fontSize: "0.92rem" }}>Votre visibilité habituelle reste incluse</strong>
          <p style={{ margin: 0, color: "#d1d5db", fontSize: "0.86rem", lineHeight: 1.55 }}>KLIQUE continue de suivre votre actualité grâce aux formulaires hebdomadaires et mensuels et sélectionne régulièrement des sujets à mettre en avant. Les contenus initiés par KLIQUE dans ce cadre ne sont pas déduits de vos droits.</p>
        </aside>
      </header>

      {successMessage ? <p role="status" style={{ margin: 0, border: "1px solid rgba(74, 222, 128, 0.35)", background: "rgba(74, 222, 128, 0.1)", color: "#bbf7d0", borderRadius: "8px", padding: "0.8rem 0.9rem" }}>{successMessage}</p> : null}

      {loading ? <p style={{ margin: 0, color: MUTED }} aria-live="polite">Chargement des services…</p> : errorMessage ? (
        <p role="alert" style={{ margin: 0, border: "1px solid rgba(248, 113, 113, 0.35)", background: "rgba(248, 113, 113, 0.12)", color: "#fecaca", borderRadius: "8px", padding: "0.8rem 0.9rem" }}>{errorMessage}</p>
      ) : catalog ? (
        <div style={{ display: "grid", gap: "0.9rem", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
          {catalog.services.map((service) => {
            const matchUpgrade = service.code === "match_coverage_upgrade";
            const contentPack = service.code === "custom_content_pack_5";
            const restrictedVideo = service.code === "simple_video_capsule" && service.creditOption && !service.creditOption.eligibleWithPlan;
            const included = !contentPack && service.creditOption?.eligibleWithPlan && service.creditOption.sufficient ? service.creditOption : null;
            const showPaid = !restrictedVideo && (!matchUpgrade || Boolean(included));
            const options = getAthleteServiceRequestOptions(service, catalog.membership.active);
            const accessible = options.length > 0;
            return (
              <article key={service.code} style={{ border: `1px solid ${accessible ? "rgba(232, 184, 75, 0.35)" : BORDER}`, borderRadius: "8px", background: "linear-gradient(160deg, #14151a 0%, #0e0f13 65%, #0a0b0f 100%)", padding: "1rem", display: "grid", gap: "0.7rem", alignContent: "start" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                  <strong style={{ color: "#f8fafc", fontSize: "1.03rem", lineHeight: 1.3 }}>{service.name}</strong>
                  {accessible ? <CheckCircle2 size={18} color={GOLD} aria-hidden /> : <LockKeyhole size={18} color={MUTED} aria-hidden />}
                </div>
                <p style={{ margin: 0, color: "#d1d5db", lineHeight: 1.55, fontSize: "0.9rem" }}>{service.description}</p>
                <div style={{ display: "grid", gap: "0.3rem", padding: "0.7rem", border: `1px solid ${BORDER}`, borderRadius: "8px", background: "rgba(255, 255, 255, 0.025)" }}>
                  {restrictedVideo ? <span style={{ color: MUTED, fontWeight: 700, fontSize: "0.86rem", lineHeight: 1.45 }}>Nécessite 2 productions disponibles — réservé aux abonnements Impact et Signature</span> : null}
                  {included && !matchUpgrade ? <><span style={{ color: "#fde68a", fontWeight: 800, fontSize: "0.9rem" }}>Inclus dans votre abonnement</span><span style={{ color: "#d1d5db", fontWeight: 600, fontSize: "0.84rem", lineHeight: 1.45 }}>{formatUsage(included.creditsRequired, included.availableBalance, included.creditType)}</span></> : null}
                  {included && matchUpgrade ? <span style={{ color: "#fde68a", fontWeight: 700, fontSize: "0.86rem", lineHeight: 1.45 }}>Utilise 1 production incluse avec un supplément de {service.memberPriceLabel}.</span> : null}
                  {showPaid && !matchUpgrade ? <span style={{ color: GOLD, fontWeight: 800, fontSize: "0.9rem" }}>Service supplémentaire : {service.memberPriceLabel}</span> : null}
                </div>
                {showPaid ? <span style={{ color: MUTED, fontSize: "0.82rem" }}>Service supplémentaire valable {service.validityLabel}</span> : null}
                <span style={{ justifySelf: "start", borderRadius: "999px", padding: "0.28rem 0.62rem", fontSize: "0.74rem", fontWeight: 700, color: accessible ? "#fde68a" : "#d1d5db", border: `1px solid ${accessible ? "rgba(232, 184, 75, 0.35)" : BORDER}`, background: accessible ? "rgba(232, 184, 75, 0.1)" : "rgba(255, 255, 255, 0.04)" }}>{service.availabilityLabel}</span>
                {accessible ? <button type="button" onClick={() => openForm(service)} style={{ border: 0, borderRadius: "6px", padding: "0.7rem 0.85rem", background: GOLD, color: "#111318", fontWeight: 800, cursor: "pointer" }}>Demander ce service</button> : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {selectedService ? (
        <form ref={formRef} onSubmit={submitRequest} style={{ borderTop: `1px solid ${BORDER}`, paddingTop: "1.25rem", display: "grid", gap: "1rem", maxWidth: "720px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
            <div style={{ display: "grid", gap: "0.25rem" }}><h2 style={{ margin: 0, color: "#f8fafc", fontSize: "1.15rem" }}>Demander une prestation</h2><p style={{ margin: 0, color: "#d1d5db", fontWeight: 700 }}>{selectedService.name}</p></div>
            <button type="button" onClick={() => { if (!submittingRef.current) setSelectedService(null); }} aria-label="Fermer le formulaire" disabled={submitting} style={{ border: `1px solid ${BORDER}`, borderRadius: "6px", width: "2.25rem", height: "2.25rem", display: "grid", placeItems: "center", background: "transparent", color: "#d1d5db", cursor: submitting ? "not-allowed" : "pointer" }}><X size={18} aria-hidden /></button>
          </div>
          {selectedOptions.length > 1 ? (
            <fieldset style={{ margin: 0, padding: 0, border: 0, display: "grid", gap: "0.55rem" }}>
              <legend style={{ marginBottom: "0.45rem", color: "#f8fafc", fontWeight: 700 }}>Comment souhaitez-vous demander ce service ?</legend>
              {selectedOptions.map((option) => <label key={option.mode} style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start", padding: "0.75rem", border: `1px solid ${fulfillmentMode === option.mode ? "rgba(232, 184, 75, 0.55)" : BORDER}`, borderRadius: "8px", color: "#f8fafc", cursor: "pointer" }}><input type="radio" name="fulfillmentMode" checked={fulfillmentMode === option.mode} onChange={() => setFulfillmentMode(option.mode)} /><span style={{ display: "grid", gap: "0.15rem" }}><strong>{option.label}</strong><span style={{ color: MUTED, fontSize: "0.85rem" }}>{option.description}</span></span></label>)}
            </fieldset>
          ) : selectedOptions[0] ? <div style={{ padding: "0.75rem", border: `1px solid ${BORDER}`, borderRadius: "8px", display: "grid", gap: "0.15rem" }}><strong style={{ color: "#f8fafc" }}>{selectedOptions[0].label}</strong><span style={{ color: MUTED, fontSize: "0.85rem" }}>{selectedOptions[0].description}</span></div> : null}
          <label style={{ display: "grid", gap: "0.4rem", color: "#f8fafc", fontWeight: 700 }}>Précisions pour KLIQUE<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={5} placeholder="Décrivez votre besoin, le contexte ou les éléments utiles." style={{ width: "100%", boxSizing: "border-box", resize: "vertical", border: `1px solid ${BORDER}`, borderRadius: "6px", padding: "0.75rem", background: "#111318", color: "#f8fafc", font: "inherit" }} /></label>
          <label style={{ display: "grid", gap: "0.4rem", color: "#f8fafc", fontWeight: 700, maxWidth: "300px" }}>Date souhaitée <span style={{ color: MUTED, fontWeight: 400 }}>(facultative)</span><input type="date" value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: "6px", padding: "0.65rem 0.75rem", background: "#111318", color: "#f8fafc", font: "inherit", colorScheme: "dark" }} /></label>
          <p style={{ margin: 0, padding: "0.8rem 0.9rem", borderLeft: `3px solid ${GOLD}`, background: "rgba(232, 184, 75, 0.07)", color: "#e5e7eb", lineHeight: 1.55 }}>Cette demande ne déclenche aucun paiement et ne consomme aucun de vos services inclus. KLIQUE vous recontactera pour confirmer les modalités.</p>
          {submitError ? <p role="alert" style={{ margin: 0, color: "#fecaca" }}>{submitError}</p> : null}
          <button type="submit" disabled={submitting || !fulfillmentMode} style={{ justifySelf: "start", border: 0, borderRadius: "6px", padding: "0.75rem 1rem", background: GOLD, color: "#111318", fontWeight: 800, cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.65 : 1 }}>{submitting ? "Envoi en cours…" : "Envoyer la demande"}</button>
        </form>
      ) : null}

      <section aria-labelledby="my-requests-title" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: "1.25rem", display: "grid", gap: "0.8rem" }}>
        <h2 id="my-requests-title" style={{ margin: 0, color: "#f8fafc", fontSize: "1.2rem" }}>Mes demandes</h2>
        {requestsLoading ? <p aria-live="polite" style={{ margin: 0, color: MUTED }}>Chargement de vos demandes…</p> : requestsError ? <p role="alert" style={{ margin: 0, color: "#fecaca" }}>{requestsError}</p> : requests.length === 0 ? <p style={{ margin: 0, color: MUTED }}>Vous n’avez encore envoyé aucune demande.</p> : (
          <div style={{ display: "grid", gap: "0.55rem" }}>
            {requests.map((request) => {
              const catalogName = catalog?.services.find((service) => service.code === request.productCode)?.name;
              return <article key={`${request.productCode}-${request.requestedAt}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.35rem 1rem", padding: "0.85rem", border: `1px solid ${BORDER}`, borderRadius: "8px", background: "rgba(255, 255, 255, 0.025)" }}><strong style={{ color: "#f8fafc" }}>{catalogName ?? getAthleteServiceRequestProductLabel(request.productCode)}</strong><span style={{ color: "#fde68a", fontWeight: 700, fontSize: "0.85rem" }}>{getAthleteServiceRequestStatusLabel(request.status)}</span><span style={{ color: MUTED, fontSize: "0.85rem" }}>{request.preferredDate ? `Date souhaitée : ${formatDate(request.preferredDate)}` : "Aucune date souhaitée"}</span><span style={{ color: MUTED, fontSize: "0.8rem" }}>Demandée le {formatDate(request.requestedAt)}</span></article>;
            })}
          </div>
        )}
      </section>
    </section>
  );
}