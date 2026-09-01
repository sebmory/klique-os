"use client";

import { useEffect, useState } from "react";
import { Card } from "@/src/design-system/components";

type PartnerPortalProfile = {
  id: string;
  name: string;
  type: string;
  relationType: string;
  category: string;
  description: string;
  services: string;
  benefits: string;
  benefitDetails: string;
  memberOffer: string;
  contact: string;
  contactName: string;
  contactRole: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  expertKlique: boolean;
};

type PortalState =
  | { status: "loading"; profile: null; message: string }
  | { status: "ready"; profile: PartnerPortalProfile; message: string }
  | { status: "empty" | "forbidden" | "error"; profile: null; message: string };

const normalize = (value: unknown): string => String(value ?? "").trim();

const externalUrl = (value: string): string => {
  const text = normalize(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("@")) return `https://www.instagram.com/${text.slice(1)}`;
  return `https://${text}`;
};

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const text = normalize(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function PartnerPortalPage() {
  const [state, setState] = useState<PortalState>({ status: "loading", profile: null, message: "" });

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const accessResponse = await fetch("/api/clerk/access", { credentials: "include", cache: "no-store" });
        if (!accessResponse.ok) {
          if (active) setState({ status: "forbidden", profile: null, message: "Accès au portail refusé." });
          return;
        }

        const accessPayload = await accessResponse.json();
        const access = accessPayload?.userAccess;
        const hasPartnerAccess = access?.role === "partner_expert"
          && access?.status === "active"
          && typeof access?.workspaceId === "string"
          && access.workspaceId.trim().length > 0
          && typeof access?.partnerId === "string"
          && access.partnerId.trim().length > 0;

        if (!hasPartnerAccess) {
          if (active) setState({ status: "forbidden", profile: null, message: "Ce portail est réservé aux partenaires et experts actifs." });
          return;
        }

        const partnersResponse = await fetch("/api/partners", { credentials: "include", cache: "no-store" });
        if (!partnersResponse.ok) {
          if (active) setState({ status: "error", profile: null, message: "Impossible de charger votre fiche." });
          return;
        }

        const partnersPayload = await partnersResponse.json();
        const profile = Array.isArray(partnersPayload?.partners) ? partnersPayload.partners[0] : null;
        if (!profile) {
          if (active) setState({ status: "empty", profile: null, message: "Aucune fiche partenaire associée à ce compte." });
          return;
        }

        if (active) setState({ status: "ready", profile: profile as PartnerPortalProfile, message: "" });
      } catch {
        if (active) setState({ status: "error", profile: null, message: "Impossible de charger votre fiche." });
      }
    };

    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return <section className="partner-portal-state">Chargement de votre espace…</section>;
  }

  if (state.status !== "ready") {
    return <section className="partner-portal-state">{state.message}</section>;
  }

  const { profile } = state;
  const advantages = uniqueValues([profile.memberOffer, profile.benefits, profile.benefitDetails]);
  const websiteUrl = externalUrl(profile.website);
  const instagramUrl = externalUrl(profile.instagram);

  return (
    <section className="partner-portal">
      <header className="partner-portal-hero">
        <p>Votre espace KLIQUE</p>
        <h1>{profile.name}</h1>
        <div className="partner-portal-tags">
          {normalize(profile.type || profile.relationType) ? <span>{profile.type || profile.relationType}</span> : null}
          {normalize(profile.category) ? <span>{profile.category}</span> : null}
        </div>
      </header>

      <div className="partner-portal-grid">
        <Card className="partner-portal-card partner-portal-overview">
          <header><span>Présentation</span><h2>Votre fiche</h2></header>
          {normalize(profile.description) ? <p>{profile.description}</p> : <p>Aucune description publique renseignée.</p>}
        </Card>

        <Card className="partner-portal-card">
          <header><span>Activité</span><h2>Services</h2></header>
          {normalize(profile.services) ? <p>{profile.services}</p> : <p>Aucun service public renseigné.</p>}
        </Card>

        <Card className="partner-portal-card">
          <header><span>Communauté</span><h2>Avantages</h2></header>
          {advantages.length > 0 ? (
            <ul>{advantages.map((advantage) => <li key={advantage}>{advantage}</li>)}</ul>
          ) : (
            <p>Aucun avantage public renseigné.</p>
          )}
        </Card>

        <Card className="partner-portal-card partner-portal-contact">
          <header><span>Public</span><h2>Coordonnées</h2></header>
          <dl>
            {normalize(profile.contactName || profile.contact) ? (
              <div><dt>Contact</dt><dd>{profile.contactName || profile.contact}{profile.contactRole ? ` · ${profile.contactRole}` : ""}</dd></div>
            ) : null}
            {profile.email ? <div><dt>E-mail</dt><dd><a href={`mailto:${profile.email}`}>{profile.email}</a></dd></div> : null}
            {profile.phone ? <div><dt>Téléphone</dt><dd><a href={`tel:${profile.phone}`}>{profile.phone}</a></dd></div> : null}
            {websiteUrl ? <div><dt>Site</dt><dd><a href={websiteUrl} target="_blank" rel="noreferrer">{profile.website}</a></dd></div> : null}
            {instagramUrl ? <div><dt>Instagram</dt><dd><a href={instagramUrl} target="_blank" rel="noreferrer">{profile.instagram}</a></dd></div> : null}
          </dl>
        </Card>
      </div>
    </section>
  );
}