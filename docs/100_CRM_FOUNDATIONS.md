# KLIQUE Platform
**Document :** Fondations du CRM

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour toute la conception du domaine CRM.

---

# Objectif
Le CRM de KLIQUE Platform n'est pas un CRM commercial classique.

Il constitue le cœur relationnel de toute la plateforme.

Toutes les relations entre les personnes, les organisations, les projets, les médias, les conversations, les événements et les contenus prennent leur origine dans le CRM.

---

# Principe fondamental
Le CRM ne sert pas uniquement à gérer des contacts.

Il modélise l'écosystème sportif.

Chaque personne, chaque organisation et chaque relation peut être utilisée par les autres domaines de la plateforme.

Le CRM est la mémoire vivante du Workspace.

---

# Une approche orientée relations
Le CRM ne doit jamais être pensé comme une simple liste de fiches.

Il représente un graphe relationnel.

Chaque élément est relié à d'autres.

Exemple :

```
Athlète
    │
    ├── Club
    ├── Agent
    ├── Famille
    ├── Sponsor
    ├── Projet
    ├── Médias
    ├── Publications
    └── Conversations
```
Toutes ces relations peuvent évoluer dans le temps.

---

# Le CRM est la source de vérité
Le CRM est propriétaire des données relationnelles.

Les autres domaines utilisent uniquement des références.

Exemple :

- Media référence un Athlete.
- Hub référence un Athlete.
- AI Studio référence un Athlete.
- Analytics référence un Athlete.
Aucun de ces domaines ne possède les données de l'athlète.

---

# Les grandes familles d'entités
Le CRM repose sur quelques grandes familles.

## Personnes
Exemples :

- athlète
- photographe
- journaliste
- expert
- agent
- dirigeant
- entraîneur

---

## Organisations
Exemples :

- club
- fédération
- entreprise
- média
- agence
- école
- partenaire

---

## Relations
Le CRM décrit les relations entre les personnes et les organisations.

Exemples :

- joue pour
- entraîne
- représente
- sponsorise
- collabore avec
- travaille pour
- appartient à
Les relations possèdent leur propre cycle de vie.

---

## Projets
Le Projet est l'entité qui relie le travail quotidien.

Un projet peut contenir :

- participants
- médias
- tâches
- publications
- événements
- conversations
Le Projet devient le point de convergence de plusieurs domaines.

---

# Le CRM pilote la plateforme
Les autres domaines enrichissent le CRM.

Le CRM, lui, structure la plateforme.

Exemple :

Créer un nouvel athlète peut automatiquement permettre :

- la création d'un espace Hub
- l'association de médias
- la génération d'une biographie IA
- le suivi Analytics

---

# L'intelligence artificielle
Le CRM constitue le principal contexte utilisé par AI Studio.

L'IA peut comprendre :

- qui est une personne
- avec qui elle travaille
- ses projets
- son historique
- ses relations
Cette compréhension permet des assistants réellement intelligents.

---

# Les médias
Les médias ne sont jamais stockés dans le CRM.

Ils sont simplement liés aux entités CRM.

Le CRM ne connaît que les références vers les Assets.

---

# Les conversations
Le Hub ne duplique pas les informations du CRM.

Une conversation référence simplement les personnes ou les organisations concernées.

---

# Les tableaux de bord
Analytics construit ses indicateurs à partir des données CRM.

Le CRM reste toujours la source officielle.

---

# Les Workspaces
Chaque Workspace possède son propre CRM.

Les données sont totalement isolées.

Un même athlète peut exister dans plusieurs Workspaces sans lien automatique.

---

# La philosophie
Le CRM doit répondre à une question simple :

**Qui travaille avec qui, sur quoi, à quel moment et dans quel contexte ?**

Si une fonctionnalité ne contribue pas à répondre à cette question, elle n'a probablement pas sa place dans le CRM.

---

# Ce que le CRM ne doit jamais devenir
Le CRM ne doit jamais devenir :

- un carnet d'adresses
- un tableur amélioré
- un pipeline commercial classique
- une succession de formulaires
- une base de données isolée
Il doit rester le centre relationnel de toute KLIQUE Platform.

---

# Avant toute nouvelle fonctionnalité
Avant d'ajouter une fonctionnalité au CRM, il faut répondre aux questions suivantes :

- Renforce-t-elle le modèle relationnel ?
- Respecte-t-elle la source de vérité ?
- Peut-elle être utilisée par les autres domaines ?
- Est-elle indépendante des autres modules ?
- Fonctionne-t-elle pour tous les types de Workspaces ?
- Reste-t-elle suffisamment simple ?

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- le CRM est la source de vérité des relations
- les autres domaines utilisent des références
- les relations sont des entités de première classe
- les projets relient les différents domaines
- les Workspaces restent totalement isolés
- l'IA utilise le CRM comme contexte
- les médias restent dans KLIQUE Media
- les conversations restent dans KLIQUE Hub
- les indicateurs restent dans Analytics
- le CRM demeure le cœur fonctionnel de KLIQUE Platform

---

# Principe fondamental
Le CRM de KLIQUE Platform n'est pas un simple outil de gestion de contacts.

Il constitue le graphe relationnel de l'ensemble de l'écosystème sportif.

Toutes les autres briques de la plateforme s'appuient sur lui pour comprendre les personnes, les organisations, leurs relations et leurs projets.

Ne modifie aucun autre fichier du projet.
