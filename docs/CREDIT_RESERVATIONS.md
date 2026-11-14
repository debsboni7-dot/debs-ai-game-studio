# DEBS AI Studio — réservations de crédits

Statut : règles métier pures et tests ajoutés ; aucune réservation persistante ou débit en production.

## Cycle de vie

`src/lib/billing/reservations.ts` complète les règles de solde de `credits.ts` :

1. `reserveCredits` immobilise d'abord les crédits d'abonnement, puis les crédits achetés.
2. `settleCreditReservation` consomme le coût réel dans cet ordre et restitue le reliquat dans ses compartiments d'origine.
3. `releaseCreditReservation` restitue l'intégralité d'une réservation interrompue ou annulée.

Une réservation ne peut être réglée ou libérée qu'une seule fois dans ce modèle d'état. Un coût réel supérieur au plafond réservé est rejeté. Les fonctions ne mutent pas leurs entrées.

## Limite de sécurité

Ces fonctions sont déterministes et testables, mais elles ne garantissent ni persistance, ni idempotence entre requêtes, ni sérialisation concurrente, ni autorisation. Deux processus indépendants ne doivent jamais utiliser leurs résultats en mémoire comme soldes de référence.

Avant toute activation, les transitions doivent être exécutées dans une transaction serveur verrouillant le portefeuille et la réservation, avec une clé idempotente persistée, un ledger append-only, une authentification fiable, des contrôles RLS et une stratégie de réconciliation des missions abandonnées. Respecter `docs/SECURE_CREDIT_LEDGER_SPEC.md`.
