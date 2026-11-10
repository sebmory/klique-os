import type { SportsWatchCrmAthlete } from "@/lib/google-sheets";
import {
  localAdminFixtureAthletes,
  localIntroductionFixturesEnabled,
} from "@/lib/partner-athlete-introductions/local-fixtures";
import { SportsWatchAthleteDirectory } from "@/lib/sports-watch/athlete-directory";
import {
  discoverFootstatsFootballTeam,
} from "@/lib/sports-watch/football-public-collector";
import { FootballPublicRepository } from "@/lib/sports-watch/football-public-repository";
import {
  buildSportsWatchManualEntryCandidate,
  validateSportsWatchManualEntryInput,
} from "@/lib/sports-watch/manual-entry-service";
import { PostgresSportsWatchRepository } from "@/lib/sports-watch/repository";
import {
  SportsWatchError,
  type SportsWatchAdminIdentity,
} from "@/lib/sports-watch/service";
import type {
  FootballCandidateReconciliation,
  FootballCandidateReconciliationView,
  FootballPublicBinding,
  FootballPublicTeamDiscovery,
  FootballReconciliationDecision,
  FootballCandidateResolution,
  FootballSourceSuggestion,
  SportsWatchCandidate,
} from "@/types/sports-watch";

const MATHEUS_NAME = "matheus monteiro";
const PILOT_TEAM_ID = "xh89ete5";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalize = (value: unknown): string => String(value ?? "").trim();
const normalizeName = (value: string): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const athleteId = (athlete: SportsWatchCrmAthlete): string =>
  athlete.athleteId?.trim() || athlete.key.trim();

const getAthletes = (identity: SportsWatchAdminIdentity) =>
  localIntroductionFixturesEnabled()
    ? Promise.resolve(localAdminFixtureAthletes())
    : SportsWatchAthleteDirectory.resolve({
        ...identity,
        accessRole: "admin",
        accessStatus: "active",
      });

const resolveMatheus = async (
  athleteIdValue: unknown,
  identity: SportsWatchAdminIdentity,
): Promise<SportsWatchCrmAthlete> => {
  const selectedId = normalize(athleteIdValue);
  const athlete = (await getAthletes(identity)).find((item) => athleteId(item) === selectedId);
  if (!athlete) {
    throw new SportsWatchError("not_found", "Athlète actif introuvable dans cet espace.");
  }
  if (
    !normalizeName(athlete.name).includes(MATHEUS_NAME)
    || !normalizeName(athlete.sport).includes("football")
    || normalizeName(athlete.sport).includes("americain")
  ) {
    throw new SportsWatchError(
      "validation",
      "Ce pilote est strictement limité à Matheus Monteiro.",
    );
  }
  return athlete;
};

const requireTeamId = (value: unknown): string => {
  const teamId = normalize(value);
  if (teamId !== PILOT_TEAM_ID) {
    throw new SportsWatchError(
      "validation",
      `Ce pilote est limité à l’équipe Footstats ${PILOT_TEAM_ID}.`,
    );
  }
  return teamId;
};

const requireVersion = (value: unknown, minimum = 0): number => {
  const version = Number(value);
  if (!Number.isInteger(version) || version < minimum) {
    throw new SportsWatchError("validation", "La version du rattachement est invalide.");
  }
  return version;
};

const same = (left: string | null | undefined, right: string | null | undefined) =>
  normalizeName(left ?? "") === normalizeName(right ?? "");

export const FootballPublicService = {
  async list(identity: SportsWatchAdminIdentity): Promise<{
    bindings: FootballPublicBinding[];
    reconciliations: FootballCandidateReconciliationView[];
    sourceSuggestions: FootballSourceSuggestion[];
  }> {
    const [bindings, reconciliations, sourceSuggestions] = await Promise.all([
      FootballPublicRepository.listBindings(identity.workspaceId),
      FootballPublicRepository.listReconciliations(identity.workspaceId),
      FootballPublicRepository.listSourceSuggestions(identity.workspaceId),
    ]);
    return { bindings, reconciliations, sourceSuggestions };
  },

  async discover(
    athleteIdValue: unknown,
    teamIdValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<FootballPublicTeamDiscovery> {
    await resolveMatheus(athleteIdValue, identity);
    try {
      return await discoverFootstatsFootballTeam(requireTeamId(teamIdValue));
    } catch (error) {
      throw new SportsWatchError(
        "source",
        error instanceof Error ? error.message : "La découverte Footstats a échoué.",
      );
    }
  },

  async saveBinding(input: {
    athleteId: unknown;
    teamId: unknown;
    selectedPlayerId: unknown;
    affTeamId: unknown;
    affPlayerId: unknown;
    status: unknown;
    identityMatchConfirmed: unknown;
    expectedVersion: unknown;
  }, identity: SportsWatchAdminIdentity): Promise<FootballPublicBinding> {
    const athlete = await resolveMatheus(input.athleteId, identity);
    const status = normalize(input.status);
    if (status !== "draft" && status !== "verified" && status !== "ambiguous") {
      throw new SportsWatchError("validation", "Le statut du rattachement est invalide.");
    }
    const discovery = await this.discover(input.athleteId, input.teamId, identity);
    const selectedPlayerId = normalize(input.selectedPlayerId) || null;
    const selectedPlayer = selectedPlayerId
      ? discovery.players.find((player) => player.id === selectedPlayerId)
      : null;
    if (selectedPlayerId && !selectedPlayer) {
      throw new SportsWatchError(
        "validation",
        "Le joueur choisi n’appartient pas à l’effectif public relu par le serveur.",
      );
    }
    if (status === "verified" && (!selectedPlayer || input.identityMatchConfirmed !== true)) {
      throw new SportsWatchError(
        "validation",
        "Choisissez Matheus dans l’effectif et confirmez explicitement son identité.",
      );
    }
    const binding = await FootballPublicRepository.saveBinding({
      workspaceId: identity.workspaceId,
      athleteId: athleteId(athlete),
      discovery,
      selectedPlayerId,
      affTeamId: normalize(input.affTeamId) || null,
      affPlayerId: normalize(input.affPlayerId) || null,
      status,
      evidence: [
        `Équipe Footstats relue : ${discovery.teamName} (${discovery.footstatsTeamId}).`,
        selectedPlayer
          ? `Joueur choisi explicitement dans l’effectif : ${selectedPlayer.name} (${selectedPlayer.id}).`
          : "Aucun joueur confirmé dans l’effectif.",
        status === "verified"
          ? `Correspondance confirmée explicitement par l’Admin avec ${athlete.name}.`
          : `Rattachement conservé au statut ${status}.`,
        ...discovery.warnings,
      ],
      clerkUserId: identity.clerkUserId,
      expectedVersion: requireVersion(input.expectedVersion),
      now: new Date().toISOString(),
    });
    if (!binding) {
      throw new SportsWatchError(
        "conflict",
        "Le rattachement a été modifié. Rechargez la configuration avant de continuer.",
      );
    }
    return binding;
  },

  async disableBinding(
    athleteIdValue: unknown,
    expectedVersionValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<FootballPublicBinding> {
    const athlete = await resolveMatheus(athleteIdValue, identity);
    const binding = await FootballPublicRepository.disableBinding({
      workspaceId: identity.workspaceId,
      athleteId: athleteId(athlete),
      expectedVersion: requireVersion(expectedVersionValue, 1),
    });
    if (!binding) {
      throw new SportsWatchError(
        "conflict",
        "Le rattachement a été modifié, désactivé ou n’est pas accessible.",
      );
    }
    return binding;
  },

  async completeCandidate(
    candidateIdValue: unknown,
    expectedVersionValue: unknown,
    value: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SportsWatchCandidate> {
    const candidateId = normalize(candidateIdValue);
    if (!UUID_PATTERN.test(candidateId)) {
      throw new SportsWatchError("validation", "Le candidat football est invalide.");
    }
    const candidate = await PostgresSportsWatchRepository.getCandidate(
      identity.workspaceId,
      candidateId,
    );
    if (!candidate?.footballEvidence || candidate.manualEntry) {
      throw new SportsWatchError(
        "not_found",
        "Le candidat collectif à compléter est introuvable.",
      );
    }
    const athlete = await resolveMatheus(candidate.athleteId, identity);
    const validated = validateSportsWatchManualEntryInput(value, athlete);
    const evidence = candidate.footballEvidence;
    const football = validated.metadata.football;
    if (
      validated.athleteId !== candidate.athleteId
      || validated.eventDate !== evidence.eventDate
      || validated.newsType !== "result_match"
      || !football
      || !same(football.team, evidence.team)
      || !same(football.opponent, evidence.opponent)
      || !same(football.score, evidence.score)
      || !same(football.competition, evidence.competition)
      || football.footstatsTeamId !== evidence.footstatsTeamId
      || football.footstatsReference !== evidence.publicReference
      || football.participationStatus === "unknown"
    ) {
      throw new SportsWatchError(
        "validation",
        "Les faits Footstats publics préremplis ne peuvent pas être modifiés et la participation doit être renseignée.",
      );
    }
    const prepared = buildSportsWatchManualEntryCandidate(
      athlete,
      validated,
      new Date().toISOString(),
    );
    const completed = await FootballPublicRepository.completeCandidate({
      workspaceId: identity.workspaceId,
      candidateId,
      expectedVersion: requireVersion(expectedVersionValue, 1),
      clerkUserId: identity.clerkUserId,
      prepared,
    });
    if (!completed) {
      throw new SportsWatchError(
        "conflict",
        "Le candidat a déjà été complété ou modifié. Rechargez Sports Watch.",
      );
    }
    return completed;
  },

  async resolveCandidate(
    candidateIdValue: unknown,
    expectedVersionValue: unknown,
    resolutionValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SportsWatchCandidate> {
    const candidateId = normalize(candidateIdValue);
    if (!UUID_PATTERN.test(candidateId)) {
      throw new SportsWatchError("validation", "Le candidat football est invalide.");
    }
    const resolution = normalize(resolutionValue) as FootballCandidateResolution;
    if (!["participation_unverifiable", "not_exploitable", "incorrect"].includes(resolution)) {
      throw new SportsWatchError("validation", "La décision football est invalide.");
    }
    const candidate = await FootballPublicRepository.resolveCandidate({
      workspaceId: identity.workspaceId,
      candidateId,
      expectedVersion: requireVersion(expectedVersionValue, 1),
      resolution,
      clerkUserId: identity.clerkUserId,
    });
    if (!candidate) {
      throw new SportsWatchError(
        "conflict",
        "Le candidat a déjà été traité ou modifié. Rechargez Sports Watch.",
      );
    }
    return candidate;
  },

  async decideSourceSuggestion(input: {
    suggestionId: unknown;
    expectedVersion: unknown;
    decision: unknown;
  }, identity: SportsWatchAdminIdentity): Promise<SportsWatchCandidate> {
    const suggestionId = normalize(input.suggestionId);
    if (!UUID_PATTERN.test(suggestionId)) {
      throw new SportsWatchError("validation", "La suggestion de source est invalide.");
    }
    const decision = normalize(input.decision);
    if (decision !== "attached" && decision !== "rejected") {
      throw new SportsWatchError("validation", "La décision de rattachement est invalide.");
    }
    const candidate = await FootballPublicRepository.decideSourceSuggestion({
      workspaceId: identity.workspaceId,
      suggestionId,
      expectedVersion: requireVersion(input.expectedVersion, 1),
      decision,
      clerkUserId: identity.clerkUserId,
    });
    if (!candidate) {
      throw new SportsWatchError(
        "conflict",
        "La suggestion a déjà été traitée ou le candidat manuel a changé.",
      );
    }
    return candidate;
  },

  async decideReconciliation(input: {
    reconciliationId: unknown;
    decision: unknown;
    expectedVersion: unknown;
  }, identity: SportsWatchAdminIdentity): Promise<FootballCandidateReconciliation> {
    const reconciliationId = normalize(input.reconciliationId);
    if (!UUID_PATTERN.test(reconciliationId)) {
      throw new SportsWatchError("validation", "Le rapprochement est invalide.");
    }
    const decision = normalize(input.decision) as FootballReconciliationDecision;
    if (![
      "keep_manual",
      "keep_automatic",
      "complete_manual",
      "different_events",
      "examine_later",
    ].includes(decision)) {
      throw new SportsWatchError("validation", "La décision de rapprochement est invalide.");
    }
    const reconciliation = await FootballPublicRepository.decideReconciliation({
      workspaceId: identity.workspaceId,
      reconciliationId,
      decision: decision as Exclude<FootballReconciliationDecision, "pending">,
      expectedVersion: requireVersion(input.expectedVersion, 1),
      clerkUserId: identity.clerkUserId,
    });
    if (!reconciliation) {
      throw new SportsWatchError(
        "conflict",
        "Le rapprochement a été modifié ou n’est pas accessible dans cet espace.",
      );
    }
    return reconciliation;
  },
};
