# Synchronisation des réponses Partenaire

Ce Google Apps Script transmet uniquement le numéro de la ligne ajoutée dans
`Forms_Partenaires_Responses`. L’API relit elle-même la réponse dans Google Sheets.

## Installation manuelle

1. Ouvrir le Google Sheet KLIQUE, puis **Extensions > Apps Script**.
2. Remplacer le contenu de `Code.gs` par celui du fichier `Code.gs` de ce dossier.
3. Reporter les autorisations de `appsscript.json` dans le manifeste du projet Apps Script.
4. Dans **Paramètres du projet > Propriétés du script**, ajouter :
   - `PARTNER_APPLICATION_SYNC_URL` : URL complète HTTPS terminant par `/api/internal/partner-application-sync` ;
   - `PARTNER_APPLICATION_SYNC_HMAC_SECRET` : même secret d’au moins 32 caractères que la variable serveur homonyme.
5. Dans **Déclencheurs**, choisir **Ajouter un déclencheur** puis configurer :
   - fonction : `onFormSubmit` ;
   - source de l’événement : **Depuis une feuille de calcul** ;
   - type d’événement : **Lors de l’envoi du formulaire**.
6. Autoriser le projet avec le compte propriétaire du classeur.

Ne pas exécuter `onFormSubmit` manuellement : la fonction attend l’événement fourni par le déclencheur installable. En cas de réponse HTTP hors plage `2xx`, elle lève une erreur afin que les notifications d’échec Apps Script puissent être activées dans les paramètres du déclencheur.

Le script ne journalise que le numéro de ligne et le statut HTTP. Il ne journalise ni le corps de la réponse, ni l’URL, ni le secret, ni les données du partenaire.