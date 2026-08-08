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
