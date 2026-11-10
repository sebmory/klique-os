import { runCreativeMissionRegularization } from "@/lib/creative-mission-regularization";
import { buildCreativeMissionRegularizationPayload } from "@/fixtures/creative-mission-regularization";
import { formatPostgresTargetSummary, resolvePostgresTarget } from "@/lib/postgres-config";
import { confirmInteractiveApply, parseScriptMode } from "@/lib/production-script-safety";

const buildDryRun = () => {
  const { records } = buildCreativeMissionRegularizationPayload();
  const completedMissions = records.filter((record) =>
    record.recordKind === "mission" && record.businessState === "completed");
  const closedEntries = records.filter((record) =>
    record.recordKind === "historical_entry"
    && record.businessState === "closed_without_action");

  return {
    completedMissions: completedMissions.length,
    closedEntries: closedEntries.length,
    completedMissionServiceLinks: completedMissions
      .reduce((total, record) => total + record.services.length, 0),
    closedEntryRequestLinks: closedEntries
      .reduce((total, record) => total + record.services.length, 0),
    athleteLinks: records.reduce((total, record) => total + record.athletes.length, 0),
    productionLinks: records.reduce((total, record) => total + record.productions.length, 0),
    events: records.length,
    activeHistoricalMissions: records.filter((record) =>
      !["completed", "closed_without_action"].includes(record.businessState)).length,
  };
};

const main = async () => {
  const mode = parseScriptMode(process.argv.slice(2));
  const target = resolvePostgresTarget();
  console.log(`Cible PostgreSQL: ${formatPostgresTargetSummary(target.summary)}`);
  const dryRun = buildDryRun();

  if (!mode.apply) {
    console.log(JSON.stringify(dryRun, null, 2));
    console.log("Dry-run uniquement. Ajoutez --apply pour exécuter la régularisation idempotente.");
    return;
  }

  console.log(`Résumé avant application: lignes_canoniques=${dryRun.events}`);
  if (!(await confirmInteractiveApply(mode))) {
    throw new Error("Confirmation refusée. Aucune donnée modifiée.");
  }

  const result = await runCreativeMissionRegularization();
  console.log(JSON.stringify(result, null, 2));
};

void main().catch((error: unknown) => {
  const operationalMessage = error instanceof Error
    && (error.message.startsWith("Cible PostgreSQL refusee")
      || error.message.startsWith("Confirmation refusée"))
    ? error.message
    : "Régularisation impossible. Consulter les journaux techniques protégés.";
  console.error(operationalMessage);
  process.exitCode = 1;
});
