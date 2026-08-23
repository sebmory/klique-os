// Diagnostic lecture seule: aucune ecriture SQL, aucune modification d acces.
import { neon } from "@neondatabase/serverless";
// @clerk/backend fonctionne hors Next.js, contrairement a @clerk/nextjs/server.
import { createClerkClient } from "@clerk/backend";
import { getAthletesFromGoogleSheets } from "../lib/google-sheets";

const normalizeEmail = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// Masque l adresse pour ne jamais journaliser une donnee complete.
const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
};

type UserAccessRow = {
  clerk_user_id: string;
  role: string;
  status: string;
  workspace_id: string;
  athlete_id: string | null;
};

const resolveDatabaseUrl = (): string => {
  const url =
    process.env.POSTGRES_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    "";
  if (!url) {
    throw new Error("Base non configuree: definir POSTGRES_DATABASE_URL, DATABASE_URL ou POSTGRES_URL.");
  }
  return url;
};

const main = async () => {
  const applyMode = process.argv.includes("--apply");
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY manquant.");
  }

  const sql = neon(resolveDatabaseUrl());
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

  const matched: string[] = [];
  const unmatched: string[] = [];
  const ambiguous: string[] = [];
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
        unmatched.push(`${user.id} | ${verifiedEmails.map(maskEmail).join(", ") || "aucun e-mail verifie"}`);
        continue;
      }

      const access = accessByClerkUserId.get(user.id);
      const accessLabel = access
        ? `role=${access.role} status=${access.status} workspace=${access.workspace_id} athlete_id=${access.athlete_id ?? "-"}`
        : "aucune ligne user_access";

      if (hit.entries.length > 1) {
        ambiguous.push(`${user.id} | ${maskEmail(hit.email)} | ${hit.entries.length} athletes | ${accessLabel}`);
        continue;
      }

      matched.push(`${user.id} | ${maskEmail(hit.email)} | athleteId=${hit.entries[0].athleteId || "-"} | ${accessLabel}`);

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

  console.log(`\n=== Correspondances exactes (${matched.length}) ===`);
  matched.forEach((line) => console.log(line));

  console.log(`\n=== Correspondances ambigues (${ambiguous.length}) ===`);
  ambiguous.forEach((line) => console.log(line));

  console.log(`\n=== Utilisateurs sans correspondance (${unmatched.length}) ===`);
  unmatched.forEach((line) => console.log(line));

  if (!applyMode) {
    console.log(`\nAcces creables avec --apply: ${insertable.length}`);
    console.log("\nDiagnostic lecture seule termine. Aucune donnee modifiee.");
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

  // Insertions uniquement, dans une seule transaction atomique.
  await sql.transaction(
    insertable.map(
      (entry) => sql`
        INSERT INTO user_access (
          clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at
        ) VALUES (
          ${entry.clerkUserId}, ${entry.email}, 'athlete', ${workspaceId}, ${entry.athleteId}, NULL, NULL, 'active', NOW(), NOW()
        )
        ON CONFLICT (clerk_user_id) DO NOTHING
      `
    )
  );

  console.log(`\n=== Acces athletes crees (${insertable.length}) ===`);
  insertable.forEach((entry) => console.log(`${entry.clerkUserId} | ${maskEmail(normalizeEmail(entry.email))} | athleteId=${entry.athleteId}`));
  console.log(`\nTotal cree: ${insertable.length}. Aucun UPDATE ni DELETE effectue.`);
};

main().catch((error) => {
  console.error("Diagnostic en echec:", error instanceof Error ? error.message : "erreur inconnue");
  process.exitCode = 1;
});
