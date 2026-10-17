"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Card } from "@/src/design-system/components";
import {
  getSafeHttpsUrl,
  isMeaningfulWeeklyValue,
  type WeeklyResponseDashboardItem,
} from "@/lib/weekly-responses";

type WeeklyResponsesCockpitProps = {
  items: WeeklyResponseDashboardItem[];
  processingResponseKeys: ReadonlySet<string>;
  error: string | null;
  onMarkProcessed: (athleteId: string, responseTimestamp: string) => void;
};

const formatResponseDate = (responseTime: number): string =>
  new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(responseTime));

const compactValue = (value: string): string => {
  const trimmed = value.trim();
  if (!isMeaningfulWeeklyValue(trimmed)) return "";
  return trimmed.length > 72 ? `${trimmed.slice(0, 69).trimEnd()}…` : trimmed;
};

const ResponseDetails = ({
  item,
  id,
}: {
  item: WeeklyResponseDashboardItem;
  id: string;
}) => (
  <div id={id} className="weekly-cockpit-details" role="region" aria-label={`Détails de la réponse de ${item.athlete.name}`}>
    <dl>
      {item.details.map((detail) => {
        const safeUrl = detail.kind === "link" ? getSafeHttpsUrl(detail.value) : null;
        return (
          <div key={detail.key} className="weekly-cockpit-detail">
            <dt>{detail.label}</dt>
            <dd>
              {safeUrl ? (
                <a href={safeUrl} target="_blank" rel="noopener noreferrer">
                  {detail.value}
                </a>
              ) : detail.value}
            </dd>
          </div>
        );
      })}
      <div className="weekly-cockpit-detail">
        <dt>Date de réponse</dt>
        <dd>{formatResponseDate(item.responseTime)}</dd>
      </div>
    </dl>
  </div>
);

const ProcessedCheckbox = ({
  item,
  isProcessing,
  onMarkProcessed,
}: {
  item: WeeklyResponseDashboardItem;
  isProcessing: boolean;
  onMarkProcessed: WeeklyResponsesCockpitProps["onMarkProcessed"];
}) => (
  <label className="weekly-cockpit-check-label">
    <input
      type="checkbox"
      className="priority-check"
      checked={isProcessing}
      disabled={isProcessing}
      onChange={() => onMarkProcessed(item.athlete.key, item.response.timestamp)}
    />
    <span>Traité</span>
  </label>
);

export function WeeklyResponsesCockpit({
  items,
  processingResponseKeys,
  error,
  onMarkProcessed,
}: WeeklyResponsesCockpitProps) {
  const [expandedResponseKeys, setExpandedResponseKeys] = useState<Set<string>>(() => new Set());

  const toggleDetails = (responseKey: string) => {
    setExpandedResponseKeys((current) => {
      const next = new Set(current);
      if (next.has(responseKey)) next.delete(responseKey);
      else next.add(responseKey);
      return next;
    });
  };

  return (
    <Card className="workspace-dashboard-card dashboard-weekly-card weekly-cockpit-card">
      <header className="dashboard-card-head weekly-cockpit-head">
        <div>
          <p className="weekly-cockpit-eyebrow">Suivi éditorial</p>
          <h2>Réponses hebdomadaires</h2>
        </div>
        <div className="dashboard-card-head-right">
          <span className="card-pill">{items.length} athlète{items.length === 1 ? "" : "s"}</span>
        </div>
      </header>

      {items.length > 0 ? (
        <div className="weekly-cockpit-scroll">
          <div className="weekly-cockpit-desktop">
            <table className="weekly-cockpit-table">
              <thead>
                <tr>
                  <th>Athlète</th>
                  <th>Fait principal</th>
                  <th>Résultat / performance</th>
                  <th>Prochain rendez-vous</th>
                  <th>Priorité</th>
                  <th>Date</th>
                  <th><span className="sr-only">Actions</span></th>
                  <th>Traité</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isExpanded = expandedResponseKeys.has(item.responseKey);
                  const isProcessing = processingResponseKeys.has(item.responseKey);
                  const detailsId = `weekly-details-desktop-${encodeURIComponent(item.responseKey)}`;
                  return (
                    <Fragment key={item.responseKey}>
                      <tr className={isProcessing ? "is-processing" : ""}>
                        <td className="weekly-cockpit-athlete">
                          <Link href={`/crm/personnes/${item.athlete.key}`}>{item.athlete.name}</Link>
                          {item.athlete.sport ? <small>{item.athlete.sport}</small> : null}
                        </td>
                        <td><strong>{item.summary}</strong></td>
                        <td>{compactValue(item.response.result || item.response.notableEventExplanation)}</td>
                        <td>{compactValue(item.response.appointment)}</td>
                        <td>
                          <span className={`weekly-priority-badge weekly-priority-${item.priority.tone}`}>
                            {item.priority.label}
                          </span>
                        </td>
                        <td className="weekly-cockpit-date">{formatResponseDate(item.responseTime)}</td>
                        <td>
                          <button
                            type="button"
                            className="weekly-details-toggle"
                            aria-expanded={isExpanded}
                            aria-controls={detailsId}
                            onClick={() => toggleDetails(item.responseKey)}
                          >
                            {isExpanded ? "Masquer" : "Voir les détails"}
                          </button>
                        </td>
                        <td>
                          <ProcessedCheckbox item={item} isProcessing={isProcessing} onMarkProcessed={onMarkProcessed} />
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="weekly-cockpit-expanded-row">
                          <td className="weekly-cockpit-expanded-cell" colSpan={8}>
                            <ResponseDetails item={item} id={detailsId} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="weekly-cockpit-mobile">
            {items.map((item) => {
              const isExpanded = expandedResponseKeys.has(item.responseKey);
              const isProcessing = processingResponseKeys.has(item.responseKey);
              const detailsId = `weekly-details-mobile-${encodeURIComponent(item.responseKey)}`;
              return (
                <li key={item.responseKey} className={`weekly-cockpit-mobile-card${isProcessing ? " is-processing" : ""}`}>
                  <div className="weekly-cockpit-mobile-heading">
                    <div>
                      <Link href={`/crm/personnes/${item.athlete.key}`}>{item.athlete.name}</Link>
                      <time>{formatResponseDate(item.responseTime)}</time>
                    </div>
                    <span className={`weekly-priority-badge weekly-priority-${item.priority.tone}`}>
                      {item.priority.label}
                    </span>
                  </div>
                  <strong className="weekly-cockpit-mobile-summary">{item.summary}</strong>
                  {isMeaningfulWeeklyValue(item.response.result) ? <p><b>Résultat</b>{item.response.result}</p> : null}
                  {isMeaningfulWeeklyValue(item.response.appointment) ? <p><b>À venir</b>{item.response.appointment}</p> : null}
                  <div className="weekly-cockpit-mobile-actions">
                    <button
                      type="button"
                      className="weekly-details-toggle"
                      aria-expanded={isExpanded}
                      aria-controls={detailsId}
                      onClick={() => toggleDetails(item.responseKey)}
                    >
                      {isExpanded ? "Masquer les détails" : "Voir les détails"}
                    </button>
                    <ProcessedCheckbox item={item} isProcessing={isProcessing} onMarkProcessed={onMarkProcessed} />
                  </div>
                  {isExpanded ? <ResponseDetails item={item} id={detailsId} /> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="weekly-cockpit-empty">Aucune réponse hebdomadaire à traiter.</p>
      )}
      {error ? <p className="weekly-cockpit-error" role="alert">{error}</p> : null}
    </Card>
  );
}
