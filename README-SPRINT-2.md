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

- GOOGLE_SHEETS_SPREADSHEET_ID
- GOOGLE_SERVICE_ACCOUNT_EMAIL
- GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
