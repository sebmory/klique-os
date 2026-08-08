# KLIQUE Platform
**Document :** Architecture de KLIQUE Media

**Version :** 1.0

**Statut :** Validé

**Dernière mise à jour :** Août 2026

**Responsable :** Sébastien Mory

**Source de vérité :** Ce document fait foi pour toute l'architecture de KLIQUE Media.

---

# Objectif
KLIQUE Media est le domaine responsable de tous les contenus numériques de la plateforme.

Il centralise :

- les photos
- les vidéos
- les documents
- les fichiers audio
- les illustrations
- les contenus générés par IA
- les publications
Il garantit une gestion cohérente, sécurisée et évolutive des médias.

---

# Principe fondamental
KLIQUE Media est propriétaire des fichiers numériques.

Les autres domaines utilisent uniquement des références vers les Assets.

```
CRM
Hub
AI Studio
Analytics
       │
       ▼
KLIQUE Media
       │
       ▼
Assets
```
Un média ne doit jamais être dupliqué dans plusieurs domaines.

---

# Les composants principaux
KLIQUE Media est composé des modules suivants :

- Assets
- Collections
- Albums
- Dossiers
- Métadonnées
- Versions
- Droits
- Publications
- Stockage
- Recherche
Chaque module possède une responsabilité unique.

---

# Asset
L'Asset représente un fichier numérique.

Il constitue l'entité centrale de KLIQUE Media.

Un Asset peut être :

- photo
- vidéo
- document
- audio
- illustration
- archive
- contenu IA
Toutes les autres fonctionnalités gravitent autour de cette entité.

---

# Métadonnées d'un Asset
Chaque Asset peut contenir notamment :

- identifiant
- Workspace
- nom
- type
- format
- taille
- dimensions
- durée
- auteur
- propriétaire
- date de création
- date d'importation
- statut
- licence
- tags
- personnes liées
- organisations liées
- projet lié
Les métadonnées constituent la source de recherche principale.

---

# Collections
Une Collection regroupe plusieurs Assets.

Une Collection ne déplace jamais physiquement les fichiers.

Exemples :

- Shooting
- Match
- Saison
- Campagne
- Portraits
- Presse
Un Asset peut appartenir à plusieurs Collections.

---

# Albums
Les Albums permettent d'organiser les médias de manière visuelle.

Ils sont principalement destinés à :

- la navigation
- la présentation
- la sélection
- le partage
Les Albums utilisent des références vers les Assets.

---

# Dossiers
Les Dossiers permettent une organisation logique.

Ils facilitent :

- l'import
- le classement
- les droits
- la navigation
Les dossiers ne constituent pas une dépendance obligatoire.

Les Collections restent le mécanisme principal d'organisation fonctionnelle.

---

# Versions
Chaque Asset peut posséder plusieurs versions.

Exemples :

- original
- recadré
- retouché
- compressé
- export web
- export impression
Les versions restent liées au même Asset.

---

# Miniatures
Les miniatures sont générées automatiquement.

Exemples :

- aperçu photo
- aperçu vidéo
- aperçu PDF
Les miniatures sont des données dérivées.

L'original reste la source officielle.

---

# Métadonnées enrichies
Certaines informations peuvent être générées automatiquement.

Exemples :

- couleurs dominantes
- reconnaissance faciale
- objets détectés
- texte OCR
- transcription
- mots-clés IA
- description automatique
Ces informations restent modifiables selon les permissions.

---

# Recherche
La recherche repose principalement sur les métadonnées.

Elle peut utiliser :

- nom
- tags
- personnes
- organisations
- projets
- couleurs
- texte OCR
- IA
- date
- auteur
- format
La recherche respecte toujours le Workspace actif.

---

# Relations
Un Asset peut être lié à plusieurs entités.

Exemple :

```
Asset
   │
   ├── Athlete
   ├── Contact
   ├── Project
   ├── Event
   ├── Publication
   └── Organization
```
Les relations utilisent uniquement des références.

---

# Importation
Le module d'import est responsable de :

- upload
- validation
- contrôle des formats
- génération des miniatures
- extraction des métadonnées
- antivirus
- optimisation
L'import ne dépend pas du type de fichier.

---

# Formats
La plateforme doit pouvoir accepter différents formats.

Exemples :

Photos :

- JPG
- PNG
- HEIC
- RAW
Vidéos :

- MP4
- MOV
Documents :

- PDF
- DOCX
Audio :

- MP3
- WAV
De nouveaux formats pourront être ajoutés sans modifier l'architecture.

---

# Stockage
Le stockage est indépendant du domaine métier.

KLIQUE Media manipule des Assets.

Le stockage réel peut être :

- local
- cloud
- distribué
- hybride
Le changement de fournisseur ne doit pas modifier les autres modules.

---

# Droits
Chaque Asset possède des informations de droits.

Exemples :

- auteur
- licence
- restrictions
- date d'expiration
- crédits
- autorisations
Les droits sont indépendants des permissions utilisateurs.

---

# Permissions
Les permissions contrôlent les actions.

Exemples :

- consulter
- importer
- télécharger
- modifier
- partager
- supprimer
- publier
Les droits d'auteur définissent ce qui est légalement autorisé.

Les permissions définissent ce qui est techniquement autorisé.

---

# Partage
Un Asset peut être partagé :

- avec un utilisateur
- avec un groupe
- avec une équipe
- avec un Workspace
- via un lien sécurisé
Le partage ne modifie jamais le propriétaire de l'Asset.

---

# Publications
Une Publication représente un contenu destiné à être diffusé.

Elle peut contenir :

- texte
- médias
- versions
- plateformes
- statut
- date de diffusion
Les médias restent stockés comme Assets.

---

# Validation
Les publications peuvent suivre un workflow.

Exemple :

```
Brouillon
      ↓
Validation
      ↓
Approuvé
      ↓
Publié
```
Les workflows restent configurables.

---

# Intelligence artificielle
AI Studio peut utiliser KLIQUE Media.

Exemples :

- création d'image
- amélioration
- suppression de fond
- reconnaissance
- description automatique
- classement
Les contenus générés deviennent des Assets lorsqu'ils sont conservés.

---

# CRM
Le CRM ne possède pas les médias.

Il référence les Assets.

Exemple :

```
Athlete
      ↓
Asset
```
Le changement d'un Asset ne nécessite pas de modifier le CRM.

---

# Hub
Le Hub peut partager des Assets.

Les messages contiennent des références vers les médias.

Les fichiers restent dans KLIQUE Media.

---

# Analytics
Analytics peut mesurer notamment :

- nombre d'Assets
- téléchargements
- vues
- stockage
- utilisation
- performances des publications
Analytics ne devient jamais propriétaire des médias.

---

# Archivage
Les Assets peuvent être archivés.

L'archivage :

- conserve les références
- conserve les métadonnées
- conserve l'historique
- peut déplacer le stockage
Les Assets archivés restent accessibles selon les permissions.

---

# Suppression
Plusieurs stratégies sont possibles :

- suppression logique
- suppression définitive
- suppression différée
- restauration
Le comportement dépend des règles de conservation.

---

# Historique
Les modifications importantes sont historisées.

Exemples :

- changement de nom
- modification des droits
- changement de statut
- ajout de tags
- partage
- téléchargement
- suppression

---

# Multi-tenant
Tous les Assets appartiennent à un Workspace.

Même si deux Workspaces utilisent le même fichier, ils possèdent chacun leur propre Asset.

Aucun partage implicite n'existe.

---

# Performances
Le système doit permettre :

- plusieurs millions d'Assets
- import massif
- recherche rapide
- affichage instantané des miniatures
- téléchargements parallèles

---

# Évolutivité
L'architecture doit permettre :

- nouveaux formats
- nouveaux stockages
- nouveaux traitements IA
- nouvelles métadonnées
- nouvelles licences
- nouvelles plateformes de publication
Sans modifier les domaines produits.

---

# Exemples de flux

## Import

```
Upload
      ↓
Validation
      ↓
Extraction métadonnées
      ↓
Miniatures
      ↓
Asset créé
```

---

## Publication

```
Publication
      ↓
Sélection des Assets
      ↓
Validation
      ↓
Diffusion
```

---

## IA

```
Image
      ↓
AI Studio
      ↓
Nouvelle version
      ↓
Asset
```

---

# Sécurité
Tous les médias respectent :

- Workspace
- permissions
- licences
- droits
- journalisation
- quotas
Les liens de téléchargement doivent être sécurisés.

---

# Règles fondamentales
Toutes les évolutions devront respecter les règles suivantes :

- KLIQUE Media est propriétaire des Assets
- les autres domaines utilisent des références
- un Asset possède un Workspace
- les métadonnées sont centralisées
- les versions restent liées à l'Asset
- les miniatures sont dérivées
- les publications utilisent les Assets
- les permissions sont distinctes des licences
- les traitements IA créent de nouveaux Assets lorsqu'ils sont conservés
- les stockages restent interchangeables

---

# Principe fondamental
KLIQUE Media constitue la bibliothèque numérique centrale de KLIQUE Platform.

Tous les contenus visuels et documentaires y sont gérés de manière unique.

Les autres domaines manipulent des références, jamais les fichiers eux-mêmes.

---

# Documents liés

- 03_PLATFORM_MODULES.md
- 04_SHARED_SERVICES.md
- 09_DATA_ARCHITECTURE.md
- 10_ENTITY_MODEL.md
- 11_INTEGRATIONS_ARCHITECTURE.md
- 12_EVENTS_AND_AUTOMATIONS.md
- 13_AI_ARCHITECTURE.md
- 15_ANALYTICS_ARCHITECTURE.md

---

# Prochaine étape
Le prochain document à créer est :

`/docs/15_ANALYTICS_ARCHITECTURE.md`

Il devra définir l'architecture complète de KLIQUE Analytics, les KPI, les tableaux de bord, les métriques, les rapports, les objectifs, les indicateurs IA et la gouvernance des données analytiques.

Ne modifie aucun autre fichier du projet.
