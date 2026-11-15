# DEBS AI Studio: architecture abonnements et crédits

Statut : architecture produit et technique en cours d'implémentation. Aucun abonnement, prix final ou paiement réel n'est activé.

## Décisions produit

- Public : particuliers/développeurs et entreprises/studios.
- Facturation : mensuelle et annuelle.
- Devises prises en charge : XOF, EUR et USD, avec des prix explicites par devise. Aucune conversion FX dynamique au checkout.
- Aucun essai gratuit.
- Les crédits mensuels non utilisés sont reportés intégralement.
- Une rétrogradation ne supprime ni ne plafonne les crédits déjà acquis.
- Les modèles IA sont différenciés selon le forfait.
- **Aucun achat de crédits séparés ni pack de recharge n'est proposé.**
- Deux compartiments existent : crédits d'abonnement et crédits de compensation/avoir accordés par DEBS AI Studio.
- Identités : DEBS AI Studio (plateforme), DEBS AI (assistant).

## Catalogue proposé

Les prix XOF ci-dessous sont des propositions non finalisées. Les tarifs EUR/USD doivent être définis explicitement avant publication. L'annuel correspond à dix mensualités. Pour les abonnements annuels, les crédits sont attribués chaque mois, pas en une seule fois.

| Forfait | Mensuel XOF proposé | Annuel XOF proposé | Crédits DEBS/mois | Durée max mission |
|---|---:|---:|---:|---:|
| Découverte | 0 | 0 | 100 000 | 1 h |
| Essentiel | 2 500 | 25 000 | 1 000 000 | 10 h |
| Plus | 7 500 | 75 000 | 4 000 000 | 24 h |
| Pro | 20 000 | 200 000 | 12 000 000 | 72 h |
| Studio | 50 000 | 500 000 | 35 000 000 | 168 h / 7 jours |

Ces montants restent des propositions dans l'interface. Aucune ligne de prix n'a été insérée dans la base. Ils doivent être validés avec les coûts réels des modèles/outils, les taxes, les frais de paiement et la marge avant publication.

### Différences fonctionnelles proposées

- Découverte : chat standard, commandes slash essentielles, espace personnel, modèles économiques.
- Essentiel : DEBS Code avec édition de fichiers, lecture GitHub et propositions de modifications, génération de code/documents, modèles standards.
- Plus : agent multi-fichiers, analyse de projet et recherche Web, plusieurs projets, modèles avancés, tests uniquement si un runtime isolé est opérationnel.
- Pro : dépôts multiples, préparation de branches et Pull Requests, priorité d'exécution, modèles premium, workflows Unity/Unreal/Godot lorsque les intégrations sont configurées.
- Studio : espaces d'équipe, agents spécialisés multiples, orchestration de projets complexes, priorité maximale, fenêtre de mission de sept jours lorsque le worker durable est déployé.

Les durées sont des fenêtres maximales de mission, pas une garantie de calcul continu. Chaque mission doit utiliser checkpoints, heartbeat, pause/reprise/annulation, plafond de dépense, limites de tentatives et arrêt automatique. Ne jamais simuler un terminal, un worker ou des tests.

Les commandes slash /code, /github, /unity, /unreal, /godot, /blender et /threejs doivent afficher l'état réel de leurs outils. Une commande n'implique pas que l'application correspondante est installée ou que son connecteur est actif.

## Comptabilité des crédits

- Appeler l'unité commerciale « crédits DEBS », jamais tokens bruts du fournisseur.
- Enregistrer séparément les tokens réels entrée/sortie/cache fournis par le modèle.
- Convertir la consommation réelle en crédits via une grille serveur de tarifs versionnée par modèle et fournisseur.
- Distinguer crédits d'abonnement et crédits de compensation/avoir.
- Consommer d'abord les crédits d'abonnement, puis les crédits de compensation.
- Report intégral des crédits d'abonnement. Lors d'une rétrogradation, conserver intégralement tous les crédits déjà acquis, sans plafond lié au nouveau forfait.
- Les crédits de compensation/avoirs accordés par DEBS AI Studio n'expirent pas, sous réserve du droit applicable.
- Aucun pack ni achat de crédits indépendant d'un abonnement.
- En cas d'annulation ou d'impayé, annoncer clairement toute restriction d'accès ou de nouveaux crédits ; aucun solde acquis ne doit être réduit silencieusement.
- Réserver les crédits atomiquement avant exécution, régler la consommation réelle à la fin, libérer la réservation inutilisée en cas d'échec/annulation. Idempotence obligatoire.
- Si le fournisseur ne renvoie pas les tokens, noter usage inconnu ou estimation clairement identifiée. Ne jamais inventer un nombre réel.
- Journal immuable ; aucun solde ne peut être modifié sans événement de ledger correspondant.

Note technique : le champ historique `purchased_balance` de la base est réservé exclusivement aux crédits de compensation/avoir. Il ne représente pas un produit achetable et ne doit pas être affiché comme tel.

## Architecture de données actuellement créée

Les migrations exécutables sont dans `supabase/migrations/`. Elles ont été appliquées uniquement au projet Supabase de développement `debs-ai-billing-dev`.

Tables principales :
- `debs_wallets` : un portefeuille par utilisateur et deux soldes distincts.
- `debs_credit_lots` : origine, montant initial et restant par lot.
- `debs_credit_ledger` : journal append-only des attributions, consommations et compensations.
- `debs_credit_reservations` et `debs_credit_reservation_lots` : réservation par mission et allocation par lot.
- `debs_ai_usage_records` et `debs_ai_rate_cards` : mesure d'usage et versions tarifaires.
- `debs_payment_events` : événements fournisseur dédupliqués, accès serveur uniquement.
- `debs_subscriptions` : état fournisseur, période payée et annulation.
- `debs_invoices` : montants, taxes, statuts et références de facture.
- `debs_plan_prices` : tarifs explicites XOF/EUR/USD, mensuels/annuels.

Aucune table de packs ou de commandes de recharge n'est conservée. Aucun prix ou tarif modèle n'a été préchargé. Les fonctions transactionnelles serveur disponibles sont `grant_subscription_credits`, `grant_compensation_credits`, `reserve_credits`, `settle_credit_reservation` et `release_credit_reservation`.

## Sécurité et RLS

- Les utilisateurs lisent uniquement leur portefeuille, leurs lots, leur ledger, leurs usages, leurs abonnements et leurs factures.
- Le client ne peut jamais écrire soldes, ledger, réservations, abonnements, factures, prix ou droits.
- Les RPC de modification sont réservées à `service_role`.
- Webhooks signés, déduplication des événements et confirmation du paiement avant toute attribution.
- Réservation et débit atomiques en transaction/RPC pour éviter la double dépense.
- Rôle admin vérifié côté serveur et journalisé.
- Aucun secret ni donnée de carte bancaire dans le navigateur ou les tables applicatives.

## Paiements et devises

Prévoir un adaptateur fournisseur indépendant du produit. Les devises XOF, EUR et USD doivent avoir des prix publiés séparément. Un montant de paiement ne doit jamais être calculé par le navigateur ou à partir d'un taux FX approximatif.

L'éligibilité d'un compte marchand depuis la Côte d'Ivoire, les frais, les moyens locaux disponibles et les obligations fiscales/juridiques restent à confirmer. Aucun prestataire n'est retenu tant que le parcours d'inscription et un test sandbox réel ne sont pas validés.

Cycle d'abonnement :
1. L'utilisateur choisit un plan, une fréquence et une devise.
2. Le serveur valide le prix publié et crée une session checkout idempotente.
3. Le retour navigateur ne confirme jamais le paiement.
4. Un webhook signé confirme le paiement.
5. Le serveur active exactement une période d'abonnement et attribue le lot mensuel prévu.
6. Le renouvellement attribue le lot mensuel suivant.
7. Échec de paiement : état `past_due`, notification et délai de grâce configurable.
8. Annulation : accès jusqu'à la fin de la période payée.
9. Upgrade/downgrade : aperçu du prorata et confirmation avant toute modification/facturation.
10. Remboursement/chargeback : événement compensatoire au ledger et application de la politique publiée.

## Interface

- `/abonnement` : comparaison, mensuel/annuel, plan actuel, droits, upgrade/downgrade.
- `/credits` : soldes abonnement et compensation, règles de report et d'utilisation. Aucun pack.
- `/facturation` : factures, état des paiements, moyen de paiement et annulation.
- `/admin/billing` : gestion protégée des forfaits, prix, tarifs modèles, droits et journal d'audit.
- Avant chaque mission : plafond de durée, estimation de crédits, avertissement de consommation.
- Mobile-first, français par défaut.

## Conditions avant mise en production

1. Authentification serveur fiable sur les requêtes de chat et décision explicite sur le mode invité.
2. RLS/JWT, concurrence, idempotence et rapprochement comptable testés.
3. Adaptateur fournisseur, webhooks signés et tests sandbox réels.
4. Éligibilité du compte marchand et moyens de paiement depuis la Côte d'Ivoire confirmés.
5. Mesure de consommation vérifiée pour chaque modèle autorisé.
6. Prix et marges validés.
7. Conditions, confidentialité, remboursements, taxes et renouvellement publiés.
8. Factures, support, fraude, chargeback et audit testés.

Jusqu'à satisfaction de ces conditions, afficher les forfaits en aperçu et désactiver tout paiement réel.
