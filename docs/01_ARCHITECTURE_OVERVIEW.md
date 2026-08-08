# KLIQUE Platform
**Document :** Vue d'ensemble de l'architecture

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour l'organisation générale et les principes d'architecture de KLIQUE Platform.

---

# Objectif
Ce document présente l'architecture générale de KLIQUE Platform.

Il définit :

- l'organisation globale de la plateforme
- le rôle des différents espaces
- la place centrale des Workspaces
- les services partagés
- les principales couches d'architecture
- les règles qui devront guider les futures décisions
Il ne décrit pas les fonctionnalités en détail.

Les fonctionnalités seront documentées dans des documents dédiés.

---

# Vision de l'architecture
KLIQUE Platform est une plateforme SaaS multi-tenant dédiée à l'écosystème sportif.

Elle doit pouvoir être utilisée par différentes organisations, notamment :

- KLIQUE
- des clubs sportifs
- des photographes
- des médias
- des agences
- des fédérations
- des experts
- des partenaires
Chaque organisation travaille dans son propre Workspace.

Tous les modules, toutes les données et toutes les permissions dépendent du Workspace actif.

---

# Principes d'architecture

## Workspace First
Le Workspace est l'unité centrale de la plateforme.

Toute donnée métier appartient obligatoirement à un Workspace.

Aucune fonctionnalité ne doit fonctionner en dehors de ce contexte.

## Multi-tenant natif
Une seule plateforme héberge plusieurs organisations.

Chaque organisation possède :

- ses utilisateurs
- ses données
- ses permissions
- ses paramètres
- ses abonnements
- ses contenus
Les données doivent être strictement isolées entre les Workspaces.

## Architecture modulaire
KLIQUE Platform est divisée en plusieurs espaces spécialisés.

Chaque espace possède une mission claire.

Les espaces partagent les mêmes fondations mais doivent pouvoir évoluer indépendamment.

## Services partagés
Les fonctions communes doivent être centralisées.

Elles ne doivent pas être recréées séparément dans chaque espace.

## API First
Les fonctionnalités de la plateforme doivent être accessibles par des interfaces internes clairement définies.

Les interfaces web, mobiles, les intégrations et les automatisations doivent utiliser les mêmes services.

## Sécurité par défaut
Les accès doivent toujours être limités par défaut.

Une donnée n'est visible que lorsqu'une permission explicite l'autorise.

## Évolutivité
L'architecture doit pouvoir évoluer sans nécessiter une réécriture complète de la plateforme.

Elle doit pouvoir supporter :

- quelques utilisateurs
- plusieurs milliers de Workspaces
- de grands volumes de médias
- de nombreuses intégrations
- des usages internationaux

## Documentation avant développement
Aucune fonctionnalité importante ne doit être développée avant la validation de son architecture.

Les décisions doivent être documentées avant leur implémentation.

---

# Organisation générale
KLIQUE Platform est organisée autour de cinq espaces principaux :

- KLIQUE CRM
- KLIQUE AI Studio
- KLIQUE Hub
- KLIQUE Media
- KLIQUE Analytics
Ces espaces utilisent un noyau commun appelé Shared Core.

```
KLIQUE Platform

├── Shared Core
├── KLIQUE CRM
├── KLIQUE AI Studio
├── KLIQUE Hub
├── KLIQUE Media
└── KLIQUE Analytics
```

---

# KLIQUE CRM
KLIQUE CRM centralise les relations et les données métier d'un Workspace.

Il peut contenir notamment :

- les athlètes
- les contacts
- les clubs
- les partenaires
- les experts
- les médias
- les fédérations
- les prospects
- les opportunités
- les projets
- les interactions
Le CRM constitue la source principale des informations sur les personnes et les organisations.

Il ne doit pas gérer directement les médias, les conversations ou les tableaux de bord.

Ces responsabilités appartiennent aux autres espaces.

---

# KLIQUE AI Studio
KLIQUE AI Studio centralise les fonctionnalités liées à l'intelligence artificielle.

Il permet notamment :

- la génération de contenus
- la création d'assistants
- l'utilisation de modèles IA
- la génération d'images
- l'analyse de données
- les recommandations
- les automatisations intelligentes
L'IA peut utiliser les données autorisées du Workspace actif.

KLIQUE AI Studio ne devient pas une base de données parallèle.

Les contenus et informations utilisés doivent provenir des autres espaces de la plateforme.

---

# KLIQUE Hub
KLIQUE Hub est l'espace de communication et de collaboration.

Il peut contenir notamment :

- les discussions
- les annonces
- les espaces privés
- les groupes
- les messages
- les événements
- les réactions
- les ressources partagées
Chaque Workspace possède son propre Hub.

Les conversations ne doivent jamais être partagées automatiquement entre plusieurs Workspaces.

---

# KLIQUE Media
KLIQUE Media centralise les actifs numériques.

Il peut contenir notamment :

- les photos
- les vidéos
- les documents
- les créations graphiques
- les publications
- les collections
- les dossiers
- les licences
- les métadonnées
KLIQUE Media doit devenir la source officielle des fichiers utilisés dans la plateforme.

Les autres espaces peuvent référencer les médias sans les dupliquer.

---

# KLIQUE Analytics
KLIQUE Analytics centralise les indicateurs et les données de pilotage.

Il permet notamment :

- les tableaux de bord
- les statistiques
- les rapports
- les performances
- les KPI
- les tendances
- les comparaisons
- les analyses historiques
KLIQUE Analytics peut lire les données des autres espaces.

Il ne doit pas modifier directement les données sources.

---

# Shared Core
Le Shared Core contient les services communs à toute la plateforme.

Il comprend notamment :

- Authentication
- Identity
- Users
- Roles
- Permissions
- Workspaces
- Notifications
- Search
- Files
- Activity Logs
- Billing
- Settings
- APIs
- Integrations
Ces services sont mutualisés afin de garantir :

- un comportement cohérent
- une sécurité uniforme
- une maintenance simplifiée
- une évolution centralisée
- l'absence de duplication

---

# Architecture centrée sur les Workspaces
Le Workspace définit le contexte actif de l'utilisateur.

Lorsqu'un utilisateur change de Workspace, l'ensemble de la plateforme change automatiquement de contexte.

Cela concerne notamment :

- les données affichées
- les permissions
- les médias
- les conversations
- les générations IA
- les tableaux de bord
- les paramètres
- les notifications
Les modules ne doivent jamais gérer eux-mêmes le changement d'organisation.

Ils utilisent toujours le Workspace actif fourni par le Shared Core.

---

# Propriété des données
Chaque ressource doit posséder au minimum :

- un identifiant unique
- un Workspace propriétaire
- un créateur
- une date de création
- une date de modification
- des permissions
- un historique
- un journal d'activité
Le créateur d'une donnée n'est pas nécessairement son propriétaire.

Le propriétaire officiel reste le Workspace.

---

# Couches d'architecture

## Product Layer
Cette couche représente les grands espaces visibles de la plateforme :

- CRM
- AI Studio
- Hub
- Media
- Analytics

## Business Layer
Cette couche représente les concepts métier :

- athlètes
- clubs
- médias
- photographes
- partenaires
- experts
- agences
- fédérations

## Application Layer
Cette couche contient les modules fonctionnels.

Exemples :

- contacts
- projets
- campagnes
- conversations
- calendrier
- bibliothèque
- publications
- tâches

## Service Layer
Cette couche fournit les services communs.

Exemples :

- authentification
- permissions
- recherche
- stockage
- notifications
- intelligence artificielle
- facturation

## Infrastructure Layer
Cette couche contient les éléments techniques nécessaires au fonctionnement de la plateforme.

Exemples :

- bases de données
- serveurs
- stockage de fichiers
- CDN
- sauvegardes
- monitoring
- sécurité
- déploiement

---

# Flux général

```
Utilisateur
    ↓
Workspace actif
    ↓
Permissions
    ↓
Espaces de la plateforme
    ↓
Services partagés
    ↓
Données du Workspace
```
Chaque action doit être vérifiée dans le contexte du Workspace actif.

---

# Règles fondamentales
Toutes les futures décisions devront respecter les règles suivantes :

- le Workspace est toujours prioritaire
- toute donnée possède une seule source de vérité
- les données ne doivent pas être dupliquées inutilement
- les modules doivent être faiblement couplés
- les responsabilités doivent être clairement séparées
- les services communs doivent être centralisés
- les permissions doivent être explicites
- la sécurité doit être appliquée par défaut
- les fonctionnalités doivent être configurables
- aucun comportement métier ne doit être codé en dur pour une organisation précise
- l'architecture doit être documentée avant le développement

---

# Principe fondamental
Toute nouvelle fonctionnalité doit pouvoir fonctionner pour n'importe quel Workspace sans nécessiter de développement spécifique.

Le comportement de la plateforme doit dépendre :

- des données
- des permissions
- des rôles
- des paramètres
- du plan d'abonnement
- de la configuration du Workspace
Il ne doit jamais dépendre d'une organisation codée directement dans l'application.

---

# Documents liés

- 00_VISION.md
- 02_PRODUCT_DOMAINS.md
- 03_PLATFORM_MODULES.md
- 04_SHARED_SERVICES.md
- 05_IDENTITY_AND_ACCESS.md
- 06_ROLES_AND_PERMISSIONS.md
- 07_MULTI_TENANCY.md
- 08_WORKSPACES.md
- 09_DATA_ARCHITECTURE.md

---

# Prochaine étape
Le prochain document à créer est :

`/docs/02_PRODUCT_DOMAINS.md`

Il devra définir précisément les responsabilités, les frontières et les interactions de chaque grand espace de KLIQUE Platform.
