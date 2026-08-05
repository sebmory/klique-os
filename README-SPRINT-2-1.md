# KLIQUE OS — Sprint 2.1

Cette version lit Google Sheets avec le fichier JSON déjà placé dans `credentials`.

## Variables attendues dans `.env.local`

```env
GOOGLE_APPLICATION_CREDENTIALS=./credentials/klique-os-65cde67258c4.json
GOOGLE_SHEET_ID=VOTRE_ID_GOOGLE_SHEET
```

## Après copie

1. Arrêter le serveur avec `Ctrl + C` dans le terminal `node`.
2. Relancer avec :

```powershell
npm.cmd run dev
```

3. Ouvrir `http://localhost:3000`.
