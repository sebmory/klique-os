"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/src/design-system/components";
import type { AthleteNewsReport, AthleteNewsReportStatus } from "@/types/athlete-news-report";

type AthleteSummary = { key: string; name: string };

const statusLabels: Record<AthleteNewsReportStatus, string> = {
  new: "Nouveau",
  preparing: "En préparation",
  processed: "Traité",
};

export function AthleteNewsReportsAdminCard({ athletes }: { athletes: AthleteSummary[] }) {
  const router = useRouter();
  const [reports, setReports] = useState<AthleteNewsReport[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const athleteNames = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.key, athlete.name])),
    [athletes],
  );
  const newCount = reports.filter((report) => report.status === "new").length;

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/athlete-news-reports", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { reports?: AthleteNewsReport[]; message?: string };
        if (!response.ok) throw new Error(payload.message || "Impossible de charger les signalements.");
        if (active) setReports(payload.reports ?? []);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      });
    return () => {
      active = false;
    };
  }, []);

  const changeStatus = async (report: AthleteNewsReport, status: AthleteNewsReportStatus) => {
    if (busyId) return null;
    setBusyId(report.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/athlete-news-reports/${encodeURIComponent(report.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, version: report.version }),
      });
      const payload = await response.json() as { report?: AthleteNewsReport; message?: string };
      if (!response.ok || !payload.report) {
        throw new Error(payload.message || "Impossible de modifier le signalement.");
      }
      setReports((current) => current.map((item) => item.id === payload.report!.id ? payload.report! : item));
      return payload.report;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Modification impossible.");
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const prepareArticle = async (report: AthleteNewsReport) => {
    const current = report.status === "preparing"
      ? report
      : await changeStatus(report, "preparing");
    if (!current) return;
    const athleteName = athleteNames.get(current.athleteId) || "Athlète";
    const query = new URLSearchParams({
      objective: "article",
      subject: athleteName,
      subjectId: current.athleteId,
      contextType: "athlete",
      athleteNewsReportId: current.id,
    });
    router.push(`/contents/create?${query.toString()}`);
  };

  return (
    <Card className="workspace-dashboard-card">
      <header className="dashboard-card-head">
        <div>
          <h2>Actualités Athlètes</h2>
          <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.84rem" }}>
            Déclarations à examiner avant tout usage éditorial.
          </p>
        </div>
        <button type="button" className="card-pill" onClick={() => setExpanded((current) => !current)}>
          {newCount} nouveau{newCount === 1 ? "" : "x"}
        </button>
      </header>

      {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
      {expanded ? (
        reports.length > 0 ? (
          <ul className="priority-list" style={{ marginTop: "0.75rem" }}>
            {reports.map((report) => (
              <li key={report.id} className="priority-item" style={{ alignItems: "flex-start" }}>
                <div className="priority-main" style={{ width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                    <strong>{athleteNames.get(report.athleteId) || report.athleteId}</strong>
                    <span className="priority-badge">{statusLabels[report.status]}</span>
                  </div>
                  <small>{new Intl.DateTimeFormat("fr-CH").format(new Date(`${report.eventDate}T00:00:00`))}</small>
                  <p style={{ margin: "0.45rem 0", whiteSpace: "pre-wrap" }}>{report.message}</p>
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.84rem" }}>
                    {report.externalUrl ? <a href={report.externalUrl} target="_blank" rel="noreferrer">Lien fourni</a> : null}
                    {report.photoHref ? <a href={report.photoHref} target="_blank" rel="noreferrer">Photo privée</a> : null}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.65rem" }}>
                    <select
                      aria-label={`Statut de ${athleteNames.get(report.athleteId) || report.athleteId}`}
                      value={report.status}
                      disabled={busyId === report.id}
                      onChange={(event) => void changeStatus(report, event.target.value as AthleteNewsReportStatus)}
                    >
                      <option value="new">Nouveau</option>
                      <option value="preparing">En préparation</option>
                      <option value="processed">Traité</option>
                    </select>
                    <button
                      type="button"
                      className="card-link-button"
                      disabled={busyId === report.id}
                      onClick={() => void prepareArticle(report)}
                    >
                      Préparer un article
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : <p>Aucun signalement pour le moment.</p>
      ) : null}
      <p style={{ margin: "0.65rem 0 0", color: "#6b7280", fontSize: "0.78rem" }}>
        « Traité » signifie que le signalement a été examiné, pas qu’il a été publié.
      </p>
    </Card>
  );
}
