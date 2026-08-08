# KLIQUE Platform
**Document :** Architecture de KLIQUE Analytics

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour toute l'architecture de KLIQUE Analytics.

---

# Objectif
KLIQUE Analytics permet de mesurer, comprendre et améliorer l'utilisation de la plateforme.

Il centralise :

- les indicateurs
- les tableaux de bord
- les rapports
- les objectifs
- les statistiques
- les performances
- les données d'utilisation
- les métriques IA
Analytics transforme les données opérationnelles en informations décisionnelles.

---

# Principe fondamental
KLIQUE Analytics ne possède pas les données métier.

Il calcule des indicateurs à partir des données provenant des autres domaines.

```
CRM
Hub
Media
AI Studio
Shared Core
        │
        ▼
KLIQUE Analytics
        │
        ▼
Dashboards
KPIs
Reports
```
Les domaines restent propriétaires de leurs données.

---

# Les composants principaux
KLIQUE Analytics est composé des modules suivants :

- Dashboards
- KPIs
- Metrics
- Reports
- Goals
- Segments
- Widgets
- Data Engine
- Exports
Chaque module possède une responsabilité unique.

---

# Dashboards
Les Dashboards regroupent plusieurs indicateurs dans une vue cohérente.

Ils peuvent être :

- personnels
- partagés
- système
- Workspace
- spécifiques à un rôle
Chaque Dashboard est personnalisable.

---

# Widgets
Les Dashboards sont composés de Widgets.

Exemples :

- graphique
- tableau
- compteur
- jauge
- calendrier
- liste
- carte
- évolution temporelle
Chaque Widget interroge le moteur Analytics.

---

# KPIs
Les KPIs représentent les indicateurs stratégiques.

Exemples :

- nouveaux athlètes
- partenaires actifs
- publications créées
- taux d'engagement
- projets terminés
- revenus
- coûts IA
Les KPIs sont calculés automatiquement.

---

# Metrics
Une Metric représente une valeur mesurable.

Exemples :

- nombre de messages
- nombre d'Assets
- nombre de contacts
- nombre d'utilisateurs actifs
- stockage utilisé
- téléchargements
Les Metrics alimentent les KPIs.

---

# Reports
Les Reports permettent de produire des analyses structurées.

Ils peuvent être :

- manuels
- automatiques
- planifiés
- exportables
- partagés
Un Report peut regrouper plusieurs Dashboards ou KPIs.

---

# Goals
Les Goals représentent des objectifs.

Exemples :

- recruter 50 athlètes
- publier 100 contenus
- signer 10 partenaires
- réduire les coûts IA
- atteindre un taux d'engagement
Les objectifs peuvent être suivis automatiquement.

---

# Segments
Les Segments permettent de filtrer les données.

Exemples :

- sport
- catégorie
- équipe
- région
- partenaire
- période
- statut
Les Segments sont réutilisables dans toute la plateforme.

---

# Data Engine
Le Data Engine calcule les indicateurs.

Il est responsable :

- des agrégations
- des calculs
- des comparaisons
- des tendances
- des séries temporelles
Il ne modifie jamais les données métier.

---

# Sources de données
Analytics utilise les données provenant de :

- CRM
- Hub
- Media
- AI Studio
- Shared Core
Chaque domaine reste la source officielle.

---

# Données calculées
Les données Analytics sont dérivées.

Exemples :

- moyenne
- total
- progression
- évolution
- classement
- comparaison
Les données calculées peuvent être reconstruites.

---

# Historique
Analytics conserve les historiques nécessaires.

Exemples :

- évolution quotidienne
- évolution mensuelle
- progression annuelle
- historique des KPI
L'historique permet les comparaisons.

---

# Temps réel
Certaines métriques peuvent être mises à jour en temps réel.

Exemples :

- utilisateurs connectés
- messages
- uploads
- tâches en cours
Les autres calculs peuvent être différés.

---

# Calcul différé
Les calculs complexes peuvent être exécutés en arrière-plan.

Exemples :

- rapports volumineux
- statistiques annuelles
- IA
- analyses avancées
Les traitements utilisent des files d'attente.

---

# Personnalisation
Chaque Workspace peut créer :

- Dashboards
- KPIs
- Reports
- Widgets
- Segments
- Goals
Les personnalisations restent propres au Workspace.

---

# Permissions
Les Dashboards respectent les permissions.

Un utilisateur ne peut consulter que les données auxquelles il a accès.

Analytics ne contourne jamais les règles du CRM ou des autres domaines.

---

# Multi-tenant
Toutes les analyses sont limitées au Workspace actif.

Un Workspace ne peut jamais consulter :

- les KPI d'un autre client
- les utilisateurs d'un autre client
- les coûts d'un autre client
- les rapports d'un autre client
L'isolation reste totale.

---

# Analytics IA
AI Studio alimente Analytics.

Exemples :

- nombre de générations
- coût
- durée
- modèle utilisé
- taux de validation
- productivité
- temps économisé
Ces indicateurs permettent de piloter l'utilisation de l'IA.

---

# Analytics CRM
Le CRM fournit notamment :

- nombre de contacts
- athlètes
- partenaires
- opportunités
- projets
- activités
Ces données alimentent automatiquement les KPI.

---

# Analytics Media
Media fournit notamment :

- nombre d'Assets
- stockage
- téléchargements
- partages
- publications
- collections

---

# Analytics Hub
Le Hub fournit notamment :

- messages
- réactions
- participation
- événements
- activité communautaire

---

# Dashboards système
La plateforme peut proposer plusieurs modèles.

Exemples :

- Communication
- CRM
- Sponsoring
- Média
- Direction
- IA
- Activité générale
Ces modèles sont personnalisables.

---

# Exports
Les rapports peuvent être exportés.

Exemples :

- PDF
- Excel
- CSV
Les exports respectent toujours les permissions.

---

# Comparaisons
Analytics peut comparer :

- périodes
- équipes
- campagnes
- saisons
- projets
Les comparaisons restent limitées au Workspace.

---

# Prévisions
À long terme, Analytics pourra proposer :

- prévisions
- tendances
- détection d'anomalies
- recommandations IA
Ces fonctionnalités utilisent les données existantes.

---

# Notifications
Analytics peut produire des alertes.

Exemples :

- objectif atteint
- baisse importante
- quota dépassé
- coût IA élevé
- stockage presque plein
Les notifications utilisent le Shared Core.

---

# Historisation
Les modifications des Dashboards sont historisées.

Exemples :

- création
- modification
- partage
- suppression
- duplication

---

# Performances
Le moteur Analytics doit supporter :

- plusieurs millions d'événements
- calculs rapides
- tableaux de bord instantanés
- historiques volumineux
Les performances doivent rester indépendantes des domaines métier.

---

# Évolutivité
L'architecture doit permettre d'ajouter facilement :

- nouveaux KPI
- nouveaux Widgets
- nouvelles sources
- nouveaux calculs
- nouveaux rapports
Sans modifier les domaines produits.

---

# Exemples de flux

## Nouveau partenaire

```
Partner.created
        ↓
Analytics
        ↓
KPI mis à jour
        ↓
Dashboard
```

---

## Génération IA

```
Generation.completed
        ↓
Coût calculé
        ↓
Historique
        ↓
Dashboard IA
```

---

## Publication

```
Publication.published
        ↓
Analytics
        ↓
Performance
        ↓
Rapport
```

---

# Sécurité
Analytics respecte toujours :

- Workspace
- permissions
- rôles
- quotas
- confidentialité
Les indicateurs ne doivent jamais révéler des informations interdites.

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- Analytics n'est jamais la source de vérité
- les domaines restent propriétaires des données
- les KPI sont calculés
- les Dashboards sont personnalisables
- les rapports utilisent les permissions
- les calculs lourds sont différés
- les Widgets restent indépendants
- les Segments sont réutilisables
- les données restent isolées par Workspace
- les coûts IA sont mesurés

---

# Principe fondamental
KLIQUE Analytics transforme les données opérationnelles en informations utiles à la décision.

Il ne crée pas de nouvelles données métier.

Il mesure, compare, synthétise et met en valeur les informations produites par les autres domaines de KLIQUE Platform.

---

# Documents liés

- 03_PLATFORM_MODULES.md
- 04_SHARED_SERVICES.md
- 09_DATA_ARCHITECTURE.md
- 10_ENTITY_MODEL.md
- 11_INTEGRATIONS_ARCHITECTURE.md
- 12_EVENTS_AND_AUTOMATIONS.md
- 13_AI_ARCHITECTURE.md
- 14_MEDIA_ARCHITECTURE.md
- 17_BILLING_AND_PLANS.md
- 19_SCALABILITY_AND_RELIABILITY.md

---

# Prochaine étape
Le prochain document à créer est :

`/docs/16_SECURITY_AND_COMPLIANCE.md`

Il devra définir l'architecture de sécurité de KLIQUE Platform, les principes de conformité, la protection des données, les audits, la journalisation, le chiffrement, les sauvegardes et la gouvernance de la sécurité.

Ne modifie aucun autre fichier du projet.
