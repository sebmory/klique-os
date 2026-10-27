# KLIQUE Platform
**Document :** Stack technologique

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour tous les choix techniques de KLIQUE Platform.

---

# Objectif
KLIQUE Platform repose sur une stack moderne, évolutive et adaptée à une plateforme SaaS.

Cette stack doit permettre :

- une évolution rapide
- une maintenance simple
- des performances élevées
- une excellente expérience développeur
- une forte scalabilité
Ce document définit les technologies de référence.

---

# Principe fondamental
Les choix techniques doivent servir l'architecture.

Une technologie n'est retenue que si elle améliore :

- la maintenabilité
- la lisibilité
- la performance
- la stabilité
- l'évolutivité
Les effets de mode ne constituent jamais un critère de sélection.

---

# Architecture générale
KLIQUE Platform repose sur une architecture Full Stack moderne.

```
Frontend
      │
API
      │
Services
      │
Base de données
      │
Stockage
```
Chaque couche possède une responsabilité clairement définie.

---

# Frontend
Technologie officielle :

- Next.js
Langage :

- TypeScript
Le Frontend est responsable :

- de l'interface utilisateur
- de l'expérience utilisateur
- de la navigation
- de la communication avec les API
Toute logique métier reste côté serveur.

---

# Backend
Technologie officielle :

- NestJS
Langage :

- TypeScript
Le Backend est responsable :

- des règles métier
- des API
- des permissions
- des intégrations
- des traitements

---

# Langage
Le langage officiel est :

- TypeScript
L'objectif est d'utiliser le même langage sur le Frontend et le Backend afin de réduire la complexité.

---

# Base de données
Base principale :

- PostgreSQL
La base relationnelle constitue la source de vérité de la plateforme.

---

# ORM
ORM officiel :

- Prisma
Prisma est responsable :

- des modèles
- des migrations
- des requêtes
- de la cohérence du schéma

---

# Cache
Technologie recommandée :

- Redis
Redis est utilisé notamment pour :

- cache
- sessions
- files d'attente
- limitations
- données temporaires
Redis n'est jamais une source de vérité.

---

# Stockage des médias
Le stockage doit être abstrait.

Exemples possibles :

- Amazon S3
- Cloudflare R2
- stockage compatible S3
Le changement de fournisseur ne doit pas modifier les domaines métiers.

---

# Recherche
La recherche peut être assurée par un moteur spécialisé.

Exemples :

- PostgreSQL Full Text
- Meilisearch
- Elasticsearch
Le choix dépendra des besoins réels.

Les domaines produits restent indépendants du moteur utilisé.

---

# Authentification
L'authentification est centralisée.

Elle doit supporter :

- OAuth
- e-mail
- mot de passe
- MFA
Le choix précis pourra évoluer sans modifier les domaines métiers.

---

# API
Les API internes utilisent principalement :

- REST
Des évolutions futures pourront inclure :

- GraphQL
- gRPC
Le choix dépend des besoins.

---

# Temps réel
Les communications temps réel utilisent notamment :

- WebSockets
Exemples :

- Hub
- notifications
- présence
- collaboration

---

# Files d'attente
Technologie recommandée :

- BullMQ
Basée sur Redis.

Utilisée notamment pour :

- IA
- imports
- exports
- synchronisations
- traitements lourds

---

# Intelligence artificielle
Les modèles IA sont accessibles via le service Integrations.

Les fournisseurs restent interchangeables.

Exemples :

- OpenAI
- Anthropic
- Google AI
- Mistral
Les domaines métiers ignorent le fournisseur utilisé.

---

# Infrastructure
La plateforme doit pouvoir fonctionner :

- cloud
- hybride
- auto-hébergée
L'architecture reste indépendante du fournisseur.

---

# Conteneurs
Technologie officielle :

- Docker
Les conteneurs assurent la reproductibilité des environnements.

---

# Orchestration
À long terme, la plateforme doit pouvoir fonctionner sur :

- Kubernetes
Ce choix facilite la montée en charge.

---

# CI/CD
Les pipelines doivent être automatisés.

Ils comprennent notamment :

- compilation
- tests
- analyse qualité
- déploiement
Les pipelines restent indépendants du fournisseur.

---

# Tests
La stratégie comprend notamment :

- tests unitaires
- tests d'intégration
- tests fonctionnels
- tests end-to-end
Les tests automatisés sont obligatoires.

---

# Qualité du code
Le projet utilise notamment :

- ESLint
- Prettier
Les conventions sont communes à toute l'équipe.

---

# Documentation
La documentation technique est versionnée avec le projet.

Elle comprend notamment :

- architecture
- API
- décisions techniques
- conventions
La documentation est considérée comme du code.

---

# Gestion des versions
Le projet utilise Git.

Les conventions de branches restent documentées séparément.

Les commits doivent rester lisibles et cohérents.

---

# Variables d'environnement
Les configurations utilisent des variables d'environnement.

Aucun secret ne doit être présent dans le code source.

## Brouillons Article durables

`KLIQUE_ARTICLE_CREATION_DRAFTS_ENABLED=true` active la sauvegarde serveur privée
des brouillons Article. Toute valeur différente, ou l'absence de la variable,
laisse la fonctionnalité désactivée et ne consulte pas la table
`article_creation_drafts`.

L'activation exige l'application préalable de la migration
`20261021_article_creation_drafts_v1.sql`. Une activation sans ce schéma doit
rester une erreur explicite et ne doit jamais être présentée comme un
enregistrement réussi.

## Veille sportive manuelle

`KLIQUE_SPORTS_WATCH_ENABLED=true` active le bloc Admin de veille sportive.
Il propose la source éditoriale BC Bulle, des profils officiels Swiss
Badminton / Tournamentsoftware et des profils IWWF configurés par workspace
et athlète CRM, ainsi que le flux officiel Kenpokan Dojo avec sélection
explicite de l'athlète CRM au lancement et les calendriers collectifs SAFV.
Le sélecteur limite les fiches proposées au sport de la source : badminton
pour BC Bulle et Swiss Badminton, wakesurf pour IWWF, kempo pour Kenpokan et
football américain pour SAFV. La normalisation conserve les profils
multisports, sans utiliser le club ni exiger un rattachement déjà configuré.
Chaque rattachement doit être vérifié puis confirmé explicitement par un Admin.
La confirmation, la modification et la réactivation relisent la source côté
serveur ; les preuves du navigateur ne sont jamais acceptées comme autorité.
Le connecteur Swiss Badminton conserve l'ordre officiel des joueurs et des équipes pour
les simples, doubles et mixtes. Les scores ne sont réorientés qu'après
confirmation de la position de l'identifiant joueur officiel.
Le connecteur IWWF découvre les compétitions depuis le profil confirmé. Il
sépare les tours explicitement nommés, notamment qualifications et finale, et
ne conserve un score ou un classement que lorsqu'il apparaît dans la source.
La fenêtre de récence reste fondée sur la date d'événement.
Le connecteur Kenpokan réutilise le collecteur RSS borné de BC Bulle. Il exige
la présence du nom complet et la concordance du sport, du club CRM et du
contexte du dojo. Une attribution ambiguë reste consultable et rejetable, mais
sa validation éditoriale est bloquée. Une disqualification n'est jamais
transformée en classement.
Le connecteur SAFV découvre les rencontres depuis un calendrier de ligue et
une équipe confirmés. Il ne conserve que les matches terminés, non annulés,
datés des 30 derniers jours et dotés d'un score final explicite. Les équipes
et le score restent dans l'ordre officiel. Chaque candidat et transfert
Article indique « Résultat collectif — participation individuelle non
vérifiée » : aucune présence ni performance de l'athlète n'est déduite.
Toute autre valeur laisse la fonctionnalité désactivée : l'interface n'est pas
rendue et les routes répondent avant tout accès aux tables `sports_watch_runs`
et `sports_watch_candidates`. L'activation exige l'application préalable des
migrations additives `20261026_sports_watch_v1.sql` et
`20261026_sports_watch_swiss_bindings.sql`. La source IWWF exige en plus
`20261026_sports_watch_iwwf_bindings.sql` et la source SAFV
`20261026_sports_watch_safv_bindings.sql`.

Aucun profil réel n'est inséré automatiquement. Les candidats historiques
d'Antoine Majeux restent inchangés, mais son rattachement Tournamentsoftware
devra être vérifié et confirmé lors de l'activation de cette migration. Une
désactivation du rattachement ne supprime jamais les candidats existants.
Aucun profil IWWF réel n'est inséré automatiquement ; il doit être vérifié puis
confirmé par un Admin avant la première collecte.
Le flux Kenpokan ne nécessite aucune table supplémentaire : le rattachement est
la sélection explicite de la fiche CRM lors de chaque lancement.
Aucune équipe SAFV réelle n'est insérée automatiquement. Le calendrier et le
nom officiel de l'équipe doivent être vérifiés puis confirmés par un Admin.
La désactivation bloque les nouvelles collectes sans supprimer l'historique.

### Import manuel de résultats

L'Admin peut importer dans la veille un document JPEG, PNG, WebP ou PDF pour
un athlète basket, football ou tennis. Le fichier est conservé dans le Blob
Store privé et reste accessible uniquement par une route Admin isolée par
workspace. La limite est de 10 Mo et les PDF sont validés côté serveur avec
un maximum de cinq pages.

Le bouton « Extraire les résultats » déclenche exactement un appel Responses,
sans retry automatique et sans débit de crédit KLIQUE. Le modèle
`gpt-4.1` est choisi explicitement pour ce parcours : la documentation OpenAI
confirme les entrées image et PDF dans Responses pour ce modèle. L'appel
utilise un schéma JSON strict ; les valeurs absentes ou illisibles restent
nulles. Seuls les compteurs d'usage, le modèle, le statut et l'identifiant de
réponse sont journalisés, jamais le document, le prompt ou l'extraction.

L'extraction reste un brouillon modifiable. Une confirmation humaine est
obligatoire avant la création idempotente d'un candidat `pending` et
`unverified`. Un résultat collectif conserve explicitement la mention que la
participation individuelle n'est pas vérifiée. Le transfert Article transmet
la provenance de la route privée sans rendre le fichier public ni élargir ses
autorisations.

Les statistiques individuelles restent visibles avec leur libellé, leur valeur
et la preuve exacte relevée dans le document. Elles ne sont attribuées
automatiquement que si cette preuve contient le nom complet de l'athlète
sélectionné ; sinon elles restent des propositions à confirmer avec l'identité
manquante. Une cellule absente reste nulle et n'est jamais transformée en zéro.
Un total isolé n'est jamais traité comme score final. Les dates du
document et du match exigent chacune une preuve distincte et une lecture
calendaire non ambiguë ; une date ambiguë reste `null` avec un avertissement.

Le transfert Article regroupe les statistiques et leurs preuves sans répéter
la même ligne pour chaque valeur. Si une matière dépasse 680 caractères, elle
est répartie sans troncature entre plusieurs notes qui conservent toutes la
provenance et la date. Le transfert est refusé explicitement s'il ne peut pas
respecter la limite globale de matières, extraits d'entretien compris.

Ce parcours exige la migration additive
`20261026_sports_watch_manual_imports.sql`. Elle ne contient aucune donnée et
ne doit pas être exécutée automatiquement.

## Photos privées des actualités Athlètes

`KLIQUE_ATHLETE_NEWS_BLOB_READ_WRITE_TOKEN` contient le jeton du Blob Store
privé exclusivement réservé aux photos transmises par « J’ai une actu ».
L'absence de cette variable bloque explicitement l'upload et la lecture.

Ce stockage ne réutilise jamais `BLOB_READ_WRITE_TOKEN`, réservé aux autres
modules, et ne bascule jamais vers un store public. Le store Vercel Blob doit
être créé avec l'accès `Private` et le préfixe de variable
`KLIQUE_ATHLETE_NEWS_BLOB` afin que Vercel fournisse exactement
`KLIQUE_ATHLETE_NEWS_BLOB_READ_WRITE_TOKEN`.

---

# Observabilité
Les outils doivent permettre :

- logs
- métriques
- traces
Les technologies exactes pourront évoluer.

---

# Monitoring
La plateforme doit surveiller :

- performances
- disponibilité
- erreurs
- infrastructure
Les outils restent interchangeables.

---

# Sécurité
Les composants doivent respecter :

- chiffrement
- authentification
- permissions
- journalisation
- conformité
La sécurité reste indépendante des frameworks.

---

# Performances
Les optimisations privilégient :

- cache
- pagination
- traitements asynchrones
- index
- chargement progressif
Les optimisations prématurées sont évitées.

---

# Dépendances
Chaque dépendance doit répondre à plusieurs critères :

- maintenance active
- communauté solide
- documentation
- stabilité
- licence compatible
Les dépendances inutiles sont évitées.

---

# Évolutivité
Les technologies choisies doivent permettre :

- nouveaux modules
- nouveaux services
- nouvelles intégrations
- montée en charge
- évolution continue
Sans remettre en cause l'architecture.

---

# Convention générale
La plateforme privilégie :

- simplicité
- lisibilité
- modularité
- réutilisabilité
- testabilité
Les conventions sont appliquées de manière uniforme.

---

# Technologies de référence
DomaineTechnologieFrontendNext.jsLangageTypeScriptBackendNestJSORMPrismaBase de donnéesPostgreSQLCacheRedisQueueBullMQConteneursDockerOrchestrationKubernetesStockageCompatible S3IAFournisseurs via Integrations
---

# Évolutions futures
La stack doit pouvoir évoluer.

Une technologie peut être remplacée si :

- elle devient obsolète
- elle ne répond plus aux besoins
- une alternative apporte un gain significatif
Le remplacement ne doit pas remettre en cause l'architecture métier.

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- TypeScript est le langage principal
- PostgreSQL est la source de vérité
- Prisma gère le modèle de données
- Redis reste un cache
- les médias utilisent un stockage abstrait
- les fournisseurs IA sont interchangeables
- les domaines métiers restent indépendants des frameworks
- les secrets restent hors du code
- les tests automatisés sont obligatoires
- l'architecture prévaut toujours sur la technologie

---

# Principe fondamental
La stack technologique de KLIQUE Platform est un moyen, jamais une finalité.

Les technologies peuvent évoluer.

Les principes architecturaux, eux, doivent rester stables afin de garantir une plateforme SaaS robuste, maintenable et capable d'accompagner la croissance du projet pendant de nombreuses années.

---

# Documents liés

- 00_VISION.md
- 01_ARCHITECTURE_OVERVIEW.md
- 02_PRODUCT_DOMAINS.md
- 03_PLATFORM_MODULES.md
- 04_SHARED_SERVICES.md
- 09_DATA_ARCHITECTURE.md
- 16_SECURITY_AND_COMPLIANCE.md
- 18_DEPLOYMENT_AND_OPERATIONS.md
- 19_SCALABILITY_AND_RELIABILITY.md

---

# Architecture validée
Avec ce document, les fondations architecturales de KLIQUE Platform sont considérées comme complètes.

Les prochaines étapes concernent désormais :

- la modélisation détaillée des domaines
- les spécifications fonctionnelles
- les contrats d'API
- les interfaces utilisateur
- l'implémentation progressive
Aucun développement ne devra remettre en cause les principes définis dans cette documentation.

Ne modifie aucun autre fichier du projet.
