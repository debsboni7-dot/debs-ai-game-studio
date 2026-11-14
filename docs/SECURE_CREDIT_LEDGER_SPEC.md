# DEBS AI Studio — Spécification du portefeuille sécurisé

Statut : spécification technique, pas une implémentation de portefeuille en production.

Cette spécification complète `docs/PRICING_BILLING_ARCHITECTURE.md` et `docs/CREDIT_DOMAIN.md`. Elle respecte `AGENTS.md` : le schéma, les migrations et les fonctions de base de données gérées par Lovable ne doivent pas être modifiés manuellement dans ce dépôt. Les contrats ci-dessous sont destinés à guider une future implémentation par le gestionnaire de base de données autorisé.

## 1. Invariants comptables

1. Les soldes sont détenus et calculés côté serveur uniquement. Le navigateur ne transmet jamais un nouveau solde ni un montant de débit faisant autorité.
2. Deux compartiments sont séparés : crédits d'abonnement et crédits achetés.
3. La dépense consomme d'abord le compartiment abonnement, puis le compartiment acheté.
4. Les crédits d'abonnement acquis sont reportés intégralement. Une rétrogradation ne réduit aucun solde acquis.
5. Les crédits achetés n'expirent jamais et ne sont jamais supprimés par une annulation d'abonnement.
6. Chaque variation de solde correspond à une écriture immuable du ledger.
7. Toute commande financière est idempotente. Rejouer la même clé et le même contenu retourne le résultat initial ; réutiliser une clé avec un contenu différent est rejeté.
8. Toute réservation, confirmation, libération ou attribution est atomique et sérialisée par portefeuille.
9. Aucun crédit n'est attribué sur la seule base d'une redirection de navigateur. Un événement de paiement signé et vérifié est requis.
10. Les montants sont des entiers positifs en crédits DEBS. Les nombres flottants sont interdits.

## 2. Modèle de données logique

Les noms sont indicatifs et doivent être adaptés au schéma existant avant toute migration.

- `credit_wallets`: un portefeuille par utilisateur, soldes disponibles abonnement/achat et montants réservés par compartiment. Les colonnes de solde sont des caches transactionnels, pas la source comptable unique.
- `credit_lots`: lots traçables avec origine (`subscription_grant` ou `topup`), compartiment, montant initial, montant restant, date d'attribution, expiration éventuelle et référence métier. Les lots achetés ont toujours `expires_at = NULL`.
- `credit_ledger`: journal append-only des attributions, réservations, règlements, libérations et ajustements compensatoires. Chaque ligne conserve utilisateur, compartiment, delta, solde après opération, type, clé idempotente, référence et horodatage.
- `credit_reservations`: une réservation par mission et opération, avec montant réservé par compartiment, statut, clé idempotente, échéance, montant final et dates.
- `token_usage`: mesure brute renvoyée par le fournisseur, modèle, fournisseur, tokens entrée/sortie/cache, statut de mesure (`reported`, `estimated`, `unknown`), version de tarif et crédits calculés.
- `payment_events`: identifiant d'événement fournisseur unique, signature vérifiée, type, état de traitement et référence à l'attribution.

Contraintes indispensables :
- unicité de `credit_wallets.user_id` ;
- unicité de `credit_ledger.idempotency_key` dans son périmètre défini ;
- unicité de `credit_reservations.user_id + operation_key` ;
- unicité de `payment_events.provider + provider_event_id` ;
- clés étrangères et contraintes empêchant les montants négatifs ;
- interdiction de UPDATE/DELETE du ledger pour les rôles applicatifs ordinaires.

## 3. Opérations serveur transactionnelles

Les opérations doivent être exposées par des fonctions serveur/RPC protégées, jamais par une écriture directe depuis le client.

### A. Attribuer un lot

Entrée : utilisateur, origine, compartiment, quantité, référence métier, clé idempotente.

Dans une transaction :
1. Valider l'appelant et l'autorisation d'attribution.
2. Verrouiller le portefeuille utilisateur.
3. Vérifier la clé idempotente.
4. Créer le lot.
5. Incrémenter le solde disponible correspondant.
6. Écrire l'événement `grant` au ledger avec le solde après opération.
7. Commit.

L'attribution mensuelle utilise une clé stable dérivée de l'abonnement et de la période facturée. Un renouvellement webhook rejoué ne doit donc jamais créer un second lot.

### B. Réserver pour une mission

Entrée : utilisateur authentifié, identifiant de mission, plafond de crédits, clé idempotente.

Dans une transaction :
1. Verrouiller le portefeuille.
2. Retourner la réservation existante si la clé a déjà été traitée avec le même contenu.
3. Vérifier le total disponible.
4. Réserver d'abord le compartiment abonnement, puis le compartiment acheté.
5. Déplacer les montants disponibles vers les montants réservés sans encore les considérer comme consommés.
6. Créer la réservation et deux événements de ledger si les deux compartiments sont utilisés.
7. Commit.

Si le solde est insuffisant, rejeter toute l'opération sans mutation partielle. Le serveur retourne uniquement le montant disponible et le montant requis, sans autoriser le client à imposer un nouveau solde.

### C. Régler la consommation réelle

Entrée : réservation, coût final calculé côté serveur, détail d'usage et version de tarif.

Dans une transaction :
1. Verrouiller la réservation et le portefeuille.
2. Vérifier que la réservation est encore `reserved`. Un règlement répété retourne le résultat initial.
3. Vérifier que le coût final ne dépasse pas le plafond réservé. Si nécessaire, demander une réservation complémentaire avant de poursuivre la mission ; ne jamais créer un solde négatif.
4. Débiter le coût réel en respectant l'ordre des compartiments déjà réservés.
5. Libérer automatiquement le reliquat non consommé dans les bons compartiments.
6. Enregistrer la mesure d'usage et sa provenance.
7. Écrire les événements immuables `settle` et `release`, puis marquer la réservation `settled`.
8. Commit.

Le tarif appliqué est celui de la version enregistrée au démarrage de la mission. Une modification ultérieure des tarifs ne recalcule pas rétroactivement une mission terminée.

### D. Libérer une réservation

Entrée : réservation et clé idempotente.

Dans une transaction, verrouiller réservation et portefeuille, vérifier le statut, remettre intégralement les montants réservés dans leurs compartiments d'origine, écrire l'événement `release`, puis marquer la réservation `released`. Une réservation déjà réglée ou libérée ne peut pas être libérée une seconde fois.

Une tâche interrompue par timeout doit être réconciliée par un worker serveur. Ne jamais libérer automatiquement une réservation si une exécution peut encore consommer des ressources sans avoir été arrêtée ou réconciliée.

### E. Remboursement ou correction

Ne jamais modifier ou supprimer une écriture passée. Ajouter une écriture compensatoire liée à l'événement initial, avec motif, acteur autorisé et référence d'audit. Les crédits achetés déjà utilisés et les litiges de paiement nécessitent une politique publiée et une décision serveur explicite.

## 4. Webhooks de paiement

1. Recevoir le corps brut de la requête et vérifier la signature avec le secret du fournisseur côté serveur.
2. Rejeter les signatures invalides avant toute mutation.
3. Insérer l'identifiant fournisseur de l'événement dans une table avec contrainte unique.
4. Vérifier le statut final du paiement auprès du fournisseur lorsque le protocole le permet.
5. Mapper le produit et le prix sur un identifiant interne publié. Ne jamais accepter un montant ou un nombre de crédits arbitraire envoyé par le navigateur.
6. Attribuer le lot et marquer l'événement traité dans une transaction idempotente.
7. Journaliser les erreurs sans exposer secrets, données de carte ou données personnelles excessives.
8. Prévoir une tâche de réconciliation des événements en attente et des paiements confirmés non attribués.

Les cartes bancaires, CVV, PIN et identifiants bancaires ne doivent jamais être collectés dans DEBS AI Studio. Le prestataire de paiement héberge la saisie sécurisée.

## 5. Autorisations et RLS

- Un utilisateur peut lire uniquement son propre portefeuille, ses lots, ses réservations, son ledger, ses usages et ses factures.
- Un utilisateur ne peut ni créer ni modifier ses soldes, lots, réservations financières, ledger, tarifs, droits ou abonnements.
- Les fonctions privilégiées valident l'identité de l'utilisateur depuis le contexte authentifié, pas depuis un `user_id` librement fourni par le client.
- Les clés de service restent exclusivement côté serveur.
- Les rôles administrateurs sont vérifiés côté serveur et chaque ajustement est audité.
- Les vues de solde destinées au client sont en lecture seule et dérivées de données validées.

## 6. Scénarios de tests obligatoires

- Attribution d'un lot mensuel une seule fois malgré plusieurs livraisons du même webhook.
- Achat d'un pack sans abonnement actif.
- Report intégral de plusieurs périodes d'abonnement.
- Rétrogradation sans perte de crédits acquis.
- Achat de crédits sans date d'expiration.
- Dépense partagée entre abonnement et achat dans cet ordre exact.
- Deux missions simultanées tentant de dépenser le même solde : aucune ne doit provoquer un solde négatif.
- Deux requêtes concurrentes avec la même clé idempotente : une seule mutation.
- Même clé idempotente avec un contenu différent : rejet.
- Solde insuffisant : aucun changement de solde, lot ou ledger.
- Réservation puis annulation : retour exact aux compartiments d'origine.
- Règlement répété : un seul débit.
- Coût réel supérieur à la réservation : aucune dette implicite, réservation complémentaire obligatoire.
- Webhook invalide ou paiement non confirmé : aucun crédit.
- Remboursement : écriture compensatoire, historique intact.
- Tentative client d'écrire un solde ou un ledger : refus RLS/serveur.
- Vérification de cohérence : soldes disponibles + réservés = somme des lots restants, rapprochée des écritures du ledger.

## 7. Ordre de livraison recommandé

1. Faire valider le schéma et les fonctions par le gestionnaire de base de données autorisé.
2. Créer les contraintes, politiques RLS et fonctions atomiques dans le système de migrations géré.
3. Tester les fonctions directement avec des utilisateurs de test et des requêtes concurrentes.
4. Ajouter les adaptateurs TypeScript serveur qui appellent uniquement ces fonctions.
5. Connecter l'interface en lecture seule aux soldes serveur.
6. Ajouter le prestataire de paiement après vérification de l'éligibilité commerciale, des frais, des remboursements et des webhooks.
7. Activer les paiements uniquement après validation complète des scénarios de sécurité et de rapprochement.

## 8. Limites actuelles

Le code de domaine dans `src/lib/billing/credits.ts` est une logique pure en mémoire. Il ne constitue pas un portefeuille persistant, ne sécurise pas les transactions concurrentes et ne doit pas être utilisé pour autoriser un débit réel. Cette spécification ne crée ni tables, ni RPC, ni paiement, ni worker. Le portefeuille reste non opérationnel jusqu'à la livraison et à la vérification de ces composants dans l'environnement autorisé.
