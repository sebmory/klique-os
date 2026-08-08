# KLIQUE Platform
**Document :** Identité et gestion des accès

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour l'identité, l'authentification et la gestion des accès de KLIQUE Platform.

---

# Objectif
KLIQUE Platform doit identifier chaque utilisateur, sécuriser son accès et déterminer précisément ce qu'il peut consulter ou modifier.

Ce document définit :

- l'identité globale des utilisateurs
- les comptes et profils
- l'authentification
- les sessions
- l'appartenance aux Workspaces
- les invitations
- la sélection du Workspace actif
- l'évaluation des accès
- les comptes externes
- les comptes de service
- les principes de sécurité associés
Les rôles et permissions détaillés seront définis dans un document séparé.

---

# Principe fondamental
Une personne possède une seule identité globale dans KLIQUE Platform.

Cette identité peut appartenir à plusieurs Workspaces.

Les rôles, permissions, statuts et responsabilités de l'utilisateur sont définis séparément dans chaque Workspace.

```
Personne
    ↓
Identité globale
    ↓
Compte utilisateur
    ↓
Appartenances aux Workspaces
    ↓
Rôles et permissions par Workspace
```
Un utilisateur ne doit jamais posséder plusieurs comptes simplement parce qu'il collabore avec plusieurs organisations.

---

# Séparation des concepts
L'architecture distingue obligatoirement les concepts suivants :

- personne
- identité
- compte utilisateur
- profil utilisateur
- appartenance à un Workspace
- rôle
- permission
- session
- identité externe
- compte de service
Ces concepts ne doivent pas être fusionnés dans une seule entité.

---

# Personne
Une personne représente un individu réel.

Une personne peut exister dans le CRM sans posséder de compte utilisateur.

Exemples :

- un athlète enregistré comme contact
- un partenaire
- un journaliste
- un expert
- un prospect
- un membre d'un club
La création d'une personne dans le CRM ne doit jamais créer automatiquement un accès à la plateforme.

---

# Identité globale
L'identité globale représente l'utilisateur reconnu par KLIQUE Platform.

Elle est unique sur toute la plateforme.

Elle comprend notamment :

- un identifiant interne unique
- un nom d'affichage
- une adresse e-mail principale
- une langue
- un fuseau horaire
- un avatar
- des préférences personnelles
- un statut global
- les dates de création et de mise à jour
L'identité globale n'appartient pas à un Workspace particulier.

---

# Compte utilisateur
Le compte utilisateur permet à une identité de se connecter à KLIQUE Platform.

Il contient notamment :

- les méthodes d'authentification
- le statut du compte
- les informations de sécurité
- les dates de connexion
- les sessions actives
- les dispositifs de récupération
- les facteurs d'authentification supplémentaires
Un compte peut être :

- en attente de validation
- actif
- suspendu
- verrouillé
- désactivé
- supprimé
La suspension globale d'un compte bloque l'accès à tous les Workspaces.

---

# Profil utilisateur
Le profil utilisateur contient les préférences personnelles communes à toute la plateforme.

Il peut comprendre :

- le nom affiché
- la photo de profil
- la langue
- le fuseau horaire
- les formats de date
- les préférences d'accessibilité
- les préférences de notification
- les paramètres de confidentialité personnelle
Ces informations restent liées à l'utilisateur et non à un Workspace.

---

# Profil dans un Workspace
Un utilisateur peut posséder des informations spécifiques dans chaque Workspace.

Exemples :

- fonction
- titre
- équipe
- département
- numéro interne
- biographie professionnelle
- photo spécifique
- disponibilité
- responsable hiérarchique
Ces informations appartiennent à l'appartenance au Workspace.

Elles ne doivent pas modifier automatiquement le profil global de l'utilisateur.

---

# Appartenance à un Workspace
L'accès d'un utilisateur à un Workspace est représenté par une appartenance distincte.

Cette appartenance relie :

- un utilisateur
- un Workspace
- un statut
- un ou plusieurs rôles
- des permissions éventuelles
- une date d'entrée
- une date de sortie éventuelle
- l'utilisateur ayant créé ou validé l'accès

```
Utilisateur
    ↓
Workspace Membership
    ↓
Workspace
    ↓
Rôles et permissions
```
Un utilisateur ne peut accéder à un Workspace que s'il possède une appartenance active.

---

# Statuts d'appartenance
Une appartenance peut posséder les statuts suivants :

- invitée
- active
- suspendue
- expirée
- révoquée
- quittée
Le statut global du compte et le statut de l'appartenance sont indépendants.

Exemple :

Un utilisateur peut rester actif dans KLIQUE Platform tout en étant suspendu dans un Workspace précis.

---

# Plusieurs Workspaces
Un utilisateur peut appartenir à plusieurs Workspaces avec des responsabilités différentes.

Exemple :

```
Sébastien Mory

├── Workspace KLIQUE
│   └── Owner
├── Workspace Elfic Fribourg
│   └── Community Manager
└── Workspace Swiss Basketball
    └── Photographe
```
Les rôles et permissions ne doivent jamais être transférés automatiquement d'un Workspace à un autre.

---

# Workspace actif
Après la connexion, toute action est exécutée dans le contexte d'un Workspace actif.

Le Workspace actif détermine :

- les données accessibles
- les modules visibles
- les rôles applicables
- les permissions
- les paramètres
- le plan d'abonnement
- les fonctionnalités disponibles
- les notifications affichées
- le contexte utilisé par l'intelligence artificielle
L'utilisateur doit pouvoir changer de Workspace sans se reconnecter.

---

# Sélection du Workspace actif
Après l'authentification :

- si l'utilisateur appartient à un seul Workspace, celui-ci peut être sélectionné automatiquement
- s'il appartient à plusieurs Workspaces, la plateforme peut proposer un sélecteur
- le dernier Workspace utilisé peut être mémorisé
- un Workspace suspendu ou révoqué ne doit jamais être sélectionnable
- le changement de Workspace doit provoquer un rechargement complet du contexte
Aucune donnée de l'ancien Workspace ne doit rester visible après le changement.

---

# Authentification
L'authentification vérifie l'identité de l'utilisateur.

Elle est distincte de l'autorisation.

L'authentification répond à la question :

> Qui est l'utilisateur ?
L'autorisation répond à la question :

> Que peut-il faire dans ce Workspace ?
Les deux vérifications sont obligatoires.

---

# Méthodes d'authentification
KLIQUE Platform doit pouvoir supporter plusieurs méthodes d'authentification.

Exemples :

- adresse e-mail et mot de passe
- lien de connexion sécurisé
- fournisseur d'identité externe
- connexion Google
- connexion Microsoft
- authentification unique d'entreprise
- passkeys
- authentification multifacteur
L'ajout d'une méthode ne doit pas nécessiter une modification des domaines produits.

---

# Adresse e-mail
Une adresse e-mail vérifiée peut servir d'identifiant de connexion.

Les règles suivantes s'appliquent :

- l'adresse principale doit être unique
- elle doit être vérifiée
- son changement doit être sécurisé
- une ancienne adresse ne doit pas rester utilisable
- les modifications sensibles doivent être journalisées
- une adresse secondaire peut être utilisée pour la récupération
La casse de l'adresse ne doit pas créer plusieurs comptes distincts.

---

# Mot de passe
Lorsqu'un mot de passe est utilisé :

- il ne doit jamais être stocké en clair
- il doit être protégé par un mécanisme de hachage sécurisé
- les tentatives de connexion doivent être limitées
- les mots de passe compromis doivent pouvoir être refusés
- la récupération doit utiliser un jeton temporaire
- les changements doivent pouvoir révoquer les anciennes sessions
Les règles techniques détaillées seront documentées dans la documentation de sécurité.

---

# Authentification multifacteur
L'authentification multifacteur doit pouvoir être :

- facultative pour certains utilisateurs
- obligatoire pour certains rôles
- obligatoire pour les administrateurs
- imposée par un Workspace
- imposée par le niveau de risque
- requise pour une action sensible
Les méthodes peuvent inclure :

- application d'authentification
- passkey
- clé de sécurité
- code de récupération
- autre facteur sécurisé

---

# Sessions
Une session représente une connexion active à KLIQUE Platform.

Chaque session doit posséder notamment :

- un identifiant unique
- un utilisateur
- une date de création
- une date d'expiration
- une date de dernière activité
- un appareil
- une adresse réseau
- un statut
- un niveau d'authentification
Une session ne contient pas définitivement les permissions.

Les permissions doivent pouvoir être réévaluées pendant la session.

---

# Durée et expiration des sessions
Les sessions doivent pouvoir expirer selon :

- une durée maximale
- une période d'inactivité
- un changement de mot de passe
- une suspension du compte
- une révocation manuelle
- un événement de sécurité
- une politique spécifique au Workspace
Une session expirée ou révoquée ne doit plus permettre aucune action.

---

# Gestion des appareils
L'utilisateur doit pouvoir consulter les appareils ou sessions connectés.

Il doit pouvoir :

- identifier une session
- connaître sa dernière activité
- révoquer une session
- révoquer toutes les autres sessions
- signaler un accès suspect
Les administrateurs autorisés peuvent disposer de mécanismes supplémentaires pour sécuriser un Workspace.

---

# Invitations
Un utilisateur peut être invité dans un Workspace.

Une invitation contient notamment :

- le Workspace concerné
- l'adresse e-mail invitée
- les rôles proposés
- l'expéditeur
- la date de création
- la date d'expiration
- un jeton unique
- un statut
Une invitation peut être :

- en attente
- acceptée
- expirée
- annulée
- refusée

---

# Acceptation d'une invitation
Lorsqu'une invitation est acceptée :

- un utilisateur existant rejoint le Workspace
- ou un nouveau compte est créé
- une appartenance au Workspace est créée
- les rôles prévus sont attribués
- l'acceptation est journalisée
- le jeton d'invitation devient inutilisable
Une invitation ne doit donner accès qu'au Workspace explicitement concerné.

---

# Invitation d'un utilisateur existant
Si l'adresse invitée correspond déjà à un compte existant :

- aucun second compte ne doit être créé
- l'invitation doit être rattachée à l'identité existante
- l'utilisateur doit confirmer son acceptation
- une nouvelle appartenance au Workspace doit être créée
Les données personnelles des autres Workspaces ne doivent pas être révélées à l'expéditeur de l'invitation.

---

# Lien entre utilisateur et contact CRM
Un utilisateur de la plateforme peut être lié à une personne enregistrée dans KLIQUE CRM.

Ce lien doit rester explicite.

Exemple :

```
Contact CRM : Marie Dupont
    ↓
Invitation acceptée
    ↓
Utilisateur KLIQUE Platform
    ↓
Lien explicite avec le contact CRM
```
La liaison permet d'éviter la duplication de profils.

Elle ne doit pas fusionner l'identité globale avec les données métier du CRM.

---

# Comptes invités
Un compte invité possède un accès limité.

Il peut être utilisé pour :

- consulter un projet
- valider un contenu
- télécharger des médias
- participer à un canal précis
- commenter une ressource
- consulter un rapport
Un invité :

- appartient toujours à un Workspace
- possède des permissions explicites
- ne reçoit aucun accès par défaut
- peut avoir une date d'expiration
- ne doit pas voir les ressources non partagées

---

# Utilisateurs externes
Un utilisateur externe collabore avec une organisation sans en être un membre interne complet.

Exemples :

- athlète
- partenaire
- sponsor
- expert
- client
- média
- prestataire
Le statut externe ne doit pas être codé comme un type de compte séparé.

Il doit être représenté par :

- une appartenance
- un rôle
- des permissions
- des restrictions
- éventuellement une date d'expiration

---

# Comptes de service
Un compte de service représente un système ou une intégration, et non une personne.

Il peut être utilisé pour :

- une API
- une automatisation
- une synchronisation
- une intégration externe
- un processus technique
Un compte de service doit :

- appartenir à un Workspace
- posséder des permissions minimales
- être identifiable
- avoir un propriétaire humain responsable
- utiliser des secrets sécurisés
- être révocable
- être journalisé
Il ne doit jamais utiliser les identifiants personnels d'un utilisateur.

---

# Identités externes
Un utilisateur peut connecter une ou plusieurs identités externes.

Exemples :

- Google
- Microsoft
- Apple
- fournisseur SSO
- réseau social
- fournisseur partenaire
Une identité externe doit être reliée à un seul compte KLIQUE Platform.

La connexion d'un fournisseur externe ne doit pas créer un doublon lorsqu'un compte correspondant existe déjà.

---

# Authentification unique
Les Workspaces professionnels pourront utiliser une authentification unique.

Elle peut permettre :

- la connexion via un fournisseur d'identité
- l'application de politiques d'entreprise
- l'attribution contrôlée des accès
- la révocation centralisée
- la synchronisation future des utilisateurs
L'authentification unique ne doit pas contourner les permissions internes de KLIQUE Platform.

---

# Provisionnement automatique
À long terme, certains Workspaces pourront automatiser la création et la suppression des appartenances.

Le provisionnement peut gérer :

- l'ajout d'un utilisateur
- la mise à jour de son profil Workspace
- l'attribution de groupes
- la suspension
- la révocation
Le provisionnement ne doit jamais supprimer l'identité globale d'un utilisateur encore actif dans d'autres Workspaces.

---

# Évaluation d'un accès
Toute demande d'accès doit être évaluée selon plusieurs éléments.

```
Identité authentifiée
    ↓
Compte actif
    ↓
Session valide
    ↓
Appartenance active
    ↓
Workspace actif
    ↓
Module disponible
    ↓
Rôle et permissions
    ↓
Règles de la ressource
    ↓
Action autorisée ou refusée
```
L'absence d'une condition entraîne un refus.

---

# Refus par défaut
KLIQUE Platform applique le principe du refus par défaut.

Cela signifie que :

- aucune ressource n'est accessible sans autorisation
- aucune action n'est permise implicitement
- aucune appartenance ne donne tous les droits
- aucun rôle ne doit contourner les règles d'isolation
- toute exception doit être explicite et documentée

---

# Accès aux ressources
L'accès à une ressource peut dépendre :

- du Workspace propriétaire
- du rôle de l'utilisateur
- de ses permissions
- de son groupe
- de sa relation avec la ressource
- du propriétaire de la ressource
- du statut de la ressource
- de sa visibilité
- du module actif
- du plan d'abonnement
Toutes ces règles doivent être évaluées de manière cohérente.

---

# Accès inter-Workspace
Un utilisateur appartenant à plusieurs Workspaces ne bénéficie d'aucun accès automatique entre eux.

Les règles suivantes s'appliquent :

- les permissions sont séparées
- les données sont isolées
- les rôles sont indépendants
- les paramètres sont indépendants
- les abonnements sont indépendants
- le contexte IA est indépendant
Un partage entre Workspaces devra utiliser un mécanisme explicite, documenté et contrôlé.

---

# Administration de la plateforme
KLIQUE Platform peut nécessiter des administrateurs internes chargés de l'exploitation du SaaS.

Ces accès doivent être séparés des rôles des Workspaces.

Un administrateur de plateforme ne doit pas disposer automatiquement d'un accès permanent aux données métier des clients.

Tout accès exceptionnel doit être :

- justifié
- limité
- temporaire
- journalisé
- soumis à une autorisation appropriée
- visible dans les journaux d'audit

---

# Usurpation contrôlée
Une fonctionnalité d'assistance permettant de visualiser l'expérience d'un utilisateur peut être nécessaire.

Elle doit obligatoirement :

- être réservée à des administrateurs autorisés
- afficher clairement qu'une usurpation est active
- interdire certaines actions sensibles
- être limitée dans le temps
- enregistrer toutes les actions
- conserver l'identité réelle de l'administrateur
- permettre une sortie immédiate
L'usurpation ne doit jamais masquer l'auteur réel d'une action.

---

# Suppression d'un utilisateur
La suppression d'un utilisateur doit distinguer :

- la révocation d'un Workspace
- la désactivation globale
- l'anonymisation
- la suppression légale
- la conservation des traces d'audit
La suppression d'un compte ne doit pas supprimer automatiquement les données professionnelles créées pour un Workspace.

Ces données appartiennent au Workspace.

---

# Départ d'un Workspace
Lorsqu'un utilisateur quitte un Workspace :

- son appartenance est désactivée ou révoquée
- ses sessions doivent perdre l'accès à ce Workspace
- ses rôles et permissions ne sont plus applicables
- ses données professionnelles restent dans le Workspace
- ses responsabilités peuvent être transférées
- l'événement est journalisé
Son accès aux autres Workspaces reste inchangé.

---

# Transfert de propriété
Un Workspace doit toujours posséder au moins un Owner actif.

Avant le départ ou la suppression du dernier Owner :

- un nouvel Owner doit être désigné
- la propriété doit être transférée
- l'action doit être confirmée
- l'opération doit être journalisée
La plateforme ne doit pas permettre qu'un Workspace actif reste sans propriétaire.

---

# Sécurité des actions sensibles
Certaines actions peuvent nécessiter une authentification renforcée.

Exemples :

- changement d'adresse e-mail
- changement de mot de passe
- désactivation de l'authentification multifacteur
- transfert de propriété
- suppression d'un Workspace
- modification de la facturation
- export massif
- création d'une clé API
- modification des rôles administratifs
Une session valide ne suffit pas toujours pour autoriser une action sensible.

---

# Journalisation
Les événements liés à l'identité et aux accès doivent être journalisés.

Exemples :

- connexion réussie
- connexion refusée
- déconnexion
- récupération de compte
- changement de mot de passe
- ajout d'un facteur d'authentification
- révocation d'une session
- invitation
- acceptation d'une invitation
- changement de rôle
- suspension
- transfert de propriété
- accès administratif exceptionnel
Les journaux sensibles doivent être protégés contre la modification.

---

# Notifications de sécurité
L'utilisateur doit être informé des événements importants.

Exemples :

- nouvelle connexion
- nouvel appareil
- changement de mot de passe
- changement d'adresse e-mail
- ajout ou suppression d'une méthode d'authentification
- invitation acceptée
- session révoquée
- activité suspecte
Les notifications ne doivent jamais exposer de secret ou de jeton sensible.

---

# Protection contre les abus
Le système d'identité doit prévoir notamment :

- la limitation des tentatives
- la détection des connexions suspectes
- le verrouillage temporaire
- la révocation des jetons
- la protection contre le vol de session
- la vérification des invitations
- la surveillance des actions sensibles
- la prévention de l'énumération des comptes
Les détails techniques seront documentés dans le document de sécurité.

---

# Disponibilité des modules
L'identité d'un utilisateur ne garantit pas l'accès à tous les modules.

L'accès dépend également :

- du Workspace
- de l'appartenance
- des rôles
- des permissions
- du plan d'abonnement
- des modules activés
- des Feature Flags
- des restrictions éventuelles
Le contrôle de l'abonnement ne remplace jamais le contrôle des permissions.

---

# Interfaces et API
Les interfaces web, mobiles et les API doivent utiliser les mêmes règles d'identité et d'autorisation.

Une API ne doit jamais disposer d'un chemin d'accès moins sécurisé que l'interface principale.

Chaque requête authentifiée doit permettre d'identifier :

- l'utilisateur ou le compte de service
- la session ou le jeton
- le Workspace actif
- les permissions applicables
- l'action demandée
- la ressource concernée

---

# Principes de confidentialité
Les informations d'identité doivent être limitées à ce qui est nécessaire.

Un Workspace ne doit pas pouvoir consulter :

- la liste des autres Workspaces d'un utilisateur
- les rôles détenus ailleurs
- les activités réalisées ailleurs
- les données personnelles non nécessaires
- les méthodes d'authentification détaillées
- les informations de sécurité du compte
L'appartenance d'un utilisateur à plusieurs Workspaces reste privée.

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- une personne peut exister sans compte utilisateur
- un utilisateur possède une seule identité globale
- un utilisateur peut appartenir à plusieurs Workspaces
- chaque appartenance possède ses propres rôles et permissions
- l'authentification est séparée de l'autorisation
- toute action utilise un Workspace actif
- les accès sont refusés par défaut
- les permissions sont réévaluables
- les sessions peuvent être révoquées
- les comptes de service sont séparés des comptes humains
- les accès administratifs exceptionnels sont journalisés
- aucune donnée d'identité ne doit être dupliquée inutilement
- aucune permission ne doit être codée en dur pour une organisation

---

# Principe fondamental
L'identité est globale.

L'accès est local au Workspace.

Une connexion réussie prouve l'identité de l'utilisateur, mais ne lui donne aucun droit automatique.

Chaque action doit être autorisée selon le Workspace actif, l'appartenance, les rôles, les permissions et la ressource concernée.

---

# Documents liés

- 00_VISION.md
- 01_ARCHITECTURE_OVERVIEW.md
- 03_PLATFORM_MODULES.md
- 04_SHARED_SERVICES.md
- 06_ROLES_AND_PERMISSIONS.md
- 07_MULTI_TENANCY.md
- 08_WORKSPACES.md
- 09_DATA_ARCHITECTURE.md
- 16_SECURITY_AND_COMPLIANCE.md
- 17_BILLING_AND_PLANS.md

---

# Prochaine étape
Le prochain document à créer est :

`/docs/06_ROLES_AND_PERMISSIONS.md`

Il devra définir les rôles, les permissions, les politiques d'accès et les règles d'autorisation appliquées dans chaque Workspace.

Ne modifie aucun autre fichier du projet.
