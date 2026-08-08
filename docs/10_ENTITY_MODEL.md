# KLIQUE Platform
**Document :** Modèle des entités

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour le modèle des entités de KLIQUE Platform.

---

# Objectif
Les fonctionnalités de KLIQUE Platform reposent sur un ensemble d'entités métier.

Chaque entité possède :

- une responsabilité
- une source de vérité
- un domaine propriétaire
- un cycle de vie
- des relations avec d'autres entités
Ce document définit les entités principales de la plateforme.

Les attributs détaillés seront documentés ultérieurement.

---

# Principes fondamentaux
Chaque entité doit respecter les règles suivantes :

- appartenir à un seul domaine propriétaire
- posséder une seule source de vérité
- être identifiable de manière unique
- appartenir à un Workspace lorsqu'il s'agit d'une donnée métier
- pouvoir être référencée par d'autres domaines
- ne jamais être dupliquée inutilement
- être historisable
- être sécurisée par les permissions

---

# Classification des entités
Les entités sont réparties en plusieurs catégories.

## Entités système
Gérées par le Shared Core.

Exemples :

- Workspace
- User
- Membership
- Role
- Permission
- Team
- Group
- Feature Flag
- Subscription

---

## Entités CRM
Exemples :

- Contact
- Athlete
- Organization
- Club
- Federation
- Partner
- Sponsor
- Expert
- Opportunity
- Project
- Activity
- Note
- Tag

---

## Entités Hub
Exemples :

- Space
- Channel
- Conversation
- Message
- Announcement
- Event
- Resource
- Reaction

---

## Entités Media
Exemples :

- Asset
- Album
- Collection
- Folder
- Publication
- License
- Version
- Metadata

---

## Entités AI Studio
Exemples :

- Assistant
- Agent
- Prompt
- Prompt Template
- Generation
- Workflow
- Conversation IA

---

## Entités Analytics
Exemples :

- Dashboard
- KPI
- Metric
- Report
- Segment
- Goal

---

# Entités système

## Workspace
Représente une organisation indépendante.

Source de vérité :

Shared Core

Relations principales :

- possède des membres
- possède des données
- possède des paramètres
- possède un abonnement

---

## User
Représente une identité globale.

Le User est indépendant des Workspaces.

Il peut appartenir à plusieurs Workspaces.

---

## Membership
Représente l'appartenance d'un utilisateur à un Workspace.

Elle relie :

- User
- Workspace
- Roles
Le Membership est indispensable pour accéder à un Workspace.

---

## Role
Regroupe plusieurs permissions.

Un rôle est toujours défini dans un Workspace.

---

## Permission
Décrit une action autorisée.

Elle est utilisée par les rôles.

---

## Team
Représente une équipe fonctionnelle.

Une équipe peut contenir plusieurs utilisateurs.

---

## Group
Représente un regroupement logique.

Les groupes peuvent être utilisés pour :

- permissions
- visibilité
- communication
- partage

---

## Subscription
Décrit l'abonnement d'un Workspace.

Elle détermine :

- les modules disponibles
- les quotas
- les limites
- les options

---

# Entités CRM

## Contact
Représente une personne connue du Workspace.

Le Contact constitue l'entité de base.

D'autres profils peuvent étendre un Contact.

---

## Athlete
Étend un Contact.

Ajoute les informations sportives.

Relations possibles :

- Club
- Team
- Media
- Project
- Expert

---

## Organization
Représente une organisation.

Exemples :

- club
- média
- agence
- entreprise
- fédération

---

## Club
Spécialisation d'une organisation.

Peut posséder :

- équipes
- athlètes
- partenaires

---

## Federation
Organisation représentant une fédération.

---

## Partner
Organisation partenaire.

Peut être liée à :

- projets
- campagnes
- avantages

---

## Sponsor
Organisation sponsorisant une activité.

---

## Expert
Personne apportant un accompagnement.

Exemples :

- nutrition
- mental
- récupération
- juridique

---

## Opportunity
Représente une opportunité commerciale ou collaborative.

---

## Project
Représente une mission ou un projet.

Peut être lié à :

- contacts
- médias
- publications
- événements

---

## Activity
Historique des interactions.

Exemples :

- appel
- réunion
- tâche
- note
- rendez-vous

---

## Note
Information interne.

Peut être liée à plusieurs entités.

---

## Tag
Permet de classifier les ressources.

---

# Entités Hub

## Space
Grand espace collaboratif.

---

## Channel
Canal de discussion.

---

## Conversation
Discussion structurée.

---

## Message
Message individuel.

Peut contenir :

- texte
- média
- réactions

---

## Announcement
Annonce officielle.

---

## Event
Événement collaboratif.

---

## Resource
Lien ou document partagé.

---

## Reaction
Réaction à un contenu.

---

# Entités Media

## Asset
Entité principale représentant un média.

Peut être :

- photo
- vidéo
- document
- audio

---

## Collection
Regroupe plusieurs médias.

---

## Album
Organisation visuelle.

---

## Folder
Structure logique.

---

## Publication
Contenu destiné à être publié.

Peut utiliser :

- médias
- textes
- contenus IA

---

## License
Décrit les droits d'utilisation.

---

## Version
Historique d'un média.

---

## Metadata
Informations descriptives.

---

# Entités AI Studio

## Assistant
Assistant conversationnel.

---

## Agent
Assistant spécialisé.

---

## Prompt
Instruction envoyée à l'IA.

---

## Prompt Template
Modèle réutilisable.

---

## Generation
Résultat produit par l'IA.

---

## Workflow
Suite d'actions IA.

---

## Conversation IA
Historique des échanges.

---

# Entités Analytics

## Dashboard
Tableau de bord.

---

## KPI
Indicateur principal.

---

## Metric
Valeur mesurée.

---

## Report
Rapport généré.

---

## Segment
Filtre analytique.

---

## Goal
Objectif à atteindre.

---

# Relations principales

```
Workspace
    │
    ├── Membership
    │       │
    │       └── User
    │
    ├── CRM
    │      ├── Contact
    │      ├── Athlete
    │      ├── Organization
    │      └── Project
    │
    ├── Hub
    │      ├── Space
    │      ├── Channel
    │      └── Message
    │
    ├── Media
    │      ├── Asset
    │      ├── Collection
    │      └── Publication
    │
    ├── AI Studio
    │      ├── Assistant
    │      ├── Prompt
    │      └── Generation
    │
    └── Analytics
           ├── Dashboard
           ├── KPI
           └── Report
```

---

# Références entre entités
Les entités sont liées par des références.

Exemple :

```
Athlete
    ↓
Asset
    ↓
Publication
    ↓
Dashboard
```
Chaque entité reste propriétaire de ses propres données.

---

# Héritage métier
Certaines entités représentent des spécialisations.

Exemple :

```
Contact
    │
    ├── Athlete
    ├── Expert
    ├── Journalist
    └── Partner Contact
```
Le Contact reste la source principale.

---

# Relations multiples
Une même entité peut être liée à plusieurs autres.

Exemple :

Un Asset peut être lié à :

- un Athlete
- un Project
- un Publication
- un Event
Ces relations ne changent jamais son propriétaire.

---

# Identifiants
Toutes les entités possèdent un identifiant unique.

Les références utilisent uniquement ces identifiants.

Les autres domaines ne stockent jamais une copie complète de l'entité.

---

# Métadonnées communes
Les entités métier peuvent partager les champs suivants :

- id
- workspace_id
- created_at
- updated_at
- created_by
- updated_by
- status
- archived_at
Ces champs doivent rester cohérents dans toute la plateforme.

---

# Historique
Les entités importantes peuvent posséder un historique.

Exemples :

- changements
- validations
- propriétaires
- statuts
- versions

---

# États
Les entités peuvent posséder différents états.

Exemples :

- brouillon
- actif
- suspendu
- publié
- archivé
- supprimé

---

# Événements
Les entités peuvent produire des événements.

Exemples :

- athlete.created
- project.updated
- asset.uploaded
- publication.published
- report.generated
Les événements permettent aux domaines de communiquer sans dépendance directe.

---

# Évolutivité
Le modèle doit permettre d'ajouter facilement :

- de nouvelles entités
- de nouveaux domaines
- de nouvelles relations
- de nouveaux modules
Sans casser les relations existantes.

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- une entité possède un propriétaire
- une entité possède une source de vérité
- une entité appartient à un seul domaine
- les autres domaines utilisent des références
- les identifiants sont uniques
- les relations ne créent pas de duplication
- les entités métier appartiennent à un Workspace
- les historiques restent disponibles lorsque nécessaire

---

# Principe fondamental
Le modèle des entités représente le langage commun de KLIQUE Platform.

Toutes les fonctionnalités, tous les modules et tous les domaines doivent s'appuyer sur ces entités afin de garantir une architecture cohérente, évolutive et maintenable.

---

# Documents liés

- 02_PRODUCT_DOMAINS.md
- 03_PLATFORM_MODULES.md
- 04_SHARED_SERVICES.md
- 05_IDENTITY_AND_ACCESS.md
- 07_MULTI_TENANCY.md
- 08_WORKSPACES.md
- 09_DATA_ARCHITECTURE.md
- 11_INTEGRATIONS_ARCHITECTURE.md
- 12_EVENTS_AND_AUTOMATIONS.md

---

# Prochaine étape
Le prochain document à créer est :

`/docs/11_INTEGRATIONS_ARCHITECTURE.md`

Il devra définir l'architecture des intégrations, des API, des webhooks, des synchronisations et des connexions avec les services externes de KLIQUE Platform.

Ne modifie aucun autre fichier du projet.
