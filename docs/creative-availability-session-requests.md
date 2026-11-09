# Disponibilites creatives et demandes de seances

## Perimetre

Ce lot ajoute :

- des disponibilites structurees pour les creatifs, modifiables par leur proprietaire ou un Admin ;
- des demandes Athletes de type match/competition ou Media Day ;
- une revue Admin explicite avant tout rattachement au parcours Production ;
- une synchronisation avec les briefs, candidatures, attributions, confirmations et livraisons creatives existants.

Il n'ajoute ni paiement, ni consommation automatique de droit, ni attribution automatique, ni ecriture Google Sheets, ni notification externe.

## Modele de donnees

La migration additive `db/migrations/20261109_creative_availability_session_requests_v1.sql` cree :

- `creative_availability_rules` et `creative_availability_exceptions` ;
- `athlete_session_requests` et `athlete_session_request_periods` ;
- `athlete_session_request_events`, journal append-only des transitions ;
- `athlete_session_confirmed_creative_slots`, verrou persistant contre les confirmations concurrentes.

Les disponibilites utilisent le fuseau obligatoire `Europe/Zurich`. Les instants de demande et de mission sont stockes en `TIMESTAMPTZ`. Les recurrences hebdomadaires sont bornees a un an et peuvent avoir des exceptions.

Les donnees sont isolees par `workspace_id`. Les acces Athlete et Creatif sont en plus limites a l'identite Clerk authentifiee. Les routes Admin utilisent le contexte Admin existant.

## Workflow

Une demande suit des etats explicites :

`draft` -> `submitted` -> `admin_review` -> `accepted` ou `refused` ou `changes_requested`.

Une demande acceptee peut ensuite etre rattachee explicitement a un `production_creative_brief` :

`production_linked` -> `proposed_to_creatives` -> `candidate_received` -> `assigned` -> `creative_agreed` -> `confirmed` -> `completed`.

L'Athlete peut annuler une demande avant sa confirmation finale. Chaque transition possede une cle d'idempotence et produit un evenement immuable. Le brief Production est relie par `origin_type = 'athlete_session_request'` et `origin_request_id`, jamais par un numero de ligne Google Sheets.

Une disponibilite n'est ni une reservation ni une attribution. Seules les missions finalement confirmees produisent un conflit. La confirmation finale verrouille transactionnellement la demande, le brief et l'attribution, puis reserve de maniere unique le couple creatif/date.

## Conditions commerciales

Pour une couverture de match, le serveur lit le catalogue, le plan et les droits existants afin d'afficher le droit disponible ou le prix connu. Aucun droit n'est consomme lors de la demande.

Pour un Media Day, la demande indique `decision Admin requise`. Le systeme n'invente ni quota ni gratuite. Les conditions Athlete restent distinctes des conditions financieres du creatif portees par le brief Production.

## Interfaces et API

- Athlete : `/athlete/services` et `/api/athlete/session-requests`
- Admin : `/today`, `/calendar`, `/api/admin/session-requests` et `/api/admin/creative-availability`
- Creatif : espace Creatifs et `/api/creative/availability`

L'API Athlete ne retourne jamais le calendrier consolide, les disponibilites ni l'identite des creatifs.

## Migration et validation

1. Appliquer la migration sur une branche Neon Test fraiche derivee de Production.
2. Executer les tests locaux cibles :
   `npx vitest run tests/creative-availability-session-requests.test.ts tests/session-request-access.test.ts tests/creative-session-ui.test.tsx`
3. Definir `CREATIVE_SESSION_TEST_DATABASE_URL` vers la branche Test et executer :
   `npx vitest run tests/postgres/creative-availability-session-requests.postgres.test.ts`
4. Verifier TypeScript, ESLint, le build Next.js et `git diff --check`.
5. Confirmer la suppression des fixtures, puis supprimer la branche Neon Test et le fichier local contenant son URL.

Les tests PostgreSQL couvrent l'isolation inter-workspace, les doublons, les recurrences et exceptions, l'immutabilite du journal, la concurrence de confirmation et le parcours complet jusqu'a la confirmation finale.

La migration Production doit faire l'objet d'une autorisation separee. Elle ne declenche aucune publication Google Sheets ni notification reelle.
