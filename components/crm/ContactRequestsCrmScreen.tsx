"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Inbox, Pencil, X } from "lucide-react";
import type { Athlete, AthletesResponse } from "@/types/athlete";
import type { Partner, PartnerResponse } from "@/types/partner";

type ContactRequestStatus = "open" | "pending" | "in_progress" | "resolved";

type ContactRequest = {
  id: string;
  athleteId: string;
  partnerId: string | null;
  requestKind: "athlete_contact" | "partner_athlete_introduction";
  category: string;
  subject: string;
  message: string;
  status: ContactRequestStatus;
  createdAt: string;
};

type ContactRequestsResponse = {
  contactRequests?: ContactRequest[];
  error?: string;
};

type StatusFilter = "all" | ContactRequestStatus;
type RequestView = "athletes" | "partners";

type PartnerApplication = Partner & {
  sourceRow?: number;
  moderationStatus?: string;
  moderation_status?: string;
};

type PartnerForm = Pick<
  Partner,
  "name" | "relationType" | "category" | "contact" | "email" | "phone" | "website" | "instagram" | "description" | "benefits"
>;

const categoryLabels: Record<string, string> = {
  content_photo: "Photo et contenu",
  support: "Accompagnement KLIQUE",
  partner_benefit: "Avantage partenaire",
  technical: "Problème technique",
  other: "Autre demande",
};

const statusLabels: Record<ContactRequestStatus, string> = {
  open: "Nouvelle",
  pending: "En attente",
  in_progress: "En cours",
  resolved: "Traitée",
};

const statusBadgeModifier: Record<ContactRequestStatus, string> = {
  open: "is-prospect",
  pending: "is-prospect",
  in_progress: "is-actif",
  resolved: "is-inactif",
};

const filters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "open", label: "Nouvelles" },
  { value: "pending", label: "En attente" },
  { value: "in_progress", label: "En cours" },
  { value: "resolved", label: "Traitées" },
];

const statusOptions: ContactRequestStatus[] = ["open", "pending", "in_progress", "resolved"];

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const formatDate = (value: string): string => {
  if (!value) return "Date inconnue";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date inconnue";
  return dateFormatter.format(parsed);
};

const parseDateRank = (value: string): number => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const createPartnerForm = (partner: PartnerApplication): PartnerForm => ({
  name: partner.name ?? "",
  relationType: partner.relationType ?? partner.type ?? "Partenaire",
  category: partner.category ?? "",
  contact: partner.contact ?? partner.contactName ?? "",
  email: partner.email ?? "",
  phone: partner.phone ?? "",
  website: partner.website ?? "",
  instagram: partner.instagram ?? "",
  description: partner.description ?? "",
  benefits: partner.benefits ?? partner.benefitDetails ?? partner.memberOffer ?? "",
});

export function ContactRequestsCrmScreen() {
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [partnerApplications, setPartnerApplications] = useState<PartnerApplication[]>([]);
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({});
  const [partnerNames, setPartnerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [activeView, setActiveView] = useState<RequestView>("athletes");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [reviewingPartner, setReviewingPartner] = useState<PartnerApplication | null>(null);
  const [partnerForm, setPartnerForm] = useState<PartnerForm | null>(null);
  const [submittingPartner, setSubmittingPartner] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "partners") {
      setActiveView("partners");
    }
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      setUpdateError(null);

      try {
        const [requestsResponse, athletesResponse, partnersResponse] = await Promise.all([
          fetch("/api/contact-requests", { credentials: "include", cache: "no-store" }),
          fetch("/api/athletes", { credentials: "include", cache: "no-store" }),
          fetch("/api/partners", { credentials: "include", cache: "no-store" }),
        ]);

        const requestsPayload = (await requestsResponse.json().catch(() => null)) as ContactRequestsResponse | null;

        if (!requestsResponse.ok) {
          throw new Error(requestsPayload?.error || "Impossible de charger les demandes.");
        }

        let names: Record<string, string> = {};
        let resolvedPartnerNames: Record<string, string> = {};
        let pendingPartners: PartnerApplication[] = [];
        if (athletesResponse.ok) {
          const athletesPayload = (await athletesResponse.json().catch(() => null)) as AthletesResponse | null;
          const athletes: Athlete[] = athletesPayload?.athletes ?? [];
          names = athletes.reduce<Record<string, string>>((accumulator, athlete) => {
            if (athlete.key && athlete.name) {
              accumulator[athlete.key] = athlete.name;
            }
            return accumulator;
          }, {});
        }

        if (partnersResponse.ok) {
          const partnersPayload = (await partnersResponse.json().catch(() => null)) as PartnerResponse | null;
          const partners = partnersPayload?.partners ?? [];
          resolvedPartnerNames = partners.reduce<Record<string, string>>((accumulator, partner) => {
            if (partner.row && partner.name) accumulator[`row-${partner.row}`] = partner.name;
            return accumulator;
          }, {});
          pendingPartners = partners.filter((partner) => {
            const application = partner as PartnerApplication;
            const moderationStatus = application.moderationStatus ?? application.moderation_status ?? application.status;
            return moderationStatus?.toLowerCase() === "pending" && Number(application.sourceRow) >= 2;
          });
        }

        if (!active) return;

        setRequests(requestsPayload?.contactRequests ?? []);
        setAthleteNames(names);
        setPartnerNames(resolvedPartnerNames);
        setPartnerApplications(pendingPartners);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger les demandes.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [retryToken]);

  const sortedRequests = useMemo(
    () => [...requests].sort((a, b) => parseDateRank(b.createdAt) - parseDateRank(a.createdAt)),
    [requests],
  );

  const athleteRequests = useMemo(
    () => sortedRequests.filter((request) => request.requestKind !== "partner_athlete_introduction"),
    [sortedRequests],
  );

  const partnerIntroductionRequests = useMemo(
    () => sortedRequests.filter((request) => request.requestKind === "partner_athlete_introduction"),
    [sortedRequests],
  );

  const visibleAthleteRequests = useMemo(
    () => (statusFilter === "all" ? athleteRequests : athleteRequests.filter((request) => request.status === statusFilter)),
    [athleteRequests, statusFilter],
  );

  const resolveAthleteLabel = useCallback(
    (athleteId: string) => athleteNames[athleteId] || athleteId || "Athlète inconnu",
    [athleteNames],
  );

  const resolvePartnerLabel = useCallback(
    (partnerId: string | null) => (partnerId ? partnerNames[partnerId] || partnerId : "Partenaire inconnu"),
    [partnerNames],
  );

  const handleStatusChange = async (requestId: string, nextStatus: ContactRequestStatus) => {
    setUpdatingId(requestId);
    setUpdateError(null);

    try {
      const response = await fetch("/api/contact-requests", {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId, status: nextStatus }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { contactRequest?: ContactRequest; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Le statut n’a pas pu être mis à jour.");
      }

      const updatedStatus = payload?.contactRequest?.status ?? nextStatus;
      setRequests((current) =>
        current.map((request) => (request.id === requestId ? { ...request, status: updatedStatus } : request)),
      );
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "Le statut n’a pas pu être mis à jour.");
    } finally {
      setUpdatingId(null);
    }
  };

  const openPartnerReview = (partner: PartnerApplication) => {
    setUpdateError(null);
    setUpdateSuccess(null);
    setReviewingPartner(partner);
    setPartnerForm(createPartnerForm(partner));
  };

  const closePartnerReview = () => {
    if (submittingPartner) return;
    setReviewingPartner(null);
    setPartnerForm(null);
  };

  const updatePartnerForm = <Key extends keyof PartnerForm>(field: Key, value: PartnerForm[Key]) => {
    setPartnerForm((current) => (current ? { ...current, [field]: value } : current));
  };

  const submitPartnerModeration = async (action: "approve_application" | "reject_application") => {
    if (!reviewingPartner?.sourceRow || !partnerForm) return;
    if (action === "reject_application" && !window.confirm("Refuser définitivement cette demande partenaire ?")) return;

    setSubmittingPartner(true);
    setUpdateError(null);
    setUpdateSuccess(null);

    try {
      const response = await fetch("/api/partners", {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          sourceRow: reviewingPartner.sourceRow,
          ...(action === "approve_application" ? { editedData: partnerForm } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "La demande partenaire n’a pas pu être mise à jour.");
      }

      setPartnerApplications((current) =>
        current.filter((partner) => partner.sourceRow !== reviewingPartner.sourceRow),
      );
      setUpdateSuccess(action === "approve_application" ? "Partenaire validé." : "Demande partenaire refusée.");
      setReviewingPartner(null);
      setPartnerForm(null);
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "La demande partenaire n’a pas pu être mise à jour.");
    } finally {
      setSubmittingPartner(false);
    }
  };

  const partnerQueueCount = partnerApplications.length + partnerIntroductionRequests.length;
  const isEmpty = !loading && !errorMessage && activeView === "athletes" && visibleAthleteRequests.length === 0;
  const isPartnerQueueEmpty = !loading && !errorMessage && activeView === "partners" && partnerQueueCount === 0;

  return (
    <section className="crm-people-screen">
      <header className="crm-people-header">
        <div style={{ textAlign: "center", width: "100%" }}>
          <h1>Demandes KLIQUE</h1>
          <p>Suivez les demandes envoyées par les athlètes et les partenaires.</p>
        </div>
      </header>

      <section className="crm-actions-bar" aria-label="Vues et filtres des demandes">
        <div className="crm-view-toggle" role="tablist" aria-label="Type de demandes">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "athletes"}
            className={activeView === "athletes" ? "is-active" : undefined}
            onClick={() => setActiveView("athletes")}
          >
            Demandes athlètes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "partners"}
            className={activeView === "partners" ? "is-active" : undefined}
            onClick={() => setActiveView("partners")}
          >
            Partenaires <span className="crm-partner-count">{partnerQueueCount}</span>
          </button>
        </div>

        {activeView === "athletes" ? (
        <div className="crm-filter-scroller" role="group" aria-label="Filtrer par statut">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={statusFilter === filter.value ? "crm-filter-chip is-active" : "crm-filter-chip"}
              onClick={() => setStatusFilter(filter.value)}
              aria-pressed={statusFilter === filter.value}
            >
              {filter.label}
            </button>
          ))}
        </div>
        ) : null}
      </section>

      {updateError ? (
        <p className="crm-requests-inline-error" role="alert">
          {updateError}
        </p>
      ) : null}

      {updateSuccess ? <p className="crm-requests-inline-success" role="status">{updateSuccess}</p> : null}

      {loading ? (
        <section className="crm-skeleton-shell" aria-live="polite" aria-busy="true">
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <span className="crm-skeleton-label">Chargement des demandes...</span>
        </section>
      ) : null}

      {!loading && errorMessage ? (
        <section className="crm-error-state" aria-live="assertive">
          <h2>Impossible de charger les demandes</h2>
          <p>{errorMessage}</p>
          <button type="button" onClick={() => setRetryToken((value) => value + 1)}>
            Reessayer
          </button>
        </section>
      ) : null}

      {isEmpty ? (
        <section className="crm-empty-state" aria-live="polite">
          <div className="crm-empty-icon" aria-hidden>
            <Inbox size={20} />
          </div>
          <h2>Aucune demande pour ce filtre</h2>
          <p>Les demandes envoyées par les athlètes depuis leur espace apparaitront ici.</p>
        </section>
      ) : null}

      {isPartnerQueueEmpty ? (
        <section className="crm-empty-state" aria-live="polite">
          <div className="crm-empty-icon" aria-hidden>
            <Inbox size={20} />
          </div>
          <h2>Aucune demande partenaire</h2>
          <p>Les candidatures et mises en relation partenaires apparaitront ici.</p>
        </section>
      ) : null}

      {!loading && !errorMessage && activeView === "athletes" && visibleAthleteRequests.length > 0 ? (
        <>
          <section className="crm-list-shell">
            <div className="crm-requests-head" role="row">
              <span>Demandeur / Athlète</span>
              <span>Catégorie</span>
              <span>Demande</span>
              <span>Date</span>
              <span>Statut</span>
              <span>Changer le statut</span>
            </div>

            <ul className="crm-list-body">
              {visibleAthleteRequests.map((request) => (
                <li key={request.id}>
                  <div className="crm-requests-row">
                    <span>
                      <strong>{resolveAthleteLabel(request.athleteId)}</strong>
                    </span>
                    <span>{categoryLabels[request.category] ?? request.category}</span>
                    <span className="crm-requests-message-cell">
                      <strong>{request.subject}</strong>
                      {request.message ? <small>{request.message}</small> : null}
                    </span>
                    <span>{formatDate(request.createdAt)}</span>
                    <span>
                      <small className={`crm-status-badge ${statusBadgeModifier[request.status]}`}>
                        {statusLabels[request.status]}
                      </small>
                    </span>
                    <span>
                      <label className="crm-select-wrap">
                        <span className="crm-requests-select-label">Statut</span>
                        <select
                          value={request.status}
                          disabled={updatingId === request.id}
                          onChange={(event) =>
                            handleStatusChange(request.id, event.target.value as ContactRequestStatus)
                          }
                          aria-label={`Modifier le statut de la demande ${request.subject}`}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {statusLabels[status]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="crm-cards-grid desktop-hidden-by-mode">
            {visibleAthleteRequests.map((request) => (
              <article key={request.id} className="crm-person-card">
                <header>
                  <div>
                    <h3>{resolveAthleteLabel(request.athleteId)}</h3>
                    <p>{categoryLabels[request.category] ?? request.category}</p>
                  </div>
                </header>

                <dl>
                  <div>
                    <dt>Sujet</dt>
                    <dd>{request.subject}</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>{formatDate(request.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Statut</dt>
                    <dd>
                      <small className={`crm-status-badge ${statusBadgeModifier[request.status]}`}>
                        {statusLabels[request.status]}
                      </small>
                    </dd>
                  </div>
                </dl>

                {request.message ? <p className="crm-requests-card-message">{request.message}</p> : null}

                <footer>
                  <label className="crm-select-wrap">
                    <span>Statut</span>
                    <select
                      value={request.status}
                      disabled={updatingId === request.id}
                      onChange={(event) => handleStatusChange(request.id, event.target.value as ContactRequestStatus)}
                      aria-label={`Modifier le statut de la demande ${request.subject}`}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {statusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                </footer>
              </article>
            ))}
          </section>
        </>
      ) : null}

      {!loading && !errorMessage && activeView === "partners" && partnerIntroductionRequests.length > 0 ? (
        <>
          <section className="crm-list-shell">
            <div className="crm-introductions-head" role="row">
              <span>Demandeur</span>
              <span>Athlète concerné</span>
              <span>Demande</span>
              <span>Date</span>
              <span>Statut</span>
              <span>Changer le statut</span>
            </div>

            <ul className="crm-list-body">
              {partnerIntroductionRequests.map((request) => (
                <li key={request.id}>
                  <div className="crm-introductions-row">
                    <span><strong>{resolvePartnerLabel(request.partnerId)}</strong></span>
                    <span><strong>{resolveAthleteLabel(request.athleteId)}</strong></span>
                    <span className="crm-requests-message-cell">
                      <strong>{request.subject}</strong>
                      {request.message ? <small>{request.message}</small> : null}
                    </span>
                    <span>{formatDate(request.createdAt)}</span>
                    <span>
                      <small className={`crm-status-badge ${statusBadgeModifier[request.status]}`}>
                        {statusLabels[request.status]}
                      </small>
                    </span>
                    <span>
                      <label className="crm-select-wrap">
                        <span className="crm-requests-select-label">Statut</span>
                        <select
                          value={request.status}
                          disabled={updatingId === request.id}
                          onChange={(event) => handleStatusChange(request.id, event.target.value as ContactRequestStatus)}
                          aria-label={`Modifier le statut de la demande ${request.subject}`}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>{statusLabels[status]}</option>
                          ))}
                        </select>
                      </label>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="crm-cards-grid desktop-hidden-by-mode">
            {partnerIntroductionRequests.map((request) => (
              <article key={request.id} className="crm-person-card">
                <header><div><h3>Mise en relation</h3><p>{formatDate(request.createdAt)}</p></div></header>
                <dl>
                  <div><dt>Demandeur</dt><dd>{resolvePartnerLabel(request.partnerId)}</dd></div>
                  <div><dt>Athlète concerné</dt><dd>{resolveAthleteLabel(request.athleteId)}</dd></div>
                  <div><dt>Motif</dt><dd>{request.subject}</dd></div>
                  <div><dt>Statut</dt><dd><small className={`crm-status-badge ${statusBadgeModifier[request.status]}`}>{statusLabels[request.status]}</small></dd></div>
                </dl>
                {request.message ? <p className="crm-requests-card-message">{request.message}</p> : null}
                <footer>
                  <label className="crm-select-wrap">
                    <span>Statut</span>
                    <select
                      value={request.status}
                      disabled={updatingId === request.id}
                      onChange={(event) => handleStatusChange(request.id, event.target.value as ContactRequestStatus)}
                      aria-label={`Modifier le statut de la demande ${request.subject}`}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>{statusLabels[status]}</option>
                      ))}
                    </select>
                  </label>
                </footer>
              </article>
            ))}
          </section>
        </>
      ) : null}

      {!loading && !errorMessage && activeView === "partners" && partnerApplications.length > 0 ? (
        <section className="crm-list-shell">
          <div className="crm-partners-head" role="row">
            <span>Structure</span>
            <span>Contact</span>
            <span>Coordonnées</span>
            <span>Avantage</span>
            <span>Action</span>
          </div>
          <ul className="crm-list-body">
            {partnerApplications.map((partner) => (
              <li key={partner.sourceRow}>
                <div className="crm-partners-row">
                  <span><strong>{partner.name}</strong><small>{partner.relationType ?? partner.type ?? "Partenaire"}</small></span>
                  <span>{partner.contact || "Non renseigné"}</span>
                  <span className="crm-partner-details"><small>{partner.email}</small><small>{partner.phone}</small></span>
                  <span>{partner.benefits || partner.benefitDetails || "Non renseigné"}</span>
                  <span>
                    <button type="button" className="crm-secondary-action-link" onClick={() => openPartnerReview(partner)}>
                      <Pencil size={15} aria-hidden /> Examiner
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {reviewingPartner && partnerForm ? (
        <section className="crm-partner-review" role="dialog" aria-modal="true" aria-labelledby="partner-review-title">
          <header>
            <div>
              <p>Demande partenaire</p>
              <h2 id="partner-review-title">Examiner {reviewingPartner.name}</h2>
            </div>
            <button type="button" className="crm-partner-close" onClick={closePartnerReview} aria-label="Fermer"><X size={18} /></button>
          </header>
          <div className="crm-partner-form-grid">
            <label>Nom<input value={partnerForm.name} onChange={(event) => updatePartnerForm("name", event.target.value)} /></label>
            <label>Type de relation<input value={partnerForm.relationType ?? ""} onChange={(event) => updatePartnerForm("relationType", event.target.value)} /></label>
            <label>Catégorie<input value={partnerForm.category} onChange={(event) => updatePartnerForm("category", event.target.value)} /></label>
            <label>Contact<input value={partnerForm.contact} onChange={(event) => updatePartnerForm("contact", event.target.value)} /></label>
            <label>Email<input type="email" value={partnerForm.email} onChange={(event) => updatePartnerForm("email", event.target.value)} /></label>
            <label>Téléphone<input type="tel" value={partnerForm.phone} onChange={(event) => updatePartnerForm("phone", event.target.value)} /></label>
            <label>Site<input type="url" value={partnerForm.website} onChange={(event) => updatePartnerForm("website", event.target.value)} /></label>
            <label>Instagram<input value={partnerForm.instagram} onChange={(event) => updatePartnerForm("instagram", event.target.value)} /></label>
            <label className="is-wide">Description<textarea value={partnerForm.description} onChange={(event) => updatePartnerForm("description", event.target.value)} /></label>
            <label className="is-wide">Avantage<textarea value={partnerForm.benefits} onChange={(event) => updatePartnerForm("benefits", event.target.value)} /></label>
          </div>
          <footer>
            <button type="button" className="crm-partner-reject" disabled={submittingPartner} onClick={() => submitPartnerModeration("reject_application")}>Refuser</button>
            <button type="button" className="crm-partner-approve" disabled={submittingPartner} onClick={() => submitPartnerModeration("approve_application")}><Check size={16} aria-hidden /> {submittingPartner ? "Mise à jour..." : "Valider"}</button>
          </footer>
        </section>
      ) : null}

      <style>{`
        .crm-requests-head,
        .crm-requests-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 1.6fr) 150px 110px 150px;
          gap: 10px;
          align-items: center;
        }

        .crm-introductions-head,
        .crm-introductions-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.5fr) 150px 110px 150px;
          gap: 10px;
          align-items: center;
        }

        .crm-introductions-head {
          height: 52px;
          padding: 0 18px;
          border-bottom: 1px solid #f1f1f1;
          color: #818181;
          font-size: 0.75rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .crm-introductions-row {
          width: 100%;
          min-height: 74px;
          border-radius: 14px;
          background: #ffffff;
          padding: 12px 10px;
          color: inherit;
          font-size: 0.86rem;
        }

        .crm-requests-head {
          height: 52px;
          padding: 0 18px;
          border-bottom: 1px solid #f1f1f1;
          color: #818181;
          font-size: 0.75rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .crm-requests-row {
          width: 100%;
          min-height: 74px;
          border-radius: 14px;
          background: #ffffff;
          padding: 12px 10px;
          color: inherit;
          font-size: 0.86rem;
        }

        .crm-requests-message-cell {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .crm-requests-message-cell small {
          color: #7b7b7b;
          font-size: 0.8rem;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .crm-requests-select-label {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }

        .crm-requests-card-message {
          margin: 0;
          color: #4b4b4b;
          font-size: 0.86rem;
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .crm-requests-inline-error {
          margin: 0;
          border: 1px solid #f0c2c2;
          border-radius: 14px;
          background: #fdecec;
          color: #a12727;
          padding: 12px 14px;
          font-size: 0.86rem;
        }

        .crm-requests-inline-success {
          margin: 0;
          border: 1px solid #b7ddc4;
          border-radius: 14px;
          background: #edf8f0;
          color: #27643a;
          padding: 12px 14px;
          font-size: 0.86rem;
        }

        .crm-partner-count {
          display: inline-grid;
          min-width: 20px;
          height: 20px;
          place-items: center;
          border-radius: 10px;
          background: #1d1d1d;
          color: #fff;
          font-size: 0.7rem;
        }

        .crm-partners-head,
        .crm-partners-row {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1.2fr) 120px;
          gap: 10px;
          align-items: center;
        }

        .crm-partners-head {
          height: 52px;
          padding: 0 18px;
          border-bottom: 1px solid #f1f1f1;
          color: #818181;
          font-size: 0.75rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .crm-partners-row {
          min-height: 74px;
          padding: 12px 10px;
          border-radius: 14px;
          background: #fff;
          font-size: 0.86rem;
        }

        .crm-partners-row > span:first-child,
        .crm-partner-details {
          display: grid;
          gap: 4px;
        }

        .crm-partners-row small { color: #7b7b7b; }

        .crm-secondary-action-link,
        .crm-partner-approve,
        .crm-partner-reject,
        .crm-partner-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 0;
          cursor: pointer;
          font: inherit;
        }

        .crm-secondary-action-link { background: transparent; color: #222; text-decoration: underline; }
        .crm-partner-review { margin-top: 18px; border: 1px solid #e4e4e4; border-radius: 8px; background: #fff; padding: 20px; }
        .crm-partner-review header, .crm-partner-review footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .crm-partner-review header p { margin: 0 0 4px; color: #777; font-size: 0.8rem; }
        .crm-partner-review h2 { margin: 0; font-size: 1.1rem; }
        .crm-partner-close { width: 34px; height: 34px; background: #f4f4f4; border-radius: 4px; }
        .crm-partner-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 20px 0; }
        .crm-partner-form-grid label { display: grid; gap: 6px; color: #4b4b4b; font-size: 0.8rem; }
        .crm-partner-form-grid input, .crm-partner-form-grid textarea { width: 100%; box-sizing: border-box; border: 1px solid #d9d9d9; border-radius: 4px; padding: 9px 10px; color: #1d1d1d; font: inherit; }
        .crm-partner-form-grid textarea { min-height: 84px; resize: vertical; }
        .crm-partner-form-grid .is-wide { grid-column: 1 / -1; }
        .crm-partner-review footer { justify-content: flex-end; }
        .crm-partner-approve, .crm-partner-reject { padding: 9px 14px; border-radius: 4px; }
        .crm-partner-approve { background: #1d1d1d; color: #fff; }
        .crm-partner-reject { background: #fdecec; color: #a12727; }
        .crm-partner-approve:disabled, .crm-partner-reject:disabled { cursor: not-allowed; opacity: 0.6; }

        @media (max-width: 760px) {
          .crm-partners-head { display: none; }
          .crm-partners-row { grid-template-columns: 1fr; gap: 8px; }
          .crm-partner-form-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}
