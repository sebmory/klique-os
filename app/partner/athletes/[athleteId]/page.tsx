"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Award, ExternalLink, Handshake } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { PublicAthleteProfile } from "@/types/athlete";

const normalize = (value: unknown): string => String(value ?? "").trim();

const distinctionLabel = (type: string): string =>
  type === "athlete_of_the_month" ? "Athlète KLIQUE du mois" : type.replace(/_/g, " ");

const distinctionPeriod = (month: number, year: number): string => {
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12) return "";
  return new Intl.DateTimeFormat("fr-CH", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
};

const socialHref = (label: string, value: string): string => {
  const url = normalize(value);
  if (/^https?:\/\//i.test(url)) return url;
  if (label === "Instagram" && url.startsWith("@")) return `https://instagram.com/${url.slice(1)}`;
  return `https://${url}`;
};

export default function PartnerAthleteProfilePage() {
  const params = useParams<{ athleteId: string }>();
  const athleteId = typeof params.athleteId === "string" ? params.athleteId : "";
  const [athlete, setAthlete] = useState<PublicAthleteProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [introductionPending, setIntroductionPending] = useState(false);
  const [showIntroductionModal, setShowIntroductionModal] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [submittingIntroduction, setSubmittingIntroduction] = useState(false);
  const [introductionError, setIntroductionError] = useState("");
  const [introductionSuccess, setIntroductionSuccess] = useState("");

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/partner/athletes/${encodeURIComponent(athleteId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Impossible de charger cette fiche publique.");
        if (active) {
          setAthlete(payload.athlete as PublicAthleteProfile);
          setIntroductionPending(payload.introductionPending === true);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Impossible de charger cette fiche publique.");
      } finally {
        if (active) setLoading(false);
      }
    };

    if (athleteId) void loadProfile();
    return () => {
      active = false;
    };
  }, [athleteId]);

  useEffect(() => {
    if (!introductionSuccess) return;
    const timeoutId = window.setTimeout(() => setIntroductionSuccess(""), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [introductionSuccess]);

  const submitIntroductionRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingIntroduction(true);
    setIntroductionError("");
    setIntroductionSuccess("");
    try {
      const response = await fetch("/api/partner/contact-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId, reason, message }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible d’envoyer la demande.");
      setIntroductionPending(true);
      setIntroductionSuccess("Demande transmise à KLIQUE");
      setShowIntroductionModal(false);
      setReason("");
      setMessage("");
    } catch (submitError) {
      setIntroductionError(submitError instanceof Error ? submitError.message : "Impossible d’envoyer la demande.");
    } finally {
      setSubmittingIntroduction(false);
    }
  };

  if (loading) return <section className="partner-portal-state">Chargement de la fiche…</section>;

  if (error || !athlete) {
    return (
      <section className="partner-portal partner-athlete-profile">
        <Link href="/partner/athletes" className="partner-athlete-back"><ArrowLeft size={16} aria-hidden /> Retour aux athlètes</Link>
        <section className="partner-portal-state" role="alert">{error || "Athlète public introuvable."}</section>
      </section>
    );
  }

  return (
    <section className="partner-portal partner-athlete-profile">
      <Link href="/partner/athletes" className="partner-athlete-back"><ArrowLeft size={16} aria-hidden /> Retour aux athlètes</Link>

      <header className="partner-athlete-profile-hero">
        {athlete.portraitUrl ? <img src={athlete.portraitUrl} alt="" /> : null}
        <div>
          {athlete.sport ? <p>{athlete.sport}</p> : null}
          <h1>{athlete.name}</h1>
          {athlete.club ? <span>{athlete.club}</span> : null}
          <button
            type="button"
            className="partner-athlete-introduction-button"
            disabled={introductionPending}
            onClick={() => {
              setIntroductionError("");
              setShowIntroductionModal(true);
            }}
          >
            <Handshake size={17} aria-hidden />
            {introductionPending ? "Demande en attente" : "Demander une mise en relation"}
          </button>
        </div>
      </header>

      {introductionSuccess ? <p className="partner-athlete-introduction-feedback" role="status">{introductionSuccess}</p> : null}

      <div className="partner-athlete-profile-grid">
        {athlete.presentation ? <section><span>Présentation</span><p>{athlete.presentation}</p></section> : null}
        {athlete.journey ? <section><span>Parcours sportif</span><p>{athlete.journey}</p></section> : null}
        {athlete.goals ? <section><span>Objectifs sportifs</span><p>{athlete.goals}</p></section> : null}

        {athlete.distinctions.length > 0 ? (
          <section className="partner-athlete-profile-wide">
            <span>Distinctions KLIQUE</span>
            <ul className="partner-athlete-distinctions">
              {athlete.distinctions.map((distinction, index) => (
                <li key={`${distinction.type}-${distinction.awardYear}-${distinction.awardMonth}-${index}`}>
                  <Award size={17} aria-hidden />
                  <div>
                    <strong>{distinctionLabel(distinction.type)}</strong>
                    {distinctionPeriod(distinction.awardMonth, distinction.awardYear) ? <small>{distinctionPeriod(distinction.awardMonth, distinction.awardYear)}</small> : null}
                    {distinction.description ? <p>{distinction.description}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {athlete.socialLinks.length > 0 ? (
          <section className="partner-athlete-profile-wide">
            <span>Réseaux publics</span>
            <div className="partner-athlete-socials">
              {athlete.socialLinks.map((link) => (
                <a key={`${link.label}-${link.url}`} href={socialHref(link.label, link.url)} target="_blank" rel="noreferrer">
                  {link.label}<ExternalLink size={14} aria-hidden />
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {showIntroductionModal ? (
        <Modal title="Demander une mise en relation" onClose={() => setShowIntroductionModal(false)}>
          <form className="partner-introduction-form" onSubmit={submitIntroductionRequest}>
            <label>
              <span>Motif *</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={150} required autoFocus />
            </label>
            <label>
              <span>Message complémentaire</span>
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={3000} rows={4} />
            </label>
            {introductionError ? <p role="alert">{introductionError}</p> : null}
            <div>
              <button type="button" onClick={() => setShowIntroductionModal(false)}>Annuler</button>
              <button type="submit" disabled={submittingIntroduction || !reason.trim()}>
                {submittingIntroduction ? "Envoi…" : "Envoyer la demande"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}