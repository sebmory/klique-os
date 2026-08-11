import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getHubResourceById } from "@/lib/hub-resources/service";

type ResourceDetailPageProps = {
  params: Promise<{ resourceId: string }>;
};

const getResourceAccessUrl = (resource: { url: string | null; content: string }) => {
  const candidate = (resource.url ?? resource.content ?? "").trim();
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate)) return candidate;
  return null;
};

export default async function ResourceDetailPage({ params }: ResourceDetailPageProps) {
  const { resourceId } = await params;
  const requestHeaders = await headers();
  const request = new Request("http://localhost", {
    headers: requestHeaders,
  });
  const { userId } = await auth();
  const resource = await getHubResourceById(request, resourceId, userId ?? null);

  if (!resource) {
    notFound();
  }

  const accessUrl = getResourceAccessUrl(resource);
  const isEditorialResource = resource.type === "Article" || resource.type === "Guide" || resource.type === "Conseil";
  const isLinkResource = resource.type === "Lien";
  const isMediaResource = resource.type === "Vidéo" || resource.type === "Document";
  const displayContent = resource.content?.trim() || resource.description?.trim() || "Aucun contenu n’a encore été associé à cette ressource.";

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: "2rem 1rem 3rem" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", display: "grid", gap: "1rem" }}>
        <Link href="/hub#ressources" style={{ color: "#7c3aed", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          ← Retour aux Ressources
        </Link>

        <article style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "24px", boxShadow: "0 20px 45px rgba(15, 23, 42, 0.08)", padding: "clamp(1.2rem, 3vw, 2rem)", display: "grid", gap: "1.1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <span style={{ background: "#f5f3ff", color: "#6d28d9", borderRadius: "999px", padding: "0.4rem 0.8rem", fontSize: "0.82rem", fontWeight: 700 }}>
                {resource.category}
              </span>
              <span style={{ background: "#eff6ff", color: "#1d4ed8", borderRadius: "999px", padding: "0.4rem 0.8rem", fontSize: "0.82rem", fontWeight: 700 }}>
                {resource.type}
              </span>
            </div>
            <span style={{ color: resource.status === "published" ? "#047857" : "#b45309", background: resource.status === "published" ? "#ecfdf5" : "#fffbeb", borderRadius: "999px", padding: "0.4rem 0.8rem", fontSize: "0.82rem", fontWeight: 700 }}>
              {resource.status === "published" ? "Publié" : "Brouillon"}
            </span>
          </div>

          <div style={{ display: "grid", gap: "0.4rem" }}>
            <h1 style={{ margin: 0, fontSize: "clamp(1.35rem, 3vw, 2rem)", lineHeight: 1.2, color: "#111827" }}>{resource.title}</h1>
            <p style={{ margin: 0, color: "#4b5563", fontSize: "1.02rem", lineHeight: 1.7 }}>{resource.description}</p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", color: "#6b7280", fontSize: "0.95rem" }}>
            <span><strong style={{ color: "#111827" }}>Auteur :</strong> {resource.author}</span>
            <span><strong style={{ color: "#111827" }}>Date :</strong> {resource.date}</span>
          </div>

          {isEditorialResource ? (
            <div style={{ paddingTop: "0.4rem", color: "#111827", lineHeight: 1.9, whiteSpace: "pre-wrap", fontSize: "1rem" }}>
              {displayContent}
            </div>
          ) : null}

          {isLinkResource ? (
            <div style={{ display: "grid", gap: "0.8rem", paddingTop: "0.2rem" }}>
              <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.7 }}>
                Cette ressource pointe vers un lien externe. Vous pouvez l’ouvrir directement ci-dessous.
              </p>
              {accessUrl ? (
                <a href={accessUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "fit-content", padding: "0.8rem 1rem", background: "#111827", color: "#fff", borderRadius: "999px", textDecoration: "none", fontWeight: 700 }}>
                  Ouvrir le lien
                </a>
              ) : (
                <p style={{ margin: 0, color: "#6b7280" }}>Aucun lien externe n’a été défini pour cette ressource.</p>
              )}
            </div>
          ) : null}

          {isMediaResource ? (
            <div style={{ display: "grid", gap: "0.8rem", paddingTop: "0.2rem" }}>
              <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.7 }}>
                {resource.type === "Vidéo"
                  ? "Cette ressource est prévue pour un accès vidéo. Si une URL est associée, elle peut être ouverte directement."
                  : "Cette ressource est prévue pour un document. Si une URL ou un contenu associé est disponible, il peut être ouvert ci-dessous."}
              </p>
              {accessUrl ? (
                <a href={accessUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "fit-content", padding: "0.8rem 1rem", background: "#111827", color: "#fff", borderRadius: "999px", textDecoration: "none", fontWeight: 700 }}>
                  Ouvrir {resource.type === "Vidéo" ? "la vidéo" : "le document"}
                </a>
              ) : (
                <p style={{ margin: 0, color: "#6b7280" }}>Aucun accès direct n’est encore associé à cette ressource.</p>
              )}
            </div>
          ) : null}
        </article>
      </div>
    </main>
  );
}
