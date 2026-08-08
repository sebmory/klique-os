# KLIQUE Platform
**Document :** Domaines produits

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour la répartition des responsabilités entre les domaines produits de KLIQUE Platform.

---

# Objectif
KLIQUE Platform est organisée en plusieurs domaines produits.

Chaque domaine possède :

- une mission précise
- des responsabilités clairement définies
- ses propres modules fonctionnels
- ses propres règles métier
- des frontières explicites
- des interactions contrôlées avec les autres domaines
Cette séparation permet de construire une plateforme modulaire, évolutive et maintenable.

---

# Principe de séparation des domaines
Chaque domaine est responsable d'une partie spécifique de la plateforme.

Un domaine ne doit pas reproduire les responsabilités d'un autre domaine.

Une donnée possède toujours un domaine source de référence.

Les autres domaines peuvent utiliser cette donnée, mais ne doivent pas créer une copie indépendante sans justification architecturale.

Les domaines communiquent par des services, des API internes, des références ou des événements.

---

# Les domaines produits
KLIQUE Platform comprend cinq domaines produits principaux :

- KLIQUE CRM
- KLIQUE AI Studio
- KLIQUE Hub
- KLIQUE Media
- KLIQUE Analytics
Ils reposent tous sur le Shared Core et sur le Workspace actif.

```
KLIQUE Platform

├── KLIQUE CRM
├── KLIQUE AI Studio
├── KLIQUE Hub
├── KLIQUE Media
└── KLIQUE Analytics
```

---

# KLIQUE CRM

## Mission
KLIQUE CRM centralise les relations, les organisations, les personnes et les activités métier du Workspace.

Il constitue la source de vérité pour les entités relationnelles de la plateforme.

## Responsabilités
KLIQUE CRM est responsable notamment de :

- la gestion des personnes
- la gestion des organisations
- la gestion des athlètes
- la gestion des clubs
- la gestion des équipes
- la gestion des partenaires
- la gestion des sponsors
- la gestion des experts
- la gestion des médias
- la gestion des fédérations
- la gestion des prospects
- la gestion des opportunités
- la gestion des relations
- la gestion des interactions
- la gestion des projets commerciaux
- la gestion des statuts et cycles de relation

## Données principales
Le domaine peut contenir notamment :

- contacts
- organisations
- profils
- athlètes
- équipes
- clubs
- partenaires
- sponsors
- experts
- médias
- fédérations
- opportunités
- interactions
- notes
- tags
- relations
- responsables
- statuts

## Source de vérité
KLIQUE CRM est la source de vérité pour l'identité métier des personnes et des organisations.

Un athlète, un club ou un partenaire ne doit pas être recréé indépendamment dans Media, Hub, Analytics ou AI Studio.

Les autres domaines utilisent une référence vers l'entité CRM.

## Hors périmètre
KLIQUE CRM n'est pas responsable directement :

- du stockage des fichiers
- de la gestion des conversations
- de la génération de contenus IA
- de la création des tableaux de bord
- de l'authentification
- de la facturation
- de la gestion des permissions globales

---

# KLIQUE AI Studio

## Mission
KLIQUE AI Studio centralise les usages de l'intelligence artificielle dans KLIQUE Platform.

Il fournit des outils de création, d'assistance, d'analyse et d'automatisation.

## Responsabilités
KLIQUE AI Studio est responsable notamment de :

- la génération de textes
- la génération d'images
- la création d'assistants
- la création de modèles de prompts
- la gestion des conversations IA
- les recommandations intelligentes
- l'analyse assistée
- les résumés automatiques
- les transformations de contenus
- les workflows IA
- les automatisations intelligentes
- la gestion du contexte transmis aux modèles
- le suivi de la consommation IA

## Données principales
Le domaine peut contenir notamment :

- conversations IA
- prompts
- modèles de prompts
- assistants
- agents
- générations
- versions
- résultats
- historiques
- paramètres de modèles
- sources de contexte
- crédits ou quotas IA
- journaux d'exécution

## Mode connecté
En mode connecté, l'IA utilise les données autorisées du Workspace actif.

Elle peut notamment utiliser :

- les données CRM
- les médias
- les contenus existants
- les événements
- les conversations
- les statistiques
- les paramètres de communication

## Mode libre
En mode libre, l'utilisateur peut créer un contenu sans utiliser une entité existante du Workspace.

Le contenu généré peut ensuite être enregistré ou rattaché à une entité.

## Source de vérité
KLIQUE AI Studio est la source de vérité pour les générations, les assistants, les prompts et les historiques IA.

Il ne devient pas la source de vérité des personnes, médias ou statistiques qu'il utilise.

## Hors périmètre
KLIQUE AI Studio n'est pas responsable directement :

- de la gestion des contacts
- du stockage principal des médias
- de la messagerie entre utilisateurs
- de la production des données analytiques sources
- de l'authentification
- des rôles et permissions

---

# KLIQUE Hub

## Mission
KLIQUE Hub est l'espace de communication, de collaboration et de communauté du Workspace.

Il permet aux membres de travailler et d'échanger dans un environnement commun.

## Responsabilités
KLIQUE Hub est responsable notamment de :

- la gestion des espaces de discussion
- la gestion des canaux
- la messagerie
- les annonces
- les réactions
- les commentaires
- les mentions
- les groupes
- les communautés
- les espaces privés
- les ressources partagées
- les événements communautaires
- les fils de discussion
- les notifications liées aux conversations

## Données principales
Le domaine peut contenir notamment :

- espaces
- canaux
- conversations
- messages
- réponses
- réactions
- annonces
- membres
- groupes
- mentions
- pièces jointes référencées
- événements
- statuts de lecture

## Source de vérité
KLIQUE Hub est la source de vérité pour les conversations, les messages et les interactions communautaires.

Les pièces jointes doivent être stockées dans KLIQUE Media ou dans le service partagé de fichiers.

## Isolation
Chaque Workspace possède son propre Hub.

Aucun message, canal ou espace ne doit être visible dans un autre Workspace sans mécanisme explicite prévu à cet effet.

## Hors périmètre
KLIQUE Hub n'est pas responsable directement :

- de la gestion des contacts métier
- du stockage principal des médias
- de la génération IA
- de la facturation
- des tableaux de bord analytiques
- de l'authentification

---

# KLIQUE Media

## Mission
KLIQUE Media centralise la gestion des fichiers, contenus et actifs numériques du Workspace.

Il constitue la bibliothèque média officielle de la plateforme.

## Responsabilités
KLIQUE Media est responsable notamment de :

- l'importation des fichiers
- le stockage des médias
- l'organisation en dossiers
- la gestion des collections
- la gestion des albums
- la gestion des métadonnées
- la gestion des versions
- la recherche de médias
- la gestion des droits d'utilisation
- la gestion des licences
- le partage de médias
- la validation de contenus
- l'archivage
- la publication ou préparation à la diffusion
- la conservation des fichiers sources

## Données principales
Le domaine peut contenir notamment :

- photos
- vidéos
- documents
- fichiers audio
- créations graphiques
- miniatures
- versions
- dossiers
- collections
- albums
- métadonnées
- droits
- licences
- statuts de validation
- liens de partage

## Source de vérité
KLIQUE Media est la source de vérité pour les fichiers et actifs numériques.

Les autres domaines doivent référencer les médias existants plutôt que créer des copies indépendantes.

## Fichiers et entités
Un média peut être lié à plusieurs éléments :

- un athlète
- un club
- un événement
- un shooting
- un projet
- une publication
- une conversation
- une génération IA
Ces liens ne changent pas la propriété du média.

Le média reste la responsabilité de KLIQUE Media.

## Hors périmètre
KLIQUE Media n'est pas responsable directement :

- de la gestion des relations CRM
- des conversations
- de la génération IA
- des tableaux de bord
- de l'authentification
- de la facturation

---

# KLIQUE Analytics

## Mission
KLIQUE Analytics transforme les données de la plateforme en indicateurs, rapports et outils de pilotage.

Il fournit une vision mesurable de l'activité du Workspace.

## Responsabilités
KLIQUE Analytics est responsable notamment de :

- la création de tableaux de bord
- le calcul des KPI
- la création de rapports
- l'analyse des performances
- l'analyse des tendances
- les comparaisons temporelles
- l'agrégation des données
- le suivi des usages
- les statistiques de contenus
- les statistiques CRM
- les statistiques communautaires
- les statistiques média
- les statistiques IA
- l'export de rapports

## Données principales
Le domaine peut contenir notamment :

- métriques
- événements analytiques
- agrégations
- KPI
- rapports
- tableaux de bord
- périodes
- objectifs
- filtres
- segments
- comparaisons
- historiques de calcul

## Lecture des autres domaines
KLIQUE Analytics peut exploiter les données provenant de :

- KLIQUE CRM
- KLIQUE AI Studio
- KLIQUE Hub
- KLIQUE Media
- Shared Core
Il doit respecter les permissions et le Workspace actif.

## Source de vérité
KLIQUE Analytics est la source de vérité pour les indicateurs calculés, les agrégations et les rapports.

Il n'est pas la source de vérité des données métier originales utilisées dans les calculs.

## Hors périmètre
KLIQUE Analytics n'est pas responsable directement :

- de la modification des données CRM
- de la modification des médias
- de l'envoi de messages
- de la génération de contenus
- de l'authentification
- des rôles et permissions

---

# Shared Core
Le Shared Core n'est pas un domaine produit visible au même niveau que les cinq espaces principaux.

Il constitue la fondation commune de la plateforme.

Il comprend notamment :

- les Workspaces
- les utilisateurs
- l'authentification
- les identités
- les rôles
- les permissions
- les paramètres
- les abonnements
- la facturation
- les notifications globales
- la recherche globale
- les journaux d'activité
- les intégrations
- les API internes
- les mécanismes de sécurité
Les domaines produits utilisent ces services sans les reproduire.

---

# Interactions entre les domaines
Les domaines peuvent interagir entre eux.

Ces interactions doivent toujours respecter les responsabilités de chaque domaine.

## CRM vers Media
Une entité CRM peut être liée à plusieurs médias.

Exemple :

Un athlète peut être associé à des portraits, des vidéos et des documents.

Les fichiers restent stockés dans KLIQUE Media.

## CRM vers Hub
Une personne ou une organisation du CRM peut être liée à un membre, un groupe ou une conversation du Hub.

Le profil métier reste géré dans le CRM.

La conversation reste gérée dans le Hub.

## CRM vers AI Studio
AI Studio peut utiliser les informations CRM pour générer un contenu contextualisé.

Il ne doit pas modifier directement les données CRM sans action explicite et autorisée.

## Media vers AI Studio
AI Studio peut utiliser un média comme source ou créer un nouveau contenu.

Le résultat final doit être enregistré dans KLIQUE Media lorsqu'il devient un actif officiel.

## Hub vers Media
Les conversations peuvent inclure des pièces jointes.

Ces fichiers sont stockés dans Media et référencés depuis le message.

## Analytics vers les autres domaines
Analytics lit et agrège les données des autres domaines.

Il ne modifie pas les données métier sources.

---

# Matrice des responsabilités
ÉlémentDomaine sourcePersonnes et organisationsKLIQUE CRMAthlètes et partenairesKLIQUE CRMOpportunités et relationsKLIQUE CRMConversations IAKLIQUE AI StudioPrompts et assistantsKLIQUE AI StudioMessages et discussionsKLIQUE HubCanaux et communautésKLIQUE HubPhotos et vidéosKLIQUE MediaDocuments et créationsKLIQUE MediaKPI et tableaux de bordKLIQUE AnalyticsUtilisateurs et WorkspacesShared CoreRôles et permissionsShared CoreAbonnements et facturationShared Core
---

# Règle de source unique
Chaque information doit posséder une seule source de vérité.

Exemple :

Le nom officiel d'un athlète est enregistré dans KLIQUE CRM.

KLIQUE Media, KLIQUE Hub, KLIQUE Analytics et KLIQUE AI Studio utilisent cette information par référence.

Ils ne doivent pas conserver une version indépendante pouvant devenir incohérente.

---

# Références entre domaines
Lorsqu'une donnée d'un domaine est utilisée par un autre domaine, elle doit être référencée par un identifiant stable.

Exemple :

```
Athlète CRM
    ↓
Identifiant unique
    ↓
Médias associés
    ↓
Conversations associées
    ↓
Statistiques associées
```
La suppression ou la modification d'une entité doit respecter les dépendances entre les domaines.

---

# Événements de domaine
Les domaines peuvent publier des événements internes.

Exemples :

- un athlète a été créé
- un média a été ajouté
- un message a été publié
- une génération IA est terminée
- une opportunité a changé de statut
- un rapport a été généré
Les autres domaines peuvent réagir à ces événements sans créer de dépendance directe forte.

---

# Permissions
Chaque domaine applique les permissions définies par le Shared Core.

Une permission peut dépendre :

- du Workspace
- du rôle
- de l'utilisateur
- du module
- du type de ressource
- de l'action
- du propriétaire
- de la visibilité
Un domaine ne doit jamais contourner les règles de permissions globales.

---

# Extensibilité
De nouveaux domaines produits pourront être ajoutés à l'avenir.

Exemples possibles :

- KLIQUE Events
- KLIQUE Academy
- KLIQUE Marketplace
- KLIQUE Sponsoring
- KLIQUE Recruitment
Un nouveau domaine ne doit être créé que si :

- il possède une mission autonome
- ses responsabilités sont clairement distinctes
- il possède ses propres règles métier
- il peut évoluer indépendamment
- son ajout ne crée pas de duplication inutile

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- un domaine possède une mission claire
- une responsabilité ne doit pas être dupliquée
- chaque donnée possède une seule source de vérité
- les domaines utilisent des références plutôt que des copies
- les interactions doivent être explicites
- les permissions sont appliquées dans chaque domaine
- le Workspace actif est toujours respecté
- les domaines doivent rester faiblement couplés
- les domaines doivent pouvoir évoluer indépendamment
- les fonctionnalités partagées appartiennent au Shared Core

---

# Principe fondamental
Chaque fonctionnalité doit être placée dans le domaine qui possède la responsabilité métier correspondante.

Lorsqu'une fonctionnalité concerne plusieurs domaines, les responsabilités doivent être séparées.

Exemple :

Une publication générée par intelligence artificielle concernant un athlète et utilisant une photo implique :

- KLIQUE CRM pour l'athlète
- KLIQUE AI Studio pour la génération
- KLIQUE Media pour la photo et le contenu final
- KLIQUE Analytics pour les statistiques éventuelles
Aucun domaine ne doit assumer seul toutes ces responsabilités.

---

# Documents liés

- 00_VISION.md
- 01_ARCHITECTURE_OVERVIEW.md
- 03_PLATFORM_MODULES.md
- 04_SHARED_SERVICES.md
- 07_MULTI_TENANCY.md
- 08_WORKSPACES.md
- 09_DATA_ARCHITECTURE.md
- 10_ENTITY_MODEL.md
- 12_EVENTS_AND_AUTOMATIONS.md

---

# Prochaine étape
Le prochain document à créer est :

`/docs/03_PLATFORM_MODULES.md`

Il devra définir les modules fonctionnels contenus dans chaque domaine produit, leur rôle et leurs dépendances.

Ne modifie aucun autre fichier du projet.
