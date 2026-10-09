"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  MapPin,
  RefreshCw,
  Video,
  XCircle,
} from "lucide-react";
import { Button, Card, Textarea } from "@/src/design-system/components";
import type {
  CreativeApplication,
  CreativeApplicationModerationStatus,
} from "@/lib/creatives/applications-sheet";
import { CreativeProfilesAdminPanel } from "@/components/creatives/CreativeProfilesAdminPanel";
import styles from "./creative-applications-admin.module.css";

type ApplicationsResponse = {
  applications?: CreativeApplication[];
  error?: string;
};

type ModerationResponse = {
  error?: string;
};

type Filter = CreativeApplicationModerationStatus;

export const CREATIVE_APPROVAL_CONFIRMATION =
  "Confirmer la candidature et créer la fiche créative canonique active ?";

const filters: Array<{ value: Filter; label: string }> = [
  { value: "pending", label: "À valider" },
  { value: "approved", label: "Approuvées" },
  { value: "rejected", label: "Refusées" },
];

const statusLabels: Record<CreativeApplicationModerationStatus, string> = {
  pending: "À valider",
  approved: "Approuvée",
  rejected: "Refusée",
};

const dateFormatter = new Intl.DateTimeFormat("fr-CH", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const formatDate = (value: string): string => {
  if (!value) return "Date non renseignée";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
};

const externalUrl = (value: string): string | null => {
  const normalized = value.trim();
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    try {
      return new URL(`https://${normalized}`).toString();
    } catch {
      return null;
    }
  }
};

const readError = async (response: Response, fallback: string): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as ModerationResponse | null;
  return payload?.error || fallback;
};

const profileIcon = (profile: string) => {
  const normalized = profile.toLocaleLowerCase("fr");
  return normalized.includes("vid") && !normalized.includes("photo") ? Video : Camera;
};

const ApplicationLink = ({ label, value }: { label: string; value: string }) => {
  const href = externalUrl(value);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={styles.externalLink}>
      {label}
      <ExternalLink size={14} aria-hidden />
    </a>
  );
};

export function CreativeApplicationsAdminScreen() {
  const [activeSection, setActiveSection] = useState<"applications" | "profiles">("applications");
  const [applications, setApplications] = useState<CreativeApplication[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busyApplicationId, setBusyApplicationId] = useState<string | null>(null);
  const [rejectionApplicationId, setRejectionApplicationId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const activeActions = useRef(new Set<string>());

  const loadApplications = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/admin/creatives/applications", {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    const payload = (await response.json().catch(() => null)) as ApplicationsResponse | null;
    if (!response.ok || !Array.isArray(payload?.applications)) {
      throw new Error(payload?.error || "Impossible de charger les candidatures créatives.");
    }
    setApplications(payload.applications);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void loadApplications(controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Impossible de charger les candidatures créatives.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadApplications]);

  const counts = useMemo(() => applications.reduce<Record<Filter, number>>(
    (current, application) => {
      current[application.moderationStatus] += 1;
      return current;
    },
    { pending: 0, approved: 0, rejected: 0 },
  ), [applications]);

  const visibleApplications = useMemo(
    () => applications.filter((application) => application.moderationStatus === filter),
    [applications, filter],
  );

  const refreshAfterSuccess = async () => {
    try {
      await loadApplications();
    } catch {
      setActionError("Action enregistrée, mais la liste n’a pas pu être actualisée.");
    }
  };

  const approve = async (application: CreativeApplication) => {
    if (activeActions.current.has(application.applicationId)) return;
    if (!window.confirm(CREATIVE_APPROVAL_CONFIRMATION)) return;

    activeActions.current.add(application.applicationId);
    setBusyApplicationId(application.applicationId);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(
        `/api/admin/creatives/applications/${encodeURIComponent(application.applicationId)}/approve`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      if (!response.ok) {
        throw new Error(await readError(response, "La candidature n’a pas pu être approuvée."));
      }
      setSuccessMessage("Candidature approuvée et fiche canonique créée.");
      await refreshAfterSuccess();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "La candidature n’a pas pu être approuvée.",
      );
    } finally {
      activeActions.current.delete(application.applicationId);
      setBusyApplicationId(null);
    }
  };

  const openRejection = (applicationId: string) => {
    setRejectionApplicationId(applicationId);
    setRejectionReason("");
    setRejectionError(null);
    setActionError(null);
    setSuccessMessage(null);
  };

  const cancelRejection = () => {
    setRejectionApplicationId(null);
    setRejectionReason("");
    setRejectionError(null);
  };

  const reject = async (
    event: FormEvent<HTMLFormElement>,
    application: CreativeApplication,
  ) => {
    event.preventDefault();
    if (activeActions.current.has(application.applicationId)) return;
    const reason = rejectionReason.trim();
    if (!reason) {
      setRejectionError("Le motif du refus est obligatoire.");
      return;
    }

    activeActions.current.add(application.applicationId);
    setBusyApplicationId(application.applicationId);
    setRejectionError(null);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(
        `/api/admin/creatives/applications/${encodeURIComponent(application.applicationId)}/reject`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!response.ok) {
        throw new Error(await readError(response, "La candidature n’a pas pu être refusée."));
      }
      setSuccessMessage("Candidature refusée.");
      cancelRejection();
      await refreshAfterSuccess();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "La candidature n’a pas pu être refusée.",
      );
    } finally {
      activeActions.current.delete(application.applicationId);
      setBusyApplicationId(null);
    }
  };

  return (
    <section className={styles.page} aria-labelledby="creative-applications-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CRM · CRÉATIFS</p>
          <h1 id="creative-applications-title">Créatifs</h1>
          <p>
            Validez les candidatures et gérez les fiches canoniques des photographes et vidéastes.
          </p>
        </div>
        <div className={styles.privacyNotice}>
          Données personnelles · accès Administrateur uniquement
        </div>
      </header>

      <nav className={styles.sectionTabs} aria-label="Gestion des créatifs">
        <Button
          type="button"
          role="tab"
          aria-selected={activeSection === "applications"}
          aria-controls="creative-applications-section"
          className={activeSection === "applications" ? styles.activeSectionTab : styles.sectionTab}
          onClick={() => setActiveSection("applications")}
        >
          Candidatures
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={activeSection === "profiles"}
          aria-controls="creative-profiles-section"
          className={activeSection === "profiles" ? styles.activeSectionTab : styles.sectionTab}
          onClick={() => setActiveSection("profiles")}
        >
          Fiches créatives
        </Button>
      </nav>

      {activeSection === "applications" ? (
        <div id="creative-applications-section" role="tabpanel" className={styles.sectionPanel}>
      <nav className={styles.filters} aria-label="Filtrer les candidatures">
        <div role="tablist" aria-label="Statut de modération">
          {filters.map((item) => (
            <Button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={filter === item.value}
              aria-controls="creative-applications-panel"
              className={filter === item.value ? styles.activeFilter : styles.filter}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
              <span aria-label={`${counts[item.value]} candidature${counts[item.value] === 1 ? "" : "s"}`}>
                {counts[item.value]}
              </span>
            </Button>
          ))}
        </div>
      </nav>

      {successMessage ? (
        <p className={styles.success} role="status" aria-live="polite">
          <CheckCircle2 size={18} aria-hidden />
          {successMessage}
        </p>
      ) : null}
      {actionError ? (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      ) : null}

      <div
        id="creative-applications-panel"
        aria-label={`Candidatures ${statusLabels[filter].toLowerCase()}`}
      >
        {loading ? (
          <div className={styles.state} role="status" aria-live="polite">
            <RefreshCw className={styles.spinner} size={22} aria-hidden />
            Chargement des candidatures créatives…
          </div>
        ) : loadError ? (
          <div className={styles.state} role="alert">
            <strong>Impossible de charger les candidatures.</strong>
            <span>{loadError}</span>
            <Button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                void loadApplications()
                  .catch(() => setLoadError("Impossible de charger les candidatures créatives."))
                  .finally(() => setLoading(false));
              }}
            >
              Réessayer
            </Button>
          </div>
        ) : visibleApplications.length === 0 ? (
          <div className={styles.state}>
            <strong>Aucune candidature {statusLabels[filter].toLowerCase()}.</strong>
            <span>Les nouvelles réponses apparaîtront ici après synchronisation.</span>
          </div>
        ) : (
          <div className={styles.grid}>
            {visibleApplications.map((application) => {
              const { fields } = application;
              const ProfileIcon = profileIcon(fields.profile);
              const isBusy = busyApplicationId === application.applicationId;
              const actionsLocked = busyApplicationId !== null;
              const rejectionOpen = rejectionApplicationId === application.applicationId;
              return (
                <Card
                  key={application.applicationId}
                  className={styles.card}
                  aria-labelledby={`creative-${application.applicationId}`}
                >
                  <div className={styles.cardHeader}>
                    <div className={styles.identity}>
                      <span className={styles.avatar} aria-hidden>
                        <ProfileIcon size={22} />
                      </span>
                      <div>
                        <h2 id={`creative-${application.applicationId}`}>{fields.fullName}</h2>
                        <p>{fields.profile || "Profil créatif non renseigné"}</p>
                      </div>
                    </div>
                    <span className={`${styles.status} ${styles[application.moderationStatus]}`}>
                      {statusLabels[application.moderationStatus]}
                    </span>
                  </div>

                  <dl className={styles.summary}>
                    <div>
                      <dt><MapPin size={15} aria-hidden /> Zone</dt>
                      <dd>{fields.travelRegions || fields.region || "Non renseignée"}</dd>
                    </div>
                    <div>
                      <dt>Spécialités</dt>
                      <dd>{fields.sportsToCover || "Non renseignées"}</dd>
                    </div>
                    <div>
                      <dt>Expérience</dt>
                      <dd>{fields.experienceLevel || fields.practiceDuration || "Non renseignée"}</dd>
                    </div>
                    <div>
                      <dt>Disponibilités</dt>
                      <dd>{fields.usualAvailability || "Non renseignées"}</dd>
                    </div>
                  </dl>

                  <div className={styles.links}>
                    <ApplicationLink label="Portfolio" value={fields.portfolioUrl} />
                    <ApplicationLink label="Site internet" value={fields.websiteUrl} />
                    <ApplicationLink label="Instagram" value={fields.instagram} />
                  </div>

                  <details className={styles.details}>
                    <summary>Voir les informations personnelles et le dossier complet</summary>
                    <div className={styles.detailsGrid}>
                      <div><strong>E-mail</strong><span>{fields.email || "Non renseigné"}</span></div>
                      <div><strong>Téléphone</strong><span>{fields.phone || "Non renseigné"}</span></div>
                      <div><strong>Résidence</strong><span>{[fields.city, fields.region].filter(Boolean).join(", ") || "Non renseignée"}</span></div>
                      <div><strong>Langues</strong><span>{fields.languages || "Non renseignées"}</span></div>
                      <div><strong>Matériel</strong><span>{fields.equipment || "Non renseigné"}</span></div>
                      <div><strong>Logiciels</strong><span>{fields.software || "Non renseignés"}</span></div>
                      <div className={styles.wide}><strong>Parcours</strong><span>{fields.background || "Non renseigné"}</span></div>
                      <div className={styles.wide}><strong>Motivation</strong><span>{fields.motivation || "Non renseignée"}</span></div>
                      <div className={styles.wide}><strong>Remarque</strong><span>{fields.additionalNotes || "Aucune"}</span></div>
                    </div>
                  </details>

                  {application.moderationStatus === "rejected" && application.moderationNotes ? (
                    <p className={styles.decisionNote}>
                      <strong>Motif du refus</strong>
                      <span>{application.moderationNotes}</span>
                    </p>
                  ) : null}

                  <footer className={styles.cardFooter}>
                    <span>Réponse reçue le {formatDate(fields.submittedAt)}</span>
                    {application.moderationStatus === "pending" ? (
                      <div className={styles.actions}>
                        <Button
                          type="button"
                          className={styles.approveButton}
                          disabled={actionsLocked}
                          aria-busy={isBusy}
                          aria-label={`Approuver la candidature de ${fields.fullName}`}
                          onClick={() => void approve(application)}
                        >
                          <CheckCircle2 size={17} aria-hidden />
                          {isBusy ? "Envoi…" : "Approuver"}
                        </Button>
                        <Button
                          type="button"
                          className={styles.rejectButton}
                          disabled={actionsLocked}
                          aria-label={`Refuser la candidature de ${fields.fullName}`}
                          onClick={() => openRejection(application.applicationId)}
                        >
                          <XCircle size={17} aria-hidden />
                          Refuser
                        </Button>
                      </div>
                    ) : (
                      <span>
                        {application.moderatedAt
                          ? `Décision le ${formatDate(application.moderatedAt)}`
                          : "Décision enregistrée"}
                      </span>
                    )}
                  </footer>

                  {rejectionOpen ? (
                    <form
                      className={styles.rejectionForm}
                      onSubmit={(event) => void reject(event, application)}
                      aria-label={`Refuser la candidature de ${fields.fullName}`}
                    >
                      <label htmlFor={`rejection-${application.applicationId}`}>
                        Motif du refus
                      </label>
                      <Textarea
                        id={`rejection-${application.applicationId}`}
                        value={rejectionReason}
                        onChange={(event) => setRejectionReason(event.target.value)}
                        required
                        maxLength={2000}
                        disabled={actionsLocked}
                        aria-describedby={
                          rejectionError
                            ? `rejection-error-${application.applicationId}`
                            : undefined
                        }
                        autoFocus
                      />
                      {rejectionError ? (
                        <p
                          id={`rejection-error-${application.applicationId}`}
                          className={styles.inlineError}
                          role="alert"
                        >
                          {rejectionError}
                        </p>
                      ) : null}
                      <div className={styles.actions}>
                        <Button
                          type="submit"
                          className={styles.rejectButton}
                          disabled={actionsLocked}
                          aria-busy={isBusy}
                        >
                          {isBusy ? "Envoi…" : "Confirmer le refus"}
                        </Button>
                        <Button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={actionsLocked}
                          onClick={cancelRejection}
                        >
                          Annuler
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </div>
        </div>
      ) : (
        <div id="creative-profiles-section" role="tabpanel">
          <CreativeProfilesAdminPanel />
        </div>
      )}
    </section>
  );
}
