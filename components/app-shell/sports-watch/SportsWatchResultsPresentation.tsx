import type { ReactNode } from "react";
import {
  buildSportsWatchEditorialPresentation,
} from "@/lib/sports-watch/editorial-presentation";
import type {
  SportsWatchAthleteGroup,
  SportsWatchDisciplineGroup,
  SportsWatchTournamentGroup,
} from "@/lib/sports-watch/presentation";
import type { SportsWatchCandidate } from "@/types/sports-watch";
import { sportsWatchStatusPresentation } from "@/lib/status-presentation";

const disciplineLabels = {
  simple: "Simple",
  double: "Double",
  mixte: "Mixte",
} as const;

const adminStatusLabels = {
  pending: sportsWatchStatusPresentation.pending.label,
  validated: sportsWatchStatusPresentation.validated.label,
  exploited: sportsWatchStatusPresentation.exploited.label,
  rejected: sportsWatchStatusPresentation.rejected.label,
  dismissed: sportsWatchStatusPresentation.dismissed.label,
} as const;

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

const disciplineSummary = (group: SportsWatchDisciplineGroup): string => {
  const parts = [
    pluralize(group.collectedCount, "match collecté", "matchs collectés"),
    pluralize(group.victories, "victoire"),
    pluralize(group.defeats, "défaite"),
  ];
  if (group.forfeits > 0) parts.push(pluralize(group.forfeits, "forfait"));
  if (group.retirements > 0) parts.push(pluralize(group.retirements, "abandon"));
  if (group.unknown > 0) parts.push(pluralize(group.unknown, "résultat non standard"));
  return parts.join(" · ");
};

const uniquePartner = (group: SportsWatchDisciplineGroup): string | null => {
  const partners = new Set(
    group.matches
      .filter((match) => match.countedInSummary)
      .map((match) => match.partner)
      .filter((partner): partner is string => Boolean(partner)),
  );
  return partners.size === 1 ? [...partners][0] : null;
};

type Props = {
  athleteGroup: SportsWatchAthleteGroup;
  formatDate: (value: string | null) => string;
  renderActions: (candidate: SportsWatchCandidate) => ReactNode;
  renderSourceDetails: (candidate: SportsWatchCandidate) => ReactNode;
};

const CandidateStatus = ({ candidate }: { candidate: SportsWatchCandidate }) => (
  <span className={`sports-result-status is-${candidate.adminStatus}`}>
    {adminStatusLabels[candidate.adminStatus]}
  </span>
);

const BadmintonTournament = ({
  group,
  formatDate,
  renderActions,
  renderSourceDetails,
}: Omit<Props, "athleteGroup"> & { group: SportsWatchTournamentGroup }) => (
  <section className="sports-tournament">
    <header className="sports-tournament-header">
      <div>
        <h3>{group.competitionName}</h3>
        <p>
          {formatDate(group.eventDateFrom)}
          {group.eventDateTo && group.eventDateTo !== group.eventDateFrom
            ? ` au ${formatDate(group.eventDateTo)}`
            : ""}
        </p>
      </div>
      <span>{pluralize(group.matchCount, "match", "matchs")}</span>
    </header>
    <p className="sports-tournament-note">
      Bilan des matchs collectés, sans déduction sur le classement ou le parcours complet.
    </p>
    <div className="sports-discipline-list">
      {group.disciplines.map((discipline) => {
        const partner = uniquePartner(discipline);
        return (
          <section className="sports-discipline" key={discipline.discipline}>
            <header>
              <div>
                <h4>{disciplineLabels[discipline.discipline]}</h4>
                <p>{disciplineSummary(discipline)}</p>
              </div>
              {partner ? <span>avec {partner}</span> : null}
            </header>
            <div className="sports-match-list">
              {discipline.matches.map((match) => (
                <details className="sports-match" key={match.candidate.id}>
                  <summary>
                    <span className={`sports-match-outcome is-${match.outcome}`}>
                      {match.outcomeLabel}
                    </span>
                    <span>{match.opponents}</span>
                    <span aria-hidden="true" className="sports-disclosure-label">
                      Détails
                    </span>
                  </summary>
                  <div className="sports-match-body">
                    <div className="sports-match-context">
                      <span>{formatDate(match.candidate.eventDateFrom)}</span>
                      <span>{match.eventCode}</span>
                      {match.round ? <span>{match.round}</span> : null}
                    </div>
                    {match.partner ? (
                      <p><strong>Partenaire</strong><span>{match.partner}</span></p>
                    ) : null}
                    <p><strong>Adversaire{match.opponents.includes(" et ") ? "s" : ""}</strong><span>{match.opponents}</span></p>
                    <p><strong>Manches</strong><span>{match.athleteScore}</span></p>
                    {!match.countedInSummary ? (
                      <p className="sports-result-caution">Version antérieure, non comptée dans le bilan.</p>
                    ) : null}
                    <CandidateStatus candidate={match.candidate} />
                    {renderActions(match.candidate)}
                    {renderSourceDetails(match.candidate)}
                  </div>
                </details>
              ))}
            </div>
          </section>
        );
      })}
    </div>
    {group.unstructuredCandidates.map(({ candidate, countedInSummary }) => (
      <EditorialCandidate
        candidate={candidate}
        countedInSummary={countedInSummary}
        formatDate={formatDate}
        key={candidate.id}
        renderActions={renderActions}
        renderSourceDetails={renderSourceDetails}
      />
    ))}
  </section>
);

const EditorialCandidate = ({
  candidate,
  countedInSummary,
  formatDate,
  renderActions,
  renderSourceDetails,
}: Omit<Props, "athleteGroup"> & {
  candidate: SportsWatchCandidate;
  countedInSummary: boolean;
}) => {
  const presentation = buildSportsWatchEditorialPresentation(candidate);
  return (
    <article
      className={`sports-editorial-result is-${presentation.outcome}`}
      data-sports-candidate-id={candidate.id}
    >
      <div className="sports-editorial-layout">
        <div className="sports-editorial-heading">
          <strong>{presentation.headline}</strong>
          {presentation.supportingLine ? <span>{presentation.supportingLine}</span> : null}
        </div>
        <div className="sports-editorial-context">
          {presentation.collectiveLine ? (
            <p className="sports-collective-result">{presentation.collectiveLine}</p>
          ) : null}
          <p className="sports-result-context">
            {[presentation.contextLabel, formatDate(candidate.eventDateFrom)]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {presentation.secondaryStats.length > 0 ? (
            <dl className="sports-result-stats">
              {presentation.secondaryStats.map((statistic) => (
                <div key={statistic.label}>
                  <dt>{statistic.label}</dt>
                  <dd>{statistic.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {presentation.participationNote ? (
            <p className="sports-result-caution">{presentation.participationNote}</p>
          ) : null}
          {!countedInSummary ? (
            <p className="sports-result-caution">Version antérieure, non comptée dans le bilan.</p>
          ) : null}
        </div>
        <div className="sports-editorial-controls">
          <CandidateStatus candidate={candidate} />
          {renderActions(candidate)}
          {renderSourceDetails(candidate)}
        </div>
      </div>
    </article>
  );
};

export function SportsWatchResultsPresentation({
  athleteGroup,
  formatDate,
  renderActions,
  renderSourceDetails,
}: Props) {
  return (
    <div className="sports-results-editorial">
      {athleteGroup.tournaments.map((group) =>
        group.disciplines.length > 0 ? (
          <BadmintonTournament
            formatDate={formatDate}
            group={group}
            key={group.key}
            renderActions={renderActions}
            renderSourceDetails={renderSourceDetails}
          />
        ) : (
          <div className="sports-editorial-list" key={group.key}>
            {group.unstructuredCandidates.map(({ candidate, countedInSummary }) => (
              <EditorialCandidate
                candidate={candidate}
                countedInSummary={countedInSummary}
                formatDate={formatDate}
                key={candidate.id}
                renderActions={renderActions}
                renderSourceDetails={renderSourceDetails}
              />
            ))}
          </div>
        ),
      )}
    </div>
  );
}
