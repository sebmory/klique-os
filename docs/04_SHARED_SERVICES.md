# KLIQUE Platform
**Document :** Services partagés

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour tous les services transversaux de KLIQUE Platform.

---

# Objectif
Tous les domaines produits de KLIQUE Platform utilisent un ensemble de services communs.

Ces services constituent le **Shared Core** de la plateforme.

Ils fournissent des fonctionnalités génériques qui ne doivent jamais être réimplémentées dans les domaines produits.

Le Shared Core garantit :

- une architecture cohérente
- une maintenance simplifiée
- une sécurité uniforme
- une expérience utilisateur homogène
- une évolution indépendante des modules métier

---

# Principe général
Un service partagé :

- n'appartient à aucun domaine métier
- peut être utilisé par tous les domaines
- respecte toujours le Workspace actif
- applique systématiquement les permissions
- ne contient aucune logique spécifique à un client
Les domaines produits consomment les services du Shared Core sans les modifier.

---

# Liste des services partagés
Le Shared Core comprend notamment :

- Authentication
- Identity
- Users
- Workspaces
- Roles
- Permissions
- Notifications
- Search
- Files
- Settings
- Billing
- Integrations
- Activity Logs
- Audit
- Feature Flags
Chaque service possède une responsabilité unique.

---

# Authentication

## Mission
Gérer l'authentification des utilisateurs.

## Responsabilités

- connexion
- déconnexion
- gestion des sessions
- récupération de mot de passe
- authentification multifacteur
- expiration des sessions
- révocation des accès
- gestion des appareils de confiance
Tous les domaines utilisent ce service.

---

# Identity

## Mission
Gérer l'identité globale des utilisateurs.

## Responsabilités

- identifiant unique
- profil utilisateur
- préférences personnelles
- avatar
- langue
- fuseau horaire
- informations publiques
L'identité est indépendante des rôles dans les Workspaces.

---

# Users

## Mission
Gérer les utilisateurs de la plateforme.

## Responsabilités

- création
- invitation
- activation
- désactivation
- appartenance aux Workspaces
- statut du compte
- historique des connexions
Un utilisateur peut appartenir à plusieurs Workspaces.

---

# Workspaces

## Mission
Gérer les environnements de travail.

## Responsabilités

- création
- configuration
- sélection du Workspace actif
- isolation des données
- activation des modules
- personnalisation
Tous les domaines utilisent automatiquement le Workspace actif.

---

# Roles

## Mission
Définir les rôles disponibles dans un Workspace.

## Responsabilités

- création des rôles
- hiérarchie éventuelle
- héritage
- description
- attribution
Les rôles ne définissent pas directement les permissions.

Ils regroupent des permissions.

---

# Permissions

## Mission
Contrôler les accès.

## Responsabilités

- lecture
- création
- modification
- suppression
- partage
- validation
- export
- administration
Les permissions sont évaluées avant toute action.

Aucun domaine ne peut contourner ce service.

---

# Notifications

## Mission
Centraliser toutes les notifications.

## Responsabilités

- notifications internes
- e-mails
- notifications mobiles
- préférences utilisateur
- regroupement
- statut de lecture
- archivage
Toutes les notifications passent par ce service.

---

# Search

## Mission
Permettre une recherche globale.

## Responsabilités

- indexation
- recherche multi-domaines
- filtres
- tri
- suggestions
- historique de recherche
Les résultats doivent respecter les permissions.

---

# Files

## Mission
Fournir les services techniques liés aux fichiers.

## Responsabilités

- stockage
- upload
- téléchargement
- miniatures
- conversions
- optimisation
- antivirus
- liens sécurisés
La gestion métier des médias reste dans KLIQUE Media.

---

# Settings

## Mission
Centraliser les paramètres.

## Responsabilités

- paramètres utilisateur
- paramètres Workspace
- préférences régionales
- langue
- fuseau horaire
- formats
- configuration des modules
Les paramètres sont hiérarchisés.

---

# Billing

## Mission
Gérer les abonnements.

## Responsabilités

- plans
- options
- quotas
- paiements
- factures
- renouvellements
- essais
- limitations
Le Billing contrôle les fonctionnalités disponibles.

---

# Integrations

## Mission
Gérer les connexions aux services externes.

## Responsabilités

- API externes
- OAuth
- webhooks
- synchronisations
- clés API
- statut des connexions
- autorisations
Les intégrations utilisent toujours les permissions du Workspace.

---

# Activity Logs

## Mission
Enregistrer les actions importantes.

## Responsabilités

- création
- modification
- suppression
- partage
- validation
- connexion
- export
- administration
Les Activity Logs facilitent le suivi et le support.

---

# Audit

## Mission
Garantir la traçabilité des actions sensibles.

## Responsabilités

- journal de sécurité
- changements de permissions
- modifications critiques
- accès administrateurs
- export des journaux
- conservation des traces
Les journaux d'audit ne doivent jamais être modifiables.

---

# Feature Flags

## Mission
Contrôler l'activation des fonctionnalités.

## Responsabilités

- activation par Workspace
- activation par plan
- activation progressive
- bêta privée
- expérimentation
- désactivation rapide
Aucune fonctionnalité ne doit dépendre d'un code spécifique à un client.

---

# Utilisation par les domaines
Tous les domaines utilisent les mêmes services.

```
CRM
AI Studio
Hub
Media
Analytics
        ↓
Shared Core
```
Les domaines ne communiquent jamais directement avec les mécanismes techniques lorsqu'un service partagé existe.

---

# Ordre de traitement
Toute action suit le même cycle.

```
Utilisateur
    ↓
Authentication
    ↓
Workspace
    ↓
Permissions
    ↓
Service concerné
    ↓
Module métier
    ↓
Journalisation
    ↓
Notification éventuelle
```
Cet ordre doit être respecté par toute la plateforme.

---

# Dépendances
Les services partagés peuvent dépendre entre eux.

Exemple :

- Authentication utilise Identity
- Users utilise Workspaces
- Permissions utilise Roles
- Billing utilise Workspaces
- Notifications utilise Users
- Search utilise Files et CRM
Ces dépendances doivent rester simples et documentées.

---

# Évolutivité
Le Shared Core doit pouvoir accueillir de nouveaux services.

Exemples :

- Traduction
- Signature électronique
- Paiement avancé
- Stockage distribué
- Gestion documentaire
- Moteur de règles
- Scheduler
- IA partagée
Chaque nouveau service doit répondre à une responsabilité unique.

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- un service partagé ne contient pas de logique métier
- un service possède une responsabilité unique
- un service peut être utilisé par tous les domaines
- un service respecte toujours le Workspace actif
- un service applique toujours les permissions
- un service ne dépend jamais d'une organisation spécifique
- un domaine ne réimplémente jamais un service partagé
- toute évolution du Shared Core doit rester compatible avec les domaines existants

---

# Principe fondamental
Le Shared Core constitue la fondation technique de KLIQUE Platform.

Les domaines produits évoluent grâce à lui, mais ne doivent jamais le remplacer ni le contourner.

Toute fonctionnalité commune doit être implémentée une seule fois dans le Shared Core, puis réutilisée partout dans la plateforme.

---

# Documents liés

- 00_VISION.md
- 01_ARCHITECTURE_OVERVIEW.md
- 02_PRODUCT_DOMAINS.md
- 03_PLATFORM_MODULES.md
- 05_IDENTITY_AND_ACCESS.md
- 06_ROLES_AND_PERMISSIONS.md
- 07_MULTI_TENANCY.md
- 08_WORKSPACES.md
- 09_DATA_ARCHITECTURE.md
- 16_SECURITY_AND_COMPLIANCE.md
- 17_BILLING_AND_PLANS.md

---

# Prochaine étape
Le prochain document à créer est :

`/docs/05_IDENTITY_AND_ACCESS.md`

Il devra définir l'architecture complète de l'identité, de l'authentification, des utilisateurs, des rôles et de la gestion des accès dans KLIQUE Platform.

Ne modifie aucun autre fichier du projet.
