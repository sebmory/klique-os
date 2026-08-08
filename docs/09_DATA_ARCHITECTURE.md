# KLIQUE Platform
**Document :** Architecture des données

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour toute l'architecture des données de KLIQUE Platform.

---

# Objectif
L'architecture des données constitue la fondation de KLIQUE Platform.

Elle garantit :

- une source de vérité unique
- une cohérence entre les domaines
- l'absence de duplication inutile
- une évolutivité à long terme
- une architecture compatible avec le modèle multi-tenant
Ce document définit les principes de conception des données.

Il ne décrit pas encore les entités individuellement.

Le détail sera documenté dans le document **10_ENTITY_MODEL.md**.

---

# Principes fondamentaux
Toute donnée doit respecter les principes suivants :

- appartenir à un Workspace lorsqu'il s'agit d'une donnée métier
- posséder un identifiant unique
- avoir une seule source de vérité
- être référençable par les autres domaines
- être historisable
- être traçable
- être sécurisée
- être évolutive
Une donnée ne doit jamais être dupliquée simplement pour simplifier un développement.

---

# Source de vérité
Chaque information possède un propriétaire unique.

Exemples :

InformationSource de véritéContactCRMAthlèteCRMOrganisationCRMMédiaMediaConversationHubGénération IAAI StudioKPIAnalyticsUtilisateurShared CoreWorkspaceShared CoreTous les autres domaines utilisent une référence.

Ils ne doivent jamais créer une copie indépendante.

---

# Structure générale

```
Shared Core
       │
       │
 ┌─────┼───────────────────────────────┐
 │     │       │        │              │
CRM   Hub   Media   AI Studio   Analytics
 │     │       │        │              │
 └─────┴───────┴────────┴──────────────┘
          Références
```
Les domaines communiquent par des références et non par duplication.

---

# Types de données
Les données sont réparties en plusieurs catégories.

## Données système
Gérées par le Shared Core.

Exemples :

- utilisateurs
- Workspaces
- rôles
- permissions
- abonnements
- Feature Flags
- paramètres système

---

## Données métier
Gérées par les domaines produits.

Exemples :

- contacts
- athlètes
- clubs
- partenaires
- opportunités
- projets
- médias
- publications

---

## Données de contenu
Exemples :

- articles
- publications
- images
- vidéos
- documents
- commentaires
- annonces

---

## Données analytiques
Exemples :

- statistiques
- KPI
- agrégations
- tableaux de bord
- rapports

---

## Données techniques
Exemples :

- logs
- cache
- index
- sessions
- historiques
- événements
- files d'attente

---

# Cycle de vie des données
Chaque donnée suit un cycle de vie.

Exemple :

```
Création
    ↓
Modification
    ↓
Validation
    ↓
Publication
    ↓
Archivage
    ↓
Suppression éventuelle
```
Toutes les entités ne suivent pas exactement ce cycle, mais elles doivent pouvoir être historisées.

---

# Identification
Toute ressource possède un identifiant unique.

Chaque ressource métier possède également un Workspace propriétaire.

Exemple :

```
id
workspace_id
created_at
updated_at
created_by
updated_by
```
Ces champs constituent les métadonnées minimales.

---

# Métadonnées communes
Toutes les ressources métier devraient pouvoir posséder :

- identifiant
- Workspace
- créateur
- dernier modificateur
- date de création
- date de modification
- statut
- propriétaire fonctionnel
- journal d'activité
- historique
Ces métadonnées facilitent la cohérence de toute la plateforme.

---

# Relations entre les données
Les relations doivent être privilégiées par rapport à la duplication.

Exemple :

```
Athlète
    ↓
Portrait
    ↓
Publication
    ↓
Statistiques
```
Chaque élément reste propriétaire de ses propres données.

---

# Références
Lorsqu'une ressource utilise une autre ressource, elle doit utiliser une référence.

Exemple :

Un média contient :

- athlete_id
- project_id
- event_id
Il ne contient pas une copie complète de l'athlète.

---

# Intégrité
Les relations doivent rester cohérentes.

Une ressource supprimée ne doit pas laisser de références invalides.

Plusieurs stratégies peuvent être utilisées selon le contexte :

- suppression interdite
- suppression logique
- archivage
- transfert
- nettoyage automatique
Le comportement sera défini pour chaque entité.

---

# Historique
Les modifications importantes doivent pouvoir être historisées.

Exemples :

- changement de statut
- changement de propriétaire
- changement de rôle
- modification importante
- validation
- suppression logique
L'historique ne remplace pas les journaux d'audit.

---

# Journalisation
Les événements importants doivent être enregistrés.

Exemples :

- création
- modification
- suppression
- validation
- export
- partage
- téléchargement
- connexion
La journalisation doit rester indépendante des données métier.

---

# Versionnement
Certaines ressources peuvent posséder plusieurs versions.

Exemples :

- document
- image
- publication
- prompt
- rapport
Une version ne doit jamais écraser définitivement la précédente lorsqu'un historique est nécessaire.

---

# États
Les entités peuvent posséder un état.

Exemples :

- brouillon
- actif
- suspendu
- publié
- archivé
- supprimé
Le statut doit influencer les comportements fonctionnels.

---

# Relations entre domaines
Les domaines ne doivent jamais partager directement leurs modèles internes.

Ils échangent :

- des identifiants
- des références
- des événements
- des API
Chaque domaine reste responsable de ses propres données.

---

# Données calculées
Certaines données sont calculées.

Exemples :

- KPI
- statistiques
- scores
- indicateurs
Ces données ne remplacent jamais les données sources.

---

# Données dérivées
Une donnée dérivée provient d'une autre donnée.

Exemple :

Une miniature est dérivée d'une photo.

Une transcription est dérivée d'une vidéo.

Une traduction est dérivée d'un texte.

La donnée d'origine reste la source officielle.

---

# Cache
Le cache améliore les performances.

Le cache :

- n'est jamais une source de vérité
- peut être supprimé
- peut être reconstruit
- respecte le Workspace
Une donnée en cache ne doit jamais être considérée comme définitive.

---

# Recherche
Les index de recherche sont également des données dérivées.

Ils peuvent être reconstruits.

Ils ne doivent jamais contenir des informations auxquelles l'utilisateur n'a pas accès.

---

# Confidentialité
Chaque donnée possède un niveau de visibilité.

Exemples :

- privée
- équipe
- groupe
- Workspace
- publique
La visibilité ne remplace jamais les permissions.

---

# Archivage
Certaines ressources peuvent être archivées.

Une ressource archivée :

- reste disponible selon les permissions
- n'est plus active
- conserve son historique
- peut éventuellement être restaurée
L'archivage est préféré à la suppression définitive lorsqu'une conservation est nécessaire.

---

# Suppression
Plusieurs stratégies sont possibles :

- suppression logique
- suppression définitive
- anonymisation
- conservation légale
Chaque entité devra préciser son comportement.

---

# Évolutivité
Le modèle de données doit permettre :

- l'ajout de nouveaux modules
- l'ajout de nouveaux domaines
- l'ajout de nouveaux types d'entités
- l'ajout de nouvelles relations
- l'évolution des structures existantes
Sans casser les données existantes.

---

# Performances
Le modèle doit rester performant même avec :

- plusieurs millions de contacts
- plusieurs dizaines de millions de médias
- plusieurs milliards d'événements
Les données doivent être conçues pour limiter les traitements inutiles.

---

# Cohérence
Une modification doit rester cohérente dans toute la plateforme.

Exemple :

Le changement de nom d'un athlète dans le CRM ne nécessite pas de modifier :

- Media
- Hub
- AI Studio
- Analytics
Ces domaines utilisent simplement la référence CRM.

---

# Exemple de flux

```
Athlète créé
      ↓
CRM
      ↓
Identifiant unique
      ↓
Média associé
      ↓
Publication
      ↓
Analyse Analytics
```
Chaque domaine reste propriétaire de ses propres informations.

---

# Événements
Les modifications importantes peuvent produire des événements.

Exemples :

- athlete.created
- media.uploaded
- report.generated
- message.created
- project.archived
Ces événements permettent aux autres domaines de réagir sans créer de dépendance forte.

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- une donnée possède une seule source de vérité
- toute donnée métier appartient à un Workspace
- les relations utilisent des références
- les données ne sont pas dupliquées
- les caches ne sont jamais des sources de vérité
- les index peuvent être reconstruits
- les données calculées restent distinctes des données sources
- les modifications sont historisées lorsque nécessaire
- les suppressions respectent les règles de conservation
- les domaines restent indépendants

---

# Principe fondamental
L'architecture des données doit permettre à KLIQUE Platform d'évoluer pendant plusieurs années sans remettre en cause les fondations de la plateforme.

Chaque donnée possède un propriétaire, une source de vérité, un Workspace et un cycle de vie clairement définis.

---

# Documents liés

- 01_ARCHITECTURE_OVERVIEW.md
- 02_PRODUCT_DOMAINS.md
- 03_PLATFORM_MODULES.md
- 04_SHARED_SERVICES.md
- 05_IDENTITY_AND_ACCESS.md
- 07_MULTI_TENANCY.md
- 08_WORKSPACES.md
- 10_ENTITY_MODEL.md
- 12_EVENTS_AND_AUTOMATIONS.md
- 19_SCALABILITY_AND_RELIABILITY.md

---

# Prochaine étape
Le prochain document à créer est :

`/docs/10_ENTITY_MODEL.md`

Il devra définir toutes les entités métier de KLIQUE Platform, leurs attributs principaux, leurs relations et leurs responsabilités respectives.

Ne modifie aucun autre fichier du projet.
