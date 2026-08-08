# KLIQUE Platform

**Document :** Workspaces

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour toute l'architecture multi-utilisateurs de KLIQUE Platform.

---

# Objectif

Le Workspace est l'unité centrale de KLIQUE Platform.

Toutes les données, tous les utilisateurs, toutes les conversations, tous les médias et toutes les générations d'intelligence artificielle appartiennent toujours à un Workspace.

Aucune donnée ne doit exister en dehors d'un Workspace.

---

# Qu'est-ce qu'un Workspace ?

Un Workspace représente une organisation.

Il peut s'agir par exemple :

- de KLIQUE
- d'un club sportif
- d'un photographe
- d'un média
- d'une agence
- d'une fédération
- d'une entreprise partenaire

Chaque Workspace est totalement indépendant.

Les données d'un Workspace ne sont jamais visibles par un autre Workspace.

---

# Ce qu'un Workspace contient

Chaque Workspace possède sa propre base de données.

Elle comprend notamment :

- les utilisateurs
- les rôles
- les athlètes ou contacts
- les partenaires
- les experts
- les médias
- les shootings
- les contenus
- les calendriers
- les tâches
- les opportunités
- les discussions
- les notifications
- les générations IA
- les paramètres

Toutes ces données sont isolées des autres Workspaces.

---

# Les rôles

Chaque Workspace définit ses propres membres.

Les rôles disponibles sont :

- Owner
- Administrator
- Manager
- Community Manager
- Photographe
- Journaliste
- Athlète
- Partenaire
- Expert
- Média
- Invité

Chaque rôle possède des permissions spécifiques.

Les permissions seront documentées dans un document dédié.

---

# Un utilisateur peut appartenir à plusieurs Workspaces

Un utilisateur ne possède pas nécessairement un seul Workspace.

Exemple :

Sébastien peut appartenir à :

- Workspace KLIQUE
- Workspace Elfic Fribourg
- Workspace Swiss Basketball

Lorsqu'il se connecte, il choisit le Workspace dans lequel il souhaite travailler.

Toutes les informations affichées dépendent uniquement du Workspace actif.

---

# Le Workspace est le contexte de toute la plateforme

Tous les modules utilisent automatiquement le Workspace actif.

KLIQUE CRM

KLIQUE AI Studio

KLIQUE Hub

KLIQUE Media

KLIQUE Analytics

Aucun module ne doit demander à l'utilisateur dans quelle organisation il travaille.

Le Workspace actif définit automatiquement le contexte.

---

# Intelligence artificielle

Toutes les générations IA utilisent le Workspace actif.

L'IA peut utiliser :

- les données du CRM
- les médias disponibles
- les anciens contenus
- les partenaires
- les événements
- le calendrier
- les paramètres de communication

Le contexte est donc différent pour chaque Workspace.

---

# KLIQUE AI Studio

Deux modes sont disponibles.

## Mode connecté

L'IA utilise automatiquement les données du Workspace.

## Mode libre

L'utilisateur peut créer un contenu concernant une personne ou une organisation qui n'existe pas encore dans le Workspace.

Les deux modes doivent toujours coexister.

---

# KLIQUE Hub

Chaque Workspace possède son propre Hub.

Le Hub contient :

- les espaces de discussion
- les annonces
- les messages
- les fichiers
- les réactions
- les notifications

Aucun message ne peut être partagé entre deux Workspaces.

---

# Objectif à long terme

Le Workspace doit permettre à KLIQUE Platform de fonctionner aussi bien pour :

- un photographe indépendant
- un club amateur
- un club professionnel
- une fédération
- un média
- une agence
- KLIQUE

sans modifier le code de la plateforme.

Le comportement de l'application dépend uniquement des données, des permissions et de la configuration du Workspace.

---

# Principe fondamental

Toutes les nouvelles fonctionnalités devront répondre à une règle simple :

"Elles doivent fonctionner pour n'importe quel Workspace sans nécessiter de développement spécifique."

Si une fonctionnalité dépend d'un type précis d'utilisateur ou d'organisation, elle devra être configurable, jamais codée en dur.
