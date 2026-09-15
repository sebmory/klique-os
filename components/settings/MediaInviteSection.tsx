"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input } from "@/src/design-system/components";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const errorByStatus: Record<number, string> = {
  400: "Vérifiez les informations saisies.",
  401: "Votre session a expiré. Reconnectez-vous puis réessayez.",
  403: "Seul un administrateur actif peut gérer les accès médias.",
  404: "L’organisation Média sélectionnée est introuvable ou inactive.",
  409: "Cette adresse a déjà une invitation en attente ou un accès actif.",
  500: "L’opération n’a pas pu aboutir. Réessayez plus tard.",
  502: "L’invitation n’a pas pu être envoyée.",
};

type OrganizationType = "media_outlet" | "journalist" | "agency" | "creator" | "other";
type Organization = {
  id: string;
  name: string;
  type: OrganizationType;
  contactEmail: string;
  website: string | null;
  status: "active" | "inactive";
};
type Invitation = {
  invitationId: string;
  mediaId: string | null;
  email: string;
  invitationStatus: "invited" | "accepted" | "revoked";
  accessStatus: "active" | "disabled" | null;
  createdAt: string;
};

const typeLabels: Record<OrganizationType, string> = {
  media_outlet: "Média",
  journalist: "Journaliste",
  agency: "Agence",
  creator: "Créateur",
  other: "Autre",
};
const typeOptions = Object.entries(typeLabels) as Array<[OrganizationType, string]>;
const fieldStyle = { display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 } as const;
const inputStyle = { width: "100%", borderRadius: "8px" } as const;
const selectStyle = { width: "100%", border: "1px solid #d1d5db", borderRadius: "8px", padding: "0.7rem 0.8rem", background: "#fff", color: "#111827" } as const;

const accessLabel = (organizationId: string, invitations: Invitation[]) => {
  const related = invitations.filter((invitation) => invitation.mediaId === organizationId);
  if (related.some((invitation) => invitation.accessStatus === "active")) {
    return { label: "Active", color: "#166534", background: "#dcfce7" };
  }
  if (related.some((invitation) => invitation.invitationStatus === "invited")) {
    return { label: "Invitée", color: "#92400e", background: "#fef3c7" };
  }
  if (related.some((invitation) => invitation.invitationStatus === "accepted")) {
    return { label: "Accès inactif", color: "#991b1b", background: "#fee2e2" };
  }
  return { label: "Sans invitation", color: "#4b5563", background: "#f3f4f6" };
};

export function MediaInviteSection() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState("");
  const [email, setEmail] = useState("");
  const [submittingInvitation, setSubmittingInvitation] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [invitationSuccess, setInvitationSuccess] = useState<string | null>(null);
  const [linkMediaId, setLinkMediaId] = useState("");
  const [linkEmail, setLinkEmail] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<OrganizationType>("media_outlet");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [creationSuccess, setCreationSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const accessResponse = await fetch("/api/clerk/access", { credentials: "include", cache: "no-store" });
        if (!accessResponse.ok) return;
        const accessPayload = (await accessResponse.json()) as { permissions?: { isAdmin?: boolean; isActive?: boolean } };
        const allowed = Boolean(accessPayload.permissions?.isAdmin && accessPayload.permissions?.isActive);
        if (!active) return;
        setIsAdmin(allowed);
        if (!allowed) return;

        const response = await fetch("/api/admin/media-organizations", { credentials: "include", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as {
          organizations?: Organization[];
          invitations?: Invitation[];
          error?: string;
        } | null;
        if (!active) return;
        if (!response.ok || !Array.isArray(payload?.organizations)) {
          setLoadError(payload?.error || errorByStatus[response.status] || "Impossible de charger les organisations Média.");
          return;
        }
        setOrganizations(payload.organizations);
        setInvitations(Array.isArray(payload.invitations) ? payload.invitations : []);
      } catch {
        if (active) setLoadError("Impossible de charger les organisations Média. Vérifiez votre connexion.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  if (loading) {
    return <p role="status" aria-live="polite" style={{ margin: 0, color: "#6b7280" }}>Chargement des accès médias…</p>;
  }
  if (!isAdmin) return null;

  const chooseOrganization = (organization: Organization) => {
    setSelectedMediaId(organization.id);
    setEmail(organization.contactEmail);
    setInvitationError(null);
    setInvitationSuccess(null);
  };

  const createOrganization = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreationError(null);
    setCreationSuccess(null);
    const normalizedName = name.trim();
    const normalizedEmail = contactEmail.trim().toLowerCase();
    const normalizedWebsite = website.trim();
    if (!normalizedName) return setCreationError("Saisissez le nom de l’organisation.");
    if (!emailPattern.test(normalizedEmail)) return setCreationError("Saisissez une adresse email valide.");

    setCreating(true);
    try {
      const response = await fetch("/api/admin/media-organizations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalizedName, type, contactEmail: normalizedEmail, ...(normalizedWebsite ? { website: normalizedWebsite } : {}) }),
      });
      const payload = (await response.json().catch(() => null)) as { organization?: Organization; error?: string } | null;
      if (!response.ok || !payload?.organization) {
        setCreationError(payload?.error || errorByStatus[response.status] || "L’organisation n’a pas pu être créée.");
        return;
      }
      const created = payload.organization;
      setOrganizations((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name, "fr")));
      chooseOrganization(created);
      setName("");
      setType("media_outlet");
      setContactEmail("");
      setWebsite("");
      setCreationSuccess(`${created.name} a été créée et sélectionnée.`);
    } catch {
      setCreationError("L’organisation n’a pas pu être créée. Vérifiez votre connexion.");
    } finally {
      setCreating(false);
    }
  };

  const sendInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInvitationError(null);
    setInvitationSuccess(null);
    const selected = organizations.find((organization) => organization.id === selectedMediaId);
    if (!selected || selected.status !== "active") return setInvitationError("Sélectionnez une organisation Média active.");
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail)) return setInvitationError("Saisissez une adresse email valide.");

    setSubmittingInvitation(true);
    try {
      const response = await fetch("/api/media/invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, mediaId: selected.id }),
      });
      const payload = (await response.json().catch(() => null)) as { invitationId?: string; error?: string } | null;
      if (!response.ok || !payload?.invitationId) {
        setInvitationError(payload?.error || errorByStatus[response.status] || "L’invitation n’a pas pu être envoyée.");
        return;
      }
      setInvitations((current) => [{ invitationId: payload.invitationId!, mediaId: selected.id, email: normalizedEmail, invitationStatus: "invited", accessStatus: null, createdAt: new Date().toISOString() }, ...current]);
      setInvitationSuccess(`Invitation envoyée à ${normalizedEmail} pour ${selected.name}.`);
    } catch {
      setInvitationError("L’invitation n’a pas pu être envoyée. Vérifiez votre connexion.");
    } finally {
      setSubmittingInvitation(false);
    }
  };

  const linkExistingAccess = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLinkError(null);
    setLinkSuccess(null);
    const selected = organizations.find((organization) => organization.id === linkMediaId);
    if (!selected || selected.status !== "active") return setLinkError("Sélectionnez une organisation Média active.");
    const normalizedEmail = linkEmail.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail)) return setLinkError("Saisissez une adresse email valide.");

    setLinking(true);
    try {
      const response = await fetch("/api/admin/media-organizations", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: selected.id, email: normalizedEmail }),
      });
      const payload = (await response.json().catch(() => null)) as {
        linkedAccess?: { email: string; mediaId: string };
        error?: string;
      } | null;
      if (!response.ok || !payload?.linkedAccess) {
        setLinkError(payload?.error || errorByStatus[response.status] || "L’accès Média n’a pas pu être rattaché.");
        return;
      }
      setLinkEmail("");
      setLinkSuccess(`Accès ${payload.linkedAccess.email} rattaché à ${selected.name}.`);
    } catch {
      setLinkError("L’accès Média n’a pas pu être rattaché. Vérifiez votre connexion.");
    } finally {
      setLinking(false);
    }
  };

  const unlinkedInvitations = invitations.filter((invitation) => invitation.mediaId === null);

  return (
    <Card style={{ padding: "1.15rem", display: "grid", gap: "1.25rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
      <div>
        <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "#6b7280" }}>ACCÈS MÉDIAS</p>
        <h2 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.2rem", color: "#111827" }}>Organisations et invitations</h2>
        <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.6 }}>Chaque invitation doit être rattachée à une organisation Média active.</p>
      </div>

      {loadError ? <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{loadError}</p> : null}

      <section aria-labelledby="media-organizations-title" style={{ display: "grid", gap: "0.75rem" }}>
        <h3 id="media-organizations-title" style={{ margin: 0, fontSize: "1rem" }}>Organisations existantes</h3>
        {organizations.length === 0 ? <p style={{ margin: 0, color: "#6b7280" }}>Aucune organisation Média enregistrée.</p> : (
          <div style={{ display: "grid", gap: "0.55rem" }}>
            {organizations.map((organization) => {
              const state = accessLabel(organization.id, invitations);
              const selectable = organization.status === "active";
              return (
                <label key={organization.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "0.75rem", alignItems: "center", padding: "0.75rem", border: selectedMediaId === organization.id ? "1px solid #111827" : "1px solid #e5e7eb", borderRadius: "8px", opacity: selectable ? 1 : 0.6 }}>
                  <input type="radio" name="mediaOrganization" value={organization.id} checked={selectedMediaId === organization.id} onChange={() => chooseOrganization(organization)} disabled={!selectable || submittingInvitation} />
                  <span><strong style={{ display: "block" }}>{organization.name}</strong><span style={{ color: "#6b7280", fontSize: "0.86rem" }}>{typeLabels[organization.type]} · {organization.contactEmail}{selectable ? "" : " · Organisation inactive"}</span></span>
                  <span style={{ borderRadius: "999px", padding: "0.25rem 0.55rem", fontSize: "0.78rem", fontWeight: 700, color: state.color, background: state.background }}>{state.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {unlinkedInvitations.length > 0 ? (
        <section aria-labelledby="unlinked-invitations-title" style={{ display: "grid", gap: "0.55rem" }}>
          <h3 id="unlinked-invitations-title" style={{ margin: 0, fontSize: "1rem" }}>Invitations historiques</h3>
          {unlinkedInvitations.map((invitation) => <div key={invitation.invitationId} style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", padding: "0.7rem 0", borderBottom: "1px solid #e5e7eb" }}><span>{invitation.email}</span><strong style={{ color: "#92400e", fontSize: "0.85rem" }}>Organisation non liée</strong></div>)}
        </section>
      ) : null}

      <form onSubmit={sendInvitation} style={{ display: "grid", gap: "0.7rem", paddingTop: "1rem", borderTop: "1px solid #e5e7eb" }} noValidate>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Envoyer une invitation</h3>
        <label style={{ ...fieldStyle, maxWidth: "420px" }}><span>Adresse email</span><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={submittingInvitation || !selectedMediaId} placeholder="prenom.nom@media.ch" style={inputStyle} /></label>
        {invitationError ? <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{invitationError}</p> : null}
        {invitationSuccess ? <p role="status" aria-live="polite" style={{ margin: 0, color: "#166534" }}>{invitationSuccess}</p> : null}
        <div><Button type="submit" disabled={submittingInvitation || !selectedMediaId}>{submittingInvitation ? "Envoi en cours…" : "Envoyer l’invitation"}</Button></div>
      </form>

      <form onSubmit={createOrganization} style={{ display: "grid", gap: "0.75rem", paddingTop: "1rem", borderTop: "1px solid #e5e7eb" }} noValidate>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Créer une organisation Média</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
          <label style={fieldStyle}><span>Nom</span><Input value={name} onChange={(event) => setName(event.target.value)} disabled={creating} style={inputStyle} /></label>
          <label style={fieldStyle}><span>Type</span><select value={type} onChange={(event) => setType(event.target.value as OrganizationType)} disabled={creating} style={selectStyle}>{typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label style={fieldStyle}><span>E-mail de contact</span><Input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} disabled={creating} style={inputStyle} /></label>
          <label style={fieldStyle}><span>Site web (facultatif)</span><Input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} disabled={creating} placeholder="https://" style={inputStyle} /></label>
        </div>
        {creationError ? <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{creationError}</p> : null}
        {creationSuccess ? <p role="status" aria-live="polite" style={{ margin: 0, color: "#166534" }}>{creationSuccess}</p> : null}
        <div><Button type="submit" disabled={creating}>{creating ? "Création en cours…" : "Créer l’organisation"}</Button></div>
      </form>

      <form onSubmit={linkExistingAccess} style={{ display: "grid", gap: "0.75rem", paddingTop: "1rem", borderTop: "1px solid #e5e7eb" }} noValidate>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Rattacher un accès existant</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
          <label style={fieldStyle}>
            <span>Organisation Média</span>
            <select value={linkMediaId} onChange={(event) => setLinkMediaId(event.target.value)} disabled={linking} style={selectStyle}>
              <option value="">Sélectionner une organisation</option>
              {organizations.filter((organization) => organization.status === "active").map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}><span>E-mail de l’accès existant</span><Input type="email" value={linkEmail} onChange={(event) => setLinkEmail(event.target.value)} disabled={linking} placeholder="prenom.nom@media.ch" style={inputStyle} /></label>
        </div>
        {linkError ? <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{linkError}</p> : null}
        {linkSuccess ? <p role="status" aria-live="polite" style={{ margin: 0, color: "#166534" }}>{linkSuccess}</p> : null}
        <div><Button type="submit" disabled={linking}>{linking ? "Rattachement en cours…" : "Rattacher l’accès"}</Button></div>
      </form>
    </Card>
  );
}