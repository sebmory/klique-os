# 04_DATABASE

Ce document structure la documentation liée aux données.
Il couvre le modèle, les conventions et les règles de gestion.

## Statut
En cours de rédaction.

## Realisations Admin d'une adhesion

La migration [20261013_admin_membership_realization_reversals.sql](../db/migrations/20261013_admin_membership_realization_reversals.sql)
ajoute la provenance serveur `is_admin_membership_realization`. Son backfill
ne marque que la signature exacte du workflow Admin (metadonnees, dates,
snapshot de 1 droit, produit et mouvement usage coherent). Les demandes
ordinaires et les contenus historiques ne sont pas convertis. Le backfill
ne change que ce marqueur, pas les donnees initiales.

Une demande marquee reste `completed` et devient immuable. L'annulation
est un nouveau mouvement immuable `usage_reversal`, de quantite +1, avec
une FK unique vers la realisation, le motif obligatoire et l'identifiant Clerk
de l'Admin. Son `created_at` est la date d'annulation. Aucun usage, grant,
snapshot ou enregistrement initial n'est reecrit.

Le quota et les reservations restent inchanges ; l'utilisation nette diminue
de 1 et le disponible augmente de 1. La compensation n'est pas un entitlement
et n'a pas d'expiration propre : elle neutralise l'usage original, sans
prolonger les grants. Une premiere annulation est refusee si l'adhesion est
inactive/expiree ou si le disponible brut est negatif.

Le service verrouille d'abord l'adhesion, puis lit et ecrit sous
`ReadCommitted`, dans la meme transaction. Un rejeu avec le meme motif
normalise retourne la compensation existante ; un autre motif produit un
conflit. La creation verifie aussi les scopes, la provenance, les donnees
initiales et l'absence d'annulation avant de retourner `unchanged`.

Le GET Admin de l'adhesion retourne `realizations`, y compris les annulations.
Le POST `membership/realizations/{realizationId}/cancel` accepte uniquement
`membershipId` et `reason`. Workspace et auteur viennent de la session d'un
Admin actif. La reponse fournit l'historique et `serviceSummary` recalcules.
Si cette lecture echoue apres le commit, `refreshError` signale explicitement
que l'annulation est enregistree et qu'il faut rafraichir.

Cette migration doit etre appliquee par le processus habituel avant d'utiliser
ces routes. Les tests locaux couvrent les contrats SQL, services, API, UI et
calculs ; ils ne prouvent pas la concurrence PostgreSQL. Aucun environnement
PostgreSQL isole avec rollback n'est actuellement configure dans les tests.
