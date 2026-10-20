# Mises en relation — exploitation et validation du Lot 3

## Conditions exactes d’activation

Le workflow reste désactivé tant que la variable serveur suivante n’est pas exactement définie :

```text
KLIQUE_PARTNER_ATHLETE_INTRODUCTIONS_ENABLED=true
```

Prérequis obligatoires avant de définir cette valeur :

1. migration du workflow appliquée et vérifiée dans l’environnement ciblé ;
   cela inclut `db/migrations/20261020_partner_athlete_introduction_admin_supervision_v1.sql` après la migration de fondation ;
2. `KLIQUE_CONTACT_REFERENCE_SECRET` configuré avec un secret serveur d’au moins 32 caractères ;
3. `KLIQUE_PARTNER_INTRODUCTION_OUTBOX_SECRET` configuré avec un secret serveur distinct ;
4. identités Clerk de l’environnement reliées à des lignes `user_access` fictives et isolées ;
5. profils partenaire et athlète fictifs disponibles dans une source non productive.

`PARTNER_REQUEST_STALE_DAYS` est facultative. Sa valeur par défaut est `5`; une valeur fournie doit être un entier de 1 à 365.

Aucune valeur de secret ne doit être exposée au navigateur, aux journaux ou à la documentation.

## Outbox

Le point d’appel réel est :

```text
POST /api/internal/partner-introduction-outbox
Authorization: Bearer <KLIQUE_PARTNER_INTRODUCTION_OUTBOX_SECRET>
```

Il renvoie `404` si le workflow est désactivé et `401` si l’authentification interne est absente ou invalide. Aucun cron n’est activé par le dépôt.

Après validation applicative, un planificateur serveur privé pourra appeler cette route à intervalle court. Chaque invocation utilise un identifiant de worker distinct. L’acquisition `FOR UPDATE SKIP LOCKED`, les verrous expirables, le nombre maximal de tentatives, la reprise exponentielle et la déduplication par événement/destinataire restent ceux du Lot 2A.

La visibilité actuelle des échecs repose sur le résultat agrégé de l’appel (`claimed`, `delivered`, `discarded`, `retried`, `failed`) et les statuts de l’outbox. Une alerte d’exploitation sur les lignes `failed` et les lignes `pending` anciennes reste à mettre en place avant activation.

## Validation manuelle réalisée

Le parcours applicatif isolé a été validé le 20 octobre 2026 avec des identités,
profils et données exclusivement fictifs :

- création d’une demande par le partenaire ;
- acceptation avec consentement Instagram et notification du partenaire ;
- refus d’une seconde demande, sans partage de contact, et notification du partenaire ;
- affichage des deux demandes dans le cockpit Admin ;
- suspension de la demande acceptée avec événement d’audit ;
- disparition du contact dans l’interface Partenaire et dans sa réponse API après rechargement.

Les notifications d’acceptation et de refus ne contenaient aucune coordonnée.

## Étapes restantes avant mise en service

1. Appliquer, sur la base applicative ciblée et après sauvegarde, les migrations
   `db/migrations/20261020_partner_athlete_introduction_foundations_v1.sql`, puis
   `db/migrations/20261020_partner_athlete_introduction_admin_supervision_v1.sql`.
2. Configurer les secrets serveur `KLIQUE_CONTACT_REFERENCE_SECRET` et
   `KLIQUE_PARTNER_INTRODUCTION_OUTBOX_SECRET`, puis activer exactement
   `KLIQUE_PARTNER_ATHLETE_INTRODUCTIONS_ENABLED=true`.
3. Configurer un planificateur serveur privé appelant régulièrement
   `POST /api/internal/partner-introduction-outbox` avec son authentification
   Bearer. Surveiller les compteurs d’exécution ainsi que les événements
   `failed` et `pending` anciens.
4. Inventorier les demandes historiques et simuler leur transition avant toute
   écriture. Vérifier pour chacune les correspondances partenaire, athlète et
   workspace, isoler les cas ambigus et conserver l’historique. Une opération
   séparée et explicitement autorisée pourra seulement rendre les demandes
   éligibles à une réponse de l’athlète : aucune acceptation automatique,
   suppression ou notification rétroactive ne doit avoir lieu.

Note UX à traiter séparément : simplifier le libellé
« Préparer mon contact Instagram » sans modifier le mécanisme de consentement.

## Checklist manuelle

### Admin

1. Vérifier que le bloc de supervision est absent quand le workflow est désactivé.
2. Vérifier les six compteurs et chaque filtre sur `/today`.
3. Vérifier les noms publics, le motif, les deux états et l’ancienneté.
4. Ouvrir le détail et vérifier l’absence totale de contact Instagram.
5. Suspendre puis réactiver avec deux motifs distincts; vérifier l’historique et l’absence de modification du consentement.
6. Désactiver puis rétablir les sollicitations; vérifier qu’aucune demande suspendue n’est réactivée.
7. Traiter un signalement et vérifier l’événement d’audit.
8. Tenter une action `accept` ou `decline` sur la route Admin et vérifier son refus.

### Athlète

1. Ouvrir une demande qui lui appartient et envoyer un signalement.
2. Vérifier le motif obligatoire, le commentaire facultatif et la confirmation.
3. Répéter avec la même clé d’idempotence; vérifier l’absence de doublon.
4. Vérifier qu’un autre athlète et un autre workspace reçoivent un refus.

### Partenaire

1. Vérifier qu’une suspension masque immédiatement le contact dans le détail.
2. Vérifier que la réactivation ne crée ni nouvelle acceptation ni nouveau consentement.
3. Vérifier qu’un droit de sollicitation désactivé bloque seulement les nouvelles demandes.

## Environnement applicatif isolé proposé

Les cinq couches suivantes doivent être séparées de la production :

1. **Authentification de test** — instance Clerk de développement dédiée, avec comptes Admin, Athlète et Partenaire fictifs. Aucun identifiant Clerk réel ne doit être réutilisé.
2. **Base de test** — projet Neon dédié à l’application de validation, distinct du projet PostgreSQL transactionnel du Lot 2A et de toute branche applicative. La connexion doit être fournie par une variable explicitement dédiée, sans fallback vers une variable de production.
3. **Profils fictifs** — adaptateur de répertoire ou copies de feuilles Google entièrement fictives, dans un compte de test. Ne pas connecter l’application de test aux Google Sheets réelles.
4. **Configuration du workflow** — migration appliquée dans cette seule base, secrets propres à l’environnement et activation exacte après contrôles de schéma, workspace et identités.
5. **Notifications** — outbox locale à cette base, route interne protégée par un secret de test et déclenchement manuel au départ. Le planificateur régulier ne doit être activé qu’après validation de la reprise et de la déduplication.

Le projet Neon transactionnel existant ne doit pas être branché directement à l’application avec Clerk ou Google Sheets réels. Une validation bout en bout exige les cinq couches fictives ensemble.

## Limites avant activation

- aucune migration n’a été exécutée sur une base applicative réelle ;
- le commentaire distinct et les nouveaux types d’événements de traitement des signalements nécessitent le schéma SQL mis à jour ;
- les tests PostgreSQL devront être relancés dans une validation dédiée, car les transactions de signalement et de traitement ont été ajoutées ;
- les notifications ne sont pas opérationnelles tant qu’un déclencheur authentifié n’est pas configuré et testé ;
- aucune conversion ou notification des demandes historiques n’est prévue.
