"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { BadgeCheck, CalendarDays, Check, Clapperboard, Gift, Images, Send, Sparkles } from "lucide-react";
import type {
  AthleteContentFormat,
  AthleteContentMediaType,
  AthleteSubscriptionBenefit,
  AthleteSubscriptionInternalPlanCode,
  AthleteSubscriptionPlanCode,
  AthleteSubscriptionProductionInclusion,
} from "@/lib/athlete-subscription-catalog";
import type {
  AthleteSubscriptionContentRequest,
  AthleteSubscriptionContentRequestStatus,
} from "@/lib/athlete-subscription-content-requests/service";
import { Button, Input, Select, Textarea } from "@/src/design-system/components";

type PublicAthleteSubscription = {
  id: string;
  planCode: AthleteSubscriptionPlanCode | AthleteSubscriptionInternalPlanCode;
  status: "active" | "expired" | "cancelled";
  startsOn: string;
  endsOn: string;
  isFounder: boolean;
  isComplimentary: boolean;
  priceChf: number;
  discountPercent: number;
  catalog: {
    code: AthleteSubscriptionPlanCode | AthleteSubscriptionInternalPlanCode;
    name: string;
    annualPriceChf: number;
    includedProductions: readonly AthleteSubscriptionProductionInclusion[];
    customContentCount: number;
    aLaCarteDiscountPercent: number;
    commonBenefits: readonly AthleteSubscriptionBenefit[];
    contentFormats: readonly AthleteContentFormat[];
  };
};

type AthleteSubscriptionPayload = {
  subscription: PublicAthleteSubscription | null;
  error?: string;
};

type ContentRequestsPayload = {
  requests?: AthleteSubscriptionContentRequest[];
  request?: AthleteSubscriptionContentRequest;
  error?: string;
};

const occupyingStatuses = new Set<AthleteSubscriptionContentRequestStatus>([
  "requested",
  "accepted",
  "in_progress",
  "completed",
]);

const statusLabels: Record<AthleteSubscriptionContentRequestStatus, string> = {
  requested: "Demandé",
  accepted: "Accepté",
  in_progress: "En cours",
  completed: "Terminé",
  declined: "Refusé",
  cancelled: "Annulé",
};

const mediaLabels: Record<AthleteContentMediaType, string> = {
  athlete_information: "Informations Athlète",
  editorial_brief: "Brief éditorial",
  photo_portrait: "Photo portrait",
  photo_action: "Photo d’action",
  photo_lifestyle: "Photo lifestyle",
  photo_product: "Photo produit",
  video_vertical: "Vidéo verticale",
  video_horizontal: "Vidéo horizontale",
  audio_interview: "Audio d’interview",
  quote: "Citation",
  statistics: "Statistiques",
  partner_assets: "Éléments du partenaire",
};

const formatDate = (value: string): string => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("fr-CH", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
};

const formatCatalogValue = (value: number): string =>
  `CHF ${new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 }).format(value)}`;

const productionLabel = (production: AthleteSubscriptionProductionInclusion): string => {
  if (production.kind === "photo_session") {
    return `Séance photo · ${production.imageCount} images`;
  }
  if (production.kind === "media_day") {
    const [minimum, maximum] = production.interviewDurationMinutes;
    return `Media Day · ${production.portraitCount} portraits et interview de ${minimum}–${maximum} minutes`;
  }
  return `Séance match ou compétition · ${production.imageCount} images`;
};

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: "0.8rem",
  paddingTop: "1.1rem",
  borderTop: "1px solid #e7e5e4",
};

const pageStyle: CSSProperties = {
  padding: "1.25rem",
  maxWidth: "920px",
  margin: "0 auto",
  display: "grid",
  gap: "1rem",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  color: "#44403c",
  fontSize: "0.9rem",
  fontWeight: 650,
};

const controlStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
};

const errorMessageFrom = async (response: Response, fallback: string): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || fallback;
};

export default function AthletePassPage() {
  const [subscription, setSubscription] = useState<PublicAthleteSubscription | null>(null);
  const [contentRequests, setContentRequests] = useState<AthleteSubscriptionContentRequest[]>([]);
  const [formatCode, setFormatCode] = useState("");
  const [athleteNote, setAthleteNote] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadPass = async () => {
      try {
        const options = { credentials: "include" as const, cache: "no-store" as const };
        const [subscriptionResponse, requestsResponse] = await Promise.all([
          fetch("/api/athlete/subscription", options),
          fetch("/api/athlete/subscription/content-requests", options),
        ]);
        if (!subscriptionResponse.ok) {
          throw new Error(await errorMessageFrom(
            subscriptionResponse,
            "Impossible de charger votre Pass KLIQUE pour le moment.",
          ));
        }
        if (!requestsResponse.ok) {
          throw new Error(await errorMessageFrom(
            requestsResponse,
            "Impossible de charger vos demandes de contenus personnalisés.",
          ));
        }
        const subscriptionPayload = (await subscriptionResponse.json()) as AthleteSubscriptionPayload;
        const requestsPayload = (await requestsResponse.json()) as ContentRequestsPayload;
        if (!("subscription" in subscriptionPayload) || !Array.isArray(requestsPayload.requests)) {
          throw new Error("Réponse du Pass KLIQUE incomplète.");
        }
        if (active) {
          setSubscription(subscriptionPayload.subscription);
          setContentRequests(requestsPayload.requests);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Impossible d’afficher votre Pass KLIQUE.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPass();
    return () => { active = false; };
  }, []);

  const selectedFormat = useMemo(
    () => subscription?.catalog.contentFormats.find(({ code }) => code === formatCode) ?? null,
    [formatCode, subscription],
  );

  const occupiedPlaces = subscription
    ? contentRequests.filter((request) => (
        request.subscriptionId === subscription.id && occupyingStatuses.has(request.status)
      )).length
    : 0;
  const availablePlaces = subscription
    ? Math.max(0, subscription.catalog.customContentCount - occupiedPlaces)
    : 0;

  const handleContentRequestSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    if (!subscription || availablePlaces <= 0) {
      setFormError("Aucune place n’est disponible pour une nouvelle demande.");
      return;
    }
    if (!formatCode) {
      setFormError("Sélectionnez un format.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/athlete/subscription/content-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formatCode,
          ...(athleteNote.trim() ? { athleteNote: athleteNote.trim() } : {}),
          ...(preferredDate ? { preferredDate } : {}),
        }),
      });
      if (!response.ok) {
        setFormError(await errorMessageFrom(response, "La demande n’a pas pu être envoyée."));
        return;
      }
      const payload = (await response.json()) as ContentRequestsPayload;
      if (!payload.request) throw new Error("Réponse de création incomplète.");
      setContentRequests((current) => [payload.request!, ...current]);
      setFormatCode("");
      setAthleteNote("");
      setPreferredDate("");
      setSuccessMessage("Votre demande de contenu a été envoyée.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "La demande n’a pas pu être envoyée.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main style={pageStyle}>
        <p role="status" aria-live="polite" style={{ margin: 0, color: "#57534e" }}>
          Chargement de votre Pass KLIQUE…
        </p>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main style={pageStyle}>
        <h1 style={{ margin: 0, fontSize: "1.45rem", color: "#1c1917" }}>Mon Pass KLIQUE</h1>
        <p role="alert" style={{ margin: 0, padding: "0.8rem", border: "1px solid #fecaca", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c" }}>
          {errorMessage}
        </p>
      </main>
    );
  }

  if (!subscription) {
    return (
      <main style={pageStyle}>
        <header>
          <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "#78716c" }}>PASS MEMBRE</p>
          <h1 style={{ margin: "0.3rem 0 0", fontSize: "1.45rem", color: "#1c1917" }}>Mon Pass KLIQUE</h1>
        </header>
        <section style={{ border: "1px solid #e7e5e4", borderRadius: "8px", padding: "1.25rem", background: "#fff", display: "grid", gap: "0.45rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#1c1917" }}>Aucun abonnement actif</h2>
          <p style={{ margin: 0, color: "#57534e", lineHeight: 1.6 }}>
            Contactez KLIQUE pour choisir l’offre adaptée et activer votre Pass membre.
          </p>
        </section>
      </main>
    );
  }

  const founderPlan = subscription.planCode === "founder";
  const catalogValue = formatCatalogValue(subscription.catalog.annualPriceChf);
  const priceLabel = founderPlan
    ? "Accès plateforme offert pendant un an"
    : subscription.isComplimentary
      ? `Offert — valeur ${catalogValue}`
      : `Valeur catalogue ${catalogValue}/an`;

  return (
    <main style={pageStyle}>
      <header>
        <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "#78716c" }}>PASS MEMBRE</p>
        <h1 style={{ margin: "0.3rem 0 0", fontSize: "1.45rem", color: "#1c1917" }}>Mon Pass KLIQUE</h1>
      </header>

      <article style={{ border: "1px solid #dedbd5", borderRadius: "8px", background: "#fff", boxShadow: "0 18px 42px rgba(28, 25, 23, 0.08)", overflow: "hidden" }}>
        <div style={{ padding: "1.25rem", background: "#173c34", color: "#fff", display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", opacity: 0.76 }}>
              {founderPlan ? "Accès membre actif" : "Offre active"}
            </span>
            <h2 style={{ margin: 0, fontSize: "1.65rem" }}>{subscription.catalog.name}</h2>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 600 }}>
              <CalendarDays size={16} aria-hidden="true" />
              Du {formatDate(subscription.startsOn)} au {formatDate(subscription.endsOn)}
            </span>
          </div>
          <div style={{ display: "grid", justifyItems: "end", gap: "0.45rem" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.35rem 0.65rem", borderRadius: "999px", background: "#d8f3e8", color: "#14532d", fontWeight: 800, fontSize: "0.8rem" }}>
              <BadgeCheck size={15} aria-hidden="true" /> Actif
            </span>
            <strong style={{ fontSize: "1rem", textAlign: "right" }}>{priceLabel}</strong>
          </div>
        </div>

        <div style={{ padding: "1.25rem", display: "grid", gap: "1.1rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem" }}>
            <span style={{ padding: "0.35rem 0.65rem", borderRadius: "999px", background: "#f5f5f4", color: "#44403c", fontWeight: 700, fontSize: "0.82rem" }}>
              Membre fondateur : {subscription.isFounder ? "Oui" : "Non"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.35rem 0.65rem", borderRadius: "999px", background: subscription.isComplimentary ? "#fff7d6" : "#f5f5f4", color: "#44403c", fontWeight: 700, fontSize: "0.82rem" }}>
              {subscription.isComplimentary ? <Gift size={14} aria-hidden="true" /> : null}
              Offert : {subscription.isComplimentary ? "Oui" : "Non"}
            </span>
            {!founderPlan ? (
              <span style={{ padding: "0.35rem 0.65rem", borderRadius: "999px", background: "#f5f5f4", color: "#44403c", fontWeight: 700, fontSize: "0.82rem" }}>
                Remise à la carte : −{subscription.catalog.aLaCarteDiscountPercent} %
              </span>
            ) : null}
          </div>

          {!founderPlan ? (
            <section style={sectionStyle} aria-labelledby="productions-title">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Images size={19} color="#9a6a22" aria-hidden="true" />
                <h3 id="productions-title" style={{ margin: 0, fontSize: "1.05rem", color: "#1c1917" }}>Productions incluses</h3>
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "#44403c", display: "grid", gap: "0.45rem" }}>
                {subscription.catalog.includedProductions.map((production) => (
                  <li key={production.kind}>{productionLabel(production)}</li>
                ))}
              </ul>
              <p style={{ margin: 0, padding: "0.8rem", borderRadius: "8px", background: "#f5f5f4", color: "#1c1917" }}>
                Contenus personnalisés inclus par an : <strong>{subscription.catalog.customContentCount}</strong>
              </p>
            </section>
          ) : null}

          <section style={sectionStyle} aria-labelledby="benefits-title">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Sparkles size={19} color="#9a6a22" aria-hidden="true" />
              <h3 id="benefits-title" style={{ margin: 0, fontSize: "1.05rem", color: "#1c1917" }}>Avantages communs</h3>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.65rem" }}>
              {subscription.catalog.commonBenefits.map((benefit) => (
                <li key={benefit.code} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: "0.45rem", alignItems: "start", color: "#44403c" }}>
                  <Check size={16} color="#17735f" aria-hidden="true" style={{ marginTop: 2 }} />
                  <span><strong style={{ color: "#1c1917" }}>{benefit.name}</strong><br /><small style={{ lineHeight: 1.5 }}>{benefit.description}</small></span>
                </li>
              ))}
            </ul>
          </section>

          {!founderPlan ? (
            <section style={sectionStyle} aria-labelledby="formats-title">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Clapperboard size={19} color="#9a6a22" aria-hidden="true" />
                <h3 id="formats-title" style={{ margin: 0, fontSize: "1.05rem", color: "#1c1917" }}>Formats disponibles</h3>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {subscription.catalog.contentFormats.map((format) => (
                  <span key={format.code} title={format.description} style={{ padding: "0.45rem 0.65rem", border: "1px solid #e7e5e4", borderRadius: "6px", background: "#fafaf9", color: "#292524", fontSize: "0.84rem", fontWeight: 650 }}>
                    {format.name}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </article>

      {!founderPlan ? <section aria-labelledby="custom-contents-title" style={{ borderTop: "1px solid #dedbd5", paddingTop: "1.25rem", display: "grid", gap: "1rem" }}>
        <header style={{ display: "grid", gap: "0.35rem" }}>
          <h2 id="custom-contents-title" style={{ margin: 0, fontSize: "1.25rem", color: "#1c1917" }}>
            Mes contenus personnalisés
          </h2>
          <p style={{ margin: 0, color: "#57534e", lineHeight: 1.55 }}>
            Choisissez un format et transmettez votre demande à l’équipe KLIQUE.
          </p>
        </header>

        <div aria-label="Quota de contenus personnalisés" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", border: "1px solid #e7e5e4", borderRadius: "8px", overflow: "hidden", background: "#fff" }}>
          {[
            ["Quota annuel", subscription.catalog.customContentCount],
            ["Places occupées", occupiedPlaces],
            ["Places disponibles", availablePlaces],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: "0.9rem 1rem", display: "grid", gap: "0.15rem", borderRight: "1px solid #e7e5e4" }}>
              <span style={{ color: "#78716c", fontSize: "0.78rem", fontWeight: 700 }}>{label}</span>
              <strong style={{ color: "#1c1917", fontSize: "1.35rem" }}>{value}</strong>
            </div>
          ))}
        </div>

        <form onSubmit={handleContentRequestSubmit} style={{ display: "grid", gap: "0.85rem", padding: "1rem", border: "1px solid #e7e5e4", borderRadius: "8px", background: "#fff" }}>
          <label style={fieldStyle}>
            Format
            <Select
              aria-label="Format du contenu"
              value={formatCode}
              onChange={(event) => setFormatCode(event.target.value)}
              disabled={submitting || availablePlaces <= 0}
              required
              style={controlStyle}
            >
              <option value="">Sélectionner un format</option>
              {subscription.catalog.contentFormats.map((format) => (
                <option key={format.code} value={format.code}>{format.name}</option>
              ))}
            </Select>
          </label>

          {selectedFormat ? (
            <div aria-live="polite" style={{ padding: "0.8rem", borderRadius: "8px", background: "#f5f5f4", display: "grid", gap: "0.35rem", color: "#44403c" }}>
              <strong style={{ color: "#1c1917" }}>{selectedFormat.name}</strong>
              <span>{selectedFormat.description}</span>
              <span><strong>Médias nécessaires :</strong> {selectedFormat.requiredMedia.map((media) => mediaLabels[media]).join(", ")}</span>
            </div>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "0.85rem", alignItems: "start" }}>
            <label style={fieldStyle}>
              Note facultative
              <Textarea
                aria-label="Note pour KLIQUE"
                value={athleteNote}
                onChange={(event) => setAthleteNote(event.target.value)}
                disabled={submitting || availablePlaces <= 0}
                rows={4}
                style={{ ...controlStyle, resize: "vertical" }}
              />
            </label>
            <label style={fieldStyle}>
              Date souhaitée facultative
              <Input
                aria-label="Date souhaitée"
                type="date"
                value={preferredDate}
                onChange={(event) => setPreferredDate(event.target.value)}
                disabled={submitting || availablePlaces <= 0}
                style={controlStyle}
              />
            </label>
          </div>

          {availablePlaces <= 0 ? (
            <p role="status" style={{ margin: 0, color: "#9a3412" }}>
              Votre quota annuel est occupé. Une demande refusée ou annulée libérera une place.
            </p>
          ) : null}
          {formError ? <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{formError}</p> : null}
          {successMessage ? <p role="status" style={{ margin: 0, color: "#166534" }}>{successMessage}</p> : null}

          <Button
            type="submit"
            disabled={submitting || availablePlaces <= 0 || !formatCode}
            style={{ width: "fit-content", display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
            <Send size={16} aria-hidden="true" />
            {submitting ? "Envoi…" : "Envoyer la demande"}
          </Button>
        </form>

        <div style={{ display: "grid", gap: "0.65rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#1c1917" }}>Historique</h3>
          {contentRequests.length === 0 ? (
            <p style={{ margin: 0, color: "#78716c" }}>Aucune demande de contenu pour le moment.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.55rem" }}>
              {contentRequests.map((request) => {
                const format = subscription.catalog.contentFormats.find(({ code }) => code === request.formatCode);
                return (
                  <li key={request.id} style={{ border: "1px solid #e7e5e4", borderRadius: "8px", padding: "0.85rem", background: "#fff", display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "0.7rem" }}>
                    <div style={{ display: "grid", gap: "0.2rem" }}>
                      <strong style={{ color: "#1c1917" }}>{format?.name ?? request.formatCode}</strong>
                      {request.preferredDate ? <span style={{ color: "#57534e", fontSize: "0.88rem" }}>Date souhaitée : {formatDate(request.preferredDate)}</span> : null}
                      {request.athleteNote ? <span style={{ color: "#57534e", fontSize: "0.88rem" }}>{request.athleteNote}</span> : null}
                    </div>
                    <span style={{ padding: "0.3rem 0.55rem", borderRadius: "999px", background: "#f5f5f4", color: "#44403c", fontWeight: 750, fontSize: "0.78rem" }}>
                      {statusLabels[request.status]}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section> : null}
    </main>
  );
}
