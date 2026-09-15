"use client";

import { useEffect, useState } from "react";
import { Search, UserMinus, UserPlus } from "lucide-react";
import { Button, Input, Select } from "@/src/design-system/components";

type ClubOption = {
  workspaceId: string;
  name: string;
};

type ClubTeam = {
  id: string;
  workspaceId: string;
  name: string;
  season: string;
  status: "active" | "inactive";
};

type RosterMember = {
  id: string;
  workspaceId: string;
  teamId: string;
  athleteId: string;
  athleteName: string;
  sport: string;
  joinedOn: string;
};

type AvailableAthlete = {
  athleteId: string;
  name: string;
  sport: string;
  status: string;
};

type RosterPayload = {
  teams?: ClubTeam[];
  roster?: RosterMember[];
  availableAthletes?: AvailableAthlete[];
  error?: string;
};

type ClubRosterAdminProps = {
  clubs: ClubOption[];
};

type Feedback = {
  kind: "success" | "neutral" | "error";
  message: string;
};

const controlStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "8px",
} as const;

const actionStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.4rem",
  minHeight: "2.35rem",
  borderRadius: "8px",
  padding: "0.55rem 0.8rem",
  fontWeight: 700,
} as const;

const rosterUrl = (workspaceId: string, teamId?: string) => {
  const query = new URLSearchParams({ workspaceId });
  if (teamId) query.set("teamId", teamId);
  return `/api/admin/clubs/roster?${query.toString()}`;
};

const readPayload = async (response: Response): Promise<RosterPayload | null> =>
  response.json().catch(() => null) as Promise<RosterPayload | null>;

export function ClubRosterAdmin({ clubs }: ClubRosterAdminProps) {
  const [workspaceId, setWorkspaceId] = useState("");
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [teamId, setTeamId] = useState("");
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [availableAthletes, setAvailableAthletes] = useState<AvailableAthlete[]>([]);
  const [search, setSearch] = useState("");
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [mutatingAthleteId, setMutatingAthleteId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (clubs.length === 0) {
      setWorkspaceId("");
      return;
    }
    setWorkspaceId((current) => clubs.some((club) => club.workspaceId === current)
      ? current
      : clubs[0].workspaceId);
  }, [clubs]);

  useEffect(() => {
    if (!workspaceId) {
      setTeams([]);
      setTeamId("");
      return;
    }

    let active = true;
    setLoadingTeams(true);
    setLoadError(null);
    setFeedback(null);
    setTeamId("");
    setRoster([]);
    setAvailableAthletes([]);

    void fetch(rosterUrl(workspaceId), {
      credentials: "include",
      cache: "no-store",
    }).then(async (response) => {
      const payload = await readPayload(response);
      if (!active) return;
      if (!response.ok || !Array.isArray(payload?.teams)) {
        setLoadError(payload?.error || "Impossible de charger les équipes du club.");
        return;
      }
      setTeams(payload.teams);
      const firstTeam = payload.teams.find((team) => team.status === "active") ?? payload.teams[0];
      setTeamId(firstTeam?.id ?? "");
    }).catch(() => {
      if (active) setLoadError("Impossible de charger les équipes du club. Vérifiez votre connexion.");
    }).finally(() => {
      if (active) setLoadingTeams(false);
    });

    return () => { active = false; };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !teamId) return;

    let active = true;
    setLoadingRoster(true);
    setLoadError(null);
    setFeedback(null);

    void fetch(rosterUrl(workspaceId, teamId), {
      credentials: "include",
      cache: "no-store",
    }).then(async (response) => {
      const payload = await readPayload(response);
      if (!active) return;
      if (
        !response.ok
        || !Array.isArray(payload?.roster)
        || !Array.isArray(payload.availableAthletes)
      ) {
        setLoadError(payload?.error || "Impossible de charger le roster de l’équipe.");
        return;
      }
      setRoster(payload.roster);
      setAvailableAthletes(payload.availableAthletes);
    }).catch(() => {
      if (active) setLoadError("Impossible de charger le roster de l’équipe. Vérifiez votre connexion.");
    }).finally(() => {
      if (active) setLoadingRoster(false);
    });

    return () => { active = false; };
  }, [workspaceId, teamId]);

  const refreshRoster = async () => {
    const response = await fetch(rosterUrl(workspaceId, teamId), {
      credentials: "include",
      cache: "no-store",
    });
    const payload = await readPayload(response);
    if (!response.ok || !Array.isArray(payload?.roster) || !Array.isArray(payload.availableAthletes)) {
      throw new Error(payload?.error || "Impossible d’actualiser le roster de l’équipe.");
    }
    setRoster(payload.roster);
    setAvailableAthletes(payload.availableAthletes);
  };

  const mutateRoster = async (method: "POST" | "DELETE", athleteId: string, athleteName: string) => {
    setMutatingAthleteId(athleteId);
    setFeedback(null);
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/clubs/roster", {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, teamId, athleteId }),
      });
      const payload = response.status === 204 ? null : await readPayload(response);
      if (method === "POST" && response.status === 409) {
        await refreshRoster();
        setFeedback({
          kind: "neutral",
          message: `${athleteName} était déjà ajouté à l’équipe.`,
        });
        return;
      }
      if (!response.ok) throw new Error(payload?.error || "Le roster n’a pas pu être modifié.");

      await refreshRoster();
      setFeedback({
        kind: "success",
        message: method === "POST"
          ? `${athleteName} a été ajouté à l’équipe.`
          : `${athleteName} a été retiré de l’équipe.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Le roster n’a pas pu être modifié.",
      });
    } finally {
      setMutatingAthleteId(null);
    }
  };

  const removeAthlete = (member: RosterMember) => {
    const team = teams.find((item) => item.id === teamId);
    if (!window.confirm(`Retirer ${member.athleteName} de ${team?.name ?? "cette équipe"} ?`)) return;
    void mutateRoster("DELETE", member.athleteId, member.athleteName);
  };

  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  const filteredAthletes = availableAthletes.filter((athlete) =>
    `${athlete.name} ${athlete.sport}`.toLocaleLowerCase("fr").includes(normalizedSearch));

  return (
    <section aria-labelledby="club-roster-title" style={{ display: "grid", gap: "1rem", borderTop: "1px solid #e5e7eb", paddingTop: "1rem" }}>
      <div>
        <h3 id="club-roster-title" style={{ margin: "0 0 0.3rem", fontSize: "1rem", color: "#111827" }}>
          Gestion du roster
        </h3>
        <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.5 }}>
          Gérez les Athlètes actifs par équipe.
        </p>
      </div>

      {clubs.length === 0 ? (
        <p data-roster-empty="clubs" style={{ margin: 0, color: "#6b7280" }}>Provisionnez un club pour gérer son roster.</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.85rem" }}>
            <label style={{ display: "grid", gap: "0.35rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
              <span>Club</span>
              <Select
                name="rosterWorkspaceId"
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                disabled={loadingTeams || mutatingAthleteId !== null}
                style={controlStyle}
              >
                {clubs.map((club) => <option key={club.workspaceId} value={club.workspaceId}>{club.name}</option>)}
              </Select>
            </label>
            <label style={{ display: "grid", gap: "0.35rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
              <span>Équipe</span>
              <Select
                name="rosterTeamId"
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                disabled={loadingTeams || teams.length === 0 || mutatingAthleteId !== null}
                style={controlStyle}
              >
                {teams.length === 0 ? <option value="">Aucune équipe</option> : null}
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name} · {team.season}</option>
                ))}
              </Select>
            </label>
          </div>

          {loadingTeams ? <p role="status" data-roster-state="loading-teams" style={{ margin: 0, color: "#6b7280" }}>Chargement des équipes…</p> : null}
          {!loadingTeams && teams.length === 0 && !loadError ? (
            <p data-roster-empty="teams" style={{ margin: 0, color: "#6b7280" }}>Aucune équipe disponible pour ce club.</p>
          ) : null}
          {loadingRoster ? <p role="status" data-roster-state="loading-roster" style={{ margin: 0, color: "#6b7280" }}>Chargement du roster…</p> : null}
          {loadError ? <p role="alert" data-roster-state="error" style={{ margin: 0, color: "#b91c1c" }}>{loadError}</p> : null}
          {feedback ? (
            <p
              role={feedback.kind === "error" ? "alert" : "status"}
              data-roster-state={feedback.kind}
              style={{
                margin: 0,
                padding: "0.7rem 0.85rem",
                border: `1px solid ${feedback.kind === "success" ? "#bbf7d0" : feedback.kind === "neutral" ? "#d1d5db" : "#fecaca"}`,
                background: feedback.kind === "success" ? "#f0fdf4" : feedback.kind === "neutral" ? "#f9fafb" : "#fef2f2",
                color: feedback.kind === "success" ? "#166534" : feedback.kind === "neutral" ? "#374151" : "#b91c1c",
                borderRadius: "8px",
              }}
            >
              {feedback.message}
            </p>
          ) : null}

          {teamId && !loadingRoster && !loadError ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
              <div style={{ display: "grid", alignContent: "start", gap: "0.6rem" }}>
                <h4 style={{ margin: 0, fontSize: "0.95rem", color: "#111827" }}>Effectif actif</h4>
                {roster.length === 0 ? <p data-roster-empty="members" style={{ margin: 0, color: "#6b7280" }}>Aucun Athlète dans cette équipe.</p> : null}
                {roster.map((member) => (
                  <div key={member.id} data-roster-member={member.athleteId} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center", borderBottom: "1px solid #e5e7eb", padding: "0.65rem 0" }}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: "#111827" }}>{member.athleteName}</strong>
                      <p style={{ margin: "0.15rem 0 0", color: "#6b7280" }}>{member.sport || "Sport non renseigné"}</p>
                    </div>
                    <Button
                      type="button"
                      aria-label={`Retirer ${member.athleteName}`}
                      title={`Retirer ${member.athleteName}`}
                      disabled={mutatingAthleteId !== null}
                      onClick={() => removeAthlete(member)}
                      style={{ ...actionStyle, color: "#b91c1c", background: "#fff", border: "1px solid #fecaca" }}
                    >
                      <UserMinus size={16} aria-hidden="true" />
                      Retirer
                    </Button>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", alignContent: "start", gap: "0.6rem" }}>
                <h4 style={{ margin: 0, fontSize: "0.95rem", color: "#111827" }}>Athlètes KLIQUE disponibles</h4>
                <label style={{ position: "relative", display: "block" }}>
                  <span style={{ position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>Rechercher un Athlète</span>
                  <Search size={17} aria-hidden="true" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#6b7280", pointerEvents: "none" }} />
                  <Input
                    name="rosterAthleteSearch"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher par nom ou sport"
                    style={{ ...controlStyle, paddingLeft: "2.35rem" }}
                  />
                </label>
                {filteredAthletes.length === 0 ? (
                  <p data-roster-empty="available" style={{ margin: 0, color: "#6b7280" }}>
                    {availableAthletes.length === 0 ? "Aucun Athlète disponible." : "Aucun Athlète ne correspond à la recherche."}
                  </p>
                ) : null}
                {filteredAthletes.map((athlete) => (
                  <div key={athlete.athleteId} data-available-athlete={athlete.athleteId} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center", borderBottom: "1px solid #e5e7eb", padding: "0.65rem 0" }}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: "#111827" }}>{athlete.name}</strong>
                      <p style={{ margin: "0.15rem 0 0", color: "#6b7280" }}>{athlete.sport || "Sport non renseigné"}</p>
                    </div>
                    <Button
                      type="button"
                      aria-label={`Ajouter ${athlete.name}`}
                      disabled={mutatingAthleteId !== null}
                      onClick={() => void mutateRoster("POST", athlete.athleteId, athlete.name)}
                      style={{ ...actionStyle, color: "#fff", background: "#111827", border: "1px solid #111827" }}
                    >
                      <UserPlus size={16} aria-hidden="true" />
                      Ajouter
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}