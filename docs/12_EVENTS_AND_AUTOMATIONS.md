# KLIQUE Platform
**Document :** Événements et automatisations

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour toute l'architecture événementielle de KLIQUE Platform.

---

# Objectif
KLIQUE Platform doit fonctionner selon une architecture orientée événements.

Les domaines produits restent indépendants mais peuvent réagir automatiquement aux événements produits par les autres domaines.

Ce document définit :

- les événements internes
- les workflows
- les automatisations
- les déclencheurs
- les actions
- les files d'attente
- les notifications
- les communications entre domaines

---

# Principe fondamental
Les domaines ne communiquent jamais directement entre eux.

Ils publient des événements.

Les autres domaines choisissent d'y réagir.

```
CRM
    │
    └── athlete.created
            │
            ▼
Event Bus
            │
 ┌──────────┼──────────┐
 ▼          ▼          ▼
Hub      Media     Analytics
```
Cette architecture réduit le couplage entre les domaines.

---

# Architecture événementielle
Tous les événements transitent par un bus d'événements interne.

Les domaines :

- publient des événements
- consomment des événements
- restent indépendants
- ne connaissent pas les traitements réalisés par les autres domaines

---

# Structure d'un événement
Chaque événement contient au minimum :

- identifiant
- type
- domaine source
- Workspace
- ressource concernée
- identifiant de la ressource
- utilisateur à l'origine
- date
- version
- métadonnées
Exemple :

```
event_id
event_type
workspace_id
resource_type
resource_id
created_by
created_at
version
```

---

# Types d'événements
Les principaux événements sont :

## Création
Exemples :

- athlete.created
- project.created
- media.uploaded
- workspace.created

---

## Modification
Exemples :

- athlete.updated
- project.updated
- publication.updated

---

## Suppression
Exemples :

- athlete.deleted
- asset.deleted
- project.archived

---

## Validation
Exemples :

- publication.approved
- media.validated
- workflow.completed

---

## Publication
Exemples :

- article.published
- media.shared
- campaign.sent

---

## IA
Exemples :

- generation.started
- generation.completed
- assistant.created
- workflow.executed

---

## Utilisateurs
Exemples :

- user.invited
- member.joined
- role.assigned
- permission.updated

---

## Paiement
Exemples :

- subscription.created
- invoice.paid
- trial.expired

---

# Événements métier
Chaque domaine définit ses propres événements.

## CRM
Exemples :

- contact.created
- athlete.created
- partner.created
- opportunity.closed
- project.completed

---

## Hub
Exemples :

- channel.created
- message.created
- announcement.published
- event.started

---

## Media
Exemples :

- asset.uploaded
- asset.validated
- asset.shared
- publication.published

---

## AI Studio
Exemples :

- prompt.executed
- generation.completed
- assistant.updated
- workflow.finished

---

## Analytics
Exemples :

- report.generated
- dashboard.created
- goal.reached

---

# Événements système
Le Shared Core publie également des événements.

Exemples :

- workspace.created
- workspace.deleted
- user.created
- session.started
- session.expired
- integration.connected
- feature.enabled

---

# Workflows
Un workflow est une suite d'actions déclenchées par un événement.

Exemple :

```
Nouvel athlète
      ↓
Créer dossier média
      ↓
Créer canal Hub
      ↓
Créer tableau Analytics
      ↓
Envoyer notification
```
Chaque étape est indépendante.

---

# Déclencheurs
Un workflow peut être déclenché par :

- un événement
- une action utilisateur
- une planification
- une intégration
- une API
- un webhook
- une génération IA
- une règle métier

---

# Actions
Une automatisation peut réaliser plusieurs actions.

Exemples :

- créer une ressource
- mettre à jour une ressource
- envoyer une notification
- créer une tâche
- publier un message
- lancer une génération IA
- appeler une API
- exécuter un webhook
- envoyer un e-mail

---

# Conditions
Une automatisation peut être conditionnelle.

Exemples :

- uniquement pour certains Workspaces
- uniquement pour certains rôles
- uniquement pour un statut précis
- uniquement si une condition est remplie
Les conditions restent configurables.

---

# Files d'attente
Les traitements longs doivent être exécutés de manière asynchrone.

Exemples :

- génération IA
- import massif
- export
- synchronisation
- création de miniatures
- calcul Analytics
Les files d'attente améliorent la stabilité de la plateforme.

---

# Réessais
Les traitements peuvent être rejoués automatiquement.

Exemples :

- erreur réseau
- API indisponible
- quota dépassé
- service temporairement inaccessible
Les tentatives doivent être limitées.

---

# Idempotence
Un même événement ne doit jamais produire plusieurs fois le même résultat.

Chaque événement doit pouvoir être traité sans créer de doublons.

---

# Notifications
Les notifications sont des conséquences possibles d'un événement.

Exemple :

```
partner.created
      ↓
Notification
      ↓
Community Manager
```
Toutes les notifications passent par le Shared Core.

---

# Automatisations IA
Les événements peuvent déclencher l'intelligence artificielle.

Exemples :

- création automatique d'une biographie
- proposition d'une publication
- génération d'un résumé
- traduction
- classement automatique
Les résultats IA doivent toujours pouvoir être validés par un utilisateur lorsque nécessaire.

---

# Automatisations planifiées
Certaines automatisations sont exécutées selon un calendrier.

Exemples :

- rapport hebdomadaire
- sauvegarde
- nettoyage
- synchronisation
- génération Analytics
Ces automatisations ne dépendent pas d'un événement métier.

---

# Priorité
Les événements peuvent posséder une priorité.

Exemples :

- critique
- élevée
- normale
- faible
Les événements critiques doivent être traités en priorité.

---

# Historique
Toutes les automatisations importantes doivent être historisées.

Exemples :

- déclenchement
- durée
- résultat
- erreur
- utilisateur
- Workspace

---

# Gestion des erreurs
Une erreur dans une automatisation ne doit pas bloquer la plateforme.

Le système doit permettre :

- journalisation
- nouvelle tentative
- notification
- reprise

---

# Sécurité
Toutes les automatisations doivent respecter :

- le Workspace
- les permissions
- les quotas
- les Feature Flags
- le plan d'abonnement
Une automatisation ne peut jamais contourner les règles de sécurité.

---

# Multi-tenant
Les événements sont toujours limités au Workspace.

Un événement produit dans un Workspace ne doit jamais déclencher une action dans un autre Workspace sans mécanisme explicite.

---

# Exemple complet

```
Athlete.created
      ↓
Créer dossier média
      ↓
Créer espace Hub
      ↓
Créer objectif Analytics
      ↓
Notifier le Manager
      ↓
Proposer une biographie IA
```
Chaque étape est indépendante et peut évoluer sans modifier les autres.

---

# Évolutivité
Le moteur d'événements doit permettre :

- de nouveaux domaines
- de nouveaux événements
- de nouveaux workflows
- de nouvelles actions
- de nouvelles intégrations
Sans modifier les workflows existants.

---

# Surveillance
Le système doit permettre de suivre :

- les événements publiés
- les événements traités
- les erreurs
- les délais
- les workflows exécutés
- les files d'attente
Ces informations pourront alimenter Analytics.

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- les domaines publient des événements
- les domaines restent indépendants
- les événements sont limités au Workspace
- les automatisations respectent les permissions
- les traitements longs sont asynchrones
- les événements sont idempotents
- les workflows sont configurables
- les erreurs restent isolées
- les événements sont historisés
- les intégrations utilisent les mêmes mécanismes

---

# Principe fondamental
L'architecture événementielle permet à KLIQUE Platform d'évoluer sans créer de dépendances fortes entre les domaines.

Chaque domaine reste autonome.

Les événements deviennent le langage commun de communication de toute la plateforme.

---

# Documents liés

- 03_PLATFORM_MODULES.md
- 04_SHARED_SERVICES.md
- 09_DATA_ARCHITECTURE.md
- 10_ENTITY_MODEL.md
- 11_INTEGRATIONS_ARCHITECTURE.md
- 13_AI_ARCHITECTURE.md
- 15_ANALYTICS_ARCHITECTURE.md
- 19_SCALABILITY_AND_RELIABILITY.md

---

# Prochaine étape
Le prochain document à créer est :

`/docs/13_AI_ARCHITECTURE.md`

Il devra définir l'architecture complète de KLIQUE AI Studio, les assistants, les agents, la gestion du contexte, les modèles IA, les workflows intelligents et les principes d'intégration de l'intelligence artificielle dans toute la plateforme.

Ne modifie aucun autre fichier du projet.
