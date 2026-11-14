# DEBS AI Studio — Politique de paiement, annulation et remboursement

Statut : politique produit approuvée par le propriétaire du projet pour intégration. Les dispositions restent soumises à validation juridique avant publication et activation des paiements. Ce document ne remplace pas les règles impératives applicables dans les pays servis.

**Disponibilité commerciale actuelle :** aucun pack ni achat de crédits séparés n'est proposé. Les sections ci-dessous relatives aux packs décrivent uniquement le traitement de référence si un tel produit était explicitement réintroduit et approuvé ultérieurement. Elles ne constituent pas une offre disponible. Le second compartiment de crédits sert uniquement aux compensations/avoirs accordés par DEBS AI Studio.

## 1. Principes

- Le prix, la devise, la périodicité, le renouvellement et les crédits accordés sont présentés avant toute confirmation.
- Aucun paiement ne peut être déclenché sans action explicite de l'utilisateur.
- Aucun numéro de carte, CVV, PIN ou identifiant bancaire ne doit être stocké par DEBS AI Studio. La saisie sensible est hébergée par le prestataire de paiement.
- Une redirection de retour au site n'est pas une preuve de paiement. Seul un événement serveur authentifié et vérifié peut confirmer une transaction.
- Chaque paiement, remboursement, renouvellement, annulation et attribution de crédits est traçable et idempotent.
- Les prix XOF, EUR et USD sont des tarifs publiés séparément. Le montant affiché au checkout doit correspondre exactement au montant autorisé.

## 2. Achat d'un abonnement

Avant le paiement, afficher le forfait, les fonctionnalités, le montant total, la devise, la périodicité, la date du prochain renouvellement, la règle de crédits mensuels/report intégral, les conditions d'annulation et de remboursement ainsi que les taxes éventuelles.

Après confirmation par webhook :
1. enregistrer le paiement fournisseur ;
2. activer la période d'abonnement correspondante ;
3. attribuer une seule fois le lot mensuel prévu ;
4. conserver l'identifiant du paiement, la période et la version du tarif.

Un abonnement annuel est payé selon le prix annuel annoncé, mais ses crédits sont attribués mensuellement. Les crédits non consommés sont reportés intégralement. Le paiement annuel ne doit pas entraîner l'attribution immédiate de douze mensualités de crédits.

## 3. Renouvellement et échec de paiement

- Le renouvellement automatique doit être annoncé clairement et accepté lors de la souscription.
- Envoyer une notification avant le renouvellement lorsque le fournisseur et les règles applicables le permettent.
- En cas d'échec : marquer l'abonnement `past_due`, notifier l'utilisateur et appliquer un délai de grâce configurable et annoncé.
- Pendant le délai de grâce, ne pas créer de nouveau droit payant non financé.
- Après le délai de grâce, suspendre les nouveaux travaux réservant des crédits d'abonnement, mais préserver l'historique et les crédits de compensation/avoirs déjà accordés.
- Un nouvel essai de paiement ne doit pas créer plusieurs abonnements ni attribuer plusieurs fois le même lot.

## 4. Annulation

- L'utilisateur peut désactiver le renouvellement depuis son compte sans devoir contacter le support.
- L'annulation prend effet à la fin de la période déjà payée, sauf droit légal ou remboursement anticipé applicable.
- Aucun nouveau prélèvement ne doit être initié après la date effective d'annulation.
- L'utilisateur conserve l'accès aux droits payés jusqu'à cette date, sous réserve des règles de sécurité et d'utilisation acceptable.
- Les crédits d'abonnement déjà acquis et non utilisés restent reportés intégralement ; une annulation ne les remet pas automatiquement à zéro.
- Les crédits de compensation/avoirs accordés restent dans leur compartiment et n'expirent pas, sous réserve du droit applicable.
- L'annulation n'est pas un remboursement automatique de la période déjà payée.

## 5. Remboursements : politique approuvée

La politique commerciale ci-dessous a été approuvée par le propriétaire du projet. Elle reste subordonnée aux droits impératifs du pays du consommateur, aux règles du moyen de paiement et aux obligations fiscales. Si la loi impose un traitement plus favorable au client, la règle légale prévaut.

| Situation | Traitement retenu |
|---|---|
| Paiement en double confirmé | Remboursement intégral du doublon. |
| Paiement capturé mais abonnement non livré à cause d'une erreur DEBS | Corriger la livraison ou rembourser intégralement si elle ne peut pas être corrigée rapidement. |
| Paiement non autorisé ou fraude confirmée | Bloquer les opérations à risque, coopérer avec le prestataire et traiter le remboursement selon son enquête et le droit applicable. |
| Produit numérique séparé acheté ultérieurement, aucun crédit du lot consommé | Si un tel produit est explicitement réintroduit et approuvé, pas de remboursement en argent par défaut : conversion en avoir ou crédits DEBS. Les droits légaux restent applicables. |
| Produit numérique séparé partiellement consommé | Si un tel produit est explicitement réintroduit et approuvé, calculer le reliquat non consommé ; avoir ou crédits par défaut. Un remboursement en argent n'est possible que si la loi l'impose ou si DEBS l'autorise explicitement. |
| Produit numérique séparé entièrement consommé | Pas de remboursement commercial automatique, sans préjudice des droits légaux ou d'une erreur imputable à DEBS. |
| Abonnement annulé | Arrêt des renouvellements futurs ; pas de remboursement automatique de la période déjà utilisée. |
| Interruption majeure imputable à DEBS | Le client choisit entre des crédits/avoirs compensatoires et un remboursement proportionnel, sous réserve des modalités publiées et du droit applicable. |
| Remboursement exigé par la loi ou le prestataire | Appliquer la règle impérative, même si elle est plus favorable au client que la politique commerciale. |

Règles complémentaires :
- Pour un produit numérique séparé explicitement autorisé à l'avenir, la conversion en avoir ou crédits DEBS reste le traitement commercial par défaut pour la partie non consommée, sous réserve du droit applicable.
- Les avoirs ou crédits de remplacement doivent être clairement identifiés, liés à l'opération initiale et non expirants, sauf obligation légale contraire.
- En cas de panne majeure, le client choisit entre le crédit/avoir et le remboursement proportionnel. La méthode de calcul doit tenir compte de la durée et de l'impact de l'interruption, selon une formule publiée.
- Le délai exact de réclamation, les exceptions et la méthode de calcul doivent être fixés après examen juridique dans les pays ciblés. Ne pas inventer un délai uniforme.
- Les frais du prestataire ne doivent pas être déduits automatiquement d'un remboursement consommateur sans base légale et information préalable.
- Un crédit déjà consommé ne doit pas être effacé silencieusement pour simuler un remboursement.
- Tout remboursement ou avoir doit référencer le paiement initial et créer les écritures compensatoires nécessaires au ledger.
- Les crédits de compensation/avoirs sont ajoutés par une écriture compensatoire auditée. Ne jamais modifier les anciennes écritures.
- Si un remboursement concerne un abonnement, recalculer les droits de période et les crédits attribués selon la décision validée, sans toucher aux crédits de compensation indépendants.

## 6. Chargebacks et litiges

- Enregistrer l'événement de litige du prestataire et l'identifier de façon unique.
- Préserver les preuves utiles : confirmation de commande, tarif affiché, acceptation, identifiant de transaction, événements de livraison et historique de support.
- Ne jamais enregistrer de données de carte sensibles dans les preuves.
- Geler temporairement les nouvelles opérations liées à une transaction suspecte si nécessaire, avec une procédure de réexamen humain.
- Ne pas confisquer tous les crédits d'un utilisateur par simple automatisme à la réception d'un litige.
- Si le chargeback est confirmé, appliquer une écriture compensatoire liée à la transaction concernée et recalculer les droits affectés de façon traçable.
- Si le litige est gagné, restaurer les droits légitimes sans double attribution.

## 7. Upgrades, downgrades et changement de devise

- Avant un upgrade, afficher les droits ajoutés, le coût immédiat, le prorata éventuel et la date du prochain renouvellement.
- Avant un downgrade, afficher les droits qui changeront et leur date d'effet.
- Un downgrade ne doit jamais supprimer ni plafonner les crédits déjà acquis.
- Les crédits du nouveau forfait ne sont attribués qu'aux périodes futures correspondantes.
- Un changement de devise ne doit pas modifier rétroactivement une facture déjà payée. Il s'applique à une prochaine période ou à un nouveau checkout confirmé.
- Le prorata doit être calculé côté serveur avec une règle versionnée et être visible avant validation.

## 8. Reçus, factures et support

Chaque facture ou reçu doit présenter l'identité commerciale légalement requise, un numéro unique, la date, la devise, le détail du forfait ou service, le montant et les taxes applicables, la référence de transaction, le statut et les références des avoirs/remboursements associés.

Prévoir un canal de support accessible pour contester un débit, signaler un service non livré, demander un remboursement ou signaler une fraude. Chaque demande reçoit un identifiant et un historique de traitement.

## 9. Séquence technique obligatoire

1. Checkout créé côté serveur à partir d'un tarif publié et d'une clé idempotente.
2. Consentement explicite conservé avec version des conditions et détails de commande.
3. Paiement traité sur la page hébergée du prestataire.
4. Webhook signé et vérifié, événement dédupliqué.
5. Vérification du statut final et du montant attendu.
6. Attribution unique de l'abonnement et du lot mensuel.
7. Remboursement initié côté serveur auprès du prestataire, jamais depuis le navigateur.
8. Webhook de remboursement rapproché au paiement d'origine.
9. Écriture compensatoire append-only au ledger.
10. Notification utilisateur et reçu/avoir mis à jour.

## 10. Conditions avant ouverture au public

- pays de commercialisation et statut juridique de l'entreprise ;
- règles locales de rétractation et exceptions pour services numériques ;
- délai de réclamation commercial et règles d'émission des avoirs ;
- méthode de prorata et de calcul des interruptions ;
- délai de grâce après échec de renouvellement ;
- règles d'upgrade/downgrade et de prorata ;
- taxes, facturation et mentions obligatoires ;
- fournisseur de paiement effectivement accessible depuis la Côte d'Ivoire et les autres pays ciblés ;
- procédure de support, fraude, chargeback et rapprochement comptable.

Aucun checkout ne doit être activé tant que ces décisions opérationnelles, l'intégration fournisseur, les webhooks, les tests sandbox et la validation juridique ne sont pas terminés.
