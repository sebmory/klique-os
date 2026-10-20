# Tests PostgreSQL des mises en relation partenaire / athlète

Cette procédure prépare une base Neon entièrement dédiée aux tests transactionnels
du lot 2A. Elle ne doit jamais cibler une base applicative, une branche contenant
des données réelles ou un PostgreSQL local.

## Fichiers

- Repository : `C:\Users\sebas\Desktop\Klique-os\lib\partner-athlete-introductions\repository.ts`
- Tests PostgreSQL : `C:\Users\sebas\Desktop\Klique-os\tests\postgres\partner-athlete-introduction-repository.postgres.test.ts`
- Configuration Vitest dédiée : `C:\Users\sebas\Desktop\Klique-os\tests\postgres\vitest.config.ts`
- Bootstrap minimal : `C:\Users\sebas\Desktop\Klique-os\tests\postgres\partner-athlete-introduction-bootstrap.sql`
- SQL du workflow : `C:\Users\sebas\Desktop\Klique-os\db\migrations\20261020_partner_athlete_introduction_foundations_v1.sql`

## Prérequis et limites

- La CLI officielle `neon` version 4.9.0 ou supérieure doit être installée et
  authentifiée avec une clé limitée à une organisation de test. Cette version
  minimale est requise pour garantir que `--no-secrets` est pris en compte.
- La procédure a été validée avec Node.js `v24.19.0` et la CLI Neon `8.8.0`.
  Aucun `psql` natif n'est installé. La procédure force le client `psql`
  TypeScript intégré avec `NEONCTL_PSQL_FALLBACK=1`.
- Sous Windows PowerShell, les arguments placés après `--` n'ont pas été
  transmis correctement au client intégré. L'appel validé passe donc par
  `cmd.exe`, sans exposer la chaîne de connexion.
- Le projet créé doit être neuf et vide. Ne pas créer une branche depuis un
  projet applicatif : une branche Neon recopierait ses données.
- Le bootstrap reproduit les tables et colonnes réellement consommées par le
  repository. La création initiale de `user_access` n'existe pas dans les
  migrations inspectées ; sa définition de test est dérivée des lectures et
  insertions du code. Ce bootstrap ne prouve pas la parité avec un éventuel
  schéma de production non présent dans le dépôt.
- Le test utilise l'URL PostgreSQL standard d'un endpoint Neon. Le repository
  utilise le transport HTTP de `@neondatabase/serverless`; les sessions de
  contrôle interactives utilisent son client WebSocket. Un PostgreSQL local
  n'est pas une cible compatible avec cette procédure.
- `envDir: false` empêche Vitest de charger `.env`, `.env.local` et leurs
  variantes.
- Aucun nettoyage destructif n'est inclus. Le projet de test doit rester isolé
  jusqu'à une autorisation distincte de suppression.

## Variables dédiées

- `KLIQUE_PARTNER_INTRO_PG_TEST_URL`
- `KLIQUE_PARTNER_INTRO_PG_TEST_HOST`
- `KLIQUE_PARTNER_INTRO_PG_TEST_GUARD`
- `NEON_API_KEY`, exclusivement pour une organisation Neon de test

Le code de test ne lit jamais `DATABASE_URL`, `POSTGRES_URL` ou
`POSTGRES_DATABASE_URL`.

## Vérification des commandes

La documentation officielle Neon consultée confirme :

- `neon projects create` avec `--name`, `--org-id`, `--database`, `--role`,
  `--pg-version`, `--region-id`, `--no-secrets` et `--output json` ;
- `neon projects get <id> --output json` ;
- `neon databases list --project-id <id>` ;
- `neon connection-string` avec `--project-id`, `--database-name`,
  `--role-name` et `--ssl require` ;
- `neon psql` avec les mêmes sélecteurs et le transfert des arguments placés
  après `--`.

Références officielles :

- <https://neon.com/docs/cli/projects>
- <https://neon.com/docs/cli/databases>
- <https://neon.com/docs/cli/connection-string>
- <https://neon.com/docs/cli/psql>

Ces commandes et le format tabulaire de `neon databases list` ont été vérifiés
avec la CLI `8.8.0`. Le bloc refuse de continuer si la ligne
`klique_intro_test / klique_intro_test_owner` n'est pas reconnue.

## Commandes PowerShell

Remplacer tous les placeholders avant exécution. Le bloc refuse les placeholders,
une CLI absente, une cible non Neon, une base mal nommée ou une connexion sans
TLS obligatoire.

```powershell
$ErrorActionPreference = "Stop"

$Repo = "C:\Users\sebas\Desktop\Klique-os"
$RepositoryPath = Join-Path $Repo "lib\partner-athlete-introductions\repository.ts"
$PostgresTestPath = Join-Path $Repo "tests\postgres\partner-athlete-introduction-repository.postgres.test.ts"
$PostgresVitestConfigPath = Join-Path $Repo "tests\postgres\vitest.config.ts"
$BootstrapSqlPath = Join-Path $Repo "tests\postgres\partner-athlete-introduction-bootstrap.sql"
$WorkflowSqlPath = Join-Path $Repo "db\migrations\20261020_partner_athlete_introduction_foundations_v1.sql"

$env:NEON_API_KEY = "<NEON_API_KEY_DEDIE_AUX_TESTS>"
$NeonOrganizationId = "<NEON_ORGANIZATION_ID_DEDIE_AUX_TESTS>"
$NeonRegion = "aws-eu-central-1"

if ($env:NEON_API_KEY -eq "<NEON_API_KEY_DEDIE_AUX_TESTS>") {
  throw "REFUS: remplacer NEON_API_KEY par une clé dédiée aux tests."
}

if ($NeonOrganizationId -eq "<NEON_ORGANIZATION_ID_DEDIE_AUX_TESTS>") {
  throw "REFUS: remplacer NEON_ORGANIZATION_ID par l'organisation de test."
}

$NeonCommand = Get-Command "neon" -ErrorAction SilentlyContinue
if ($null -eq $NeonCommand) {
  throw "REFUS: la CLI officielle neon n'est pas installée."
}

$NeonVersionOutput = (& neon --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "REFUS: impossible de valider la CLI neon locale."
}

if ($NeonVersionOutput -notmatch "(?<version>\d+\.\d+\.\d+)") {
  throw "REFUS: version de la CLI neon illisible."
}

$NeonVersion = [version]$Matches["version"]
if ($NeonVersion -lt [version]"4.9.0") {
  throw "REFUS: neon 4.9.0 ou supérieur est requis pour --no-secrets."
}

$PsqlCommand = Get-Command "psql" -ErrorAction SilentlyContinue
if ($null -eq $PsqlCommand) {
  $env:NEONCTL_PSQL_FALLBACK = "1"
}
else {
  & psql --version | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "REFUS: le client psql local n'est pas utilisable."
  }
  $env:NEONCTL_PSQL_FALLBACK = "1"
}

$RequiredFiles = @(
  $RepositoryPath,
  $PostgresTestPath,
  $PostgresVitestConfigPath,
  $BootstrapSqlPath,
  $WorkflowSqlPath
)

foreach ($RequiredFile in $RequiredFiles) {
  if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) {
    throw "REFUS: fichier requis absent: $RequiredFile"
  }
}

$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$ProjectName = "klique-intro-pg-test-$Timestamp"
$ProvisionDirectory = Join-Path $env:TEMP "klique-intro-pg-test-provision-$Timestamp"

New-Item -ItemType Directory -Path $ProvisionDirectory | Out-Null
Set-Location $ProvisionDirectory

$ProjectJsonText = (
  & neon projects create `
  --name $ProjectName `
  --org-id $NeonOrganizationId `
  --database klique_intro_test `
  --role klique_intro_test_owner `
  --pg-version 17 `
  --region-id $NeonRegion `
  --no-secrets `
  --output json
) -join [Environment]::NewLine

if ($LASTEXITCODE -ne 0) {
  throw "Echec de création du projet Neon de test."
}

$ProjectResponse = $ProjectJsonText | ConvertFrom-Json
$CreatedProject = if ($null -ne $ProjectResponse.project) {
  $ProjectResponse.project
}
else {
  $ProjectResponse
}
$ProjectId = [string]$CreatedProject.id

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  throw "REFUS: identifiant du nouveau projet Neon absent."
}

if ([string]$CreatedProject.name -ne $ProjectName) {
  throw "REFUS: le projet créé ne correspond pas au nom demandé."
}

$VerifiedProjectJsonText = (
  & neon projects get $ProjectId --output json
) -join [Environment]::NewLine

if ($LASTEXITCODE -ne 0) {
  throw "REFUS: impossible de relire le nouveau projet Neon."
}

$VerifiedProjectResponse = $VerifiedProjectJsonText | ConvertFrom-Json
$VerifiedProject = if ($null -ne $VerifiedProjectResponse.project) {
  $VerifiedProjectResponse.project
}
else {
  $VerifiedProjectResponse
}

if (
  [string]$VerifiedProject.id -ne $ProjectId -or
  [string]$VerifiedProject.name -ne $ProjectName
) {
  throw "REFUS: l'identité du projet Neon relu ne correspond pas."
}

$DatabaseListText = (
  & neon databases list --project-id $ProjectId
) -join [Environment]::NewLine

if ($LASTEXITCODE -ne 0) {
  throw "REFUS: impossible de vérifier les bases du nouveau projet."
}

if (
  $DatabaseListText -notmatch "(?m)^\s*klique_intro_test\s+klique_intro_test_owner(?:\s|$)"
) {
  throw "REFUS: la base ou son propriétaire n'appartient pas au nouveau projet."
}

$env:KLIQUE_PARTNER_INTRO_PG_TEST_URL = (
  & neon connection-string `
    --project-id $ProjectId `
    --database-name klique_intro_test `
    --role-name klique_intro_test_owner `
    --ssl require
).Trim()

if ($LASTEXITCODE -ne 0) {
  throw "Echec d'obtention de l'URL Neon de test."
}

if ([string]::IsNullOrWhiteSpace($env:KLIQUE_PARTNER_INTRO_PG_TEST_URL)) {
  throw "REFUS: URL Neon de test vide."
}

$TestUri = [System.Uri]$env:KLIQUE_PARTNER_INTRO_PG_TEST_URL
$env:KLIQUE_PARTNER_INTRO_PG_TEST_HOST = $TestUri.DnsSafeHost

if ($TestUri.Scheme -ne "postgresql") {
  throw "REFUS: le protocole doit être postgresql."
}

if ([string]::IsNullOrWhiteSpace($TestUri.UserInfo)) {
  throw "REFUS: l'URL ne contient pas de rôle PostgreSQL."
}

if (-not $TestUri.DnsSafeHost.EndsWith(".neon.tech")) {
  throw "REFUS: la cible n'est pas un endpoint Neon."
}

if ($TestUri.AbsolutePath -ne "/klique_intro_test") {
  throw "REFUS: la base doit être exactement klique_intro_test."
}

if (-not $TestUri.Query.Contains("sslmode=require")) {
  throw "REFUS: sslmode=require est obligatoire."
}

$VerifiedConnectionUrl = (
  & neon connection-string `
    --project-id $ProjectId `
    --database-name klique_intro_test `
    --role-name klique_intro_test_owner `
    --ssl require
).Trim()

if ($LASTEXITCODE -ne 0) {
  throw "REFUS: impossible de revérifier l'endpoint du nouveau projet."
}

$VerifiedUri = [System.Uri]$VerifiedConnectionUrl
if (
  $VerifiedUri.DnsSafeHost -ne $TestUri.DnsSafeHost -or
  $VerifiedUri.AbsolutePath -ne "/klique_intro_test"
) {
  throw "REFUS: l'endpoint ou la base ne correspond pas au projet explicitement ciblé."
}

$env:NEONCTL_PSQL_FALLBACK = "1"
$PsqlArguments = (
  "neon psql --project-id $ProjectId " +
  "--database-name klique_intro_test " +
  "--role-name klique_intro_test_owner --ssl require -- " +
  "--set=ON_ERROR_STOP=1 " +
  "-f `"$BootstrapSqlPath`" -f `"$WorkflowSqlPath`""
)

& $env:ComSpec /d /s /c $PsqlArguments

if ($LASTEXITCODE -ne 0) {
  throw "Echec du bootstrap ou du SQL du workflow."
}

Set-Location $Repo

$env:KLIQUE_PARTNER_INTRO_PG_TEST_GUARD = (
  node -e @'
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.KLIQUE_PARTNER_INTRO_PG_TEST_URL);
(async () => {
  const rows = await sql`
    SELECT current_database() AS database_name, guard_token
    FROM partner_intro_test_guard
    WHERE singleton = TRUE
  `;
  if (
    rows.length !== 1
    || rows[0].database_name !== "klique_intro_test"
    || typeof rows[0].guard_token !== "string"
    || rows[0].guard_token.length < 32
  ) process.exit(2);
  process.stdout.write(rows[0].guard_token);
})().catch(() => process.exit(3));
'@
).Trim()

if (
  $LASTEXITCODE -ne 0 -or
  [string]::IsNullOrWhiteSpace($env:KLIQUE_PARTNER_INTRO_PG_TEST_GUARD)
) {
  throw "REFUS: sentinelle PostgreSQL invalide."
}

& ".\node_modules\.bin\vitest.cmd" run `
  --config "$PostgresVitestConfigPath" `
  "$PostgresTestPath"

if ($LASTEXITCODE -ne 0) {
  throw "La suite PostgreSQL dédiée a échoué."
}
```

## Preuve déterministe des verrous

Pour le verrou de création et le verrou commun réponse/modération :

1. une session WebSocket interactive commence une transaction ;
2. elle acquiert exactement le verrou utilisé par le repository ;
3. l'opération réelle du repository démarre sur un client HTTP distinct ;
4. une troisième session interroge `pg_stat_activity` et
   `pg_blocking_pids` ;
5. le test exige le PID exact du bloqueur, un PID bloqué différent,
   `wait_event_type = 'Lock'` et un `wait_event` renseigné ;
6. la première session exécute `COMMIT` ;
7. l'opération du repository doit alors se terminer avec le résultat métier
   attendu.

L'observation est bornée à 5 secondes et chaque opération à 10 secondes.
Les blocs `finally` exécutent un `ROLLBACK` si nécessaire et ferment les
sessions, même après une assertion ou une erreur. Aucun hook n'est ajouté au
code applicatif.

## Résultats attendus

La suite PostgreSQL doit valider :

- attente observée sur le verrou consultatif partenaire de création ;
- attente observée sur le verrou de ligne commun à la réponse et la modération ;
- créations concurrentes ;
- acceptation/refus concurrents ;
- réponse/suspension ;
- désactivation/création ;
- rollback demande/événement/outbox ;
- reprise et concurrence des processeurs d'outbox ;
- rejeu après suspension sans projection du contact au partenaire.

Les résultats locaux sans base PostgreSQL ne prouvent que la compilation, le
lint, les contrôles statiques et la configuration d'isolement. La preuve
transactionnelle nécessite l'exécution ultérieure sur le projet Neon jetable,
après autorisation explicite.
