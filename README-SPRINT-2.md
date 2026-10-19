# KLIQUE OS — Sprint 2

Ce sprint ajoute une API interne Next.js et une connexion en lecture à Google Sheets.

## Installation

Dans le terminal du projet :

```powershell
npm.cmd install googleapis
```

## Fonctionnement

Sans configuration Google, l’application continue de fonctionner en mode démo.

Quand les variables de `.env.local` sont renseignées, l’API lit automatiquement :

```text
02_Athlètes!A3:Q200
```

## Variables

Copier `.env.local.example` vers `.env.local`, puis compléter :

- GOOGLE_SHEET_ID
- GOOGLE_SERVICE_ACCOUNT_EMAIL
- GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

## Limite d isolation editoriale

Le moteur editorial utilise actuellement un unique `GOOGLE_SHEET_ID` global. Les lignes de cette feuille ne portent pas de cle de workspace permettant une isolation fiable. En consequence, les connecteurs editoriaux Athlete et Productions refusent Google Sheets lorsque le workspace authentifie est different de `KLIQUE_DEFAULT_WORKSPACE_ID`.

Le `workspaceId` envoye par le navigateur n est jamais utilise pour autoriser cette lecture. Une erreur Google Sheets rend le connecteur editorial indisponible et ne declenche aucun jeu de donnees de demonstration.
