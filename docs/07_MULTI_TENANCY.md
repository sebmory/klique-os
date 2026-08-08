# KLIQUE Platform
**Document :** Architecture Multi-Tenant

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour toute l'architecture multi-tenant de KLIQUE Platform.

---

# Objectif
KLIQUE Platform est une plateforme SaaS multi-tenant.

Une seule plateforme héberge plusieurs organisations totalement indépendantes.

Chaque organisation travaille dans son propre Workspace.

Ce document définit :

- le modèle multi-tenant
- l'isolation des données
- les règles de séparation
- les interactions entre Workspaces
- la sécurité
- les performances
- la scalabilité
- les principes d'évolution

---

# Principe fondamental
Le Workspace est le tenant de KLIQUE Platform.

Toutes les données métier appartiennent obligatoirement à un Workspace.

Aucune donnée métier ne peut exister sans être rattachée à un Workspace.

```
Workspace
    ↓
Utilisateurs
    ↓
Modules
    ↓
Données
```
Le Workspace constitue la frontière principale de sécurité.

---

# Définition d'un tenant
Dans KLIQUE Platform, un tenant représente une organisation indépendante.

Exemples :

- KLIQUE
- un club
- une fédération
- un photographe
- un média
- une agence
- une entreprise partenaire
Chaque tenant possède :

- ses utilisateurs
- ses paramètres
- ses permissions
- ses données
- ses contenus
- ses médias
- ses conversations
- ses automatisations
- ses statistiques

---

# Isolation des données
Toutes les données sont isolées par Workspace.

Les règles suivantes sont obligatoires :

- aucune lecture entre Workspaces
- aucune écriture entre Workspaces
- aucun partage implicite
- aucune recherche globale entre Workspaces
- aucune statistique globale visible par un client
- aucune génération IA utilisant les données d'un autre Workspace
L'isolation est appliquée au niveau des services et des données.

---

# Portée du Workspace
Le Workspace actif définit automatiquement :

- les utilisateurs visibles
- les contacts
- les athlètes
- les projets
- les médias
- les conversations
- les tableaux de bord
- les notifications
- les paramètres
- les automatisations IA
Tous les modules utilisent automatiquement ce contexte.

---

# Données globales
Certaines données sont globales à la plateforme.

Exemples :

- identités utilisateurs
- catalogue des plans
- langues disponibles
- paramètres système
- fournisseurs OAuth
- modèles système
- Feature Flags globaux
Ces données n'appartiennent à aucun Workspace.

Elles sont gérées exclusivement par le Shared Core.

---

# Données locales
Les données métier appartiennent toujours à un Workspace.

Exemples :

- contacts
- clubs
- athlètes
- partenaires
- opportunités
- shootings
- projets
- messages
- médias
- publications
- tableaux de bord
- prompts privés
- rapports
- historiques IA
Ces données ne doivent jamais être accessibles depuis un autre Workspace.

---

# Identification des données
Toute donnée métier possède obligatoirement un identifiant de Workspace.

Exemple :

```
workspace_id
```
Le Workspace devient une clé fonctionnelle présente dans toute la plateforme.

Aucune ressource métier ne peut être créée sans cette référence.

---

# Changement de Workspace
Lorsqu'un utilisateur change de Workspace :

- le contexte est entièrement rechargé
- les permissions sont recalculées
- les caches sont invalidés
- les recherches sont réinitialisées
- les données précédentes disparaissent
- les notifications changent
- les modules se reconfigurent
Aucune donnée de l'ancien Workspace ne doit rester visible.

---

# Recherche
La recherche respecte toujours le Workspace actif.

Une recherche ne peut retourner que des ressources appartenant au Workspace courant.

Même si deux Workspaces possèdent un contact identique, les résultats restent totalement séparés.

---

# Intelligence artificielle
Toutes les générations IA utilisent exclusivement les données autorisées du Workspace actif.

L'IA ne peut jamais :

- lire les données d'un autre Workspace
- apprendre d'un Workspace client vers un autre
- partager automatiquement des contenus
- utiliser des conversations privées externes
Le contexte IA est entièrement isolé.

---

# Médias
Les fichiers appartiennent également au Workspace.

Même si deux Workspaces utilisent une photo identique, chacun possède sa propre ressource logique.

Les liens de téléchargement doivent toujours vérifier :

- le Workspace
- les permissions
- la validité du lien
- les éventuelles restrictions

---

# Notifications
Les notifications sont isolées.

Un utilisateur appartenant à plusieurs Workspaces reçoit uniquement les notifications correspondant au Workspace concerné.

Les notifications doivent être regroupées par contexte.

---

# Analytics
Les tableaux de bord utilisent uniquement les données du Workspace actif.

Aucun Workspace ne peut consulter :

- les statistiques d'un autre client
- les performances d'un concurrent
- les indicateurs globaux de la plateforme
Les statistiques internes de KLIQUE Platform sont réservées aux administrateurs SaaS.

---

# Partage entre Workspaces
Le partage direct entre Workspaces n'existe pas par défaut.

Tout partage doit être explicite.

Exemples possibles :

- partage sécurisé d'un média
- invitation dans un autre Workspace
- lien public
- collaboration inter-organisations
Ces mécanismes devront être documentés séparément.

---

# Comptes multi-Workspace
Un utilisateur peut appartenir à plusieurs Workspaces.

Chaque appartenance est indépendante.

Exemple :

```
Utilisateur

├── Workspace KLIQUE
├── Workspace Elfic
├── Workspace Swiss Basketball
└── Workspace Agence
```
Les rôles, permissions et paramètres sont propres à chaque Workspace.

---

# Performance
L'architecture doit rester performante même avec :

- plusieurs milliers de Workspaces
- des millions de médias
- des dizaines de millions de ressources
- un grand nombre d'utilisateurs simultanés
Aucune requête ne doit parcourir inutilement les données de tous les Workspaces.

---

# Scalabilité
La plateforme doit évoluer horizontalement.

Elle doit permettre :

- l'ajout de nouveaux serveurs
- le partitionnement des données
- le stockage distribué
- la mise en cache
- la montée en charge progressive
L'ajout d'un nouveau client ne doit nécessiter aucune modification du code.

---

# Sauvegardes
Les sauvegardes doivent permettre :

- la restauration globale
- la restauration d'un Workspace
- la restauration d'une ressource
- la restauration après incident
Les restaurations doivent préserver l'isolation des données.

---

# Suppression d'un Workspace
Lorsqu'un Workspace est supprimé :

- les données sont archivées selon les politiques applicables
- les utilisateurs conservent leur identité globale
- les autres Workspaces restent inchangés
- les journaux d'audit sont conservés selon les règles de conformité
La suppression d'un Workspace ne doit jamais affecter un autre tenant.

---

# Super-administration
Les administrateurs internes de KLIQUE Platform sont distincts des administrateurs des Workspaces.

Ils disposent de privilèges spécifiques pour l'exploitation de la plateforme.

Toute consultation exceptionnelle des données d'un Workspace doit être :

- autorisée
- limitée
- temporaire
- journalisée
- justifiée

---

# Sécurité
L'isolation multi-tenant constitue une exigence de sécurité.

Chaque service doit vérifier :

- le Workspace actif
- les permissions
- l'appartenance
- la ressource demandée
Aucun service ne doit contourner ces vérifications.

---

# Architecture cible

```
                    KLIQUE Platform

                  Shared Core
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
Workspace A      Workspace B      Workspace C
    │                  │                  │
 CRM / Hub       CRM / Hub       CRM / Hub
 Media           Media           Media
 AI Studio       AI Studio       AI Studio
 Analytics       Analytics       Analytics
```
Tous les Workspaces utilisent la même plateforme tout en restant totalement indépendants.

---

# Avantages du modèle
Cette architecture permet :

- une maintenance unique
- des mises à jour centralisées
- une évolutivité importante
- une meilleure sécurité
- une commercialisation SaaS
- une réduction des coûts d'exploitation
- une expérience homogène

---

# Évolutions futures
L'architecture doit pouvoir supporter ultérieurement :

- organisations hiérarchiques
- Workspaces liés
- collaborations inter-Workspaces
- partage sécurisé
- Marketplace
- Academy
- modules complémentaires
- hébergement régional
- stockage distribué
Ces évolutions ne doivent jamais remettre en cause l'isolation fondamentale.

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- toute donnée métier appartient à un Workspace
- un Workspace est totalement isolé
- aucune donnée n'est partagée implicitement
- le Workspace actif définit le contexte
- l'IA respecte le Workspace
- les recherches respectent le Workspace
- les permissions sont évaluées dans le Workspace
- les sauvegardes préservent l'isolation
- les administrateurs SaaS sont séparés des administrateurs Workspace
- aucune fonctionnalité ne doit casser le modèle multi-tenant

---

# Principe fondamental
KLIQUE Platform est une plateforme unique.

Les Workspaces sont indépendants.

L'utilisateur partage une identité globale, mais toutes les données, permissions, contenus et interactions restent strictement isolés dans le Workspace actif.

L'architecture multi-tenant constitue la base de toute la plateforme.

---

# Documents liés

- 00_VISION.md
- 01_ARCHITECTURE_OVERVIEW.md
- 04_SHARED_SERVICES.md
- 05_IDENTITY_AND_ACCESS.md
- 06_ROLES_AND_PERMISSIONS.md
- 08_WORKSPACES.md
- 09_DATA_ARCHITECTURE.md
- 16_SECURITY_AND_COMPLIANCE.md
- 17_BILLING_AND_PLANS.md
- 19_SCALABILITY_AND_RELIABILITY.md

---

# Prochaine étape
Le prochain document à créer est :

`/docs/09_DATA_ARCHITECTURE.md`

Il devra définir le modèle de données global de KLIQUE Platform, les principes de stockage, les relations entre les entités et les règles garantissant une source de vérité unique.

Ne modifie aucun autre fichier du projet.
