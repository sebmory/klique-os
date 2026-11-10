# Sécurité des données de production

## Cibles et identités

- **Clerk** fournit les identités. Utiliser une instance/profil de test pour les essais.
- **Neon** est la source PostgreSQL. `DATABASE_URL` est la variable canonique;
  `POSTGRES_DATABASE_URL` et `POSTGRES_URL` restent des aliases de compatibilité.
  Ne pas modifier les valeurs injectées par Vercel.
- **Google Sheets** reste une source métier externe: tester avec un classeur/profil
  dédié, jamais avec des données personnelles de production.

En Production, le helper central refuse une cible non-Neon, une base autre que
`neondb`, des aliases visant des cibles différentes, ou une branche connue
inattendue. Les attentes peuvent être explicitées avec
`KLIQUE_POSTGRES_EXPECTED_HOSTNAME`, `KLIQUE_POSTGRES_EXPECTED_DATABASE` et
`KLIQUE_POSTGRES_EXPECTED_BRANCH` (`NEON_BRANCH_NAME` fournit la branche observée).
`KLIQUE_POSTGRES_EXPECTED_ENVIRONMENT` peut aussi verrouiller `VERCEL_ENV`.
Les résumés n'affichent ni URL, ni identifiant, ni secret.

## Écritures opérateur

`scripts/reconcile-athlete-access.ts` et
`scripts/regularize-creative-missions.ts` sont en **dry-run par défaut**.
L'écriture exige `--apply`; une confirmation est demandée uniquement dans un
terminal interactif (`--yes` permet une automatisation déjà contrôlée). Toute
incohérence de cible bloque avant l'écriture, exécutée atomiquement.

Pour les tests, combiner profils Clerk de test, branche Neon de test et Sheets de
test. Les suites PostgreSQL existantes conservent leurs variables dédiées et ne
doivent jamais pointer vers Production. L'outil de régularisation est idempotent:
examiner d'abord son résumé dry-run, puis seulement relancer avec `--apply`.
