# KLIQUE Platform
**Document :** Domain-Driven Design

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour toute l'organisation des domaines métier de KLIQUE Platform.

---

# Objectif
KLIQUE Platform est construite selon les principes du Domain-Driven Design (DDD).

Chaque domaine représente une responsabilité métier clairement définie.

L'objectif est de construire une plateforme :

- modulaire
- évolutive
- maintenable
- indépendante
- facilement extensible

---

# Principe fondamental
Un domaine possède une responsabilité unique.

Il est le seul propriétaire de ses règles métier et de ses données.

Les autres domaines utilisent uniquement des références, des événements ou des API internes.

---

# Les domaines de KLIQUE Platform
La plateforme est organisée autour des domaines suivants :

- Shared Core
- CRM
- AI Studio
- Hub
- Media
- Analytics
Chaque domaine est autonome.

---

# Shared Core
Le Shared Core regroupe les services communs.

Il est responsable notamment de :

- Workspaces
- utilisateurs
- authentification
- permissions
- abonnements
- Feature Flags
- paramètres globaux
- intégrations
- notifications système
Il ne contient aucune logique métier propre aux domaines produits.

---

# CRM
Le CRM est le domaine de référence pour les relations.

Il est propriétaire notamment de :

- contacts
- athlètes
- organisations
- clubs
- partenaires
- experts
- opportunités
- projets
- activités
Aucun autre domaine ne peut devenir propriétaire de ces données.

---

# AI Studio
AI Studio est responsable de toutes les interactions avec l'intelligence artificielle.

Il gère notamment :

- assistants
- agents
- prompts
- workflows IA
- générations
- mémoire conversationnelle
- routage des modèles
Il ne devient jamais propriétaire des données métier.

---

# Hub
Le Hub est le domaine collaboratif.

Il gère notamment :

- espaces
- canaux
- conversations
- messages
- annonces
- ressources partagées
Il ne stocke jamais les médias ni les données CRM.

---

# Media
Media est propriétaire des contenus numériques.

Il gère notamment :

- Assets
- collections
- albums
- versions
- métadonnées
- licences
- publications
Les autres domaines utilisent des références vers les Assets.

---

# Analytics
Analytics transforme les données en indicateurs.

Il gère notamment :

- KPI
- métriques
- tableaux de bord
- rapports
- objectifs
Analytics ne modifie jamais les données métier.

---

# Une responsabilité unique
Chaque domaine répond à une seule question.

CRM :

Qui ?

Hub :

Qui communique ?

Media :

Quels contenus ?

AI Studio :

Comment assister ?

Analytics :

Que peut-on mesurer ?

Shared Core :

Comment fonctionne la plateforme ?

---

# Source de vérité
Chaque domaine possède sa propre source de vérité.

Exemple :

DomaineSource de véritéCRMContacts et relationsMediaAssetsHubConversationsAI StudioGénérations IAAnalyticsKPIShared CoreUtilisateurs, Workspaces, permissionsUne donnée n'a jamais plusieurs propriétaires.

---

# Communication entre domaines
Les domaines communiquent uniquement par :

- références
- événements
- API internes
Les dépendances directes sont interdites.

---

# Exemple
Un nouvel athlète est créé.

```
CRM
    │
athlete.created
    │
    ▼
Event Bus
    │
 ┌──┼──────────────┐
 ▼  ▼              ▼
Hub Media     Analytics
```
Chaque domaine décide librement de réagir ou non.

---

# Indépendance
Chaque domaine doit pouvoir évoluer sans modifier les autres.

Par exemple :

Ajouter une nouvelle fonctionnalité dans Media ne doit pas nécessiter de modifier CRM.

Cette indépendance est une règle fondamentale.

---

# Couplage faible
Les domaines doivent être faiblement couplés.

Ils connaissent :

- les contrats publics
- les événements
- les API internes
Ils ignorent l'implémentation interne des autres domaines.

---

# Cohésion forte
À l'intérieur d'un domaine, les composants doivent être fortement liés.

Ils partagent :

- le même langage métier
- les mêmes règles
- les mêmes responsabilités
Une fonctionnalité ne doit pas être répartie inutilement entre plusieurs domaines.

---

# Langage métier
Tous les domaines utilisent un vocabulaire commun.

Exemples :

- Athlete
- Contact
- Workspace
- Asset
- Generation
- Dashboard
Les mêmes termes doivent conserver le même sens dans toute la plateforme.

---

# Pas de duplication métier
Une règle métier ne doit exister qu'à un seul endroit.

Exemple :

Les règles concernant un Athlete appartiennent au CRM.

Media ou Analytics ne doivent jamais les réimplémenter.

---

# API internes
Chaque domaine expose uniquement ce qui est nécessaire.

Les API internes sont les seuls points d'entrée autorisés.

Les autres domaines ne peuvent pas accéder directement aux structures internes.

---

# Événements
Les événements permettent de réduire les dépendances.

Ils représentent des faits métier.

Exemples :

- athlete.created
- asset.uploaded
- report.generated
- message.created
Les événements ne transportent que les informations nécessaires.

---

# Entités
Chaque entité appartient à un seul domaine.

Exemple :

Asset appartient à Media.

Même si CRM ou Hub utilisent un Asset, ils n'en deviennent jamais propriétaires.

---

# Cas d'évolution
Si une fonctionnalité semble concerner plusieurs domaines, il faut identifier :

- quel domaine possède réellement la règle métier
- quel domaine possède la donnée
- quels domaines consomment simplement cette information
Cette réflexion précède toujours le développement.

---

# Refactoring
Il est préférable de déplacer une responsabilité vers le bon domaine que d'ajouter une exception.

L'architecture doit rester cohérente dans le temps.

---

# Dépendances autorisées

```
            Shared Core
                 │
 ┌───────────────┼────────────────┐
 │               │                │
CRM          AI Studio        Media
 │               │                │
 └───────┬───────┴────────┬────────┘
         ▼                ▼
        Hub         Analytics
```
Les échanges passent toujours par des contrats publics.

---

# Ce qu'il faut éviter
Les domaines ne doivent jamais :

- partager leurs bases de données
- accéder directement aux entités internes
- modifier les données d'un autre domaine
- implémenter les mêmes règles métier
- dépendre d'un framework spécifique d'un autre domaine

---

# Avant toute nouvelle fonctionnalité
Avant d'ajouter une fonctionnalité, chaque développeur doit répondre aux questions suivantes :

- À quel domaine appartient cette responsabilité ?
- Quelle est la source de vérité ?
- Les autres domaines ont-ils seulement besoin d'une référence ?
- Faut-il publier un événement ?
- Une API interne est-elle nécessaire ?
- Cette évolution renforce-t-elle l'indépendance des domaines ?

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- chaque domaine possède une responsabilité unique
- chaque donnée possède un propriétaire unique
- les domaines communiquent uniquement par événements, références ou API internes
- aucune règle métier n'est dupliquée
- les dépendances directes sont interdites
- les domaines restent indépendants des technologies utilisées
- les Workspaces s'appliquent à tous les domaines
- le Shared Core ne contient pas de logique métier spécifique
- le langage métier reste cohérent dans toute la plateforme
- l'architecture prime toujours sur la facilité de développement

---

# Principe fondamental
Le Domain-Driven Design est le mécanisme qui garantit la cohérence de KLIQUE Platform.

Chaque domaine possède une responsabilité claire, une source de vérité unique et des frontières bien définies.

Cette organisation permet à la plateforme d'évoluer pendant de nombreuses années sans perdre sa simplicité, sa modularité et sa maintenabilité.

Ne modifie aucun autre fichier du projet.
