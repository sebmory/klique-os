# KLIQUE Platform
**Document :** Abonnements et facturation

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour toute l'architecture des abonnements de KLIQUE Platform.

---

# Objectif
KLIQUE Platform est une plateforme SaaS.

Chaque Workspace possède un abonnement qui détermine :

- les modules disponibles
- les fonctionnalités
- les quotas
- les limites
- les options
- les capacités IA
- les intégrations
- les utilisateurs autorisés
L'architecture doit permettre de faire évoluer l'offre commerciale sans modifier le code métier.

---

# Principe fondamental
Les fonctionnalités ne dépendent jamais du type de client.

Elles dépendent uniquement :

- du plan actif
- des options activées
- des quotas disponibles
- des Feature Flags
Aucune règle commerciale ne doit être codée en dur.

---

# Architecture générale

```
Workspace
      │
      ▼
Subscription
      │
      ▼
Plan
      │
      ▼
Fonctionnalités
Quotas
Options
```
Le Shared Core applique ces règles dans toute la plateforme.

---

# Les composants principaux
Le système d'abonnement comprend notamment :

- Plans
- Subscriptions
- Features
- Quotas
- Add-ons
- Licences
- Facturation
- Paiements
- Essais
- Renouvellements

---

# Plan
Un Plan décrit une offre commerciale.

Exemples :

- Free
- Starter
- Pro
- Business
- Enterprise
Le nom commercial peut évoluer sans modifier l'architecture.

---

# Subscription
La Subscription représente l'abonnement actif d'un Workspace.

Elle contient notamment :

- plan actif
- statut
- période
- options
- quotas
- historique
- renouvellement
Chaque Workspace possède au maximum une Subscription active.

---

# Statuts
Une Subscription peut posséder plusieurs états.

Exemples :

- Trial
- Active
- Suspended
- Expired
- Cancelled
- Archived
Le comportement de la plateforme dépend de cet état.

---

# Trial
Un Workspace peut bénéficier d'une période d'essai.

Le Trial possède notamment :

- date de début
- date de fin
- limitations
- fonctionnalités disponibles
À son expiration, la plateforme applique automatiquement les règles prévues.

---

# Fonctionnalités
Chaque fonctionnalité est indépendante.

Exemples :

- CRM
- AI Studio
- Hub
- Media
- Analytics
- API
- Automatisations
- Intégrations
- Export
- IA avancée
Les fonctionnalités sont activées par configuration.

---

# Quotas
Les quotas limitent l'utilisation.

Exemples :

- utilisateurs
- Workspaces secondaires
- stockage
- Assets
- générations IA
- agents IA
- workflows
- intégrations
- exports
- API
Les quotas sont mesurés automatiquement.

---

# Dépassement des quotas
Lorsqu'un quota est atteint, plusieurs stratégies sont possibles.

Exemples :

- blocage
- avertissement
- dépassement temporaire
- facturation complémentaire
- demande de mise à niveau
Le comportement dépend de la politique commerciale.

---

# Add-ons
Les Add-ons permettent d'ajouter des capacités.

Exemples :

- stockage supplémentaire
- IA supplémentaire
- utilisateurs supplémentaires
- intégrations Premium
- support prioritaire
Les Add-ons complètent le plan principal.

---

# Licences
Certaines fonctionnalités peuvent fonctionner avec des licences.

Exemples :

- utilisateur nommé
- utilisateur simultané
- licence Expert
- licence IA
- licence Enterprise
Le système doit rester suffisamment flexible pour supporter différents modèles.

---

# Feature Flags
Les Feature Flags permettent :

- activer une fonctionnalité
- réaliser un déploiement progressif
- effectuer des tests
- activer une bêta
Les Feature Flags sont indépendants des plans commerciaux.

---

# Modules
Chaque module peut être :

- activé
- désactivé
- limité
- étendu
Exemple :

Un Workspace peut disposer de CRM et Media sans utiliser Analytics.

---

# Intelligence artificielle
Les abonnements peuvent définir :

- modèles disponibles
- nombre de générations
- taille du contexte
- agents disponibles
- workflows IA
- quotas mensuels
Les coûts sont suivis par Analytics.

---

# Intégrations
Le plan peut limiter :

- nombre d'intégrations
- connecteurs disponibles
- API
- webhooks
- synchronisations
Les intégrations restent configurables.

---

# Utilisateurs
Les plans peuvent limiter :

- nombre de membres
- invités
- administrateurs
- équipes
- groupes
Les permissions restent indépendantes des quotas.

---

# Stockage
Le plan peut définir :

- espace disque
- taille maximale des fichiers
- durée de conservation
- archivage
Le stockage est surveillé en permanence.

---

# Paiements
Le système doit supporter différents modes de paiement.

Exemples :

- carte bancaire
- Stripe
- PayPal
- virement
- facture
Les fournisseurs de paiement sont considérés comme des intégrations.

---

# Facturation
Chaque Workspace possède son historique.

Exemples :

- factures
- paiements
- crédits
- remboursements
- renouvellements
La facturation est indépendante des domaines métiers.

---

# Renouvellement
Les abonnements peuvent être :

- mensuels
- annuels
- personnalisés
Le renouvellement peut être :

- automatique
- manuel

---

# Suspension
Une Subscription suspendue peut entraîner :

- blocage des créations
- accès limité
- désactivation des intégrations
- désactivation de certaines automatisations
Les données restent conservées selon les politiques applicables.

---

# Résiliation
Lorsqu'un abonnement est résilié :

- les données restent disponibles pendant la période prévue
- les règles de conservation s'appliquent
- les exports restent possibles selon la politique définie
- les suppressions éventuelles sont différées

---

# Changement de plan
Un Workspace peut changer de plan.

Le changement peut :

- augmenter les quotas
- réduire les quotas
- activer de nouveaux modules
- désactiver certaines fonctionnalités
Les données existantes ne doivent jamais être perdues.

---

# Multi-tenant
Chaque Workspace possède sa propre Subscription.

Deux Workspaces peuvent utiliser des plans différents sans modifier le fonctionnement global de la plateforme.

---

# Permissions
Les permissions déterminent ce qu'un utilisateur peut faire.

Le plan détermine quelles fonctionnalités existent.

Ces deux mécanismes restent indépendants.

---

# Analytics
Analytics mesure notamment :

- nombre d'abonnements
- utilisation des quotas
- consommation IA
- stockage
- fonctionnalités utilisées
- taux de conversion
- renouvellements
Ces informations sont réservées aux personnes autorisées.

---

# Notifications
Le système peut envoyer des notifications.

Exemples :

- quota bientôt atteint
- abonnement expirant
- paiement réussi
- paiement échoué
- essai bientôt terminé
Les notifications utilisent le Shared Core.

---

# Historique
Les événements suivants doivent être historisés :

- création d'abonnement
- changement de plan
- renouvellement
- suspension
- résiliation
- ajout d'Add-on
- modification de quota

---

# API
Les API doivent permettre :

- consulter les abonnements
- consulter les quotas
- consulter les fonctionnalités
- recevoir les événements de facturation
Les API respectent les permissions.

---

# Évolutivité
L'architecture doit permettre d'ajouter facilement :

- nouveaux plans
- nouveaux quotas
- nouvelles options
- nouveaux Add-ons
- nouveaux modèles de licence
- nouveaux moyens de paiement
Sans modifier les domaines produits.

---

# Exemple de fonctionnement

```
Workspace
      ↓
Plan Pro
      ↓
CRM activé
Media activé
Analytics activé
      ↓
Quota IA disponible
      ↓
Génération autorisée
```

---

# Sécurité
Les données de facturation doivent être :

- protégées
- chiffrées
- journalisées
- limitées aux personnes autorisées
Les fournisseurs de paiement restent responsables des données bancaires sensibles lorsqu'elles sont externalisées.

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- les fonctionnalités dépendent du plan
- les permissions restent indépendantes du plan
- les quotas sont configurables
- les Add-ons complètent les plans
- les données sont conservées selon les politiques définies
- les changements de plan ne détruisent pas les données
- les paiements restent découplés des domaines métiers
- les abonnements sont propres à chaque Workspace
- les coûts IA sont suivis
- aucune logique commerciale n'est codée en dur

---

# Principe fondamental
Le système d'abonnement doit permettre à KLIQUE Platform de faire évoluer librement son modèle économique sans modifier l'architecture métier.

Toutes les capacités de la plateforme sont activées par configuration, jamais par développement spécifique.

---

# Documents liés

- 04_SHARED_SERVICES.md
- 05_IDENTITY_AND_ACCESS.md
- 07_MULTI_TENANCY.md
- 13_AI_ARCHITECTURE.md
- 14_MEDIA_ARCHITECTURE.md
- 15_ANALYTICS_ARCHITECTURE.md
- 16_SECURITY_AND_COMPLIANCE.md
- 18_DEPLOYMENT_AND_OPERATIONS.md
- 19_SCALABILITY_AND_RELIABILITY.md

---

# Prochaine étape
Le prochain document à créer est :

`/docs/18_DEPLOYMENT_AND_OPERATIONS.md`

Il devra définir l'architecture d'exploitation de KLIQUE Platform, les environnements, les déploiements, la supervision, les sauvegardes opérationnelles, les mises à jour et les procédures d'exploitation.

Ne modifie aucun autre fichier du projet.
