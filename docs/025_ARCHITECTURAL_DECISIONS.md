# KLIQUE Platform
**Document :** Registre des décisions d'architecture (ADR)

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour toutes les décisions d'architecture de KLIQUE Platform.

---

# Objectif
Les décisions d'architecture les plus importantes doivent être documentées.

Une décision ne doit jamais dépendre uniquement de la mémoire des personnes ayant participé au projet.

Chaque décision importante doit pouvoir être comprise plusieurs années plus tard.

---

# Principe fondamental
Une décision est documentée une seule fois.

Elle explique :

- le contexte
- le problème
- les solutions envisagées
- la décision retenue
- les conséquences
Une décision validée devient une référence pour toute la plateforme.

---

# Quand créer une ADR ?
Une ADR doit être créée lorsqu'une décision impacte durablement :

- l'architecture
- les données
- les Workspaces
- la sécurité
- les performances
- les intégrations
- les technologies
- les règles métier
Les décisions mineures ne nécessitent pas d'ADR.

---

# Format d'une ADR
Chaque ADR utilise la structure suivante.

```
ADR-XXX

Titre

Statut

Date

Contexte

Problème

Options étudiées

Décision

Conséquences

Documents liés
```
Toutes les ADR utilisent exactement ce format.

---

# Statuts possibles
Une ADR peut posséder les statuts suivants :

- Proposed
- Accepted
- Deprecated
- Superseded
Une ADR n'est jamais supprimée.

Son statut évolue.

---

# Numérotation
Les ADR sont numérotées chronologiquement.

Exemples :

- ADR-001
- ADR-002
- ADR-003
Les numéros ne sont jamais réutilisés.

---

# Contenu minimal
Chaque ADR doit répondre aux questions suivantes :

Pourquoi cette décision était-elle nécessaire ?

Quelles étaient les alternatives ?

Pourquoi cette solution a-t-elle été retenue ?

Quelles sont ses conséquences ?

---

# Exemple d'ADR

## ADR-001
Titre :

Le Workspace est l'unité centrale de KLIQUE Platform.

Statut :

Accepted

Contexte :

La plateforme doit fonctionner pour plusieurs organisations.

Décision :

Toutes les données appartiennent à un Workspace.

Conséquences :

Toutes les fonctionnalités deviennent naturellement multi-tenant.

---

# ADR fondatrices
Les premières ADR concernent notamment :

- Workspace First
- Domain Driven Design
- Event Driven Architecture
- Shared Core
- IA comme service transversal
- Source de vérité unique
- Multi-tenant
- Architecture modulaire
Ces décisions constituent les fondations du projet.

---

# Évolution
Une décision peut évoluer.

Elle ne doit jamais être modifiée silencieusement.

Deux possibilités existent :

- créer une nouvelle ADR
- remplacer officiellement une ancienne ADR
L'historique est toujours conservé.

---

# Relations avec la documentation
Les ADR complètent les documents d'architecture.

Les documents expliquent les règles générales.

Les ADR expliquent pourquoi ces règles existent.

Les deux approches sont complémentaires.

---

# Décisions techniques
Les ADR peuvent également documenter des choix techniques importants.

Exemples :

- Next.js
- NestJS
- PostgreSQL
- Prisma
- Redis
- BullMQ
Le choix doit toujours être justifié.

---

# Décisions produit
Les ADR peuvent documenter des choix fonctionnels.

Exemples :

- organisation des Workspaces
- architecture CRM
- modèle des Assets
- fonctionnement des permissions
- structure des domaines

---

# Décisions UX
Les décisions importantes concernant l'expérience utilisateur peuvent également être documentées.

Exemples :

- navigation principale
- recherche universelle
- IA intégrée
- Dashboard unique

---

# Ce qui ne doit pas devenir une ADR
Une ADR ne sert pas à documenter :

- une tâche
- un bug
- une fonctionnalité
- un ticket
- une idée non validée
- un détail d'implémentation
Elle concerne uniquement des décisions structurantes.

---

# Révision
Chaque ADR peut être révisée.

Une révision ne modifie jamais l'historique.

Elle crée une nouvelle décision lorsque cela est nécessaire.

---

# Validation
Une ADR est considérée comme validée lorsqu'elle :

- respecte les principes de KLIQUE Platform
- est cohérente avec l'architecture
- ne contredit pas les documents officiels
- est comprise par l'équipe

---

# Questions avant validation
Avant d'accepter une ADR, il faut pouvoir répondre aux questions suivantes :

- Cette décision est-elle réellement structurante ?
- Les alternatives ont-elles été étudiées ?
- Les conséquences sont-elles connues ?
- Cette décision sera-t-elle encore valable dans plusieurs années ?
- Est-elle compatible avec les principes de conception ?
Si une réponse est négative, la décision doit être revue.

---

# Gouvernance
Les ADR servent de mémoire collective.

Elles permettent :

- d'éviter les débats répétés
- de comprendre les anciens choix
- de faciliter l'arrivée de nouveaux développeurs
- de conserver la cohérence de la plateforme

---

# Exemple de registre

```
ADR-001 Workspace First
ADR-002 Domain Driven Design
ADR-003 Event Driven Architecture
ADR-004 Shared Core
ADR-005 Multi-Tenant
ADR-006 Source de vérité unique
ADR-007 AI as a Service
ADR-008 Media Assets
```
Le registre évolue avec la plateforme.

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- les décisions importantes sont documentées
- une ADR est immuable une fois validée
- une évolution crée une nouvelle ADR
- les ADR expliquent les choix, pas leur implémentation
- les ADR restent indépendantes des technologies lorsque cela est possible
- les ADR complètent la documentation d'architecture
- les décisions restent cohérentes avec les principes de conception
- l'historique est toujours conservé
- les ADR facilitent la maintenance à long terme
- aucune décision structurante ne doit rester implicite

---

# Principe fondamental
Les Architecture Decision Records constituent la mémoire technique et stratégique de KLIQUE Platform.

Ils garantissent que les décisions importantes restent compréhensibles, justifiées et traçables, même plusieurs années après leur adoption.

Ils assurent la continuité de la vision architecturale du projet.

Ne modifie aucun autre fichier du projet.
