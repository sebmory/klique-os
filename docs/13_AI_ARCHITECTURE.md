# KLIQUE Platform
**Document :** Architecture de l'intelligence artificielle

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour toute l'architecture de KLIQUE AI Studio.

---

# Objectif
L'intelligence artificielle est un service transversal de KLIQUE Platform.

Elle ne constitue pas uniquement un assistant conversationnel.

Elle est capable :

- d'assister les utilisateurs
- de générer du contenu
- d'analyser des données
- d'automatiser des tâches
- d'interagir avec tous les domaines produits
- d'alimenter des workflows intelligents
Ce document définit l'architecture globale de KLIQUE AI Studio.

---

# Principe fondamental
L'IA ne possède jamais ses propres données métier.

Elle utilise les données autorisées du Workspace actif.

```
Workspace actif
        │
        ▼
Contexte autorisé
        │
        ▼
KLIQUE AI Studio
        │
        ▼
Résultat
```
L'IA n'est jamais la source de vérité.

Elle produit uniquement des propositions ou des résultats.

---

# Position dans la plateforme
KLIQUE AI Studio est un domaine produit.

Il peut utiliser :

- CRM
- Media
- Hub
- Analytics
- Shared Core
mais il ne devient jamais propriétaire des données provenant de ces domaines.

---

# Architecture générale

```
Utilisateur
        │
        ▼
AI Studio
        │
        ▼
Contexte
        │
        ▼
Moteur IA
        │
        ▼
Résultat
        │
        ▼
Validation éventuelle
```
Chaque étape reste indépendante.

---

# Les composants principaux
AI Studio est composé de plusieurs modules.

- Assistant
- Agents
- Générateur de contenus
- Générateur visuel
- Prompt Templates
- Context Engine
- Memory
- Workflows IA
- AI History
- Model Router
Chaque composant possède une responsabilité unique.

---

# Assistant
L'assistant est l'interface conversationnelle principale.

Il permet :

- répondre aux questions
- utiliser les données du Workspace
- créer des contenus
- rechercher des informations
- exécuter des actions autorisées
- guider l'utilisateur
L'assistant respecte toujours les permissions.

---

# Agents
Les agents sont des assistants spécialisés.

Exemples :

- Communication
- CRM
- Sponsoring
- Média
- Journaliste
- Analytics
- Photographe
- Community Manager
- Coach IA
Chaque agent possède :

- une mission
- un prompt système
- des outils
- un contexte
- des permissions
- des limites

---

# Générateur de contenus
Permet de créer notamment :

- publications
- articles
- newsletters
- biographies
- communiqués
- e-mails
- interviews
- scripts vidéo
- descriptions
- textes marketing
Les contenus générés peuvent être enregistrés dans Media ou CRM selon leur nature.

---

# Générateur visuel
Permet :

- créer des images
- transformer des images
- adapter un format
- supprimer un fond
- améliorer une image
- générer des variantes
Les médias validés deviennent des Assets de KLIQUE Media.

---

# Prompt Templates
Les modèles de prompts sont réutilisables.

Ils peuvent définir :

- une mission
- un objectif
- un ton
- une structure
- des variables
- un contexte attendu
- un modèle préféré
Les templates peuvent être :

- système
- Workspace
- utilisateur

---

# Context Engine
Le Context Engine construit automatiquement le contexte envoyé au modèle IA.

Il peut utiliser :

- CRM
- Media
- Hub
- Analytics
- paramètres
- historique IA
- préférences utilisateur
Le Context Engine sélectionne uniquement les données autorisées.

---

# Memory
Le Memory conserve les informations utiles aux interactions IA.

Il peut mémoriser :

- préférences utilisateur
- contexte de conversation
- historique récent
- variables de travail
- paramètres du Workspace
Le Memory ne remplace jamais les données métier.

---

# AI History
Toutes les interactions importantes sont historisées.

Exemples :

- prompts
- réponses
- coûts
- durée
- modèle utilisé
- outils utilisés
- utilisateur
- Workspace
L'historique facilite la traçabilité.

---

# Model Router
Le Model Router choisit automatiquement le modèle IA le plus adapté.

Exemple :

```
Demande utilisateur
        │
        ▼
Model Router
        │
 ┌──────┼────────────┐
 ▼      ▼            ▼
GPT   Claude     Gemini
```
Le choix peut dépendre :

- du coût
- de la rapidité
- des capacités
- du type de contenu
- du plan
Les domaines produits ignorent le modèle réellement utilisé.

---

# Fournisseurs IA
Les fournisseurs sont considérés comme des intégrations.

Ils doivent pouvoir être remplacés sans modifier AI Studio.

Exemples :

- OpenAI
- Anthropic
- Google AI
- Mistral
- futurs fournisseurs

---

# Mode connecté
Le mode connecté utilise les données du Workspace.

Exemple :

Créer une publication concernant un athlète existant.

L'IA peut consulter :

- CRM
- médias
- historique
- statistiques
- partenaires
Le tout selon les permissions.

---

# Mode libre
Le mode libre ne dépend pas du Workspace.

Exemple :

Créer une publication concernant un sportif qui n'existe pas encore dans le CRM.

Le mode libre permet une utilisation générale de l'IA.

---

# Outils IA
Les modèles peuvent utiliser des outils.

Exemples :

- recherche CRM
- recherche Media
- création de tâche
- création d'événement
- recherche Hub
- génération Analytics
- recherche Internet
- traduction
Les outils restent contrôlés par les permissions.

---

# Tool Calling
Le moteur IA peut appeler plusieurs outils.

Exemple :

```
Question utilisateur
        ↓
Recherche CRM
        ↓
Recherche Media
        ↓
Création réponse
```
Les outils sont exécutés uniquement lorsque cela est autorisé.

---

# Contextes
Le contexte envoyé au modèle peut comprendre :

- données CRM
- médias
- projets
- conversations
- paramètres
- préférences
- historique récent
- templates
Le contexte doit rester minimal afin d'optimiser :

- le coût
- les performances
- la confidentialité

---

# Confidentialité
L'IA ne peut accéder qu'aux données autorisées.

Elle ne doit jamais :

- consulter un autre Workspace
- contourner les permissions
- utiliser des données supprimées
- révéler des informations privées
Le Context Engine applique systématiquement les règles de sécurité.

---

# Générations
Une génération possède notamment :

- un auteur
- un Workspace
- un modèle
- un prompt
- un résultat
- un statut
- une durée
- un coût
- des métadonnées
Les générations peuvent être historisées.

---

# Validation
Certaines générations nécessitent une validation humaine.

Exemples :

- publication
- communiqué
- image officielle
- contrat
- annonce publique
L'IA ne publie jamais automatiquement sans autorisation explicite.

---

# Workflows IA
Les workflows permettent d'enchaîner plusieurs étapes.

Exemple :

```
Nouvel athlète
        ↓
Créer biographie
        ↓
Créer publication
        ↓
Créer interview
        ↓
Créer visuel
```
Chaque étape peut utiliser un modèle différent.

---

# Automatisations IA
Les événements de la plateforme peuvent déclencher l'IA.

Exemples :

- nouvel athlète
- nouveau partenaire
- nouveau média
- nouveau projet
- nouvelle publication
Ces automatisations restent configurables.

---

# Coût
Chaque génération possède un coût.

Le système doit pouvoir mesurer :

- coût par utilisateur
- coût par Workspace
- coût par modèle
- coût par agent
- coût par workflow
Ces données alimentent Analytics.

---

# Quotas
Chaque abonnement peut définir :

- nombre de générations
- modèles disponibles
- taille du contexte
- nombre d'agents
- nombre de workflows
- stockage de l'historique
Les quotas sont contrôlés par le Shared Core.

---

# Performances
Les générations longues doivent être exécutées de manière asynchrone.

Exemples :

- génération d'image
- rapport complet
- traduction massive
- analyse documentaire
Les files d'attente sont utilisées lorsque nécessaire.

---

# Gestion des erreurs
Une erreur IA doit permettre :

- nouvelle tentative
- changement de modèle
- notification
- journalisation
- reprise
Les erreurs ne doivent pas interrompre les autres domaines.

---

# Historique des conversations
Les conversations IA restent liées au Workspace.

Elles peuvent être :

- archivées
- supprimées
- exportées
- recherchées
- partagées selon les permissions

---

# Personnalisation
Chaque Workspace peut personnaliser :

- ses templates
- ses agents
- son ton rédactionnel
- ses règles
- ses prompts
- ses workflows
- ses modèles préférés
Les personnalisations restent locales au Workspace.

---

# Multi-tenant
Toutes les données IA sont isolées par Workspace.

Exemples :

- prompts
- conversations
- historique
- modèles favoris
- templates
- agents
Aucun partage implicite n'est autorisé.

---

# Analytics
AI Studio alimente Analytics.

Exemples :

- nombre de générations
- coût
- durée
- taux de validation
- modèles utilisés
- productivité
- économie de temps

---

# Sécurité
Toutes les interactions IA respectent :

- Workspace
- permissions
- quotas
- plan
- confidentialité
- journalisation
L'IA ne constitue jamais un moyen de contourner les règles métier.

---

# Évolutivité
L'architecture doit permettre d'ajouter facilement :

- de nouveaux modèles
- de nouveaux agents
- de nouveaux outils
- de nouveaux workflows
- de nouveaux fournisseurs
- de nouvelles capacités
Sans modifier les domaines produits.

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- l'IA n'est jamais la source de vérité
- le contexte respecte toujours le Workspace
- les permissions sont toujours appliquées
- les fournisseurs sont interchangeables
- les modèles sont indépendants des domaines
- les outils sont contrôlés
- les coûts sont mesurés
- les workflows restent configurables
- les générations importantes sont historisées
- les validations humaines restent possibles

---

# Principe fondamental
KLIQUE AI Studio est un moteur d'intelligence réparti dans toute la plateforme.

Il utilise les données existantes sans jamais en devenir propriétaire.

Son rôle est d'assister les utilisateurs, d'automatiser les tâches et d'améliorer la productivité tout en respectant les principes fondamentaux de KLIQUE Platform.

---

# Documents liés

- 03_PLATFORM_MODULES.md
- 04_SHARED_SERVICES.md
- 09_DATA_ARCHITECTURE.md
- 10_ENTITY_MODEL.md
- 11_INTEGRATIONS_ARCHITECTURE.md
- 12_EVENTS_AND_AUTOMATIONS.md
- 14_MEDIA_ARCHITECTURE.md
- 15_ANALYTICS_ARCHITECTURE.md

---

# Prochaine étape
Le prochain document à créer est :

`/docs/14_MEDIA_ARCHITECTURE.md`

Il devra définir l'architecture complète de KLIQUE Media, la gestion des Assets, des collections, des métadonnées, des versions, des droits, des publications et du stockage des médias.

Ne modifie aucun autre fichier du projet.
