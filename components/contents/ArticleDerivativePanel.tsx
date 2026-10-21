"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Save, Sparkles } from "lucide-react";
import { ContentVariantRepositoryService } from "@/services/content-variants/repository";
import { stringifyStructuredVariation } from "@/services/content-variants/serializer";
import type { ContentVariant, PublicationStructuredContent } from "@/types/content-variant";

type ArticleDerivativePanelProps = {
  sourceDocumentId: string;
  sourceDocumentUpdatedAt: string;
  hasUnsavedArticleChanges: boolean;
};

type DerivativeFormat = "instagram" | "linkedin" | "newsletter";

type LoadResponse = {
  ok?: boolean;
  message?: string;
  sourceDocumentUpdatedAt?: string;
  creditCost?: number;
  creditBalance?: number | null;
  variants?: ContentVariant[];
};

const formatLabels: Record<DerivativeFormat, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  newsletter: "Newsletter",
};

const publicationContent = (variant: ContentVariant): PublicationStructuredContent =>
  variant.structuredContent as PublicationStructuredContent;

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export function ArticleDerivativePanel({
  sourceDocumentId,
  sourceDocumentUpdatedAt,
  hasUnsavedArticleChanges,
}: ArticleDerivativePanelProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<DerivativeFormat>("instagram");
  const [variants, setVariants] = useState<ContentVariant[]>([]);
  const [selected, setSelected] = useState<ContentVariant | null>(null);
  const [serverSourceUpdatedAt, setServerSourceUpdatedAt] = useState(sourceDocumentUpdatedAt);
  const [creditCost, setCreditCost] = useState<number | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/contents/article-derivatives?sourceDocumentId=${encodeURIComponent(sourceDocumentId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json() as LoadResponse;
        if (!response.ok || !payload.ok) throw new Error(payload.message || "Déclinaisons indisponibles.");
        if (!active) return;
        const saved = Array.isArray(payload.variants) ? payload.variants : [];
        setVariants(saved);
        setSelected(saved[0] ?? null);
        setServerSourceUpdatedAt(payload.sourceDocumentUpdatedAt ?? sourceDocumentUpdatedAt);
        setCreditCost(typeof payload.creditCost === "number" ? payload.creditCost : null);
        setCreditBalance(typeof payload.creditBalance === "number" ? payload.creditBalance : null);
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Déclinaisons indisponibles.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [sourceDocumentId, sourceDocumentUpdatedAt]);

  const sourceChanged = Boolean(
    selected && selected.sourceDocumentUpdatedAt !== serverSourceUpdatedAt,
  );
  const visibleVariants = useMemo(
    () => variants.filter((variant) => variant.origin?.type === "article_derivative"),
    [variants],
  );

  const generate = async () => {
    if (generating || hasUnsavedArticleChanges) return;
    setGenerating(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const response = await fetch("/api/contents/article-derivatives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceDocumentId,
          platform: format,
          requestId: crypto.randomUUID(),
        }),
      });
      const payload = await response.json() as { ok?: boolean; message?: string; variant?: ContentVariant };
      if (!response.ok || !payload.ok || !payload.variant) {
        throw new Error(payload.message || "Impossible de décliner cet article.");
      }
      setVariants((current) => [payload.variant as ContentVariant, ...current]);
      setSelected(payload.variant);
      setServerSourceUpdatedAt(payload.variant.sourceDocumentUpdatedAt);
      setMessage("Déclinaison générée et enregistrée comme brouillon. Rien n’a été publié ni envoyé.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de décliner cet article.");
    } finally {
      setGenerating(false);
    }
  };

  const updatePublication = (
    updater: (current: PublicationStructuredContent) => PublicationStructuredContent,
    title?: string,
  ) => {
    setSelected((current) => {
      if (!current) return current;
      const structuredContent = updater(publicationContent(current));
      return {
        ...current,
        title: title ?? current.title,
        structuredContent,
        content: stringifyStructuredVariation(structuredContent),
        updatedAt: new Date().toISOString(),
      };
    });
    setMessage(null);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      await ContentVariantRepositoryService.save(selected);
      setVariants((current) => current.map((item) => item.id === selected.id ? selected : item));
      setMessage("Modifications enregistrées.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!selected) return;
    const value = publicationContent(selected);
    const text = selected.platform === "newsletter"
      ? `Objet : ${selected.title}\nPré-en-tête : ${value.hook}\n\n${value.body}`
      : selected.platform === "instagram"
        ? `${value.hook}\n\n${value.body}`
        : value.body;
    setMessage(await copyText(text) ? "Contenu copié." : "Impossible de copier.");
  };

  const renderEditor = () => {
    if (!selected) return null;
    const value = publicationContent(selected);
    if (selected.platform === "newsletter") {
      return (
        <div className="variant-structured-grid">
          <label><span>Objet</span><input className="document-input" value={selected.title} onChange={(event) => updatePublication((current) => current, event.target.value)} /></label>
          <label><span>Pré-en-tête</span><textarea className="document-textarea" value={value.hook} onChange={(event) => updatePublication((current) => ({ ...current, hook: event.target.value }))} /></label>
          <label><span>Résumé</span><textarea className="document-textarea" value={value.body} onChange={(event) => updatePublication((current) => ({ ...current, body: event.target.value }))} /></label>
        </div>
      );
    }
    return (
      <div className="variant-structured-grid">
        {selected.platform === "instagram" ? (
          <label><span>Accroche</span><textarea className="document-textarea" value={value.hook} onChange={(event) => updatePublication((current) => ({ ...current, hook: event.target.value }))} /></label>
        ) : null}
        <label>
          <span>{selected.platform === "instagram" ? "Légende" : "Publication LinkedIn"}</span>
          <textarea className="document-textarea" value={value.body} onChange={(event) => updatePublication((current) => ({ ...current, body: event.target.value }))} />
        </label>
      </div>
    );
  };

  return (
    <section className="creation-panel" aria-label="Déclinaisons de l’article">
      <header className="creation-footer-actions">
        <div>
          <h2>Décliner l’article</h2>
          <p className="creation-muted">Adaptez l’article enregistré sans recherche, ajout de faits ni publication automatique.</p>
        </div>
        <button type="button" className="contents-secondary-button" onClick={() => setOpen((current) => !current)}>
          <Sparkles size={16} aria-hidden /> Décliner cet article
        </button>
      </header>

      {open ? (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="creation-option-grid">
            {(Object.keys(formatLabels) as DerivativeFormat[]).map((item) => (
              <button key={item} type="button" className={format === item ? "creation-option-card is-active" : "creation-option-card"} onClick={() => setFormat(item)}>
                <strong>{formatLabels[item]}</strong>
              </button>
            ))}
          </div>
          <p className="creation-muted">
            {creditCost === null
              ? "Coût en cours de vérification."
              : creditCost === 0
                ? "Aucun crédit débité pour ce compte."
                : `Coût : ${creditCost} crédit IA${creditBalance === null ? "" : ` · Solde : ${creditBalance}`}.`}
          </p>
          {hasUnsavedArticleChanges ? <p className="creation-error">Enregistrez les modifications de l’article avant de le décliner.</p> : null}
          <button type="button" className="crm-primary-action" disabled={generating || loading || hasUnsavedArticleChanges} onClick={() => void generate()}>
            {generating ? <Loader2 size={16} className="is-spinning" aria-hidden /> : <Sparkles size={16} aria-hidden />}
            {generating ? "Génération…" : `Générer pour ${formatLabels[format]}`}
          </button>

          {visibleVariants.length ? (
            <label className="creation-inline-field">
              <span>Déclinaison enregistrée</span>
              <select value={selected?.id ?? ""} onChange={(event) => setSelected(visibleVariants.find((item) => item.id === event.target.value) ?? null)}>
                {visibleVariants.map((variant) => <option key={variant.id} value={variant.id}>{`${formatLabels[variant.platform as DerivativeFormat]} · ${new Date(variant.updatedAt).toLocaleString("fr-CH")}`}</option>)}
              </select>
            </label>
          ) : null}

          {sourceChanged ? <p className="creation-error">L’article enregistré a changé depuis cette déclinaison. Générez-en une nouvelle avant utilisation.</p> : null}
          {renderEditor()}
          {selected ? (
            <div className="creation-footer-right">
              <button type="button" className="contents-secondary-button" disabled={saving || sourceChanged} onClick={() => void save()}><Save size={16} aria-hidden /> Enregistrer</button>
              <button type="button" className="contents-ghost-button" onClick={() => void copy()}><Copy size={16} aria-hidden /> Copier</button>
            </div>
          ) : null}
          {message ? <p className="creation-muted" role="status">{message}</p> : null}
          {errorMessage ? <p className="creation-error" role="alert">{errorMessage}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
