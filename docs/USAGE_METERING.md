# DEBS AI Studio — mesure de consommation IA

Statut : moteur de calcul pur ajouté ; aucune facturation ni aucun débit n'est activé.

## Contrat

`src/lib/billing/usage-metering.ts` transforme les compteurs de tokens réellement rapportés par un fournisseur en crédits DEBS. Chaque grille tarifaire porte un fournisseur, un identifiant de modèle, une version et une fenêtre d'effet. Les compteurs d'entrée, de sortie et d'entrée mise en cache sont séparés ; les tokens mis en cache sont un sous-ensemble des tokens d'entrée.

Le calcul utilise des entiers et `BigInt`, puis arrondit une seule fois le total vers le haut. Les nombres flottants, compteurs négatifs, grilles ambiguës et résultats dépassant la précision entière sûre sont rejetés. Une consommation n'est tarifable que si une grille unique est active à l'instant de la mission.

## Sécurité et limites

- La grille tarifaire et son horodatage doivent être sélectionnés côté serveur à partir d'une configuration publiée et auditée.
- Les compteurs doivent provenir de la réponse authentique du fournisseur. Le navigateur ne doit jamais choisir le modèle facturé, les compteurs, la version de grille ou le montant de crédits.
- Un résultat `UsageCharge` est une donnée de calcul, pas une écriture comptable. Il ne débite aucun portefeuille.
- Les coûts monétaires des fournisseurs, frais, marges et prix clients ne sont pas déduits automatiquement. Aucun taux de conversion de production n'est inventé dans ce module.
- Si un fournisseur ne rapporte pas les compteurs nécessaires, l'appelant doit enregistrer la mesure comme inconnue/estimée dans le système de persistance futur et ne pas présenter une estimation comme une mesure réelle.

## À faire avant tout débit réel

1. Définir et faire approuver des grilles versionnées, par modèle et fournisseur, avec analyse des coûts réels.
2. Connecter le résultat à une réservation et un règlement transactionnels côté serveur.
3. Persister les compteurs bruts, l'état de mesure, la version de grille et le résultat dans un journal immuable.
4. Ajouter les contrôles d'authentification, autorisation, idempotence, concurrence, rapprochement et audit.
5. Valider chaque fournisseur en environnement de test et vérifier les compteurs rapportés.

Les tests unitaires couvrent le calcul, le changement de version, l'absence/ambiguïté de grille, les entrées invalides et les limites numériques.
