"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CREATIVE_FINANCIAL_NOTICE,
  type ProductionCreativeBrief,
} from "@/types/production-creative";

type Tab = "proposals" | "assigned" | "profile";
type Profile = {
  displayName: string;
  creativeType: "photographer" | "videographer" | "both";
  portfolioUrl: string | null;
  coverageAreas: string[];
  specialties: string[];
  bio: string | null;
  generalAvailability: string | null;
};

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("fr-CH").format(new Date(`${value}T00:00:00`)) : "À convenir";

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

  const visibleProjects = projects.filter((project) =>
    tab === "assigned" ? project.assignment !== null : project.assignment === null
  );

  return (
    <section className="crm-person-card-shell" aria-label="Espace créatifs Production">
      <header>
        <div>
          <p className="crm-kicker">Espace créatifs</p>
          <h1>Collaborations Production</h1>
        </div>
      </header>
      <div className="crm-skeleton-label" role="note">{CREATIVE_FINANCIAL_NOTICE}</div>
      <div className="crm-tabs" aria-label="Rubriques de l’espace créatif">
        <button type="button" onClick={() => setTab("proposals")} aria-pressed={tab === "proposals"}>Projets proposés</button>
        <button type="button" onClick={() => setTab("assigned")} aria-pressed={tab === "assigned"}>Mes projets</button>
        <button type="button" onClick={() => setTab("profile")} aria-pressed={tab === "profile"}>Mon profil</button>
      </div>
      {error ? <p className="form-message is-error" role="alert">{error}</p> : null}
      {tab === "profile" && profile ? (
        <form
          className="crm-person-info-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            fetch("/api/creative/profile", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(profile),
            }).then(async (response) => {
              const payload = await response.json();
              if (!response.ok) throw new Error(payload.error);
            }).then(() => setMessage("Profil enregistré."))
              .catch((failure) => setError(failure.message || "Enregistrement impossible."));
          }}
        >
          <label>Nom<input value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} /></label>
          <label>Activité<select value={profile.creativeType} onChange={(event) => setProfile({ ...profile, creativeType: event.target.value as Profile["creativeType"] })}><option value="photographer">Photo</option><option value="videographer">Vidéo</option><option value="both">Photo et vidéo</option></select></label>
          <label>Régions<input value={profile.coverageAreas.join(", ")} onChange={(event) => setProfile({ ...profile, coverageAreas: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label>
          <label>Sports<input value={profile.specialties.join(", ")} onChange={(event) => setProfile({ ...profile, specialties: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label>
          <label>Portfolio<input type="url" value={profile.portfolioUrl ?? ""} onChange={(event) => setProfile({ ...profile, portfolioUrl: event.target.value })} /></label>
          <label>Présentation<textarea value={profile.bio ?? ""} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} /></label>
          <label>Disponibilités générales<textarea value={profile.generalAvailability ?? ""} onChange={(event) => setProfile({ ...profile, generalAvailability: event.target.value })} /></label>
          <button type="submit" className="primary-button">Enregistrer le profil</button>
          {message ? <p className="form-message is-success">{message}</p> : null}
        </form>
      ) : tab !== "profile" ? (
        <div className="crm-production-list">
          {visibleProjects.length === 0 ? <p className="crm-skeleton-label">Aucun projet dans cette rubrique.</p> : visibleProjects.map((project) => (
            <article key={project.id} className="crm-person-card-shell">
              <header><h2>{project.title}</h2><strong>{compensationLabel(project)}</strong></header>
              <p>{project.objective}</p>
              <dl className="crm-person-info-grid">
                <div><dt>Date</dt><dd>{formatDate(project.scheduledDate)}</dd></div>
                <div><dt>Région</dt><dd>{project.region}</dd></div>
                <div><dt>Livrables</dt><dd>{project.deliverables}</dd></div>
                <div><dt>Échéance</dt><dd>{formatDate(project.deliveryDueDate)}</dd></div>
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
                  <p><strong>Confirmation :</strong> {project.assignment.confirmationStatus}</p>
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
          ))}
        </div>
      ) : null}
    </section>
  );
}
