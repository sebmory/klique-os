// Diagnostic lecture seule: aucune ecriture SQL, aucune modification d acces.
import { neon } from "@neondatabase/serverless";
// @clerk/backend fonctionne hors Next.js, contrairement a @clerk/nextjs/server.
import { createClerkClient } from "@clerk/backend";
import { getAthletesFromGoogleSheets } from "../lib/google-sheets";
import { formatPostgresTargetSummary, resolvePostgresTarget } from "../lib/postgres-config";
import { confirmInteractiveApply, parseScriptMode } from "../lib/production-script-safety";

const normalizeEmail = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

type UserAccessRow = {
  clerk_user_id: string;
  role: string;
  status: string;
  workspace_id: string;
  athlete_id: string | null;
};

const main = async () => {
  const mode = parseScriptMode(process.argv.slice(2));
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY manquant.");
  }

  const target = resolvePostgresTarget();
  console.log(`Cible PostgreSQL: ${formatPostgresTargetSummary(target.summary)}`);
  const sql = neon(target.databaseUrl);
  const clerk = createClerkClient({ secretKey });

  const athletes = await getAthletesFromGoogleSheets();
  const athletesByEmail = new Map<string, Array<{ athleteId: string; name: string }>>();

  for (const athlete of athletes) {
    const email = normalizeEmail(athlete.email);
    if (!email) continue;
    const entry = { athleteId: athlete.athleteId ?? athlete.key ?? "", name: athlete.name };
    const existing = athletesByEmail.get(email);
    if (existing) existing.push(entry);
    else athletesByEmail.set(email, [entry]);
  }

  const accessRows = (await sql`
    SELECT clerk_user_id, role, status, workspace_id, athlete_id
    FROM user_access
  `) as UserAccessRow[];
  const accessByClerkUserId = new Map(accessRows.map((row) => [row.clerk_user_id, row]));

  let matched = 0;
  let unmatched = 0;
  let ambiguous = 0;
  const insertable: Array<{ clerkUserId: string; email: string; athleteId: string }> = [];

  let offset = 0;
  const limit = 100;

  for (;;) {
    const page = await clerk.users.getUserList({ limit, offset });
    if (!page.data.length) break;

    for (const user of page.data) {
      const verifiedEmails = user.emailAddresses
        .filter((item) => item.verification?.status === "verified")
        .map((item) => normalizeEmail(item.emailAddress))
        .filter(Boolean);

      const hit = verifiedEmails.map((email) => ({ email, entries: athletesByEmail.get(email) ?? [] })).find((row) => row.entries.length > 0);

      if (!hit) {
        unmatched += 1;
        continue;
      }

      const access = accessByClerkUserId.get(user.id);

      if (hit.entries.length > 1) {
        ambiguous += 1;
        continue;
      }

      matched += 1;

      if (!access && hit.entries[0].athleteId) {
        const rawVerifiedEmail = user.emailAddresses.find(
          (item) => item.verification?.status === "verified" && normalizeEmail(item.emailAddress) === hit.email
        )?.emailAddress;
        if (rawVerifiedEmail) {
          insertable.push({ clerkUserId: user.id, email: rawVerifiedEmail, athleteId: hit.entries[0].athleteId });
        }
      }
    }

    if (page.data.length < limit) break;
    offset += limit;
  }

  console.log(
    `Résumé: correspondances=${matched} ambigues=${ambiguous} sans_correspondance=${unmatched} lignes_candidates=${insertable.length}`,
  );

  if (!mode.apply) {
    console.log("Dry-run termine. Aucune donnee modifiee; utilisez --apply pour ecrire.");
    return;
  }

  if (!insertable.length) {
    console.log("\nMode --apply: aucun acces a creer.");
    return;
  }

  const workspaceId = process.env.KLIQUE_DEFAULT_WORKSPACE_ID?.trim() ?? "";
  if (!workspaceId) {
    throw new Error("KLIQUE_DEFAULT_WORKSPACE_ID manquant: impossible de determiner le workspace cible.");
  }

  const knownWorkspaces = new Set(accessRows.map((row) => row.workspace_id));
  if (!knownWorkspaces.has(workspaceId)) {
    throw new Error("Workspace cible introuvable dans user_access: creation annulee.");
  }

  if (!(await confirmInteractiveApply(mode))) {
    throw new Error("Confirmation refusee: aucune donnee modifiee.");
  }

  const transactionResults = await sql.transaction(
    insertable.map(
      (entry) => sql`
        INSERT INTO user_access (
          clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at
        ) VALUES (
          ${entry.clerkUserId}, ${entry.email}, 'athlete', ${workspaceId}, ${entry.athleteId}, NULL, NULL, 'active', NOW(), NOW()
        )
        ON CONFLICT (clerk_user_id) DO NOTHING
        RETURNING clerk_user_id
      `
    )
  );

  const inserted = transactionResults.reduce((count, rows) => count + rows.length, 0);
  console.log(`Application terminee: lignes_inserees=${inserted}. Aucun UPDATE ni DELETE.`);
};

main().catch((error) => {
  const operationalMessage = error instanceof Error
    && (error.message.startsWith("Cible PostgreSQL refusee")
      || error.message.startsWith("Confirmation refusee"))
    ? error.message
    : "Diagnostic en echec. Consulter les journaux techniques proteges.";
  console.error(operationalMessage);
  process.exitCode = 1;
});
