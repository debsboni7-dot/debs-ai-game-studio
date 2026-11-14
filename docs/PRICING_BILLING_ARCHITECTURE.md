# DEBS AI Studio — Architecture abonnements et crédits

Statut : proposition à approuver. Aucun prix, paiement ou abonnement réel n'est activé par ce document.

## Décisions confirmées
- Public : particuliers/développeurs et entreprises/studios.
- Facturation : mensuelle et annuelle.
- Devises : XOF, EUR, USD.
- Aucun essai gratuit.
- Report intégral des crédits mensuels non utilisés.
- Modèles IA différenciés selon le forfait.
- Achat de crédits séparément d'un abonnement, avec ou sans abonnement.
- Identités : DEBS AI Studio (plateforme), DEBS AI (assistant).

## Catalogue proposé

Prix de référence provisoires en XOF. Les tarifs EUR/USD doivent être définis explicitement, et non calculés au moment du paiement par conversion FX. L'annuel correspond à 10 mensualités, soit environ 16,67 % de réduction. Les crédits annuels sont attribués chaque mois, pas en une seule fois.

| Forfait | Mensuel XOF | Annuel XOF | Crédits DEBS/mois | Durée max mission |
|---|---:|---:|---:|---:|
| Découverte | 0 | 0 | 100 000 | 1 h |
| Essentiel | 2 500 | 25 000 | 1 000 000 | 10 h |
| Plus | 7 500 | 75 000 | 4 000 000 | 24 h |
| Pro | 20 000 | 200 000 | 12 000 000 | 72 h |
| Studio | 50 000 | 500 000 | 35 000 000 | 168 h / 7 jours |

### Différences fonctionnelles
- Découverte : chat standard, commandes slash essentielles, espace personnel, modèles économiques.
- Essentiel : DEBS Code avec édition de fichiers, lecture GitHub et propositions de modifications, génération de code/documents, modèles standards.
- Plus : agent multi-fichiers, analyse de projet et recherche Web, plusieurs projets, modèles avancés, tests uniquement si un runtime isolé est effectivement opérationnel.
- Pro : dépôts multiples, préparation de branches et Pull Requests, priorité d'exécution, modèles premium de programmation/raisonnement, workflows Unity/Unreal/Godot lorsque les intégrations sont configurées.
- Studio : espaces d'équipe, agents spécialisés multiples, orchestration de projets complexes, priorité maximale, fenêtre de mission de 7 jours lorsque le worker durable est déployé.

Les durées sont des fenêtres maximales de mission, pas une garantie de calcul continu. Chaque mission doit utiliser checkpoints, heartbeat, pause/reprise/annulation, plafond de dépense, limites de tentatives et arrêt automatique. Ne jamais simuler un terminal, un worker ou des tests.

Les commandes slash /code, /github, /unity, /unreal, /godot, /blender et /threejs doivent afficher l'état réel de leurs outils. Une commande n'implique pas que l'application correspondante est installée ou que son connecteur est actif.

## Achat indépendant de crédits

Packs proposés, prix provisoires XOF :
| Pack | Crédits DEBS | Prix |
|---|---:|---:|
| Mini | 500 000 | 2 000 FCFA |
| Standard | 2 000 000 | 6 500 FCFA |
| Avancé | 5 000 000 | 15 000 FCFA |
| Studio | 15 000 000 | 40 000 FCFA |

Ces prix doivent être validés par un calcul de coût réel (modèles, outils, runtime, taxes, frais de paiement, remboursements et marge) avant publication. Définir séparément les prix EUR/USD. Les packs restent achetables sans abonnement.

### Comptabilité des crédits
- Appeler l'unité commerciale « crédits DEBS », jamais tokens bruts du fournisseur.
- Enregistrer séparément les tokens réels entrée/sortie fournis par le modèle.
- Convertir la consommation réelle en crédits via une grille serveur de tarifs versionnée par modèle et fournisseur.
- Distinguer crédits d'abonnement et crédits achetés.
- Consommer d'abord les crédits d'abonnement, puis les crédits achetés.
- Report intégral des crédits d'abonnement. Lors d'une rétrogradation, conserver intégralement tous les crédits déjà gagnés, sans plafond lié au nouveau forfait et sans confiscation. La rétrogradation modifie uniquement les futurs crédits mensuels et les droits associés.
- Les crédits achetés séparément n'expirent jamais, même sans abonnement actif. Ils restent dans le portefeuille acheté.
- En cas d'annulation ou d'impayé, toute restriction d'accès ou de nouveaux crédits doit être annoncée clairement ; aucun crédit acheté ne doit être supprimé et aucun solde acquis ne doit être réduit silencieusement.
- Les crédits achetés restent dans un portefeuille séparé. Toute règle d'expiration doit être affichée avant achat.
- Réserver les crédits atomiquement avant exécution, régler la consommation réelle à la fin, libérer la réservation inutilisée en cas d'échec/annulation. Idempotence obligatoire.
- Si le fournisseur ne renvoie pas les tokens, noter usage inconnu ou estimation clairement identifiée. Ne jamais inventer un nombre réel.
- Journal immuable ; aucun solde ne peut être modifié sans événement de ledger correspondant.

## Architecture données proposée (schéma géré par Lovable uniquement)

Ne pas créer ou modifier manuellement supabase/migrations ou drizzle. Lovable doit créer le schéma, les fonctions atomiques et les politiques RLS.

Tables/logiques nécessaires :
- billing_customers : user_id, provider, provider_customer_id, pays, devise préférée.
- billing_plans : clé stable, nom, actif, ordre d'affichage.
- billing_prices : plan, intervalle, devise, montant minoritaire, identifiant prix fournisseur, version, dates d'effet, statut publié.
- billing_subscriptions : utilisateur, plan, fournisseur, statut, intervalle, période payée, annulation programmée.
- credit_wallets : soldes abonnement/achat/réservation.
- credit_lots : origine, montant, restant, expiration, période ou achat source.
- credit_ledger : événements immuables, delta, solde après opération, idempotency key, origine, métadonnées.
- credit_reservations : tâche, montant réservé, statut, clé idempotente, expiration, montant réglé.
- token_usage : fournisseur, modèle, tokens entrée/sortie/cache, état de mesure, version tarifaire, crédits débités.
- topup_products : packs et prix par devise.
- payment_events : identifiant événement fournisseur unique, type, état, date de traitement.
- model_rate_cards : fournisseur/modèle, coût entrée/sortie, conversion crédits, version et dates.
- plan_entitlements : fonctionnalités, activation, limites, durée, liste de modèles.
- team_workspaces et workspace_members pour les équipes Studio.
- admin_audit_log : acteur, action, cible et métadonnées sûres.

### Sécurité et RLS
- Les utilisateurs lisent uniquement leur abonnement, portefeuille, lots, ledger, usage et factures.
- Le client ne peut jamais écrire soldes, ledger, abonnements, prix, rôles ou droits.
- Seuls les webhooks vérifiés et fonctions serveur privilégiées modifient les paiements/crédits.
- Webhooks signés, déduplication des événements et confirmation du paiement avant attribution.
- Réservation et débit atomiques en transaction/RPC pour éviter double dépense.
- Rôle admin vérifié côté serveur et journalisé.
- Aucun secret ni donnée de carte bancaire dans le navigateur ou les tables applicatives.

## Paiements et devises

Prévoir un adaptateur fournisseur indépendant du produit. Les devises XOF, EUR et USD doivent avoir des prix publiés séparément. Un montant de paiement ne doit jamais être calculé par le navigateur ou à partir d'un taux FX approximatif. Afficher devise et montant final avant checkout.

Attention : la page officielle de disponibilité Stripe classe actuellement la Côte d'Ivoire dans son « réseau étendu », pas dans la liste ordinaire des pays où Stripe ouvre directement les comptes. Il faut confirmer le parcours d'éligibilité exact pour l'entité commerciale avant de retenir Stripe. Garder un adaptateur interchangeable et évaluer les moyens locaux (Orange Money, MTN MoMo, Moov Money, Wave) selon le prestataire réellement accessible. Aucun moyen de paiement ne doit être promis avant un test sandbox réel.

Cycle :
1. L'utilisateur choisit plan, fréquence et devise.
2. Le serveur valide le prix publié et crée une session checkout idempotente.
3. Le retour navigateur ne crédite jamais le compte.
4. Un webhook signé confirme le paiement.
5. Le serveur attribue exactement une fois abonnement ou pack.
6. Le renouvellement attribue le lot mensuel suivant.
7. Échec de paiement : état past_due, délai de grâce configurable, limitation des nouveaux travaux payants.
8. Annulation : accès jusqu'à la fin de la période payée.
9. Upgrade/downgrade : aperçu prorata et confirmation avant toute modification/facturation.
10. Remboursement/chargeback : événement compensatoire au ledger et politique de crédits publiée.

## Interface
- /abonnement : comparaison, mensuel/annuel, choix de devise, plan actuel, droits, upgrade/downgrade.
- /credits : deux soldes distincts, packs, historique, consommation par modèle.
- /facturation : factures, état des paiements, moyen de paiement, annulation.
- /admin/billing : gestion protégée des forfaits, prix, taux de crédits, modèles, droits et journal d'audit.
- Avant chaque mission : plafond de durée, estimation de crédits, avertissement de consommation.
- Mobile-first, français par défaut.

## Conditions avant mise en production
1. Schéma Lovable et RLS vérifiés.
2. Éligibilité fournisseur et moyens de paiement locaux confirmés.
3. Tests checkout sandbox, webhook signé, renouvellement, annulation, remboursement et doublons.
4. Tests d'atomicité, réservation, ledger et idempotence.
5. Mesure de consommation vérifiée pour chaque modèle autorisé.
6. Prix et marges validés.
7. Conditions, confidentialité, remboursement, taxes et renouvellement publiés.
8. Administration et audit testés.

Jusqu'à satisfaction de ces conditions, afficher les forfaits en aperçu et désactiver tout paiement réel.