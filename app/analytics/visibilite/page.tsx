"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, Search } from "lucide-react";
import type { Athlete, AthletesResponse } from "@/types/athlete";
import {
  kliqueVisibilityFormats,
  kliqueVisibilityNetworks,
  type KliqueVisibilityFormat,
  type KliqueVisibilityHistoryEntry,
  type KliqueVisibilityHistoryScope,
  type KliqueVisibilityNetwork,
  type KliqueVisibilityPublication,
  type KliqueVisibilityRegistryTotals,
  type KliqueVisibilityTrackingSettings,
} from "@/lib/klique-visibility";

type OverviewPayload = {
  trackingSettings: KliqueVisibilityTrackingSettings | null;
  publications: KliqueVisibilityPublication[];
  historyEntries: KliqueVisibilityHistoryEntry[];
  totals: KliqueVisibilityRegistryTotals;
  error?: string;
};

const formatLabels: Record<KliqueVisibilityFormat, string> = {
  photo: "Photo",
  video: "Vidéo",
  carousel: "Carrousel",
  story: "Story",
  reel: "Reel",
  article: "Article",
  live: "Live",
  other: "Autre",
};

const networkLabels: Record<KliqueVisibilityNetwork, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  website: "Site web",
  other: "Autre",
};

const dateFormatter = new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
};

// Styles alignes sur les ecrans Admin existants (cartes CRM, palette claire #fff/#ececec/#7a7a7a).
const fieldsGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "14px" };
const fieldWrapStyle: CSSProperties = { display: "grid", gap: "6px" };
const fieldLabelStyle: CSSProperties = { color: "#7a7a7a", fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" };
const controlStyle: CSSProperties = { height: 40, border: "1px solid #dfdfdf", borderRadius: 10, background: "#ffffff", color: "#2f2f2f", padding: "0 12px", fontSize: "0.9rem", width: "100%" };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#1f1f1f" };
const sectionHintStyle: CSSProperties = { margin: "4px 0 0", color: "#7a7a7a", fontSize: "0.88rem", maxWidth: "70ch" };
const primaryButtonStyle: CSSProperties = { height: 42, border: 0, borderRadius: 999, padding: "0 20px", background: "#ffd54a", color: "#171717", fontWeight: 600, whiteSpace: "nowrap" };
const disabledPrimaryButtonStyle: CSSProperties = { ...primaryButtonStyle, background: "#f2f2f2", color: "#a3a3a3", cursor: "not-allowed" };
const secondaryButtonStyle: CSSProperties = { height: 34, border: "1px solid #dfdfdf", borderRadius: 999, padding: "0 14px", background: "#ffffff", color: "#2f2f2f", fontWeight: 600, fontSize: "0.82rem", whiteSpace: "nowrap" };
const dangerButtonStyle: CSSProperties = { ...secondaryButtonStyle, border: "1px solid #f3c6c6", color: "#b91c1c" };
const disabledSecondaryButtonStyle: CSSProperties = { ...secondaryButtonStyle, color: "#c2c2c2", cursor: "not-allowed" };
const chipStyle: CSSProperties = { display: "inline-flex", alignItems: "center", height: 24, borderRadius: 999, padding: "0 10px", fontSize: "0.72rem", fontWeight: 600, background: "#f2f2f2", color: "#666666" };
const errorTextStyle: CSSProperties = { margin: 0, color: "#b91c1c", fontSize: "0.88rem" };
const warningBannerStyle: CSSProperties = { border: "1px solid #f2e3a4", borderRadius: 14, background: "#fff9e8", padding: "10px 14px", color: "#6d5600", fontSize: "0.88rem" };
const listRowStyle: CSSProperties = { background: "#ffffff", border: "1px solid #f1f1f1", borderRadius: 14, padding: "12px 14px", display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", justifyContent: "space-between" };

export default function KliqueVisibilityAdminPage() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);

  const [trackingStartDateInput, setTrackingStartDateInput] = useState("");
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  const [publicationFormat, setPublicationFormat] = useState<KliqueVisibilityFormat>("photo");
  const [publicationNetwork, setPublicationNetwork] = useState<KliqueVisibilityNetwork>("instagram");
  const [publicationDate, setPublicationDate] = useState("");
  const [publicationLink, setPublicationLink] = useState("");
  const [publicationAthleteIds, setPublicationAthleteIds] = useState<string[]>([]);
  const [publicationAthleteQuery, setPublicationAthleteQuery] = useState("");
  const [publicationSaving, setPublicationSaving] = useState(false);
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const [editingPublicationId, setEditingPublicationId] = useState<string | null>(null);
  const [deletingPublicationId, setDeletingPublicationId] = useState<string | null>(null);

  const [historyScope, setHistoryScope] = useState<KliqueVisibilityHistoryScope>("global");
  const [historyAthleteId, setHistoryAthleteId] = useState("");
  const [historyPeriodStart, setHistoryPeriodStart] = useState("");
  const [historyPeriodEnd, setHistoryPeriodEnd] = useState("");
  const [historyFormat, setHistoryFormat] = useState<KliqueVisibilityFormat>("photo");
  const [historyNetwork, setHistoryNetwork] = useState<KliqueVisibilityNetwork>("instagram");
  const [historyQuantity, setHistoryQuantity] = useState("");
  const [historySaving, setHistorySaving] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editingHistoryEntryId, setEditingHistoryEntryId] = useState<string | null>(null);
  const [deletingHistoryEntryId, setDeletingHistoryEntryId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [overviewResponse, athletesResponse] = await Promise.all([
          fetch("/api/admin/klique-visibility", { credentials: "include", cache: "no-store" }),
          fetch("/api/athletes", { credentials: "include", cache: "no-store" }),
        ]);
        const overviewPayload = (await overviewResponse.json().catch(() => null)) as OverviewPayload | null;
        if (!overviewResponse.ok) throw new Error(overviewPayload?.error || "Impossible de charger le registre de visibilité.");
        const athletesPayload = (await athletesResponse.json().catch(() => null)) as AthletesResponse | null;
        if (active) {
          setOverview(overviewPayload);
          setAthletes(athletesPayload?.athletes ?? []);
          if (overviewPayload?.trackingSettings) {
            setTrackingStartDateInput(overviewPayload.trackingSettings.trackingStartDate);
          }
        }
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Impossible de charger le registre de visibilité.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const athleteNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const athlete of athletes) map[athlete.key] = athlete.name;
    return map;
  }, [athletes]);

  const resolveAthleteLabel = (athleteId: string) => athleteNameById[athleteId] ?? athleteId;

  const filteredAthletesForPublication = useMemo(() => {
    const query = publicationAthleteQuery.trim().toLowerCase();
    if (!query) return athletes;
    return athletes.filter((athlete) => athlete.name.toLowerCase().includes(query));
  }, [athletes, publicationAthleteQuery]);

  const trackingLocked = Boolean(
    overview?.trackingSettings
    && ((overview.publications.length > 0) || (overview.historyEntries.length > 0)),
  );

  const refreshOverview = async () => {
    const response = await fetch("/api/admin/klique-visibility", { credentials: "include", cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as OverviewPayload | null;
    if (response.ok && payload) setOverview(payload);
  };

  const handleSaveTrackingStartDate = async () => {
    setTrackingError(null);
    setTrackingSaving(true);
    try {
      const response = await fetch("/api/admin/klique-visibility", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_tracking_start_date", trackingStartDate: trackingStartDateInput }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Impossible d’enregistrer la date de début de suivi.");
      await refreshOverview();
    } catch (error) {
      setTrackingError(error instanceof Error ? error.message : "Impossible d’enregistrer la date de début de suivi.");
    } finally {
      setTrackingSaving(false);
    }
  };

  const toggleAthleteId = (athleteId: string) => {
    setPublicationAthleteIds((current) => (
      current.includes(athleteId) ? current.filter((id) => id !== athleteId) : [...current, athleteId]
    ));
  };

  const resetPublicationForm = () => {
    setEditingPublicationId(null);
    setPublicationDate("");
    setPublicationLink("");
    setPublicationAthleteIds([]);
    setPublicationError(null);
  };

  const startEditPublication = (publication: KliqueVisibilityPublication) => {
    setEditingPublicationId(publication.id);
    setPublicationFormat(publication.format);
    setPublicationNetwork(publication.network);
    setPublicationDate(publication.publishedAt);
    setPublicationLink(publication.link ?? "");
    setPublicationAthleteIds(publication.athleteIds);
    setPublicationError(null);
  };

  const handleSubmitPublication = async () => {
    setPublicationError(null);
    setPublicationSaving(true);
    try {
      const response = await fetch("/api/admin/klique-visibility", {
        method: editingPublicationId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingPublicationId ? "update_publication" : "create_publication",
          ...(editingPublicationId ? { publicationId: editingPublicationId } : {}),
          publication: {
            format: publicationFormat,
            network: publicationNetwork,
            publishedAt: publicationDate,
            link: publicationLink || null,
            athleteIds: publicationAthleteIds,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Impossible d’enregistrer la publication.");
      resetPublicationForm();
      await refreshOverview();
    } catch (error) {
      setPublicationError(error instanceof Error ? error.message : "Impossible d’enregistrer la publication.");
    } finally {
      setPublicationSaving(false);
    }
  };

  const handleDeletePublication = async (publicationId: string) => {
    if (!window.confirm("Supprimer définitivement cette publication ?")) return;
    setDeletingPublicationId(publicationId);
    try {
      const response = await fetch("/api/admin/klique-visibility", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_publication", publicationId }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Impossible de supprimer la publication.");
      if (editingPublicationId === publicationId) resetPublicationForm();
      await refreshOverview();
    } catch (error) {
      setPublicationError(error instanceof Error ? error.message : "Impossible de supprimer la publication.");
    } finally {
      setDeletingPublicationId(null);
    }
  };

  const resetHistoryForm = () => {
    setEditingHistoryEntryId(null);
    setHistoryPeriodStart("");
    setHistoryPeriodEnd("");
    setHistoryQuantity("");
    setHistoryAthleteId("");
    setHistoryError(null);
  };

  const startEditHistoryEntry = (entry: KliqueVisibilityHistoryEntry) => {
    setEditingHistoryEntryId(entry.id);
    setHistoryScope(entry.scope);
    setHistoryAthleteId(entry.athleteId ?? "");
    setHistoryPeriodStart(entry.periodStart);
    setHistoryPeriodEnd(entry.periodEnd);
    setHistoryFormat(entry.format);
    setHistoryNetwork(entry.network);
    setHistoryQuantity(String(entry.quantity));
    setHistoryError(null);
  };

  const handleSubmitHistoryEntry = async () => {
    setHistoryError(null);
    setHistorySaving(true);
    try {
      const response = await fetch("/api/admin/klique-visibility", {
        method: editingHistoryEntryId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingHistoryEntryId ? "update_history_entry" : "create_history_entry",
          ...(editingHistoryEntryId ? { historyEntryId: editingHistoryEntryId } : {}),
          historyEntry: {
            scope: historyScope,
            periodStart: historyPeriodStart,
            periodEnd: historyPeriodEnd,
            format: historyFormat,
            network: historyNetwork,
            athleteId: historyScope === "athlete" ? historyAthleteId : null,
            quantity: Number(historyQuantity),
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Impossible d’enregistrer la reprise historique.");
      resetHistoryForm();
      await refreshOverview();
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Impossible d’enregistrer la reprise historique.");
    } finally {
      setHistorySaving(false);
    }
  };

  const handleDeleteHistoryEntry = async (historyEntryId: string) => {
    if (!window.confirm("Supprimer définitivement cette reprise historique ?")) return;
    setDeletingHistoryEntryId(historyEntryId);
    try {
      const response = await fetch("/api/admin/klique-visibility", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_history_entry", historyEntryId }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Impossible de supprimer la reprise historique.");
      if (editingHistoryEntryId === historyEntryId) resetHistoryForm();
      await refreshOverview();
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Impossible de supprimer la reprise historique.");
    } finally {
      setDeletingHistoryEntryId(null);
    }
  };

  if (loading) {
    return <section style={{ padding: "24px" }} className="text-sm" aria-live="polite" aria-busy="true"><p style={{ color: "#7a7a7a" }}>Chargement du registre de visibilité...</p></section>;
  }

  if (errorMessage || !overview) {
    return (
      <section style={{ padding: "24px" }} role="alert">
        <h2 style={{ margin: 0, color: "#1f1f1f" }}>Impossible de charger le registre de visibilité</h2>
        <p style={{ marginTop: 8, color: "#7a7a7a" }}>{errorMessage}</p>
      </section>
    );
  }

  const { totals } = overview;
  const perAthleteRows = Object.entries(totals.perAthlete).sort((a, b) => b[1].combined - a[1].combined);

  return (
    <section style={{ maxWidth: "980px", margin: "0 auto", padding: "24px", display: "grid", gap: "18px" }}>
      <Link href="/analytics" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#7a7a7a", fontSize: "0.85rem", width: "fit-content" }}>
        <ArrowLeft size={16} aria-hidden /> Analytics
      </Link>

      <header className="crm-people-header">
        <div>
          <h1>Visibilité KLIQUE</h1>
          <p>Registre de visibilité des athlètes : publications suivies au jour le jour et reprise de l’historique avant le début du suivi.</p>
        </div>
      </header>

      <div className="crm-partners-info-banner">
        <strong>Saisie manuelle</strong>
        <p>Cet enregistrement est entièrement manuel. Il n’est connecté à aucun réseau social et ne consomme aucun droit KLIQUE.</p>
      </div>

      <section className="crm-actions-bar">
        <h2 style={sectionTitleStyle}>Configuration initiale du suivi</h2>
        <p style={sectionHintStyle}>
          La date de début du suivi sépare les publications suivies en détail (à partir de cette date) de l’historique repris manuellement (avant cette date).
          {trackingLocked ? " Elle ne peut plus être modifiée : au moins une entrée existe déjà." : ""}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "14px" }}>
          <label style={{ ...fieldWrapStyle, minWidth: 190 }}>
            <span style={fieldLabelStyle}>Date de début du suivi</span>
            <input
              type="date"
              style={controlStyle}
              value={trackingStartDateInput}
              disabled={trackingLocked}
              onChange={(event) => setTrackingStartDateInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            style={trackingLocked || trackingSaving || !trackingStartDateInput ? disabledPrimaryButtonStyle : primaryButtonStyle}
            disabled={trackingLocked || trackingSaving || !trackingStartDateInput}
            onClick={() => void handleSaveTrackingStartDate()}
          >
            {trackingSaving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
        {trackingError ? <p style={errorTextStyle}>{trackingError}</p> : null}
      </section>

      <section className="crm-actions-bar">
        <h2 style={sectionTitleStyle}>{editingPublicationId ? "Modifier la publication" : "Ajouter une publication"}</h2>
        <p style={sectionHintStyle}>Une publication réelle, datée à partir du début du suivi, format et réseau, avec un lien facultatif et un ou plusieurs athlètes concernés.</p>
        {!overview.trackingSettings ? (
          <p style={warningBannerStyle}>Configurez d’abord la date de début du suivi ci-dessus.</p>
        ) : (
          <>
            <div style={fieldsGridStyle}>
              <label style={fieldWrapStyle}>
                <span style={fieldLabelStyle}>Format</span>
                <select style={controlStyle} value={publicationFormat} onChange={(event) => setPublicationFormat(event.target.value as KliqueVisibilityFormat)}>
                  {kliqueVisibilityFormats.map((format) => <option key={format} value={format}>{formatLabels[format]}</option>)}
                </select>
              </label>
              <label style={fieldWrapStyle}>
                <span style={fieldLabelStyle}>Réseau</span>
                <select style={controlStyle} value={publicationNetwork} onChange={(event) => setPublicationNetwork(event.target.value as KliqueVisibilityNetwork)}>
                  {kliqueVisibilityNetworks.map((network) => <option key={network} value={network}>{networkLabels[network]}</option>)}
                </select>
              </label>
              <label style={fieldWrapStyle}>
                <span style={fieldLabelStyle}>Date de publication</span>
                <input type="date" style={controlStyle} value={publicationDate} onChange={(event) => setPublicationDate(event.target.value)} />
              </label>
              <label style={fieldWrapStyle}>
                <span style={fieldLabelStyle}>Lien (facultatif)</span>
                <input type="url" placeholder="https://..." style={controlStyle} value={publicationLink} onChange={(event) => setPublicationLink(event.target.value)} />
              </label>
            </div>

            <div style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Athlètes concernés ({publicationAthleteIds.length} sélectionné{publicationAthleteIds.length > 1 ? "s" : ""})</span>
              <label className="crm-search" htmlFor="visibility-athlete-search">
                <Search size={16} aria-hidden />
                <input
                  id="visibility-athlete-search"
                  type="search"
                  placeholder="Rechercher un athlète..."
                  value={publicationAthleteQuery}
                  onChange={(event) => setPublicationAthleteQuery(event.target.value)}
                />
              </label>
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #ececec", borderRadius: 14, padding: "6px" }}>
                {filteredAthletesForPublication.length === 0 ? (
                  <p style={{ margin: "8px", color: "#7a7a7a", fontSize: "0.85rem" }}>Aucun athlète ne correspond à la recherche.</p>
                ) : filteredAthletesForPublication.map((athlete) => (
                  <label
                    key={athlete.key}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, fontSize: "0.9rem", color: "#2f2f2f" }}
                  >
                    <input
                      type="checkbox"
                      checked={publicationAthleteIds.includes(athlete.key)}
                      onChange={() => toggleAthleteId(athlete.key)}
                    />
                    {athlete.name}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                style={publicationSaving || !publicationDate || publicationAthleteIds.length === 0 ? disabledPrimaryButtonStyle : primaryButtonStyle}
                disabled={publicationSaving || !publicationDate || publicationAthleteIds.length === 0}
                onClick={() => void handleSubmitPublication()}
              >
                {publicationSaving ? "Enregistrement..." : editingPublicationId ? "Enregistrer les modifications" : "Ajouter la publication"}
              </button>
              {editingPublicationId ? (
                <button type="button" style={secondaryButtonStyle} disabled={publicationSaving} onClick={resetPublicationForm}>
                  Annuler
                </button>
              ) : null}
            </div>
            {publicationError ? <p style={errorTextStyle}>{publicationError}</p> : null}
          </>
        )}
      </section>

      <section className="crm-actions-bar">
        <h2 style={sectionTitleStyle}>{editingHistoryEntryId ? "Modifier la reprise historique" : "Saisir l’historique"}</h2>
        <p style={sectionHintStyle}>
          Reprise d’une période antérieure au début du suivi : une quantité globale (sans lien à un athlète précis) ou une quantité pour un athlète donné — jamais des publications individuelles.
        </p>
        {!overview.trackingSettings ? (
          <p style={warningBannerStyle}>Configurez d’abord la date de début du suivi ci-dessus.</p>
        ) : (
          <>
            <div style={fieldsGridStyle}>
              <label style={fieldWrapStyle}>
                <span style={fieldLabelStyle}>Portée</span>
                <select style={controlStyle} value={historyScope} onChange={(event) => setHistoryScope(event.target.value as KliqueVisibilityHistoryScope)}>
                  <option value="global">Globale (sans athlète précis)</option>
                  <option value="athlete">Par athlète</option>
                </select>
              </label>
              {historyScope === "athlete" ? (
                <label style={fieldWrapStyle}>
                  <span style={fieldLabelStyle}>Athlète</span>
                  <select style={controlStyle} value={historyAthleteId} onChange={(event) => setHistoryAthleteId(event.target.value)}>
                    <option value="">Sélectionner...</option>
                    {athletes.map((athlete) => <option key={athlete.key} value={athlete.key}>{athlete.name}</option>)}
                  </select>
                </label>
              ) : null}
              <label style={fieldWrapStyle}>
                <span style={fieldLabelStyle}>Début de période</span>
                <input type="date" style={controlStyle} value={historyPeriodStart} onChange={(event) => setHistoryPeriodStart(event.target.value)} />
              </label>
              <label style={fieldWrapStyle}>
                <span style={fieldLabelStyle}>Fin de période</span>
                <input type="date" style={controlStyle} value={historyPeriodEnd} onChange={(event) => setHistoryPeriodEnd(event.target.value)} />
              </label>
              <label style={fieldWrapStyle}>
                <span style={fieldLabelStyle}>Format</span>
                <select style={controlStyle} value={historyFormat} onChange={(event) => setHistoryFormat(event.target.value as KliqueVisibilityFormat)}>
                  {kliqueVisibilityFormats.map((format) => <option key={format} value={format}>{formatLabels[format]}</option>)}
                </select>
              </label>
              <label style={fieldWrapStyle}>
                <span style={fieldLabelStyle}>Réseau</span>
                <select style={controlStyle} value={historyNetwork} onChange={(event) => setHistoryNetwork(event.target.value as KliqueVisibilityNetwork)}>
                  {kliqueVisibilityNetworks.map((network) => <option key={network} value={network}>{networkLabels[network]}</option>)}
                </select>
              </label>
              <label style={fieldWrapStyle}>
                <span style={fieldLabelStyle}>Quantité</span>
                <input type="number" min={1} style={controlStyle} value={historyQuantity} onChange={(event) => setHistoryQuantity(event.target.value)} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                style={historySaving || !historyPeriodStart || !historyPeriodEnd || !historyQuantity || (historyScope === "athlete" && !historyAthleteId) ? disabledPrimaryButtonStyle : primaryButtonStyle}
                disabled={historySaving || !historyPeriodStart || !historyPeriodEnd || !historyQuantity || (historyScope === "athlete" && !historyAthleteId)}
                onClick={() => void handleSubmitHistoryEntry()}
              >
                {historySaving ? "Enregistrement..." : editingHistoryEntryId ? "Enregistrer les modifications" : "Ajouter la reprise historique"}
              </button>
              {editingHistoryEntryId ? (
                <button type="button" style={secondaryButtonStyle} disabled={historySaving} onClick={resetHistoryForm}>
                  Annuler
                </button>
              ) : null}
            </div>
            {historyError ? <p style={errorTextStyle}>{historyError}</p> : null}
          </>
        )}
      </section>

      <section className="crm-actions-bar">
        <h2 style={sectionTitleStyle}>Compteurs</h2>
        <div className="crm-person-kpi-grid">
          <div className="crm-person-kpi-item">
            <small>Suivi détaillé</small>
            <strong>{totals.totalPublications}</strong>
          </div>
          <div className="crm-person-kpi-item">
            <small>Historique</small>
            <strong>{totals.totalHistorical}</strong>
          </div>
          <div className="crm-person-kpi-item">
            <small>Total combiné</small>
            <strong>{totals.combinedTotal}</strong>
          </div>
        </div>
        {perAthleteRows.length > 0 ? (
          <ul style={{ margin: 0, padding: "8px", listStyle: "none", display: "grid", gap: "8px" }}>
            {perAthleteRows.map(([athleteId, row]) => (
              <li key={athleteId} style={listRowStyle}>
                <strong style={{ color: "#1f1f1f", fontSize: "0.9rem" }}>{resolveAthleteLabel(athleteId)}</strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <span style={chipStyle}>Suivi détaillé : {row.publications}</span>
                  <span style={chipStyle}>Historique : {row.historical}</span>
                  <span style={chipStyle}>Combiné : {row.combined}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="crm-list-shell">
        <div style={{ padding: "16px 18px 4px" }}><h2 style={sectionTitleStyle}>Publications suivies</h2></div>
        {overview.publications.length === 0 ? (
          <p style={{ margin: "0 18px 16px", color: "#7a7a7a", fontSize: "0.88rem" }}>Aucune publication enregistrée.</p>
        ) : (
          <ul style={{ margin: 0, padding: "8px", listStyle: "none", display: "grid", gap: "8px" }}>
            {overview.publications.map((publication) => (
              <li key={publication.id} style={listRowStyle}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#1f1f1f", fontWeight: 600, fontSize: "0.9rem" }}>{formatDate(publication.publishedAt)}</span>
                  <span style={chipStyle}>{formatLabels[publication.format]}</span>
                  <span style={chipStyle}>{networkLabels[publication.network]}</span>
                  <span style={{ color: "#7a7a7a", fontSize: "0.85rem" }}>{publication.athleteIds.map(resolveAthleteLabel).join(", ")}</span>
                  {publication.link ? <a href={publication.link} target="_blank" rel="noreferrer" style={{ color: "#8b6500", fontSize: "0.85rem" }}>Voir le lien</a> : null}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" style={secondaryButtonStyle} onClick={() => startEditPublication(publication)}>Modifier</button>
                  <button
                    type="button"
                    style={deletingPublicationId === publication.id ? disabledSecondaryButtonStyle : dangerButtonStyle}
                    disabled={deletingPublicationId === publication.id}
                    onClick={() => void handleDeletePublication(publication.id)}
                  >
                    {deletingPublicationId === publication.id ? "Suppression..." : "Supprimer"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="crm-list-shell">
        <div style={{ padding: "16px 18px 4px" }}><h2 style={sectionTitleStyle}>Historique repris</h2></div>
        {overview.historyEntries.length === 0 ? (
          <p style={{ margin: "0 18px 16px", color: "#7a7a7a", fontSize: "0.88rem" }}>Aucune reprise historique enregistrée.</p>
        ) : (
          <ul style={{ margin: 0, padding: "8px", listStyle: "none", display: "grid", gap: "8px" }}>
            {overview.historyEntries.map((entry) => (
              <li key={entry.id} style={listRowStyle}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#1f1f1f", fontWeight: 600, fontSize: "0.9rem" }}>{formatDate(entry.periodStart)} → {formatDate(entry.periodEnd)}</span>
                  <span style={chipStyle}>{formatLabels[entry.format]}</span>
                  <span style={chipStyle}>{networkLabels[entry.network]}</span>
                  <span style={{ color: "#7a7a7a", fontSize: "0.85rem" }}>{entry.scope === "global" ? "Global" : resolveAthleteLabel(entry.athleteId ?? "")}</span>
                  <span style={chipStyle}>Quantité : {entry.quantity}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" style={secondaryButtonStyle} onClick={() => startEditHistoryEntry(entry)}>Modifier</button>
                  <button
                    type="button"
                    style={deletingHistoryEntryId === entry.id ? disabledSecondaryButtonStyle : dangerButtonStyle}
                    disabled={deletingHistoryEntryId === entry.id}
                    onClick={() => void handleDeleteHistoryEntry(entry.id)}
                  >
                    {deletingHistoryEntryId === entry.id ? "Suppression..." : "Supprimer"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
