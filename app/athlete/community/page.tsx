"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Partner } from "@/types/partner";

type CommunityTab = "Fil" | "Opportunités" | "Avantages" | "Ressources";

type FeedItem = {
  id: string;
  authorName: string;
  content: string;
  title?: string | null;
  createdAt?: string;
};

type OpportunityItem = {
  id: string;
  title: string;
  type: string;
  organization: string;
  date: string;
  deadline: string;
  description: string;
  status: string;
};

type BenefitItem = {
  id: string;
  partner: string;
  title: string;
  description: string;
};

type ResourceItem = {
  id: string;
  title: string;
  category: string;
  author: string;
  description: string;
};

const tabs: CommunityTab[] = ["Fil", "Opportunités", "Avantages", "Ressources"];

// Une reponse redirigee renvoie du HTML avec un statut 200 : le parsing doit rester isole par onglet.
const readJson = async <T,>(response: Response, fallback: T): Promise<T | null> => {
  if (!response.ok) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const formatFeedDate = (value: unknown): string => {
  const raw = normalize(value);
  if (!raw) return "Date inconnue";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const buildBenefits = (partners: Partner[]): BenefitItem[] => {
  const seen = new Set<string>();

  return partners
    .map((partner) => {
      const partnerName = normalize(partner.name);
      const offer = normalize(partner.memberOffer) || normalize(partner.benefits) || normalize(partner.services);
      const description = normalize(partner.description) || normalize(partner.notes) || "";

      if (!partnerName || !offer) return null;

      const signature = `${partnerName}|${offer}|${description}`.toLowerCase();
      if (seen.has(signature)) return null;
      seen.add(signature);

      return {
        id: `benefit-${partner.id || signature}`,
        partner: partnerName,
        title: offer,
        description,
      } satisfies BenefitItem;
    })
    .filter((item): item is BenefitItem => Boolean(item));
};

export default function AthleteCommunityPage() {
  const [activeTab, setActiveTab] = useState<CommunityTab>("Fil");
  const [loading, setLoading] = useState(true);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [benefits, setBenefits] = useState<BenefitItem[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [tabErrors, setTabErrors] = useState<Record<CommunityTab, string | null>>({
    Fil: null,
    "Opportunités": null,
    Avantages: null,
    Ressources: null,
  });

  useEffect(() => {
    let active = true;

    const loadCommunity = async () => {
      setLoading(true);

      const [feedResult, opportunitiesResult, partnersResult, resourcesResult] = await Promise.allSettled([
        fetch("/api/hub-community", { credentials: "include", cache: "no-store" }),
        fetch("/api/hub-opportunities", { credentials: "include", cache: "no-store" }),
        fetch("/api/partners", { credentials: "include", cache: "no-store" }),
        fetch("/api/hub-resources", { credentials: "include", cache: "no-store" }),
      ]);

      if (!active) return;

      const feedPayload =
        feedResult.status === "fulfilled"
          ? await readJson(feedResult.value, { publications: [] as Array<Record<string, unknown>> })
          : null;

      const opportunitiesPayload =
        opportunitiesResult.status === "fulfilled"
          ? await readJson(opportunitiesResult.value, { opportunities: [] as Array<Record<string, unknown>> })
          : null;

      const partnersPayload =
        partnersResult.status === "fulfilled"
          ? await readJson(partnersResult.value, { partners: [] as Partner[] })
          : null;

      const resourcesPayload =
        resourcesResult.status === "fulfilled"
          ? await readJson(resourcesResult.value, { resources: [] as Array<Record<string, unknown>> })
          : null;

      if (!active) return;

      setTabErrors({
        Fil: feedPayload ? null : "Le fil de la communauté n’a pas pu être chargé.",
        "Opportunités": opportunitiesPayload ? null : "Les opportunités n’ont pas pu être chargées.",
        Avantages: partnersPayload ? null : "Les avantages n’ont pas pu être chargés.",
        Ressources: resourcesPayload ? null : "Les ressources n’ont pas pu être chargées.",
      });

      setFeedItems(
        (feedPayload?.publications ?? []).map((item) => ({
          id: normalize(item.id),
          authorName: normalize(item.authorDisplayName) || "KLIQUE",
          title: normalize(item.title) || null,
          content: normalize(item.content),
          createdAt: normalize(item.createdAt),
        }))
        .filter((item) => item.id && item.content)
      );

      setOpportunities(
        (opportunitiesPayload?.opportunities ?? []).map((item) => ({
          id: normalize(item.id),
          title: normalize(item.title),
          type: normalize(item.type) || "Autre",
          organization: normalize(item.organization),
          date: normalize(item.date),
          deadline: normalize(item.deadline),
          description: normalize(item.description),
          status: normalize(item.status),
        }))
        .filter((item) => item.id && item.title)
      );

      setBenefits(buildBenefits(partnersPayload?.partners ?? []));

      setResources(
        (resourcesPayload?.resources ?? [])
          .filter((item) => normalize(item.status).toLowerCase() === "published")
          .map((item) => ({
            id: normalize(item.id),
            title: normalize(item.title),
            category: normalize(item.category) || "Autre",
            author: normalize(item.author) || "KLIQUE",
            description: normalize(item.description),
          }))
          .filter((item) => item.id && item.title)
      );

      setLoading(false);
    };

    void loadCommunity();

    return () => {
      active = false;
    };
  }, []);

  const activeCount = useMemo(() => {
    if (activeTab === "Fil") return feedItems.length;
    if (activeTab === "Opportunités") return opportunities.length;
    if (activeTab === "Avantages") return benefits.length;
    return resources.length;
  }, [activeTab, benefits.length, feedItems.length, opportunities.length, resources.length]);

  return (
    <main style={{ padding: "1.25rem", maxWidth: "1120px", margin: "0 auto", display: "grid", gap: "1rem" }}>
      <header style={{ display: "grid", gap: "0.35rem" }}>
        <p style={{ margin: 0, fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", fontWeight: 700 }}>
          Communauté
        </p>
        <h1 style={{ margin: 0, fontSize: "1.8rem", fontWeight: 800, color: "#111827" }}>La Communauté KLIQUE</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>
          Retrouvez les échanges, opportunités, avantages et ressources accessibles aux membres.
        </p>
      </header>

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        {tabs.map((tab) => {
          const active = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                borderRadius: "999px",
                border: active ? "1px solid #111827" : "1px solid #d1d5db",
                background: active ? "#111827" : "#ffffff",
                color: active ? "#ffffff" : "#111827",
                padding: "0.48rem 0.9rem",
                fontWeight: 700,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: "16px", background: "#fff", padding: "1rem", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
        {loading ? (
          <p style={{ margin: 0, color: "#6b7280" }}>Chargement de la communauté…</p>
        ) : activeTab === "Fil" ? (
          tabErrors.Fil ? (
            <p style={{ margin: 0, color: "#b91c1c" }} role="alert">{tabErrors.Fil}</p>
          ) : feedItems.length === 0 ? (
            <p style={{ margin: 0, color: "#6b7280" }}>Aucune publication réelle n’est disponible pour le moment.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.8rem" }}>
              {feedItems.map((item) => (
                <article key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "0.85rem" }}>
                  <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>{item.authorName}</p>
                  <p style={{ margin: "0.2rem 0 0", color: "#6b7280", fontSize: "0.86rem" }}>{formatFeedDate(item.createdAt)}</p>
                  {item.title ? <p style={{ margin: "0.55rem 0 0", fontWeight: 700, color: "#111827" }}>{item.title}</p> : null}
                  <p style={{ margin: "0.4rem 0 0", color: "#374151", lineHeight: 1.65 }}>{item.content}</p>
                </article>
              ))}
            </div>
          )
        ) : activeTab === "Opportunités" ? (
          tabErrors["Opportunités"] ? (
            <p style={{ margin: 0, color: "#b91c1c" }} role="alert">{tabErrors["Opportunités"]}</p>
          ) : opportunities.length === 0 ? (
            <p style={{ margin: 0, color: "#6b7280" }}>Aucune opportunité réelle n’est disponible pour le moment.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.8rem" }}>
              {opportunities.map((item) => (
                <Link
                  key={item.id}
                  href={`/athlete/opportunities/${encodeURIComponent(item.id)}`}
                  style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "0.85rem", display: "block", textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
                    <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>{item.title}</p>
                    <span style={{ fontSize: "0.8rem", color: "#6b7280", fontWeight: 700 }}>{item.status || "Non renseigné"}</span>
                  </div>
                  <p style={{ margin: "0.3rem 0 0", color: "#4b5563" }}>{item.organization || "Organisation non renseignée"}</p>
                  <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.88rem" }}>
                    Type: {item.type || "Autre"} · Date: {item.date || "Non renseignée"} · Clôture: {item.deadline || "Non renseignée"}
                  </p>
                  {item.description ? <p style={{ margin: "0.45rem 0 0", color: "#374151", lineHeight: 1.6 }}>{item.description}</p> : null}
                </Link>
              ))}
            </div>
          )
        ) : activeTab === "Avantages" ? (
          tabErrors.Avantages ? (
            <p style={{ margin: 0, color: "#b91c1c" }} role="alert">{tabErrors.Avantages}</p>
          ) : benefits.length === 0 ? (
            <p style={{ margin: 0, color: "#6b7280" }}>Aucun avantage réel n’est disponible pour le moment.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.8rem" }}>
              {benefits.map((item) => (
                <article key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "0.85rem" }}>
                  <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>{item.partner}</p>
                  <p style={{ margin: "0.3rem 0 0", color: "#111827", fontWeight: 700 }}>{item.title}</p>
                  {item.description ? <p style={{ margin: "0.35rem 0 0", color: "#4b5563", lineHeight: 1.6 }}>{item.description}</p> : null}
                </article>
              ))}
            </div>
          )
        ) : tabErrors.Ressources ? (
          <p style={{ margin: 0, color: "#b91c1c" }} role="alert">{tabErrors.Ressources}</p>
        ) : resources.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280" }}>Aucune ressource réelle n’est disponible pour le moment.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.8rem" }}>
            {resources.map((item) => (
              <article key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "0.85rem" }}>
                <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>{item.title}</p>
                <p style={{ margin: "0.28rem 0 0", color: "#6b7280", fontSize: "0.88rem" }}>
                  {item.category} · {item.author}
                </p>
                {item.description ? <p style={{ margin: "0.4rem 0 0", color: "#4b5563", lineHeight: 1.6 }}>{item.description}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {!loading ? (
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.86rem" }}>
          {activeCount} élément{activeCount > 1 ? "s" : ""} affiché{activeCount > 1 ? "s" : ""} dans l’onglet {activeTab.toLowerCase()}.
        </p>
      ) : null}
    </main>
  );
}
