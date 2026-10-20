# Mises en relation partenaire-athlète — checklist Lot 2B

## Activation contrôlée

- Appliquer d’abord la migration prévue, dans l’environnement explicitement autorisé.
- Définir `KLIQUE_PARTNER_ATHLETE_INTRODUCTIONS_ENABLED=true` uniquement après validation du schéma.
- Configurer un secret serveur dédié dans `KLIQUE_PARTNER_INTRODUCTION_OUTBOX_SECRET`.
- Programmer ensuite un appel `POST /api/internal/partner-introduction-outbox` avec `Authorization: Bearer <secret>`.
- Ne jamais exposer ce secret au navigateur. Aucun cron n’est activé par le code du Lot 2B.

Sans valeur exactement égale à `true`, les routes existantes partenaire conservent le workflow historique et les nouvelles routes athlète ne consultent aucune table ou colonne du nouveau workflow.

## Vérification manuelle partenaire

1. Ouvrir une fiche athlète publique et envoyer une demande avec un motif et un message.
2. Vérifier le libellé « Demande envoyée à l’athlète ».
3. Vérifier l’historique, le nom public, le motif, la date et le statut « En attente de l’athlète ».
4. Vérifier que le détail ne montre aucun contact avant acceptation.
5. Après acceptation, vérifier que seul le partenaire propriétaire voit l’Instagram dans le détail.
6. Après suspension, recharger le détail et vérifier que le contact n’est plus présent.

## Vérification manuelle athlète

1. Vérifier le bloc des demandes sur `/athlete`.
2. Ouvrir une demande et vérifier le nom public du partenaire, le motif, le message et la date.
3. Préparer Instagram, vérifier la valeur affichée, puis confirmer explicitement son partage.
4. Modifier Instagram après préparation et vérifier que l’ancienne référence est refusée.
5. Vérifier qu’un Instagram absent empêche seulement l’acceptation et permet toujours le refus.
6. Accepter ou refuser, puis vérifier qu’un double clic ne produit pas un deuxième événement.

## Notifications et compatibilité

- Vérifier qu’une création notifie uniquement l’athlète ciblé, sans coordonnée.
- Vérifier qu’une réponse notifie uniquement le partenaire propriétaire, sans coordonnée.
- Interrompre puis relancer le processeur outbox et vérifier la reprise sans notification dupliquée.
- Vérifier qu’une ancienne demande `pending` n’apparaît pas chez l’athlète et n’émet aucune nouvelle notification.
- Vérifier que l’Admin ne peut pas accepter une demande du nouveau workflow via la route CRM historique.

Ces vérifications applicatives complètes restent impossibles avant autorisation de migration et d’activation dans un environnement applicatif isolé.
