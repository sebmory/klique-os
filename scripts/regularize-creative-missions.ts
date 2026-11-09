import { runCreativeMissionRegularization } from "@/lib/creative-mission-regularization";
import { buildCreativeMissionRegularizationPayload } from "@/fixtures/creative-mission-regularization";

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
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify(buildDryRun(), null, 2));
    console.log("Dry-run uniquement. Ajoutez --apply pour exécuter la régularisation idempotente.");
    return;
  }

  const result = await runCreativeMissionRegularization();
  console.log(JSON.stringify(result, null, 2));
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Régularisation impossible.");
  process.exitCode = 1;
});
