"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CREATIVE_FINANCIAL_NOTICE,
  type ProductionCreativeBrief,
} from "@/types/production-creative";
import { CreativeAvailabilityManager } from "@/components/creatives/CreativeAvailabilityManager";
import { projectCreativeMissionJourney } from "@/lib/mission-journey";

type Tab = "proposals" | "applications" | "assigned" | "deliveries" | "availability" | "profile";
type Profile = {
  displayName: string;
  creativeType: "photographer" | "videographer" | "both";
  portfolioUrl: string | null;
  coverageAreas: string[];
  specialties: string[];
  bio: string | null;
  generalAvailability: string | null;
  onboardingStatus:
    | "invitation_to_send"
    | "invitation_sent"
    | "account_created"
    | "profile_incomplete"
    | "pending_validation"
    | "active"
    | "disabled";
  onboardingMessage: string | null;
};
type ProfileChecklist = Record<
  "displayName" | "creativeType" | "coverageAreas" | "specialties" | "portfolioUrl" | "bio" | "generalAvailability",
  boolean
>;

const checklistLabels: Record<keyof ProfileChecklist, string> = {
  displayName: "Nom affiché",
  creativeType: "Activité photo ou vidéo",
  coverageAreas: "Régions",
  specialties: "Sports",
  portfolioUrl: "Portfolio HTTPS",
  bio: "Présentation",
  generalAvailability: "Disponibilités générales",
};

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("fr-CH").format(new Date(`${value}T00:00:00`)) : "À convenir";

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("fr-CH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Zurich",
      }).format(new Date(value))
    : "Aucune date limite";

const compensationLabel = (project: ProductionCreativeBrief) =>
  project.compensation.type === "unpaid_collaboration"
    ? "Collaboration non rémunérée"
    : new Intl.NumberFormat("fr-CH", {
        style: "currency",
        currency: project.compensation.currency,
      }).format(project.compensation.amountMinor / 100);

export function ProductionCreativeSpace() {
  const [tab, setTab] = useState<Tab>("proposals");
  const [projects, setProjects] = useState<ProductionCreativeBrief[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checklist, setChecklist] = useState<ProfileChecklist | null>(null);
  const [message, setMessage] = useState("");
  const [refusalReason, setRefusalReason] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [projectsResponse, profileResponse] = await Promise.all([
      fetch("/api/creative/production-missions", { cache: "no-store" }),
      fetch("/api/creative/profile", { cache: "no-store" }),
    ]);
    const projectsPayload = await projectsResponse.json();
    const profilePayload = await profileResponse.json();
    if (!projectsResponse.ok) throw new Error(projectsPayload.error || "Chargement impossible.");
    if (!profileResponse.ok) throw new Error(profilePayload.error || "Chargement impossible.");
    setProjects(projectsPayload.projects ?? []);
    setProfile(profilePayload.profile ?? null);
    setChecklist(profilePayload.checklist ?? null);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load)
      .catch((failure) => setError(failure instanceof Error ? failure.message : "Chargement impossible."));
  }, [load]);

  const mutate = async (method: "POST" | "PATCH", body: Record<string, unknown>) => {
    setError("");
    const response = await fetch("/api/creative/production-missions", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Opération impossible.");
    await load();
  };

  const visibleProjects = projects.filter((project) => {
    if (tab === "proposals") {
      return project.assignment === null && project.applicationStatus !== "interested";
    }
    if (tab === "applications") {
      return project.assignment === null && ["interested", "selected"].includes(project.applicationStatus);
    }
    if (tab === "assigned") {
      return project.assignment !== null
        && ["pending", "changes_requested"].includes(project.assignment.deliveryStatus);
    }
    if (tab === "deliveries") {
      return project.assignment !== null
        && ["delivered", "validated"].includes(project.assignment.deliveryStatus);
    }
    return false;
  });
  const incompleteItems = checklist
    ? (Object.keys(checklist) as Array<keyof ProfileChecklist>).filter((key) => !checklist[key])
    : [];
  const showOnboarding = profile && profile.onboardingStatus !== "active";

  return (
    <section className="crm-person-card-shell" aria-label="Espace créatifs Production">
      <header>
        <div>
          <p className="crm-kicker">Espace créatifs</p>
          <h1>Bienvenue dans votre espace KLIQUE</h1>
          <p>Gérez votre profil, vos disponibilités, vos propositions et vos livraisons au même endroit.</p>
        </div>
      </header>
      {showOnboarding ? (
        <section className="crm-person-card-shell" aria-labelledby="creative-onboarding-title">
          <h2 id="creative-onboarding-title">
            {profile.onboardingStatus === "pending_validation"
              ? "Votre profil est prêt pour validation"
              : "Complétez votre profil"}
          </h2>
          {profile.onboardingMessage ? <p>{profile.onboardingMessage}</p> : null}
          {profile.onboardingStatus === "pending_validation" ? (
            <p>Un Admin doit maintenant valider votre profil. Vous pouvez encore le modifier.</p>
          ) : (
            <>
              <p>Renseignez les éléments suivants pour soumettre votre profil à un Admin.</p>
              <ul>
                {(Object.keys(checklist ?? {}) as Array<keyof ProfileChecklist>).map((key) => (
                  <li key={key}>{checklist?.[key] ? "✓" : "○"} {checklistLabels[key]}</li>
                ))}
              </ul>
            </>
          )}
          <button type="button" className="primary-button" onClick={() => setTab("profile")}>
            {incompleteItems.length > 0 ? "Compléter mon profil" : "Voir mon profil"}
          </button>
        </section>
      ) : null}
      <div className="crm-skeleton-label" role="note">{CREATIVE_FINANCIAL_NOTICE}</div>
      <div className="crm-tabs" aria-label="Rubriques de l’espace créatif">
        <button type="button" onClick={() => setTab("proposals")} aria-pressed={tab === "proposals"}>Projets proposés</button>
        <button type="button" onClick={() => setTab("applications")} aria-pressed={tab === "applications"}>Candidatures</button>
        <button type="button" onClick={() => setTab("assigned")} aria-pressed={tab === "assigned"}>Projets attribués</button>
        <button type="button" onClick={() => setTab("deliveries")} aria-pressed={tab === "deliveries"}>Livraisons</button>
        <button type="button" onClick={() => setTab("availability")} aria-pressed={tab === "availability"}>Calendrier</button>
        <button type="button" onClick={() => setTab("profile")} aria-pressed={tab === "profile"}>Mon profil</button>
      </div>
      {error ? <p className="form-message is-error" role="alert">{error}</p> : null}
      {tab === "availability" ? (
        <CreativeAvailabilityManager />
      ) : tab === "profile" && profile ? (
        <form
          className="crm-person-info-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            fetch("/api/creative/profile", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                displayName: profile.displayName,
                creativeType: profile.creativeType,
                portfolioUrl: profile.portfolioUrl,
                coverageAreas: profile.coverageAreas,
                specialties: profile.specialties,
                bio: profile.bio,
                generalAvailability: profile.generalAvailability,
              }),
            }).then(async (response) => {
              const payload = await response.json();
              if (!response.ok) throw new Error(payload.error);
            }).then(load)
              .then(() => setMessage("Profil enregistré."))
              .catch((failure) => setError(failure.message || "Enregistrement impossible."));
          }}
        >
          <label>Nom<input value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} /></label>
          <label>Activité<select value={profile.creativeType} onChange={(event) => setProfile({ ...profile, creativeType: event.target.value as Profile["creativeType"] })}><option value="photographer">Photo</option><option value="videographer">Vidéo</option><option value="both">Photo et vidéo</option></select></label>
          <label>Régions<input value={profile.coverageAreas.join(", ")} onChange={(event) => setProfile({ ...profile, coverageAreas: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label>
          <label>Sports<input value={profile.specialties.join(", ")} onChange={(event) => setProfile({ ...profile, specialties: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label>
          <label>Portfolio HTTPS<input type="url" inputMode="url" placeholder="https://…" value={profile.portfolioUrl ?? ""} onChange={(event) => setProfile({ ...profile, portfolioUrl: event.target.value })} /></label>
          <label>Présentation<textarea value={profile.bio ?? ""} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} /></label>
          <label>Disponibilités générales<textarea value={profile.generalAvailability ?? ""} onChange={(event) => setProfile({ ...profile, generalAvailability: event.target.value })} /></label>
          <button type="submit" className="primary-button">Enregistrer le profil</button>
          {message ? <p className="form-message is-success">{message}</p> : null}
        </form>
      ) : tab !== "profile" ? (
        <div className="crm-production-list">
          {visibleProjects.length === 0 ? (
            <p className="crm-skeleton-label">
              {tab === "proposals"
                ? "Aucune proposition pour le moment."
                : tab === "applications"
                  ? "Aucune candidature pour le moment."
                  : tab === "assigned"
                    ? "Aucun projet attribué pour le moment."
                    : "Aucune livraison pour le moment."}
            </p>
          ) : visibleProjects.map((project) => {
            const journey = projectCreativeMissionJourney(project);
            return (
            <article key={project.id} className="crm-person-card-shell">
              <header><h2>{project.title}</h2><strong>{compensationLabel(project)}</strong></header>
              <section className="mission-journey-summary" aria-label="État de la mission">
                <mark data-tone={journey.tone}>{journey.label}</mark>
                <p>{journey.description}</p>
                <dl>
                  <div><dt>Prochaine action</dt><dd>{journey.nextAction}</dd></div>
                  <div><dt>Acteur attendu</dt><dd>{journey.expectedActor ?? "Aucun"}</dd></div>
                </dl>
                <ol className="mission-journey-timeline" aria-label="Parcours de la mission">
                  {journey.timeline.map((item) => (
                    <li key={item.id} data-status={item.status}><span>{item.label}</span></li>
                  ))}
                </ol>
              </section>
              <p>{project.objective}</p>
              <dl className="crm-person-info-grid">
                <div><dt>Date</dt><dd>{formatDate(project.scheduledDate)}</dd></div>
                <div><dt>Région</dt><dd>{project.region}</dd></div>
                <div><dt>Lieu</dt><dd>{project.locationDetails || "À convenir"}</dd></div>
                <div><dt>Livrables</dt><dd>{project.deliverables}</dd></div>
                <div><dt>Échéance</dt><dd>{formatDate(project.deliveryDueDate)}</dd></div>
                <div><dt>Répondre avant</dt><dd>{formatDateTime(project.responseDeadline)}</dd></div>
                <div><dt>Frais</dt><dd>{project.expensesCovered ? "Pris en charge" : "Non pris en charge"} — {project.expenseTerms}</dd></div>
                <div><dt>Crédits et utilisation</dt><dd>{project.creditsAndUsage}</dd></div>
              </dl>
              {!project.assignment ? (
                <div className="crm-person-error-actions">
                  <input aria-label="Message de candidature" value={message} maxLength={500} onChange={(event) => setMessage(event.target.value)} />
                  {project.applicationStatus === "interested" ? (
                    <button type="button" className="secondary-button" onClick={() => void mutate("POST", { briefId: project.id, action: "withdraw", message: null }).catch((failure) => setError(failure.message))}>Retirer ma candidature</button>
                  ) : (
                    <button type="button" className="primary-button" onClick={() => void mutate("POST", { briefId: project.id, action: "apply", message }).catch((failure) => setError(failure.message))}>Je suis intéressé·e</button>
                  )}
                </div>
              ) : (
                <div>
                  {project.assignment.confirmationStatus !== "confirmed" ? (
                    <button type="button" className="primary-button" onClick={() => void mutate("PATCH", { briefId: project.id, action: "confirm", conditionsVersion: project.conditionsVersion, links: [], comment: null }).catch((failure) => setError(failure.message))}>Confirmer la prise en charge</button>
                  ) : (
                    <form onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void mutate("PATCH", { briefId: project.id, action: "deliver", conditionsVersion: null, links: [String(data.get("deliveryUrl") ?? "")], comment: String(data.get("comment") ?? "") }).catch((failure) => setError(failure.message));
                    }}>
                      {project.assignment.necessaryContactDetails ? <p><strong>Contact utile :</strong> {project.assignment.necessaryContactDetails}</p> : null}
                      <label>Lien HTTPS<input name="deliveryUrl" type="url" required pattern="https://.*" /></label>
                      <label>Commentaire<textarea name="comment" /></label>
                      <button type="submit" className="primary-button">Transmettre la livraison</button>
                    </form>
                  )}
                  <label>
                    Motif du refus
                    <textarea
                      value={refusalReason}
                      maxLength={1000}
                      onChange={(event) => setRefusalReason(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!refusalReason.trim()}
                    onClick={() => void mutate("PATCH", {
                      briefId: project.id,
                      action: "refuse",
                      conditionsVersion: null,
                      links: [],
                      comment: refusalReason,
                    }).then(() => setRefusalReason(""))
                      .catch((failure) => setError(failure.message))}
                  >
                    Refuser cette attribution ou ces nouvelles conditions
                  </button>
                  {project.assignment.reviewComment ? <p><strong>Retour :</strong> {project.assignment.reviewComment}</p> : null}
                </div>
              )}
            </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
